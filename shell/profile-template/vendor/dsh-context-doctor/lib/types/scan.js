/**
 * 注入物扫描：指令链（AGENTS.md/CLAUDE.md）、技能目录、工具 schema / MCP。
 * 全部只读；文件有大小上限，路径有 skip 规则。
 */
import { dirname, join } from 'node:path';
import { estimateTokens } from "./tokens.js";
import { findDuplicateBlocks, groupMcpTools } from "./analyze.js";
/** 单文件审计上限：超过则跳过（防止审计器自身被大文件拖垮）。 */
export const MAX_FILE_BYTES = 256 * 1024;
/** 指令链文件名（DSH 注入的 workspace instruction 文件）。 */
const INSTRUCTION_NAMES = ['AGENTS.md', 'CLAUDE.md'];
async function pathExists(fs, path, signal) {
    try {
        const target = await fs.resolve(path, { signal });
        return (await fs.stat(target, signal)) !== undefined;
    }
    catch {
        return false;
    }
}
/**
 * 从 cwd 向上找到 git 根（含 .git 的最高目录）；从根到 cwd 的每一层收集
 * AGENTS.md / CLAUDE.md，与 DSH 的 workspace instruction 注入链对齐。
 */
export async function scanInstructionChain(fs, cwd, signal) {
    // 1. 找 git 根
    let root = cwd;
    let current = cwd;
    for (;;) {
        if (await pathExists(fs, join(current, '.git'), signal)) {
            root = current;
            break;
        }
        const parent = dirname(current);
        if (parent === current)
            break;
        current = parent;
    }
    // 2. 从 cwd 向上收集到 root 的层级，再反转成外层 → 内层
    const layers = [];
    current = cwd;
    for (;;) {
        layers.push(current);
        if (current === root)
            break;
        const parent = dirname(current);
        if (parent === current)
            break;
        current = parent;
    }
    layers.reverse();
    // 3. 逐层读指令文件
    const rawFiles = [];
    for (const dir of layers) {
        for (const name of INSTRUCTION_NAMES) {
            const fullPath = join(dir, name);
            let target;
            try {
                target = await fs.resolve(fullPath, { signal });
            }
            catch {
                continue; // 不存在 / 不可解析
            }
            let info;
            try {
                info = await fs.stat(target, signal);
            }
            catch {
                continue;
            }
            if (info === undefined || info.type !== 'file')
                continue;
            if (info.size !== undefined && info.size > MAX_FILE_BYTES)
                continue;
            let text;
            try {
                text = await fs.readText(target, signal);
            }
            catch {
                continue;
            }
            rawFiles.push({
                path: fs.processPath(target),
                bytes: info.size ?? Buffer.byteLength(text),
                tokens: estimateTokens(text),
                content: text,
            });
        }
    }
    const totalTokens = rawFiles.reduce((acc, f) => acc + f.tokens, 0);
    const duplicateBlocks = findDuplicateBlocks(rawFiles.map((f) => ({ path: f.path, content: f.content })));
    return {
        root,
        files: rawFiles.map(({ content: _content, ...rest }) => rest),
        totalTokens,
        duplicateBlocks,
    };
}
export async function scanSkillCatalog(skillList, signal) {
    void signal;
    const bySource = new Map();
    let total = 0;
    for (const skill of skillList) {
        const tokens = estimateTokens(skill.description);
        total += tokens;
        const cur = bySource.get(skill.source) ?? { count: 0, descriptionTokens: 0 };
        cur.count++;
        cur.descriptionTokens += tokens;
        bySource.set(skill.source, cur);
    }
    return {
        count: skillList.length,
        totalDescriptionTokens: total,
        bySource: [...bySource.entries()]
            .map(([source, v]) => ({ source, ...v }))
            .sort((a, b) => b.descriptionTokens - a.descriptionTokens),
        duplicateDescriptions: skillList.map((s) => ({ name: s.name, description: s.description }))
            .filter((s) => s.description !== '')
            .reduce((acc, s) => {
            const key = s.description.trim().toLowerCase().replace(/\s+/g, ' ');
            const hit = acc.find((h) => h.description.trim().toLowerCase().replace(/\s+/g, ' ') === key);
            if (hit !== undefined)
                hit.count++;
            else
                acc.push({ ...s, count: 1 });
            return acc;
        }, [])
            .filter((h) => h.count >= 2)
            .sort((a, b) => b.count - a.count),
    };
}
export async function scanToolSchemas(tools, agent, signal) {
    void signal;
    let schemas = [];
    try {
        schemas = tools.schemas(agent);
    }
    catch {
        try {
            schemas = tools.schemas();
        }
        catch {
            schemas = [];
        }
    }
    let schemaTokens = 0;
    let nativeCount = 0;
    let nativeTokens = 0;
    const items = [];
    const mcpDuplicates = new Map();
    for (const schema of schemas) {
        const serialised = stableJson(schema);
        const bytes = new TextEncoder().encode(serialised).byteLength;
        const tokens = estimateTokens(schema.name) + estimateTokens(schema.description ?? '');
        const server = schema.name.startsWith('mcp__') ? schema.name.split('__')[1] ?? 'unknown' : undefined;
        const schemaHash = hashSchema(schema.name.startsWith('mcp__')
            ? stableJson({ description: schema.description ?? '', parameters: schema.parameters ?? null })
            : serialised);
        items.push({ name: schema.name, bytes, tokens, schemaHash, ...(server !== undefined ? { server } : {}) });
        if (server !== undefined) {
            const duplicate = mcpDuplicates.get(schemaHash) ?? [];
            duplicate.push({ name: schema.name, server, bytes });
            mcpDuplicates.set(schemaHash, duplicate);
        }
        schemaTokens += tokens;
        if (schema.name.startsWith('mcp__'))
            continue;
        nativeCount++;
        nativeTokens += tokens;
    }
    const mcp = groupMcpTools(schemas);
    return { visibleCount: schemas.length, schemaTokens, nativeCount, nativeTokens, mcp, items, mcpDuplicates };
}
function stableJson(value) {
    if (Array.isArray(value))
        return `[${value.map(stableJson).join(',')}]`;
    if (value !== null && typeof value === 'object') {
        const record = value;
        return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}
function hashSchema(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++)
        hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * 重复 / 冲突检测的纯函数集合。不依赖任何 DSH 运行时，可独立测试。
 */
import { estimateTokens } from "./tokens.js";
/** 把文本切成"连续非空行"块（空行是分块边界）。 */
export function splitBlocks(content) {
    const lines = content.split(/\r?\n/);
    const blocks = [];
    let current = [];
    const flush = () => {
        if (current.length > 0) {
            blocks.push(current.join('\n'));
            current = [];
        }
    };
    for (const line of lines) {
        if (line.trim() === '')
            flush();
        else
            current.push(line);
    }
    flush();
    return blocks;
}
/**
 * 跨文件完全相同的段落块检测。
 * @param files - 待比较的文件列表
 * @param minLen - 小于该长度的块不参与（避免噪音）
 * @returns 按 token 数降序的重复块
 */
export function findDuplicateBlocks(files, minLen = 40) {
    const buckets = new Map();
    for (const file of files) {
        const seen = new Set();
        for (const block of splitBlocks(file.content)) {
            if (block.length < minLen || seen.has(block))
                continue;
            seen.add(block);
            const list = buckets.get(block);
            if (list !== undefined)
                list.push(file.path);
            else
                buckets.set(block, [file.path]);
        }
    }
    const out = [];
    for (const [text, paths] of buckets) {
        if (paths.length >= 2) {
            out.push({ text, tokens: estimateTokens(text), paths: [...paths].sort() });
        }
    }
    return out.sort((a, b) => b.tokens - a.tokens);
}
function normalizeDescription(s) {
    return s.trim().toLowerCase().replace(/\s+/g, ' ');
}
export function findDuplicateDescriptions(skills) {
    const byDesc = new Map();
    for (const skill of skills) {
        const key = normalizeDescription(skill.description);
        if (key === '')
            continue;
        const hit = byDesc.get(key);
        if (hit !== undefined)
            hit.count++;
        else
            byDesc.set(key, { name: skill.name, description: skill.description, count: 1 });
    }
    return [...byDesc.values()]
        .filter((hit) => hit.count >= 2)
        .sort((a, b) => b.count - a.count);
}
export function findRankShadows(skills) {
    const byName = new Map();
    for (const skill of skills) {
        const list = byName.get(skill.name);
        if (list !== undefined)
            list.push(skill);
        else
            byName.set(skill.name, [skill]);
    }
    const out = [];
    for (const [name, list] of byName) {
        if (list.length < 2)
            continue;
        const sorted = [...list].sort((a, b) => a.rank - b.rank || a.provider.localeCompare(b.provider));
        const winner = sorted[0];
        if (winner === undefined)
            continue;
        out.push({
            name,
            winner: { source: winner.source, provider: winner.provider },
            shadowed: sorted.slice(1).map((s) => ({ source: s.source, provider: s.provider })),
        });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}
export function groupMcpTools(schemas) {
    const byServer = new Map();
    for (const schema of schemas) {
        if (!schema.name.startsWith('mcp__'))
            continue;
        const parts = schema.name.split('__');
        const server = parts[1] ?? 'unknown';
        const cur = byServer.get(server) ?? { tools: 0, tokens: 0 };
        cur.tools++;
        cur.tokens += estimateTokens(schema.name) + estimateTokens(schema.description ?? '');
        byServer.set(server, cur);
    }
    const servers = [...byServer.entries()]
        .map(([server, v]) => ({ server, tools: v.tools, schemaTokens: v.tokens }))
        .sort((a, b) => b.schemaTokens - a.schemaTokens);
    return {
        servers,
        totalTools: servers.reduce((acc, s) => acc + s.tools, 0),
        totalTokens: servers.reduce((acc, s) => acc + s.schemaTokens, 0),
    };
}

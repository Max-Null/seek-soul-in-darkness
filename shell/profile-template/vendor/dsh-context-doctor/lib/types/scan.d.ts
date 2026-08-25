import type { FileSystem } from '@deepseek-ai/dsh-fs';
import type { SkillRegistry } from '@deepseek-ai/dsh-skill';
import type { ToolRuntime } from '@deepseek-ai/dsh-tools';
import { type DuplicateBlock, type McpSummary } from './analyze.ts';
/** 单文件审计上限：超过则跳过（防止审计器自身被大文件拖垮）。 */
export declare const MAX_FILE_BYTES: number;
/** 指令链审计结果。 */
export interface InstructionChainResult {
    /** git 根（含 .git 的最上层目录），找不到时回到起点目录。 */
    root: string;
    /** 链上每一层的文件。 */
    files: {
        path: string;
        bytes: number;
        tokens: number;
    }[];
    totalTokens: number;
    duplicateBlocks: DuplicateBlock[];
}
/**
 * 从 cwd 向上找到 git 根（含 .git 的最高目录）；从根到 cwd 的每一层收集
 * AGENTS.md / CLAUDE.md，与 DSH 的 workspace instruction 注入链对齐。
 */
export declare function scanInstructionChain(fs: FileSystem, cwd: string, signal: AbortSignal): Promise<InstructionChainResult>;
/** 技能目录摘要（模型每个请求都会看到 catalog：name + description）。 */
export interface SkillCatalogResult {
    count: number;
    totalDescriptionTokens: number;
    bySource: {
        source: string;
        count: number;
        descriptionTokens: number;
    }[];
    duplicateDescriptions: {
        name: string;
        description: string;
        count: number;
    }[];
}
export declare function scanSkillCatalog(skillList: Awaited<ReturnType<SkillRegistry['list']>>, signal: AbortSignal): Promise<SkillCatalogResult>;
/** 工具 schema（模型每请求都会看到的固定成本）。 */
export interface ToolSchemaResult {
    visibleCount: number;
    schemaTokens: number;
    nativeCount: number;
    nativeTokens: number;
    mcp: McpSummary;
    /** 当前 agent 可见的 schema 明细；仅开发者回执使用。 */
    items: {
        name: string;
        bytes: number;
        tokens: number;
        schemaHash: string;
        server?: string;
    }[];
    /** 以忽略 MCP 名称的签名分组，用于暴露跨 server 的重复接口。 */
    mcpDuplicates: Map<string, {
        name: string;
        server: string;
        bytes: number;
    }[]>;
}
export declare function scanToolSchemas(tools: ToolRuntime, agent: unknown, signal: AbortSignal): Promise<ToolSchemaResult>;

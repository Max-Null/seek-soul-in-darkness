/** 一份待分析的文件内容。 */
export interface FileContent {
    path: string;
    content: string;
}
/** 跨文件完全相同的段落块。 */
export interface DuplicateBlock {
    /** 重复的段落原文（连续非空行）。 */
    text: string;
    /** 该段落的估算 token 数。 */
    tokens: number;
    /** 出现该段落的所有文件路径。 */
    paths: string[];
}
/** 把文本切成"连续非空行"块（空行是分块边界）。 */
export declare function splitBlocks(content: string): string[];
/**
 * 跨文件完全相同的段落块检测。
 * @param files - 待比较的文件列表
 * @param minLen - 小于该长度的块不参与（避免噪音）
 * @returns 按 token 数降序的重复块
 */
export declare function findDuplicateBlocks(files: FileContent[], minLen?: number): DuplicateBlock[];
/** 目录里描述归一化后完全相同的技能（catalog 冗余信号）。 */
export interface DuplicateDescription {
    name: string;
    description: string;
    count: number;
}
export declare function findDuplicateDescriptions(skills: readonly {
    name: string;
    description: string;
}[]): DuplicateDescription[];
/** 同名技能多来源并存：低 rank 胜出，其余被 shadow。 */
export interface RankShadow {
    name: string;
    winner: {
        source: string;
        provider: string;
    };
    shadowed: {
        source: string;
        provider: string;
    }[];
}
export declare function findRankShadows(skills: readonly {
    name: string;
    source: string;
    provider: string;
    rank: number;
}[]): RankShadow[];
/** MCP 服务器分组汇总（从 `mcp__<server>__<tool>` 命名解析）。 */
export interface McpServerSummary {
    server: string;
    tools: number;
    schemaTokens: number;
}
export interface McpSummary {
    servers: McpServerSummary[];
    totalTools: number;
    totalTokens: number;
}
export declare function groupMcpTools(schemas: readonly {
    name: string;
    description?: string;
}[]): McpSummary;

export interface GitGraphEntry {
    hash: string;
    hashFull: string;
    parents: string[];
    subject: string;
    author: string;
    date: string;
    refs: string[];
    message: string;
}
export interface GitGraphBranch {
    ref: string;
    name: string;
    hashFull: string;
}
export interface GitGraphOptions {
    branch?: string;
    count?: number;
    cursor?: string;
}
export interface GitGraphResult {
    isRepo: boolean;
    root?: string;
    entries: GitGraphEntry[];
    branches: GitGraphBranch[];
    hasMore: boolean;
    nextCursor?: string;
    snapshot: string;
}
export interface GitHistoryOptions {
    cursor?: string;
    count?: number;
}
export interface GitHistoryResult {
    isRepo: boolean;
    root?: string;
    entries: GitGraphEntry[];
    hasMore: boolean;
    nextCursor?: string;
    snapshot: string;
}
/** 图形界面超过分支上限时读取提交列表，并校验引用、HEAD 和浅克隆边界。 */
export declare function gitHistory(cwd: string, options?: GitHistoryOptions, selectedRepo?: string): Promise<GitHistoryResult>;
/** Immutable OID traversal + before/after ref fingerprints prevents concatenating
 * pages from different histories. No server cache or repository mutation. */
export declare function gitGraph(cwd: string, options?: GitGraphOptions, selectedRepo?: string): Promise<GitGraphResult>;

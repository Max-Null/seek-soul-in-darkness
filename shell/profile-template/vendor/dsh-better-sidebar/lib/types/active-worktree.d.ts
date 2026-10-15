import type { Context } from './context-types.ts';
/**
 * The directory the sidebar should treat as the session's root.
 * @param ctx - host plugin context.
 * @param sessionId - session whose tool calls are inspected.
 * @param base - the authoritative session cwd (already resolved by the caller).
 * @returns the active linked worktree, the repository top level, or `base`.
 */
export declare function activeWorktreeRootOf(ctx: Context, sessionId: string, base: string): Promise<string>;

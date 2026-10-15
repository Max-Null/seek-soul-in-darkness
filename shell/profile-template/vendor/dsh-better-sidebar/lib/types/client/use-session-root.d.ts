import type { Context } from '../context-types.ts';
/**
 * Resolve the live workspace root for one session.
 * @param ctx - client plugin context (owns the session list feed + API).
 * @param sessionId - the session to resolve; `undefined` resolves to `undefined`.
 * @returns the host's active root, falling back to the list summary cwd.
 */
export declare function useSessionRoot(ctx: Context, sessionId: string | undefined): string | undefined;

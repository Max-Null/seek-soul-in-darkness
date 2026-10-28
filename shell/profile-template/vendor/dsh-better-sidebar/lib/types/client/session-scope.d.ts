import type { SessionScope } from './api.ts';
/**
 * A scope object keyed by CONTENT: the same object is returned across renders
 * until the session or the cwd really changes.
 *
 * @param sessionId - the conversation id, or `undefined` for a shell mounted
 *   with no conversation selected (the scope is then absent).
 * @param cwd - the session's working directory, when known.
 */
export declare function useSessionScope(sessionId: string, cwd: string | undefined): SessionScope;
export declare function useSessionScope(sessionId: string | undefined, cwd: string | undefined): SessionScope | undefined;

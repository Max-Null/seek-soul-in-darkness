/** A deliberately narrow, opt-in bridge for settled sidechat Markdown.
 * The renderer lives in the consumer; this module never searches or forges
 * main-conversation DOM and holds only currently attached row roots. */
export interface SidechatSurface {
    readonly root: HTMLElement;
    readonly source: 'dsh-better-sidebar/sidechat';
    readonly threadId: string;
    readonly eventSeq: number;
    readonly contentBlockIndex: number;
    /** Original assistant text, before Markdown link rewriting. */
    readonly text: string;
    readonly sendPrompt: (text: string) => Promise<void>;
}
export interface SidechatSurfaceAdapter {
    readonly id: string;
    /** Own only this root; return an idempotent cleanup that restores Markdown.
     * A throwing mount must roll back its own partial changes before throwing. */
    readonly mount: (surface: SidechatSurface) => (() => void);
}
/** Identity is log-owned, never guessed from a DOM position or parent session. */
export declare function isSidechatSurfaceIdentity(threadId: unknown, eventSeq: unknown, contentBlockIndex: unknown): boolean;
/** @internal Bind once while the BetterSidebar service is being constructed. */
export declare function bindSidechatSurfaces(service: object): (adapter: SidechatSurfaceAdapter) => (() => void);
/** @internal Only SideChatView attaches real, visible settled Markdown roots. */
export declare function attachSidechatSurface(service: object | undefined, surface: SidechatSurface): () => void;
/** @internal Plugin teardown, even if a React row has not unmounted yet. */
export declare function disposeSidechatSurfaces(service: object): void;

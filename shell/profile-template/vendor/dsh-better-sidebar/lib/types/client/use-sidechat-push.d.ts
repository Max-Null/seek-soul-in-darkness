/** What the view hands the hook. */
export interface SidechatPushOptions {
    /** Threads to watch; an empty list closes the socket entirely. */
    threadIds: readonly string[];
    /**
     * A watched thread whose transcript should be re-pulled.
     * @param threadId - the thread the host named, always one of `threadIds`.
     */
    onInvalidate: (threadId: string) => void;
}
/**
 * Follow the host's staleness notices for the given side-chat threads.
 * @param options - the watched ids and the invalidation callback.
 */
export declare function useSidechatPush(options: SidechatPushOptions): void;

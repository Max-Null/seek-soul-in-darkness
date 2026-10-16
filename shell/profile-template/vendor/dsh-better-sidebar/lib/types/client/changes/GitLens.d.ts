import type { Context } from '../../context-types.ts';
import type { SessionScope } from '../api.ts';
import type { SidebarDiffRef, SidebarStore } from '../state.ts';
/**
 * How many scopes' commit drafts are remembered. The lens is a kept-mounted tab
 * body, so this record lives for the page: without a bound, a session that
 * walked through many projects would pin one message per project forever.
 */
export declare const COMMIT_DRAFT_CAP = 32;
/**
 * Write one scope's draft into the record, remembering at most
 * {@link COMMIT_DRAFT_CAP} scopes. Re-writing a key moves it to the back, so
 * the draft evicted past the cap is the scope typed into longest ago — a typed
 * message for another project is never what a commit here submits (the record
 * is keyed by scope, and `commit()` reads only its own key).
 *
 * @param prev - the current record (never mutated).
 * @param key - the scope key (session + cwd).
 * @param text - the draft (`''` = cleared; the key stays, so it reads back as
 *  an empty box rather than as a missing one).
 * @returns the next record.
 */
export declare function withCommitDraft(prev: Record<string, string>, key: string, text: string): Record<string, string>;
export interface GitLensProps {
    scope: SessionScope;
    /** @deprecated The sidebar store is no longer read here (the fence guard it
     *  fed is gone); the prop stays for the caller's shape. */
    store: SidebarStore;
    onOpenFile: (path: string) => void;
    /** Preview one change in the shared bottom pane (worktree or commit ref). */
    onPreview: (ref: SidebarDiffRef) => void;
    /** The ref currently previewed (row highlight); null when the pane is closed. */
    selectedRef: SidebarDiffRef | null;
    /** Poll the inventory only while the tab is actually visible. */
    visible: boolean;
    /** Bumped by the tab header's refresh action (0 = never asked). */
    refreshTick?: number;
    /** The tab's context, for the registered file/folder icon chain (absent →
     *  the host's built-in artwork, exactly like the file tree falls back). */
    ctx?: Context;
}
export declare function GitLens(props: GitLensProps): import("react").JSX.Element;

/**
 * Insert text into the current session's composer draft through the
 * conversation service — the shared path behind the explorer's @-reference
 * button and the viewer selection popup. The service is resolved lazily
 * through `ctx.get` (the inject-free read the app's own plugins use); a
 * missing service or scope degrades to a logged no-op, never a crash.
 *
 * Structured references (file chips, selection chips, and any append onto a
 * draft that already carries chips) go through the host's span channels
 * instead of plain draft text: `setDraft` rebuilds the document from a string
 * and flattens every chip. A reference chip mints through
 * `SidebarSessionInput.insertReference` (what the native `@` picker
 * calls); plain-text insertion onto a chipped draft has no facade method and
 * emits `slash/input-insert-text` directly. Plain `setDraft` is the fallback
 * for chipless drafts only.
 *
 * Everything appends at the document end. The host composer is a Lexical
 * contenteditable and this face publishes no caret, so a mid-draft insert
 * would have to guess a position — see {@link appendOffset} for the one
 * coordinate it does derive.
 */
import type { Context, SidebarSessionOccurrence } from '../context-types.ts';
/**
 * One structured reference to insert as a chip: the compact `label` the
 * composer shows, and the `text` the model receives on send. The two are
 * deliberately different — a selection reads as `docs/a.md:12-15` on screen
 * while the model still gets the whole fenced block.
 *
 * Named `Pending*` to keep clear of the host's own `DraftReference`, which is
 * the opposite thing: a chip ALREADY in the draft, carrying its offset and
 * length.
 */
export interface PendingReference {
    label: string;
    text: string;
    /**
     * What the draft string carries for this chip (the clipboard projection).
     * Defaults to `label`; a file reference spells its `@path` here instead.
     * This is the text other draft consumers (copy, plain projections) see, so
     * it stays short — the full payload rides in `text` and is only expanded
     * on send.
     */
    clipboardText?: string;
    /**
     * Chip icon family. Omit for a reference whose `text` is not a path: the
     * host marks `'file'` chips openable, and a click would hand the raw text
     * (a fenced block, for a selection) to the file opener.
     */
    appearance?: 'file' | 'folder' | 'session';
}
/** `draft` with `text` appended behind one separating space when needed. */
export declare function appendText(draft: string, text: string): string;
/**
 * Fold one clipboard-projection offset to its detect-projection twin.
 *
 * The host maintains two coordinate systems over the same document: the
 * clipboard projection (`InputState.draft`, `occurrences`) expands every chip
 * to its whole `clipboardText`, while the detect projection — the one every
 * insert/replace event's `span` must speak — collapses each chip to a single
 * placeholder character. Deriving a span from a draft offset without folding
 * therefore overshoots by `length - 1` per chip, and the host rejects the
 * out-of-range span (`applied = false`) — the second chip insert of a session
 * would silently fail.
 *
 * An offset inside a chip's expansion snaps to that chip's trailing edge: the
 * host only ever replaces whole chips, never splits one. An offset exactly at
 * a chip's START resolves to the position BEFORE the chip — the host's own
 * `detectOffsetOfClipboardOffset` reads that case as "inside" and returns the
 * trailing edge, which would move a caret one chip too far right.
 */
export declare function foldClipboardOffset(draft: string, occurrences: readonly SidebarSessionOccurrence[], offset: number): number;
/**
 * Mint one reference chip through the host's own `insertReference` — the
 * same facade method the native `@` picker's event listener calls, so the
 * composer shows a compact chip while the model receives `reference.text`.
 * The host runs its own admission-phase and revision guards and reports
 * whether the edit applied.
 *
 * The chip's `clipboardText` is the compact `label`, not the full payload —
 * see {@link PendingReference.clipboardText}.
 *
 * Returns false when the host refused the insert (stale revision, a frozen
 * submission phase, or no chip channel at all) so the caller can fall back.
 */
export declare function insertDraftReference(ctx: Context, sessionId: string, reference: PendingReference): boolean;
/**
 * Append `text` to the session's composer draft. Returns false — and logs —
 * when the conversation service or the session scope is unavailable.
 *
 * The host composer is a Lexical contenteditable with no caret API on this
 * face, so this appends at the end; a mid-draft insert would need the caret
 * the host does not publish here.
 */
export declare function appendToDraft(ctx: Context, sessionId: string, text: string): boolean;
/**
 * Insert one reference as a chip, degrading to its plain-text form when the
 * host has no chip channel or refuses the insert. This is the ONE place the
 * fallback policy lives: the explorer's `@` button and the viewer selection
 * popup both come through here.
 */
export declare function insertReferenceOrText(ctx: Context, sessionId: string, reference: PendingReference): boolean;
/**
 * The DSH `@` spelling for one relative path, mirroring the host grammar
 * (`formatFileMention` in `@deepseek-ai/dsh-file-reference`): plain when
 * there is no whitespace, quoted when there is, and `undefined` when the
 * path contains a control character or an embedded quote the editor grammar
 * cannot represent.
 *
 * Files and folders share this one constructor so the quoting rule cannot
 * drift between them. A folder spells the trailing slash *inside* the quotes
 * (`@"my dir/"`, `@docs/`): the host's folder token matcher
 * (`FOLDER_REF_RE` in `dsh-client-ui-conversation`) only accepts a quoted
 * directory once the quote closes, and the message bubble's tokenizer
 * (`@"[^"\n]+"` in `dsh-client-ui-primitives`) only classifies a closed
 * quoted token as a folder — unquoted `@my dir/` decorates as a file chip
 * covering just `my`. The host's own picker emits the *open* form
 * (`@"my dir/`) while the user is still descending through completion; a
 * programmatic reference is a finished mention, so it closes the quote.
 */
export declare function mentionFor(relativePath: string, kind: 'file' | 'folder'): {
    mention: string;
    label: string;
} | undefined;
/**
 * A complete directory token (`@docs/`, `@"my dir/"`): the explorer inserts a
 * finished mention, so the trailing slash sits inside the closing quote.
 * Separators normalize to '/' first (the fs-tree spelling); the spelling
 * itself is {@link mentionFor}'s single job, folder kind — this helper adds no
 * quoting rule of its own.
 */
export declare function directoryMention(relativePath: string): string | undefined;
/**
 * Insert an explorer entry using WorkspaceView.path, selected by exact
 * session membership (the same lookup as the native conversation shell).
 * Read the public workspace snapshot at click time so reconnects and session
 * changes cannot leave a captured root stale. Missing/unready membership or
 * an unrepresentable path is a logged no-op; never guess from session cwd.
 */
export declare function insertWorkspaceReference(ctx: Context, sessionId: string, path: string, isDir: boolean): boolean;

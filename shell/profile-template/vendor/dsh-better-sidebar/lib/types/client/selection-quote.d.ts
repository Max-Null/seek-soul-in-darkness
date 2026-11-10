/**
 * The quote chip: "add to conversation" on a viewer selection mints a
 * reference chip into the composer draft instead of pasting the fenced text
 * block. The chip reads as `引用 a.md L12-15`, clicking it re-opens the file in
 * the sidebar editor and lands on the quoted lines (with a temporary flash),
 * and sending serializes it back to the same fenced block the pre-chip insert
 * produced — the model sees identical text, byte for byte.
 *
 * Since #1052 the selection popup already inserts a chip through the host's
 * built-in `'reference'` source, whose `ref` IS the payload (the whole fenced
 * block). That chip is inert: the host marks it openable only with an
 * `appearance`, and a click would hand the raw fence to the file opener. What
 * this module adds is the much smaller, source-owned alternative:
 *
 * - The chip's `ref` is a short opaque id ({@link QuoteRecord.id}); the
 *   selection lives in this module's store.
 * - One input-trigger source (`ctx.inputTriggers`, DSH 0.2.1+) owns that
 *   source name: `openReference` answers the click (open the file at the
 *   quoted lines), `codec.serialize` answers send-time expansion. A source
 *   with a `codec` is mandatory for insert outcomes — the host REFUSES a send
 *   whose chip has no serializer rather than silently downgrading it to the
 *   clipboard text.
 * - Records persist in `localStorage` (FIFO, {@link QUOTE_STORE_CAP}): an
 *   unsent draft's chips must stay clickable and serializable across reloads,
 *   and this module ships in BOTH the core bundle and the lazy editor chunk —
 *   two independent module instances whose in-memory maps only see their own
 *   writes, so the shared store is also how they see each other.
 *
 * Degradation: without the input-trigger service (older hosts), before the
 * source registers, or when the record cannot be persisted, {@link
 * insertQuoteChip} reports false and the caller keeps the #1052 behavior — the
 * plain built-in reference chip, or the fenced text on hosts with no chip
 * channel at all. A failed quote insert never leaves a dead chip behind: the
 * record is written BEFORE the chip is inserted, and a store write that does
 * not land (quota, private mode) rolls it back and falls back — the other
 * bundle instance resolves refs through `localStorage`, so an unpersisted
 * record would click into nothing and block the send in the codec. Only a
 * record that PERSISTED and whose source later disappears fails the send
 * loudly (the codec throws), never silently.
 */
import type { Context } from '../context-types.ts';
import { type SelectionLines } from './selection-payload.ts';
/** The input-trigger source name the quote chips route by. */
export declare const QUOTE_SOURCE = "betterSidebarQuote";
/** localStorage key for the quote record store (FIFO, see module doc). */
export declare const QUOTE_STORE_KEY = "dsh-better-sidebar:quote-refs";
/** Max persisted quote records (the oldest drops first). */
export declare const QUOTE_STORE_CAP = 200;
/** Registration retries (× {@link QUOTE_RETRY_MS}) while the host service boots. */
export declare const QUOTE_REGISTER_RETRIES = 20;
/** Delay between registration attempts (ms). */
export declare const QUOTE_RETRY_MS = 500;
/**
 * The selection a viewer hands over when the popup commits: exactly the facts
 * the fenced insert already encoded, kept structured so the chip can act on
 * them (jump to the lines, re-serialize).
 */
export interface QuoteSelection {
    path: string;
    cwd?: string;
    lines?: SelectionLines;
    text: string;
}
/**
 * One persisted chip: the facts a click-through and a send need.
 *
 * `text` is the payload the model receives, built once at insert time — NOT
 * the raw selection. The raw text is unbounded (a 200-record FIFO of whole
 * selections overflows the localStorage quota), and an unpersisted record is a
 * dead chip in the other bundle instance (see the module doc).
 */
export interface QuoteRecord {
    /** The chip's `ref` — also the store key. */
    id: string;
    /** The session the chip belongs to (clicks from other sessions refuse). */
    sessionId: string;
    /** The monotonic chip number (kept across reloads so labels do not collide). */
    n: number;
    /** The quoted file. */
    path: string;
    /** The session cwd the header path was relativized with. */
    cwd?: string;
    /** The quoted source span, when the selection mapped to lines. */
    lines?: SelectionLines;
    /** The chip's visible text (`引用 a.md L12-15`). */
    label: string;
    /** What copying the chip yields (the `path:lines` header line). */
    clipboardText: string;
    /** The fenced block (header only past the limit) `codec.serialize` returns. */
    text: string;
}
/**
 * The structural face of the host input-trigger service this module needs
 * (`ctx.inputTriggers`, see `context-types.ts`). Declared here so the mirror
 * stays next to its single consumer.
 */
export interface SidebarInputTriggerService {
    registerSource(src: SidebarQuoteSource): () => void;
}
/** The source face (structural mirror of the host's `InputTriggerSource`). */
export interface SidebarQuoteSource {
    trigger: '@';
    name: string;
    showGroupTitle?: boolean;
    candidates(session: {
        sessionId: string;
    }, req: object): Promise<readonly unknown[]>;
    onPick(pick: object): unknown;
    openReference?(session: {
        sessionId: string;
    }, reference: {
        ref: string;
        appearance?: string;
    }): boolean;
    codec?: {
        clipboardText(ref: string): string;
        serialize(ref: string, signal: AbortSignal): Promise<string>;
    };
}
/**
 * Resolve one quote record by chip `ref`. The persisted store is re-read on
 * every resolve: the record may have been written by the other bundle
 * instance, whose in-memory map this instance never sees directly.
 * @param ref - the chip's reference id.
 * @returns the record, or `undefined` when it is not (or no longer) stored.
 */
export declare function resolveQuote(ref: string): QuoteRecord | undefined;
/**
 * Register the quote-chip input-trigger source once the host service shows up,
 * retrying briefly because the plugin's apply can run before the host package
 * provides the service. Returns the disposer (idempotent). A commit that finds
 * the source unregistered re-attempts on the spot (see
 * {@link insertQuoteChip}) — the self-heal covers fiber disposals (session
 * switch, socket reconnect, HMR) that never get a re-apply.
 * @param ctx - the client context.
 * @returns the disposer.
 */
export declare function registerQuoteSource(ctx: Context): () => void;
/** Whether this module instance currently owns a registered quote source. */
export declare function quoteSourceReady(): boolean;
/**
 * The legacy direct insert for one selection — the text #1052's chip carries,
 * and what lands in the draft when chips are unavailable.
 * @param sel - the selection.
 * @returns the fenced block (or the bare header line when over the limit).
 */
export declare function quoteFallbackInsert(sel: QuoteSelection): string;
/**
 * Register the selection as a quote record and insert its chip into the
 * session's composer draft. Returns false — leaving the draft untouched —
 * when chips are unavailable, the record cannot be persisted (quota / private
 * mode), or the host refuses the insert; the caller then falls back to
 * {@link quoteFallbackInsert}.
 * @param ctx - the client context.
 * @param sessionId - the session whose composer receives the chip.
 * @param sel - the selection the viewer's popup committed.
 * @returns whether the chip landed in the draft.
 */
export declare function insertQuoteChip(ctx: Context, sessionId: string, sel: QuoteSelection): boolean;

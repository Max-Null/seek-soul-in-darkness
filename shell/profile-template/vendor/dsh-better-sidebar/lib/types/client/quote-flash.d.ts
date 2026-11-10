/**
 * The landing flash: when a navigation lands the editor on a source range
 * (a quote chip's lines), those lines wash in the theme's hover-accent color
 * and fade out, so the span reads at a glance instead of a caret somewhere.
 *
 * The mechanism is a CodeMirror StateField carrying the flash's doc range plus
 * a decorations facet rendering one line class per line; the flash clears
 * itself (the caller owns the timer). Colors come from the skin tokens — a
 * decoration class must be a literal name, so the rule lives outside the CSS
 * module and is injected once per document on the first flash.
 */
import { StateField } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
/** The injected stylesheet's element id (one per document). */
export declare const QUOTE_FLASH_STYLE_ID = "dsh-quote-flash-style";
/**
 * How long a flash stays up before the caller clears it (ms). The CSS fade is
 * slightly shorter, so the class removal never cuts a visible color change.
 */
export declare const QUOTE_FLASH_MS = 2400;
/**
 * Inject the flash stylesheet once per document (idempotent). The wash is the
 * skin's hover accent — the same token the search panel's active line uses —
 * mixed toward transparent so the text underneath stays readable; a reduced-
 * motion reader gets a static tint (the flash still clears on its timer).
 */
export declare function ensureQuoteFlashStyle(): void;
/**
 * Clamp a flash line range to the document.
 * @param docLines - the document's line count (the 1-based world).
 * @param line - the 1-based start line.
 * @param lineEnd - the 1-based end line (`undefined` = the start line alone).
 * @returns the clamped first/last line numbers, or `undefined` when the start
 *   lies outside the document (nothing to flash).
 */
export declare function clampQuoteRange(docLines: number, line: number, lineEnd: number | undefined): {
    first: number;
    last: number;
} | undefined;
/** The flash a viewer owes: a doc range, or `undefined` to clear. */
export declare const quoteFlashEffect: import("@codemirror/state").StateEffectType<{
    from: number;
    to: number;
} | undefined>;
/** The flash's live range, mapped through document edits between flashes. */
export declare const quoteFlashField: StateField<{
    from: number;
    to: number;
} | null>;
/** Renders the flash as one line decoration per line of the range. */
export declare const quoteFlashHighlight: import("@codemirror/state").Extension;
/**
 * Flash one source line range in the live view and clear it after
 * {@link QUOTE_FLASH_MS}.
 * @param view - the editor view.
 * @param line - the 1-based start line.
 * @param lineEnd - the 1-based end line (`undefined` = the start line alone).
 * @returns the clear timer, or `undefined` when the range did not fit.
 */
export declare function flashQuoteLines(view: EditorView, line: number, lineEnd: number | undefined): ReturnType<typeof setTimeout> | undefined;

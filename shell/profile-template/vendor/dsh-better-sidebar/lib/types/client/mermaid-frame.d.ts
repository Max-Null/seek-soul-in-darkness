export type MermaidTheme = 'dark' | 'default';
/** mermaid rejected this diagram (syntax/unsupported feature). Only this
 * diagram falls back to its source; the frame stays healthy. */
export declare class MermaidDiagramError extends Error {
    constructor(message: string);
}
/** The frame itself failed (load/handshake/timeout/protocol). Retry once, then
 * fail fast for the remaining diagrams on the page. */
export declare class MermaidFrameError extends Error {
    constructor(message: string, options?: {
        cause?: unknown;
    });
}
/** A validated answer from the frame. */
export type FrameMessage = {
    kind: 'result';
    id: number;
    svg: string;
} | {
    kind: 'error';
    id: number;
    message: string;
};
/** The subset of MessageEvent the protocol needs (easy to unit-test). */
export interface MessageEventLike {
    source: unknown;
    origin: string;
    data: unknown;
}
export declare function setMermaidFrameRendererForTests(renderer: ((code: string, theme: MermaidTheme) => Promise<string>) | null): void;
export declare function setMermaidFrameTransportForTests(transport: ((code: string, theme: MermaidTheme) => Promise<string>) | null): void;
/** Restore the real frame and clear the breaker (module state persists across
 * specs in one vitest file). */
export declare function resetMermaidFrameForTests(): void;
/**
 * Validate one message against the frame protocol.
 *
 * The sandboxed frame has an opaque origin (`'null'`), so the source window is
 * the primary identity check; the origin allowlist keeps a same-origin page
 * that happens to reuse the message shape from being accepted.
 * @param event - the incoming message event (or a test double of it).
 * @param expectedWindow - the frame's `contentWindow`; `null` rejects all.
 * @returns the validated message, or `null` when it must be ignored.
 */
export declare function acceptFrameMessage(event: MessageEventLike, expectedWindow: Window | null): FrameMessage | null;
/**
 * Render one mermaid diagram off the host document's layout.
 *
 * A `MermaidDiagramError` is final for that one diagram (no retry, no breaker);
 * a transport failure gets one retry with a fresh frame, then flips the
 * page-level breaker so later diagrams fail fast instead of paying a timeout
 * each.
 * @param code - the diagram source (one fenced block body).
 * @param theme - mermaid theme to render with (follows the color scheme).
 * @returns the raw SVG markup (sanitized by the caller before injection).
 */
export declare function renderMermaidDiagram(code: string, theme: MermaidTheme): Promise<string>;

/**
 * Editorial diagram geometry: the mandatory orthogonal-connector system from
 * diagram-design §6, ported to pure functions producing SVG path strings.
 *
 * Rules enforced here (the "non-negotiable" list):
 *  1. Rounded right-angle (orthogonal) elbows with r=8 — never diagonal lines
 *     between off-axis nodes.
 *  2. Edge labels sit 6–10px off the stroke behind an opaque mask.
 *  3. No two connectors share a path — parallel connectors offset ≥12px.
 *  4. Shared-edge attach points fan ≥12px apart.
 *  5. A connector never passes behind a non-endpoint box (dashed-transit
 *     exception only when geometrically unavoidable).
 *  6. Label masks never overlap nodes (nodes paint after labels).
 * @module @changfenhuang/dsh-genui/client/blocks/diagram/geometry
 */
/** Axis-aligned box. */
export interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
}
export interface Point {
    x: number;
    y: number;
}
export type Port = 'left' | 'right' | 'top' | 'bottom';
/** Attachment on a box edge. */
export interface Attach {
    x: number;
    y: number;
    port: Port;
}
/** Center of a box. */
export declare function center(b: Box): Point;
/**
 * Pick the attach point on `from` toward `to`. Port choice follows the
 * dominant axis: mostly-horizontal travel uses left/right ports, mostly-
 * vertical uses top/bottom. An explicit `prefer` overrides the heuristic.
 */
export declare function attachPoint(box: Box, toward: Box, prefer: Port | undefined): Attach;
/**
 * Build an orthogonal path between two attach points. Same-axis endpoints use
 * a straight segment (the one sanctioned case); every bend is a quarter arc
 * of radius R.
 */
export declare function orthogonalPath(a: Attach, b: Attach): string;
/**
 * Route a connector between two boxes with default port selection, returning
 * the path plus both attach points (for label placement and fan offsets).
 */
export declare function routeEdge(from: Box, to: Box, opts?: {
    fromPort?: Port;
    toPort?: Port;
}): {
    d: string;
    a: Attach;
    b: Attach;
};
/** Fan an attach point along a box edge (≥12px apart via the (k+1)/(n+1) rule). */
export declare function fanPoint(box: Box, edge: 'top' | 'bottom' | 'left' | 'right', index: number, count: number): Attach;
/**
 * Edge-label geometry: centered on the dominant segment, offset 6–10px from
 * the stroke so the connector stays visible.
 */
export declare function labelGeometry(a: Attach, b: Attach): {
    cx: number;
    cy: number;
    maskY: number;
    vertical: boolean;
};
/** Hop / bridge arc for a crossing connector (applied to the less important edge). */
export declare function bridgePath(cx: number, cy: number, horizontal: boolean): string;

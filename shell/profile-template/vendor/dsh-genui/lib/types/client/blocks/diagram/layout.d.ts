/**
 * Editorial diagram layout: resolves a `diagram` spec into positioned boxes
 * and routed edges. Two layout modes mirror diagram-design's grammar:
 *
 *  - Coordinate kinds (architecture, it-state, high-level, process,
 *    medallion, data-flow, dp-integration): the spec carries x/y/w/h per
 *    node; this module passes them through (4px-grid already enforced by the
 *    guard) and routes edges.
 *  - Rule kinds (flowchart, sequence, state, er, timeline, swimlane,
 *    quadrant, radar, loop, nested, tree, org-chart, layers, venn, pyramid,
 *    bar, line, gantt, scatter, dp-security-matrix): the spec carries data
 *    only; this module lays the nodes out on the editorial grid.
 *
 * The output is a plain layout object consumed by the SVG renderer — no
 * React, no DOM, fully unit-testable.
 * @module @changfenhuang/dsh-genui/client/blocks/diagram/layout
 */
import type { GenuiDiagram, GenuiDiagramEdge, GenuiDiagramNode } from '../../spec.ts';
import { Box } from './geometry.ts';
export interface LayoutNode {
    node: GenuiDiagramNode;
    box: Box;
}
export interface LayoutEdge {
    edge: GenuiDiagramEdge;
    /** Resolved box references for routing. */
    fromId: string;
    toId: string;
}
export interface DiagramLayout {
    nodes: LayoutNode[];
    edges: LayoutEdge[];
    /** Canvas size (width/height). */
    width: number;
    height: number;
}
/**
 * Resolve a diagram spec into a positioned layout. `parentOf` lets tree-like
 * kinds pass their hierarchy; other rule kinds use a generic grid.
 */
export declare function resolveLayout(diagram: GenuiDiagram, parentOf?: (id: string) => string | undefined): DiagramLayout;

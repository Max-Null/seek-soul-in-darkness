import type { GenuiChart, GenuiTable } from '../spec.ts';
export declare const CHART_COLORS: string[];
/**
 * Sortable numeric value of a cell. Human-written table cells are rarely
 * plain numbers, so the sort accepts the usual decorations:
 * `1,234` / `1，234`（千分位）、`1.2k`/`3M`/`5b`、`3.5万`/`2亿`、`0.3%`、
 * `¥99`/`$12`。A cell that cannot be read as a number returns NaN and the
 * row falls back to the text comparison — mixed columns sort deterministically
 * (numbers first, then text).
 */
export declare function parseSortableNumber(v: unknown): number;
export declare const TableNode: import("react").NamedExoticComponent<{
    node: GenuiTable;
}>;
/** Chart: bars (default), line (trend), or donut (share); multi-series bars via `series`.
 *  memoized: the spec node is a stable reference, so a keystroke in a sibling
 *  field no longer re-renders the whole chart. */
export declare const ChartNode: import("react").NamedExoticComponent<{
    chart: GenuiChart;
}>;
/** Bars: one column per datum (grouped bars when `series` is present). */
export declare const BarsNode: import("react").NamedExoticComponent<{
    chart: GenuiChart;
}>;
/** Line: polyline over a fixed-height plot area with a readable Y axis —
 * four evenly spaced gridlines + tick labels (design system v2 skeleton). */
export declare const LineChartNode: import("react").NamedExoticComponent<{
    chart: GenuiChart;
}>;
/** Donut: share of total with a center total. Negative values contribute
 * zero arc (a negative dasharray segment used to produce an invalid
 * stroke-dasharray and the browser drew the FULL circle instead). */
export declare const DonutNode: import("react").NamedExoticComponent<{
    chart: GenuiChart;
}>;
/** Tab strip with local active-tab state. Keyboard: ArrowLeft/Right to move,
 * Home/End to jump; ids wired via useId so `aria-controls` stays unique
 * across fences and sessions. */

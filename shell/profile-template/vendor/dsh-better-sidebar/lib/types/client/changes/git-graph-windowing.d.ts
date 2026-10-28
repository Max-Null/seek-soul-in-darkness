/**
 * The visible slice of a fixed-height row list (the commit graph's history).
 *
 * `page.entries` grows by one infinite-scroll page at a time (50 rows; the
 * host caps the walk at 10000) and every row carries an SVG rail, so mounting
 * the whole history made each append and each scroll cost O(history). Only
 * the viewport window (± overscan) is mounted; the two spacer heights keep the
 * real scrollbar, the end sentinel's position and the `data-graph-count` page
 * size intact.
 *
 * The arithmetic is pure and clamped on purpose: the list can shrink under the
 * scroll position (a branch switch, a refresh collapses the page), and the
 * browser only clamps `scrollTop` afterwards — a stale `scrollTop` must never
 * translate into an out-of-range window (that would render the wrong rows
 * while the scrollbar sits at the top).
 */
export interface WindowedRange {
    /** First mounted row (inclusive). */
    start: number;
    /** One past the last mounted row. */
    end: number;
    /** Pixel height of the rows above the window. */
    top: number;
    /** Pixel height of the rows below the window. */
    bottom: number;
}
export interface WindowedRangeOptions {
    /** Total number of rows in the list. */
    count: number;
    /** Height of one row in pixels (the graph's rows are a fixed 28). */
    rowHeight: number;
    /** The scroll container's current `scrollTop`. */
    scrollTop: number;
    /** The scroll container's client height; 0 before it is measured. */
    viewportHeight: number;
    /** Extra rows kept mounted above and below the viewport (default 8). */
    overscan?: number;
}
/**
 * Compute the mounted row range for one scroll position.
 * @param options - row count/height, scroll position, viewport height and overscan.
 * @returns The clamped half-open range plus the two spacer heights.
 */
export declare function windowedRange(options: WindowedRangeOptions): WindowedRange;

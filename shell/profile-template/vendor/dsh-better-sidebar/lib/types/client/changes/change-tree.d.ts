/**
 * The changes list's hierarchy.
 *
 * A `git status` answer is a flat list of repo-relative paths, and the Git
 * lens used to render exactly that: one row per file, with the file name and
 * its directory squeezed onto the same line. Nested work (a refactor touching
 * `src/client/changes/*`) then read as a wall of near-identical rows. This
 * module folds the list into the directory tree the lens renders — VS Code's
 * SCM tree, including its single-child directory compression — so the shape
 * of the change is legible at a glance.
 *
 * Pure — no React, no DOM. `buildChangeTree` runs once per group per fold;
 * the renderer only walks the result.
 */
import type { GitLineCounts, GitStatusEntry } from '../api.ts';
import { type GitFileStatus } from '../ui/index.ts';
/** One changed file (a leaf), carrying its porcelain status. */
export interface ChangeFile {
    kind: 'file';
    /** The file's own name (the last path segment). */
    name: string;
    /** The repo-relative path exactly as git reported it (the row's identity). */
    path: string;
    status: GitFileStatus;
    /** The path's line counts from the SAME status answer (#131). Absent when
     *  git has no numstat row for the path — untracked files never have one. */
    counts?: GitLineCounts;
}
/** One directory row: its children plus the number of changed files beneath. */
export interface ChangeDir {
    kind: 'dir';
    /** The display label: one segment, or the compressed chain ('src/client'). */
    name: string;
    /** The deepest directory this row stands for. */
    path: string;
    children: ChangeNode[];
    /** Changed files anywhere under this row (the row's count pill). */
    changes: number;
}
export type ChangeNode = ChangeDir | ChangeFile;
/**
 * Fold one group's changed files (unstaged or staged) into a directory tree.
 * Rows without a porcelain status (clean, ignored) are skipped, a repeated
 * path counts once, and an empty input yields an empty list.
 * @param entries - the group's `git status` entries.
 * @returns the tree's roots, ready to render in order.
 */
export declare function buildChangeTree(entries: readonly GitStatusEntry[]): ChangeNode[];
/** One group's summed line counts, plus how many rows contributed them. */
export interface ChangeLineTotals {
    additions: number;
    deletions: number;
    /** Rows that actually PRINT numbers. 0 means the group has nothing to sum
     *  (only untracked files, binary blobs — or only 0/0 entries such as a pure
     *  rename), so the header must show no total at all. */
    files: number;
}
/**
 * Sum one group tree's line counts (#131): the group header's total is exactly
 * the sum of the numbers its own file rows print. Binary rows, rows without
 * counts (untracked files) and rows whose two numbers are both zero (a pure
 * rename, a mode-only change — their rows print nothing) contribute nothing,
 * never a fabricated 0 — and folding a directory is a view state, so every
 * member counts either way.
 */
export declare function sumLineCounts(nodes: readonly ChangeNode[]): ChangeLineTotals;

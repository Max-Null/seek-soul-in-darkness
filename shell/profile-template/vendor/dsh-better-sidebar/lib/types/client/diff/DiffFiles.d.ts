import { type DiffFile, type DiffRow, type FoldSegment, type ParsedDiff } from './rows.ts';
export interface DiffFilesProps {
    /** Unified diff text (`git.diff` or `git.commit-diff` payloads). */
    diff: string;
    /** A parse the caller ALREADY did for its own header stats: rendering the
     *  same ≤8MB patch twice on the UI thread was visible on large commits. The
     *  component trusts it as-is (the changes pane passes the parse it just
     *  summarized); omit it to parse `diff` here. Ignored for untracked files,
     *  whose synthetic full-file addition comes from their content. */
    parsed?: ParsedDiff;
    /** Untracked-file content: when present, renders as a full-file addition instead of parsing. */
    untrackedPath?: string;
    untrackedContent?: string;
    /** Fetch a git gap fold's hidden rows on demand (both sides' contents by
     *  the fold's line ranges); forwarded to every file's DiffRows. Absent
     *  folds without `rows` stay non-expandable (session-op diffs and
     *  untracked additions always carry theirs). */
    resolveFold?: (file: DiffFile, segment: FoldSegment) => Promise<readonly DiffRow[]>;
}
export declare function DiffFiles({ diff, parsed: provided, untrackedPath, untrackedContent, resolveFold }: DiffFilesProps): import("react").JSX.Element | null;

import type { MermaidMarkdownProps } from './mermaid-blocks.ts';
/** Drop every queued render and detach the current drain loop (test seam:
 * module state persists across specs in one vitest file). */
export declare function resetMermaidRenderQueueForTests(): void;
/**
 * The chunk-resident markdown preview renderer: ONE MarkdownText pass over
 * the full source (cross-fence reference/footnote/list semantics intact),
 * then every rendered `language-mermaid` code block is swapped for a
 * `MermaidDiagram`. The `.md-code-block` host stays in the React tree —
 * only its children are replaced — so reconciliation never loses the host;
 * a block that stops being a mermaid fence gets its original children back.
 * Only mounted when the source contains at least one mermaid fence (see
 * TextEditor.tsx).
 */
export declare function MermaidMarkdown({ text, codeLabels }: MermaidMarkdownProps): React.ReactNode;

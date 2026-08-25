/**
 * Pure mermaid source utilities — no mermaid import, so this module can ship
 * in the main client bundle while the heavy mermaid engine lives in a lazy
 * asset bundle (`lib/assets/mermaid.js`, loaded on demand by mermaid-lazy).
 * @module @changfenhuang/dsh-genui/client/mermaid-safe
 */
/** Throws when `svg` carries script, event-handler attributes, or
 * `javascript:` URIs. Exported for tests; `renderMermaid` is the only caller
 * in production. */
export declare function assertSafeSvg(svg: string): void;
/**
 * Best-effort repair of common model-authored label mistakes in graph /
 * flowchart sources, used only when the original fails to render:
 * - drop backticks — lexically illegal in mermaid labels (models embed
 *   ```dsh-ui style fences, which break the parser with "Lexical error");
 * - strip `<br/>` tags, which require htmlLabels (never enabled here);
 * - quote unquoted node labels containing CJK, spaces, or other characters
 *   mermaid's bare-label grammar rejects (observed live: `A[模型生成 spec]`).
 * Conservative by design: already-quoted labels, plain ASCII labels without
 * spaces, and non-flowchart kinds are left untouched (apart from the
 * backtick/`<br/>` sanitation above, which is harmless everywhere in a
 * flowchart).
 *
 * Labeled-edge spans (`-- 文本 -->`, `== 文本 ==>`, `-. 文本 .->`) are free
 * text and must never be quoted: wrapping them breaks the parser
 * ("Expecting 'LINK' … got 'STR'"), observed live with
 * `H -- 否(流式中) --> J`. Each span is swapped for a bracket-free
 * placeholder before quoting and restored verbatim afterwards, so the quote
 * pass can neither corrupt it nor be thrown off by inserted quotes
 * elsewhere on the line.
 *
 * Pipe-style edge labels (`-->|文本|`) are the opposite: an UNQUOTED pipe
 * label containing `[` or `]` breaks the parser ("Parse error", observed
 * live with `-->|6. 用户交互 → [genui-action]|`) because the brackets are
 * node grammar. Quoting the label text is display-neutral (mermaid renders
 * `-->|"文本"|` without the quotes) and parses. These spans are masked too,
 * so the node-label quote pass below cannot reach inside them and produce
 * nested quotes, and restored last.
 */
export declare function repairMermaidSource(code: string): string;
/**
 * Lenient repair for sources that omit the mandatory diagram-type
 * declaration line — the #1 failure mode of model-generated mermaid (chat
 * assistants routinely emit `A --> B` without the leading `graph TD`).
 *
 * When the first token is not an already-declared `graph`/`flowchart` kind
 * but the body contains flowchart edge arrows, prepend `graph TD` so the
 * diagram renders instead of tripping the kind gate. Anything else — an
 * explicitly declared kind, a sequence/gantt/pie body (no flowchart edges),
 * or plain text — is returned unchanged: we never guess at the diagram type.
 */
export declare function ensureFlowchartKind(code: string): string;

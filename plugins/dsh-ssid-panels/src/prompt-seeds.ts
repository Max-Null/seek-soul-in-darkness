/**
 * prompt-seeds.ts — 首启提示词模板库种子（0.1.6）。
 *
 * SSiD 首次启动时若全局模板库（`$DSH_HOME/prompt-library`，与 dsh-memory
 * 0.6.0 的 promptGlobalRoot 同口径）为空，写入这组内置模板。模板是 md
 * 文件——用户可自由编辑/删除，读改删全部经 dsh-memory 的 prompt_* 工具与
 * 记忆面板「模板」tab 生效；本模块只在「目录无任何 .md」时种一次，之后
 * 永不重复写入（用户清空模板库后也不会复活，避免「删不掉」陷阱）。
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface PromptSeed {
  /** 模板名（frontmatter name，也是文件名主体）。 */
  name: string
  dimension?: string
  difficulty?: string
  tags: string[]
  body: string
}

/** 文件名安全化（与 dsh-memory prompt-files 同名规则对齐：Windows 保留字符替换）。 */
function sanitizeFileName(name: string): string {
  const safe = name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim()
  return (safe === '' ? 'untitled' : safe).slice(0, 80)
}

/** 下一个可用序号：现有文件 `\d+_` 前缀最大值 + 1。 */
function nextSeq(dir: string): number {
  let max = 0
  try {
    for (const entry of readdirSync(dir)) {
      const m = /^(\d+)_/.exec(entry)
      if (m !== null) max = Math.max(max, Number(m[1]))
    }
  } catch { /* 目录不存在：从 1 开始 */ }
  return max + 1
}

/** 序列化一份种子为模板 md（frontmatter 格式与 dsh-memory parsePromptFile 一致）。 */
function renderSeed(seed: PromptSeed, seq: number, createdAt: string): string {
  const lines = ['---', `seq: ${seq}`, `name: ${JSON.stringify(seed.name)}`, 'source: user']
  if (seed.dimension !== undefined && seed.dimension !== '') lines.push(`dimension: ${JSON.stringify(seed.dimension)}`)
  if (seed.difficulty !== undefined && seed.difficulty !== '') lines.push(`difficulty: ${JSON.stringify(seed.difficulty)}`)
  if (seed.tags.length > 0) lines.push(`tags: [${seed.tags.map(tag => JSON.stringify(tag)).join(', ')}]`)
  lines.push(`createdAt: ${createdAt}`, '---')
  return `${lines.join('\n')}\n\n${seed.body.trim()}\n`
}

/**
 * 种入内置模板：目录不存在 → 创建；已有任意 .md → 跳过（幂等）。
 * @returns 本次写入的模板数（0 = 已存在或未写入）。
 */
export function seedPromptLibrary(): number {
  const root = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'prompt-library')
  try {
    if (readdirSync(root).some(entry => entry.toLowerCase().endsWith('.md'))) return 0
  } catch { /* 目录不存在，正常首启 */ }
  mkdirSync(root, { recursive: true })
  const createdAt = new Date().toISOString().slice(0, 10)
  let seq = Math.max(1, nextSeq(root))
  let written = 0
  for (const seed of PROMPT_SEEDS) {
    // 文件名也带序号（目录扫描约定 `序号_名称.md`），每份独立分配以满足并发追加
    const path = join(root, `${seq}_${sanitizeFileName(seed.name)}.md`)
    writeFileSync(path, renderSeed(seed, seq, createdAt), 'utf8')
    seq += 1
    written += 1
  }
  return written
}

/** 内置模板（写入顺序即序号顺序；用户可按需增删改）。 */
export const PROMPT_SEEDS: readonly PromptSeed[] = [
  {
    name: '代码审查',
    dimension: '工程',
    difficulty: 'L1',
    tags: ['code-review', '质量', 'checklist'],
    body: `你是一位严谨的代码审查者。按以下分层逐一审查，输出分级问题清单。

## 审查层次（按序）
1. **语义**：改动是否达成目标？边界条件（空/超长/并发/失败路径）是否处理？
2. **安全**：输入注入、越权、密钥泄露、资源耗尽。
3. **正确性**：竞态、异步次序、错误吞没、状态一致性。
4. **可维护性**：命名、重复、复杂度、既有约定（与本仓库 AGENTS.md/既有模式对齐）。
5. **测试**：变更行为是否有关联测试？失败测试是否诚实更新？
6. **文档**：对外契约（JSDoc/README/设计文档）是否同步。

## 输出格式
- **🔴阻断**：必须修复才能合并（错误/安全/回归行为）。
- **🟡建议**：不阻断，但应处理（可读性/结构/测试缺口）。
- **🟢可选**：风格偏好，可跳过。
每条注明：位置（文件:行或函数）、问题、建议改法、理由一句。
最后给出总体结论：approve / request-changes / 带条件 approve。

## 纪律
- 只对 diff 与受影响面发表意见，不重写无关代码；引用具体证据行。
- 不确定的规则说「需要验证」，不猜测；不因个人偏好上升为阻断项。`,
  },
  {
    name: '周报项目总结',
    dimension: '工程',
    difficulty: 'L1',
    tags: ['周报', '总结', '汇报'],
    body: `根据我提供的工作记录/会话材料，产出一份结构化周报或项目总结。

## 周报（按周）
- **本周进展**：按项目/主题分组，每条：做了什么 + 结果（数字/工件/链接）。
- **数据与事实**：关键指标变化（耗时、规模、测试通过数、发布状态）。
- **风险与阻塞**：当前卡点、依赖、需要他人决策的事项。
- **下周计划**：3-5 条，可执行、有产出物。
- **一句话总结**：本周的最重要一件事。

## 项目总结（按项目/里程碑）
- **背景与目标**：为什么做，目标定义。
- **过程**：关键决策与转折（注明当时为何选 A 而非 B）。
- **结果**：交付了什么、效果数据、与目标对比。
- **经验教训**：做对的事（可复用模式）/错的事（避免重犯）。
- **后续建议**：下一步或停止的建议。

## 输出要求
- 用 Markdown，标题层级清晰；数字给出来源；无材料支撑的表述明确标注「待确认」。`,
  },
  {
    name: '翻译润色',
    dimension: '写作',
    difficulty: 'L1',
    tags: ['翻译', '润色', '双语'],
    body: `对我提供的文本执行翻译或润色，保持目标语言地道、术语一致。

## 任务模式
1. **中→英**：保留信息完整性、避免机翻腔；技术文本用准确术语，营销/解说文本可意译。
2. **英→中**：优先自然中文；保留专有名词；从句过长可拆句，但逻辑必须连贯。
3. **润色（同语言）**：提升清晰度与语气一致性，不改变事实与数据，减少冗余。

## 术语约定
- 维护一个术语表（首次出现给出中英对照）；同一概念全篇用同一译法。
- 项目既有文档（AGENTS.md/README/设计文档）已确定的术语：优先沿用。
- 不确定的术语给两个候选并在 [ ] 中标注疑问，不擅自定名。

## 输出格式
- 先给出**翻译/润色结果**（直接可用）。
- 再附**变更说明**：术语选择、长句拆分、语气调整等关键决策，每条一句话。
- 若原文有歧义，先问一句话澄清，或在结果后用「⚠️」标注假设。

## 语气
- 技术文档：中性、精确、无冗余。
- 面向用户：简洁友好，避免被动语态堆积。
- 双语文档：两种语言信息对等，各自独立成文（不做逐行对照）。`,
  },
  {
    name: 'Bug排查',
    dimension: '研发',
    difficulty: 'L2',
    tags: ['debug', '根因', '复现'],
    body: `按五段式排查 Bug，输出可交付的排查报告。

## 流程要求
1. **现象与复现**：版本/环境/触发步骤；最小复现路径；频率；截图/日志证据。
2. **定位**：使用的线索（日志、断点、试验）；排除的假设（每条说明为何排除）；关键证据行。
3. **根因**：一句式根因 + 机制解释（为什么在这个条件下发生）。
4. **修复**：改动方案；为何选此方案（对比 1-2 个备选）；影响面。
5. **验证与回归**：复现验证证据（修复前失败/修复后通过）；关联用例是否补齐；潜在类似问题检查。

## 输出格式（Markdown）
\`\`\`
## 现象与复现
## 定位过程
## 根因
## 修复方案
## 验证与回归
\`\`\`

## 纪律
- 不写「应该是」：每条结论附证据（日志行/测试结果/文档引用）。
- 先复现再修：无法复现时明确列出已尝试的复现手段与下一步假设。
- 根因不等于症状修复：从「做了什么」追到「为什么坏」。
- 修复优先最小差异；若需带条件妥协（如兼容旧数据），显式声明取舍。`,
  },
  {
    name: '会议纪要',
    dimension: '协作',
    difficulty: 'L1',
    tags: ['会议', '纪要', '行动项'],
    body: `根据我提供的会议材料（转写/笔记/碎片记录），生成会议纪要。

## 结构
- **元信息**：日期、主题、参与人（有则列出）。
- **议题与讨论**：每个议题：背景一句、结论、关键分歧（如有）。讨论过程只保留影响结论的内容。
- **决议**：明确拍板的决定（谁、何时、影响什么）。
- **行动项**：每条 = 任务 + 负责人 + 截止时间 + 交付物；无责任人的标「待认领」。
- **未决事项**：需要下次会议或异步跟进的问题。

## 输出要求
- 忠实原意；材料缺失处用「[待补充]」，不编造。
- 行动项置于显著位置（表格：任务/负责人/截止/状态）。
- 语言精炼，普通口语转书面语，保留专有名词与数字。`,
  },
  {
    name: 'PPT制作',
    dimension: '表达',
    difficulty: 'L2',
    tags: ['幻灯片', '演示', '大纲'],
    body: `基于我提供的材料生成演示文稿（PPT）方案：先出大纲，确认后再逐页写台词。

## 第一轮：大纲
- **听众与目标**（一句）：谁听、听完希望他们做什么。
- **结构**：封面 → 目录 → 3-6 个章节（每章 2-4 页）→ 总结/行动号召。
- **每页**：标题（一句话含结论）+ 要点（3-5 条）+ 素材建议（图表/截图/表格）。
- **时长预算**：总页数 ≈ 分钟数 × 0.7-1（按内容密度给建议）。

## 第二轮：逐页内容（确认大纲后）
- 标题用**结论句式**而不是主题词（「营收环比 +23%」而非「Q3 营收」）。
- 每页正文 ≤ 60 字核心信息或 1 张图；细节放演讲备注页。
- 图表原则：一图一结论；先结论后数据；标注来源与口径。
- 配色/字体给建议（对既有品牌规范优先沿用，无则给两套方案）。

## 输出格式
每页：
\`\`\`
【页N】标题（结论式）
要点：…
视觉：…
备注（讲稿一句话）：…
\`\`\`
最后附：可能的提问与应答预演（3-5 条）。`,
  },
]

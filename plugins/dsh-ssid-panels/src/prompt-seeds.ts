/**
 * prompt-seeds.ts — 首启提示词模板库种子（0.1.6）。
 *
 * SSiD 首次启动时若全局模板库（`$DSH_HOME/prompt-library`，与 dsh-memory
 * 0.6.0 的 promptGlobalRoot 同口径）为空，写入这组内置模板。模板是 md
 * 文件——用户可自由编辑/删除，读改删全部经 dsh-memory 的 prompt_* 工具与
 * 记忆面板「模板」tab 生效；本模块只在「目录无任何 .md」时种一次，之后
 * 永不重复写入（用户清空模板库后也不会复活，避免「删不掉」陷阱）。
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
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

/** 种子版本标记文件（`<root>/.seed-version`）：避免「目录空才种」语义挡住
 *  升级补种——v1 用户（已有基础 6 条）在升到含 GenUI 种子的版本时按名补缺。 */
const SEED_VERSION = '2'

function readSeedVersion(dir: string): string | null {
  try {
    return readFileSync(join(dir, '.seed-version'), 'utf8').trim()
  } catch {
    return null
  }
}

function writeSeedVersion(dir: string): void {
  try {
    writeFileSync(join(dir, '.seed-version'), SEED_VERSION, 'utf8')
  } catch {
    // 非致命：仅影响下次补种判断
  }
}

/**
 * 种入内置模板。
 * - 目录没有任何 md → 全量写入（首启）；写入 `.seed-version` 标记。
 * - 已有 md 且无标记（v1 老用户）→ 按名补缺（补 GenUI 条目），写标记，此后不再补。
 * - 有标记 → 跳过（用户此后自由增删，预置条目永不复活）。
 * @returns 本次写入的模板数（0 = 无需写入）。
 */
export function seedPromptLibrary(): number {
  const root = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'prompt-library')
  const version = readSeedVersion(root)
  if (version === SEED_VERSION) return 0
  const existingMd: string[] = []
  try {
    for (const entry of readdirSync(root)) {
      if (entry.toLowerCase().endsWith('.md')) existingMd.push(entry)
    }
  } catch { /* 目录不存在，正常首启 */ }
  mkdirSync(root, { recursive: true })
  const createdAt = new Date().toISOString().slice(0, 10)
  let seq = Math.max(1, nextSeq(root))
  let written = 0
  const writeSeed = (seed: PromptSeed): void => {
    // 文件名也带序号（目录扫描约定 `序号_名称.md`），每份独立分配以满足并发追加
    const path = join(root, `${seq}_${sanitizeFileName(seed.name)}.md`)
    writeFileSync(path, renderSeed(seed, seq, createdAt), 'utf8')
    seq += 1
    written += 1
  }
  if (existingMd.length === 0) {
    for (const seed of PROMPT_SEEDS) writeSeed(seed)
  } else {
    // 增量补种：按「sanitize 名 + .md」判断是否已存在（序号前缀无关）
    const existingNames = new Set(existingMd.map(entry => entry.replace(/^\d+_/, '')))
    for (const seed of PROMPT_SEEDS) {
      if (existingNames.has(`${sanitizeFileName(seed.name)}.md`)) continue
      writeSeed(seed)
      existingNames.add(`${sanitizeFileName(seed.name)}.md`)
    }
  }
  writeSeedVersion(root)
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
  // ── GenUI 模板（0.1.7）：模板库与 genui 面板模板中心双入口 ──
  // instruction 与 genui 插件 src/client/templates.ts 同源；维度统一 "GenUI"。
  {
    name: 'GenUI-项目仪表盘',
    dimension: 'GenUI',
    difficulty: 'L1',
    tags: ['genui', 'dsh-ui', '仪表盘'],
    body: `请用 dsh-ui 给当前项目做一个仪表盘：4 个关键指标的 stat 卡片（带环比 delta）、整体进度 progress 条、今天的 3 件待办 list。标题用「项目仪表盘」。

## 背景
一张卡片汇总核心指标：数字 + 环比 + 进度条，决策一眼可见。`,
  },
  {
    name: 'GenUI-方案对比表',
    dimension: 'GenUI',
    difficulty: 'L1',
    tags: ['genui', 'dsh-ui', '对比'],
    body: `请用 dsh-ui 把以下方案的对比做成一张 table：方案 A/B/C × 维度（成本/复杂度/风险/收益），列首高亮推荐项；顶部加一行 callout 说明结论。

## 背景
多方案逐维度对照，表格直接可读，争议点一目了然。`,
  },
  {
    name: 'GenUI-五步上手流程',
    dimension: 'GenUI',
    difficulty: 'L1',
    tags: ['genui', 'dsh-ui', '教程'],
    body: `请用 dsh-ui 把操作步骤做成 steps 教程：5 步（按实际流程），每步标题 + 一两句要点，顶部用 badge 标出预计耗时。

## 背景
关键步骤排成时间线，每步一句要点，适合教程/交接/发布流程。`,
  },
  {
    name: 'GenUI-随堂测验',
    dimension: 'GenUI',
    difficulty: 'L2',
    tags: ['genui', 'dsh-ui', '测验'],
    body: `请用 dsh-ui 出 3 道随堂测验（quiz 组件：question + options，其中一项 correct，附 explanation），标题「随堂测验」，每题即选即评。

## 背景
一题一答即时判卷：选中即知对错，附讲解，适合培训问答。`,
  },
  {
    name: 'GenUI-关键值与进度',
    dimension: 'GenUI',
    difficulty: 'L1',
    tags: ['genui', 'dsh-ui', '周报'],
    body: `请用 dsh-ui 总结本周关键数据：keyvalue 列 3 组关键值、两根 progress 进度（计划 vs 实际）、timeline 放 3 个里程碑，标题「周报速览」。

## 背景
一次交付：数值、进度、里程碑三件套，周报/复盘通用。`,
  },
  {
    name: 'GenUI-趋势柱状图',
    dimension: 'GenUI',
    difficulty: 'L1',
    tags: ['genui', 'dsh-ui', '图表'],
    body: `请用 dsh-ui 把下列数据画成 chart（bars，多序列）：近 6 周完成量 vs 计划量；图表上方给一句趋势结论。

## 背景
数据直接画成柱状图，多序列对比，走势一眼看清。`,
  },
  {
    name: 'GenUI-分标签页',
    dimension: 'GenUI',
    difficulty: 'L1',
    tags: ['genui', 'dsh-ui', 'tabs'],
    body: `请用 dsh-ui 把内容分成 tabs 三个标签：概览/明细/FAQ，每个标签 3 条以内要点；标题「功能速览」。

## 背景
一大块内容拆成标签页，锚点清晰；面板不挤、消息不刷屏。`,
  },
  {
    name: 'GenUI-交付检查清单',
    dimension: 'GenUI',
    difficulty: 'L1',
    tags: ['genui', 'dsh-ui', '清单'],
    body: `请用 dsh-ui 做一张交付检查清单：6 项（测试/文档/发布/回滚/监控/公告），checkbox 可勾选，顶部 badge 提示「全部勾选再合并」。

## 背景
提交前逐项打勾：清单即流程，漏项看得见。`,
  },
  {
    name: 'GenUI-FAQ手风琴',
    dimension: 'GenUI',
    difficulty: 'L1',
    tags: ['genui', 'dsh-ui', 'FAQ'],
    body: `请用 dsh-ui 做 FAQ 手风琴（accordion）：5 个高频问题，标题栏就是问题、展开一条给答案；第一问默认展开。

## 背景
一问一答收在折叠面板里，长文档变短，回答不吓人。`,
  },
  {
    name: 'GenUI-系统架构图',
    dimension: 'GenUI',
    difficulty: 'L2',
    tags: ['genui', 'dsh-ui', '架构图'],
    body: `请用 dsh-ui 画一幅架构图（diagram）：描述当前系统的 5 个节点与连接（kind: architecture 或 flowchart），包含一个安全区 zone。

## 背景
框架图画成 SVG：节点分层、连接线、分区标注，比截图清楚。`,
  },
  {
    name: 'GenUI-3D场景',
    dimension: 'GenUI',
    difficulty: 'L2',
    tags: ['genui', 'dsh-ui', '3D'],
    body: `请用 dsh-ui 渲染一个 3D 场景（scene3d）：一个立方体 + 一个球体，标题「示例场景」，附一句使用场景说明。

## 背景
一个可旋转的 3D 场景（three.js 约 700KB 懒加载）：产品演示/空间示意用得上。`,
  },
]

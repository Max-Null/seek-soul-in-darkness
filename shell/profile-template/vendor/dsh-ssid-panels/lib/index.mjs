import { createRequire } from "node:module";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zstdDecompressSync } from "node:zlib";
import { interruptedTurnClosers } from "@deepseek-ai/dsh-session";
//#region src/release-notes.ts
/** 从 release-notes 文本提取版本号（首行 `# vX.Y.Z`）。无匹配返回 null。 */
function extractVersion(notes) {
	if (typeof notes !== "string") return null;
	const m = /^#\s*v?(\d+\.\d+\.\d+(?:[-+][\S]+)?)/m.exec(notes.trim());
	return m !== null ? m[1] : null;
}
/** 解析标题/日期/分节（覆盖 release notes 实际语法：`# `、`## `、`- `、标题内日期）。 */
function parseReleaseNotes(notes) {
	if (typeof notes !== "string") return {
		version: null,
		title: null,
		date: null,
		sections: []
	};
	let title = null;
	let date = null;
	const sections = [];
	let current = null;
	for (const raw of String(notes).split("\n")) {
		const line = raw.trimEnd();
		const h1 = /^#\s+(.+)$/.exec(line);
		const h2 = /^##\s+(.+)$/.exec(line);
		const li = /^-\s+(.+)$/.exec(line);
		if (h1 !== null) {
			title = h1[1];
			const d = /[（(](20\d{2}-\d{2}-\d{2})[)）]/.exec(h1[1]);
			if (d !== null) date = d[1];
			continue;
		}
		if (h2 !== null) {
			current = {
				heading: h2[1],
				items: []
			};
			sections.push(current);
			continue;
		}
		if (li !== null && current !== null) current.items.push(li[1]);
	}
	return {
		version: extractVersion(notes),
		title,
		date,
		sections: sections.filter((s) => s.items.length > 0)
	};
}
//#endregion
//#region src/prompt-seeds.ts
/**
* prompt-seeds.ts — 首启提示词模板库种子（0.1.6）。
*
* SSiD 首次启动时若全局模板库（`$DSH_HOME/prompt-library`，与 dsh-memory
* 0.6.0 的 promptGlobalRoot 同口径）为空，写入这组内置模板。模板是 md
* 文件——用户可自由编辑/删除，读改删全部经 dsh-memory 的 prompt_* 工具与
* 记忆面板「模板」tab 生效；本模块只在「目录无任何 .md」时种一次，之后
* 永不重复写入（用户清空模板库后也不会复活，避免「删不掉」陷阱）。
*/
/** 文件名安全化（与 dsh-memory prompt-files 同名规则对齐：Windows 保留字符替换）。 */
function sanitizeFileName(name) {
	const safe = name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim();
	return (safe === "" ? "untitled" : safe).slice(0, 80);
}
/** 下一个可用序号：现有文件 `\d+_` 前缀最大值 + 1。 */
function nextSeq(dir) {
	let max = 0;
	try {
		for (const entry of readdirSync(dir)) {
			const m = /^(\d+)_/.exec(entry);
			if (m !== null) max = Math.max(max, Number(m[1]));
		}
	} catch {}
	return max + 1;
}
/** 序列化一份种子为模板 md（frontmatter 格式与 dsh-memory parsePromptFile 一致）。 */
function renderSeed(seed, seq, createdAt) {
	const lines = [
		"---",
		`seq: ${seq}`,
		`name: ${JSON.stringify(seed.name)}`,
		"source: user"
	];
	if (seed.dimension !== void 0 && seed.dimension !== "") lines.push(`dimension: ${JSON.stringify(seed.dimension)}`);
	if (seed.difficulty !== void 0 && seed.difficulty !== "") lines.push(`difficulty: ${JSON.stringify(seed.difficulty)}`);
	if (seed.tags.length > 0) lines.push(`tags: [${seed.tags.map((tag) => JSON.stringify(tag)).join(", ")}]`);
	lines.push(`createdAt: ${createdAt}`, "---");
	return `${lines.join("\n")}\n\n${seed.body.trim()}\n`;
}
/** 种子版本标记文件（`<root>/.seed-version`）：避免「目录空才种」语义挡住
*  升级补种——v1 用户（已有基础 6 条）在升到含 GenUI 种子的版本时按名补缺。 */
const SEED_VERSION = "2";
function readSeedVersion(dir) {
	try {
		return readFileSync(join(dir, ".seed-version"), "utf8").trim();
	} catch {
		return null;
	}
}
function writeSeedVersion(dir) {
	try {
		writeFileSync(join(dir, ".seed-version"), SEED_VERSION, "utf8");
	} catch {}
}
/**
* 种入内置模板。
* - 目录没有任何 md → 全量写入（首启）；写入 `.seed-version` 标记。
* - 已有 md 且无标记（v1 老用户）→ 按名补缺（补 GenUI 条目），写标记，此后不再补。
* - 有标记 → 跳过（用户此后自由增删，预置条目永不复活）。
* @returns 本次写入的模板数（0 = 无需写入）。
*/
function seedPromptLibrary() {
	const root = join(process.env.DSH_HOME ?? join(homedir(), ".dsh"), "prompt-library");
	if (readSeedVersion(root) === SEED_VERSION) return 0;
	const existingMd = [];
	try {
		for (const entry of readdirSync(root)) if (entry.toLowerCase().endsWith(".md")) existingMd.push(entry);
	} catch {}
	mkdirSync(root, { recursive: true });
	const createdAt = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
	let seq = Math.max(1, nextSeq(root));
	let written = 0;
	const writeSeed = (seed) => {
		const path = join(root, `${seq}_${sanitizeFileName(seed.name)}.md`);
		writeFileSync(path, renderSeed(seed, seq, createdAt), "utf8");
		seq += 1;
		written += 1;
	};
	if (existingMd.length === 0) for (const seed of PROMPT_SEEDS) writeSeed(seed);
	else {
		const existingNames = new Set(existingMd.map((entry) => entry.replace(/^\d+_/, "")));
		for (const seed of PROMPT_SEEDS) {
			if (existingNames.has(`${sanitizeFileName(seed.name)}.md`)) continue;
			writeSeed(seed);
			existingNames.add(`${sanitizeFileName(seed.name)}.md`);
		}
	}
	writeSeedVersion(root);
	return written;
}
/** 内置模板（写入顺序即序号顺序；用户可按需增删改）。 */
const PROMPT_SEEDS = [
	{
		name: "代码审查",
		dimension: "工程",
		difficulty: "L1",
		tags: [
			"code-review",
			"质量",
			"checklist"
		],
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
- 不确定的规则说「需要验证」，不猜测；不因个人偏好上升为阻断项。`
	},
	{
		name: "周报项目总结",
		dimension: "工程",
		difficulty: "L1",
		tags: [
			"周报",
			"总结",
			"汇报"
		],
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
- 用 Markdown，标题层级清晰；数字给出来源；无材料支撑的表述明确标注「待确认」。`
	},
	{
		name: "翻译润色",
		dimension: "写作",
		difficulty: "L1",
		tags: [
			"翻译",
			"润色",
			"双语"
		],
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
- 双语文档：两种语言信息对等，各自独立成文（不做逐行对照）。`
	},
	{
		name: "Bug排查",
		dimension: "研发",
		difficulty: "L2",
		tags: [
			"debug",
			"根因",
			"复现"
		],
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
- 修复优先最小差异；若需带条件妥协（如兼容旧数据），显式声明取舍。`
	},
	{
		name: "会议纪要",
		dimension: "协作",
		difficulty: "L1",
		tags: [
			"会议",
			"纪要",
			"行动项"
		],
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
- 语言精炼，普通口语转书面语，保留专有名词与数字。`
	},
	{
		name: "PPT制作",
		dimension: "表达",
		difficulty: "L2",
		tags: [
			"幻灯片",
			"演示",
			"大纲"
		],
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
最后附：可能的提问与应答预演（3-5 条）。`
	},
	{
		name: "GenUI-项目仪表盘",
		dimension: "GenUI",
		difficulty: "L1",
		tags: [
			"genui",
			"dsh-ui",
			"仪表盘"
		],
		body: `请用 dsh-ui 给当前项目做一个仪表盘：4 个关键指标的 stat 卡片（带环比 delta）、整体进度 progress 条、今天的 3 件待办 list。标题用「项目仪表盘」。

## 背景
一张卡片汇总核心指标：数字 + 环比 + 进度条，决策一眼可见。`
	},
	{
		name: "GenUI-方案对比表",
		dimension: "GenUI",
		difficulty: "L1",
		tags: [
			"genui",
			"dsh-ui",
			"对比"
		],
		body: `请用 dsh-ui 把以下方案的对比做成一张 table：方案 A/B/C × 维度（成本/复杂度/风险/收益），列首高亮推荐项；顶部加一行 callout 说明结论。

## 背景
多方案逐维度对照，表格直接可读，争议点一目了然。`
	},
	{
		name: "GenUI-五步上手流程",
		dimension: "GenUI",
		difficulty: "L1",
		tags: [
			"genui",
			"dsh-ui",
			"教程"
		],
		body: `请用 dsh-ui 把操作步骤做成 steps 教程：5 步（按实际流程），每步标题 + 一两句要点，顶部用 badge 标出预计耗时。

## 背景
关键步骤排成时间线，每步一句要点，适合教程/交接/发布流程。`
	},
	{
		name: "GenUI-随堂测验",
		dimension: "GenUI",
		difficulty: "L2",
		tags: [
			"genui",
			"dsh-ui",
			"测验"
		],
		body: `请用 dsh-ui 出 3 道随堂测验（quiz 组件：question + options，其中一项 correct，附 explanation），标题「随堂测验」，每题即选即评。

## 背景
一题一答即时判卷：选中即知对错，附讲解，适合培训问答。`
	},
	{
		name: "GenUI-关键值与进度",
		dimension: "GenUI",
		difficulty: "L1",
		tags: [
			"genui",
			"dsh-ui",
			"周报"
		],
		body: `请用 dsh-ui 总结本周关键数据：keyvalue 列 3 组关键值、两根 progress 进度（计划 vs 实际）、timeline 放 3 个里程碑，标题「周报速览」。

## 背景
一次交付：数值、进度、里程碑三件套，周报/复盘通用。`
	},
	{
		name: "GenUI-趋势柱状图",
		dimension: "GenUI",
		difficulty: "L1",
		tags: [
			"genui",
			"dsh-ui",
			"图表"
		],
		body: `请用 dsh-ui 把下列数据画成 chart（bars，多序列）：近 6 周完成量 vs 计划量；图表上方给一句趋势结论。

## 背景
数据直接画成柱状图，多序列对比，走势一眼看清。`
	},
	{
		name: "GenUI-分标签页",
		dimension: "GenUI",
		difficulty: "L1",
		tags: [
			"genui",
			"dsh-ui",
			"tabs"
		],
		body: `请用 dsh-ui 把内容分成 tabs 三个标签：概览/明细/FAQ，每个标签 3 条以内要点；标题「功能速览」。

## 背景
一大块内容拆成标签页，锚点清晰；面板不挤、消息不刷屏。`
	},
	{
		name: "GenUI-交付检查清单",
		dimension: "GenUI",
		difficulty: "L1",
		tags: [
			"genui",
			"dsh-ui",
			"清单"
		],
		body: `请用 dsh-ui 做一张交付检查清单：6 项（测试/文档/发布/回滚/监控/公告），checkbox 可勾选，顶部 badge 提示「全部勾选再合并」。

## 背景
提交前逐项打勾：清单即流程，漏项看得见。`
	},
	{
		name: "GenUI-FAQ手风琴",
		dimension: "GenUI",
		difficulty: "L1",
		tags: [
			"genui",
			"dsh-ui",
			"FAQ"
		],
		body: `请用 dsh-ui 做 FAQ 手风琴（accordion）：5 个高频问题，标题栏就是问题、展开一条给答案；第一问默认展开。

## 背景
一问一答收在折叠面板里，长文档变短，回答不吓人。`
	},
	{
		name: "GenUI-系统架构图",
		dimension: "GenUI",
		difficulty: "L2",
		tags: [
			"genui",
			"dsh-ui",
			"架构图"
		],
		body: `请用 dsh-ui 画一幅架构图（diagram）：描述当前系统的 5 个节点与连接（kind: architecture 或 flowchart），包含一个安全区 zone。

## 背景
框架图画成 SVG：节点分层、连接线、分区标注，比截图清楚。`
	},
	{
		name: "GenUI-3D场景",
		dimension: "GenUI",
		difficulty: "L2",
		tags: [
			"genui",
			"dsh-ui",
			"3D"
		],
		body: `请用 dsh-ui 渲染一个 3D 场景（scene3d）：一个立方体 + 一个球体，标题「示例场景」，附一句使用场景说明。

## 背景
一个可旋转的 3D 场景（three.js 约 700KB 懒加载）：产品演示/空间示意用得上。`
	}
];
//#endregion
//#region src/index.ts
const require = createRequire(import.meta.url);
/** 预制插件中文简介（未知插件回退包内 description）。 */
const PLUGIN_ZH = {
	"@huanlin/dsh-plugin-better-sidebar-plugin-office": "Office 三件套内联预览（docx/xlsx/pptx）",
	"@max-null/dsh-chinese-thinking": "中文思考——系统提示注入，首轮即中文",
	"@max-null/dsh-guardian": "Guardian 状态引擎——断言计数、编辑审查队列、无反馈环监控",
	"@max-null/dsh-habit": "自学习习惯引擎——纠错信号检测、阈值判断、两级人工闸门",
	"@max-null/dsh-memory": "跨会话明文记忆——BM25 检索、无向量、人工可管",
	"@max-null/dsh-ssid-panels": "SSiD 面板——记忆/状态/习惯/余额 tab 与关于页",
	"dsh-better-sidebar": "VSCode 式右侧栏——文件/终端/Git/浏览器，按会话隔离",
	"dsh-excel-panel": "Excel 编辑面板——多工作表、公式、批量格式、保存回写",
	"dsh-sidebar-qa": "划选提问——选文本到侧栏追问，不打断主对话",
	"dsh-skin": "皮肤切换——预设调色板、壁纸、透明度/模糊、字号",
	"dsh-video-preview": "视频内联预览——mp4/webm 等，支持拖进度"
};
/** 预制插件英文简介（与 PLUGIN_ZH 键一一对应，客户端按 UI 语言选择）。 */
const PLUGIN_EN = {
	"@huanlin/dsh-plugin-better-sidebar-plugin-office": "Inline preview for Office files (docx/xlsx/pptx)",
	"@max-null/dsh-chinese-thinking": "Chinese thinking — system prompt injection, Chinese from the first turn",
	"@max-null/dsh-guardian": "Guardian state engine — assertion counts, edit review queue, feedback-loop watch",
	"@max-null/dsh-habit": "Self-learning habit engine — correction signals, thresholds, two human gates",
	"@max-null/dsh-memory": "Cross-session plaintext memory — BM25 retrieval, no vectors, human-manageable",
	"@max-null/dsh-ssid-panels": "SSiD panels — memory/status/habits/balance tabs and the about page",
	"dsh-better-sidebar": "VSCode-style right sidebar — files/terminal/git/browser, per-session",
	"dsh-excel-panel": "Excel editing panel — multi-sheet, formulas, batch formatting, save back",
	"dsh-sidebar-qa": "Selection Q&A — ask about selected text in the sidebar without interrupting the main chat",
	"dsh-skin": "Skin switcher — preset palettes, wallpaper, opacity/blur, font size",
	"dsh-video-preview": "Inline video preview — mp4/webm etc., scrubbing"
};
/** 读一个已挂载插件的版本与简介。
* 优先从 profile node_modules 直接路径读（SSID_PROFILE_DIR 由壳注入，
* 不依赖各包 exports 是否暴露 ./package.json），回退模块解析。 */
function pluginMeta(name) {
	const candidates = [];
	const profileDir = process.env.SSID_PROFILE_DIR;
	if (profileDir !== void 0 && profileDir !== "") candidates.push(join(profileDir, "node_modules", name, "package.json"));
	try {
		candidates.push(require.resolve(`${name}/package.json`));
	} catch {}
	for (const candidate of candidates) try {
		const pkg = JSON.parse(readFileSync(candidate, "utf8"));
		return {
			version: pkg.version,
			descriptionZh: PLUGIN_ZH[name] ?? pkg.description,
			descriptionEn: PLUGIN_EN[name] ?? pkg.description
		};
	} catch {}
	return {};
}
/** Plugin identity for cordis.yml rows. */
const name = "@max-null/dsh-ssid-panels";
/** Services required before mounting: the webserver routes and the web runtime's trusted hosts. */
const inject = ["webServer", "webRuntime"];
/** SSiD 壳版本（main.mjs 启动时从 shell/package.json 注入环境变量）。 */
const SHELL_VERSION = process.env.SSID_SHELL_VERSION ?? "0.0.0";
/** SSiD 仓库（更新检查与更新日志来源）。 */
const SSID_REPO = "Max-Null/seek-soul-in-darkness";
/** Body size bound of one JSON request. */
const MAX_BODY_BYTES = 1 << 20;
/** One API failure with its wire code and HTTP status. */
var PanelsError = class extends Error {
	code;
	status;
	constructor(code, message, status = 400) {
		super(message);
		this.code = code;
		this.status = status;
		this.name = "PanelsError";
	}
};
/** Write a JSON response. */
function writeJson(res, status, body) {
	const r = res;
	r.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	r.end(JSON.stringify(body));
}
/** Write the failure envelope for any thrown value. */
function writeError(res, error) {
	if (error instanceof PanelsError) {
		writeJson(res, error.status, {
			ok: false,
			error: {
				code: error.code,
				message: error.message
			}
		});
		return;
	}
	writeJson(res, 500, {
		ok: false,
		error: {
			code: "internal",
			message: error instanceof Error ? error.message : String(error)
		}
	});
}
/** Read and parse the JSON request body (bounded). */
async function readJsonBody(req) {
	const chunks = [];
	let total = 0;
	for await (const chunk of req) {
		const buffer = Buffer.from(chunk);
		total += buffer.length;
		if (total > MAX_BODY_BYTES) throw new PanelsError("bad-request", "request body too large");
		chunks.push(buffer);
	}
	const text = Buffer.concat(chunks).toString("utf8");
	if (text.trim() === "") return {};
	try {
		return JSON.parse(text);
	} catch {
		throw new PanelsError("bad-request", "request body is not valid JSON");
	}
}
function header(headers, name) {
	const value = headers[name];
	return typeof value === "string" ? value : void 0;
}
function parseAuthority(authority) {
	try {
		return new URL(`http://${authority}`);
	} catch {
		return;
	}
}
function isLoopbackHostname(hostname) {
	if (hostname === "localhost" || hostname === "[::1]") return true;
	const parts = hostname.split(".");
	return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
/** Whether one request may reach the plugin routes (mirror of the /api gateway fence). */
function isTrusted(request, trustedHosts) {
	const host = header(request.headers, "host");
	if (host === void 0) return false;
	const hostUrl = parseAuthority(host);
	if (hostUrl === void 0) return false;
	if (!(isLoopbackHostname(hostUrl.hostname) || trustedHosts.some((entry) => {
		const entryUrl = parseAuthority(entry);
		return entryUrl !== void 0 && entryUrl.host === hostUrl.host;
	}))) return false;
	if (header(request.headers, "sec-fetch-site") === "cross-site") return false;
	const origin = header(request.headers, "origin");
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === hostUrl.host;
	} catch {
		return false;
	}
}
const NOTIFY_CONFIG_PATH = join(homedir(), ".ssid", "notify.json");
const NOTIFY_DEFAULTS = {
	enabled: true,
	replyDone: true,
	question: true,
	approval: true
};
function readNotifyConfig() {
	try {
		const parsed = JSON.parse(readFileSync(NOTIFY_CONFIG_PATH, "utf8"));
		return {
			...NOTIFY_DEFAULTS,
			...typeof parsed === "object" && parsed !== null ? parsed : {}
		};
	} catch {
		return { ...NOTIFY_DEFAULTS };
	}
}
const CHANGELOG_SEEN_PATH = join(homedir(), ".ssid", "changelog-seen.json");
function readChangelogSeen() {
	try {
		const parsed = JSON.parse(readFileSync(CHANGELOG_SEEN_PATH, "utf8"));
		return typeof parsed === "object" && parsed !== null && typeof parsed.version === "string" ? parsed.version : "";
	} catch {
		return "";
	}
}
function writeChangelogSeen(version) {
	try {
		mkdirSync(dirname(CHANGELOG_SEEN_PATH), { recursive: true });
		writeFileSync(CHANGELOG_SEEN_PATH, JSON.stringify({
			version,
			at: (/* @__PURE__ */ new Date()).toISOString()
		}), "utf8");
	} catch {}
}
const SESSION_ROOT_CONFIG_PATH = join(homedir(), ".ssid", "session-root.json");
/** B 方案（2026-08-23）：已载入会话清单——「移除已载入会话」只删清单内，
*  隔离后新建的会话不受影响。 */
const IMPORTED_SESSIONS_PATH = join(homedir(), ".ssid", "imported-sessions.json");
const ISOLATED_ROOT = process.env.SSID_SESSION_ISOLATED_ROOT;
const SHARED_ROOT = process.env.SSID_SESSION_SHARED_ROOT;
function readImportedSessions() {
	try {
		const parsed = JSON.parse(readFileSync(IMPORTED_SESSIONS_PATH, "utf8"));
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((entry) => {
			const e = entry;
			return e !== null && typeof e.project === "string" && typeof e.id === "string";
		});
	} catch {
		return [];
	}
}
function writeImportedSessions(entries) {
	mkdirSync(dirname(IMPORTED_SESSIONS_PATH), { recursive: true });
	writeFileSync(IMPORTED_SESSIONS_PATH, JSON.stringify(entries, null, 2) + "\n");
}
/** 把 present（载入/已存在）并入清单（幂等按 project+id 去重）。 */
function mergeImportedSessions(present) {
	const merged = readImportedSessions();
	const seen = new Set(merged.map((entry) => `${entry.project}/${entry.id}`));
	for (const entry of present) {
		const key = `${entry.project}/${entry.id}`;
		if (!seen.has(key)) {
			seen.add(key);
			merged.push(entry);
		}
	}
	writeImportedSessions(merged);
}
function readSessionRootState() {
	try {
		const parsed = JSON.parse(readFileSync(SESSION_ROOT_CONFIG_PATH, "utf8"));
		return {
			isolated: parsed?.isolated === true,
			applied: parsed?.applied === true
		};
	} catch {
		return {
			isolated: false,
			applied: false
		};
	}
}
function writeSessionRootState(next) {
	mkdirSync(dirname(SESSION_ROOT_CONFIG_PATH), { recursive: true });
	writeFileSync(SESSION_ROOT_CONFIG_PATH, JSON.stringify(next, null, 2) + "\n");
}
/** 一个根目录下携带会话目录的计数（只列目录，不解析日志）。 */
function countSessionRoot(root) {
	if (root === void 0 || root === "") return 0;
	let projects = [];
	try {
		projects = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
	} catch {
		return 0;
	}
	let count = 0;
	for (const project of projects) try {
		count += readdirSync(join(root, project), { withFileTypes: true }).filter((entry) => entry.isDirectory() && existsSync(join(root, project, entry.name, "session.jsonl.zstd"))).length;
	} catch {}
	return count;
}
/** 取一个 zstd 文件的第一个完整帧（header record 所在帧；扫描规则与
*  dsh session-persistence-jsonl 的 scanZstdFrames 一致）。 */
function firstZstdFrame(buf) {
	if (buf.length < 4 || buf.readUInt32LE(0) !== 4247762216) return void 0;
	let offset = 4;
	const descriptor = buf.readUInt8(offset);
	offset += 1;
	const single = (descriptor & 32) !== 0;
	const csum = (descriptor & 4) !== 0;
	const dictFlag = descriptor & 3;
	const dictBytes = dictFlag === 3 ? 4 : dictFlag;
	const contentSizeFlag = descriptor >>> 6;
	const contentSizeBytes = contentSizeFlag === 0 ? single ? 1 : 0 : 1 << contentSizeFlag;
	const remainingHeaderBytes = (single ? 0 : 1) + dictBytes + contentSizeBytes;
	if (buf.length - offset < remainingHeaderBytes) return void 0;
	offset += remainingHeaderBytes;
	for (;;) {
		if (buf.length - offset < 3) return void 0;
		const blockHeader = buf.readUIntLE(offset, 3);
		offset += 3;
		const lastBlock = (blockHeader & 1) !== 0;
		const blockType = blockHeader >>> 1 & 3;
		const blockSize = blockHeader >>> 3;
		if (blockType === 3) return void 0;
		const payloadBytes = blockType === 1 ? 1 : blockSize;
		if (buf.length - offset < payloadBytes) return void 0;
		offset += payloadBytes;
		if (lastBlock) break;
	}
	if (csum) {
		if (buf.length - offset < 4) return void 0;
		offset += 4;
	}
	return buf.subarray(0, offset);
}
/** 读一个会话 artifact 的 header cwd（只解压第一个 zstd 帧，成本 ~KB 级）。 */
function readArtifactHeaderCwd(artifact) {
	try {
		const frame = firstZstdFrame(readFileSync(artifact));
		if (frame === void 0) return void 0;
		const first = zstdDecompressSync(frame).toString("utf8").split("\n")[0];
		if (first === void 0) return void 0;
		const parsed = JSON.parse(first);
		return typeof parsed.cwd === "string" ? parsed.cwd : void 0;
	} catch {
		return;
	}
}
/** 把共享根的会话日志复制到独立根（只复制 session.jsonl.zstd，原件保留）。
*  `present` 收集所有「已存在（复制或跳过）」的会话，供载入后进行
*  workspace attach（侧栏分组可见——workspace 账目只随 attach/首次 bootstrap
*  填充，直接复制文件不会写入，2026-08-23 实测）。 */
function importSharedSessions() {
	if (ISOLATED_ROOT === void 0 || SHARED_ROOT === void 0 || ISOLATED_ROOT === SHARED_ROOT) throw new PanelsError("not-configured", "session roots are not configured (SSiD boot must inject SSID_SESSION_* env)", 503);
	let copied = 0;
	let skipped = 0;
	const errors = [];
	const present = [];
	let projects = [];
	try {
		projects = readdirSync(SHARED_ROOT, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
	} catch {
		return {
			copied,
			skipped,
			errors,
			present
		};
	}
	for (const project of projects) {
		const projectSource = join(SHARED_ROOT, project);
		let ids = [];
		try {
			ids = readdirSync(projectSource, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
		} catch {
			continue;
		}
		for (const id of ids) {
			const sourceArtifact = join(projectSource, id, "session.jsonl.zstd");
			if (!existsSync(sourceArtifact)) continue;
			const targetArtifact = join(ISOLATED_ROOT, project, id, "session.jsonl.zstd");
			if (existsSync(targetArtifact)) {
				skipped += 1;
				present.push({
					id,
					project,
					source: sourceArtifact
				});
				continue;
			}
			try {
				mkdirSync(dirname(targetArtifact), { recursive: true });
				copyFileSync(sourceArtifact, targetArtifact);
				copied += 1;
				present.push({
					id,
					project,
					source: sourceArtifact
				});
			} catch (error) {
				errors.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
	}
	return {
		copied,
		skipped,
		errors: errors.slice(0, 20),
		present
	};
}
/** 把（载入/已存在的）会话 attach 到其 cwd 对应的 workspace：workspace 归属
*  要求「账目记录 + cwd 匹配」（types.ts:17-22），复制文件不写账目，故此步
*  幂等补齐——侧栏分组即时可见。cwd 不存在的会话与无匹配 workspace 的跳过。 */
async function attachCopiedToWorkspaces(ctx, present) {
	const registry = ctx.get("workspaceRegistry");
	if (registry === void 0) return 0;
	const workspaces = registry.list?.() ?? [];
	let attached = 0;
	for (const item of present) {
		const cwd = readArtifactHeaderCwd(item.source);
		if (cwd === void 0) continue;
		let real;
		try {
			real = realpathSync(cwd);
		} catch {
			continue;
		}
		const ws = workspaces.find((w) => w.path === real);
		if (ws === void 0) continue;
		try {
			await ws.attachSession(item.id);
			attached++;
		} catch {}
	}
	return attached;
}
/** Read one optional service or throw 503 so the client can degrade. */
function required(service, label) {
	if (service === void 0) throw new PanelsError("service-unavailable", `the ${label} service is not mounted in this deployment`, 503);
	return service;
}
/**
* Plugin body: mount the fenced /ssid/api route.
* @param ctx - host plugin context (webServer, webRuntime).
*/
function apply(ctx) {
	try {
		const seeded = seedPromptLibrary();
		if (seeded > 0) ctx.logger.info(`[dsh-ssid-panels] prompt library seeded: ${seeded} template(s)`);
	} catch (error) {
		ctx.logger.warn(`[dsh-ssid-panels] prompt seed skipped: ${error instanceof Error ? error.message : String(error)}`);
	}
	const api = {
		"notify.get": () => readNotifyConfig(),
		"changelogSeen.get": () => ({ version: readChangelogSeen() }),
		"changelogSeen.set": (payload) => {
			const version = payload?.["version"];
			if (typeof version === "string" && version !== "") writeChangelogSeen(version);
			return { ok: true };
		},
		"notify.set": (payload) => {
			const record = payload;
			const next = readNotifyConfig();
			for (const key of [
				"enabled",
				"replyDone",
				"question",
				"approval"
			]) {
				const value = record?.[key];
				if (typeof value === "boolean") next[key] = value;
			}
			mkdirSync(dirname(NOTIFY_CONFIG_PATH), { recursive: true });
			writeFileSync(NOTIFY_CONFIG_PATH, JSON.stringify(next, null, 2) + "\n");
			return next;
		},
		"sessionRoot.get": () => {
			return {
				...readSessionRootState(),
				restartable: typeof ctx.get("ssid.shell.restart") === "function",
				sharedRoot: SHARED_ROOT,
				isolatedRoot: ISOLATED_ROOT,
				sharedSessions: countSessionRoot(SHARED_ROOT),
				isolatedSessions: countSessionRoot(ISOLATED_ROOT),
				importedSessions: readImportedSessions().length,
				listNeedsRestart: (() => {
					try {
						const bootedAt = Number(process.env.SSID_BOOTED_AT ?? 0);
						if (!Number.isFinite(bootedAt) || bootedAt === 0) return false;
						return statSync(IMPORTED_SESSIONS_PATH).mtimeMs > bootedAt;
					} catch {
						return false;
					}
				})()
			};
		},
		"sessionRoot.set": (payload) => {
			const record = payload;
			if (typeof record?.isolated !== "boolean") throw new PanelsError("bad-request", "missing or invalid \"isolated\"");
			const next = {
				isolated: record.isolated,
				applied: readSessionRootState().applied
			};
			writeSessionRootState(next);
			return {
				...next,
				restartable: typeof ctx.get("ssid.shell.restart") === "function",
				sharedRoot: SHARED_ROOT,
				isolatedRoot: ISOLATED_ROOT
			};
		},
		"sessionRoot.import": async () => {
			if (!readSessionRootState().isolated) throw new PanelsError("not-isolated", "session isolation is off; enable the switch first");
			const result = importSharedSessions();
			mergeImportedSessions(result.present.map(({ id, project }) => ({
				id,
				project
			})));
			let attached = 0;
			try {
				attached = await attachCopiedToWorkspaces(ctx, result.present);
			} catch {
				attached = 0;
			}
			return {
				...result,
				attached
			};
		},
		"sessionRoot.clear": () => {
			if (ISOLATED_ROOT === void 0 || ISOLATED_ROOT === "") throw new PanelsError("not-configured", "session roots are not configured", 503);
			const imported = readImportedSessions();
			let cleared = 0;
			for (const entry of imported) {
				const dir = join(ISOLATED_ROOT, entry.project, entry.id);
				if (existsSync(dir)) try {
					rmSync(dir, {
						recursive: true,
						force: true
					});
					cleared++;
				} catch {}
			}
			writeImportedSessions([]);
			return { cleared };
		},
		"sessionRoot.restart": () => {
			const restart = ctx.get("ssid.shell.restart");
			if (typeof restart !== "function") throw new PanelsError("restart-unavailable", "SSiD restart channel is unavailable (not booted by the shell?)", 503);
			const activeSessions = (ctx.get("sessions")?.list?.() ?? []).filter((session) => interruptedTurnClosers(session.events).length > 0).length;
			if (activeSessions > 0) return {
				ok: false,
				code: "busy",
				activeSessions
			};
			restart();
			return {
				ok: true,
				activeSessions: 0
			};
		},
		"about": () => ({
			shellVersion: SHELL_VERSION,
			plugins: [...ctx.loader.entries()].filter((entry) => !entry.options.group && entry.options.name !== void 0 && !entry.options.name.startsWith("@deepseek-ai/") && !entry.options.name.startsWith("cordis:")).map((entry) => ({
				id: entry.id,
				name: entry.options.name,
				...pluginMeta(entry.options.name)
			})).sort((a, b) => a.name.localeCompare(b.name))
		}),
		"update-check": async () => {
			try {
				const res = await fetch(`https://api.github.com/repos/${SSID_REPO}/releases?per_page=20`, { headers: { accept: "application/vnd.github+json" } });
				if (!res.ok) return {
					currentVersion: SHELL_VERSION,
					latest: null,
					releases: [],
					code: "api-failed",
					status: res.status,
					message: `GitHub API returned ${res.status}`
				};
				const list = (await res.json()).map((release) => ({
					tag: release.tag_name ?? "",
					name: release.name ?? release.tag_name ?? "",
					body: release.body ?? "",
					publishedAt: release.published_at ?? ""
				}));
				return {
					currentVersion: SHELL_VERSION,
					latest: list[0] ?? null,
					releases: list
				};
			} catch (error) {
				return {
					currentVersion: SHELL_VERSION,
					latest: null,
					releases: [],
					code: "api-failed",
					message: error instanceof Error ? error.message : String(error)
				};
			}
		},
		"release-notes": () => {
			try {
				const path = join(dirname(fileURLToPath(import.meta.url)), "..", "release-notes.md");
				return parseReleaseNotes(readFileSync(path, "utf8"));
			} catch (error) {
				return {
					version: null,
					title: null,
					date: null,
					sections: [],
					error: error instanceof Error ? error.message : String(error)
				};
			}
		},
		"update.check": async () => {
			const bridge = ctx.get("ssid.shell.update");
			if (bridge === void 0) {
				ctx.logger.info("[ssid-update] check: bridge unavailable");
				return {
					state: "unavailable",
					message: "更新桥未注入（手动 dsh web / 裸跑）"
				};
			}
			const result = await bridge.check();
			ctx.logger.info(`[ssid-update] check -> ${JSON.stringify(result)}`);
			return result;
		},
		"update.download": async () => {
			const bridge = ctx.get("ssid.shell.update");
			if (bridge === void 0) return {
				ok: false,
				error: "更新桥未注入"
			};
			const result = await bridge.download();
			ctx.logger.info(`[ssid-update] download -> ${JSON.stringify(result)}`);
			return result;
		},
		"update.install": async () => {
			const bridge = ctx.get("ssid.shell.update");
			if (bridge === void 0) return {
				ok: false,
				error: "更新桥未注入"
			};
			const result = await bridge.install();
			ctx.logger.info(`[ssid-update] install -> ${JSON.stringify(result)}`);
			return result;
		},
		"update.status": () => {
			const bridge = ctx.get("ssid.shell.update");
			if (bridge === void 0) return {
				state: "unavailable",
				message: "更新桥未注入"
			};
			const holder = {};
			bridge.onStatus((status) => {
				holder.current = status;
			})();
			return holder.current ?? { state: "idle" };
		},
		"guardian.snapshot": () => {
			return required(ctx.get("guardian"), "guardian").snapshot?.() ?? {
				session: null,
				reviewQueue: []
			};
		},
		"habit.snapshot": () => {
			return required(ctx.get("habit"), "habit").snapshot?.() ?? [];
		},
		"habit.confirm": async (payload) => {
			const habit = required(ctx.get("habit"), "habit");
			const memory = ctx.get("memory");
			const record = payload;
			if (typeof record?.id !== "string") throw new PanelsError("bad-request", "missing or invalid \"id\"");
			const candidate = habit.confirm?.(record.id);
			if (candidate !== void 0 && candidate !== null && memory !== void 0) await memory.remember?.({ content: `[习惯] ${candidate.habit}` });
			return candidate ?? null;
		},
		"habit.discard": (payload) => {
			const habit = required(ctx.get("habit"), "habit");
			const record = payload;
			if (typeof record?.id !== "string") throw new PanelsError("bad-request", "missing or invalid \"id\"");
			return habit.discard?.(record.id) ?? null;
		},
		"balance.deepseek": async () => {
			const cred = await required(ctx.get("credentials"), "credentials").resolve("DEEPSEEK_API_KEY");
			if (cred === void 0) return {
				ok: false,
				code: "missing-key",
				message: "DEEPSEEK_API_KEY is not configured"
			};
			const res = await fetch("https://api.deepseek.com/user/balance", { headers: { Authorization: `Bearer ${cred.value}` } });
			if (!res.ok) return {
				ok: false,
				code: "http-failed",
				status: res.status,
				message: "upstream balance query failed"
			};
			const data = await res.json();
			return {
				ok: true,
				isAvailable: data.is_available === true,
				balanceInfos: (data.balance_infos ?? []).map((info) => ({
					currency: info.currency ?? "CNY",
					totalBalance: info.total_balance ?? "0"
				}))
			};
		},
		"balance.kimi": async () => {
			const cred = await required(ctx.get("credentials"), "credentials").resolve("MOONSHOT_API_KEY");
			if (cred === void 0) return {
				ok: false,
				code: "missing-key",
				message: "MOONSHOT_API_KEY is not configured"
			};
			const res = await fetch("https://api.moonshot.cn/v1/users/me/balance", { headers: { Authorization: `Bearer ${cred.value}` } });
			if (!res.ok) return {
				ok: false,
				code: "http-failed",
				status: res.status,
				message: "upstream balance query failed"
			};
			const available = (await res.json()).data?.available_balance;
			const value = typeof available === "number" ? available : 0;
			return {
				ok: true,
				isAvailable: value > 0,
				balanceInfos: [{
					currency: "CNY",
					totalBalance: String(value)
				}]
			};
		}
	};
	const fence = (req) => isTrusted(req, ctx.webRuntime.trustedHosts);
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: "/ssid/api",
		handler: async (req, res) => {
			const request = req;
			if (!fence(request)) {
				writeJson(res, 403, {
					ok: false,
					error: {
						code: "forbidden",
						message: "forbidden"
					}
				});
				return;
			}
			if (request.method !== "POST") {
				writeJson(res, 405, {
					ok: false,
					error: {
						code: "method-error",
						message: "method not allowed"
					}
				});
				return;
			}
			const pathname = new URL(request.url ?? "/", "http://dsh.internal").pathname;
			const method = pathname.startsWith("/ssid/api/") ? pathname.slice(10) : void 0;
			if (method === void 0 || method.includes("/")) {
				writeError(res, new PanelsError("not-found", "unknown ssid API method", 404));
				return;
			}
			try {
				const payload = await readJsonBody(req);
				const handler = api[method];
				if (handler === void 0) throw new PanelsError("not-found", `unknown ssid API method "${method}"`, 404);
				writeJson(res, 200, {
					ok: true,
					value: await handler(payload)
				});
			} catch (error) {
				writeError(res, error);
			}
		}
	}), "@max-null/dsh-ssid-panels: /ssid/api routes");
}
//#endregion
export { apply, inject, name };

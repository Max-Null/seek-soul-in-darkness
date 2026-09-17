# GenUI 文字换行缺口 —— 交接报告

> **交接自**：工作环境（只做诊断与文档产出，未改环境、未碰上游）
> **接收方**：SSiD 开发环境（继续做上游沟通或修复）
> **当前状态**：诊断完成 · issue 正文已备 · 本仓手册已同步（v1.1）· **已提交上游 #177**（2026-09-16）
> **报告日期**：2026-09-16
> **落地记录**：接收方在本仓的执行结果见 §8。

---

## 0. 交接清单

**要带走的东西**

| 文件 | 作用 |
| --- | --- |
| `docs/genui-上游issue-文字换行缺口.md` | 可直接提交的上游 issue 正文（本次主交付） |
| `docs/genui-使用手册.md` | 本仓 GenUI 手册，已升 v1.1：§5 铁律 + FAQ Q7 |
| `docs/genui-换行缺口-交接报告.md` | 本文件 |

目标环境若为另一个 checkout，先确认这三份文件是否随之同步；未同步则先复制过去（本仓当前改动均为未提交状态）。

**不需要重做的调查**

- 上游版本与仓库状态（已查）
- `@changfenhuang/dsh-genui` 0.11.0 的源码定位与全部相关行号（已核对，见 §3）
- CSS 换行行为的实测（已在本机 Chromium 完成，见 §3.4）
- 同类 issue 去重（已查 GitHub，无重复）

**下一步动作**：二选一 —— **提 issue**（§5A，约 10 分钟）或 **直接升级为 PR**（§5B）。两者都不需要在工作环境里做。

---

## 1. 一句话结论

GenUI 的文字字段**没有任何换行通道**：`<br>` 按规格字面显示（不解析 HTML，是 `#148` 的刻意设计），`\n` 被空白规则折叠。这不是渲染器漏解析，而是行内富文本只覆盖了「强调一个词」、没覆盖「表达多行」。

---

## 2. 现象与最小复现

````markdown
```dsh-ui
{"items":[
  {"type":"callout","tone":"info","title":"JSON 转义换行","content":"第一行\n第二行"},
  {"type":"callout","tone":"warning","title":"字面 HTML","content":"第一行<br>第二行"}
]}
```
````

| 写法 | 实际 |
| --- | --- |
| `"第一行\n第二行"`（JSON 转义出的真实换行符） | 一行，原换行处是空格 |
| `"第一行\\n第二行"`（字面反斜杠 + n） | 字面显示 `\n` |
| `"第一行<br>第二行"` | 字面显示 `<br>` |

**触发场景**：模型或用户在 `callout.content`、`text.content`、`list` 项说明等字段里想分两段时，第一反应就是写 `<br>`（本次报告即如此产生）。

---

## 3. 证据链

### 3.1 行内解析器没有换行分支 ✅ 源码核对

`src/client/inline.ts:23` 的 `INLINE` 正则只识别 `` `code` ``、`**加粗**`、`==高亮==`、`$…$` / `\(…\)` / `\[…\]`、`[文字](url)`。`renderInline()` 的输出里不会出现 `<br>` 或块级元素。

### 3.2 纯文本内容走早退路径 ✅ 源码核对

`src/client/inline.ts:25-27`：

```ts
export function hasInlineMarkup(text: string): boolean {
  return typeof text === 'string' && /[`*=$\\]|\[/.test(text)
}
```

`"第一行\n第二行"` 不含 `` ` `` `*` `=` `$` `\` `[` 中任一字符 → `renderInline()` 在 `inline.ts:31` 直接 `return text`。

**推论**：任何在 JS 层处理换行的方案，都必须让这个谓词同时认换行符，否则最常见的纯文本内容根本不会进入解析循环。

### 3.3 全库没有任何保留换行的 `white-space` ✅ 源码核对

`src/client/GenuiBlock.module.css` 共 **12 处** `white-space` 声明，**全部是 `nowrap`**：

`.inlineCode`(408)、`.table th`(601)、`.table td`(607)、`.chartYTick`(663)、`.chartTip`(718)、`.barLabel`(784)、`.hbarLabel`(1186)、`.tlTime`(1555)、`.ftName`(1617)、`.visuallyHidden`(1763)、`.toolFallbackMeta`(1909)、`.panelTitle`(2118)。

**没有一处** `pre-line` / `pre-wrap` / `pre` —— 这是否定证据，说明文字类容器的换行符必然被折叠，而不是"某个类忘了加"。

受影响的文字类（均无 `white-space`）：`.text`(190) 及其 `body`/`muted`/`caption` 变体(208/209/210)、`.cardTitle`(176)、`.liTitle`/`.liDesc`(577/578)、`.calloutTitle`/`.calloutBody`(851/860)、`.stepTitle`/`.stepDesc`(914/915)、`.kvValue`(930)、`.tlTitle`/`.tlDesc`(1552/1561)。

### 3.4 CSS 折叠行为 ✅ 本机 Chromium 实测（2026-09-16）

在浏览器中对同样内容 `"A\nB"` 测量渲染高度：

| `white-space` | 高度 | 含义 |
| --- | --- | --- |
| `normal`（文字类的实际取值） | 20px | 单行 → 换行符被折叠成空格 |
| `pre-line` | 40px | 两行 → 换行保留 |
| `pre-wrap` | 40px | 两行 → 换行保留 |

依据：[CSS Text Module Level 3](https://www.w3.org/TR/2019/WD-css-text-3-20191113/)、[MDN white-space](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/white-space)。同一实验顺带验证了修复方案 A 确实能让 `\n` 换行。

### 3.5 上游状态 ✅ 已查

- npm 最新版 = **0.11.0**（2026-09-15 发布），与本机安装版一致，**未修**此问题；
- 仓库：<https://github.com/omdsh-dev/dsh-genui>（维护者 `taekchef`，issue 活跃、格式规范，第三方报告常见「根因分析 + 建议修复」写法）；
- GitHub 检索无同类 issue（标题含「换行」的两条是 file-tree 的**自动**换行，另一主题）；
- 本地**无**该插件源码仓库，只有 `node_modules` 里的发布副本（含 `src/`，可只读核对）。

### 3.6 尚未验证的部分 ⚠️

- **未在真实 GUI 内端到端复现**（没有对渲染结果截图）。§2 的对照表由 3.4 实测 + 3.3 源码推论合成，逻辑上闭合；若要在 issue 里附截图，需在 GUI 中现场渲染 §2 的围栏后截取。
- **未验证 `.text.body` 的 `text-wrap: pretty`(208) 与 `pre-line` 叠加后的视觉效果**——预期不冲突（`text-wrap` 管自动断行优化，`white-space` 管空白保留），但应在 PR 阶段加视觉回归钉住。

---

## 4. 已产出物

| 文件 | 状态 | 要点 |
| --- | --- | --- |
| `docs/genui-上游issue-文字换行缺口.md` | 新建，未提交 | issue 正文：摘要 · 环境 · 最小复现 · 4 条代码事实 · 期望 · 两个修法 · 文档缺口 · 影响面清单 · 关联 #148/#141 |
| `docs/genui-使用手册.md` | 修改，未提交 | v1.0 → v1.1：§5 新增「文字字段不换行」铁律；FAQ 新增 Q7（讲清两条路为什么都堵着） |

两处数字已在交付前复核修正（`white-space` 声明 12 处而非 9 处；`renderInline` 调用点 81 次 / 12 个文件，而非 20 余处）——该数据由脚本全量统计 `src/` 得出。

---

## 5. 在开发环境的续做路径

### A. 提 issue（约 10 分钟）

1. 打开 <https://github.com/omdsh-dev/dsh-genui/issues/new>；
2. 标题用正文首行，内容整份粘贴 `docs/genui-上游issue-文字换行缺口.md`；
3. 可选：正文里补一张实测截图（见 §3.6 第一项）。

**诉求策略（别写错）**：不要写「请支持 `<br>`」——`#148` 明确把「全程不产生 HTML」当作设计原则，那样写会被一句「按设计不支持」挡回。要写「**`\n` 也换不了行**」，这是无可辩驳的缺口。

### B. 升级为 PR

```sh
git clone https://github.com/omdsh-dev/dsh-genui.git
cd dsh-genui
pnpm install
pnpm run check          # tsc + vitest + tsdown，基线须先全绿
```

**方案 A 改动点**（推荐先做，最小）：`src/client/GenuiBlock.module.css` 给 §3.3 末尾列出的文字类补 `white-space: pre-line`。

- 零 JS 改动、零安全模型影响；
- 天然绕开 §3.2 的早退路径（早退返回的字符串由 CSS 负责表现）；
- 作用面精确，§3.3 那 12 处 `nowrap` 不受影响；
- 建议按上游习惯补一条 CSS 源码契约测试（该仓库已有同类测试，见 PR #30）。

**方案 B**（可选，后续统一入口）：`renderInline` 解析换行符。注意 `renderInline` 在 12 个文件里被调用 81 次，且 **`<br>` 不受 `white-space: nowrap` 抑制**，直接改会给表格单元格、`.inlineCode`、图表刻度带来意外换行——必须加显式开关（如 `multiline = false` 默认关闭）。

**无论 A/B，都建议同时补文档**：`SKILL.md:123-134` 增加一句「需要多行时拆成多个节点（`list` 多条、多个 `text`、`card` 子节点）；`\n` 与 `<br>` 都不会换行」。该文件不占常驻提示的长度预算（`#148` 提到 3159 / 3200 的段落上限）；若要进常驻提示的字段速查需先评估预算。

---

## 6. 环境事实（溯源用）

| 项 | 值 |
| --- | --- |
| 插件 | `@changfenhuang/dsh-genui` 0.11.0（npm 安装） |
| 安装位置 | `<profile>/node_modules/@changfenhuang/dsh-genui`（发布包含 `src/`，本次核对均基于此） |
| 宿主 | DSH Web GUI（`dsh web`） |
| 操作系统 | Windows 11 |
| 工作环境仓库 | `D:\Project\ssid`（改动未提交，见 §4） |

---

## 7. 边界：不要做什么

- **不要改 `node_modules` 里的 `lib/client.js` 来"先修一下"**——`pnpm install` / 插件升级即被覆盖，且会脱离上游。上游 issue #13 的报告者也得过同样结论。
- **不要为了这个问题改 DSH 自身源码**——与 SSiD 的既有约定（`deepseek-harness/`、`dsh-web-runtime/` 只引用不改）无关，本问题完全在上游插件侧。
- **不要直接把 `<br>` 支持当成主诉求**——理由见 §5A 的诉求策略。
- 工作环境**未做**：clone 上游、改 node_modules、安装依赖、提交 PR、改动任何插件文件。接收方从干净状态开始即可。

---

## 8. 落地记录（本仓补记，2026-09-16）

接收方在 **`H:\MaxNull\WorkStation`**（SSiD 开发工作区）执行的结果：

| 项 | 结果 |
| --- | --- |
| 交接物同步 | ✅ 两份文档归档 `seek-soul-in-darkness/docs/`；`genui-使用手册.md` 升 v1.1（§5 新增「文字字段不换行」铁律 + FAQ Q7） |
| 交付路径 | 走 §5A 提 issue；正文照用，仅「环境」表补一行「提交前复核（0.11.1-preview.2）」 |
| 上游 issue | ✅ <https://github.com/omdsh-dev/dsh-genui/issues/177>（评论附实机截图） |
| §3.6 遗留项 A（未实机复现） | ✅ 已消解：真实 GUI 截图中 6 处 `<br>` 全部字面显示，且**都写在句首**——正是正文「模型强先验」那一段的直接证据 |
| §3.6 遗留项 B（`text-wrap: pretty` 叠加 `pre-line`） | ⏳ 仍未验证，留给 PR 阶段的视觉回归 |
| §0 环境差异 | 本仓**已有**上游 fork `third-party-plugins/dsh-genui`（§3.5 说的「本地无源码仓库」不适用于本仓）；截图经该 fork 的分支 `issue-177-evidence` 托管（`gh gist` 不支持二进制文件） |

**本仓复核（已同步进 issue 与手册）**：`origin/main` = 0.11.1-preview.2 上缺口仍然存在——`hasInlineMarkup` 正则未变，12 处 `white-space` 仍全为 `nowrap`；GitHub 检索确认无同类 issue，§3.5 的去重结论成立。

**尚未做**：方案 A 的代码改动未开始（等上游对 #177 的回应）；`seek-soul-in-darkness/docs/` 的改动尚未提交仓库 git。

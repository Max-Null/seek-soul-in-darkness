# [Feature] 文字类字段无法表达换行：`\n` 被空白折叠，`<br>` 字面显示（0.11.0）

## 摘要

`#148` 引入的行内富文本解决了「在句子里强调一个词」，但**表达多行**至今没有通道：

- 写 `<br>` → 按设计字面显示（不解析 HTML，符合 `SKILL.md` 的既有声明）；
- 写 `\n` → 被 HTML 空白规则折叠成空格，**同样不换行**。

结果是 `callout.content`、`text.content`、`list` 项说明这类**天然可能分多段**的文字字段，只能把一段话拆成多个节点来凑换行。在 `callout` 里，这会额外多出一个边框与间距块，语义上也把一个段落切成了两段。

**这不是「请支持 HTML」的请求**——下面两个修法都不引入 `innerHTML`。

## 环境

| 项 | 值 |
| --- | --- |
| `@changfenhuang/dsh-genui` | 0.11.0（npm 安装） |
| 宿主 | DSH Web GUI（`dsh web`） |
| 操作系统 | Windows 11 |
| 渲染通道 | 消息流内联 `dsh-ui` 围栏 |
| 核对方式 | 0.11.0 发布包内 `src/` 只读核对，行号见下文 |

## 现象

### 最小复现

````markdown
```dsh-ui
{"items":[
  {"type":"callout","tone":"info","title":"JSON 转义换行","content":"第一行\n第二行"},
  {"type":"callout","tone":"warning","title":"字面 HTML","content":"第一行<br>第二行"}
]}
```
````

### 观察结果

| 写法 | 期望 | 实际 |
| --- | --- | --- |
| `"第一行\n第二行"`（JSON 转义出的真实换行符） | 两行 | **一行**，原换行处是一个空格 |
| `"第一行\\n第二行"`（字面反斜杠 + n） | —— | 字面显示 `\n` |
| `"第一行<br>第二行"` | —— | 字面显示 `<br>` |

第三行符合既有声明；第一、二行是本条 issue 要讨论的部分。

## 代码事实（0.11.0 只读核对）

**1. 行内解析器没有换行分支。**
`src/client/inline.ts:23` 的 `INLINE` 正则只识别 `` `code` ``、`**加粗**`、`==高亮==`、`$…$` / `\(…\)` / `\[…\]`、`[文字](url)`。`renderInline()` 的输出里不会出现 `<br>`，也不会出现块级元素。

**2. 纯文本内容走早退路径，连解析循环都不进。**
`src/client/inline.ts:25-27`：

```ts
export function hasInlineMarkup(text: string): boolean {
  return typeof text === 'string' && /[`*=$\\]|\[/.test(text)
}
```

`"第一行\n第二行"` 不含 `` ` `` `*` `=` `$` `\` `[` 中任一字符，于是 `renderInline()` 在 `inline.ts:31` 直接 `return text`。返回的字符串里那个换行符，随后被当作普通文本节点渲染 → 空白折叠。

任何在 JS 层处理 `\n` 的方案，都必须让这个谓词同时认 `\n`，否则最常见的纯文本内容根本不会进入解析。

**3. 所有文字容器都没有「保留换行」的 `white-space`。**
`src/client/GenuiBlock.module.css` 中这些类只声明字号 / 颜色 / 行高，**没有任何 `white-space`**，因此取浏览器默认 `normal`（换行符、连续空格、行首行尾空白统一折叠）：

| 类 | 行 |
| --- | --- |
| `.cardTitle` | 176 |
| `.text` / `.text.body` / `.text.muted` / `.text.caption` | 190 / 208 / 209 / 210 |
| `.liTitle` / `.liDesc` | 577 / 578 |
| `.calloutTitle` / `.calloutBody` | 851 / 860 |
| `.stepTitle` / `.stepDesc` | 914 / 915 |
| `.kvValue` | 930 |
| `.tlTitle` / `.tlDesc` | 1552 / 1561 |

**4. `nowrap` 是有意的，修法不应波及它们。**
同文件共 **12 处** `white-space` 声明，**全部是 `nowrap`**：`.inlineCode`(408)、`.table th`(601)、`.table td`(607)、`.chartYTick`(663)、`.chartTip`(718)、`.barLabel`(784)、`.hbarLabel`(1186)、`.tlTime`(1555)、`.ftName`(1617)、`.visuallyHidden`(1763)、`.toolFallbackMeta`(1909)、`.panelTitle`(2118)。这些字段本就该单行。

这条同时是全库的**否定证据**：整个样式表里不存在任何保留换行的 `white-space` 取值（没有 `pre-line` / `pre-wrap` / `pre`），所以代码事实 3 里那些文字类的换行符必然被折叠。

## 为什么这不只是「文档没写清」

`SKILL.md:123-134` 的「行内富文本」一节确实写了「不解析 HTML（每个标记生成 React 元素，不走 innerHTML）」，也注明 `**加粗**` 是「不换行、不成块」。

但**没有任何一句告诉模型：需要多行时该怎么办**。

实测代价：本次报告就是模型读完该技能后，要在一个 `callout` 里写两段话，第一反应写下 `<br>` —— 技能只说了 HTML 不能用，没说替代方案，而「多行 = `<br>`」是模型的强先验。同一类误用会反复出现。

## 期望

文字类字段中的换行符能表达换行，至少覆盖：

`text.content`、`callout.title` / `callout.content`、`card.title`、`list[]` 的 `title` / `desc`、`keyvalue[]` 的 `value`、`steps[]` 的 `title` / `desc`、`timeline[]` 的 `title` / `desc`。

`table` 单元格、`.inlineCode`、badge、图表刻度标签、`.panelTitle` 等**保持现状不换行**。

## 建议修法

### 方案 A（推荐）：给多行容器的 CSS 加 `white-space: pre-line`

在上表那些叶子文字类上补 `white-space: pre-line`。

- **语义正好**：保留 `\n` 换行，其余空白照旧折叠——模型多打几个空格不会出问题。
- **零 JS 改动、零安全模型影响**，且天然绕开代码事实 2 的早退路径：早退返回的字符串里的换行符由 CSS 负责表现，不需要进解析循环。
- **作用面精确**：第 4 条那批 `nowrap` 不受影响，无需给 `renderInline` 加开关参数。
- 需一并确认：`.text.body`(208) 与 `.heroSubtitle`(396) 用了 `text-wrap: pretty`。两者机制不同（`text-wrap` 管自动断行优化，`white-space` 管空白保留），预期不冲突，但建议加一条视觉回归钉住。

### 方案 B：在 `renderInline` 里把 `\n` 解析成换行节点

两处改动：`hasInlineMarkup` 认 `\n`；解析循环把含 `\n` 的文本切片按行拆开，行间插入 React 元素。

- 优点：一处改动，所有调用点行为一致，不依赖每个容器记得加 CSS。
- 风险：`renderInline` 在 **12 个文件**里被调用 **81 次**（另有 1 处函数定义）——`render-node.tsx` 19、`advanced.tsx` 18、`charts.tsx` 17、`forms.tsx` 14、`basic.tsx` 与 `EChartNode.tsx` 各 2，`checkbox.tsx` / `GenuiBlock.tsx` / `image.tsx` / `index.tsx` / `PlotBlock.tsx` 各 1，`inline.ts` 内另有 3 处递归。其中包含 `nowrap` 的表格单元格、`.inlineCode`、图表刻度等。细节：**`<br>` 不受 `white-space: nowrap` 抑制**，会给这些字段带来意外换行。若走这条路，建议给 `renderInline` 增加显式开关（如 `multiline = false` 作默认值），只在多行调用点打开。

两者不必二选一：A 覆盖绝大多数场景；B 的「默认关闭」版本可作为后续统一入口，配合 A 逐步收敛。

### 可选：把字面 `<br>` / `<br/>` 归约为换行

若愿意再往前一步，可在 `INLINE` 正则加一条：匹配 `<br>` / `<br/>` / `<br />`，输出一个 React 换行元素。

- 这**不违反** `#148` 的安全定位：全程是字符串匹配 → React 元素，`innerHTML` 依然不参与，`safeHref` 一类白名单策略不变。区别只是多识别一个字面记号。
- 直接命中「模型先验」：模型不必先读到「不支持 HTML」再换写法，一次写对。
- 若维护方认为「不解析 HTML」这条线不宜开口，可只做 A/B，并把下一节的文档补充当作必做项。

## 文档缺口（无论是否改代码都建议补）

`SKILL.md:123-134` 增加一句替代指引，例如：

> 需要多行时拆成多个节点（`list` 多条、多个 `text`、`card` 子节点）；`\n` 与 `<br>` 都不会换行。

放在 `SKILL.md` 不占常驻提示的长度预算（`#148` 提到过 3159 / 3200 的段落上限）；若要同时进常驻提示的字段速查，需先评估预算。

## 影响面清单（0.11.0）

| 字段 | 渲染位置 | 容器类 |
| --- | --- | --- |
| `text.content` | `src/client/blocks/render-node.tsx:206` | `.text` + size 变体 |
| `card.title` | `src/client/blocks/render-node.tsx:255` | `.cardTitle` |
| `list[]` 的 `title` / `desc` | `src/client/blocks/render-node.tsx:416` | `.liTitle` / `.liDesc` |
| `callout.title` / `.content` | `src/client/blocks/advanced.tsx:31-32` | `.calloutTitle` / `.calloutBody` |
| `steps[]` 的 `desc` | `src/client/blocks/advanced.tsx:51` | `.stepDesc` |
| `keyvalue[]` 的 `value` | `src/client/blocks/advanced.tsx:68` | `.kvValue` |
| `timeline[]` 的 `desc` | `src/client/blocks/advanced.tsx:349` | `.tlDesc` |

## 关联

- `#148`（feat(inline)：行内富文本——文字类回答的底座）：本 issue 讨论同一层缺的另一半。
- `#141`（按设计规范重做表面与层级 + 默认无卡规则）：拆成多个节点来凑多行会额外产生一个表面，与该规范方向相反。

## 附：从「不解析 HTML」到「支持换行」的边界

如果维护方希望保持最小改动，上面 A + 文档补充这两项就已经能消除本次报告的误用；B 与「`<br>` 归约」属于把这条路径彻底铺平的做法，可按版本节奏安排。

---

## 归档注记（本仓）

已于 **2026-09-16** 提交为上游 issue：<https://github.com/omdsh-dev/dsh-genui/issues/177>。

提交时对正文只做两处补充，其余照用：

- 「环境」表补一行**提交前复核**：`origin/main`（0.11.1-preview.2）上缺口依然存在（`hasInlineMarkup` 正则未变、12 处 `white-space` 仍全为 `nowrap`）；
- issue 评论附**真实 GUI 实机截图**——即交接报告 §3.6 列为「尚未验证」的那一项，图中 6 处 `<br>` 全部字面显示。

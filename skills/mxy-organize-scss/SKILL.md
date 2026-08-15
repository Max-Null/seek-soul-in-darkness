---
name: mxy-organize-scss
description: 对 SCSS 文件运行 stylelint 诊断、修复问题，并按规范添加中文注释
---

请对用户当前打开或选中的 SCSS 文件执行以下步骤：

## 步骤 1：确认目标文件

读取用户当前在 IDE 中打开的文件。如果用户指定了其他文件路径，则以用户指定的为准。

同时确认项目根目录是否存在 `.stylelintrc.json` 配置文件。若不存在，先生成一份基础配置：

```json
{
  "extends": "stylelint-config-standard-scss",
  "rules": {
    "max-nesting-depth": 6,
    "selector-class-pattern": null,
    "declaration-no-important": [true, { "severity": "warning" }],
    "no-descending-specificity": null
  }
}
```

## 步骤 2：运行 stylelint 诊断

在当前项目根目录执行 `npx stylelint <目标文件相对路径>`，记录所有问题：

- **error** — 必须先修复，stylelint 才能通过
- **warning** — 非阻塞项，但需确认是否需要修复或加注释

## 步骤 3：修复 stylelint 问题

### 3.1 重复选择器（no-duplicate-selectors）

将相同选择器的分散规则合并到一处，按属性分组排序后去重。

### 3.2 嵌套深度超限（max-nesting-depth）

选择器嵌套超过 6 层时：

- 优先扁平化嵌套（能改结构的情况）
- 无法扁平化时（如覆盖 Element Plus 深层默认样式），在文件第一行加文件级 `/* stylelint-disable max-nesting-depth */`，文件末尾加 `/* stylelint-enable max-nesting-depth */`

### 3.3 `!important` 声明（declaration-no-important）

每个 `!important` 必须在其上一行添加注释，说明：

- **覆盖了谁的什么规则** — 例如"覆盖 Element Plus 默认 th 背景色 #f5f7fa"
- **为什么必须用 `!important`** — 例如"scoped 样式与全局样式的优先级冲突"

### 3.4 类选择器命名（selector-class-pattern）

检查类名是否符合 kebab-case 或 BEM 命名。第三方库类名（如 `.el-table__cell`）无需修改，定位到项目自定义类名的违规项。

### 3.5 其他自动修复项

执行 `npx stylelint <目标文件> --fix` 处理可自动修复的问题（如 `color-function-alias-notation` 将 `rgba()` 转为 `rgb()`、`scss/double-slash-comment-empty-line-before` 等）。

## 步骤 4：处理 stylelint-disable 文件级陷阱

**关键规则**：`/* stylelint-disable <rule> */` 必须是文件的**第一个字节**（第一行第一列），前面不能有任何 `//` 注释或其他内容。否则 postcss-scss 将其关联到首个规则节点而非文档根节点，disable 不生效。

```scss
/* stylelint-disable max-nesting-depth */  // ← 第 1 行第 1 字节

// ===== 文件头注释放在其后 =====
// MyComponent 组件样式
// ...
```

**验证方法**：若修改后 disable 仍不生效，用 `xxd <文件> | head -1` 检查文件开头字节序列。

## 步骤 5：添加中文注释

按以下场景逐一添加注释，注释编号写清**为什么**需要这个样式（WHY），不重复样式本身（WHAT）。

### 5.1 文件头注释

```scss
// ============================================================
// MyComponent 组件样式
// 简要描述组件职责和核心样式特性
// ============================================================
```

### 5.2 CSS 变量注释

```scss
// CSS 变量：控制表格内边距，紧凑模式可覆盖为 0
// !important 防御外部样式污染
--my-component-padding: 12px !important;
```

### 5.3 布局与定位注释

```scss
// flex 水平布局：左侧表单撑满，右侧按钮固定宽度
display: flex;
align-items: center;
justify-content: space-between;

// 绝对定位：脱离文档流，为高度计算提供锚点
position: absolute;
top: 0;

// z-index 1500：高于 el-dialog 遮罩，低于全局消息提示
z-index: 1500;
```

### 5.4 动画/过渡注释

```scss
// 展开/收起图标旋转过渡动画
transition: transform var(--el-transition-duration);

// hover 渐显：默认透明度 0，hover 时渐入
opacity: 0;
transition: opacity .5s;
```

### 5.5 第三方库样式覆盖注释

```scss
// 覆盖 Element Plus el-table 表头默认背景色
// !important：scoped 样式与全局 .el-table th 优先级冲突
background: #f2f3f7 !important;

// Vue scoped 穿透：.keyword 为子组件内动态生成的元素，不使用 :deep 则样式不生效
:deep(.keyword) {
  color: var(--el-color-primary);
}
```

### 5.6 @media / 浏览器兼容 hack 注释

```scss
// 移动端窄屏（≤767px）：双列网格改为单列，提升可读性
@media screen and (width <= 767px) {
  grid-template-columns: 1fr;
}

// iOS Safari 平滑滚动支持（橡皮筋效果）
-webkit-overflow-scrolling: touch;
```

### 5.7 区域分隔注释

大型 SCSS 文件用区域注释划分结构：

```scss
// ========== Header 区域 ==========
// ========== Body 区域 ==========
// ========== Footer 区域 ==========
```

### 5.8 其他特殊值注释

```scss
// 触控热区自适应：320px → 32px，480px → 48px，clamp 线性过渡
min-width: clamp(32px, 10vw, 48px);

// 圆形背景：每个页码独立成圆，视觉层次清晰
border-radius: 50%;
```

## 步骤 6：验证通过

执行 `npx stylelint <目标文件>` 确认：

- **0 errors**（必须）
- **warnings 已确认**（每个都有注释说明原因）

如果仍有未处理的 error，回到步骤 3 修复后重新验证。

## 约束

- **不改变任何运行时样式** — 仅添加注释、调整属性顺序、合并重复选择器，不改属性值
- **不新增依赖**
- **保留现有 CSS 变量引用**（`var(--xxx)`）不变
- **保留现有选择器结构**，不主动重构嵌套层级（除非合并重复选择器时强制）
- 如果文件已有完整的注释体系且 stylelint 通过，告知用户"文件已整理良好，无需改动"
- 注释语言使用简体中文

# DSH 插件中英切换适配-方案

> 日期：2026-08-17 ｜ 状态：已定稿，实施中 ｜ 关联：DSH web profile（bundles 迁移后）
> 决策记录备查优先于写代码——本文件是后续实施与验收的唯一依据。

## 1. 背景与目标

DSH 更新后 web UI 支持中英切换（`@deepseek-ai/dsh-client-locale` 语言设置行）。所有带 UI 的第三方插件需要跟随切换，否则英文界面里残留中文（或反之）。

**目标**：盘点 @max-null 系列插件中有 UI 者，参照已验证方案让它们全部支持中英切换。

## 2. DSH locale 机制调研结论

能力位于 `packages/client/locale`（`@deepseek-ai/dsh-client-locale`），客户端服务 `LocaleRuntime`：

| API | 说明 |
|---|---|
| `register(ns, { zh, en })` | 注册命名空间双语字典（也可 `register(ns, 'zh', dict)` 分次注册） |
| `bind(ns)` | 返回稳定 translate 函数：`t(key, {name})`，`{name}` 占位符插值，缺键回退中文 |
| `getLocale()` | 快照 `{ active: 'zh' \| 'en', locales }` |
| `setLocale(id)` | 切换语言并 emit `locale/change` |
| `locale/change` 事件 | payload 为快照；监听者重渲染 |
| `subscribe(fn)` | 服务级订阅（官方插件内部用；`ctx.on('locale/change')` 等价） |

- 初始语言从浏览器读取；语言设置行注册在 `settings.general`。
- 官方客户端插件模式：`inject` 声明 `'locale'` → `ctx.locale.register(ns, {zh, en})` → slot 注册带 `locale: ns`（slot seat 自动注入 `t` 给组件）。
- **第三方插件时序**：`package.json` 的 `dsh.client.inject`（字符串数组）声明本插件 client 依赖的官方客户端插件，client-modules 按此排加载序。locale 不在列表时不保证先启动。

## 3. 两个已验证的第三方适配方案

### 方案 A：官方 seat 方案（dsh-skin、dsh-skill-mcp-center 在用）

- `dsh.client.inject` 含 `@deepseek-ai/dsh-client-locale`；client bundle `inject` 声明 `'locale'`。
- `apply` 里 `ctx.locale.register(NS, { zh, en })`；slot 注册带 `locale: NS`。
- 组件通过 slot 的 locale seat 拿 `t` 或直接 `ctx.locale.bind(NS)` + `subscribe` 重渲染。

### 方案 B：自研字典方案（dsh-plugin-center 在用，2026-08-17 适配）

- client bundle `inject` **不声明** locale；`apply` 里 `ctx.get?.('locale')` 可选获取。
- 初始快照：`locale?.getLocale?.()?.active`；切换：`ctx.on?.('locale/change', snap => adoptLocale(snap?.active))`。
- 模块级 `STRINGS = { zh, en } as const` + `StringKey = keyof typeof STRINGS.zh`（编译期键对齐）。
- 模块级 `localeId` + 监听器集合；`useT()` hook 订阅重渲染，返回带 `{n}` 插值的 `t(key, vars)`。
- slot 的 `label` 用函数形式 `() => STRINGS[localeId].title` 动态求值。
- **locale 服务缺失时静默降级中文**，不阻塞插件加载（plugin-center 实测：未经 inject 声明的属性访问会触发 "cannot get property locale without inject"，故走 `ctx.get?.` + 事件，不碰 inject 声明）。

### 选型（决策 D1）

**ssid-panels 采用方案 B**，理由：
1. 其 client bundle 有 purityGate（tsdown 插件）：禁止 cross-plugin value import `@deepseek-ai/*`（react/cordis/inline-safe 除外）。方案 A 需 `import type {} from '@deepseek-ai/dsh-client-locale/client'` 做声明合并，虽为纯类型，方案 B 连类型依赖都省掉，gate 零触碰。
2. 方案 B 不修改 client bundle 的 `inject` 声明与 loader 服务门，改动面最小。
3. 降级中文的防御符合"错误不阻塞加载"。
4. 与 plugin-center 同构，后续维护两仓库一套模式。

同时把 `@deepseek-ai/dsh-client-locale` 加入 `dsh.client.inject`（如 plugin-center / skill-mcp-center 所做），**尽力保证 locale 服务先启动**；即使时序不成立，方案 B 的降级路径兜底。

## 4. 盘点结果（2026-08-17 实测）

| 插件 | client（UI） | 适配状态 | 处置 |
|---|---|---|---|
| @max-null/dsh-plugin-center | 有 | ✅ 已适配（方案 B） | 无 |
| @max-null/dsh-skill-mcp-center | 有 | ✅ 已适配（方案 A） | 无 |
| dsh-skin（本地 file:） | 有 | ✅ 已适配（方案 A） | 无 |
| @max-null/dsh-skin-ssid | 有 client，但零用户可见文案（纯主题 token 覆盖） | ➖ 无需适配 | 无 |
| @max-null/dsh-ssid-panels | 有：4 侧栏 tab + 设置页 | ❌ 未适配，中文硬编码 | **本次适配对象** |
| @max-null/dsh-memory / dsh-chinese-thinking / dsh-guardian / dsh-habit | 无 client（纯服务端/工具） | ➖ 无 UI | 跳过（模型可见文本跟随系统提示语言，不属 UI 切换范围） |

另注：ssid-panels / skin-ssid 当前**未安装**进 web profile（bundles 与 node_modules 均无），为待发布/待安装状态。

## 5. dsh-ssid-panels 适配实施清单

仓库：`H:\MaxNull\WorkStation\dsh-ssid-panels`（npm 0.1.0 → 发 0.1.1）

### 5.1 客户端 `src/client/index.tsx`

1. 新增模块级双语字典 `STRINGS = { zh: {...}, en: {...} } as const`，覆盖全部 UI 文案：
   - 记忆面板：`搜索记忆…`、状态过滤 tab 文案（auto/suggested/suggest 是数据枚举，保持原值不译）、空态 `黑暗中未见灵光`、`确认`/`删除`
   - 状态面板：`断言计数`、`安静`、`{n} 级`、`编辑审查队列`、`无待审查项`、`第 {n} 轮 · `、`(无路径)`
   - 习惯面板：`候选习惯`、`证据 {n} 条`、`确认（写入记忆）`、`丢弃`
   - 余额面板：`查询异常`、`可用`/`余额不足`、`查询中…`、`查询失败`、`刷新`、`尚未查询`、`上次更新 {t}`
   - 关于页：`思灵 (SSiD)`、`于黑暗中，探寻灵魂。`、`检查更新`、`暂无发布版本`、`新版本可用：…`、`已是最新：…`、`检查中…`/`立即检查`、`更新日志`、`（无）`、`预制插件`
   - slot label：`关于 SSiD`、`记忆`、`状态`、`习惯`、`余额`
2. 新增 locale 接线（方案 B）：
   - `type LocaleId = 'zh' | 'en'`；`adoptLocale(id?)`；模块级 `localeId` + `localeListeners`
   - `useT()` hook（同 plugin-center：`useState(localeId)` + effect 订阅，`fmt` 插值）
   - `apply` 里：`const locale = ctx.get?.('locale')` → 初始 `getLocale()?.active` → `ctx.on?.('locale/change', snap => adoptLocale(snap?.active))`
   - 全部组件改为 `const t = useT()`；tab `title` 与 settings `label` 改函数求值 `() => t(...)`
3. `apply` 的 ctx 类型：沿用现状（`cordis` 的 Context + 局部宽化），不新增跨包 import。

### 5.2 服务端 `src/index.ts`（UI 可见的动态文案跟随语言）

服务端不知道 UI 语言，改返回**结构化双语/带 code 的消息**，客户端按当前语言展示：

1. `about.plugins[].description`：`PLUGIN_ZH` 表保留，新增 `PLUGIN_EN` 表；`pluginMeta` 返回 `{ descriptionZh, descriptionEn }`（回退 pkg.description）。客户端按 `localeId` 选择。
2. `balance.deepseek` / `balance.kimi`：失败信封加 `code: 'missing-key' | 'http-failed'`，`message` 改为英文诊断（保留原中文改英文）。客户端按 code 显示本地化文案，`message` 作详情附加。
3. `update-check` 的 `message`（GitHub API 失败）：同样加 `code`，客户端本地化。
4. `PanelsError` 的 wire message（bad-request 等）：属诊断层，保持英文不动。

### 5.3 `package.json`

- `version` 0.1.0 → 0.1.1
- `dsh.client.inject` 加 `"@deepseek-ai/dsh-client-locale"`（时序保证，方案 B 兜底）

### 5.4 验收

1. `pnpm typecheck` && `pnpm build`（tsdown：host ESM + client bundle，purityGate 不得报错）
2. 发布 npm 0.1.1（`npm publish`，需要用户确认）
3. 安装到 web profile 后重启，切换中英验证：侧栏 4 tab 标题、设置页、各面板文案跟随切换，无残留中文（en 界面）。

## 6. 决策记录

- **D1** 方案选型：ssid-panels 用方案 B（plugin-center 式），理由见 §3。
- **D2** 无 client 的四个插件（memory/thinking/guardian/habit）不做 UI 适配：无 UI 可切；模型可见文本跟随系统提示语言，与 UI 语言解耦。
- **D3** dsh-skin-ssid 不改造：纯主题 token，无用户可见文案。
- **D4** 服务端动态文案（balance/about/update-check）结构化后由客户端本地化；wire 错误信息（诊断层）保持英文。
- **D5** 数据枚举（memory 状态 auto/suggested/suggest）不翻译——它们是 API 值，译了会破坏过滤逻辑。

## 7. 后续隐患（继承自 bundles 迁移）

profile 的 bundles 列表若再增删插件而 `cordis.patch.yml` 残留同名 insert，会复现 `duplicate loader entry id`。排查口径：**每个插件只在一个来源声明**——正式插件进 bundles，临时/本地插件走 patch insert。

## 8. 暂缓：ssid-panels 关于页显示 DSH 版本（决策 2026-08-17）

**需求**：dsh-ssid-panels 关于页增加"所在环境 DSH 版本"。

**调研结论**：DSH 官方通道已存在——服务端 `host.describe` RPC（`packages/host/apiproxy/src/api/host.ts`，契约：version = apps/cli 的 package.json 版本），浏览器端 `ctx.connection.hostDescription`（`@deepseek-ai/dsh-client-connection`，getSnapshot/subscribe）。**但实现是占位符**：`packages/host/apiproxy/src/api-proxy.ts:2865` 硬编码 `version: '0.0.1'`，TODO 待接入真实版本。

**决策：选 C 暂缓**——不修 DSH 本体、不做插件端绕行（环境变量/读 cwd 猜测耦合，DSH 修好后还要返工）。

**恢复条件**：DSH 的 `host.describe` version 返回真实值后，ssid-panels 客户端注入 `connection` 服务，读 `hostDescription.getSnapshot()?.version` 并在关于页双语展示（复用 §5 的 i18n 模式），文案键 `dshVersion`。

# quick-toolbar 独立化设计方案（v1 草案）

- 日期：2026-08-30
- 现状：原 dsh-header-unify（SSiD 内置专属）→ 已改名 dsh-quick-toolbar；功能核心已是「插件按钮聚合器」
- 哲学（用户定稿）：**适配外包**——引擎不追所有环境，每个环境的 LLM 即为「驻场工程师」，按模板现场适配

## 1. 定位与问题

- **问题**：三方插件按钮满天飞（设置栏/右上角/会话内/悬浮）；官方无「按钮注册表」（已查证：`dsh-commands`=文本命令，`ui-slots`=位置渲染，header utilities=仅会话头）。
- **方案**：**聚合器**——收集分散按钮 → 统一入口 → 隐藏原按钮。
- **双载体**：SSiD = 壳标题栏（既有）；web = **iOS 小白点式悬浮球**（可拖拽/半透明/点开菜单）。
- **核心红利**：聚合器通过「存在即注册」天然感知插件启用状态（未加载=未适配=不显示不隐藏，无空指针）。

## 2. 总体架构（引擎 + 适配器双层）

```
quick-toolbar（引擎，独立 npm 插件）
├── 聚合 UI（双载体适配器：壳标题栏 / web 悬浮球）
├── 适配器执行器（遍历适配器 → 定位→扣图标/文案→隐藏→绑定点击）
├── 行为库（枚举行为实现，可 L1 测试）
├── 注册协议 register()（第二层：我方/愿适配插件直接注册）
├── 宿主半 /quick-toolbar/api/adapters（读用户配置 + zod 校验）
└── adapters.prompt.md（模板 + 内置示例 few-shot = 驻场 LLM 的图纸）
用户侧：用户 LLM 按模板生成 → 写入配置文件 → 生效
```

## 3. 适配器 Schema（v1 声明式，zod）

```js
{ id: 'dsh-session-manager',        // 插件标识（去重/开关）
  button: '.sm-footerBtn',          // 分散按钮定位（选择器，必填）
  icon: 'from-button',              // 图标/文案来源：from-button | custom:(emoji|svg data-uri)
  label: '会话管理',                 // 工具栏显示名（可选，默认扣原按钮文案）
  act: { kind: 'toggle-panel', close: '.sm-modal .close' },   // 枚举行为 + 参数（见 §4）
  hide: true,                       // 点击后隐藏原按钮（可选，默认 true）
  enabled: true }                   // 用户可单独关闭（可选）
```

- **v1 禁止任意函数**（LLM 不可信输入 → 只允许枚举+数据）；v2 开放函数式（白名单 API + 用户「信任模式」开关）。
- 校验：zod（button 必填 / act.kind 枚举 / icon 枚举）；校验失败 → 该条丢弃并告警（不吞全表）。

## 4. 行为枚举（v1 内建库）

| kind | 语义 | 参数 | 来源 |
|---|---|---|---|
| `click` | 直接触发（原按钮/可点击元素） | — | 一般按钮 |
| `toggle-panel` | 面板开/关（再点关闭：探测 `close` 选择器的关闭按钮） | `close?` | **dsh-session-manager**（原生无再点关闭——探测弹窗关闭按钮） |
| `dispatch-event` | 派发 CustomEvent（`ssid:titlebar` 等桥接通路） | `event`, `detail?` | 壳标题栏桥接 / header-unify 通道 |
| `open-settings` | 打开设置面板（官方 settings 入口） | `path?` | 设置类按钮 |
| `command` | 触发 dsh-commands 文本命令 | `name` | 命令型按钮 |

（行为库随引擎演进；新增行为=引擎版本，不要求适配器改。）

## 5. 配置接入（host API 模式，chat-rail 先例）

- 文件：`~/.dsh/quick-toolbar-adapters.json`（首个 `{ "adapters": [...] }`；用户可编辑）
- host 半：`/quick-toolbar/api/adapters`（GET 读文件+zod 校验+返回；POST 写回[可选]）
- 客户端 fetch → 执行；设置页提供「重新加载配置」按钮（免重启）；文件 mtime 变化提示热载。
- LLM 工作流：用户把 `adapters.prompt.md`（+自身环境描述/截图）喂给 LLM → 产出 JSON → 写入文件 → 重新加载。

## 6. 双载体交互

- **壳（`__SSID_SHELL__`）**：标题栏按钮组（复用 `ssid:title:action` IPC 桥接——桥接代码重构为 `dispatch-event` 行为的壳级通道，留在 SSiD 壳库适配层）。
- **web（无壳）**：悬浮球（半透明圆形按钮，拖拽移动（localStorage 定位/吸附边缘）、点开菜单（按钮网格/列表）、折叠）；iOS AssistiveTouch 交互参考。
- 同一执行器/适配器层，仅 UI 呈现不同（载体适配器独立）。

## 7. LLM 模板（adapters.prompt.md 核心）

- 模板：§3 schema + §4 行为枚举 + 2-3 条**黄金示例**（内置适配器「会话管理」的最难案例：toggle-panel 探测关闭——LLM 学习难缠案例）。
- 要求 LLM：①只写数据（枚举）②选择器必须实际存在（用户提供截图/DOM 快照）③先小规模（1-2 条）验证再扩展。
- **内置适配器集 = 兜底 + few-shot 语料**（护城河：我们已 hack 的按钮全部规则化）。

## 8. 迁移路径（现有 → 目标）

1. 现状硬编码按钮（插件中心/侧栏/底栏/会话管理/…）→ 抽为**内置适配器集**（bundled 数据，引擎不含硬编码）。
2. 改名兼容：旧 `dsh-header-unify` 引用（profile 声明/vendor）留兼容层或统一迁移（同 2026-08-30 改名五处纪律）。
3. SSiD 壳桥接（IPC）→ 引擎内 `dispatch-event` 行为 + 壳库适配层（拆壳耦合，为 web 独立铺路）。
4. 构建链与门槛：补齐 tsdown/typecheck/test（§9 L1）；README/截图（§9 截图规范——悬浮球/标题栏双载体截图）。

## 9. 开放问题（v2 方向）

- 函数式 act（白名单 API、信任模式）
- 「未识别按钮」半自动发现（扫描已知挂载点 → 提示用户 LLM 补适配）
- 适配器扩展包下发（插件中心更新流）
- 行为库与官方 `ui-slots` 接缝的深整合（渲染在官方 slot，而非纯 DOM 注入）

## 10. 参考

- uBlock/AdGuard 规则库模式（规则引擎 + 规则集；不要求被收编方配合）
- dsh-assistant-center 设计文档先例（doc/设计/）
- 会话管理按钮 hack 经验（弹窗关闭探测）、SSiD 标题栏桥接（main.mjs ipcMain `ssid:title:action`）

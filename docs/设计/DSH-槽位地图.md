# DSH 客户端槽位（Slot）完整地图

> 日期：2026-08-16
> 来源：读 `packages/client/ui-*` 各 SlotMap 声明（ui-layout / ui-sidebar / ui-conversation / ui-settings / ui-tool / ui-workspace）
> 用途：回答「插件能在 UI 的哪里扩展、哪里不能」

---

## 一、四种槽位类型（kind）——先懂这个

| kind | 语义 | 插件能做什么 |
|---|---|---|
| `single` | 单占用，**替换** | 占了就替换原有组件（如替换 sidebar、替换 details） |
| `list` | 可追加，**叠加** | 多个插件往同一处加条目（按 `order` 排序） |
| `keyed` | 按 key 分派 | 按 tool name / command name / node kind 分派到具体渲染器 |
| `chain` | 选择器路由，**接管** | 第一个匹配的选择器接管（如 composer 接管） |

## 二、布局骨架（root 的 4 个子槽位）

> `root` 是唯一内置槽位；下面 4 个由 `ui-layout` 声明，**写死不可新增**。

| 槽位 | kind | 位置 | 谁占用 |
|---|---|---|---|
| `sidebar` | single | 左侧整列（导航） | ui-sidebar |
| `conversation` | single | 中间会话区 | ui-conversation |
| `details` | single | 右侧详情列 | ui-conversation 的 DetailsPanel |
| `shell.overlay` | **list** | 框架级浮层（浮窗/toast/角标） | 无固定占用 |

**结论**：DSH 是「左栏 + 会话 + 右详情列」三段。插件**不能新增第四列**（root 的 children 写死），但能替换 `details`、往 `shell.overlay` 加浮层。

## 三、各区域的子槽位

### 3.1 sidebar 子槽位（ui-sidebar 声明）

| 槽位 | kind | 说明 |
|---|---|---|
| `sidebar.workspaces` | single | 工作区/会话浏览区（替换=换掉整个列表） |
| `sidebar.settings` | single | 底部设置入口 |
| `sidebar.footer.action` | **list** | 底部额外操作（**可追加**） |

### 3.2 conversation 子槽位（ui-conversation 声明，最丰富）

| 槽位 | kind | 说明 |
|---|---|---|
| `conversation.session` | single | 整个会话 body |
| `conversation.session.header` | single | 会话头部 |
| `conversation.session.header.actions` | **list** | 头部操作按钮（可追加） |
| `conversation.session.header.utilities` | **list** | 头部右侧工具（可追加） |
| `conversation.view` | **list** | 视图 tab（chat/trajectory/waterfall，**可加新 tab**） |
| `conversation.chat.node` | keyed | 业务节点渲染器 |
| `conversation.chat.commandview` | keyed | 命令行渲染 |
| `conversation.chat.turnTail` | chain | 回合尾部扩展 |
| `conversation.chat.assistant-actions` | **list** | 助手消息操作（可追加） |
| `conversation.details.tool` | single | 工具详情面板 body |
| `conversation.composer` | chain | composer 接管（审批等） |
| `conversation.composer.bar` | single | 默认输入栏 |
| `conversation.composer.dock` | **list** | 输入栏下方横幅（可追加） |
| `conversation.hero.workspace` | single | 空状态工作区选择器 |
| `conversation.hero.agentPreset` | single | 空状态 preset 芯片 |
| `conversation.input.overlay` | **list** | 输入覆盖菜单 |
| `conversation.input.dock` | **list** | 输入上方整行（可追加） |
| `conversation.input.left` | **list** | 工具行左端（可追加） |
| `conversation.input.right` | **list** | 工具行右端（可追加） |
| `conversation.input.plan` | single | plan 状态座位 |
| `conversation.input.model` | single | 模型选择座位 |

### 3.3 settings 子槽位（ui-settings 声明）

| 槽位 | kind | 说明 |
|---|---|---|
| `settings.trigger` | single | 侧栏设置按钮内容 |
| `settings.header` | single | 面板标题 |
| `settings.action` | **list** | 面板头部操作 |
| `settings.close` | single | 关闭按钮文案 |
| `settings.section` | **list** | **设置页（一个插件一个页）** |
| `settings.plugins.tab` | **list** | **插件配置 tab** |
| `settings.onboarding` | **list** | 引导步骤 |
| `settings.general.item` | **list** | 通用偏好行 |
| `settings.plugin.item` | **list** | 插件卡片 |

### 3.4 tool 子槽位（ui-tool 声明）

| 槽位 | kind | 说明 |
|---|---|---|
| `tool.call.toolview` | keyed | 按工具名分派的工具调用视图 |

### 3.5 workspace 目录流（ui-workspace 声明）

| 槽位 | kind | 说明 |
|---|---|---|
| `conversation.hero.workspace.directoryFlow` | single | 空状态目录选择流 |
| `sidebar.workspaces.directoryFlow` | single | 侧栏目录选择流 |

## 四、对 SSiD 的落点结论

### 记忆 UI 面板的四个可行落点

| 落点 | kind | 效果 | 评估 |
|---|---|---|---|
| `settings.plugins.tab` | list | 设置页加「记忆」tab | 稳（我之前的设计） |
| `conversation.view` | list | 会话区加「记忆」视图 tab（像 trajectory） | **最接近分形"右侧记忆面板"** |
| `details` | single | 替换右侧详情列为记忆面板 | 会丢工具详情 |
| `shell.overlay` | list | 浮窗 | 临时/轻量 |

### 分形"四段布局"的结论

DSH 骨架是**三段写死**（sidebar/conversation/details）。分形的"文件预览列 + 右侧记忆面板"这种**多右侧区域**，插件层做不到——要么改 `ui-layout`（碰 DSH 源码），要么等官方加槽位，要么用 `conversation.view` 视图 tab 来"折叠"多个面板（tab 切换而非并排）。

### 插件能做的（不改 DSH 源码）一览

- ✅ 往 **list** 槽位加东西（header 操作、输入按钮、设置页/tab、浮层、视图 tab、助手消息操作）
- ✅ 往 **keyed** 槽位注册（自己的工具调用视图、命令渲染）
- ✅ 往 **chain** 槽位接管（composer 接管、回合尾部扩展）
- ✅ 替换 **single** 槽位（sidebar/conversation/details/session/header 等）
- ❌ **新增布局列**（root 的 4 子槽位写死）

# v1.1.12

**发布日期**：2026-11-16

## 内置升级

- DSH 内核：`0.2.2-rc.1` → **`0.2.2-rc.3`**（跨 rc.2、rc.3 两个版本，共 1574 个提交）

## 调整

- **7 个随包插件跟到 npm 最新**：

  | 插件 | 之前 | 现在 |
  |---|---|---|
  | `dsh-dream-skin` | 11.7.0 | 11.14.1 |
  | `@max-null/dsh-skill-mcp-center` | 0.7.1 | 0.8.0 |
  | `ds-harness-remote` | 0.6.4 | 0.6.5 |
  | `dsh-better-sidebar` | `file:./vendor` | 0.32.1（改走 npm 渠道） |
  | `dsh-context` | 0.84.0 | 0.84.1 |
  | `dsh-session-manager` | 0.7.5 | 0.7.8 |
  | `dsh-video-preview` | 0.1.4 | 0.1.5 |

- **新装默认启用新版 Web 搜索 API**：模板新增 `web` 条目，新装的 profile 会把搜索与抓取都切到 DeepSeek 的工具层接口（`/v1/tools/*`）——搜索不再消耗模型回合，抓取改由服务端完成、不受本机出网限制。**代价**：该条目属出厂条目，每次启动以模板为准，设置页的「启用新版 Web 搜索 API」开关重启后失效。

- **Office 组合改由 bundle 预设挂载**：上游 rc.2 把 `apps/desktop-host/src/office.ts` 的内容迁到 `packages/document/`（`office-kit` / `tool-office`），思灵侧不再在 `desktop-host` 里手动挂载。本次跟随上游删除了那段挂载与残留的死导入。

## 修复

- **设置页导航图标重复**：`dsh-memory` / `dsh-skill-mcp-center` / `dsh-achievements` / `dsh-ssid-panels` 四个插件改注册宿主 0.2.2 新增的 `settings.section.icon` 插槽，不再靠 `MutationObserver` + `::before` 打补丁。设置面板里这五行现在各只显示一个图标。

  已知例外：`dsh-dream-skin` 那一行仍可能出现双图标（作者仓库的修复 PR 尚未合并）。验收时请单独看待这一行，它不计入本次修复范围。

## 新增

- **`plugin-deps` 守卫**：新增第 8 道发版守卫，检查随包插件集的运行时依赖是否齐全。此前的形态是「随手抄插件，依赖悄悄丢失」，构建不报错、装上才缺。

## 更新说明

- **老用户升级**：插件集与内核随安装包一并更新，不需要手动操作。设置页的搜索开关如果此前打开过，升级后会回到模板默认值（新 API 全开）。
- **会话兼容**：会话格式仍是 v4，本次没有不可回退的变更。rc.3 新增了一个 `team/mode` 事件，一旦会话里写入了它，回退到 rc.1 时该会话可能读不了——这是按会话生效的条件性单向门，不影响未使用 AgentTeam 的会话。
- **macOS 版**：本版只有 Windows x64 未签名包，mac 包需另走 GitHub Actions 构建。

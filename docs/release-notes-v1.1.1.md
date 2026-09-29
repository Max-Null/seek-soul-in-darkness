# v1.1.1 思灵（SSiD）

> 状态：**待发布**（2026-09-29）。相对 v1.1.0 的修复版。本版**不动内核**（仍为 `0.2.0-rc.1`），
> 只修随包插件集与打包链。产品版本与内核版本仍是**两条线**：本版产品 `1.1.1`，内核 `0.2.0-rc.1`。

## 这一版修的是什么

**v1.1.0 装机后启动失败**——这是本版存在的理由。现象是启动即弹「应用无法启动或已意外停止」，
正文 `web boot: 3 entries did not activate`，三个插件停在 `pending (waiting for service: betterSidebar)`。

根因在随包插件集：`dsh-better-sidebar` 装的是 `0.21.1`，它的 `@deepseek-ai/dsh-*` peer 写的是
`^0.1.7-rc.1`，而 caret 展开为 `>=0.1.7-rc.1 <0.2.0-0`，**不含内核的 `0.2.0-rc.1`**。内核的
`plugin-compatibility` 判定失败后**静默跳过整个 bundle** —— 它不报错、不进 `did not activate`
列表（在进入 fiber 图之前就被跳过了），于是 `betterSidebar` 服务无人注册，等它服务的三个客户端
插件一直 pending，客户端 boot 判定失败。完整取证见
[1.1.0 启动失败排查](排查/2026-09-29-1.1.0启动失败-插件peer与内核脱钩.md)。

**v1.1.0 只对齐了我们自己的插件**（11 个，见 v1.1.0 说明），**随包的第三方插件没有跟**。
而「跟到 npm latest」也不足以避免这类问题：本版实测 `dsh-dream-skin` 与
`@changfenhuang/dsh-genui` 的**最新版** peer 仍停在 `^0.1.x`。

## 修复

- **随包第三方插件的内核对齐**（六个 pin 跟到 npm 最新）：
  - `dsh-better-sidebar` 0.21.1 → **0.24.1**、`dsh-sidebar-qa` 1.0.2 → **1.1.0**：
    这两个是上面那起启动失败的直接根因，新版的 peer 已改为 `^0.2.0-rc.1` / 无上界区间。
  - `dsh-context` 0.57.0 → **0.59.2**、`ds-harness-remote` 0.4.20 → **0.4.23**、
    `dsh-dream-skin` 9.26.1 → **9.27.1**、`@playwright/mcp` 0.0.82 → **0.0.83**：
    同步跟到最新。前两个原先的 peer 是**无上界**区间，因此并未被跳过，属于保持最新。
- **`@changfenhuang/dsh-genui` 与 `dsh-dream-skin` 不再被静默跳过**（上游尚未适配）：
  两者的最新版 peer 仍是 `^0.1.x`。本版核实其**运行时不依赖 0.1.x 专有 API** 之后，
  在打包时把这两个包的**内核 peer 范围**放宽到覆盖当前内核
  （`… || >=0.2.0-rc.1 <0.3.0-0`，只改随包插件集里的这份，不动 npm 上的包）：
  - genui 只通过 `ModuleLoader` 取 `@deepseek-ai/dsh-client-ui-primitives`，且对内核未提供的
    扩展自带本地兜底（`src/client/action-context.ts` 的 `?? localContext`、
    `blocks/render-node.tsx` 的可选链）；
  - dream-skin 自带新老 seed 回退：先试 `@deepseek-ai/dsh-client-store`（新模块表），
    失败再退 `@deepseek-ai/dsh-client-runtime/client`（≤0.1.1-rc.x 的旧表）。
- **打包链新增内核兼容性校验（防复发）**：`prepare:ssid-plugins` 在装完插件集、写 manifest 之前，
  用**内核自己的判据**（`app-boot` 的 `evaluatePluginCompatibility` + `getDshRuntimeVersion`，
  与运行时同源，不会漂移）逐个检查随包 bundle，任一不通过即**让打包失败**并列出不兼容的
  peer。这道校验不会再让「装了但被静默跳过」的插件进到安装包里。

## 已知问题（本版未处理）

- **独立会话存储的会话根隔离失效**：开了「独立会话存储」的机器上，内核实际读写的是共享根
  `~/.dsh/sessions`，隔离根里的历史会话在侧栏与置顶菜单里不可见（**会话数据完好，不涉及丢失**）。
  应急处置与根因取证见
  [会话根隔离失效排查](排查/2026-09-29-1.1.0会话根隔离失效-诊断与应急热修.md)。
- **纯净模式的救援效果待实测**：托盘「以纯净模式重启」的过滤链（读标志 → 过滤 bundle 层 →
  传入内核 → 内核按过滤结果组合条目）经逐环核对是正确的，但尚未在真机上做过受控复现。

## 更新说明

- **升级路径与 v1.1.0 相同**：覆盖安装即可，配置、会话与工作区数据保留。内核未变，**不需要迁移**。
- **单实例**：与仍在运行的其他版本**不能并行**（同一个单实例锁）；升级前请先退出旧版。
- **首次启动会重新装载插件集**：随包插件集有六处版本变动，首启会按新声明重建 profile 里指向
  插件集的链接。已有会话不受影响。
- **不买证书的既定取舍**：安装包未签名，Windows SmartScreen 会拦截，选择「仍要运行」即可。

## 下载与校验

- 资产（[GitHub Release v1.1.1](https://github.com/Max-Null/seek-soul-in-darkness/releases/tag/v1.1.1)）：
  - `ssid-1.1.1-win-x64-unsigned.exe`（NSIS 安装包）
  - `ssid-1.1.1-mac-arm64-unsigned.dmg` / `.zip`（macOS，ad-hoc 签名，未公证）
  - 附 `latest.yml` / `latest-mac.yml` 与 blockmap（在线增量更新所需）
- SHA256 —— **以本页与 Release 页为准**（打包完成后回填）。
- 说明：**包内那份「更新日志」（关于 SSiD）不着录校验和**。安装包的哈希取决于内嵌内容，
  而包里又装着一份更新日志，把最终哈希写进包内会**再次改变**哈希；真实校验和以本页与
  GitHub Release 页为准。

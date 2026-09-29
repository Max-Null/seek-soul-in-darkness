# v1.1.4 思灵（SSiD）

> 状态：**已发布**（2026-09-30）。三处实机反馈的修复 + 三个内置插件跟到最新。内核不变（`0.2.0-rc.1`）。

## 这一版修的是什么

### 控制台成对刷 `quick-toolbar/api/state` 503

`installSsidTitlebar` 的两条路径会在**同一次页面加载里各跑一遍**注入：结尾那句「页面没在加载就补一次」命中窗口刚创建的那一刻（此时页面还没有文档），随后 `did-finish-load` 再跑一遍。注入脚本没有幂等守卫，于是它内部的初始化请求整串发两遍 —— 悬浮球状态回读是 6 次退避重试，控制台因此刷出成对的 503（实测 **12 条 = 6 × 2**）。

判据改成「**页面已有文档（URL 非空）才补注入**」：那遍落在空白页、随后被导航冲掉的注入不再产生请求，`did-finish-load` 那次照常工作。

### 「关于 SSiD」显示 v0.0.0

壳从不写 `SSID_SHELL_VERSION`，而 `dsh-ssid-panels` 的 host 半读它、缺失即回退 `'0.0.0'`。补上注入（取**产品版本**，与内核版本是两条线），落点与另外两处环境准备（MCP env、会话根隔离）同处 —— 必须在 Host 子进程构造之前，否则到不了它的 env 快照。

### 侧栏的 agent-opens 与 fs-watch 连不上

上游 `dsh-better-sidebar` 拿 `location.origin` 当 WebSocket 的 base，而桌面壳把页面放在 `dsh-app://app/` 下、`location.host` 是**字面量 `app`**，拼出的 `ws://app/sidebar/ws/…` 永远解析不了 —— 控制台持续刷连接失败，这两个功能静默退化（重连有退避、最终会自停，用户只看到报错、看不出功能已失效）。

改用壳注入的 `__DSH_TRANSPORT__.streamBaseUrl`（DSH 自己的下行 mux 也读同一个源）。**修复无法走 npm** —— 包不是我们的，发布权在上游 —— 所以按先例走厂商魔改随包内置，同时向上游提了 PR（[#797](https://github.com/omdsh-dev/DSH-better-sidebar/pull/797)，CI 三个 check 全绿）；作者采纳发版后，随包那份会撤掉、切回 npm 版本。

## 内置插件升级

| 插件 | 从 | 到 |
|---|---|---|
| `@max-null/dsh-chat-rail` | 0.6.8 | **0.6.9** |
| `ds-harness-remote` | 0.4.23 | **0.4.26** |
| `dsh-context` | 0.59.2 | **0.60.0** |

## 升级说明

- **覆盖安装即可**，会话、工作区与配置保留。内核未变，不需要迁移。
- **内置插件无需手动更新**：上表三个插件的升版本已随包内置。
- **单实例**：与仍在运行的其他版本不能并行；升级前先退出旧版。
- **不买证书的既定取舍**：安装包未签名，Windows 的「无法验证发布者」提示点「运行」即可。

## 下载与校验

资产见 [GitHub Release v1.1.4](https://github.com/Max-Null/seek-soul-in-darkness/releases/tag/v1.1.4)：

- `ssid-1.1.4-win-x64-unsigned.exe`（Windows NSIS 安装包）
- `ssid-1.1.4-mac-arm64-unsigned.dmg` / `.zip`（macOS，ad-hoc 签名，未公证）
- 附 `latest.yml` / `latest-mac.yml` 与各自的 blockmap

SHA256（`certutil -hashfile <文件> SHA256`）—— **以本页与 Release 页为准**：

- `ssid-1.1.4-win-x64-unsigned.exe`：
  `4316860E4E9F3E9E7DF7C8697104C23AB27A9DBDFBC68A9B8BBF3B2A52FCD5E3`（450099749 字节）
- macOS 两件资产由 Actions 构建，校验和以 Release 页上 GitHub 记录的 `digest` 为准。

说明：包内那份「更新日志」（关于 SSiD）不著录校验和 —— 把最终哈希写进包内会再次改变哈希。

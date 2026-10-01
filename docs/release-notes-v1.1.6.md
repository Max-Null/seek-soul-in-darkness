# v1.1.6 思灵（SSiD）

> 状态：**待发布**（2026-10-02）。内核跟进到 `0.2.0-rc.2`；同时让思灵与官方 DSH 桌面版**可以同时启动**。

## 这一版改了什么

### 一、内核跟进 `0.2.0-rc.1` → `0.2.0-rc.2`

官方 09-29 发布 rc.2（`latest` 与 `next` 都是它），本版跟进。升级后思灵与官方 DSH 桌面版跑同一版内核。

随包插件的 peer 无需改动：19 个 `@max-null/*` 声明的都是 `>=0.1.x <0.3.0` 这类显式上界，跨 minor 不失效。

### 二、与官方 DSH 桌面版共存

此前两者装在同一台机器上**不能并存**。两处成因：

**锁**：`app.name` 同为包名 `@deepseek-ai/dsh-desktop`，Electron 因此给两者派生同一个 userData 目录，单实例锁落在同一个 `lockfile` 上 —— 先启动的一方占住，另一方在 `single-instance.ts` 里静默 `app.quit()`，界面上就是「双击没反应」。

**数据**：两者共用 `<DSH_HOME>` 时，内核 `storage-json` 后端在两边都开同一批 unit（`workspace`、`schedule`…），而它对每个 unit 是**全量重写**整份文件 —— 后写的一方把对方那一份整个盖掉。实测跑过一次官方版之后，思灵的会话登记从 297 条（WorkStation 145）掉到 131 条（21），侧栏大批会话落进「未分组」。

本版从三处修掉：

| 面 | 做法 | 效果 |
|---|---|---|
| 单实例锁 | 思灵的 userData 让到 `%APPDATA%\ssid-shell`（首次自动迁移界面状态与平台会话所需的那几项），把官方默认目录整个让给官方版 | 两者不再互斥 |
| 存储根 | 思灵的 `storages/` 隔离到 `<DSH_HOME>/storages-ssid` —— 与会话根同款三层：注入 env + profile patch 覆盖 `storage-json` 的 `root` + 首次把旧根已有条目搬过去 | 两边各写各的登记，不再互相覆盖 |
| 协议 | 思灵注册 `ssid://`，把 `dsh://` 让给官方版 | 不再互相抢占注册表项 |

**跨会话记忆不受影响**：`memory.json` 与 `query-log.json` 由 `dsh-memory` 自建后端管理、root 取自 `DSH_HOME`，**不在**被隔离的那一层 —— 两个应用继续共用同一份记忆（这正是我们想要的：记忆的目的就是跨会话）。

## 升级说明

- **覆盖安装即可**，会话、工作区与配置保留。
- **首次启动会做两件事**：把 userData 迁到 `%APPDATA%\ssid-shell`（平台登录态若失效，重新登录即可）；把 `storages/` 里已有的条目**复制**一份到 `storages-ssid`。**旧目录一个字节都不删** —— 想回退，删掉新目录即可。
- **升级后即可与官方 DSH 桌面版同时运行**：两者各有自己的 userData、存储根、会话根与协议名。
- **不买证书的既定取舍**：安装包未签名，Windows 的「无法验证发布者」提示点「运行」即可。

## 下载与校验

资产见 GitHub Release **v1.1.6**（发布时补链）：

- `ssid-1.1.6-win-x64-unsigned.exe`（Windows NSIS 安装包）
- 附 `latest.yml` 与 blockmap

SHA256（`certutil -hashfile <文件> SHA256`）—— **以本页与 Release 页为准**：

- `ssid-1.1.6-win-x64-unsigned.exe`：`2CEE6AD41881832D8689DA7EE080C1832DD7C3AFBAF7A47722FE5937A4CEF368`（451,484,629 字节）

说明：包内那份「更新日志」（关于 SSiD）不著录校验和 —— 把最终哈希写进包内会再次改变哈希。

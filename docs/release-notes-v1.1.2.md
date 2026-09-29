# v1.1.2 思灵（SSiD）

> 状态：**待发布**（2026-09-29）。修 v1.1.1 没修到的**启动时环境注入时机**。内核不变（`0.2.0-rc.1`）。

## 这一版修的是什么

**MCP 全部失效、隔离根里的会话看不见** —— 同一个根因，手册里的坑 #59。

壳把三处环境准备写在 `DesktopHostProcess` **构造之后**，而 Host 子进程的 environment 是
**构造时的快照**：`host-process.ts` 把传入的 env 存成实例字段，spawn 时原样使用、只补
`ELECTRON_RUN_AS_NODE`，**不合并 live `process.env`**。于是这些赋值到不了 Host：

- `installSsidMcpEnv` 写的 `SSID_MCP_*` 到不了 → profile 里那几条 mcp-client 条目的
  command/args 求值不出来 → 条目按 patch 的 `disabled` 表达式**自动停用** →
  界面上没有任何 `mcp__*`（此前能用的也一起消失）；
- `applySessionRootIsolation` 写的 `SSID_SESSION_ISOLATED_ROOT` 到不了 → 内核仍读共享根 →
  隔离根里的历史会话整个看不见（**会话没丢**，是显示不出来）。

而 `host` 是在 `DesktopBackendController` 的工厂回调里创建、由 `backend.start()` 调用的，
所以「构造之后」比看上去更早 —— 两处 `backend.start()`（主启动、以及更新后恢复 Host）
都在其列。这也是同一版本时好时坏的原因：构造前 Host 若已经重启过一次，注入就侥幸生效了。

## 修复

把三处注入抽成 `prepareHostEnvironment()`，在**每一个** `backend.start()` 调用点之前完成。
新增 `apps/desktop/tests/host-env-order.spec.ts` 守住这条顺序 —— 该 spec 在修复前的代码上
**3 个断言全失败**，修复后通过（先验证它会失败，再验证它会通过）。

## 升级说明

- **覆盖安装即可**，配置、会话与工作区数据保留。内核未变，不需要迁移。
- **首启即生效**：MCP 条目会重新求值并启用，隔离根里的历史会话会重新出现。
- **会话的「未分组」另需一步**：退出思灵后跑 `node shell/scripts/heal-workspace-registry.mjs --apply`
  （在 `seek-soul-in-darkness` 下），把只落在隔离根、从未登记过的会话按 cwd 归回工作区。
- **单实例**：与仍在运行的其他版本不能并行；升级前先退出旧版。
- **不买证书的既定取舍**：安装包未签名，Windows 的「无法验证发布者」提示点「运行」即可
  （该提示由机器级策略 `Zones\0\1806 = 0` 触发，与包本身无关）。

## 下载与校验

- 资产（[GitHub Release v1.1.2](https://github.com/Max-Null/seek-soul-in-darkness/releases/tag/v1.1.2)）：
  - `ssid-1.1.2-win-x64-unsigned.exe`（NSIS 安装包）
  - `ssid-1.1.2-mac-arm64-unsigned.dmg` / `.zip`（macOS，ad-hoc 签名，未公证）
  - 附 `latest.yml` / `latest-mac.yml` 与 blockmap
- SHA256 —— **以本页与 Release 页为准**（打包完成后回填）。
- 说明：包内那份「更新日志」（关于 SSiD）不着录校验和 —— 把最终哈希写进包内会再次改变哈希。

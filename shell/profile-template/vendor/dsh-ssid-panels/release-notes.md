# v1.1.8 思灵（SSiD）

> 状态：**已发布**（2026-10-18）。内核跟进 0.2.1-rc.2；两处界面统计与列表缺陷修复。

## 这一版改了什么

### 一、内核跟进 0.2.1-rc.2

内置内核从 0.2.0-rc.2 升到 **0.2.1-rc.2**：`@deepseek-ai/dsh`、`dsh-desktop-host`、`dsh-desktop-runtime` 三个包同版。

0.2.1 删除了 `webRuntime` 服务，改由 `webStartup` 承担同一职责（信任主机清单）。profile patch 里 connection 那条注入随之换成 `[webStartup, webServer]` —— 405 的修法本身没变（仍要把 `webServer` 加回 inject），只是服务名跟着换。

### 二、随包插件跟进最新

| 插件 | 从 | 到 |
|---|---|---|
| `@changfenhuang/dsh-genui` | 0.11.3 | 0.13.0 |
| `ds-harness-remote` | 0.4.27 | 0.5.11 |
| `dsh-context` | 0.65.0 | 0.73.0 |
| `dsh-pocket` | 2.10.6 | 2.12.0 |
| `dsh-session-manager` | 0.6.2 | 0.7.2 |
| `dsh-better-sidebar`（vendor） | 0.26.1 | 0.28.0 |
| `@max-null/dsh-memory` | 0.15.1 | 0.16.0 |
| `@max-null/dsh-achievements` | 0.1.3 | 0.1.4 |
| `@max-null/dsh-jubensha` | 0.1.0 | 0.1.1 |
| `@max-null/dsh-skill-mcp-center` | 0.6.0 | 0.6.1 |

**`ds-harness-remote` 是这次升级的硬前提**：0.4.27 在 0.2.1 下会让 `/api` 的 peer 传递失败——界面卡在「Loading plugins…」，`/api/settings/describe` 返回 `Cannot read properties of undefined (reading 'signal')`。0.5.x 修掉了。这是本版唯一会让装版**完全不可用**的问题，也是它必须同批升级的原因。

`dsh-better-sidebar` 仍是 vendor 形态（0.28.0 是上游为 0.2.1 做的适配版，`inject` 里已无 `webRuntime`）。

### 三、修复：两处统计与列表

**① 「关于 SSiD」的会话数恒为 0** —— 它找的是 `session.jsonl.zstd`，而 0.2.1 的会话格式 v4 把日志改名为 `session.v4.jsonl.zstd`，于是永远数成 0（实际有 5 个以上）。现在按 `session*.jsonl.zstd` 匹配。同一处的「开关与生效状态不一致」提示也修了：状态文件不存在时以前一律当 false，而隔离其实早由 `SSID_SESSION_ISOLATED_ROOT` 生效，现在以环境变量为准。

**② Skill 面板少了一大半** —— 它只扫磁盘上的 `SKILL.md`，而用 `ctx.skills.register()` 注册的 skill（office 系列、剧本杀的 DM 手册、genui 等）没有文件，一律不显示。现在在磁盘结果之后追加一次运行时目录补齐。侧栏同时**按来源分组**（项目级 / 用户级 / 插件自带 / 内置 / 代码注册），「代码注册」那组标注「由插件在运行时注册，不可在此禁用」，组内条目不渲染开关——它们没有 `SKILL.md` 可写。

## 升级说明

- **覆盖安装即可**，会话、工作区、插件配置与跨会话记忆都保留。
- **本版没有改动壳代码**，变化来自内核、随包插件集与上面那两处界面修复。
- **两个第三方插件仍会停在 pending**：`dream-skin` 与 `video-preview` 的 `inject` 里写死了已被删除的 `webRuntime`，作者尚未适配 0.2.1。它们不影响界面与其余功能。
- **不买证书的既定取舍**：安装包未签名，Windows 的「无法验证发布者」提示点「运行」即可。

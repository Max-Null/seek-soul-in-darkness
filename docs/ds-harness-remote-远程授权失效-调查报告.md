# 调查报告：ds-harness-remote 远程授权失效（AUTH_INVALID）

> 日期：2026-09-17 ｜ 报告人：SSiD（思灵）开发侧
> 插件：`ds-harness-remote@0.4.14`（npm）
> 宿主：Windows 11 / Node 26.2.0 / DSH 内核 `0.1.5-rc.2`
> 服务器：`https://dsh.r2049.cn`
> 影响：远程（手机/异机）访问不可用；**本地不受影响**
> 本文件不含任何 token / refreshToken / 凭据值，仅含时间戳与文件结构

---

## 一、现象

两个独立宿主实例在启动时都打出同一条失败：

```
[dsh-remote] server control connection failed {"code":"AUTH_INVALID","retryable":false}
```

随后：

```
[dsh-remote] host runtime stopped
```

两个实例分别是：

| 实例 | 形态 | 结果 |
| --- | --- | --- |
| web 实例（`profiles/web`，源码形态 3080） | `node --import tsx/esm apps/cli/src/bin.ts web --port 3080` | 同样报 `AUTH_INVALID` |
| SSiD 桌面壳（`profiles/ssid`，打包内核） | Electron 壳 + `kernel-child.bundle.mjs`（63206） | 同样报 `AUTH_INVALID` |

两个实例的日志中，`host identity ready` 与 `client remote-mode identity ready` 都**正常打印**（即身份文件读到了、identity 初始化成功），失败只发生在与服务器的控制连接这一步。

## 二、本地凭据状态（脱敏）

`~/.dsh/remote/servers/<serverHash>/host/server-credentials.json`（结构）：

```json
{
  "schemaVersion": 1,
  "serverUrl": "https://dsh.r2049.cn",
  "deviceId": "01a05411-…-36fedd5fffba",     // host 身份
  "authorizationMethod": "owned_device",
  "account": "…",                             // 哈希值
  "accessTokenExpiresAt": 1789481834771,      // ← 已过期
  "refreshTokenExpiresAt": 1791893543541      // ← 仍在有效期内
}
```

关键时间对照（以调查时刻 `1789575941669` 为基准）：

| 时间戳 | 含义 | 与当前时间的关系 |
| --- | --- | --- |
| `1789481834771` | host accessToken 过期时刻 | **约 26 小时前已过期** |
| `1791893543541` | host refreshToken 过期时刻 | 仍在有效期内（约 26 天后） |
| 文件 mtime `2026-09-15 22:07:09` | 最后一次凭据写入 | 此后**再无写入** |

同目录下的 `client/server-credentials.json` 结构相同，其 refreshToken 亦未过期。

**由此可知**：不是「凭据文件缺失」或「身份损坏」，而是 **accessToken 过期后，refresh 流程未能完成**，且服务器以 `AUTH_INVALID` 拒绝（`retryable: false`，即不重试）。

## 三、值得注意的环境事实：两个实例共用同一 host 身份

`~/.dsh` 是**同一份**（web 与 SSiD 两个 profile 共用同一 DSH_HOME），因此：

- 两个实例读取的是**同一个** `host/device.json` / `host/server-credentials.json`；
- 两个实例的 `host identity ready` 打印出**相同的 deviceId 与 fingerprint**；
- 若 refreshToken 采用**一次性轮换**语义，一方刷新成功后另一方持有的旧值即失效——第二方再刷新就会得到 `AUTH_INVALID`。

**这一条是推断，不是已证实的结论**：我们没有抓取刷新请求的响应体，也无法区分「服务器主动撤销」与「轮换冲突」。列出它是因为它可复现、可验证，且与本机的实际部署形态（双实例共用 DSH_HOME）吻合。

## 四、影响面

| 能力 | 状态 |
| --- | --- |
| 本地 web（127.0.0.1） | **正常** |
| 本地 SSiD 桌面壳 | **正常** |
| 远程/手机访问（经 `dsh.r2049.cn`） | **不可用** |
| 宿主其它功能 | 不受影响（`host runtime stopped` 只终止远程宿主运行时，进程本身继续） |

排查过程中确认：该失败**不阻塞宿主启动**——同一次启动里 web 服务器随后照常监听并打印访问 URL。

## 五、期望的行为（建议）

1. **错误可自解释**：`AUTH_INVALID` 之外，最好能区分「凭据过期且刷新被拒」与「设备已被撤销」，并给出人类可读的下一步（例如「请重新授权」）。
2. **提供重新授权入口**：当 refresh 被拒时，从 UI/CLI 能直接发起一次重新授权（`owned_device` 或账号方式），而不必手工删除 `~/.dsh/remote/` 下的文件。
3. （若确为轮换冲突）**同机多实例的凭据共享语义**建议在文档中说明，或提供按实例隔离身份的开关。

## 六、复现与取证方法（供维护者参考）

- 启动任一宿主实例，观察 `[dsh-remote]` 前缀日志；
- 读取 `~/.dsh/remote/servers/<hash>/host/server-credentials.json` 的两个过期时间戳与文件 mtime；
- 对照当前时间判断是「未过期却失败」（服务器侧问题）还是「过期且刷新失败」（刷新链路问题）。

本案属于后者：**accessToken 已过期、refreshToken 未过期、刷新未成功**。

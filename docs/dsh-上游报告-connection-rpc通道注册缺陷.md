# DSH 缺陷报告：`client-connection` 缺 `webServer` 注入，第三方插件的 RPC 通道注册全线静默失败

> 日期：2026-09-17 ｜ 报告人：SSiD（思灵）开发侧
> 受影响构建：`dsh-web-runtime`（源码形态）＝ `dsh-v0.1.5-rc.2`
> 受影响面：所有用 `ctx.connection.rpc.handle()` 暴露宿主能力的第三方客户端插件
> 当前状态：根因已定位（含异常堆栈）；本地已用 `connection.fetch.register()` 绕过（治标）；**缺陷本身未修**
> 投递渠道备注：上游仓库已关闭 Issues，仅 Discussions 可用

---

## 一、影响

第三方客户端插件无法在浏览器与宿主之间建立私有 RPC 通道。用户可见症状是面板／界面「加载失败」，网络层得到 `HTTP 405`，而宿主日志中**没有任何报错**——排查需要从 405 反推到服务装配层。

`api-remotes` 的 Typert Remote 路径对第三方包是关闭的（它导入一份显式的官方 `./remote` 工件白名单），因此 `connection.rpc.handle()` 实际是第三方插件唯一的宿主能力暴露手段；它失效等于第三方插件的「宿主半边」整体不可用。

## 二、根因

`packages/client/connection/src/rpc-host.ts:178-181`：

```ts
return owner.effect(
  () => owner.webServer.register(route),
  `client-connection: ${channel} rpc channel`,
)
```

同一文件的 `get rpc()`（`rpc-host.ts:79-86`）把 `owner` 定为 **Connection 服务自身的 fiber**：

```ts
get rpc(): HostConnectionRpc {
  const owner = this.ctx
  return {
    handle: (channel, handler) => this.register(owner, channel, handler),
    ...
  }
}
```

而该插件的注入声明是（`packages/client/connection/src/index.ts:69`）：

```ts
export const inject = ['credentials']
```

`webServer` 不在注入列表里。cordis 的属性代理对未声明注入的属性访问直接拒绝，于是 `owner.webServer` 抛出：

```
Error: cannot get property "webServer" without inject
    at Fiber.<anonymous> (…/packages/client/connection/src/rpc-host.ts:179:19)
    at Proxy.register (…/packages/client/connection/src/rpc-host.ts:178:18)
```

异常发生在 `owner.effect(...)` 的注册回调内部，**通道因此从未注册**。

## 三、为什么表现为「静默」

1. **宿主侧**：错误只在 effect 回调内抛出，不影响其它插件，也不产生日志。
2. **插件侧**：`handle()` 返回 disposer，既有文档与示例都不要求检查返回值；调用方通常既不 `try/catch` 也不校验。
3. **网络侧**：请求落到静态服务的兜底路由，得到 405，与「路径不存在」难以区分。

## 四、405 的来源（可作为识别特征）

`packages/host/frontend-static/src/index.ts:125-128`：

```ts
// Non-GET/HEAD without a matching named route is 405 (fallback-only
// semantics) …
res.writeHead(405)
```

同一实例实测（2026-09-17，`dsh-web-runtime` 源码形态）：

| 请求 | 状态 | 含义 |
| --- | --- | --- |
| `POST /plugin-center/listInstalled` | **405** | 未匹配任何命名路由 → 静态兜底 |
| `POST /api/plugin-center/listInstalled` | **404** | `/api` 处理器存在，但不认识该通道 |

两条对照说明：既不是「路径没写对」，也不是「`/api` 没挂」——**是通道根本没注册**。

## 五、复现步骤

1. 在源码形态下启动 web 应用（`node --import tsx/esm apps/cli/src/bin.ts web --port <port>`）。
2. 安装任一第三方客户端插件，其宿主半边调用 `ctx.connection.rpc.handle('/foo', handler)`。
3. 浏览器发起 `POST /foo/bar`。
4. 观察：HTTP 405；宿主 stderr 无任何输出。

## 六、形态差异（重要线索）

| 运行时形态 | 同一份插件代码 |
| --- | --- |
| SSiD 桌面壳（打包内核 `kernel-child.bundle.mjs`） | **正常**：面板数据完整 |
| web（源码 `dsh-web-runtime`） | **405** |

插件代码、插件版本、DSH 版本号在两处一致，行为却相反 —— 差异在**装配形态**，不在插件。

## 七、我们已落地的绕过（供参考，非缺陷修复）

改用 `connection.fetch.register()`（`rpc-host.ts:139-156`）。它只写 Connection 自己的 `fetchRoutes` Map，**不触碰 `owner.webServer`**：

```ts
connection.fetch.register({
  path: '/api/<ns>',
  methods: ['POST'],
  requestBody: 'buffered',
  fetch: async (request) => { /* {endpoint, payload} → RpcResult */ },
})
```

配套两点：

- `connection` 服务在本插件 `apply` 时**尚未就绪**（实测 `ctx.get('connection') === undefined`），且 `ctx.plugin(P)` 不等待依赖，故必须用 `ctx.inject(['connection'], cb)` 获取；
- 老宿主（无 `fetch`）回退原逻辑通道，浏览器侧先试新路由、**收到 404 才回退**（新路由未注册时 `/api/*` 返回 404，根路径才是 405，两者可区分）。

绕过后的实测结果：`POST /api/skill-mcp` 与 `POST /api/plugin-center` 均 **200**，面板恢复正常，控制台 0 errors。

## 八、建议修法（任一即可）

1. 在 `client-connection` 的 `inject` 中补上 `webServer`——若宿主装配确实保证它在该 fiber 可用，这是最小改动；
2. 或在 `register()` 内改用 `this.ctx.get('webServer')`，并在取不到时**显式抛错**（让失败发生在插件作者能看到的地方，而不是让属性代理抛出）；
3. 无论选哪种，都建议让注册失败**可见**：`handle()` 在无法注册时同步抛错，或在宿主侧打一条 warn，避免同类问题再次以「405 + 无日志」的形态出现。

## 九、附件：探针原始输出

在插件 `dist` 内临时插入探针（`console.error` + 把 `handle()` 包进 `try/catch`），重启后从 stderr 捕获：

```
[probe:index] apply called (inject satisfied); {"get.loader":true,"get.tools":true,"get.skills":true,
  "proxy.connection":"throw","get.connection":false,"get.webServer":false,...}
[probe:rpc] constructor: ctx.get(connection) available = false
[probe:rpc] connection unavailable via immediate-ctx.get
[probe:rpc] inject callback fired; connection available = true
[probe:rpc] registering /skill-mcp via inject-callback
[probe:rpc] handle() THREW via inject-callback:
  Error: cannot get property "webServer" without inject
    at Fiber.<anonymous> (…/packages/client/connection/src/rpc-host.ts:179:19)
    at Proxy.register (…/packages/client/connection/src/rpc-host.ts:178:18)
```

（探针仅为取证，验证后已从 `dist` 回滚；`src` 中未保留任何 DSH 侧改动。）

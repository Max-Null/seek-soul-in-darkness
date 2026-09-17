# dsh-ssid-env 启动失败：原因与修复

2026-09-17，`@max-null/dsh-ssid-env` 0.1.0 首次进装机环境时把整个 SSiD 拉不起来，内核在装载插件树阶段中止。本文记录根因、修复与验证，供将来遇到同类症状时对照。

本文只留在源侧：`check-rules.manifest.json` 把 `REPORT.md` 排除在 vendor 比对面之外，因此它不随插件进 vendor、运行时实体或发版归档。

## 症状

装机版思灵启动只剩错误页，`~/.ssid/ssid.log` 报内核子进程失败：

```
kernel-child 启动失败：ssid: plugin tree failed to load: failed to apply loader entry include
(cordis:include): failed to apply loader entry dsh-ssid-env (@max-null/dsh-ssid-env):
cannot get property "systemPrompt" without inject
    at new apply (file:///…/profiles/ssid/node_modules/@max-null/dsh-ssid-env/lib/index.mjs:68:7)
    at Fiber.execute (file:///…/node_modules/@deepseek-ai/cordis/lib/index.js:1067:24)
```

「启动失败」而非「这个插件不生效」，是装载期抛错与调用期抛错的分界：插件作为 profile bundle 被加载时函数体即执行，抛错会让整棵插件树连同其后的条目一起失败。

## 原因

`lib/index.mjs` 的 `apply()` 读 `ctx.systemPrompt`，而顶部声明的是 `inject = []`：

```js
export const inject = []          // 0.1.0

export function apply(ctx) {
  const fact = detectSsid()
  if (fact === undefined) return
  ctx.systemPrompt.section({ … })  // ← 未声明即在此抛错
}
```

Cordis 的 Context 属性代理只放行已声明的服务，未声明的读取直接抛 `cannot get property "<name>" without inject`（`@deepseek-ai/cordis/lib/index.js:675`）。声明与访问必须成对：同目录的 `dsh-ssid-pwsh-retry` 用 `ctx.tools` 就写了 `inject = ['tools']`，是现成的对照。

与装机环境无关：任何环境加载 0.1.0 都会同样失败，dev 未被触发只是因为 0.1.0 从未在 dev 侧真正装载过。

## 处置

```diff
- /** 本插件只读环境、只贡献一段提示词，不依赖任何服务。 */
- export const inject = []
+ /** 贡献提示词段落需要 `systemPrompt`；未声明时 Cordis 的属性代理会直接拒绝访问。 */
+ export const inject = ['systemPrompt']
```

一处声明改动同时满足两个既有意图：依赖就绪才装载（`systemPrompt` 由 `@deepseek-ai/dsh-system-prompt` 在 `dsh-base` 层提供，任何 profile 都有），以及非 SSiD 环境下保持沉默（`detectSsid()` 返回 `undefined` 时 `apply` 不注册任何内容）。版本号随之升到 0.1.1。

## 验证

| 步骤 | 命令或判据 | 结果 |
|---|---|---|
| 复现原始故障 | 在真实 Cordis Context 上装载 `inject = []` 的等价插件 | 抛出**逐字相同**的 `cannot get property "systemPrompt" without inject` |
| 证明修复成立 | 同一 Context 上装载 0.1.1 | 注册成功：`{name: "ssid-env", order: -95}`，首行 `[运行环境] 你在 SSiD（思灵）桌面壳内运行…` |
| 契约测试 | `node --test`（`tests/contract.test.mjs`） | 3/3 通过 |
| 规则门 | `npm run check:rules` | 7 门全绿、0 违规（含 vendor-sync 三份全等） |
| 副本一致性 | `lib/index.mjs`、`package.json`、`tests/contract.test.mjs` 各四份 sha256 | 各组 4/4 一致 |

生效实体是 profile 内那份：`resolveBundleDir` 先查安装目录、再查 profile 目录，错误栈里的路径（`profiles/ssid/node_modules/@max-null/dsh-ssid-env/`）证实了这一点。因此重启思灵即可，无需重新 install 或重打归档。

## 遗留

`tests/contract.test.mjs` 用替身上下文锁定 `inject` 声明，但那只是复述声明本身——它拦得住「删掉声明」，拦不住「新增一处 `ctx.<service>` 访问而忘记声明」。真正的门应是机械扫描：插件源码里出现的 `ctx.<service>` 访问名，逐个核对是否列在 `inject` 中。当前七门检查器（`shell/scripts/check-rules.*`）还没有这一项。

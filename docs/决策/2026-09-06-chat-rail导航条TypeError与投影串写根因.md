# chat-rail 导航条点击报错：TypeError 根因 + chatRail 投影跨会话串写（2026-09-06）

> 状态：进行中（推断 · 2026-09-12）

> 用户报「web 版 dsh 导航条点击报错」，定位与修复记录。
> 环境：web 端（3080，`bin.ts web` 源码模式，checkout @ dsh-v0.1.2-rc.1）；插件 `@max-null/dsh-chat-rail@0.6.0`。

## 一、主 bug：TypeError（已修复 ✅）

### 现象

```
client.js:2049  [Violation] Permissions policy violation: unload is not allowed...
session.ts:391  Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'openState')
    at loadThrough (session.ts:391:14)
    at jumpToMessage (index.tsx:922:11)
    at onClick (index.tsx:1478:9)
```

### 根因

`dsh-chat-rail/src/client/index.tsx` `jumpToMessage()` 解构类方法后裸调：

```ts
const jumpLoadThrough = session.loadThrough   // ← 解构
...
await jumpLoadThrough(targetSeq)              // ← 裸调用，this === undefined（ESM 严格模式）
```

`Session.loadThrough` 是类方法（`packages/api/session-controller/src/client/sessions/session.ts:390`），
内部读 `this.openState`（第 391 行）→ `this` 为 undefined 即抛 TypeError。栈行号与源码逐行吻合
（`session.ts:391` / `index.tsx:922` 调用点 / `index.tsx:1478` 点击处理）。

### 修复（max-null-plugins/dsh-chat-rail）

- `src/client/index.tsx`：改为方法调用 `jumpSession.loadThrough(targetSeq)`（this 正确绑定到 session 对象）。
- `tests/client-nodes.spec.ts`：新增回归测试「invokes loadThrough as a method so the session this stays bound」
  ——修前红（有效捕获）、修后绿。
- L1：`pnpm test` 38/38、`typecheck` 绿、`pnpm build`（tsdown）成功。
- 运行时实体同步：源码 `lib/client.js(+.map)` → `~/.dsh/profiles/web` 与 `~/.dsh/profiles/ssid` 的
  `node_modules/@max-null/dsh-chat-rail/lib/`（三处 hash 一致）。
- L2 实测：Playwright 打开 3080 页面 → 打开「助手中心开发」会话 → 点击导航条消息项 →
  **console 0 error**（原必现 TypeError 消失）。

## 二、次级问题：chatRail 投影跨会话串写（未修复，根因在内核 host 侧 ⚠️）

### 现象

点击导航条不再报错，但出现：

```
[chat-rail] jumpToMessage: node "13:input-messagef3c8d0bf-…" not loaded after loadThrough(8)
```

（跳转探测失败 → 不滚动；且 rail 显示「ssid更新内核/来文档了/你重启就行」3 条不属于当前会话的消息。）

### 证据链（全部实测）

| # | 事实 | 证据 |
|---|---|---|
| 1 | 当前会话（session-3d86ef56…「助手中心开发」，8/24 起）真实用户消息 11 条：seq 18381「全家桶中还有哪些…」/ 32484「社区有没有定时任务」/ 36015… / 88295「记忆与人格层」/ 90043 / 94217 / 95509 / 97265 / 106624「开干」 | `session/page` 全量窗口（beforeSeq=139915, max=200），source.kind=user 过滤 |
| 2 | 该会话日志**不存在** 9/5 16:05-16:26 的任何事件（按 time 区间全量扫描 0 命中），**不存在** id=f3c8d0bf 的消息 | `session/page` records 窗口（2634 条）按 time/id 过滤 |
| 3 | rail（导航条）显示 9 条 = **[9/5 16:05-16:26 的 3 条 {seq 8/25411/66609, id f3c8d0bf/811f71af/21fb1de5}（rc.1 升级会话）] + [8/24-25 的 6 条真实消息（seq 88295-106624）]** | DOM `crl_item` 逐一读取（时间标签 1天前/8-25 与缓存一致） |
| 4 | 该会话投影缓存 `session_projcache/sessions/session-3d86ef56…json` 的 `rows.chatRail` 与 rail 内容**完全一致**（ver=6, seq=139914）；**其他行（title/todos/plan/turnOutline 等 23 行）全部正常**（title="助手中心开发" ✓） | 直接读 JSON |
| 5 | 删除该缓存文件 → 刷新页面 → **rail 复现同样 9 条**（非磁盘脏残留，宿主侧**每次打开会话实时生成**） | Playwright 实测 |
| 6 | 全盘扫描所有 `session_projcache/sessions/*.json`：**没有任何文件**含 id=f3c8d0bf | node 脚本 |

### 结论

- **数据错在宿主侧**：打开「助手中心开发」会话时，host 端对 `chatRail` 投影单元做冷重建/折叠时，
  其事件流中**混入了另一个会话（9/5 16:05-16:26 的 rc.1 升级会话）的 3 条 user/message 事件**，
  且异常地排在本会话消息之前（客户端 messages 数组 = [异会话 3 条] + [本会话尾部 6 条]）。
- **非 chat-rail 的 bug**：它的数据源（`useProjection('chatRail')`）与宿主投影 checkpoint
  （其余 23 行正确）之间出现单元级错位；目标 key/seq 在本会话不存在 → 客户端任何跳转策略都无法命中。
- **修复归属**：`deepseek-harness` 官方库 host 侧（`packages/session/{session-projection,session-projection-cache}`
  的冷重建/事件源拼接路径）——按工作区规则**只引用不改**，需反馈上游或由用户决策（是否在 SSiD dev
  侧进一步定位到具体 host 行号 / 打本地补丁）。

### 建议

1. **反馈上游**：根因描述 = 打开会话时 chatRail 投影 fold 事件流混入异会话事件（仅影响单投影单元，
   其余 checkpoint 行正常；删缓存可复现）。
2. 用户侧临时手段：无（缓存删除无效，问题在运行时生成侧）。
3. 后续可在 SSiD dev 环境（能重启、能加日志）打 host 侧日志，定位冷重建时事件源拼接的确切路由。

## 二·补 2026-09-07 复核：串写未重现（缓存已为正确 12 条）⚠️ 修正性证据

> 9/6 结论「每次打开会话实时生成串写」需按本节修正定级：**已观察到的是一次可复现的异常，
> 当前缓存/日志层已一致为正确数据，未再重现**。

### 复核操作

1. **原始日志逐条核对**（多帧 zstd 解码：frame magic `28 B5 2F FD` 逐帧切分后 `zstdDecompressSync`；
   6646 帧 / 8910 行）：会话 3d86ef56 的 `user/message`（source.kind=user）事件 = **12 条**：
   seq 8 / 18381 / 32484 / 36015 / 44730 / 77371 / 88295 / 90043 / 94217 / 95509 / 97265 / 106624
   （首条 time=1787589516330，尾条 106624「开干」）。
2. **当前投影表缓存**（`~/.dsh/storages/session_projcache.json`，tables.sessions[3d86ef56].rows.chatRail，
   ver=6 seq=139913）的 messages = **12 条，与日志逐条一致**（id/time/text 全对）——**9/6 的
   「9 条 = 3 异会话 + 6 本会话」组合已不存在**。
3. 9/6 的串写版本存档仍在 `session_projcache/sessions.bak-2026-09-06/session-3d86ef56-….json`
   （可复查：ver=6 seq=139914，9 条）。
4. 缓存自愈时间窗：9/6 晚（删缓存复现 9 条）→ 9/7 0:46（首次读取时已 12 条正确）。期间 web host
   持续运行 + SSiD dev 首启（0:42）+ 会话文件同步（0:48）——**未定位到确切自愈触发方**。
5. **局限**：12 条正确结论基于「日志层 + 投影缓存层」静态核对；SSiD dev UI 无法打开该会话
   （侧边栏列表窗口限制 + 名称搜索无全文索引），web(3080) 端 token 不可得，**未做 UI 层复测**。

### 定级修正

- 9/6：**可稳定复现**的串写异常（删缓存后刷新复现），影响单投影单元。
- 9/7：**未重现**；缓存已正确。列入「疑似竞态型异常（与特定打开时序/并发会话活跃有关）」，
  反馈上游时按「竞态 + 待稳定复现配方」描述，**不再断言必现**。
- 机理候选（代码已核对）：投影 restore 为 per-session 事件流 + seq 连续校验（不跨会话喂事件）；
  植入点候选 = session-persistence `readFrom(id, floor)` 或 cold-read 调用方的事件窗口拼接
  （`packages/session/session-projection-cache` / `packages/api/session-controller` 冷路径），
  待 host 侧日志定位。

## 二·补二 2026-09-07 跳转四件套（插件侧闭环 ✅，非本文件主案）

- 用户大会话实测暴露四项：近距也先加载 / 首条点击无效 / 滚到后仍显示加载中 / rail 滚动条闪现。
- 归属结论：**均非 DSH 升级 bug**——插件侧缺陷被 rc.1 的 `loadThrough` 跳转 API + 异步窗口装配
  「放大」：①无官方 `TurnNavigator` 的 loaded/unloaded 二分（适配瑕疵）②`scrollToRow` 的
  `target<0 return` 使文档头部行（首条）无法落位（长会话必现，测试盲区——上轮 L2 只验
  「不报 TypeError」未验「滚到位」）③busy 状态覆盖跳转全程（含滚动后稳定性验证）④CSS 滚动条
  随粘性 busy 行闪现。
- 参考（官方）：`packages/client/ui-chat/src/client/chat/{ChatView.tsx,TurnNavigator.tsx}` 的
  `navigateToTurn`（loaded→`anchorElement`+滚动；unloaded→`loadThrough`）；
  锚点 key 规则 `conversationContextKey`（`${kind.length}:${kind}${id}`——**13:input-message 未变**）。
- 修复与完整证据链见插件仓库
  `max-null-plugins/dsh-chat-rail/docs/verification/验证记录-2026-09-07-chat-rail修复链L2.md`
  （回归测试 +4、41/41、L2 实测 scrollTop/loading/scrollbar 数据、0.6.1 发版清单）。

## 三、涉及文件

- `max-null-plugins/dsh-chat-rail/src/client/index.tsx`（修复 + 行号 909-922）
- `max-null-plugins/dsh-chat-rail/tests/client-nodes.spec.ts`（+1 回归测试）
- `max-null-plugins/dsh-chat-rail/lib/client.js`（构建产物，已同步 web/ssid profile 实体）
- `C:\Users\MaxNull\.dsh\storages\session_projcache\sessions.bak-2026-09-06\session-3d86ef56…json`（串写缓存备份）

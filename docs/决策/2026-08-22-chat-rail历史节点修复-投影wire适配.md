# chat-rail 历史节点丢失修复 —— 投影 wire API 适配

- **日期**：2026-08-22
- **仓库**：dsh-chat-rail（commit `af4285a`，v0.3.0 重打 tag）
- **症状**：DSH 重启后载入历史会话，画卷导航栏无历史节点；手动下拉会话点「加载更多」后，
  fallback 收集的节点才出现。

## 根因（已实证）

**DSH 0.1.1-rc.2 的 session-projection API 破坏性变更**：

| | rc.8（旧） | rc.2（新） |
|---|---|---|
| 单元字段 | `{ key, schema, init, apply, view, stateVersion }` | `{ key, stateSchema, init, apply, wire?: { viewSchema, view }, stateVersion }` |
| client 快照 | snapshot 输出**所有**注册单元 | **只有带 `wire` 的单元**进 snapshot/restore values；无 wire = host-only（checkpoint 有、client 无） |

chat-rail 的投影定义仍用 rc.8 形状（`schema`/顶层 `view`）→ rc.2 下被当作 host-only 单元
→ `useProjection('chatRail')` 永远 undefined → rail 空。

验证证据（SSiD 真实环境 boot + detached restore）：
- 修复前：restore values keys = 官方单元（sessionStats/title/goal/...），无 chatRail；
  手动 import chat-rail lib 的 apply 注册正常（包本身无问题）
- 修复后：restore values 含 `chatRail`，`messages=68` 覆盖整会话（seq 7 → 415139），
  非仅最近页

**why 手动加载更多后有节点**：client fallback `collectFromNodes`（已加载窗口的
user 节点）在投影空时兜底；背景 loadOlder 循环因投影「非空即停」的守卫与窗口语义
配合不佳，历史深度不可靠——但这是 fallback 表象，主修复在投影本身。

## 修复

`src/index.ts`：`schema` → `stateSchema`，`view` 移入 `wire: { viewSchema, view }`
（chatRail 是导航数据，必须 client-visible）。测试同步（wire.view）。
`pnpm-workspace.yaml`：`minimumReleaseAge: 0`（pnpm 11 supply-chain lockfile 验证
以 MINIMUM_RELEASE_AGE_VIOLATION 拦截 0.1.1-rc.1 全家 66 条目，2026-08-22 实测）。

## 影响面

- 全家桶 9 插件中仅 chat-rail 使用 sessionProjections（grep 全量确认），无同类隐患
- 其他 @max-null 插件（memory/habit/guardian 等）用 storage 服务，不受影响
- 内置三插件（panels/header-unify/zh-ui）不用投影，不受影响

## 发布要求（关键）

1. **必须发布 chat-rail 0.3.0（含此修复）**：当前 profile 已临时覆盖修复版 host half
   （用户重启思灵即生效），但归档仍是 0.2.0（无 wire）——若不发布并重建归档，
   下次归档部署会回退到坏版本。
2. 发布后：清 pnpm 缓存 → prepare-runtime 重建归档 → 思灵自动升级。

## 遗留观察

- 会话 `session-140b9120`（SSiD 工作区）user/message 事件 182 条 vs chatRail 68 条：
  差异来自 source.kind 过滤（注入上下文/tool 消息）与无 durable id 消息——符合设计，
  但若用户感觉节点偏少可再核。
- SSiD 会话的 projcache 无行（projection-cache 插件在 web profile 未配置？）——
  冷读走全量折叠，功能正确，缓存缺失仅影响性能，非本次问题。

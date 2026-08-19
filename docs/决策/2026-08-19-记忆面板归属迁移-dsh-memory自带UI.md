# 记忆面板归属迁移 + 工作区路由：dsh-memory 自带 client UI

> 日期：2026-08-19
> 状态：**已决策，实施中**
> 关联：`docs/设计/2026-08-16-记忆UI面板-实现设计.md`（当时结论：Typert remote 独立包不可做、面板落 SSiD 侧——**该前提已过时**：dsh-memory 0.1.x 已自带 MemoryGateway remote，client 数据通道成立）

---

## 一、用户反馈（两轮）

1. 记忆的面板应该跟随 dsh-memory，放在 dsh-ssid-panels 不合适 → **已实施**（0.3.3 自带 client UI，侧栏 tab + 设置页兜底入口）
2. **工作区语义**：设置页/侧栏都保留"工作区 tab 显示当前会话工作区的 project 记忆"；未选择工作区时显示"未选择工作区"；术语统一用「工作区」（不用「项目」）

## 二、现状与问题

| 项 | 现状 |
|---|---|
| 记忆 UI（MemoryView） | ✅ 已迁至 dsh-memory 自带（remote.memory 直连） |
| **project 记忆路由** | ❌ 引擎固定 `process.cwd()/.dsh/storages`——**未真正跟随工作区**（会话切换 workspace 不感知） |
| 术语 | 「项目」与「工作区」割裂 |

## 三、工作区路由机制（读代码实证）

| 层 | 取 cwd 的路径 |
|---|---|
| 工具执行 | `exec.agent.session.header.cwd`（`tool-fs/session-cwd.ts` 先例——fs 工具已按会话工作区路由） |
| 侧栏 tab | `TabComponentProps.scope.cwd`（SessionScope） |
| 设置页 | `sessions.list 快照 byId[current].cwd`（SessionSummary.cwd，host 侧 summary 实证） |

## 四、实施清单（0.3.4）

### engine.ts：project 按 cwd 路由
| # | 改动 |
|---|---|
| 1 | `projectRootFor(cwd)` = `join(cwd, '.dsh', 'storages')`；project 域按 cwd 懒打开 + 缓存（Map<cwd, facility>，backend 名 hash cwd 防重名） |
| 2 | 所有方法加 `projectCwd?` 参数（调用级，支持多会话并发各自工作区）：remember/list/search/forget/setStatus/setInjected/update 的 project 分支按 cwd 路由；无 cwd → project 部分为空 |
| 3 | reload：global + 全部已开 project 域重开 |

### index.ts：工具层
| # | 改动 |
|---|---|
| 4 | 各工具 `execute(args, exec)` 取 `exec.agent?.session?.header?.cwd` 传给 engine |

### remote.ts：面板通道
| # | 改动 |
|---|---|
| 5 | remote 方法加 `cwd?` 参数（list/confirm/forget/setInjected/update/reload） |

### client/index.tsx：面板
| # | 改动 |
|---|---|
| 6 | MemoryView 加 `cwd?: string`：侧栏传 `scope.cwd`；设置页传 `sessions 快照 byId[current].cwd`（渲染时读快照） |
| 7 | 无 cwd（未选工作区）：工作区组显示「未选择工作区」占位 |
| 8 | 文案：`nsProject` → 「工作区」/「Workspace」，统一术语 |

## 五、验证

- [ ] dsh-memory：typecheck + vitest（新增按 cwd 路由单测：两个 cwd 的 project 记忆互不可见）
- [ ] SSiD dev：侧栏工作区 tab 显示当前会话工作区记忆；未选工作区显示占位
- [ ] 设置页：工作区 tab 同样跟随当前会话
- [ ] 工具：会话 A（cwdA）memory_save → 会话 B（cwdB）不可见；同 cwd 可见

## 六、风险

| 项 | 说明 |
|---|---|
| 多会话并发 | cwd 是调用级参数，subagent 各会话各自 cwd ✓ |
| 旧数据 | 旧 `process.cwd()` 根下的 memory_project.json 不再读取（工作区路由后）——旧文件保留不删 |
| 术语变更 | 面板/工具描述/self 描述统一「工作区」

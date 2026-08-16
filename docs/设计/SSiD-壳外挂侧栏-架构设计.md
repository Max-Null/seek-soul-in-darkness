# SSiD 壳外挂侧栏（第四列）架构设计

> 日期：2026-08-16
> 状态：设计（**实例之一**，非壳的全部——见 [`SSiD-壳级能力设计.md`](SSiD-壳级能力设计.md) 的原则）
> 触发：回应「SSiD 壳能否给 DSH 外挂第四列」
> 结论：能。这是「壳做 DSH+插件解决不了的事」的一个具体解法，不是唯一形态。

---

## 一、为什么需要外挂侧栏（而非 DSH slot）

DSH 的布局骨架是**三段写死**（`sidebar` / `conversation` / `details` + `shell.overlay`），插件不能新增第四列。而 SSiD 有一批面板：

- **记忆面板**（读 host `ctx.memory`）
- **状态面板**（Guardian 触发线监控）
- **计划面板**（plans 列表）

这些面板的共同点：**要读 host 数据**（不只 UI），且**要固定一列**（不是临时浮窗）。DSH 的 slot 系统对这两点都卡：

| 卡点 | 原因 |
|---|---|
| 读 host 数据 | Typert remote 需 monorepo 构建，独立插件做不了 |
| 固定列 | root 的 4 子槽位写死，不能新增 |

## 二、外挂侧栏的架构

```
Electron 主窗口
├── BrowserView A：DSH 官方 loopback UI   ← 内核，纹丝不动
└── BrowserView B：SSiD 侧栏面板          ← 壳外挂的"第四列"
```

- **BrowserView A**：加载 DSH 的 loopback URL（`http://127.0.0.1:<port>/`），就是官方三段布局。
- **BrowserView B**：加载 SSiD 自己的面板（本地 React/Vue 应用，或另一个本地 URL）。
- 两个 BrowserView 由 Electron main 的 `setBounds` 定位，SSiD 壳管理侧栏的显示/隐藏/宽度（类似 fractal 的面板列管理）。

## 三、数据通道：壳的 IPC 桥（不经 Typert）

关键：**壳在 Electron main 进程里 boot 了 DSH Host**，所以壳能直接访问 host 的 Cordis 服务：

```
BrowserView B（SSiD 侧栏）
   ↑ IPC（Electron contextBridge / ipcRenderer）
Electron main
   ↑ 直接访问 hostCtx.memory.list() / search() / confirm() / forget()
DSH Host（ctx.memory = dsh-memory 的 MemoryEngine）
```

- 侧栏要列记忆 → 通过 IPC 调 `main` 的 `listMemories()`，main 直接 `ctx.memory.list()` 返回。
- **完全绕过 Typert remote**，不受「独立插件边界」约束。

## 四、与 DSH 的关系（守原则）

- **不改 DSH 源码**：BrowserView A 加载的是官方 loopback UI，DSH 三段布局原样不动。
- **不碰 DSH 的 slot**：外挂侧栏是壳自己的 UI，不走 DSH 的 slot 系统。
- **跟随 DSH 更新**：DSH 升级，loopback UI 变，侧栏照常外挂，零冲突。

## 五、SSiD 面板的最终落点

| 面板 | 落点 | 数据通道 |
|---|---|---|
| 记忆面板 | 壳外挂侧栏 | 壳 IPC → ctx.memory |
| 状态面板（Guardian） | 壳外挂侧栏 | 壳 IPC → guardian 状态 |
| 计划面板 | 壳外挂侧栏 | 壳 IPC → plans 文件 |
| 草稿润色 | DSH slot（`conversation.input.left/right`） | 独立插件 + remote（见下） |
| 皮肤 | DSH slot（dsh-skin 模式） | 独立插件 + localStorage |

> 注：草稿润色是"按钮 + 调 LLM"，LLM 调用走 host 侧 remote（可独立包）；记忆面板是"读 host 存储"，走壳 IPC。两者通道不同，别混。

## 六、结论

**SSiD 的"第四列"不是改 DSH，而是壳外挂**。这既守住了「内核不改 DSH」的原则，又拿到了「分形式固定右侧列」的体验，还绕开了「Typert remote 独立包做不了」的坑。这是 SSiD 作为"聚合平台 + 壳"的最关键一块拼图。

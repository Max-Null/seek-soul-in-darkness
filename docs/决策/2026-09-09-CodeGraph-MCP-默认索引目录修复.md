# CodeGraph MCP 默认索引目录修复（v0.2.2）

> 日期：2026-09-09 ｜ 触发：AI 中台项目组问题反馈（本机 SSiD 用户）
> 相关：`docs/决策/2026-09-07-升级部署覆盖用户层修复.md`（用户层保留）、
> 状态：进行中（推断 · 2026-09-12）

> `docs/决策/2026-08-24-Playwright-MCP-预制-实施方案.md`（预制 MCP 模式）

## 1. 反馈与现象

反馈原文要点（`SSiD-CodeGraph-MCP-问题反馈.md`，2026-09-09）：

| 现象 | 后果 |
|---|---|
| 首次调用 `codegraph_*` 超时 `MCP error -32001`，进程停在 `index_parse` 8 分钟以上、内存 900MB+ | 首次体验差，易误判工具损坏 |
| 索引产物收录 5000 条 `AppData\...`（撞 `--max-files` 默认上限 5000） | 资源浪费，索引一堆无关文件 |
| 查询项目符号（`SdkApiService`）返回 Chrome 扩展的 JS | 静默失效：工具「有响应」但结果与项目无关 |

根因（v0.2.1 出厂注入，本机核对仍原样存在）：

- `shell/main.mjs`：`process.env.SSID_MCP_CG_WS = process.env.SSID_MCP_CG_WS || homedir()`
- `shell/profile-template/cordis.patch.yml`：`cwd: !!js 'process.env.SSID_MCP_CG_WS || ""'`

即未定制时 CodeGraph 引擎的 workspace 就是**用户主目录**——而主目录里没有代码仓库。

## 2. 为什么报告的建议 1 不可行（架构约束）

报告建议「默认值改为会话工作目录」。核对 DSH 实现后确认**做不到**：

- `dsh-mcp-client` 是 **profile 级 loader 条目**（`cordis.patch.yml` 顶层 `insert`），
  一个 MCP 进程服务**所有会话**；`cwd` 在进程 spawn 时固定
  （`packages/mcp/mcp-client/src/transport.ts` 把 `config.cwd` 直接交给
  `StdioClientTransport`）。
- 会话工作目录是**每会话**的运行时值，MCP 进程既感知不到，也不能在会话之间切换。
- 即便改成 agent-preset 级挂载，也会变成「每会话一个索引引擎」——
  按报告的 700–900MB/索引计，内存不可接受。

另有两个实测约束：

- `cwd: ''`（空字符串）会经 MCP SDK 直接传给 `spawn`，**实测 ENOENT**——
  所以不能简单「不设默认值」，必须给一个非空目录。
- 引擎 CLI 支持 `--workspace`（可重复）、`--exclude`（可重复）、`--max-files`、
  `--profile`、`--graph-only`；工具 `codegraph_index_directory {path}` 可索引任意目录。

## 3. 采用的方案

**出厂不再指向用户主目录；boot 前由壳解析一次索引目录，解析不到就停用该条目。**

### 3.1 解析优先级（`shell/lib/codegraph-adapt.mjs`）

1. `SSID_MCP_CG_WS` 环境变量（高级用户/脚本显式指定）
2. `~/.ssid/codegraph.json` 的 `workspace`（SSiD 侧稳定入口，含首次引导的选择）
3. **最近会话探测**：扫 `$DSH_HOME/sessions-ssid`、`$DSH_HOME/sessions` 下的
   `session.jsonl.zstd`，按 mtime 降序取第一个 header `cwd` 仍可用的会话
   （只解第一个 zstd 帧，成本 ~KB 级；扫描规则与 `dsh-ssid-panels` 同源）
4. 都没有 → `workspace = null` → **条目停用**

「可用」判定 `isUsableWorkspace()` 显式拒绝：不存在的目录、**用户主目录本身**、
**主目录的祖先**（`C:\Users` 这类——等于把整个用户区当项目索引，正是本次事故）。

### 3.2 停用与启用

模板 patch 的 codegraph 条目带条件：

```yaml
      disabled: !!js 'process.env.SSID_MCP_CG_ENABLE !== "1"'
```

壳按解析结果设 `SSID_MCP_CG_ENABLE`（`'1'` / `'0'`），并**总是**设
`SSID_MCP_CG_WS`（未适配时给占位目录）——空 cwd 会让 `spawn` ENOENT。
`disabled` 的 `!!js` 求值走 `vendor/loader/src/config/entry.ts:104` 的通用
entry 路径（`isJsExpr(options.disabled)` → `evaluate(...)`），insert 子条目同样适用。

### 3.3 首次引导（可跳过）

未适配且用户尚未做过选择（`~/.ssid/codegraph.json` 无 `decided`）时，boot 前弹一次
选择框：选目录 → 落盘并启用；跳过 → 落盘 `decided: true` 并保持停用。
用户之后仍可在「设置 → MCP」里改 cwd / 启停（`dsh-skill-mcp-center` 支持热更新）。

### 3.4 出厂保护参数

即使索引目录被改到项目根，也不进这些目录（报告建议 3）：

```
--exclude node_modules --exclude .git --exclude AppData --exclude target
--exclude dist --exclude build --exclude .venv --exclude __pycache__
```

`--max-files` 保持引擎默认（5000）——撞上限本身是「索引范围没配对」的信号，
出厂替用户调大会掩盖问题。

## 4. 附带修复：升级不再打回用户对出厂 MCP 的改动

**缺陷**：`mergeUserPatch` 以模板为基线，只把「模板 insert 块内不存在的用户子条目」
追加回去；**同 id 子条目一律以模板为准**。于是用户在 MCP 管理页改的 cwd / 启停
（写在 profile 根的 `cordis.patch.yml`）会在下次升级部署时被打回。

**修复（三方合并）**：部署时把本次归档模板原文缓存到
`~/.ssid/template-cordis.patch.yml`；下次部署以它为 **base** 比较：

- base 有同 id 子条目且用户文本 ≠ base ⇒ **用户改过** ⇒ 用用户版本替换模板的该子条目
- 文本与 base 相同 ⇒ 用户没改 ⇒ 用模板新版（模板升级照常生效）
- 无 base（首次引入该机制）⇒ 退化为 v0.2.1 行为（只保留用户新增条目）

`mergeUserPatch(old, template, base)` 第三参可选；`splitChildEntries` 增补
`start`/`end` 行号以支持文本级替换。升级报告的 `patchMerged` 增 `overridden` 字段。

## 5. 改动清单

| 文件 | 改动 |
|---|---|
| `shell/lib/codegraph-adapt.mjs` | 新增：解析优先级、可用性校验、会话 artifact 探测、配置读写、保护参数 |
| `shell/main.mjs` | 去掉 `homedir()` 默认；boot 前解析 + 设 env；首次引导弹窗；部署段缓存模板 base 并传三方合并 |
| `shell/profile-template/cordis.patch.yml` | codegraph 条目加 `disabled: !!js`；args 加 `--exclude` 保护清单；注释重写 |
| `shell/lib/profile-merge.mjs` | `mergeUserPatch` 三方合并；`splitChildEntries` 返回行号；升级报告加 `overridden` |
| `shell/tests/codegraph-adapt.spec.ts` | 新增 7 例 |
| `shell/tests/profile-merge.spec.ts` | 新增 4 例（用户改动保留 / 模板升级生效 / 无 base 退化 / 改动+新增并存） |
| `shell/package.json` | 增 `test`（聚合）与 `test:codegraph-adapt` |

## 6. 验证（L2，2026-09-09）

- **L1**：`npm run typecheck` 全绿；`npm test` 29/29（含新增 11 例）。
  注意 `tsconfig.json` 的 `include` 只含 `kernel.ts`/`module-resolution.ts`/`boot-smoke.ts`，
  `main.mjs` 不在类型检查范围内——改动靠 boot 实测覆盖。
- **停用路径**（不设 `SSID_MCP_CG_ENABLE`）：`npm run smoke` → `SSiD boot OK`，
  进程列表**无** `codegraph-server-*`（对照组证明该条目确实会被加载）。
- **启用路径**（`SSID_MCP_CG_ENABLE=1` + 空目录 workspace）：引擎日志
  `Workspaces: ["...cg-empty-ws"]`、`Excluding: ["node_modules", ".git", "AppData", ...]`、
  `Client: dsh-mcp-client 0.0.1`、`tools/list` 正常，boot OK——`--exclude` 被引擎接受，
  workspace 不再是用户主目录。
- **顺带清理**：发现一个 v0.2.1 遗留的孤儿 `codegraph-server` 进程
  （2026-09-08 启动、命令行 `--mcp` 无 `--workspace`、cwd 继承 = 用户主目录，父进程已退出），
  已终止。

## 7. 已知限制与待办

- **旧壳 × 新 patch 不一致**：正在运行的安装版（v0.2.1 壳）不设 `SSID_MCP_CG_ENABLE`，
  若其重启会用上已同步的运行时 patch → codegraph 显示为**停用**（安全方向）。
  v0.2.2 发版后壳与 patch 一并更新即一致。
- **首次引导只在「未适配且未 decided」时出现**；跳过后若之后探测到项目仍会自动启用
  （`decided` 只表示「问过了」，不是「永不用」）。
- **多项目用户**：MCP 是单例，索引目录只能有一个。跨项目需在 MCP 管理页切换，
  或给 `codegraph_index_directory` 传目标路径（引擎支持多 workspace，但出厂不预置）。
- 工具面保持 `--profile all`（42 工具，实测工具列表约 42KB 注入成本）——
  用户若嫌上下文重，可在 MCP 管理页把 args 改成 `--profile core|graph`。

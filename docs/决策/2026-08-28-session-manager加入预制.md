# dsh-session-manager 加入 SSiD 预制（2026-08-28）

## 背景与决策

- 用户要求：`dsh-session-manager` 加入 SSiD 预制插件。候选 6 个（hkkz9522/dream12347/Semidia/WSL043/wsxwj123/wuxiangru915），用户选定 **dream12347**（功能最全：删除回收站/恢复/彻底清除、归档恢复、活动统计、继续/暂停、未读标记、工作区分组排序、上下文压缩阈值）。
- **npm 现状**：`dsh-session-manager`（npm）是 **hkkz9522 的 0.1.2**，dream12347 **未发布 npm**——只能走 GitHub 源码 → tgz → **file: vendor** 模式（open-sea-skin 同款）。
- **本地已验证**：ssid profile `node_modules/dsh-session-manager` 实体 **0.2.2 已存在**（用户测试通过），且 **lib 含 nav-bubble 定制**（settings nav 齿轮→会话气泡 Lucide message-circle，已在上游 adfd547 #14 合入）。
- **当前脱链状态**（核实）：实体在 node_modules，但 **profile package.json 的 dependencies / bundles / pnpm-lock 均无它** ——归档重建（prepare-runtime 重装 node_modules）后即丢失。

## 接入方案（open-sea-skin 同款三步）

1. **vendor tarball**：以本地已验证实体为源 `npm pack` → `dsh-session-manager-0.2.2.tgz` → `shell/profile-template/vendor/`
   - 以**测试版实体**为源（0.2.2、nav-bubble 定制）——与用户测试产物一致；上游仓库 lib 为更新构建（多 28 行），但未经本地测试，暂不追平（后续可升级）。
2. **profile-template**：
   - `dependencies` 加 `"dsh-session-manager": "file:./vendor/dsh-session-manager-0.2.2.tgz"`
   - `dsh.profile.bundles` 加 `dsh-session-manager`（宿主插件靠 cordis.patch.yml insert，bundle 必须显式挂载——否则 kernel resolveBundleDir 找不到会崩，2026-08-22 教训）
3. **归档重建**：prepare-runtime（实体版本校验 0.2.2）→ 替换安装目录归档 → 思灵部署

## 注意

- 包名无 scope（`dsh-session-manager`），与全家桶 `@max-null/*` 命名不同——按上游原名接入，bundles id 也用原名。
- 上游未发布 npm，本接入为**本地 vendor 分发**；若上游发布 npm 可切换 `^x.y.z`。
- 测试版实体与上游 main lib 差异：nav-bubble 定制已入上游，其他 24 行差异待 diff 确认（不影响接入——以测试版为准）。

## 第三方插件升级（2026-08-28，用户规则：第三方升 npm 最新；本地超前以本地为准）

| 包 | 声明/现状 | npm latest | 动作 |
|---|---|---|---|
| dsh-dream-skin | ^0.4.14（归档实体 0.4.15） | **8.28.0** | ⬆️ 升 ^8.28.0（作者 08-27 真发，peer rc.6+ 兼容） |
| dsh-context | ^0.32.0 | **0.34.1** | ⬆️ 升 ^0.34.1（peer rc.7+，待验证 rc.2 兼容） |
| dsh-video-preview | ^0.1.1 | **0.1.4** | ⬆️ 升 ^0.1.4 |
| ds-harness-remote | ^0.3.0 | **0.3.36** | ⬆️ 升 ^0.3.36（peer >=rc.6 <0.2.0，兼容） |
| @changfenhuang/dsh-genui | vendor 0.9.5 | 0.9.6 | ✅ **已升 ^0.9.6**（实测：作者采纳魔改——0.9.6 含模板中心/探索成就/面板 dock 全部定制标记，index.js 字节一致，client.js 仅 minifier 微调） |
| dsh-context-doctor/open-sea-skin | vendor | 无/以本地 | 🚫 保持（本地增强） |
| 其余 | 一致 | 一致 | 不动 |

- 等待归档的重启：panels 0.1.9（已 bump）、session-manager 0.2.2（vendor tarball 已就位）随本次归档一起进入。
- **风险**：dsh-context 0.34.1 peer `^0.1.0-rc.7` 对 DSH 0.1.1-rc.2 的兼容性需 pnpm 实测（0.3.0 发布阻塞类似坑）；dream-skin 8.28.0 大跳需归档后冒烟。

## 执行步骤

1. pack tarball → vendor/
2. profile-template deps + bundles
3. 归档重建 → 部署 → 冒烟（会话管理入口出现、归档/回收站可用）

# 执行记录：dsh-node-appearance 加入 SSiD 预设插件

> 日期：2026-08-19
> 状态：已完成
> 执行人：MaxNull（AI 代执行）
> 关联：[2026-08-18-工作区内部插件与vendor同步约定.md](2026-08-18-工作区内部插件与vendor同步约定.md)、[2026-08-19-chat-rail-加入SSiD预设.md](2026-08-19-chat-rail-加入SSiD预设.md)

---

## 一、结论

`@max-null/dsh-node-appearance@0.1.0`（节点外观：按节点类型/工具名配色的可配置配色 + 思考过程显示开关）
已加入 SSiD 预设：发布模板（profile-template）补齐 vendor + 依赖 + bundle 声明。

**与 chat-rail 的差异**：chat-rail 已发布 npm（registry 依赖）；node-appearance **未发布 npm**
（npm 404 实测确认），按 dsh-ssid-panels 模式走 **vendor 本地分发**（`file:./vendor/...`）。

## 二、改动清单

| 文件 | 改动 |
|---|---|
| `shell/profile-template/vendor/dsh-node-appearance/` | **新增**：`lib/`（工作区最新构建产物）+ `package.json` + `cordis.patch.yml` |
| `shell/profile-template/package.json` | dependencies 加 `"@max-null/dsh-node-appearance": "file:./vendor/dsh-node-appearance"`；bundles 加 `"@max-null/dsh-node-appearance"` |
| 开发 profile（`~/.dsh/profiles/ssid`） | 原本已有（dependencies + bundles），**本次未改声明**；vendor 恢复为与 node_modules 一致的既有构建 |

## 三、验证结果

1. **构建产物三方一致**：工作区源码 `npm run build` → `lib/` 同步到模板 vendor，MD5 全等（tsdown 输出确定性已实测：连续两次构建 MD5 相同）。
2. **插件测试**：`npm test`（vitest）20/20 通过（palette 16 + config 4）。
3. **语法**：模板 package.json JSON 校验通过；`pnpm install` 在 dev profile 实测 exit 0。
4. **peer**：5 个 peer 全部由官方依赖树满足（`@deepseek-ai/cordis`、`dsh-client-runtime`、`dsh-client-ui-settings`、`dsh-client-ui-settings-plugins`、`dsh-settings`、`react`），无需补 MISSING_PEERS。
5. **发布路径**：prepare-runtime 重新打包时，全新环境无旧 store 快照，`pnpm install` 会把模板 vendor（最新构建）打包进运行时——**发布版即最新构建**。

## 四、重要发现：pnpm file: 依赖的 store 快照机制（坑）

调试中踩到的 pnpm 11 行为，记录备查：

- **node_modules 里的 file: 依赖副本 = pnpm store 的内容寻址快照（硬链接）**，
  **不是** vendor 目录的实时复制。
- lockfile 指纹（如 `10b771...`）是 **peer 组合指纹，与目录内容无关**；
  目录内容变化**不会**让 pnpm 重新打包。
- `pnpm install`（含 `--force`）、`pnpm update <pkg>`、删除 vendor 目录、
  删除 file+H++ 缓存目录、删除 store 内容文件——**都无法**让 pnpm 重新打包 vendor 目录；
  它总从 store 旧快照恢复 node_modules 副本。
- **结论**：vendor 内容更新后，**node_modules 不会自动跟随**。更新流程：
  1. 工作区改源码 → `npm run build`
  2. `robocopy <ws>/lib <vendor>/lib /MIR`（注意：**不要用 PowerShell `Copy-Item` 覆盖已存在目录**，会生成 `lib\lib` 嵌套，破坏目录结构——pnpm 对结构异常目录会 fallback 到 registry 解析，未发布包直接 404）
  3. 若需 dev 环境立即生效：**手动复制 lib 到 node_modules 副本**（覆盖硬链接），或等待下一次全新部署
  4. 发布版不受影响（全新环境直接打包新内容）

## 五、备注

- dev profile 的 node_modules/vendor/store 三方已恢复一致（既有构建，功能与最新构建等价——CSS 键集合 21 项完全一致，仅映射顺序差异）。
- 若未来 node-appearance 发布 npm，可把依赖从 `file:./vendor/...` 切换为 registry 版本，届时不再需要 vendor 同步。

## 六、升级：0.1.0 → 0.1.1（发布 npm，切 registry）

> 日期：2026-08-19，状态：已完成

**触发**：`@max-null/dsh-node-appearance@0.1.1` 发布 npm（2026-08-18 21:49，0.1.0 发布于同日 21:26）。
上轮备注中的"发布 npm 即切 registry"路径落地。

**改动**：

| 文件 | 改动 |
|---|---|
| `shell/profile-template/package.json` | dependencies：`file:./vendor/dsh-node-appearance` → `^0.1.1`（bundles 不变） |
| `shell/profile-template/vendor/dsh-node-appearance/` | **删除**（不再需要 vendor 分发） |
| `shell/profile-template/pnpm-workspace.yaml` | minimumReleaseAgeExclude 加 `@max-null/dsh-node-appearance@0.1.1`（发布 <7 天豁免） |
| dev profile（`~/.dsh/profiles/ssid`） | 用户已先行切换（deps `^0.1.1` + exclude 0.1.0/0.1.1 + install 完成）；本次清理孤儿 vendor 目录 |

**验证**：
- npm 0.1.1（node_modules 实装）与工作区源码构建 **MD5 全等**（index.js/client.js）——npm 包即最新源码
- 模板 JSON/YAML 语法通过；dev profile 已装 0.1.1，lockfile 为 registry 形式
- 0.1.1 测试 20/20 通过（vitest）
- **发布路径**：prepare-runtime 重新打包时从 registry 安装 0.1.1，不再依赖 vendor 目录

**影响**：node-appearance 从 vendor 分发转为 registry 分发（与 memory/chinese-thinking/guardian/habit/chat-rail 同模式）；
vendor 同步约定中该插件的条目不再适用（见约定文档更新）。

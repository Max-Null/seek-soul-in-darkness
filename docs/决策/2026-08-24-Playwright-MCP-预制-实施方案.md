# Playwright MCP 预制 - 实施方案

> 日期：2026-08-24
> 范围：SSiD 出厂预制（profile-template）+ 本机 profile 同步
> 关联：`docs/设计/SSiD-插件清单.md`（MCP 五通道 → 本次落地浏览器自动化通道）、`docs/决策/2026-08-19-预设技能包-落地方案.md`（prefab 模式参照）

## 1. 背景

用户在某个 DSH 会话中看到「playwright-core（全局 MCP 包内）」的表述，追问 DSH 是否有全局 MCP、为何 MCP 管理插件看不到。排查结论：

- 该表述指 **npm 全局安装的 `@playwright/mcp` 包**（`C:\Users\MaxNull\AppData\Roaming\npm\node_modules\@playwright\mcp`）——`playwright-core` 是它的依赖；
- 它同时被 **OpenCode 全局 MCP 配置**（`~/.config/opencode/opencode.json` 的 `mcp.playwright`）使用；
- **DSH 本身没有全局 MCP、也不内置任何 MCP 服务器**：`@deepseek-ai/dsh-mcp-client` 只是客户端桥，服务器需在 profile 配置中显式注册；`dsh-skill-mcp-center` 的 MCP 面板只枚举 DSH loader 里的 `mcp-client` 条目，因此看不到 OpenCode/全局 npm 侧的 MCP。

结论：DSH 的「预制 MCP」不存在官方概念，SSiD 从零落地自己的浏览器自动化 MCP 预制。

## 2. 决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| 预制形态 | **默认启用**（模板直接 insert，mcp-playwright 常驻） | 用户拍板：SSiD 开箱即得浏览器自动化能力 |
| 运行时 | **离线自包含依赖**：`@playwright/mcp` 精确 pin `0.0.79` 进 profile 依赖（归档构建时下载，离线可装） | SSiD 归档离线原则；避免 npx 每次联网解析 |
| node 定位 | SSiD 壳启动时注入 `SSID_MCP_NODE`（打包内置 node.exe → NVM v22.22.2 → PATH）与 `SSID_MCP_PW_CLI`（profile 内 cli.js 绝对路径） | 与 worker 分支 node 候选链同源；electron `execPath` ABI 不匹配不可用；MMCP 配置 `!!js` 只读 env，无运行时副作用 |
| 浏览器二进制 | **不随安装包发布**；首次使用需 `playwright install chromium`（约 150MB，按需下载） | 安装包体积与首装时长权衡；失败时 mcp-client `failOnStartupError: false`，面板显示未连接而非崩溃 |
| 模式 | `--headless` | 与用户 OpenCode 全局配置一致；SSiD 内使用以自动化为主，可见浏览器由用户自行改 args（Skill & MCP 面板可编辑） |

## 3. 改动清单

### 3.1 `shell/main.mjs`（启动注入，dev/打包共用）

在 bootKernel 前的环境准备段（`SSID_PNPM` 注入旁）新增：

```js
const mcpNodeCandidates = [
  process.resourcesPath ? join(process.resourcesPath, 'node', 'node.exe') : '',
  process.env.NVM_HOME ? join(process.env.NVM_HOME, 'v22.22.2', 'node.exe') : '',
  'node.exe',
]
const mcpNodeExe = mcpNodeCandidates.find((c) => c !== '' && existsSync(c))
if (mcpNodeExe) process.env.SSID_MCP_NODE = mcpNodeExe
const mcpPwCli = join(profileDir, 'node_modules', '@playwright', 'mcp', 'cli.js')
if (existsSync(mcpPwCli)) process.env.SSID_MCP_PW_CLI = mcpPwCli
```

注：`main.mjs` 是 dev 与打包版共同入口，本次改动**无需重打 kernel.bundle.mjs**；但 `SSID_MCP_*` 的注入发生在 kernel boot 前，`!!js` 求值（host 进程内）可见。

### 3.2 `shell/profile-template/package.json`

dependencies 追加（精确 pin，归档构建确定性）：

```json
"@playwright/mcp": "0.0.79"
```

### 3.3 `shell/profile-template/cordis.patch.yml`（出厂模板）

顶层插入：

```yaml
- insert:
    - id: mcp-playwright
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: playwright
        transport: stdio
        command: !!js 'process.env.SSID_MCP_NODE || "node"'
        args:
          - !!js 'process.env.SSID_MCP_PW_CLI'
          - '--headless'
```

### 3.4 本机 profile 同步（开发机立即生效）

- `~/.dsh/profiles/ssid/cordis.patch.yml`：同 3.3；
- `~/.dsh/profiles/ssid/package.json`：同 3.2；
- `pnpm install`（profile 目录，nodeLinker=hoisted，依赖提升到顶层 `node_modules/`）。

## 4. 首次使用（浏览器二进制）

```sh
# 开发机（任选其一，均在 profile 目录内解析本地 playwright）
cd %DSH_HOME%\profiles\ssid
node node_modules\playwright\cli.js install chromium
# 或
npm exec --yes playwright install chromium
```

安装版（打包后）：
```
"%DSH_HOME%\profiles\ssid\node_modules\.bin\playwright.cmd" install chromium
```

## 5. 验证

1. 重启思灵（或 dev dsh web）；日志出现 `prefab mcp node=…` 与 `prefab mcp cli=…`；
2. Settings → Skill & MCP 面板出现 `playwright` 卡片；
3. 新会话模型工具列表出现 `mcp__playwright__*`（browser_navigate / browser_snapshot 等）；
4. 浏览器缺失时面板状态为「未连接」，安装 chromium 后重连。

## 6. 发布链（归档配套动作）

- 本改动进入 SSiD 后：`pnpm run prepare-runtime` 重建 dsh-runtime 归档（新增 0.0.79 pin 依赖随归档下载）；
- 升级部署机制（归档版本升级 → profile 重部署）自动把新 patch 与依赖带到用户机器；
- `docs/设计/SSiD-插件清单.md` 的「MCP 五通道」行可补 Playwright 浏览器自动化通道状态为 ✅ 预制（后续版本）。

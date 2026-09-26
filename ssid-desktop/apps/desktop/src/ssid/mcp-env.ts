/**
 * SSiD 预制 MCP 的运行时环境注入（fork 版；与自建壳 `shell/main.mjs:1058-1156` 同源）。
 *
 * profile 的 `cordis.patch.yml` 里有四条 `@deepseek-ai/dsh-mcp-client` 条目，它们的
 * `command` / `args` 全靠这里注入的 env 求值；**env 缺失即 `disabled`**（patch 里的
 * `!!js '!process.env.SSID_MCP_PW_CLI'`），所以壳不注入 = 条目自动停用，不会让内核起不来。
 *
 * 必须在 `new DesktopHostProcess(...)` **之前** await 完——Host 子进程继承 `process.env`。
 *
 * | 变量 | 取值 |
 * |---|---|
 * | `SSID_MCP_NODE` | 打包内置 node → Homebrew(darwin) → NVM v22.22.2 → PATH 裸名 |
 * | `SSID_MCP_PW_CLI` | `<profile>/node_modules/@playwright/mcp/cli.js` |
 * | `SSID_MCP_CG_CLI` | `<profile>/node_modules/@astudioplus/codegraph-mcp/bin/codegraph-mcp.js` |
 * | `SSID_MCP_CG_WS` | CodeGraph 索引目录；未适配时给占位目录（空串会让 spawn ENOENT） |
 * | `SSID_MCP_CG_ENABLE` | `'1'` = 目录与 CLI 都就位 |
 *
 * ⚠️ node 候选链**刻意不用 `process.execPath`**：Electron 的 ABI 与标准 Node 不匹配，
 * 拿它跑 MCP 的 JS 会失败（自建壳踩过）。打包版优先用随包发布的 node。
 */

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  codeGraphConfigPath, readCodeGraphConfig, resolveCodeGraphEnable, resolveCodeGraphWorkspace,
  type CodeGraphWorkspaceSource,
} from './codegraph-adapt.ts'

/** 注入结果，供调用方落日志/诊断。 */
export interface SsidMcpEnvSummary {
  /** 解析到的 node 可执行文件；undefined 表示未找到（MCP 条目会回退裸名 `node`）。 */
  readonly node: string | undefined
  readonly playwrightCli: boolean
  readonly codegraphCli: boolean
  readonly codegraphWorkspace: string | null
  readonly codegraphSource: CodeGraphWorkspaceSource
  /** 写入 `SSID_MCP_CG_ENABLE` 的值。 */
  readonly codegraphEnabled: '0' | '1'
}

/** 注入所需的宿主事实。 */
export interface SsidMcpEnvInput {
  /** 当前 profile 目录（MCP CLI 与依赖都从这里解析）。 */
  readonly profileDir: string
  /** DSH_HOME（会话根在其下）。 */
  readonly dshHome: string
  /** profile 名（会话隔离根是 `sessions-<名>`）。 */
  readonly profileName: string
  /** 落日志钩子（省略则静默）。 */
  readonly log?: (text: string) => void
}

/**
 * 解析 node 候选链并返回第一个存在的。
 * @returns 绝对路径，或裸名 `node`/`node.exe`（交给 PATH 解析），全不可用时 undefined。
 */
function resolveMcpNode(): string | undefined {
  const bare = process.platform === 'win32' ? 'node.exe' : 'node'
  const candidates = [
    // 打包版：随包发布的 node（afterPack 注入到 resources/node/）
    process.resourcesPath === undefined ? '' : join(process.resourcesPath, 'node', bare),
    process.platform === 'darwin' ? '/opt/homebrew/bin/node' : '',
    process.platform === 'darwin' ? '/usr/local/bin/node' : '',
    process.env['NVM_HOME'] === undefined ? '' : join(process.env['NVM_HOME'], 'v22.22.2', 'node.exe'),
    bare,
  ]
  return candidates.find(candidate => candidate !== '' && existsSync(candidate))
}

/**
 * 把 MCP 相关 env 注入 `process.env`。
 * @param input - 宿主事实与可选引导回调。
 * @returns 注入摘要。
 */
export async function installSsidMcpEnv(input: SsidMcpEnvInput): Promise<SsidMcpEnvSummary> {
  const { profileDir, dshHome, profileName, log = () => {} } = input

  // ── node：MCP 引擎进程用的解释器 ──────────────────────────────────────────
  const node = resolveMcpNode()
  if (node !== undefined) {
    process.env['SSID_MCP_NODE'] = node
    log(`mcp node=${node}`)
  } else {
    // 不设也行（patch 里回退裸名 `node`），但值得记一条便于排查。
    log('mcp node: none found; MCP entries fall back to "node" on PATH')
  }

  // ── Playwright MCP CLI ───────────────────────────────────────────────────
  const pwCli = join(profileDir, 'node_modules', '@playwright', 'mcp', 'cli.js')
  const playwrightCli = existsSync(pwCli)
  if (playwrightCli) {
    process.env['SSID_MCP_PW_CLI'] = pwCli
    log(`mcp playwright cli=${pwCli}`)
  } else {
    log('mcp playwright cli missing (profile not redeployed yet?)')
  }

  // ── CodeGraph MCP CLI ────────────────────────────────────────────────────
  // 入口取自包的 `bin` 字段，是 `bin/codegraph-mcp.js`，**不是** `cli.js`。
  const cgCli = join(profileDir, 'node_modules', '@astudioplus', 'codegraph-mcp', 'bin', 'codegraph-mcp.js')
  const codegraphCli = existsSync(cgCli)
  if (codegraphCli) {
    process.env['SSID_MCP_CG_CLI'] = cgCli
    log(`mcp codegraph cli=${cgCli}`)
  } else {
    log('mcp codegraph cli missing (profile not redeployed yet?)')
  }

  // ── CodeGraph 索引目录 ───────────────────────────────────────────────────
  // 优先级：env → ~/.ssid/codegraph.json → 最近会话探测。
  // **不在这里问用户**：MCP 的 env 必须在 Host 启动前定，而对话框要等人点，
  // await 它会把 Host 启动卡死（见 ssid/codegraph-guide.ts 的记录）。引导挪到
  // Host 就绪之后，结果下次启动生效。
  const configPath = codeGraphConfigPath()
  const config = readCodeGraphConfig(configPath) ?? {}
  const resolved = resolveCodeGraphWorkspace({
    envWorkspace: process.env['SSID_MCP_CG_WS'],
    config,
    // 隔离根在前：会话存储隔离开启时（出厂预设）会话都落在隔离根。
    sessionRoots: [join(dshHome, `sessions-${profileName}`), join(dshHome, 'sessions')],
  })
  const workspace = resolved.workspace
  const source: CodeGraphWorkspaceSource = resolved.source

  // cwd 必须非空：空字符串经 dsh-mcp-client 直接传给 spawn，实测 ENOENT。
  // 未适配时给一个占位目录，条目本身由 SSID_MCP_CG_ENABLE 停用、不会启动。
  process.env['SSID_MCP_CG_WS'] = workspace ?? join(homedir(), '.ssid')
  // 目录与 CLI 都就位才算启用：只判目录会让「目录可用、CLI 缺失」的机器把条目置为启用，
  // 而模板 args[0] 随之求值为 null，整棵插件树加载失败。
  const codegraphEnabled = resolveCodeGraphEnable(workspace, codegraphCli)
  process.env['SSID_MCP_CG_ENABLE'] = codegraphEnabled
  log(`mcp codegraph workspace=${workspace ?? '(none)'} source=${source} cli=${codegraphCli ? 'present' : 'missing'} enabled=${codegraphEnabled}`)

  return { node, playwrightCli, codegraphCli, codegraphWorkspace: workspace, codegraphSource: source, codegraphEnabled }
}

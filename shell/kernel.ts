/**
 * SSiD 壳 —— DSH 内核启动（electron 主进程内直接 boot，单进程）。
 *
 * 学习 anywhere-labs 的 dsh-plugin-desktop（main.ts + profile.ts +
 * module-resolution.ts）：
 *
 * 1. electron 里 DSH 的 native addon 探测不到标准 Node 的 V8 embedder，
 *    `ctx.loader.internal` 为 undefined。解法不是 spawn 子进程，而是用
 *    Node 24 的纯 JS `registerHooks` 把 loader 发出的 bare specifier 的
 *    parentURL 改写到 profile 目录（module-resolution.ts）。
 * 2. 不用官方 `runProfile` —— 它会在 boot 后补挂 watch-only HMR 实例
 *    （web bundle 禁用了 HMR row，runProfile 靠它热重载 cordis.patch.yml），
 *    而 HMR 服务构造时要求 `ctx.loader.internal`，electron 里必失败。
 *    anywhere-labs 的做法是自己 `boot()`，不挂 HMR watcher：桌面壳改
 *    profile 配置重启即可。
 *
 * 单进程的收益：窗口/侧栏可以直接 `kernel.get('memory')` 同进程读 host
 * 服务，M1 的 memory 数据通道不需要跨进程桥。
 */

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  boot,
  composeEntries,
  healProfilesModuleFallback,
  initProfile,
  loadLayeredEnv,
  loadOptionalPatches,
  loadProfile,
  PROFILE_PATCH_FILENAME,
  resolveProfileDir,
} from '@deepseek-ai/dsh-app-boot'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import type { Context } from '@deepseek-ai/cordis'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { DSH_LAUNCH_ENVIRONMENT_KEY } from '@deepseek-ai/dsh-launch-environment'
import { installProfilePackageResolver } from './module-resolution.ts'

/** 诊断前缀。 */
const BIN_NAME = 'ssid'
/** SSiD 自己的 profile 名（聚合平台要有独立 profile 目录）。 */
const PROFILE_NAME = 'ssid'
/** SSiD profile 的 bundle 层 = DSH 官方 web 的两个 bundle。 */
const PROFILE_BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']
/** 空 root config 文件名（官方约定 cordis.yml）。 */
const ROOT_CONFIG_FILENAME = 'cordis.yml'
/** 会话遥测 row id（官方 profile-boot 的 DSH_TELEMETRY_DISABLED 开关目标）。 */
const TELEMETRY_ROW_ID = 'session-telemetry-otel'

/**
 * 内核内「重启 DSH」能力的服务键（字符串键，主进程同进程注入，插件经
 * `ctx.get(SSID_SHELL_RESTART_KEY)` 取得 `() => void`）。main.mjs 的
 * restartDsh（app.relaunch + kernel.shutdown）经 bootKernel opts.restart 注入；
 * 裸跑/测试未注入时该服务不存在，插件返回 restart-unavailable。
 */
export const SSID_SHELL_RESTART_KEY = 'ssid.shell.restart'

/** 壳层「快捷截图」能力（main.mjs 的 startScreenshotCapture 与
 *  applyScreenshotHotkey），经服务键注入内核，供 dsh-ssid-screenshot 的
 *  host 半调用（客户端按钮触发截图 / 设置保存后重注册快捷键）。
 *  bare dsh web（无 Electron 壳）不提供。 */
export const SSID_SHELL_SCREENSHOT_KEY = 'ssid.shell.screenshot'

/**
 * DSH 运行时来源解析结果：installAnchor（heal/loadProfile 的锚点）和
 * agent-presets root 随来源不同而不同。
 * - source（源码 checkout）：apps/cli/package.json + apps/cli/config/agent-presets
 * - bundled（内置 npm 闭包）：node_modules/@deepseek-ai/dsh/package.json + 同包 config/
 */
export interface DshRuntime {
  /** healProfilesModuleFallback / loadProfile 的锚点 package.json 绝对路径。 */
  installAnchor: string
  /** agent-presets shipped root（standard preset 所在）。 */
  agentPresetsRoot: string
  /** 来源：'source' = 用户 DSH 源码 checkout；'bundled' = 安装包内置闭包。 */
  kind: 'source' | 'bundled'
}

/**
 * 源码 checkout 模式的 runtime（DSH_CHECKOUT 或默认并列目录）。
 */
function sourceRuntime(root: string): DshRuntime {
  return {
    kind: 'source',
    installAnchor: join(root, 'apps', 'cli', 'package.json'),
    agentPresetsRoot: join(root, 'apps', 'cli', 'config', 'agent-presets'),
  }
}

/** 内置 npm 闭包模式的 runtime。 */
function bundledRuntime(root: string): DshRuntime {
  return {
    kind: 'bundled',
    installAnchor: join(root, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'),
    agentPresetsRoot: join(root, 'node_modules', '@deepseek-ai', 'dsh', 'config', 'agent-presets'),
  }
}

/**
 * 定位 DSH 运行时，回退链（v0.1.3 归档方案）：
 * 1. `$DSH_CHECKOUT`（显式指定：源码仓库根，或直接指向 dsh-runtime 目录）
 * 2. 默认并列源码目录 `../../deepseek-harness`（开发布局：SSiD 与 DSH
 *    源码并列放在同一工作区下，与 tsconfig 的 paths 解析一致）
 * 全部缺失时抛带引导信息的错误——boot 前发现，比 boot 中途报解析错误可读得多。
 * 注意：安装版的「部署后闭包」（~/.dsh/profiles/ssid/node_modules）不在此
 * 函数内——由 bootKernel 在 profileDir 解析后优先探测（见 bootKernel）。
 */
export function resolveDshRuntime(): DshRuntime {
  const fromEnv = process.env.DSH_CHECKOUT?.trim()
  if (fromEnv !== undefined && fromEnv !== '') {
    const envRoot = resolve(fromEnv)
    if (existsSync(join(envRoot, 'apps', 'cli', 'package.json'))) return sourceRuntime(envRoot)
    if (existsSync(join(envRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'))) {
      return bundledRuntime(envRoot)
    }
    throw new Error(
      `DSH_CHECKOUT 指向了无效路径：${envRoot}\n` +
      '需要 DeepSeek Harness 源码仓库根（含 apps/cli/package.json），或内置 dsh-runtime 目录。',
    )
  }
  // 开发布局：与 shell 并列的 deepseek-harness 源码（tsx paths 同源解析）。
  const defaultRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../deepseek-harness')
  if (existsSync(join(defaultRoot, 'apps', 'cli', 'package.json'))) return sourceRuntime(defaultRoot)
  throw new Error(
    `无法定位 DeepSeek Harness 运行时：默认路径 ${defaultRoot} 没有源码。\n` +
    '请重新安装思灵（新版安装包自带运行环境），或执行：\n' +
    '  git clone --depth 1 https://github.com/deepseek-ai/deepseek-harness <路径>\n' +
    '然后设置环境变量 DSH_CHECKOUT=<路径>，再重新打开思灵。',
  )
}

/** 内核启动结果。 */
export interface Kernel {
  /** 官方 UI 实际监听端口。 */
  port: number
  /** DSH 运行时版本（读 installAnchor 的 package.json version；官方
   *  host.describe 通道目前是占位符 '0.0.1'，壳层自读真实值）。 */
  dshVersion: string
  /** settled root context（主进程同进程读 host 服务、驱动 agent 会话）。 */
  ctx: Context
  /** 供主进程同进程读取 host 服务的根 context。 */
  get: (name: string) => unknown
  /** 优雅退出：dispose 整个 Cordis 树后调用 exit。 */
  shutdown: (code: number) => Promise<void>
}

/**
 * Boot DSH web profile（SSiD profile），返回监听端口、host 服务读取入口
 * 和退出函数。进程保持运行（webServer listen），退出走 shutdown。
 * @param exit - 最终进程退出，默认 `process.exit`；electron 传 `app.exit`。
 */
/**
 * Preset skills sync (v0.2.0): merge factory skills shipped inside the profile
 * (profileDir/skills, deployed with the dsh-runtime archive) into the user
 * skill root ($DSH_HOME/skills) without overwriting existing entries.
 *
 * Rules (see docs/决策/2026-08-19-SSiD预设技能包-落地方案.md):
 * - Copy directory entries only (skill bundles `<name>/SKILL.md`); root-level
 *   .md files (e.g. README) are skipped so the flat-skill parser never scans them
 * - A target entry that already exists is skipped (user edits/deletes win;
 *   upgrades add new skills without overwriting user changes)
 * - Idempotent: runs on every launch; absent source (dev run / legacy deploy)
 *   is a silent no-op; failures never block boot
 */
export function syncPresetSkills(sourceDir: string, targetDir: string): number {
  let entries
  try {
    entries = readdirSync(sourceDir, { withFileTypes: true })
  } catch {
    return 0 // source absent (legacy deploy / dev run): nothing to sync
  }
  try {
    mkdirSync(targetDir, { recursive: true })
  } catch (error) {
    console.warn(`ssid: preset skills sync failed to create ${targetDir}: ${String(error)}`)
    return 0
  }
  let copied = 0
  for (const entry of entries) {
    if (!entry.isDirectory()) continue // skill bundles only
    if (entry.name === '.system') continue
    const target = join(targetDir, entry.name)
    if (existsSync(target)) continue // user already has this entry: keep theirs
    try {
      cpSync(join(sourceDir, entry.name), target, { recursive: true })
      copied++
    } catch (error) {
      console.warn(`ssid: preset skill "${entry.name}" sync failed: ${String(error)}`)
    }
  }
  if (copied > 0) console.log(`ssid: preset skills synced ${copied} new -> ${targetDir}`)
  return copied
}

// ── pending 插件更新消费（2026-08-22）：两段式更新的第二步 ──────────────
// dsh-plugin-center 的更新现在是「下载到 ~/.ssid/pending-plugin-updates/ +
// 重启时安装」：运行中替换原生模块（node-pty 等）会被 Windows 锁死
// （EPERM）。本函数位于 boot DSH 之前——node_modules 尚无加载锁，是安全的
// 安装窗口。失败绝不阻断 boot：条目保留并在下次启动重试。
function applyPendingPluginUpdates(profileDir: string): void {
  const pendingDir = join(homedir(), '.ssid', 'pending-plugin-updates')
  const indexFile = join(pendingDir, 'index.json')
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(indexFile, 'utf8'))
  } catch {
    return // 无待办更新（或目录不存在）：正常启动路径
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return
  // 壳内捆绑 pnpm（SSID_PNPM，与归档 store 布局同 major）最优先——重启消费
  // pending 清单时避免用户机器全局 pnpm 版本不一致（2026-08-23 鸡生蛋防护）。
  const candidates = [
    ...(process.env.SSID_PNPM !== undefined && process.env.SSID_PNPM !== '' ? [process.env.SSID_PNPM] : []),
    'pnpm', 'pnpm.cmd',
  ]
  const remaining: Array<Record<string, unknown>> = []
  for (const raw of parsed) {
    const entry = raw as { name?: unknown, version?: unknown, tgz?: unknown } | null
    if (entry === null || typeof entry.name !== 'string' || typeof entry.version !== 'string') continue
    const spec = `${entry.name}@${entry.version}`
    let done = false
    let detail = 'no pnpm candidate found'
    for (const command of candidates) {
      // shell: true —— Windows 下 .cmd shim 必须经 shell；timeout 防止
      // 网络/registry 卡死拖住启动（10 分钟上限）。
      const result = spawnSync(
        command,
        ['add', '-w', spec],
        { cwd: profileDir, shell: true, windowsHide: true, timeout: 10 * 60_000, encoding: 'utf8' },
      )
      if (result.status === 0) {
        done = true
        break
      }
      detail = result.error !== undefined
        ? result.error.message
        : `exit ${result.status ?? 1}${typeof result.stderr === 'string' ? `\n${result.stderr.slice(-1200)}` : ''}`
    }
    if (done) {
      if (typeof entry.tgz === 'string') {
        try { rmSync(entry.tgz, { force: true }) } catch { /* tgz 清理失败不影响安装结果 */ }
      }
      console.log(`ssid: pending plugin update applied: ${spec}`)
    } else {
      console.log(`ssid: pending plugin update deferred (retry next boot): ${spec}\n  ${detail}`)
      remaining.push(entry as Record<string, unknown>)
    }
  }
  try {
    if (remaining.length === 0) rmSync(indexFile, { force: true })
    else writeFileSync(indexFile, JSON.stringify(remaining, null, 2) + '\n')
  } catch {
    // 清单写回失败：下次启动会重试，不阻断 boot
  }
}

/**
 * 内核启动。
 * @param exit - 最终进程退出，默认 `process.exit`；electron 传 `app.exit`。
 * @param opts - `preferBundled`：打包版（app.isPackaged）传 true，强制优先
 *   内置闭包（profileDir/node_modules 的 @deepseek-ai/dsh），忽略
 *   $DSH_CHECKOUT 环境变量——桌面应用不该让用户环境变量劫持内置运行时
 *   （pitfalls #5「DSH_CHECKOUT 幽灵依赖」：残留的 User 级变量会把运行时
 *   指向旧源码，标题栏版本与归档不一致）。开发裸跑（未打包）仍以
 *   $DSH_CHECKOUT / 并列源码为准。
 */
export async function bootKernel(
  exit: (code: number) => void = code => process.exit(code),
  opts: {
    preferBundled?: boolean
    /** 壳层「重启 DSH」回调（app.relaunch + kernel.shutdown），经服务键
     *  `SSID_SHELL_RESTART_KEY` 注入内核，供 dsh-ssid-panels 设置页调用。 */
    restart?: () => void
    /** 壳层「快捷截图」能力（触发浮层 / 重注册快捷键），经服务键
     *  `SSID_SHELL_SCREENSHOT_KEY` 注入，供 dsh-ssid-screenshot 调用。 */
    screenshot?: {
      trigger: () => void
      /** 重注册全局快捷键；返回注册是否成功（false = 被其他软件占用）。 */
      apply: () => boolean
    }
  } = {},
): Promise<Kernel> {
  const home = resolveDshHome()
  const profileDir = resolveProfileDir(PROFILE_NAME, home)
  // 供宿主插件定位 profile 物理目录（如 ssid-panels 读预制插件元数据）。
  process.env.SSID_PROFILE_DIR = profileDir
  // 首次运行初始化（官方 loadProfile 只认 web/headless 模板，ssid 要自己建）。
  if (!existsSync(join(profileDir, 'package.json'))) {
    initProfile(profileDir, PROFILE_BUNDLES)
  }
  // 预设技能同步：出厂技能（profileDir/skills，随归档部署）非覆盖合并到
  // $DSH_HOME/skills。旧版/开发裸跑 profile 无 skills 目录时静默跳过。
  syncPresetSkills(join(profileDir, 'skills'), join(home, 'skills'))
  // pending 插件更新消费（两段式第二步）：boot DSH 前安装（无锁窗口）。
  // 先声明消费能力：插件中心（engine.update）据此决定启用两段式还是直装
  // ——旧打包 kernel（应用 asar 里的 kernel.bundle 无此函数）不会设置该
  // 变量，安装版上插件中心保持直装旧行为，避免「待重启但不生效」假象。
  process.env.SSID_PENDING_CONSUMER = '1'
  applyPendingPluginUpdates(profileDir)
  // 官方 INSTALL_ANCHOR：DSH 运行时（源码 checkout 的 apps/cli/package.json，
  // 或内置闭包的 @deepseek-ai/dsh/package.json）——healProfilesModuleFallback
  // 和 loadProfile 从这里解析 bundle 的物理目录（pnpm workspace symlink
  // 或 npm 扁平布局）。
  // v0.1.3：安装版闭包由 main.mjs 从 dsh-runtime.tar.gz 解压部署到
  // profileDir/node_modules（resources/ 不再有解压目录）。因此部署产物
  // 优先于默认源码路径；v0.1.6 起打包版（preferBundled）强制以闭包为准，
  // $DSH_CHECKOUT 仅影响开发裸跑（未打包）的运行时选择。
  let runtime: DshRuntime
  const deployedAnchor = join(profileDir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
  // 打包版（preferBundled）：强制优先内置闭包，忽略 $DSH_CHECKOUT——桌面应用
  // 不被用户环境变量劫持运行时（pitfalls #5）。仅当闭包缺失（归档未部署/损坏）
  // 才回退 resolveDshRuntime()（含 DSH_CHECKOUT / 并列源码），保证可 boot。
  if (opts.preferBundled === true) {
    if (existsSync(deployedAnchor)) {
      runtime = bundledRuntime(profileDir)
    } else {
      runtime = resolveDshRuntime()
    }
  } else if (process.env.DSH_CHECKOUT === undefined && existsSync(deployedAnchor)) {
    runtime = bundledRuntime(profileDir)
  } else {
    runtime = resolveDshRuntime()
  }
  const installAnchor = runtime.installAnchor
  // DSH 版本：installAnchor 指向运行时自身的 package.json（source 模式 =
  // apps/cli/package.json；bundled 模式 = @deepseek-ai/dsh/package.json）。
  const dshVersion = (() => {
    try {
      const pkg = JSON.parse(readFileSync(installAnchor, 'utf8')) as { version?: string }
      return pkg.version ?? 'unknown'
    } catch {
      return 'unknown'
    }
  })()
  // 必须先 heal：installProfilePackageResolver 的 loader 前缀从
  // ~/.dsh/profiles/node_modules 平面 symlink 解析，新机（空 profile）下
  // 没 heal 会解析失败。
  healProfilesModuleFallback(installAnchor, home)
  // loader 的 bare specifier 从这个锚点向上找 node_modules：profile 自己的
  // node_modules（第三方插件）→ ~/.dsh/profiles/node_modules（heal 建立的
  // 平面 symlink，覆盖所有 @deepseek-ai/dsh-*）。必须在 boot 之前装好。
  const releaseResolver = installProfilePackageResolver(
    pathToFileURL(join(profileDir, 'package.json')).href,
  )

  try {
    const profile = loadProfile(BIN_NAME, PROFILE_NAME, installAnchor, home)

    const rootConfig = join(profile.dir, ROOT_CONFIG_FILENAME)
    writeFileSync(rootConfig, '[]\n')

    const homePatches = loadOptionalPatches(BIN_NAME, join(home, PROFILE_PATCH_FILENAME)) ?? []
    const patches: PatchOptions[] = [
      ...profile.layers.flatMap(layer => layer.patches),
      ...profile.patches,
      ...homePatches,
    ]

    // SHIPPED agent-presets root（源码版 apps/cli/config/agent-presets，
    // 内置版 @deepseek-ai/dsh/config/agent-presets，含 standard preset）——
    // 官方 profile-boot 的 composeProfile 注入它，web bundle 的
    // agent-presets row 默认 default: standard，缺了这个 root 会报
    // agent-preset-not-found。
    const rows = new Map<string, { config?: unknown }>()
    for (const row of composeEntries([patches])) {
      if (typeof row.id === 'string') rows.set(row.id, row)
    }
    const presets = rows.get('agent-presets')
    if (presets !== undefined) {
      const shippedRoot = runtime.agentPresetsRoot
      patches.push({
        id: 'agent-presets',
        config: {
          ...(typeof presets.config === 'object' && presets.config !== null && !Array.isArray(presets.config)
            ? presets.config as Record<string, unknown>
            : {}),
          roots: [{ path: shippedRoot, trust: 'system' }],
        },
      })
    }

    // 遥测开关（官方 profile-boot 的 resolveTelemetryPatch）。
    if ((process.env.DSH_TELEMETRY_DISABLED ?? '') !== '' && rows.has(TELEMETRY_ROW_ID)) {
      patches.push({ id: TELEMETRY_ROW_ID, disabled: true })
    }

    // ── 会话存储隔离开关（设置页「关于 SSiD」可切换，重启生效）────────────
    // 与手动 dsh web 共享 ~/.dsh/sessions 时，两个宿主并发写同一 JSONL 日志
    // 会反复造成 "corrupt session log: seq gap"（2026-08-22 已三度复发）。
    // 开关状态存 ~/.ssid/session-root.json（与 notify.json 同模式）：
    //   isolated = 设置页开关；applied = 本次 boot 实际生效值（kernel 回写）。
    // 独立根与两个根的绝对路径经环境变量发布给 /ssid/api 插件（载入按钮）。
    // 预设（2026-08-23 用户拍板）：无配置文件＝默认开启独立会话存储（新装机
    // 即与手动 dsh web 隔离），首次启动落盘成显式配置，用户仍可随时关闭。
    const sessionRootConfigPath = join(homedir(), '.ssid', 'session-root.json')
    const isolatedSessionsRoot = join(home, 'sessions-ssid')
    const sharedSessionsRoot = join(home, 'sessions')
    let isolatedSessionRoot = true
    try {
      const parsed = JSON.parse(readFileSync(sessionRootConfigPath, 'utf8')) as { isolated?: unknown } | null
      isolatedSessionRoot = parsed?.isolated === true
    } catch {
      // 无配置文件 = 按预设启用隔离
    }
    process.env.SSID_SESSION_ISOLATED_ROOT = isolatedSessionsRoot
    process.env.SSID_SESSION_SHARED_ROOT = sharedSessionsRoot
    // 本次 boot 时刻：dsh-ssid-panels 据此判断「载入/移除会话后是否需要重启」
    // （清单 mtime > bootedAt ⇒ 本次运行中改过存储，侧栏列表尚未重建）。
    process.env.SSID_BOOTED_AT = String(Date.now())
    if (isolatedSessionRoot) {
      patches.push({
        id: 'session-persistence-jsonl',
        config: { root: isolatedSessionsRoot },
      })
    }
    try {
      if (!existsSync(sessionRootConfigPath)) {
        // 预设落地：首次启动把「默认隔离」写成显式配置（设置页因此可见/可关）。
        mkdirSync(dirname(sessionRootConfigPath), { recursive: true })
        writeFileSync(
          sessionRootConfigPath,
          JSON.stringify({ isolated: true, applied: true }, null, 2) + '\n',
        )
      } else {
        // 回写 applied 供设置页显示「重启后生效」（已存在配置文件时）。
        const prev = JSON.parse(readFileSync(sessionRootConfigPath, 'utf8')) as Record<string, unknown> | null
        writeFileSync(
          sessionRootConfigPath,
          JSON.stringify({ ...(prev ?? {}), applied: isolatedSessionRoot }, null, 2) + '\n',
        )
      }
    } catch {
      // 配置不可写不阻断启动：开关状态以本次 boot 读到的为准
    }

    const environment = loadLayeredEnv(BIN_NAME)
    const ctx = await boot(BIN_NAME, rootConfig, structuredClone(patches), (hostCtx) => {
      hostCtx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, environment)
      // 壳层「重启 DSH」能力（main.mjs 的 restartDsh：app.relaunch +
      // kernel.shutdown），dsh-ssid-panels 设置页经 ctx.get(SSID_SHELL_RESTART_KEY)
      // 调用；bootKernel 未传 restart 时（裸跑/测试）不提供。
      if (opts.restart !== undefined) hostCtx.provide(SSID_SHELL_RESTART_KEY, opts.restart)
      if (opts.screenshot !== undefined) hostCtx.provide(SSID_SHELL_SCREENSHOT_KEY, opts.screenshot)
      provideCmdline(hostCtx, {
        // rc.8 起 dsh web 默认打开浏览器（openBrowser 默认 true）；壳内嵌场景
        // 必须关闭，否则每次启动弹系统浏览器（--no-open 由 web-startup 解析）。
        args: ['--host', '127.0.0.1', '--port', '0', '--no-open'],
        exit,
      })
    })

    const webServer = ctx.get('webServer') as { port: number } | undefined
    if (webServer === undefined) {
      throw new Error('ssid: booted tree has no webServer service')
    }

    return {
      port: webServer.port,
      dshVersion,
      ctx,
      get: name => ctx.get(name),
      shutdown: async (code) => {
        await ctx.fiber.dispose()
        exit(code)
      },
    }
  } catch (cause) {
    releaseResolver()
    throw cause
  }
}

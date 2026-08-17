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

import { existsSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
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
 * 定位内置 dsh-runtime 目录（安装版 resources/dsh-runtime；开发版
 * shell/dsh-runtime），校验 @deepseek-ai/dsh 闭包在，否则返回 null。
 */
export function bundledRuntimeDir(): string | null {
  // 打包后 kernel.bundle.mjs 在 resources/app.asar/ 下 → ../dsh-runtime
  // = resources/dsh-runtime；开发时 kernel.ts 在 shell/ 下 → 同级 dsh-runtime。
  const here = fileURLToPath(new URL('.', import.meta.url))
  const candidates = [
    resolve(here, '../dsh-runtime'),
    resolve(here, 'dsh-runtime'),
  ]
  for (const root of candidates) {
    if (existsSync(join(root, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'))) {
      return root
    }
  }
  return null
}

/** 源码 checkout 模式的 runtime（DSH_CHECKOUT 或默认并列目录）。 */
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
 * 定位 DSH 运行时，三级回退：
 * 1. `$DSH_CHECKOUT`（显式指定：源码仓库根，或直接指向 dsh-runtime）
 * 2. 默认并列源码目录 `../../deepseek-harness`（开发布局：SSiD 与 DSH
 *    源码并列放在同一工作区下，与 tsconfig 的 paths 解析一致）
 * 3. 内置 dsh-runtime（安装包自带，无需任何环境配置）
 * 全部缺失时抛带引导信息的错误——boot 前发现，比 boot 中途报解析错误可读得多。
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
  // 安装版：内置闭包（resources/dsh-runtime 或 shell/dsh-runtime）。
  const bundled = bundledRuntimeDir()
  if (bundled !== null) return bundledRuntime(bundled)
  throw new Error(
    `无法定位 DeepSeek Harness 运行时：默认路径 ${defaultRoot} 没有源码，也没有内置 dsh-runtime。\n` +
    '请重新安装思灵（新版安装包自带运行环境），或执行：\n' +
    '  git clone --depth 1 https://github.com/deepseek-ai/deepseek-harness <路径>\n' +
    '然后设置环境变量 DSH_CHECKOUT=<路径>，再重新打开思灵。',
  )
}

/** 内核启动结果。 */
export interface Kernel {
  /** 官方 UI 实际监听端口。 */
  port: number
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
export async function bootKernel(
  exit: (code: number) => void = code => process.exit(code),
): Promise<Kernel> {
  const home = resolveDshHome()
  const profileDir = resolveProfileDir(PROFILE_NAME, home)
  // 供宿主插件定位 profile 物理目录（如 ssid-panels 读预制插件元数据）。
  process.env.SSID_PROFILE_DIR = profileDir
  // 首次运行初始化（官方 loadProfile 只认 web/headless 模板，ssid 要自己建）。
  if (!existsSync(join(profileDir, 'package.json'))) {
    initProfile(profileDir, PROFILE_BUNDLES)
  }
  // 官方 INSTALL_ANCHOR：DSH 运行时（源码 checkout 的 apps/cli/package.json，
  // 或内置闭包的 @deepseek-ai/dsh/package.json）——healProfilesModuleFallback
  // 和 loadProfile 从这里解析 bundle 的物理目录（pnpm workspace symlink
  // 或 npm 扁平布局）。
  const runtime = resolveDshRuntime()
  const installAnchor = runtime.installAnchor
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

    const environment = loadLayeredEnv(BIN_NAME)
    const ctx = await boot(BIN_NAME, rootConfig, structuredClone(patches), (hostCtx) => {
      hostCtx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, environment)
      provideCmdline(hostCtx, {
        args: ['--host', '127.0.0.1', '--port', '0'],
        exit,
      })
    })

    const webServer = ctx.get('webServer') as { port: number } | undefined
    if (webServer === undefined) {
      throw new Error('ssid: booted tree has no webServer service')
    }

    return {
      port: webServer.port,
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

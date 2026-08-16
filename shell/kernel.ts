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
 * 定位 DSH checkout 根目录：`$DSH_CHECKOUT` 优先，否则默认 shell 目录的
 * `../../deepseek-harness`（两个仓库并列放在同一工作区下）。
 * @returns DSH checkout 根目录的绝对路径。
 */
export function resolveDshCheckout(): string {
  const fromEnv = process.env.DSH_CHECKOUT
  if (fromEnv !== undefined && fromEnv.trim() !== '') return resolve(fromEnv)
  const shellDir = fileURLToPath(new URL('.', import.meta.url))
  return resolve(shellDir, '../../deepseek-harness')
}

/** 内核启动结果。 */
export interface Kernel {
  /** 官方 UI 实际监听端口。 */
  port: number
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
  // 首次运行初始化（官方 loadProfile 只认 web/headless 模板，ssid 要自己建）。
  if (!existsSync(join(profileDir, 'package.json'))) {
    initProfile(profileDir, PROFILE_BUNDLES)
  }
  // loader 的 bare specifier 从这个锚点向上找 node_modules：profile 自己的
  // node_modules（第三方插件）→ ~/.dsh/profiles/node_modules（heal 建立的
  // 平面 symlink，覆盖所有 @deepseek-ai/dsh-*）。必须在 boot 之前装好。
  const releaseResolver = installProfilePackageResolver(
    pathToFileURL(join(profileDir, 'package.json')).href,
  )

  try {
    // 官方 INSTALL_ANCHOR：DSH checkout 的 apps/cli/package.json ——
    // healProfilesModuleFallback 和 loadProfile 从这里解析 bundle 的物理目录
    // （pnpm workspace 的 symlink 布局）。
    const installAnchor = join(resolveDshCheckout(), 'apps/cli/package.json')
    healProfilesModuleFallback(installAnchor, home)
    const profile = loadProfile(BIN_NAME, PROFILE_NAME, installAnchor, home)

    const rootConfig = join(profile.dir, ROOT_CONFIG_FILENAME)
    writeFileSync(rootConfig, '[]\n')

    const homePatches = loadOptionalPatches(BIN_NAME, join(home, PROFILE_PATCH_FILENAME)) ?? []
    const patches: PatchOptions[] = [
      ...profile.layers.flatMap(layer => layer.patches),
      ...profile.patches,
      ...homePatches,
    ]

    // SHIPPED agent-presets root（apps/cli/config/agent-presets，含 standard
    // preset）—— 官方 profile-boot 的 composeProfile 注入它，web bundle 的
    // agent-presets row 默认 default: standard，缺了这个 root 会报
    // agent-preset-not-found。
    const rows = new Map<string, { config?: unknown }>()
    for (const row of composeEntries([patches])) {
      if (typeof row.id === 'string') rows.set(row.id, row)
    }
    const presets = rows.get('agent-presets')
    if (presets !== undefined) {
      const shippedRoot = join(resolveDshCheckout(), 'apps/cli/config/agent-presets')
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

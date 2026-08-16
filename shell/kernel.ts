/**
 * SSiD 壳 —— DSH 内核启动（electron 主进程内直接 boot，单进程）。
 *
 * 学习 anywhere-labs 的 dsh-plugin-desktop（main.ts + module-resolution.ts）：
 * electron 里 DSH 的 native addon 探测不到标准 Node 的 V8 embedder，
 * `ctx.loader.internal` 为 undefined，loader 退化成从 tree.ts 位置
 * `import(name)`，bare specifier 找不到 profile 目录的插件。解法不是 spawn
 * 子进程，而是用 Node 24 的纯 JS `registerHooks` 把 loader 发出的 bare
 * specifier 的 parentURL 改写到 profile 目录（见 module-resolution.ts）。
 *
 * 单进程的收益：窗口/侧栏可以直接 `ctx.get('memory')` 同进程读 host 服务，
 * M1 的 memory 数据通道不需要跨进程桥。
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  initProfile,
  loadLayeredEnv,
  resolveProfileDir,
} from '@deepseek-ai/dsh-app-boot'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { runProfile } from '../../deepseek-harness/apps/cli/src/profile-boot.ts'
import { installProfilePackageResolver } from './module-resolution.ts'

/** SSiD 自己的 profile 名（聚合平台要有独立 profile 目录）。 */
const PROFILE_NAME = 'ssid'
/** SSiD profile 的 bundle 层 = DSH 官方 web 的两个 bundle。 */
const PROFILE_BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']

/** 内核启动结果。 */
export interface Kernel {
  /** 官方 UI 实际监听端口。 */
  port: number
  /** 退出控制器（runProfile 返回的 shutdown）。 */
  shutdown: { shutdown(code: number): void }
  /** 供主进程同进程读取 host 服务的根 context。 */
  get: (name: string) => unknown
}

/**
 * Boot DSH web profile（SSiD profile），返回监听端口、退出控制器和
 * host 服务读取入口。进程保持运行（webServer listen），退出走 shutdown
 * 或信号。
 */
export async function bootKernel(): Promise<Kernel> {
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
    // 复用官方 runProfile（零 drift）：内部 healProfilesModuleFallback +
    // loadProfile + 首次 initProfile + SHIPPED_PRESET_ROOT 注入 + boot。
    const { ctx, shutdown } = await runProfile({
      environment: loadLayeredEnv('ssid'),
      profile: PROFILE_NAME,
      patchFiles: [],
      args: ['--host', '127.0.0.1', '--port', '0'],
    })

    const webServer = ctx.get('webServer') as { port: number } | undefined
    if (webServer === undefined) {
      throw new Error('ssid: booted tree has no webServer service')
    }
    return { port: webServer.port, shutdown, get: name => ctx.get(name) }
  } catch (cause) {
    releaseResolver()
    throw cause
  }
}

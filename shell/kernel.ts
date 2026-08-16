/**
 * SSiD 壳 —— DSH 内核启动逻辑（纯 node 子进程内运行）。
 *
 * 直接复用官方 `dsh --profile` 的 `runProfile`，而不是自己拼 boot：
 * SSiD 是补丁层，boot 逻辑跟随 DSH 更新、零 drift。唯一差异是 SSiD 用
 * 自己的 profile 名（`ssid`，bundle 层 = 官方 web 两个 bundle），并在首次
 * 运行时 initProfile（官方 `loadProfile` 只认 `web`/`headless` 模板）。
 *
 * 内核必须跑在标准 node 下：DSH 的 loader 用 native addon
 * （node-addon-require-builtin）探测标准 Node 的 V8 embedder，electron 是
 * 另一个 embedder，所以 electron 主进程 spawn 本模块所在的纯 node 子进程。
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { initProfile, loadLayeredEnv } from '@deepseek-ai/dsh-app-boot'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { runProfile } from '../../deepseek-harness/apps/cli/src/profile-boot.ts'

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
}

/**
 * Boot DSH web profile（SSiD profile），返回监听端口和退出控制器。
 * 内核进程会保持运行（webServer listen），由父进程 kill 或本进程信号退出。
 */
export async function bootKernel(): Promise<Kernel> {
  // 首次初始化 SSiD 自己的 profile 目录。
  const home = resolveDshHome()
  const profileDir = join(home, 'profiles', PROFILE_NAME)
  if (!existsSync(join(profileDir, 'package.json'))) {
    initProfile(profileDir, PROFILE_BUNDLES)
  }

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
  return { port: webServer.port, shutdown }
}

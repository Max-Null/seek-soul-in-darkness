/**
 * boot-bundled.mjs —— 内置 npm 闭包（dsh-runtime）boot 冒烟验证。
 *
 * 脱离 tsx/shell 上下文：node 直接从 dsh-runtime/node_modules 解析
 * @deepseek-ai/dsh-*（发布产物 lib/*.js），证明「内置闭包能独立 boot
 * DSH web profile」这条安装版核心链路。
 *
 * 跑法（cwd = dsh-runtime 或任意处）：`node scripts/boot-bundled.mjs`
 * 前置：DSH_HOME 指向全新临时目录（heal 会向该 home 的 profiles/node_modules
 * 建 junction，避免污染真实 ~/.dsh）。
 * 成功标志：boot 成功 → fetch `/` 拿到 200 + 非空 HTML。
 */

import { existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
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
} from '../dsh-runtime/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js'
import { provideCmdline } from '../dsh-runtime/node_modules/@deepseek-ai/dsh-cmdline/lib/index.js'
import { resolveDshHome } from '../dsh-runtime/node_modules/@deepseek-ai/dsh-home-paths/lib/index.js'
import { DSH_LAUNCH_ENVIRONMENT_KEY } from '../dsh-runtime/node_modules/@deepseek-ai/dsh-launch-environment/lib/index.js'

// 脚本位于 shell/scripts/，runtime 闭包在同级 shell/dsh-runtime/
const RUNTIME_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'dsh-runtime')
const HERE = RUNTIME_DIR
const BIN_NAME = 'ssid'
const PROFILE_NAME = 'ssid'
const PROFILE_BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']
const ROOT_CONFIG_FILENAME = 'cordis.yml'
const TELEMETRY_ROW_ID = 'session-telemetry-otel'

async function main() {
  const home = resolveDshHome()
  const profileDir = resolveProfileDir(PROFILE_NAME, home)
  process.env.SSID_PROFILE_DIR = profileDir

  if (!existsSync(join(profileDir, 'package.json'))) {
    initProfile(profileDir, PROFILE_BUNDLES)
  }

  // 内置闭包锚点：@deepseek-ai/dsh（聚合包）的 package.json。
  const installAnchor = join(HERE, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
  const agentPresetsRoot = join(HERE, 'node_modules', '@deepseek-ai', 'dsh', 'config', 'agent-presets')
  healProfilesModuleFallback(installAnchor, home)

  const profile = loadProfile(BIN_NAME, PROFILE_NAME, installAnchor, home)
  const rootConfig = join(profile.dir, ROOT_CONFIG_FILENAME)
  writeFileSync(rootConfig, '[]\n')

  const homePatches = loadOptionalPatches(BIN_NAME, join(home, PROFILE_PATCH_FILENAME)) ?? []
  const patches = [
    ...profile.layers.flatMap(layer => layer.patches),
    ...profile.patches,
    ...homePatches,
  ]

  // 注入 shipped agent-presets root（与 kernel.ts 一致）。
  const rows = new Map()
  for (const row of composeEntries([patches])) {
    if (typeof row.id === 'string') rows.set(row.id, row)
  }
  const presets = rows.get('agent-presets')
  if (presets !== undefined) {
    patches.push({
      id: 'agent-presets',
      config: {
        ...(typeof presets.config === 'object' && presets.config !== null && !Array.isArray(presets.config)
          ? presets.config
          : {}),
        roots: [{ path: agentPresetsRoot, trust: 'system' }],
      },
    })
  }

  if ((process.env.DSH_TELEMETRY_DISABLED ?? '') !== '' && rows.has(TELEMETRY_ROW_ID)) {
    patches.push({ id: TELEMETRY_ROW_ID, disabled: true })
  }

  const environment = loadLayeredEnv(BIN_NAME)
  const ctx = await boot(BIN_NAME, rootConfig, structuredClone(patches), (hostCtx) => {
    hostCtx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, environment)
    provideCmdline(hostCtx, {
      args: ['--host', '127.0.0.1', '--port', '0'],
      exit: code => process.exit(code),
    })
  })

  const webServer = ctx.get('webServer')
  if (webServer === undefined) {
    throw new Error('booted tree has no webServer service')
  }
  const url = `http://127.0.0.1:${webServer.port}/`
  const res = await fetch(url)
  const text = await res.text()
  console.log(`BUNDLED boot OK: ${url} -> HTTP ${res.status} (${text.length} bytes)`)
  await ctx.fiber.dispose()
  process.exit(0)
}

main().catch((cause) => {
  console.error(
    'BUNDLED boot FAILED:',
    cause instanceof Error ? (cause.stack ?? cause.message) : String(cause),
  )
  process.exit(1)
})

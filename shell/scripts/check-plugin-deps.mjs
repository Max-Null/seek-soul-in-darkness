#!/usr/bin/env node
/**
 * 门：随包插件集的**依赖完整性**（2026-11-15）
 *
 * ## 为什么需要它
 *
 * `prepare-ssid-plugins.ts` 会用 `pnpm install` 装出插件及其传递依赖，再拍平进
 * `ssid-plugins/node_modules`——**依赖是完整的**。但只要有人（或某个脚本）绕过它，
 * 直接往插件集里复制单个插件实体，那个包自己的 `dependencies` 就没人装：
 *
 * - 2026-11-14 升级 dsh-memory 0.23.0 时手工覆盖实体，`https-proxy-agent` 就丢了；
 * - 更早的 `isomorphic-git`（+ 12 个传递包）同样手工补过。
 *
 * 症状是**插件整个加载失败**（ESM `ERR_MODULE_NOT_FOUND`），而打包、npm、git 全都正常
 * ——没有这道门就只能等装机后才发现。所以它检查的是**最终产物**，不管东西是怎么来的。
 *
 * ## 检查什么
 *
 * 只查 `dependencies`：
 * - `peerDependencies` 由宿主（内核）提供，本来就不该在插件集里，查了会误报；
 * - `devDependencies` 不进发布物。
 *
 * `createRequire` 从插件自己的 `package.json` 出发，正好复刻 Node 的解析路径
 * （插件目录 → 插件集 `node_modules` → 上层）。
 *
 * ## 目标目录
 *
 * 不传参数时按优先级探测：打包产物 → 装版。都没有则**跳过**（exit 0）并说明——
 * 不是每台开发机都打过包，缺产物不等于失败。
 *
 * 用法：
 *   node scripts/check-plugin-deps.mjs [插件集目录]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

const CANDIDATES = [
  // 打包产物（prepare-ssid-plugins 的输出）
  'H:/MaxNull/WorkStation/.ssid-build/checkout/apps/desktop/.desktop-build/targets/win-x64/ssid-plugins',
  // 装版（用户实际加载的那份）
  'C:/Users/MaxNull/AppData/Local/Programs/ssid-shell/resources/ssid-plugins',
]

/**
 * 检查一个插件集目录。
 * @param {string} dir - 插件集根（含 `ssid-plugins.json` 与 `node_modules`）。
 * @returns {string[]} 缺依赖的描述清单；空数组 = 全绿。
 */
export function checkPluginSet(dir) {
  const manifestPath = join(dir, 'ssid-plugins.json')
  if (!existsSync(manifestPath)) throw new Error(`缺少 ssid-plugins.json：${manifestPath}`)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const bundles = Array.isArray(manifest.bundles) ? manifest.bundles : []
  const modulesRoot = join(dir, 'node_modules')
  const missing = []

  for (const name of bundles) {
    const entity = join(modulesRoot, name)
    const manifestOfPlugin = join(entity, 'package.json')
    if (!existsSync(manifestOfPlugin)) {
      missing.push(`${name}：实体不存在（${entity}）`)
      continue
    }
    const pkg = JSON.parse(readFileSync(manifestOfPlugin, 'utf8'))
    const deps = Object.keys(pkg.dependencies ?? {})
    if (deps.length === 0) continue
    const require = createRequire(manifestOfPlugin)
    for (const dep of deps) {
      // 先看目录在不在：插件集是拍平布局，`node_modules/<dep>` 存在即视为已装。
      // 不能只靠 require.resolve——有些包（如 @codemirror/legacy-modes）的 exports
      // 不让 CJS 解析，会抛 ERR_PACKAGE_PATH_NOT_EXPORTED，那是**在**而不是缺
      // （2026-11-15 实测误报过一次）。
      if (existsSync(join(modulesRoot, dep))) continue
      try {
        require.resolve(dep)
      } catch {
        missing.push(`${name} → ${dep}`)
      }
    }
  }
  return missing
}

const explicit = process.argv[2]
const candidates = explicit === undefined ? CANDIDATES : [resolve(explicit)]
const target = candidates.find(dir => existsSync(join(dir, 'ssid-plugins.json')))

if (target === undefined) {
  console.log(`plugin-deps: 没有找到可检查的插件集（试过 ${candidates.length} 个位置），跳过`)
  process.exit(0)
}

try {
  const missing = checkPluginSet(target)
  const count = JSON.parse(readFileSync(join(target, 'ssid-plugins.json'), 'utf8')).bundles?.length ?? 0
  if (missing.length === 0) {
    console.log(`plugin-deps: ${count} 个 bundle 的运行时依赖全部可解析（${target}）`)
    process.exit(0)
  }
  console.error(`plugin-deps: 以下依赖在插件集里解析不到（${target}）：`)
  for (const line of missing) console.error(`  - ${line}`)
  console.error('')
  console.error('安装期缺失的典型来源：手工复制插件实体绕过了 pnpm install。')
  console.error('补法：在插件仓库里跑 scripts/install-to-ssid.mjs，或重跑 prepare:ssid-plugins。')
  process.exit(1)
} catch (error) {
  console.error(`plugin-deps: 检查失败 —— ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

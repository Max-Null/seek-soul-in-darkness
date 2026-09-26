/**
 * 产出「随包插件集」—— 思灵要交付到用户 profile 的插件与依赖（A′ 交付形态的实体来源）。
 *
 * ## 为什么是「拍平的一份实体」
 *
 * 2026-09-26 的四组对照实验证明：插件**本体**与它的 client 半都从 profile 的解析走，
 * 放进安装锚点或内核闭包都加载不到（见 `src/ssid/profile-seed.ts` 的模块注释）。
 * 所以实体必须随包带一份、由首启在 profile 里建链接指过来。
 *
 * ## 为什么分 bundles 与 packages
 *
 * 插件的**非 peer 依赖**（pnpm 装出来的传递依赖、以及不是 bundle 的纯依赖如 MCP CLI）
 * 也必须在 profile 的 `node_modules` 里解析得到，否则插件 import 时失败；但它们不该出现在
 * `dsh.profile.bundles` 里 —— 那不是 bundle，写进去内核会按 bundle 去解析。
 *
 * ## 输入
 *
 * 发版基准 `shell/profile-template/package.json`（手册 §10：模板是发版基准）：
 * 它的 `dependencies` 给出每个包的版本或 `file:./vendor/...` 来源，`dsh.profile.bundles`
 * 给出加载顺序；其中的 `@deepseek-ai/*` 由安装锚点提供，不进插件集。
 */

import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { resolveDesktopTargetBuildPaths } from './desktop-build-paths.mjs'
import { SSID_PLUGIN_SET_MANIFEST } from '../src/ssid/profile-seed.ts'

const APP_ROOT = resolve(import.meta.dirname, '..')
/** 工作区里的发版基准；`checkout/apps/desktop` 向上四层到工作区根。 */
const DEFAULT_TEMPLATE = resolve(APP_ROOT, '..', '..', '..', '..', 'seek-soul-in-darkness', 'shell', 'profile-template')

interface TemplateManifest {
  readonly dependencies?: Readonly<Record<string, string>>
  readonly dsh?: { readonly profile?: { readonly bundles?: readonly string[] } }
}

/** 内核自带的包由安装锚点提供，不进插件集。 */
function isInBoxBundle(name: string): boolean {
  return name.startsWith('@deepseek-ai/')
}

/**
 * 跑一次 pnpm。
 * @param args - pnpm 参数。
 * @param cwd - 工作目录。
 */
async function runPnpm(args: readonly string[], cwd: string): Promise<void> {
  // 允许外部指定 pnpm：打包环境用随包的那份，开发/预演用 PATH 上的即可。
  const command = process.env.SSID_PLUGIN_PNPM ?? 'pnpm'
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, [...args], {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, npm_config_yes: 'true' },
    })
    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`ssid plugins: pnpm ${args.join(' ')} exited with ${String(code)}`))
    })
  })
}

/**
 * 拍平拷出 `node_modules` 里所有包，返回包名清单。
 *
 * 用 dereference 拷贝而不是保留链接：pnpm 的符号链接指向临时 staging 目录里的 `.pnpm`，
 * 那个目录在脚本结束时会被删掉，留下的是断链。
 * @param modules - staging 的 `node_modules`。
 * @param out - 插件集输出目录。
 * @returns 已拷出的包名。
 */
function flattenPackages(modules: string, out: string): string[] {
  const names: string[] = []
  const copy = (from: string, to: string, name: string): void => {
    cpSync(from, to, { recursive: true, dereference: true })
    names.push(name)
  }
  for (const entry of readdirSync(modules, { withFileTypes: true })) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    if (entry.name.startsWith('.')) continue // .bin / .pnpm / .modules.yaml
    if (entry.name.startsWith('@')) {
      mkdirSync(join(out, entry.name), { recursive: true })
      for (const scoped of readdirSync(join(modules, entry.name), { withFileTypes: true })) {
        if (!scoped.isDirectory() && !scoped.isSymbolicLink()) continue
        copy(join(modules, entry.name, scoped.name), join(out, entry.name, scoped.name), `${entry.name}/${scoped.name}`)
      }
      continue
    }
    copy(join(modules, entry.name), join(out, entry.name), entry.name)
  }
  return names
}

/**
 * 把一份已下好的 codegraph 引擎拷进刚装好的包里，跳过 postinstall 的联网下载。
 *
 * 引擎是 **100 MB 级、平台特定**的二进制（Windows 上 `codegraph-server-win32-x64.exe`
 * 约 100 MB + `onnxruntime.dll` 约 11 MB），由包的 postinstall 从 GitHub release 现下，
 * 而且**没有机器级缓存**（`~/.codegraph/` 只放索数据库与模型，不放引擎）。打包机网络抖动时
 * 那一步会长时间挂住：2026-09-26 实测卡了 24 分钟、`.partial` 文件仍接近 0 字节。
 *
 * 所以允许用 `SSID_CODEGRAPH_ENGINE_DIR` 指向另一份已下好的 `bin/` 复用；
 * **版本必须逐字相符** —— 引擎与包的协议是对齐的，混用只会在运行时炸。
 * @param packageDir - staging 里刚装好的 codegraph-mcp 包目录。
 * @param engineDir - 已下好的引擎目录（含 `.engine-version`）。
 */
function stageCodeGraphEngine(packageDir: string, engineDir: string): void {
  const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as { version?: string }
  const marker = join(engineDir, '.engine-version')
  const staged = existsSync(marker) ? readFileSync(marker, 'utf8').trim() : undefined
  if (staged === undefined || staged !== manifest.version) {
    throw new Error(
      `ssid plugins: 引擎版本不符（包 ${String(manifest.version)} / 引擎 ${String(staged)}），拒绝混用`,
    )
  }
  const bin = join(packageDir, 'bin')
  for (const entry of readdirSync(engineDir)) {
    if (!/^(?:codegraph-server-.+\.exe|onnxruntime\.dll|\.engine-version)$/u.test(entry)) continue
    cpSync(join(engineDir, entry), join(bin, entry))
  }
  console.log(`ssid plugins: codegraph engine reused (${String(staged)})`)
}

async function main(): Promise<void> {
  const templateDir = process.env.SSID_PROFILE_TEMPLATE_DIR ?? DEFAULT_TEMPLATE
  const manifestPath = join(templateDir, 'package.json')
  if (!existsSync(manifestPath)) {
    throw new Error(`ssid plugins: 发版基准不存在 ${manifestPath}；用 SSID_PROFILE_TEMPLATE_DIR 指定`)
  }
  const template = JSON.parse(readFileSync(manifestPath, 'utf8')) as TemplateManifest
  const bundles = (template.dsh?.profile?.bundles ?? []).filter(name => !isInBoxBundle(name))
  if (bundles.length === 0) throw new Error(`ssid plugins: ${manifestPath} 没有声明任何非内核 bundle`)

  // `file:./vendor/x` 要按模板目录解析成绝对路径 —— staging 在临时目录里，相对路径会指错。
  const dependencies: Record<string, string> = {}
  for (const [name, specifier] of Object.entries(template.dependencies ?? {})) {
    if (isInBoxBundle(name)) continue
    dependencies[name] = specifier.startsWith('file:')
      ? `file:${resolve(templateDir, specifier.slice('file:'.length))}`
      : specifier
  }

  const out = process.env.SSID_PLUGIN_SET_OUT ?? join(resolveDesktopTargetBuildPaths().root, 'ssid-plugins')
  const staging = mkdtempSync(join(tmpdir(), 'ssid-plugins-'))
  try {
    writeFileSync(join(staging, 'package.json'), `${JSON.stringify({
      name: 'ssid-plugins-staging', private: true, dependencies,
    }, undefined, 2)}\n`)
    // codegraph-mcp 的 postinstall 会下载引擎（Windows 上是 codegraph-server-*.exe）；
    // pnpm ≥10 默认拦构建脚本，必须显式放行，否则装出来的是跑不起来的空壳。
    writeFileSync(join(staging, 'pnpm-workspace.yaml'), [
      'packages:',
      '  - .',
      '',
      'nodeLinker: hoisted',
      'autoInstallPeers: false',
      'allowBuilds:',
      "  '@astudioplus/codegraph-mcp': true",
      '',
    ].join('\n'))
    // 给了引擎目录就走「不跑构建脚本 + 自己拷引擎」，否则交给 postinstall 正规下载。
    const engineDir = process.env.SSID_CODEGRAPH_ENGINE_DIR
    const installArgs = engineDir === undefined ? ['install', '--prod'] : ['install', '--prod', '--ignore-scripts']
    await runPnpm(installArgs, staging)
    if (engineDir !== undefined) {
      stageCodeGraphEngine(join(staging, 'node_modules', '@astudioplus', 'codegraph-mcp'), engineDir)
    }

    // **不装内核包**：内核包由安装锚点 `<runtimeDir>/node_modules/@deepseek-ai/*` 经运行时
    // 解析表提供，插件集里再带一份会盖掉锚点那份 —— 2026-09-26 实测：带进去的 `dsh-settings`
    // 等版本与内核不一致，启动直接 `TypeError: this.load is not a function`，26 个插件
    // （连内核自己的 `dsh-llm` / `dsh-tools` 都算上）failed to import。插件集只管插件侧的
    // 传递依赖；插件对 `@deepseek-ai/*` 的 import 由解析表的 installation scope 满足。

    rmSync(out, { recursive: true, force: true })
    // 包一律放在 `node_modules/` 下，**不能平铺在插件集根目录**：插件加载时 Node 从它的
    // 真实路径（链接会被 realpath 解析）逐级向上找依赖，平铺会让传递依赖的 import 全部失败、
    // 插件树**静默不加载**（见 `src/ssid/profile-seed.ts` 里 pluginSetModules 的注释）。
    const modulesOut = join(out, 'node_modules')
    mkdirSync(modulesOut, { recursive: true })
    const packages = flattenPackages(join(staging, 'node_modules'), modulesOut)

    const missing = bundles.filter(name => !packages.includes(name))
    if (missing.length > 0) {
      throw new Error(`ssid plugins: bundle 声明了却没装出来：${missing.join(', ')}`)
    }
    writeFileSync(join(out, SSID_PLUGIN_SET_MANIFEST), `${JSON.stringify({
      schemaVersion: 1,
      bundles,
      packages: [...packages].sort(),
    }, undefined, 2)}\n`)
    console.log(`ssid plugins: ${String(bundles.length)} bundles / ${String(packages.length)} packages → ${out}`)
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

await main()

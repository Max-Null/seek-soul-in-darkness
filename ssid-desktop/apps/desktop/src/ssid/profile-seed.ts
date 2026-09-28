/**
 * 思灵插件集接入 profile（fork 版；A′ 交付形态的壳侧实现）。
 *
 * ## 要解决的问题
 *
 * fork 版跑在官方 DSH 桌面基座上，它的 profile 由 `createPluginProfile()` →
 * `initProfile()` 建立 —— 那一步**只写骨架**（`package.json` / `cordis.patch.yml` /
 * `pnpm-workspace.yaml`），既不含思灵的插件声明，也不跑包管理器。自建壳时代这份内容
 * 靠 `dsh-runtime.tar.gz` 归档整体覆盖铺入，而 fork 的打包链不带该归档，于是
 * **新装机拿不到插件集**。
 *
 * ## 为什么不能只把插件塞进随包闭包
 *
 * 2026-09-26 实测（`.ssid-build` 三次对照实验）：插件**本体**与它的 client 半都不走
 * `resolveBundleDir` 的「安装锚点优先」——那条契约只决定 **bundle 的 `cordis.patch.yml`
 * 从哪读**。插件本体走的是运行时解析表
 * （`packages/boot/app-boot/src/profile.ts:436-462`：installation scope = installAnchor 的
 * **依赖图 BFS** + profile scope），而 installAnchor 是
 * `~/.dsh/dsh-runtimes/dsh-primary-runtime/node_modules/@deepseek-ai/dsh/package.json`
 * （`apps/desktop-host/src/index.ts:26`）——官方 npm 包的依赖图里不会有 `@max-null/*`。
 *
 * **实测对照**（同一台 dev，四次启动）：实体只放锚点 → 插件完全静默不加载；
 * 锚点与 profile 各一份 → 只有 profile 那份加载；把实体放到 installAnchor 的解析链上 →
 * 仍然不加载；**在 profile 的 `node_modules` 里放一个指向外部实体的目录链接 → 正常加载**，
 * 且 client 半进入渲染进程清单。
 *
 * ## 本模块的做法
 *
 * 实体留在随包插件集目录（一份，不复制），profile 里只放**目录链接**——这正好落在
 * `RuntimeResolution.linkedRoots` 这条既有通道上（`linkedProfileRoots()` 会把 profile
 * 的 `node_modules` 下指向外部的链接收进解析表）。同时：
 *
 * 1. 链接缺席才建，已存在一律不动 —— **用户自装/自改的那份优先**；
 * 2. `dsh.profile.bundles` 只追加缺失项，不清洗用户自己的 bundle；
 * 3. `dependencies` 写 `link:<绝对路径>`，与链接语义一致，用户日后跑 `pnpm install`
 *    也不会把条目换成 registry 上的另一份。
 *
 * 所有写文件均为 UTF-8 无 BOM（工作区铁律）。
 */

import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** 插件集自述文件名（随包提供，声明要接入的 bundle 与顺序）。 */
export const SSID_PLUGIN_SET_MANIFEST = 'ssid-plugins.json'

/** 插件集自述文件内容。 */
export interface SsidPluginSetManifest {
  readonly schemaVersion: number
  /** 要写进 `dsh.profile.bundles` 的包名，按加载顺序。 */
  readonly bundles: readonly string[]
  /**
   * 要链接进 profile 的**全部**包（默认等于 {@link bundles}）。
   *
   * 为什么要分开：插件的非 peer 依赖（pnpm 装出来的传递依赖、以及不是 bundle 的
   * 纯依赖如 MCP CLI）也必须能在 profile 的 `node_modules` 里解析到，否则插件 import 时失败；
   * 但它们不该出现在 `dsh.profile.bundles` 里 —— 那不是 bundle，写进去内核会当 bundle 去解析。
   */
  readonly packages?: readonly string[]
}

/** {@link seedSsidProfile} 的输入。 */
export interface SsidProfileSeedInput {
  /** profile 目录（`$DSH_HOME/profiles/<名>`）。 */
  readonly profileDir: string
  /** 随包插件集根目录：其下按 `name` 或 `@scope/name` 摆放各插件实体。 */
  readonly pluginSetRoot: string
  /** 落日志钩子（省略则静默）。 */
  readonly log?: (text: string) => void
}

/** {@link seedSsidProfile} 的结果，供启动日志与自检使用。 */
export interface SsidProfileSeedSummary {
  /** 本次新建链接的包名。 */
  readonly linked: readonly string[]
  /** 链接已存在、按「用户优先」原则未动的包名。 */
  readonly kept: readonly string[]
  /** 清单声明了、但插件集里找不到实体的包名 —— 非空即交付不完整。 */
  readonly missing: readonly string[]
  /** 本次追加进 `dsh.profile.bundles` 的包名。 */
  readonly bundlesAdded: readonly string[]
}

/**
 * 读插件集自述。缺失或损坏时返回 undefined —— 调用方据此跳过接入，
 * 不因为一个可选文件让应用起不来。
 * @param pluginSetRoot - 插件集根目录。
 * @returns 解析后的自述，或 undefined。
 */
export function readPluginSetManifest(pluginSetRoot: string): SsidPluginSetManifest | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(pluginSetRoot, SSID_PLUGIN_SET_MANIFEST), 'utf8'))
    if (parsed === null || typeof parsed !== 'object') return undefined
    const bundles = (parsed as { bundles?: unknown }).bundles
    if (!Array.isArray(bundles)) return undefined
    const names = (value: unknown): string[] => Array.isArray(value)
      ? value.filter((name): name is string => typeof name === 'string' && name !== '')
      : []
    const packages = names((parsed as { packages?: unknown }).packages)
    return {
      schemaVersion: Number((parsed as { schemaVersion?: unknown }).schemaVersion ?? 1),
      bundles: names(bundles),
      ...packages.length === 0 ? {} : { packages },
    }
  } catch {
    return undefined
  }
}

/**
 * 插件集里各包所在的目录。
 *
 * **必须是 `node_modules`**，不能把包平铺在插件集根下：插件加载时 Node 从它的**真实路径**
 * （目录链接会被 realpath 解析）逐级向上找依赖，而插件的传递依赖（`ws` / `yaml` / `mermaid`
 * 这类）不在它自己目录里、只平铺在这一层。少了这层 `node_modules`，那些 `import` 全部失败，
 * 症状是插件树**静默不加载** —— 2026-09-26 实测：3 个插件 `pending (waiting for service:
 * betterSidebar)`、应用直接拒绝启动，日志里连一句「加载失败」都没有。
 * 同一条教训工作区早有记录（手册坑 #42：链接目标所在链路必须有 `node_modules`）。
 * @param pluginSetRoot - 插件集根目录。
 * @returns 存放各包的目录。
 */
function pluginSetModules(pluginSetRoot: string): string {
  return join(pluginSetRoot, 'node_modules')
}

/**
 * 列出插件集里的包名。认识两级布局（`@scope/name` 与裸 `name`），
 * 只收有 `package.json` 的目录。
 * @param pluginSetRoot - 插件集根目录。
 * @returns 包名数组（未排序，调用方按需排）。
 */
export function listPluginPackages(pluginSetRoot: string): string[] {
  const names: string[] = []
  const modules = pluginSetModules(pluginSetRoot)
  let entries
  try {
    entries = readdirSync(modules, { withFileTypes: true })
  } catch {
    return names // 插件集目录不存在：交给调用方按「全缺」处理
  }
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    if (entry.name.startsWith('@')) {
      for (const scoped of readdirSync(join(modules, entry.name), { withFileTypes: true })) {
        if (!scoped.isDirectory() && !scoped.isSymbolicLink()) continue
        const name = `${entry.name}/${scoped.name}`
        if (existsSync(join(modules, entry.name, scoped.name, 'package.json'))) names.push(name)
      }
      continue
    }
    if (existsSync(join(modules, entry.name, 'package.json'))) names.push(entry.name)
  }
  return names
}

/** `node_modules` 下的落点路径（`@scope/name` 要展开成两级）。 */
function targetPath(profileDir: string, packageName: string): string {
  return join(profileDir, 'node_modules', ...packageName.split('/'))
}

/**
 * 建目录链接。Windows 用 junction（不需要管理员权限，也不需要目标在同一盘），
 * 其余平台用目录符号链接。
 * @param link - 链接路径。
 * @param target - 目标目录（已存在的真实目录）。
 */
function linkDirectory(link: string, target: string): void {
  mkdirSync(dirname(link), { recursive: true })
  symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir')
}

/** 链接声明：与目录链接同义，且让 `pnpm install` 也不会把条目换成 registry 上的另一份。 */
function linkSpecifier(target: string): string {
  // pnpm 的 link: 按路径解析；正斜杠在 Windows 上同样有效，且不必在 JSON 里转义反斜杠。
  return `link:${target.replaceAll('\\', '/')}`
}

/**
 * 把随包插件集接入 profile：建目录链接、补 `dsh.profile.bundles`、写 `link:` 声明。
 *
 * 幂等：链接已存在就跳过；`bundles` 与 `dependencies` 只补缺失项。
 * profile 里已有的一切（用户自装插件、用户自己的 bundle、用户改过的声明）都不动。
 * @param input - profile 目录与插件集根目录。
 * @returns 本次接入的摘要。
 */
export function seedSsidProfile(input: SsidProfileSeedInput): SsidProfileSeedSummary {
  const { profileDir, pluginSetRoot, log = () => {} } = input
  const manifest = readPluginSetManifest(pluginSetRoot)
  if (manifest === undefined) {
    log(`plugin set: no usable ${SSID_PLUGIN_SET_MANIFEST} under ${pluginSetRoot}; profile left untouched`)
    return { linked: [], kept: [], missing: [], bundlesAdded: [] }
  }

  const present = new Set(listPluginPackages(pluginSetRoot))
  const linked: string[] = []
  const kept: string[] = []
  // 链接范围是 packages（含传递依赖与 MCP CLI 这类非 bundle 的纯依赖）；
  // 只有 bundles 里的才进 `dsh.profile.bundles`。
  const linkTargets = manifest.packages ?? manifest.bundles

  for (const packageName of linkTargets) {
    if (!present.has(packageName)) continue // 由 missing 统一报
    const link = targetPath(profileDir, packageName)
    if (existsSync(link) || isLinkEntry(link)) {
      kept.push(packageName)
      continue
    }
    try {
      linkDirectory(link, join(pluginSetModules(pluginSetRoot), ...packageName.split('/')))
      linked.push(packageName)
    } catch (error) {
      // 单个包链接失败不该挡住启动；它会以「声明了但解析不到」的形式出现在 missing 里。
      log(`plugin set: link failed for ${packageName}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const missing = [...new Set([...manifest.bundles, ...linkTargets])].filter(name => !present.has(name))
  // 只把**真的随包了**的写进声明：写进去却解析不到的条目，内核是静默跳过的
  // （client 清单少一行，`Failed to load plugins` 一次都不出现）—— 那正是这条交付链
  // 最该避免的失败形态，不能靠「users 会去看日志」兜底。缺失由 missing 单独报出。
  const shippable = manifest.bundles.filter(name => present.has(name))
  const bundlesAdded = mergeProfileManifest(profileDir, shippable, pluginSetRoot, log)
  mergeProfilePatch(profileDir, pluginSetRoot, log)
  log(
    `plugin set: linked=${String(linked.length)} kept=${String(kept.length)}`
    + ` missing=${String(missing.length)} bundlesAdded=${String(bundlesAdded.length)}`,
  )
  return { linked, kept, missing, bundlesAdded }
}

/**
 * 该路径上是否存在条目。用 `lstat` 而不是 `existsSync`：后者会跟随链接，
 * 目标被删掉时会误判为「不存在」，于是我们覆盖掉一个断链——那是用户的痕迹，不该动。
 * @param path - 待检查路径。
 * @returns 存在任何条目（文件、目录或链接）则为 true。
 */
function isLinkEntry(path: string): boolean {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}

/**
 * 合并 profile 的 `package.json`：追加缺失的 bundle 与 `link:` 声明。
 * 已有键一律不覆盖 —— 用户改过的版本优先，旧版插件被升级包替换时也靠这条保住用户层。
 * @param profileDir - profile 目录。
 * @param bundles - 要声明的 bundle 包名。
 * @param pluginSetRoot - 插件集根目录（`link:` 目标）。
 * @param log - 落日志钩子。
 * @returns 本次追加进 `dsh.profile.bundles` 的包名。
 */
function mergeProfileManifest(
  profileDir: string,
  bundles: readonly string[],
  pluginSetRoot: string,
  log: (text: string) => void,
): string[] {
  const manifestPath = join(profileDir, 'package.json')
  if (!existsSync(manifestPath)) return [] // 骨架还没建：交给下一次启动
  let manifest: Record<string, unknown>
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
  } catch (error) {
    log(`plugin set: profile manifest unreadable (${error instanceof Error ? error.message : String(error)}); skipped`)
    return []
  }

  const dsh = (manifest['dsh'] ??= {}) as Record<string, unknown>
  const profile = (dsh['profile'] ??= {}) as Record<string, unknown>
  const current = Array.isArray(profile['bundles']) ? (profile['bundles'] as unknown[]).filter((n): n is string => typeof n === 'string') : []
  const wanted = bundles.filter(name => !current.includes(name))
  if (wanted.length > 0) profile['bundles'] = [...current, ...wanted]

  const dependencies = (manifest['dependencies'] ??= {}) as Record<string, unknown>
  for (const name of bundles) {
    if (dependencies[name] !== undefined) continue
    dependencies[name] = linkSpecifier(join(pluginSetModules(pluginSetRoot), ...name.split('/')))
  }

  if (wanted.length === 0) return []
  writeFileSync(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`, 'utf8')
  return wanted
}

/** patch 层文件名：随包出厂的那份与 profile 自己的那份同名。 */
export const PATCH_FILENAME = 'cordis.patch.yml'

/** `- insert:` 块内的一个缩进子条目。 */
export interface PatchEntry {
  /** 子条目自己的 id；没有 id 的按「用户的」处理 —— 宁可多留，不可误删。 */
  readonly id: string | null
  /** 子条目正文（含其 config 行）。 */
  readonly body: string
}

/** 一个顶层 patch 条目：正文，以及块内出现的全部 loader 条目 id。 */
export interface PatchBlock {
  /** 块内出现的 id（顶层 `- id: x` 与 `- insert:` 里缩进的内层 id 都算）。 */
  readonly ids: readonly string[]
  /** 块的正文（首行 `- ` 起、到下一块前，已去尾空行）。 */
  readonly body: string
  /** 块首到首个缩进子条目之前的原文（即 `- insert:` 那一行）。顶层块没有子条目，此处为空。 */
  readonly preamble: string
  /** 缩进子条目，按出现顺序。合并按**子条目**判归属，不是整块。 */
  readonly entries: readonly PatchEntry[]
}

/** 收集过程中的块：块内出现的 id、原始行，以及子条目的起始行号。 */
interface PatchBlockDraft {
  readonly ids: string[]
  readonly lines: string[]
  readonly entries: { id: string | null; start: number }[]
}

/**
 * 拆开 patch 文件：头部原文 + 顶层条目块。
 *
 * 不解析 YAML —— `!!js` 表达式必须原样搬运。顶层条目的判据是行首 `- `，
 * 块内 id 用行级正则取：够用，且不必为一个合并动作引入 YAML 依赖。
 * @param text - patch 文件全文。
 * @returns 头部（首个顶层条目之前的原文）与按出现顺序排列的块。
 */
export function splitPatchFile(text: string): { head: string; blocks: PatchBlock[] } {
  const lines = text.split(/\r?\n/u)
  const first = lines.findIndex(line => /^- \S/u.test(line))
  // 空骨架的 `[]` 是合法顶层数组，但要追加条目就必须去掉它：留着会让顶层出现两个根。
  const head = (first === -1 ? lines : lines.slice(0, first))
    .filter(line => !/^\s*\[\s*\]\s*$/u.test(line))
    .join('\n')
    .replace(/\s+$/u, '')
  const blocks: PatchBlockDraft[] = []
  const current = (): PatchBlockDraft | undefined => blocks[blocks.length - 1]
  for (const line of first === -1 ? [] : lines.slice(first)) {
    if (/^- \S/u.test(line)) {
      blocks.push({ ids: [], lines: [line], entries: [] })
    } else {
      const block = current()
      block?.lines.push(line)
      // 缩进子条目（`- insert:` 的成员）：记住它的起始行，供按子条目判归属时精确切分。
      if (block !== undefined && isEntryStart(line)) {
        block.entries.push({ id: /^\s+- id:\s*([A-Za-z0-9_@/.-]+)\s*$/u.exec(line)?.[1] ?? null, start: block.lines.length - 1 })
      }
    }
    const id = /^\s*-?\s*id:\s*([A-Za-z0-9_@/.-]+)\s*$/u.exec(line)?.[1]
    if (id !== undefined) current()?.ids.push(id)
  }
  return {
    head,
    blocks: blocks.map((block) => {
      const body = block.lines.join('\n').replace(/\s+$/u, '')
      // 顶层 `- id: x` 块没有缩进子条目：entries 为空、整块由 body 承载。
      const firstStart = block.entries[0]?.start ?? block.lines.length
      return {
        ids: block.ids,
        body,
        preamble: block.lines.slice(0, firstStart).join('\n').replace(/\s+$/u, ''),
        entries: block.entries.map((entry, index) => ({
          id: entry.id,
          body: block.lines.slice(entry.start, block.entries[index + 1]?.start ?? block.lines.length)
            .join('\n').replace(/\s+$/u, ''),
        })),
      }
    }),
  }
}

/**
 * 缩进子条目的起始行判据：`- 键:` 形式的 mapping 首行。
 *
 * loader 条目是 mapping，首行必是 `id:` / `name:` 这类键；而 `args:` 下的**标量项**同样以
 * `- ` 开头（`- '--exclude'`、`- !!js …`）。两者混为一谈时，数组项会以「无 id 的子条目」
 * 身份活下来、真条目反而退役，拼出的 `- insert:` 只剩一串数组项，末尾的 `env:` 落进序列里 ——
 * YAML 非法，内核在 boot 阶段就拒绝启动（2026-09-28：装 1.0.0 后启动即崩，
 * `bad indentation of a mapping entry`）。
 * @param line - patch 文件中的一行。
 * @returns 该行是否为一个缩进子条目的起始行。
 */
function isEntryStart(line: string): boolean {
  return /^\s+- [A-Za-z_][A-Za-z0-9_.-]*:/u.test(line)
}

/**
 * 把随包出厂的 patch 条目合并进 profile 的 `cordis.patch.yml`。
 *
 * ## 为什么需要
 *
 * fork 基座的 profile 由 `packages/boot/app-boot/src/profile.ts` 的 `initProfile()` 建立，
 * 那一步写的 `cordis.patch.yml` 是**空骨架**（`project-manager.spec.ts:185` 断言其内容含 `[]`）。
 * 自建壳时代这一层来自 `dsh-runtime.tar.gz` 里的 `profile-template/cordis.patch.yml`
 * （`shell/lib/profile-merge.mjs:12` 做条目级合并），而 fork 的打包链不带该归档 ——
 * 预制 MCP、`connection` 的 405 修复、会话根覆盖于是在新装机上**整套不存在**。
 *
 * ## 合并语义
 *
 * 「出厂条目以模板为准，用户条目原样保留」，判据粒度是**子条目**而不是整块：即便用户把自定义
 * MCP 写进了出厂那个 `- insert:` 块里，也只有命中的那几条退役，其余原样留下。模板里没有的
 * 条目一律不动。出厂条目排在前面、用户条目在后 —— 后者优先，与 patch 层的覆盖方向一致。
 *
 * profile 的文件头原样保留；内容没变就不写盘，免得每次启动都留备份、改 mtime。
 * 写入前备份 `cordis.patch.yml.bak-<时间戳>`；任何失败只落日志，不抛。
 * @param profileDir - profile 目录。
 * @param pluginSetRoot - 随包插件集根目录（出厂 patch 在其中）。
 * @param log - 落日志钩子。
 */
function mergeProfilePatch(profileDir: string, pluginSetRoot: string, log: (text: string) => void): void {
  const templatePath = join(pluginSetRoot, PATCH_FILENAME)
  const profilePath = join(profileDir, PATCH_FILENAME)
  if (!existsSync(templatePath) || !existsSync(profilePath)) return

  let template: { head: string; blocks: PatchBlock[] }
  let existing: { head: string; blocks: PatchBlock[] }
  try {
    template = splitPatchFile(readFileSync(templatePath, 'utf8'))
    existing = splitPatchFile(readFileSync(profilePath, 'utf8'))
  } catch (error) {
    log(`patch merge: unreadable (${error instanceof Error ? error.message : String(error)}); skipped`)
    return
  }

  const owned = new Set(template.blocks.flatMap(block => [...block.ids]))
  if (owned.size === 0) return

  // 按子条目判归属。2026-09-28：此前按整块退役，于是「自定义 MCP 与出厂条目写在同一个
  // `- insert:` 块里」的人会连坐丢掉自己的条目 —— 而那正是最自然的写法。
  const keptBodies: string[] = []
  for (const block of existing.blocks) {
    if (block.entries.length === 0) {
      // 顶层 `- id: x` 块：整块即一条，命中即退役。
      if (!block.ids.some(id => owned.has(id))) keptBodies.push(block.body)
      continue
    }
    const survivors = block.entries.filter(entry => entry.id === null || !owned.has(entry.id))
    if (survivors.length === 0) continue
    keptBodies.push([block.preamble, ...survivors.map(entry => entry.body)]
      .filter(part => part !== '').join('\n'))
  }
  const head = existing.head === '' ? '' : `${existing.head}\n`
  const merged = `${head}${[...template.blocks.map(block => block.body), ...keptBodies].join('\n')}\n`
  if (merged === `${head}${existing.blocks.map(block => block.body).join('\n')}\n`) return

  try {
    copyFileSync(profilePath, `${profilePath}.bak-${String(Date.now())}`)
    writeFileSync(profilePath, merged, 'utf8')
  } catch (error) {
    log(`patch merge: write failed (${error instanceof Error ? error.message : String(error)}); profile unchanged`)
    return
  }
  log(`patch entries: ${String(template.blocks.length)} from plugin set, ${String(keptBodies.length)} kept from profile`)
}

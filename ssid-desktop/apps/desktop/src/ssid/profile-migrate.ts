/**
 * 跨界升级时的 profile 换代。
 *
 * 0.4.0（自建壳 + `dsh-runtime.tar.gz` 归档部署）留下的 profile 在 1.0.0（官方壳基座 +
 * 随包插件集）下起不来：它的 `node_modules` 里是**平铺的实体**，那些副本按 0.1.5 内核编，
 * 0.1.7 加载它们会让绑定在 settings 上的服务缺席，而欢迎页一上来就读设置 ——
 * 症状是 `desktop welcome: Web RPC failed`，且不会留下 `-host.log`（Host 没崩）。
 *
 * 内核侧的 `removeLinkProjections()` 只清 `.dsh-module-fallback` 下的软链投影，
 * **不带该目录的 profile 完全不动**，所以这条路只能在这里走。
 *
 * 判据是「`node_modules/@deepseek-ai/` 下存在成片的**非链接**目录」：正常情况下那些官方包
 * 由内核供给，一个都不该落在 profile 里；换代后的 profile 该目录只剩指向随包插件集的链接。
 *
 * 换代的动作是**改名**（`<profile>.backup-<时间戳>`）而不是删除，并把用户层搬到新 profile：
 * `cordis.patch.yml` 里非出厂的条目，以及自装插件（实体 + 声明）。出厂条目由随包模板在
 * 启动时合并回来，因此这里只搬「随包插件集没有、也不是官方包」的那些。
 */

import {
  cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, renameSync,
  symlinkSync, writeFileSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { PATCH_FILENAME, readPluginSetManifest, splitPatchFile } from './profile-seed.ts'

/** `node_modules/@deepseek-ai/` 下非链接目录达到这个数，即判定为归档部署留下的旧 profile。 */
const LEGACY_ENTITY_THRESHOLD = 10

/** 一个自装插件：换代时从旧 profile 抢救出来的声明与实体。 */
export interface CarriedPlugin {
  /** 包名。 */
  readonly name: string
  /** 原样的声明（`link:` / `github:` / 版本号），写回新 profile 的 `dependencies`。 */
  readonly spec: string
  /** 实体是否已就位（拷目录或重建链接）；未就位的不写进 `bundles`。 */
  readonly restored: boolean
}

/** {@link migrateLegacyProfile} 的结果。 */
export interface LegacyMigration {
  /** 本次是否发生了换代。 */
  readonly migrated: boolean
  /** 未换代或换代失败的原因；成功时为 `legacy-entities`。 */
  readonly reason: string
  /** 旧 profile 的备份目录；未换代时为 null。 */
  readonly backupDir: string | null
  /** 抢救下来的用户层 patch 条目数。 */
  readonly patchEntries: number
  /** 需要在新 profile 里补声明的自装插件。 */
  readonly carried: readonly CarriedPlugin[]
}

/** `renameSync` 备份目录名用的本地时间戳（`YYYYMMDD-HHMMSS`）。 */
function backupStamp(): string {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${String(now.getFullYear())}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
    + `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

/** 人类可读的失败原因。 */
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * `node_modules/@deepseek-ai/` 下**非链接**且带 `package.json` 的目录数。
 *
 * 只数非链接：换代后的 profile 在该 scope 下只剩指向随包插件集的 junction，数出来是 0。
 * @param profileDir - profile 目录。
 * @returns 归档部署遗留的官方包实体数。
 */
export function countLegacyEntities(profileDir: string): number {
  const scope = join(profileDir, 'node_modules', '@deepseek-ai')
  let entries
  try {
    entries = readdirSync(scope, { withFileTypes: true })
  } catch {
    return 0 // 没有该 scope：不是归档部署的形态
  }
  let count = 0
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const path = join(scope, entry.name)
    try {
      if (lstatSync(path).isSymbolicLink()) continue
    } catch {
      continue
    }
    if (existsSync(join(path, 'package.json'))) count += 1
  }
  return count
}

/** 随包插件集模板里由出厂拥有的 loader 条目 id。 */
function templateOwnedIds(pluginSetRoot: string): Set<string> {
  const templatePath = join(pluginSetRoot, PATCH_FILENAME)
  if (!existsSync(templatePath)) return new Set()
  try {
    return new Set(splitPatchFile(readFileSync(templatePath, 'utf8')).blocks.flatMap(block => block.ids))
  } catch {
    return new Set()
  }
}

/**
 * 把旧 profile 的用户层 patch 写成新 profile 的起点。
 *
 * 块级判据与 `mergeProfilePatch` 的留存条件一致：块内还有「无 id 的子条目」或「不属于出厂的
 * 子条目」即整块留下。`initProfile()` 建骨架用的是 `if (!existsSync(patchPath))`，所以这份
 * 不会被覆盖，出厂条目会在启动时合并进来。
 * @param backupDir - 旧 profile 的备份目录。
 * @param profileDir - 新 profile 目录（调用方已建好）。
 * @param pluginSetRoot - 随包插件集根目录（出厂模板在其中）。
 * @returns 留下的块数。
 */
function carryUserPatch(backupDir: string, profileDir: string, pluginSetRoot: string): number {
  const source = join(backupDir, PATCH_FILENAME)
  if (!existsSync(source)) return 0
  const owned = templateOwnedIds(pluginSetRoot)
  const { head, blocks } = splitPatchFile(readFileSync(source, 'utf8'))
  const kept = blocks.filter(block => block.entries.length === 0
    ? !block.ids.some(id => owned.has(id))
    : block.entries.some(entry => entry.id === null || !owned.has(entry.id)))
  if (kept.length === 0) return 0
  const body = `${head === '' ? '' : `${head}\n\n`}${kept.map(block => block.body).join('\n')}\n`
  writeFileSync(join(profileDir, PATCH_FILENAME), body, 'utf8')
  return kept.length
}

/**
 * 把旧 profile 的 `node_modules` 条目搬进新 profile：链接照原样重建，实体整目录拷贝。
 * @param source - 旧 profile 里的包目录。
 * @param destination - 新 profile 里的落点。
 */
function carryPackage(source: string, destination: string): void {
  mkdirSync(dirname(destination), { recursive: true })
  if (lstatSync(source).isSymbolicLink()) {
    symlinkSync(readlinkSync(source), destination, process.platform === 'win32' ? 'junction' : 'dir')
    return
  }
  cpSync(source, destination, { recursive: true })
}

/**
 * 挑出随包插件集与官方内核都不提供的自装插件，并尽力把实体搬到新 profile。
 *
 * `file:` 声明一并跳过：那是 0.4.0 自己的 `vendor/` 副本，正是这次要甩掉的旧内核产物。
 * @param backupDir - 旧 profile 的备份目录。
 * @param profileDir - 新 profile 目录。
 * @param pluginSetRoot - 随包插件集根目录。
 * @param log - 落日志钩子。
 * @returns 抢救出来的插件清单。
 */
function collectCarriedPlugins(
  backupDir: string,
  profileDir: string,
  pluginSetRoot: string,
  log: (text: string) => void,
): CarriedPlugin[] {
  const manifestPath = join(backupDir, 'package.json')
  if (!existsSync(manifestPath)) return []
  const shipped = readPluginSetManifest(pluginSetRoot)
  if (shipped === undefined) {
    // 插件集自述读不到时无法区分「随包」与「自装」，宁可不搬，也不要搬回旧内核的副本。
    log('profile migrate: plugin set manifest unreadable; user plugins left in the backup')
    return []
  }
  const provided = new Set(shipped.packages ?? shipped.bundles)
  let manifest: { dependencies?: Record<string, string>, dsh?: { profile?: { bundles?: unknown } } }
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as typeof manifest
  } catch (error) {
    log(`profile migrate: backup manifest unreadable (${message(error)}); user plugins left in the backup`)
    return []
  }
  const dependencies = manifest.dependencies ?? {}
  const bundles = manifest.dsh?.profile?.bundles
  if (!Array.isArray(bundles)) return []

  const carried: CarriedPlugin[] = []
  // 遍历旧 profile 声明的 `bundles`，而不是 `dependencies`：后者还含运行时框架（`cordis`）
  // 与插件的传递依赖，照单全收会把它们写进新 profile 的 `bundles`，内核随即当 bundle 去解析。
  for (const name of bundles.filter((entry): entry is string => typeof entry === 'string')) {
    if (name.startsWith('@deepseek-ai/') || provided.has(name)) continue
    const spec = dependencies[name]
    // 没有声明、或声明成 0.4.0 自己的 `vendor/` 副本 —— 都是这次要甩掉的旧内核产物。
    if (spec === undefined || spec.startsWith('file:')) continue
    const source = join(backupDir, 'node_modules', ...name.split('/'))
    let restored = false
    if (existsSync(source)) {
      try {
        carryPackage(source, join(profileDir, 'node_modules', ...name.split('/')))
        restored = true
      } catch (error) {
        log(`profile migrate: could not carry ${name} (${message(error)}); it needs a reinstall`)
      }
    }
    carried.push({ name, spec, restored })
  }
  return carried
}

/**
 * 识别旧 profile 并备份重建。必须在 `manager.applyRelease()` **之前**调用 ——
 * 那一步只在 profile 缺骨架时才写文件，先改名才能让它建成新的。
 *
 * 任何一步失败都不抛：失败的代价是「回到手工换代」，而不该是「应用起不来」。
 * @param profileDir - profile 目录（`$DSH_HOME/profiles/<名>`）。
 * @param pluginSetRoot - 随包插件集根目录。
 * @param log - 落日志钩子。
 * @returns 本次换代的结果。
 */
export function migrateLegacyProfile(
  profileDir: string,
  pluginSetRoot: string,
  log: (text: string) => void,
): LegacyMigration {
  const none = (reason: string): LegacyMigration =>
    ({ migrated: false, reason, backupDir: null, patchEntries: 0, carried: [] })
  if (!existsSync(profileDir)) return none('no-profile')

  const entities = countLegacyEntities(profileDir)
  if (entities < LEGACY_ENTITY_THRESHOLD) return none(`not-legacy (${String(entities)} entities)`)

  const backupDir = `${profileDir}.backup-${backupStamp()}`
  try {
    renameSync(profileDir, backupDir)
    mkdirSync(profileDir, { recursive: true })
  } catch (error) {
    log(`profile migrate: rename failed (${message(error)}); profile left unchanged`)
    return none('rename-failed')
  }

  const patchEntries = carryUserPatch(backupDir, profileDir, pluginSetRoot)
  const carried = collectCarriedPlugins(backupDir, profileDir, pluginSetRoot, log)
  log(`profile migrated: ${String(entities)} legacy entities, ${basename(backupDir)} kept as backup, `
    + `patch entries ${String(patchEntries)}, user plugins ${String(carried.length)}`)
  return { migrated: true, reason: 'legacy-entities', backupDir, patchEntries, carried }
}

/**
 * 把换代时抢救出来的自装插件写回新 profile 的 `dependencies` 与 `dsh.profile.bundles`。
 *
 * 必须在骨架建好之后调用。**只声明实体已就位的那些**：写进 `bundles` 却解析不到的条目
 * 内核是静默跳过的，那正是交付链最该避免的失败形态；没就位的留在备份里，交给插件中心重装。
 * @param profileDir - 新 profile 目录。
 * @param carried - {@link migrateLegacyProfile} 返回的清单。
 * @param log - 落日志钩子。
 * @returns 本次写进 `bundles` 的包名。
 */
export function restoreCarriedPlugins(
  profileDir: string,
  carried: readonly CarriedPlugin[],
  log: (text: string) => void,
): readonly string[] {
  const ready = carried.filter(plugin => plugin.restored)
  const skipped = carried.filter(plugin => !plugin.restored).map(plugin => plugin.name)
  if (skipped.length > 0) {
    log(`profile migrate: ${skipped.join(', ')} kept only in the backup — reinstall from the plugin center`)
  }
  if (ready.length === 0) return []

  const manifestPath = join(profileDir, 'package.json')
  if (!existsSync(manifestPath)) return [] // 骨架还没建：交给下一次启动
  let manifest: { dependencies?: Record<string, string>, dsh?: { profile?: { bundles?: string[] } } }
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as typeof manifest
  } catch (error) {
    log(`profile migrate: new manifest unreadable (${message(error)}); user plugins left undeclared`)
    return []
  }
  const dependencies = (manifest.dependencies ??= {})
  const bundles = manifest.dsh?.profile?.bundles
  if (!Array.isArray(bundles)) return []

  const added: string[] = []
  for (const plugin of ready) {
    if (dependencies[plugin.name] === undefined) dependencies[plugin.name] = plugin.spec
    if (!bundles.includes(plugin.name)) bundles.push(plugin.name)
    added.push(plugin.name)
  }
  try {
    writeFileSync(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`, 'utf8')
  } catch (error) {
    log(`profile migrate: could not declare ${added.join(', ')} (${message(error)})`)
    return []
  }
  return added
}

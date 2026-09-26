/**
 * `ssid/profile-seed.ts` 单测：思灵插件集接入 profile 的行为。
 *
 * 这些断言覆盖的都是「装错/装漏了却看不出来」的场景 —— 内核解析不到插件时是**静默跳过**的
 * （实测：应用照常启动，只有渲染进程的 client 清单少一行），所以交付链的正确性只能靠
 * 这类测试守住，实机验证只来得及证明「这一台机器上是对的」。
 */

import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  listPluginPackages, readPluginSetManifest, seedSsidProfile, SSID_PLUGIN_SET_MANIFEST,
} from '../src/ssid/profile-seed.ts'

let root: string
let pluginSetRoot: string
let profileDir: string

/** 造一个插件集：给定包名各建一个含 package.json 的目录，并写出自述清单。 */
function makePluginSet(packages: readonly string[]): void {
  for (const name of packages) {
    const dir = join(pluginSetRoot, 'node_modules', ...name.split('/'))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0' }))
  }
  writeFileSync(join(pluginSetRoot, SSID_PLUGIN_SET_MANIFEST), `${JSON.stringify({ schemaVersion: 1, bundles: packages })}\n`)
}

/** 造一个已初始化的 profile 骨架（`initProfile` 的产物形态）。 */
function makeProfile(bundles: readonly string[] = ['@deepseek-ai/dsh-base']): void {
  mkdirSync(profileDir, { recursive: true })
  writeFileSync(join(profileDir, 'package.json'), `${JSON.stringify({
    name: 'dsh-profile-ssid', private: true, dependencies: {}, dsh: { profile: { bundles } },
  }, undefined, 2)}\n`)
}

const readManifest = (): Record<string, never> & {
  dependencies: Record<string, string>
  dsh: { profile: { bundles: string[] } }
} => JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')) as never

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ssid-profile-seed-'))
  pluginSetRoot = join(root, 'ssid-plugins')
  profileDir = join(root, 'profiles', 'ssid')
  mkdirSync(pluginSetRoot, { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('readPluginSetManifest', () => {
  it('读出自述里的 bundle 顺序', () => {
    makePluginSet(['@max-null/dsh-memory', 'dsh-better-sidebar'])
    expect(readPluginSetManifest(pluginSetRoot)).toEqual({
      schemaVersion: 1,
      bundles: ['@max-null/dsh-memory', 'dsh-better-sidebar'],
    })
  })

  it('自述缺失或损坏时返回 undefined（调用方据此跳过接入，不该让应用起不来）', () => {
    expect(readPluginSetManifest(pluginSetRoot)).toBeUndefined()
    writeFileSync(join(pluginSetRoot, SSID_PLUGIN_SET_MANIFEST), '{ not json')
    expect(readPluginSetManifest(pluginSetRoot)).toBeUndefined()
    writeFileSync(join(pluginSetRoot, SSID_PLUGIN_SET_MANIFEST), JSON.stringify({ bundles: 'nope' }))
    expect(readPluginSetManifest(pluginSetRoot)).toBeUndefined()
  })
})

describe('listPluginPackages', () => {
  it('认识带 scope 与不带 scope 的两种布局，且只收有 package.json 的目录', () => {
    makePluginSet(['@max-null/dsh-memory', 'dsh-better-sidebar'])
    mkdirSync(join(pluginSetRoot, 'node_modules', 'no-manifest'), { recursive: true })
    mkdirSync(join(pluginSetRoot, 'node_modules', '@max-null', 'also-incomplete'), { recursive: true })
    expect(listPluginPackages(pluginSetRoot).sort()).toEqual(['@max-null/dsh-memory', 'dsh-better-sidebar'])
  })
})

describe('seedSsidProfile', () => {
  it('首次接入：建目录链接、补 bundles、写 link: 声明', () => {
    makePluginSet(['@max-null/dsh-memory', 'dsh-better-sidebar'])
    makeProfile()

    const summary = seedSsidProfile({ profileDir, pluginSetRoot })

    expect([...summary.linked].sort()).toEqual(['@max-null/dsh-memory', 'dsh-better-sidebar'])
    expect(summary.kept).toEqual([])
    expect(summary.missing).toEqual([])
    expect(summary.bundlesAdded).toEqual(['@max-null/dsh-memory', 'dsh-better-sidebar'])

    // 链接是真的目录链接，且指向插件集里的实体 —— 加载走的正是这条路径。
    const link = join(profileDir, 'node_modules', '@max-null', 'dsh-memory')
    expect(lstatSync(link).isSymbolicLink()).toBe(true)
    expect(realpathSync(link)).toBe(realpathSync(join(pluginSetRoot, 'node_modules', '@max-null', 'dsh-memory')))

    const manifest = readManifest()
    expect(manifest.dsh.profile.bundles).toEqual([
      '@deepseek-ai/dsh-base', '@max-null/dsh-memory', 'dsh-better-sidebar',
    ])
    // link: 而不是版本号 —— 用户日后跑 pnpm install（插件中心就会跑）才不会把条目换成 registry 那份。
    expect(manifest.dependencies['@max-null/dsh-memory'])
      .toBe(`link:${join(pluginSetRoot, 'node_modules', '@max-null', 'dsh-memory').replaceAll('\\', '/')}`)
  })

  it('幂等：第二次调用只 kept，profile 文件逐字节不变', () => {
    makePluginSet(['@max-null/dsh-memory'])
    makeProfile()
    seedSsidProfile({ profileDir, pluginSetRoot })
    const before = readFileSync(join(profileDir, 'package.json'), 'utf8')

    const summary = seedSsidProfile({ profileDir, pluginSetRoot })

    expect(summary.linked).toEqual([])
    expect(summary.kept).toEqual(['@max-null/dsh-memory'])
    expect(summary.bundlesAdded).toEqual([])
    expect(readFileSync(join(profileDir, 'package.json'), 'utf8')).toBe(before)
  })

  it('用户层优先：已有的链接与声明都不动', () => {
    makePluginSet(['@max-null/dsh-memory'])
    makeProfile(['@deepseek-ai/dsh-base', '@max-null/dsh-memory', 'user-own-bundle'])
    const manifest = readManifest()
    manifest.dependencies['@max-null/dsh-memory'] = '0.9.9'
    writeFileSync(join(profileDir, 'package.json'), `${JSON.stringify(manifest, undefined, 2)}\n`)
    const before = readFileSync(join(profileDir, 'package.json'), 'utf8')
    // 用户自己放了一份（比如手改过）——不能被我们的链接覆盖。
    const occupied = join(profileDir, 'node_modules', '@max-null', 'dsh-memory')
    mkdirSync(occupied, { recursive: true })
    writeFileSync(join(occupied, 'package.json'), JSON.stringify({ name: '@max-null/dsh-memory', version: '9.9.9' }))

    const summary = seedSsidProfile({ profileDir, pluginSetRoot })

    expect(summary.linked).toEqual([])
    expect(summary.kept).toEqual(['@max-null/dsh-memory'])
    expect(readFileSync(join(profileDir, 'package.json'), 'utf8')).toBe(before)
    expect(JSON.parse(readFileSync(join(occupied, 'package.json'), 'utf8')).version).toBe('9.9.9')
    expect(manifest.dsh.profile.bundles).toContain('user-own-bundle')
  })

  it('清单声明了却没随包：missing 报出来，且不为它建链接', () => {
    makePluginSet(['@max-null/dsh-memory'])
    writeFileSync(join(pluginSetRoot, SSID_PLUGIN_SET_MANIFEST), `${JSON.stringify({
      schemaVersion: 1, bundles: ['@max-null/dsh-memory', '@max-null/dsh-not-shipped'],
    })}\n`)
    makeProfile()

    const summary = seedSsidProfile({ profileDir, pluginSetRoot })

    expect(summary.missing).toEqual(['@max-null/dsh-not-shipped'])
    expect(summary.linked).toEqual(['@max-null/dsh-memory'])
    expect(JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')).dsh.profile.bundles)
      .not.toContain('@max-null/dsh-not-shipped')
  })

  it('profile 骨架还没建时不抛，也不写清单（交给下一次启动）', () => {
    makePluginSet(['@max-null/dsh-memory'])
    const summary = seedSsidProfile({ profileDir, pluginSetRoot })
    expect(summary.bundlesAdded).toEqual([])
    expect(summary.linked).toEqual(['@max-null/dsh-memory'])
  })

  it('插件集没有自述时不抛，profile 一动不动', () => {
    makeProfile()
    const before = readFileSync(join(profileDir, 'package.json'), 'utf8')
    const summary = seedSsidProfile({ profileDir, pluginSetRoot })
    expect(summary).toEqual({ linked: [], kept: [], missing: [], bundlesAdded: [] })
    expect(readFileSync(join(profileDir, 'package.json'), 'utf8')).toBe(before)
  })
})

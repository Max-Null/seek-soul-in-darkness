/**
 * `ssid/profile-migrate.ts` 单测：跨界升级的 profile 换代判据与用户层抢救。
 *
 * 换代要改名整个 profile，所以判据宁可漏判也不能误判 ——「正常 profile 一动不动」
 * 与「旧 profile 被换代」在这份用例里同等重要。搬运范围同样如此：少搬一个插件只是
 * 要用户重装，多搬一个运行时框架却会让内核把 `cordis` 当 bundle 去解析。
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { countLegacyEntities, migrateLegacyProfile, restoreCarriedPlugins } from '../src/ssid/profile-migrate.ts'

let root: string
let profileDir: string
let pluginSetRoot: string

/** 造 `count` 个「归档部署遗留的官方包实体」。 */
function makeLegacyEntities(count: number): void {
  for (let index = 0; index < count; index += 1) {
    const name = `@deepseek-ai/dsh-legacy-${String(index)}`
    const dir = join(profileDir, 'node_modules', ...name.split('/'))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '0.1.5-rc.2' }))
  }
}

/** 写 profile 的清单与 patch 层。`bundles` 是插件清单 —— 搬运范围的权威来源。 */
function makeProfile(dependencies: Record<string, string>, patch: string, bundles: readonly string[] = []): void {
  mkdirSync(profileDir, { recursive: true })
  writeFileSync(join(profileDir, 'package.json'), `${JSON.stringify({
    name: 'dsh-profile-ssid',
    private: true,
    dependencies,
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', ...bundles] } },
  }, undefined, 2)}\n`)
  writeFileSync(join(profileDir, 'cordis.patch.yml'), patch)
}

/** 写出厂插件集自述（与模板 patch 同级）。 */
function makePluginSet(packages: readonly string[], templatePatch: string): void {
  mkdirSync(pluginSetRoot, { recursive: true })
  writeFileSync(join(pluginSetRoot, 'ssid-plugins.json'), `${JSON.stringify({ schemaVersion: 1, bundles: packages, packages })}\n`)
  writeFileSync(join(pluginSetRoot, 'cordis.patch.yml'), templatePatch)
}

/** 造一个自装插件的实体目录。 */
function makeInstalled(name: string): void {
  const dir = join(profileDir, 'node_modules', ...name.split('/'))
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0' }))
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ssid-profile-migrate-'))
  profileDir = join(root, 'profiles', 'ssid')
  pluginSetRoot = join(root, 'ssid-plugins')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('countLegacyEntities', () => {
  it('数非链接目录，链接不算', () => {
    makeLegacyEntities(3)
    const scope = join(profileDir, 'node_modules', '@deepseek-ai')
    // 换代后的形态：该 scope 下只剩指向随包插件集的链接。
    symlinkSync(pluginSetRoot, join(scope, 'cosmokit'), 'junction')
    expect(countLegacyEntities(profileDir)).toBe(3)
  })
})

describe('migrateLegacyProfile', () => {
  it('正常 profile 一动不动', () => {
    const scope = join(profileDir, 'node_modules', '@deepseek-ai')
    mkdirSync(scope, { recursive: true })
    symlinkSync(pluginSetRoot, join(scope, 'cosmokit'), 'junction')
    const patch = '# head\n- id: keep-me\n  config:\n    keep: true\n'
    makeProfile({}, patch)
    makePluginSet([], '- id: connection\n  inject: [webRuntime]\n')

    const result = migrateLegacyProfile(profileDir, pluginSetRoot, () => {})

    expect(result.migrated).toBe(false)
    expect(result.reason).toContain('not-legacy')
    expect(readFileSync(join(profileDir, 'cordis.patch.yml'), 'utf8')).toBe(patch)
  })

  it('profile 不存在时不动手', () => {
    const result = migrateLegacyProfile(join(root, 'nope'), pluginSetRoot, () => {})
    expect(result.migrated).toBe(false)
    expect(result.reason).toBe('no-profile')
  })

  it('归档部署的旧 profile：改名备份，用户层搬过去，出厂条目留给模板', () => {
    makeLegacyEntities(12)
    makePluginSet(['@max-null/dsh-memory'], '- id: connection\n  inject: [webRuntime, webServer]\n')
    makeProfile({
      '@max-null/dsh-memory': 'link:/somewhere/dsh-memory', // 随包插件集供的
      '@deepseek-ai/dsh-app-boot': '0.1.5-rc.2', // 官方内核供的
      'acme-plugin': 'github:acme/plugin', // 自装，要搬
      'vendor-thing': 'file:./vendor/thing', // 0.4.0 自己的 vendor 副本，正是要甩掉的
      cordis: '4.0.0-rc.8', // 运行时框架：在 dependencies 里，但不是插件
    }, [
      '# 用户文件头',
      '- id: connection',
      '  inject: [webRuntime]',
      '',
      '- id: keep-me',
      '  config:',
      '    keep: true',
      '',
    ].join('\n'), ['@max-null/dsh-memory', '@deepseek-ai/dsh-app-boot', 'acme-plugin', 'vendor-thing'])
    makeInstalled('acme-plugin')

    const result = migrateLegacyProfile(profileDir, pluginSetRoot, () => {})
    const backupDir = result.backupDir ?? ''

    expect(result.migrated).toBe(true)
    expect(result.reason).toBe('legacy-entities')
    expect(backupDir).toMatch(/\.backup-\d{8}-\d{6}$/u)
    // 旧 node_modules 整个留在备份里，一个都没删。
    expect(existsSync(join(backupDir, 'node_modules', '@deepseek-ai', 'dsh-legacy-0'))).toBe(true)
    // 新 profile 的 patch：用户条目原样留下，出厂条目剔掉（模板会在启动时补回来）。
    const patch = readFileSync(join(profileDir, 'cordis.patch.yml'), 'utf8')
    expect(patch).toContain('# 用户文件头')
    expect(patch).toContain('- id: keep-me')
    expect(patch).not.toContain('connection')
    expect(result.patchEntries).toBe(1)
    // 只搬自装插件：插件集供的、官方的、file: 的、运行时框架都不动。
    expect(result.carried.map(plugin => plugin.name)).toEqual(['acme-plugin'])
    expect(result.carried[0]?.restored).toBe(true)
    expect(existsSync(join(profileDir, 'node_modules', 'acme-plugin', 'package.json'))).toBe(true)
  })

  it('实体在但没进 bundles 的包不搬（运行时框架不是插件）', () => {
    makeLegacyEntities(12)
    makePluginSet([], '- id: connection\n  inject: [webRuntime]\n')
    makeProfile({ cordis: '4.0.0-rc.8', '@standard-schema/spec': '^1.1.0' }, '# head\n')
    makeInstalled('cordis')
    makeInstalled('@standard-schema/spec')

    const result = migrateLegacyProfile(profileDir, pluginSetRoot, () => {})

    expect(result.migrated).toBe(true)
    expect(result.carried).toEqual([])
    expect(existsSync(join(profileDir, 'node_modules', 'cordis'))).toBe(false)
  })

  it('旧 profile 里是链接的插件，搬过去仍建链接', () => {
    makeLegacyEntities(12)
    makePluginSet([], '- id: connection\n  inject: [webRuntime]\n')
    makeProfile({ 'linked-plugin': 'link:H:/dev/linked-plugin' }, '# head\n', ['linked-plugin'])
    const source = join(root, 'dev-linked')
    mkdirSync(source, { recursive: true })
    writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'linked-plugin', version: '1.0.0' }))
    mkdirSync(join(profileDir, 'node_modules'), { recursive: true })
    symlinkSync(source, join(profileDir, 'node_modules', 'linked-plugin'), 'junction')

    const result = migrateLegacyProfile(profileDir, pluginSetRoot, () => {})

    const link = join(profileDir, 'node_modules', 'linked-plugin')
    expect(result.carried).toEqual([{ name: 'linked-plugin', spec: 'link:H:/dev/linked-plugin', restored: true }])
    expect(readFileSync(join(link, 'package.json'), 'utf8')).toContain('linked-plugin')
  })

  it('插件集自述读不到时不搬任何插件（宁可留在备份里，也不搬回旧内核的副本）', () => {
    makeLegacyEntities(12)
    makeProfile({ 'acme-plugin': '1.0.0' }, '# head\n- id: keep-me\n', ['acme-plugin'])
    makeInstalled('acme-plugin')
    mkdirSync(pluginSetRoot, { recursive: true }) // 有目录，但没有自述

    const result = migrateLegacyProfile(profileDir, pluginSetRoot, () => {})

    expect(result.migrated).toBe(true)
    expect(result.carried).toEqual([])
    expect(existsSync(join(profileDir, 'node_modules', 'acme-plugin'))).toBe(false)
  })
})

describe('restoreCarriedPlugins', () => {
  it('只声明实体已就位的插件，未就位的连 dependencies 都不写', () => {
    makeProfile({}, '# head\n')

    const added = restoreCarriedPlugins(profileDir, [
      { name: 'acme-plugin', spec: 'github:acme/plugin', restored: true },
      { name: 'missing-plugin', spec: '1.0.0', restored: false },
    ], () => {})

    expect(added).toEqual(['acme-plugin'])
    const manifest = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
      dsh: { profile: { bundles: string[] } }
    }
    expect(manifest.dependencies['acme-plugin']).toBe('github:acme/plugin')
    expect(manifest.dsh.profile.bundles).toContain('acme-plugin')
    expect(manifest.dependencies['missing-plugin']).toBeUndefined()
    expect(manifest.dsh.profile.bundles).not.toContain('missing-plugin')
  })

  it('骨架还没建时不写（交给下一次启动）', () => {
    const added = restoreCarriedPlugins(profileDir, [{ name: 'acme-plugin', spec: '1.0.0', restored: true }], () => {})
    expect(added).toEqual([])
  })
})

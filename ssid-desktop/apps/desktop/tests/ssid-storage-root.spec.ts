/**
 * 存储根隔离的两条契约：profile patch 的写入形态，以及首次搬家的取舍与幂等。
 *
 * 它们决定「跑过一次官方桌面版会不会再把思灵的会话登记挤掉」。env 注入与 `!!js`
 * 的真实求值只能在真机验证，这里锁的是可重复的那一半：磁盘上的产物。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { STORAGE_ROOT_ENTRY_ID, applyStorageRootIsolation, migrateLegacyStorages } from '../src/ssid/storage-root.ts'

describe('storage root isolation', () => {
  const created: string[] = []
  const savedRoot = process.env['SSID_STORAGE_ROOT']

  /** 一个隔离的临时 home，测试结束即删。 */
  const makeHome = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'ssid-storages-'))
    created.push(dir)
    return dir
  }

  /** 在 home 下建 profile 目录并写一份 patch 文件。 */
  const makeProfile = (home: string, patchBody: string): string => {
    const profile = join(home, 'profiles', 'ssid')
    mkdirSync(profile, { recursive: true })
    writeFileSync(join(profile, 'cordis.patch.yml'), patchBody)
    return profile
  }

  afterEach(() => {
    for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true })
    if (savedRoot === undefined) delete process.env['SSID_STORAGE_ROOT']
    else process.env['SSID_STORAGE_ROOT'] = savedRoot
  })

  it('injects the env var and writes the override into an empty profile skeleton', () => {
    const home = makeHome()
    const profile = makeProfile(home, '[]\n')

    const result = applyStorageRootIsolation(home, profile, 'ssid')

    expect(result.root).toBe(join(home, 'storages-ssid'))
    expect(result.sharedRoot).toBe(join(home, 'storages'))
    expect(process.env['SSID_STORAGE_ROOT']).toBe(result.root)
    expect(result.patch.written).toBe(true)
    const written = readFileSync(join(profile, 'cordis.patch.yml'), 'utf8')
    expect(written).toContain(`- id: ${STORAGE_ROOT_ENTRY_ID}`)
    expect(written).toContain('process.env.SSID_STORAGE_ROOT || dshHomePath("storages")')
    // 空骨架是被替换而不是追加：文件里不该留下原来那行 `[]`。
    expect(written.trimStart().startsWith('- id:')).toBe(true)
  })

  it('appends to a profile that already carries other entries', () => {
    const home = makeHome()
    const profile = makeProfile(home, '- id: user-row\n  config:\n    enabled: true\n')

    const result = applyStorageRootIsolation(home, profile, 'ssid')

    expect(result.patch.written).toBe(true)
    const written = readFileSync(join(profile, 'cordis.patch.yml'), 'utf8')
    expect(written).toContain('- id: user-row')
    expect(written).toContain(`- id: ${STORAGE_ROOT_ENTRY_ID}`)
  })

  it('leaves an already present entry untouched on a second run', () => {
    const home = makeHome()
    const profile = makeProfile(home, '[]\n')

    applyStorageRootIsolation(home, profile, 'ssid')
    const afterFirst = readFileSync(join(profile, 'cordis.patch.yml'), 'utf8')
    const second = applyStorageRootIsolation(home, profile, 'ssid')

    expect(second.patch.written).toBe(false)
    expect(second.patch.reason).toBe('already-present')
    expect(readFileSync(join(profile, 'cordis.patch.yml'), 'utf8')).toBe(afterFirst)
  })

  it('carries the kernel units over and leaves memory and backups behind', () => {
    const home = makeHome()
    const legacy = join(home, 'storages')
    mkdirSync(join(legacy, 'session_projcache'), { recursive: true })
    writeFileSync(join(legacy, 'workspace.json'), '{"keep":true}')
    writeFileSync(join(legacy, 'schedule.json'), '{}')
    writeFileSync(join(legacy, 'memory.json'), '{"memories":1}')
    writeFileSync(join(legacy, 'query-log.json'), '[]')
    writeFileSync(join(legacy, 'workspace.json.bak-20261002-003811'), 'old')
    writeFileSync(join(legacy, '.abcd.tmp'), '')
    mkdirSync(join(legacy, 'guardian'), { recursive: true })

    const target = join(home, 'storages-ssid')
    const copied = migrateLegacyStorages(legacy, target)

    expect([...copied].sort()).toEqual(['guardian', 'schedule.json', 'session_projcache', 'workspace.json'])
    expect(readFileSync(join(target, 'workspace.json'), 'utf8')).toBe('{"keep":true}')
    expect(existsSync(join(target, 'session_projcache'))).toBe(true)
    // dsh-memory 自建 backend，root 取自 DSH_HOME —— 搬家不该把记忆或它的查询日志带走。
    expect(existsSync(join(target, 'memory.json'))).toBe(false)
    expect(existsSync(join(target, 'query-log.json'))).toBe(false)
    expect(existsSync(join(target, 'workspace.json.bak-20261002-003811'))).toBe(false)
    expect(existsSync(join(target, '.abcd.tmp'))).toBe(false)
    // 旧根一个字节都不删。
    expect(existsSync(join(legacy, 'memory.json'))).toBe(true)
  })

  it('never overwrites what the new root already holds', () => {
    const home = makeHome()
    const legacy = join(home, 'storages')
    const target = join(home, 'storages-ssid')
    mkdirSync(legacy, { recursive: true })
    mkdirSync(target, { recursive: true })
    writeFileSync(join(legacy, 'workspace.json'), '"from-legacy"')
    writeFileSync(join(target, 'workspace.json'), '"written-by-kernel"')

    const copied = migrateLegacyStorages(legacy, target)

    expect(copied).toEqual([])
    expect(readFileSync(join(target, 'workspace.json'), 'utf8')).toBe('"written-by-kernel"')
  })

  it('treats a missing legacy root as nothing to carry', () => {
    const home = makeHome()
    expect(migrateLegacyStorages(join(home, 'storages'), join(home, 'storages-ssid'))).toEqual([])
  })
})

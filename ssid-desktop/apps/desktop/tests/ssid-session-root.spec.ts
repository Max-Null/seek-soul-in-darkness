/**
 * 会话根覆盖的写入形态，以及隔离开关的出厂默认值。
 *
 * 写入实现现在与会话根共用 `installPatchEntry`（见 ssid/profile-patch.ts）——
 * 这条用例锁的是「共用之后行为没有走样」：落盘的是会话根那条表达式，重复调用不动文件。
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SESSION_ROOT_ENTRY_ID, installSessionRootPatch, readSessionRootState } from '../src/ssid/session-root.ts'

describe('session root patch', () => {
  const created: string[] = []

  /** 一个带空骨架 patch 文件的 profile 目录，测试结束连临时 home 一起删。 */
  const makeProfile = (patchBody: string): string => {
    const home = mkdtempSync(join(tmpdir(), 'ssid-session-root-'))
    created.push(home)
    const profile = join(home, 'profiles', 'ssid')
    mkdirSync(profile, { recursive: true })
    writeFileSync(join(profile, 'cordis.patch.yml'), patchBody)
    return profile
  }

  afterEach(() => {
    for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('writes the isolated-root expression once and reports the second run as present', () => {
    const profile = makeProfile('[]\n')

    expect(installSessionRootPatch(profile)).toEqual({ written: true, reason: 'written' })
    const written = readFileSync(join(profile, 'cordis.patch.yml'), 'utf8')
    expect(written).toContain(`- id: ${SESSION_ROOT_ENTRY_ID}`)
    expect(written).toContain('process.env.SSID_SESSION_ISOLATED_ROOT')

    expect(installSessionRootPatch(profile)).toEqual({ written: false, reason: 'already-present' })
  })

  it('reports a profile without a patch file instead of failing', () => {
    const home = mkdtempSync(join(tmpdir(), 'ssid-session-nopatch-'))
    created.push(home)
    expect(installSessionRootPatch(join(home, 'profiles', 'ssid')))
      .toEqual({ written: false, reason: 'no-profile-patch' })
  })

  it('defaults the switch to isolated when the state file is absent', () => {
    const home = mkdtempSync(join(tmpdir(), 'ssid-session-state-'))
    created.push(home)
    expect(readSessionRootState(join(home, 'session-root.json'))).toEqual({ isolated: true })
  })
})

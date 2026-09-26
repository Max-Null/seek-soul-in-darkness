/**
 * `ssid/codegraph-guide.ts` 单测：首次引导该不该问、答案怎么落盘。
 *
 * 这一组的价值在**不该问**的那几条 —— 引导一旦挂错地方就会阻塞启动（见手册坑 #47），
 * 而「已经能自动解析出目录却还弹窗」是实打实的打扰，2026-09-26 之前真实发生过。
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { codeGraphConfigPath } from '../src/ssid/codegraph-adapt.ts'
import { recordCodeGraphDecision, shouldGuideCodeGraph } from '../src/ssid/codegraph-guide.ts'

let root: string
let home: string
let dshHome: string
let workspace: string

/** 在当前临时 home 里写一份 codegraph 配置。 */
function writeConfig(config: Record<string, unknown>): void {
  mkdirSync(dirname(codeGraphConfigPath(home)), { recursive: true })
  writeFileSync(codeGraphConfigPath(home), `${JSON.stringify(config, undefined, 2)}\n`)
}

/** 在会话根里造一个带 header cwd 的 artifact —— 探测就是读它。 */
function writeSessionArtifact(project: string, sessionId: string, cwd: string): void {
  const dir = join(dshHome, 'sessions-ssid', project, sessionId)
  mkdirSync(dir, { recursive: true })
  const line = `${JSON.stringify({ version: 4, id: sessionId, cwd })}\n`
  writeFileSync(join(dir, 'session.v4.jsonl.zstd'), zstdCompressSync(Buffer.from(line)))
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ssid-codegraph-guide-'))
  home = join(root, 'home')
  dshHome = join(root, 'dsh')
  workspace = join(root, 'workspace')
  mkdirSync(home, { recursive: true })
  mkdirSync(dshHome, { recursive: true })
  mkdirSync(workspace, { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('shouldGuideCodeGraph', () => {
  it('用户已经表过态就不再问（decided 的语义是「别再问了」，不是「已启用」）', () => {
    writeConfig({ decided: true, workspace: null })
    expect(shouldGuideCodeGraph({ dshHome, profileName: 'ssid', home, env: {} })).toBe(false)
  })

  it('env 指定了可用目录时不问', () => {
    expect(shouldGuideCodeGraph({
      dshHome, profileName: 'ssid', home, env: { SSID_MCP_CG_WS: workspace },
    })).toBe(false)
  })

  it('配置里已有可用目录时不问', () => {
    writeConfig({ workspace })
    expect(shouldGuideCodeGraph({ dshHome, profileName: 'ssid', home, env: {} })).toBe(false)
  })

  it('会话探测命中时不问 —— 自动适配成功还弹窗就是打扰', () => {
    writeSessionArtifact('--proj--', 'session-1', workspace)
    expect(shouldGuideCodeGraph({ dshHome, profileName: 'ssid', home, env: {} })).toBe(false)
  })

  it('env 指向的目录不存在时不算数，照问', () => {
    expect(shouldGuideCodeGraph({
      dshHome, profileName: 'ssid', home, env: { SSID_MCP_CG_WS: join(root, 'gone') },
    })).toBe(true)
  })

  it('什么都解析不出来时才问', () => {
    expect(shouldGuideCodeGraph({ dshHome, profileName: 'ssid', home, env: {} })).toBe(true)
  })
})

describe('recordCodeGraphDecision', () => {
  it('写下选择与「已表态」印记，并保留配置里的其他字段', () => {
    writeConfig({ somethingElse: 'keep-me' })
    recordCodeGraphDecision(workspace, home)

    const written = JSON.parse(readFileSync(codeGraphConfigPath(home), 'utf8')) as Record<string, unknown>
    expect(written['workspace']).toBe(workspace)
    expect(written['decided']).toBe(true)
    expect(typeof written['decidedAt']).toBe('string')
    expect(written['somethingElse']).toBe('keep-me')
  })

  it('选「暂不启用」同样记为已表态（否则下次还会问）', () => {
    recordCodeGraphDecision(null, home)
    const written = JSON.parse(readFileSync(codeGraphConfigPath(home), 'utf8')) as Record<string, unknown>
    expect(written['workspace']).toBeNull()
    expect(written['decided']).toBe(true)
    expect(shouldGuideCodeGraph({ dshHome, profileName: 'ssid', home, env: {} })).toBe(false)
  })
})

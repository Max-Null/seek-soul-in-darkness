/**
 * `ssid/session-registry-heal.ts` 单测：换根后的工作区登记自愈。
 *
 * 这里守的是「**自愈本身把数据写坏**」这类失败 —— 它直接改用户的 `workspace.json`，
 * 而那张表有 zod 校验（`packages/workspace/workspace/src/spec.ts` 的 `workspaceRecord`，
 * 五个字段全必填）：少一个 `createdAt`，整张表就读不出来了，比不修还糟。
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { healWorkspaceRegistry } from '../src/ssid/session-registry-heal.ts'

let dshHome: string
let registryFile: string

/** 一条 `workspaceRecord` 的字段全集（顺序无关，比较时排序）。 */
const RECORD_FIELDS = ['createdAt', 'path', 'sessionIds', 'title', 'updatedAt']

/** 写 `~/.dsh/storages/workspace.json` 的最小结构。 */
function writeRegistry(workspaces: Record<string, unknown>, workspaceIds: readonly string[]): void {
  mkdirSync(join(dshHome, 'storages'), { recursive: true })
  writeFileSync(registryFile, `${JSON.stringify({
    tables: { workspaces },
    global: { initialized: true, workspaceIds: [...workspaceIds], archivedSessionIds: [] },
  }, undefined, 2)}\n`)
}

/** 造一个会话文件：`<root>/<cwd 编码目录>/<uuid>/session.jsonl.zstd`，首帧是 session header。 */
function writeSession(root: string, project: string, uuid: string, cwd: string, origin?: string): void {
  const dir = join(dshHome, root, project, uuid)
  mkdirSync(dir, { recursive: true })
  const header = { type: 'session', version: 3, id: uuid, cwd, ...origin === undefined ? {} : { origin } }
  writeFileSync(join(dir, 'session.jsonl.zstd'), zstdCompressSync(Buffer.from(`${JSON.stringify(header)}\n`)))
}

const readRegistry = (): { tables: { workspaces: Record<string, Record<string, unknown>> }, global: { workspaceIds: string[] } } =>
  JSON.parse(readFileSync(registryFile, 'utf8')) as never

beforeEach(() => {
  dshHome = mkdtempSync(join(tmpdir(), 'ssid-registry-heal-'))
  registryFile = join(dshHome, 'storages', 'workspace.json')
})

afterEach(() => {
  rmSync(dshHome, { recursive: true, force: true })
})

describe('healWorkspaceRegistry', () => {
  it('登记与磁盘交集为空时重建，且写出的记录带全 5 个必填字段', () => {
    writeRegistry({
      'ws-old': { path: 'D:\\Gone', title: 'Gone', sessionIds: ['session-00000000-0000-4000-8000-000000000000'], createdAt: 'x', updatedAt: 'x' },
    }, ['ws-old'])
    writeSession('sessions-ssid', 'enc-a', 'aaaaaaaa-1111-4111-8111-111111111111', 'D:\\Project\\alpha')

    const result = healWorkspaceRegistry({ dshHome })

    expect(result.healed).toBe(true)
    expect(result.workspacesCreated).toBe(1)

    const record = Object.values(readRegistry().tables.workspaces)
      .find(entry => entry['path'] === 'D:\\Project\\alpha')
    expect(record).toBeDefined()
    // 少一个字段，`workspaceRecord` 的 zod 校验就让整张工作区表读不出来。
    expect(Object.keys(record ?? {}).sort()).toEqual(RECORD_FIELDS)
    expect(record?.['title']).toBe('alpha')
    expect(record?.['sessionIds']).toEqual(['session-aaaaaaaa-1111-4111-8111-111111111111'])
    expect(typeof record?.['createdAt']).toBe('string')
    expect(typeof record?.['updatedAt']).toBe('string')
  })

  it('新建的工作区进 workspaceIds 顺序表（不进去等于没建）', () => {
    writeRegistry({
      'ws-old': { path: 'D:\\Gone', title: 'Gone', sessionIds: ['session-00000000-0000-4000-8000-000000000000'], createdAt: 'x', updatedAt: 'x' },
    }, ['ws-old'])
    writeSession('sessions-ssid', 'enc-a', 'aaaaaaaa-1111-4111-8111-111111111111', 'D:\\Project\\alpha')

    healWorkspaceRegistry({ dshHome })

    const { tables, global } = readRegistry()
    const created = Object.entries(tables.workspaces)
      .find(([, entry]) => entry['path'] === 'D:\\Project\\alpha')?.[0]
    expect(created).toBeDefined()
    expect(global.workspaceIds).toContain(created)
  })

  it('交集非空时不触发：正常的增删不该被当成脱节', () => {
    writeRegistry({
      'ws-a': {
        path: 'D:\\Project\\alpha',
        title: 'alpha',
        sessionIds: ['session-aaaaaaaa-1111-4111-8111-111111111111'],
        createdAt: 'x',
        updatedAt: 'x',
      },
    }, ['ws-a'])
    writeSession('sessions-ssid', 'enc-a', 'aaaaaaaa-1111-4111-8111-111111111111', 'D:\\Project\\alpha')
    const before = readFileSync(registryFile, 'utf8')

    const result = healWorkspaceRegistry({ dshHome })

    expect(result.healed).toBe(false)
    expect(result.reason).toBe('registry-matches-disk')
    expect(readFileSync(registryFile, 'utf8')).toBe(before)
  })

  it('子代理会话不登记，只补主会话', () => {
    writeRegistry({
      'ws-old': { path: 'D:\\Gone', title: 'Gone', sessionIds: ['session-00000000-0000-4000-8000-000000000000'], createdAt: 'x', updatedAt: 'x' },
    }, ['ws-old'])
    writeSession('sessions-ssid', 'enc-b', 'bbbbbbbb-1111-4111-8111-111111111111', 'D:\\Project\\beta')
    writeSession('sessions-ssid', 'enc-b', 'cccccccc-1111-4111-8111-111111111111', 'D:\\Project\\beta', 'subagent')

    const result = healWorkspaceRegistry({ dshHome })

    expect(result.skippedSubagent).toBe(1)
    expect(result.added).toBe(1)
    expect(result.workspacesCreated).toBe(1)
    const record = Object.values(readRegistry().tables.workspaces)
      .find(entry => entry['path'] === 'D:\\Project\\beta')
    expect(record?.['sessionIds']).toEqual(['session-bbbbbbbb-1111-4111-8111-111111111111'])
  })

  it('cwd 认得出大小写与尾分隔符不同的同一个工作区：只补 sessionIds，不新建', () => {
    writeRegistry({
      'ws-keep': {
        path: 'D:\\Project\\Alpha',
        title: 'Alpha',
        sessionIds: ['session-00000000-0000-4000-8000-000000000000'],
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
      },
    }, ['ws-keep'])
    // 磁盘上这条与 ws-keep 是同一个目录，只是写法不同。
    writeSession('sessions-ssid', 'enc-a', 'dddddddd-1111-4111-8111-111111111111', 'd:\\project\\alpha\\')

    const result = healWorkspaceRegistry({ dshHome })

    expect(result.workspacesCreated).toBe(0)
    expect(result.added).toBe(1)
    const record = readRegistry().tables.workspaces['ws-keep']
    expect(record?.['sessionIds']).toEqual([
      'session-dddddddd-1111-4111-8111-111111111111',
      'session-00000000-0000-4000-8000-000000000000',
    ])
    // 原有字段一个不少，时间戳不被顺手改写。
    expect(Object.keys(record ?? {}).sort()).toEqual(RECORD_FIELDS)
    expect(record?.['createdAt']).toBe('2020-01-01T00:00:00.000Z')
  })

  it('写回前留备份，且没有实际改动时不留备份', () => {
    writeRegistry({
      'ws-old': { path: 'D:\\Gone', title: 'Gone', sessionIds: ['session-00000000-0000-4000-8000-000000000000'], createdAt: 'x', updatedAt: 'x' },
    }, ['ws-old'])
    // 磁盘上只有一个 subagent 会话：读得出来但不登记 → 计划为空 → 不该碰文件。
    writeSession('sessions-ssid', 'enc-b', 'cccccccc-1111-4111-8111-111111111111', 'D:\\Project\\beta', 'subagent')

    const idle = healWorkspaceRegistry({ dshHome })
    expect(idle.healed).toBe(false)
    expect(readdirSync(join(dshHome, 'storages')).filter(name => name.startsWith('workspace.json.bak-'))).toEqual([])

    writeSession('sessions-ssid', 'enc-b', 'bbbbbbbb-1111-4111-8111-111111111111', 'D:\\Project\\beta')
    const healed = healWorkspaceRegistry({ dshHome })
    expect(healed.healed).toBe(true)
    const backups = readdirSync(join(dshHome, 'storages')).filter(name => name.startsWith('workspace.json.bak-'))
    expect(backups).toHaveLength(1)
  })

  it('没有登记文件、登记为空、磁盘为空时都按「不做」处理', () => {
    expect(healWorkspaceRegistry({ dshHome }).reason).toBe('no-registry')

    writeRegistry({}, [])
    writeSession('sessions-ssid', 'enc-a', 'aaaaaaaa-1111-4111-8111-111111111111', 'D:\\Project\\alpha')
    expect(healWorkspaceRegistry({ dshHome }).reason).toBe('nothing-registered')

    writeRegistry({
      'ws-a': { path: 'D:\\Project\\alpha', title: 'alpha', sessionIds: ['session-x'], createdAt: 'x', updatedAt: 'x' },
    }, ['ws-a'])
    rmSync(join(dshHome, 'sessions-ssid'), { recursive: true, force: true })
    expect(healWorkspaceRegistry({ dshHome }).reason).toBe('no-sessions-on-disk')
  })
})

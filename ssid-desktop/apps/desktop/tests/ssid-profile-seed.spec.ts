/**
 * `ssid/profile-seed.ts` 单测：思灵插件集接入 profile 的行为。
 *
 * 这些断言覆盖的都是「装错/装漏了却看不出来」的场景 —— 内核解析不到插件时是**静默跳过**的
 * （实测：应用照常启动，只有渲染进程的 client 清单少一行），所以交付链的正确性只能靠
 * 这类测试守住，实机验证只来得及证明「这一台机器上是对的」。
 */

import { lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
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

describe('出厂 patch 条目合并', () => {
  const MCP_INSERT = [
    '- insert:',
    '    - id: mcp-playwright-headless',
    "      name: '@deepseek-ai/dsh-mcp-client'",
    '',
  ].join('\n')

  /** 写出厂 patch：放在插件集根下，与自述同级（打包链的落点）。 */
  const makePluginSetPatch = (text: string): void => {
    writeFileSync(join(pluginSetRoot, 'cordis.patch.yml'), text)
  }

  /** 写 profile 自己的 patch 层。 */
  const makeProfilePatch = (text: string): void => {
    writeFileSync(join(profileDir, 'cordis.patch.yml'), text)
  }

  const readPatch = (): string => readFileSync(join(profileDir, 'cordis.patch.yml'), 'utf8')

  it('空骨架的 profile 拿到出厂条目：`[]` 必须去掉，文件头必须留住', () => {
    makePluginSet(['@max-null/dsh-memory'])
    makeProfile()
    makePluginSetPatch('# 出厂说明（不该被搬进 profile）\n- id: connection\n  inject: [webRuntime, webServer]\n\n'.concat(MCP_INSERT))
    // `initProfile()` 的产物形态：一段注释 + 裸 `[]`（packages/boot/app-boot/src/profile.ts）。
    makeProfilePatch('# 你自己的 patch 层\n[]\n')

    seedSsidProfile({ profileDir, pluginSetRoot })

    const text = readPatch()
    expect(text).toContain('# 你自己的 patch 层')
    // 留着 `[]` 会让顶层出现两个根，内核解析直接失败。
    expect(text).not.toContain('[]')
    expect(text).toContain('- id: connection')
    expect(text).toContain('- id: mcp-playwright-headless')
    // 出厂文件的注释是给读模板的人看的，不往 profile 里搬。
    expect(text).not.toContain('出厂说明')
  })

  it('出厂条目以模板为准：旧版同名条目退役，用户自己的条目原样保留', () => {
    makePluginSet(['@max-null/dsh-memory'])
    makeProfile()
    makePluginSetPatch('- id: connection\n  inject: [webRuntime, webServer]\n')
    makeProfilePatch([
      '# 用户文件头',
      '- id: connection',
      '  inject: [webRuntime]',
      '',
      '- id: my-own-thing',
      '  config:',
      '    keep: true',
      '',
    ].join('\n'))

    seedSsidProfile({ profileDir, pluginSetRoot })

    const text = readPatch()
    expect(text).toContain('inject: [webRuntime, webServer]')
    expect(text).not.toContain('inject: [webRuntime]\n')
    expect(text).toContain('- id: my-own-thing')
    expect(text).toContain('# 用户文件头')
  })

  it('`insert` 里内嵌的 id 也算出厂条目：同名 insert 不会重复声明', () => {
    makePluginSet(['@max-null/dsh-memory'])
    makeProfile()
    makePluginSetPatch(MCP_INSERT)
    // 0.4.0 归档部署留下的同名条目 —— 新版再追加一条就会撞
    // `duplicate loader entry id`，内核起不来。
    makeProfilePatch(MCP_INSERT.replace(
      "      name: '@deepseek-ai/dsh-mcp-client'\n",
      "      name: '@deepseek-ai/dsh-mcp-client'\n      config:\n        serverName: playwright-headless\n",
    ))

    seedSsidProfile({ profileDir, pluginSetRoot })

    expect(readPatch().match(/mcp-playwright-headless/gu)?.length).toBe(1)
  })

  it('已是最新就不写盘：不留备份、内容逐字节不变', () => {
    makePluginSet(['@max-null/dsh-memory'])
    makeProfile()
    makePluginSetPatch('- id: connection\n  inject: [webRuntime, webServer]\n')
    makeProfilePatch('# head\n- id: connection\n  inject: [webRuntime, webServer]\n')

    seedSsidProfile({ profileDir, pluginSetRoot })

    expect(readPatch()).toBe('# head\n- id: connection\n  inject: [webRuntime, webServer]\n')
    expect(readdirSync(profileDir).filter(name => name.startsWith('cordis.patch.yml.bak-'))).toEqual([])
  })

  it('改动前先备份，插件集没有出厂 patch 时 profile 一动不动', () => {
    makePluginSet(['@max-null/dsh-memory'])
    makeProfile()

    // 没有出厂 patch：一个字都不该动。
    const untouched = '# head\n- id: keep-me\n'
    makeProfilePatch(untouched)
    seedSsidProfile({ profileDir, pluginSetRoot })
    expect(readPatch()).toBe(untouched)

    // 有出厂 patch：写盘前留一份备份。
    makePluginSetPatch('- id: connection\n  inject: [webRuntime, webServer]\n')
    seedSsidProfile({ profileDir, pluginSetRoot })
    const backups = readdirSync(profileDir).filter(name => name.startsWith('cordis.patch.yml.bak-'))
    expect(backups).toHaveLength(1)
    expect(readFileSync(join(profileDir, backups[0] ?? ''), 'utf8')).toBe(untouched)
  })

  it('自定义 MCP 写进出厂那个 insert 块里时，只有出厂条目退役、用户的原样留下', () => {
    // 「跟内置的写在一起」是最自然的写法，而按**整块**判归属会把用户的条目连带删掉 ——
    // 2026-09-28 实机排查确认过这个隐患，判据因此下沉到子条目。
    makePluginSet(['@max-null/dsh-memory'])
    makeProfile()
    makePluginSetPatch(MCP_INSERT)
    makeProfilePatch([
      '- insert:',
      '    - id: mcp-playwright-headless',
      "      name: '@deepseek-ai/dsh-mcp-client'",
      '',
      '    - id: jenkins',
      "      name: '@deepseek-ai/dsh-mcp-client'",
      '',
    ].join('\n'))

    seedSsidProfile({ profileDir, pluginSetRoot })

    const text = readPatch()
    // 用户那条必须活下来。
    expect(text).toContain('- id: jenkins')
    // 出厂那条按模板替换且不重复 —— 同 id 两条会让内核报 duplicate loader entry id。
    expect(text.match(/mcp-playwright-headless/gu)?.length).toBe(1)
    // 两条仍同处一个块，说明是「按子条目摘」而不是「整块重建」。
    expect(text).toMatch(/- id: mcp-playwright-headless[\s\S]*- id: jenkins/u)
  })

  it('出厂块的 args 数组项不算子条目：合并后不留下孤立的数组项块', () => {
    // 2026-09-28 实机：真条目的 `args:` 下是一串以 `- ` 开头的标量项，子条目判据若收下它们，
    // 三个真条目全退役、数组项却按「无 id 的用户条目」留下 —— 拼出的 `- insert:` 只剩数组项，
    // 结尾的 `env:` 落进序列里，内核报 `bad indentation of a mapping entry (176:9)` 拒绝启动。
    makePluginSet(['@max-null/dsh-memory'])
    makeProfile()
    const block = [
      '- insert:',
      '    - id: mcp-codegraph',
      "      name: '@deepseek-ai/dsh-mcp-client'",
      '      config:',
      '        args:',
      "          - !!js 'process.env.SSID_MCP_CG_CLI'",
      "          - '--exclude'",
      "          - 'node_modules'",
      '        env:',
      "          CODEGRAPH_TELEMETRY: 'off'",
      '',
    ].join('\n')
    makePluginSetPatch(block)
    makeProfilePatch(block)

    seedSsidProfile({ profileDir, pluginSetRoot })

    const text = readPatch()
    // 数组项不能另起一个块：那正是坏 YAML 的形态。
    expect(text.match(/^- insert:/gmu)?.length).toBe(1)
    // 它们仍挂在自己的键下，且只保留一份（出厂条目以模板为准，profile 那份整条退役）。
    expect(text).toMatch(/- id: mcp-codegraph[\s\S]*?args:[\s\S]*?- '--exclude'/u)
    expect(text.match(/- '--exclude'/gu)?.length).toBe(1)
    expect(text).toContain("          CODEGRAPH_TELEMETRY: 'off'")
  })

  it('同块的用户条目与出厂 args 共存：用户条目留下，args 不被复制过去', () => {
    makePluginSet(['@max-null/dsh-memory'])
    makeProfile()
    makePluginSetPatch([
      '- insert:',
      '    - id: mcp-codegraph',
      "      name: '@deepseek-ai/dsh-mcp-client'",
      '      config:',
      '        args:',
      "          - !!js 'process.env.SSID_MCP_CG_CLI'",
      "          - '--exclude'",
      '',
    ].join('\n'))
    makeProfilePatch([
      '- insert:',
      '    - id: mcp-codegraph',
      "      name: '@deepseek-ai/dsh-mcp-client'",
      '      config:',
      '        args:',
      "          - !!js 'process.env.SSID_MCP_CG_CLI'",
      "          - '--exclude'",
      '',
      '    - id: jenkins',
      "      name: '@deepseek-ai/dsh-mcp-client'",
      '',
    ].join('\n'))

    seedSsidProfile({ profileDir, pluginSetRoot })

    const text = readPatch()
    expect(text).toContain('- id: jenkins')
    // 用户块的正文只能是他自己那一条 —— 出厂条目的 args 若被当成「无 id 子条目」留下，
    // 这里会变成两份。
    expect(text.match(/!!js 'process\.env\.SSID_MCP_CG_CLI'/gu)?.length).toBe(1)
    expect(text.match(/- '--exclude'/gu)?.length).toBe(1)
  })
})

/**
 * lib/profile-merge.mjs 单测（node:test + tsx）。
 * 覆盖：patch 条目切分/合并、用户插件增量、轻量 semver、pending 护栏。
 * 运行：node --import tsx/esm --test tests/profile-merge.spec.ts
 */
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  snapshotProfileConfigs,
  splitPatchEntries,
  patchEntryId,
  mergeUserPatch,
  computeUserPluginDelta,
  parseVersion,
  compareVersions,
  cleanSpec,
  shouldDropPending,
  buildUpgradeReport,
  SNAPSHOT_FILES,
} from '../lib/profile-merge.mjs'

// 模板 patch（出厂基线，与 profile-template/cordis.patch.yml 同构）
const TEMPLATE_PATCH = `# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries (id-targeted config
# overrides, disables, and insert lists; \`!!js\` expressions allowed).
#
# SSiD 预制 MCP：Playwright MCP（浏览器自动化，默认启用）。
- insert:
    - id: mcp-playwright
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: playwright
        transport: stdio
        command: !!js 'process.env.SSID_MCP_NODE || "node"'
        args:
          - !!js 'process.env.SSID_MCP_PW_CLI'
          - '--headless'
`

// 升级前用户 patch：模板条目 + 用户自装 MCP + 用户禁用条目
const USER_PATCH = TEMPLATE_PATCH + `
- insert:
    - id: mcp-filesystem
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: my-server
        transport: stdio
        command: 'node'
        args: ['C:/tools/my-mcp/index.js']
- disable:
    - id: mcp-playwright
`

const USER_PATCH_NO_COMMENT = `- insert:
    - id: mcp-filesystem
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: my-server
        transport: stdio
        command: 'node'
`

test('splitPatchEntries：模板 patch 切分为 1 条（id=mcp-playwright），头注释不入条目', () => {
  const entries = splitPatchEntries(TEMPLATE_PATCH)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].id, 'mcp-playwright')
  assert.ok(entries[0].text.includes('serverName: playwright'))
})

test('splitPatchEntries：用户 patch（模板+新增 MCP+disable）切分为 3 条', () => {
  const entries = splitPatchEntries(USER_PATCH)
  assert.equal(entries.length, 3)
  assert.deepEqual(entries.map((e) => e.id), ['mcp-playwright', 'mcp-filesystem', 'mcp-playwright'])
})

test('patchEntryId：顶层 id / disable 值 / insert 子 id 三种形态', () => {
  assert.equal(patchEntryId(['- id: foo', '  config: {}']), 'foo')
  assert.equal(patchEntryId(['- disable:', '    - id: bar']), 'bar')
  assert.equal(patchEntryId(['- insert:', '    - id: baz']), 'baz')
  assert.equal(patchEntryId(['- assign: for', '    id: qux']), 'qux')
  assert.equal(patchEntryId(['- insert:', '    - name: nothing-here']), null)
})

test('mergeUserPatch：用户新增 MCP 条目保留（追加），模板同 id 不重复', () => {
  const { text, merged, ids } = mergeUserPatch(USER_PATCH, TEMPLATE_PATCH)
  assert.equal(merged, 1) // 仅 mcp-filesystem 新增；disable mcp-playwright 与模板冲突视为已知
  assert.deepEqual(ids, ['mcp-filesystem'])
  assert.ok(text.startsWith(TEMPLATE_PATCH)) // 模板原文整体在前
  assert.ok(text.includes('mcp-filesystem'))
  assert.equal(text.match(/mcp-playwright/g)?.length, 1) // 模板条目仅一次
  assert.ok(text.includes('!!js')) // 原样保留，不解析
})

test('mergeUserPatch：disable 型用户条目在模板无同 id 时也保留（edit 用户偏好不丢）', () => {
  const oldPatch = TEMPLATE_PATCH + '- disable:\n    - id: dsh-video-preview\n'
  const { merged, ids } = mergeUserPatch(oldPatch, TEMPLATE_PATCH)
  assert.equal(merged, 1)
  assert.deepEqual(ids, ['dsh-video-preview'])
})

test('mergeUserPatch：同类条目不保留（旧=模板 + 测试用例备份）', () => {
  const { merged } = mergeUserPatch(TEMPLATE_PATCH + TEMPLATE_PATCH.slice(0, 10), TEMPLATE_PATCH)
  assert.equal(merged, 0)
})

// 0.2.1 真实形态：模板 insert 块 = playwright + codegraph 两个子条目（同块）
const TEMPLATE_PATCH_DUAL = TEMPLATE_PATCH + `    - id: mcp-codegraph
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: codegraph
        transport: stdio
        command: !!js 'process.env.SSID_MCP_NODE || "node"'
        args:
          - !!js 'process.env.SSID_MCP_CG_CLI'
        env:
          CODEGRAPH_TELEMETRY: 'off'
`

test('mergeUserPatch：用户 MCP 追加进既有 insert 列表（子条目级）——0.2.1 事故回归', () => {
  // 面板/插件中心把新 MCP 追加成 `- insert:` 列表的第三个子条目（顶层条目
  // 仍是同一个 insert 块）——顶层条目级对比会整块误判「模板已有」而丢弃。
  const oldPatch = TEMPLATE_PATCH_DUAL + `    - id: mcp-user-custom
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: my-mcp
        transport: stdio
        command: 'node'
        args: ['C:/tools/my-mcp/index.js']
`
  const { merged, ids, text } = mergeUserPatch(oldPatch, TEMPLATE_PATCH_DUAL)
  assert.equal(merged, 1)
  assert.deepEqual(ids, ['mcp-user-custom'])
  assert.ok(text.includes('mcp-user-custom'), '用户 MCP 子条目必须保留')
  assert.ok(text.includes('mcp-playwright'), '模板 playwright 保持')
  assert.ok(text.includes('mcp-codegraph'), '模板 codegraph 保持')
  assert.ok(text.includes('CODEGRAPH_TELEMETRY'), '模板 codegraph env 保持')
  assert.equal(text.match(/^- /gm)?.length ?? 0, 1, '仍为单顶层 insert 块（合并进块内而非新块）')
})

test('mergeUserPatch：用户 MCP 追加 + 模板无 insert 块时独立成块', () => {
  const userText = `- insert:
    - id: mcp-only-user
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: only
        transport: stdio
        command: 'npx'
`
  const { merged, text } = mergeUserPatch(userText, '# no entries\n')
  assert.equal(merged, 1)
  assert.ok(text.includes('mcp-only-user'))
  assert.ok(text.includes('- insert:'))
})

test('mergeUserPatch：BOM 开头 + 无头注释的旧 patch（编辑器写 BOM 场景）', () => {
  // 旧 patch 第一行就是 - insert:（无 # 注释头）且文件带 UTF-8 BOM——
  // BOM 若未剥离，`\uFEFF- insert:` 会被误判为非条目行，整个块（含用户
  // MCP）被丢弃（对抗审查发现）。
  const oldPatch = '\uFEFF' + TEMPLATE_PATCH + `    - id: mcp-bom-user
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: bom-mcp
        transport: stdio
        command: 'node'
`
  const { merged, text } = mergeUserPatch(oldPatch, TEMPLATE_PATCH)
  assert.equal(merged, 1)
  assert.ok(text.includes('mcp-bom-user'), 'BOM 场景用户 MCP 必须保留')
  assert.equal(text.charCodeAt(0) === 0xFEFF, false, '输出无 BOM')
})

test('mergeUserPatch：多个用户 MCP 子条目全部保留且顺序保持', () => {
  const oldPatch = TEMPLATE_PATCH_DUAL + `    - id: mcp-user-a
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: alpha
        transport: stdio
        command: 'node'
    - id: mcp-user-b
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: beta
        transport: stdio
        command: 'npx'
`
  const { merged, ids, text } = mergeUserPatch(oldPatch, TEMPLATE_PATCH_DUAL)
  assert.equal(merged, 2)
  assert.deepEqual(ids, ['mcp-user-a', 'mcp-user-b'])
  const aIdx = text.indexOf('mcp-user-a')
  const bIdx = text.indexOf('mcp-user-b')
  assert.ok(aIdx !== -1 && bIdx !== -1 && aIdx < bIdx, '用户子条目保持相对顺序')
})

test('mergeUserPatch：用户子条目内的 args !!js/字符串保持原样（不被误切/截断）', () => {
  const oldPatch = TEMPLATE_PATCH + `    - id: mcp-args-user
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: custom
        transport: stdio
        command: !!js 'process.env.SSID_MCP_NODE || "node"'
        args:
          - !!js 'process.env.CUSTOM_CLI'
          - '--flag'
          - '--verbose'
`
  const { merged, text } = mergeUserPatch(oldPatch, TEMPLATE_PATCH)
  assert.equal(merged, 1)
  assert.ok(text.includes("process.env.CUSTOM_CLI"), '!!js 参数行完整保留')
  assert.ok(text.includes("'--flag'"), '字符串参数行完整保留')
  assert.ok(text.includes("'--verbose'"), '字符串参数行完整保留')
})

test('mergeUserPatch：空/损坏输入退回模板原文（绝不写坏 patch）', () => {
  assert.equal(mergeUserPatch('', TEMPLATE_PATCH).text, TEMPLATE_PATCH)
  assert.equal(mergeUserPatch(null, TEMPLATE_PATCH).text, TEMPLATE_PATCH)
  assert.equal(mergeUserPatch(undefined, TEMPLATE_PATCH).text, TEMPLATE_PATCH)
})

test('computeUserPluginDelta：用户插件（模板外依赖/捆绑）被识别为丢失', () => {
  const oldManifest = {
    dependencies: {
      '@max-null/dsh-chat-rail': '0.6.1',
      'dsh-taskboard': '0.1.0',
      'dsh-web-preview-panel': '^0.2.4',
      'cordis': '4.0.0-rc.8',
    },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'dsh-web-preview-panel', 'dsh-taskboard'] } },
  }
  const newManifest = {
    dependencies: {
      '@max-null/dsh-chat-rail': '0.6.1',
      'cordis': '4.0.0-rc.8',
    },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
  }
  const delta = computeUserPluginDelta(oldManifest, newManifest)
  assert.deepEqual(
    delta.depsLost.map((d) => d.name).sort(),
    ['dsh-taskboard', 'dsh-web-preview-panel'],
  )
  assert.deepEqual(delta.bundlesLost.sort(), ['dsh-taskboard', 'dsh-web-preview-panel'])
})

test('parseVersion / compareVersions：常规与 pre-release', () => {
  assert.deepEqual(parseVersion('0.4.2'), { major: 0, minor: 4, patch: 2, pre: null })
  assert.equal(parseVersion('v1.2.3-rc.1').pre, 'rc.1')
  assert.equal(parseVersion('garbage'), null)
  assert.equal(compareVersions('0.4.2', '0.5.0'), -1)
  assert.equal(compareVersions('0.5.0', '0.4.2'), 1)
  assert.equal(compareVersions('0.4.2', '0.4.2'), 0)
  assert.equal(compareVersions('0.4.2', '0.4.2-rc.1'), 1) // 无 pre > 有 pre
  assert.equal(compareVersions('0.4.2-rc.1', '0.4.2'), -1)
  assert.equal(compareVersions('0.4.2-rc.2', '0.4.2-rc.10'), -1) // 数字段
  assert.equal(compareVersions('0.4.2', 'x'), null)
})

test('cleanSpec：去范围前缀', () => {
  assert.equal(cleanSpec('^0.4.2'), '0.4.2')
  assert.equal(cleanSpec('~1.2.3'), '1.2.3')
  assert.equal(cleanSpec('>=0.4.0 <0.5.0'), '0.4.0')
  assert.equal(cleanSpec('0.4.2'), '0.4.2')
})

test('shouldDropPending：回滚/卸载/非 registry 一律丢弃；仅更高版本才装', () => {
  // 声明 0.5.0 > pending 0.4.2：丢弃（0.2.0 事故场景）
  assert.equal(shouldDropPending('0.5.0', '0.4.2'), true)
  // 相等：丢弃（白装）
  assert.equal(shouldDropPending('0.4.2', '0.4.2'), true)
  // 声明带范围前缀
  assert.equal(shouldDropPending('^0.4.3', '0.4.2'), true)
  // 声明更低：保留（正常更新）
  assert.equal(shouldDropPending('0.4.2', '0.4.3'), false)
  // 声明缺失（用户已卸载 / 声明被模板重置）：丢弃
  assert.equal(shouldDropPending(undefined, '0.4.2'), true)
  // vendor 非 registry 声明：丢弃
  assert.equal(shouldDropPending('file:./vendor/dsh-ssid-panels', '0.1.9'), true)
  // 无法解析的声明：保守丢弃
  assert.equal(shouldDropPending('^0.4.x', '0.4.2'), true)
})

test('snapshotProfileConfigs：快照存在的配置文件', () => {
  const dir = mkdtempSync(join(tmpdir(), 'profile-merge-'))
  const profileDir = join(dir, 'profile')
  const backupDir = join(dir, 'backup')
  mkdirSync(profileDir, { recursive: true })
  writeFileSync(join(profileDir, 'package.json'), '{"name":"x"}\n')
  writeFileSync(join(profileDir, 'cordis.patch.yml'), TEMPLATE_PATCH)
  writeFileSync(join(profileDir, 'settings.yaml'), 'locale:\n  preference: zh\n')
  const copied = snapshotProfileConfigs(profileDir, backupDir)
  assert.ok(copied.includes('package.json'))
  assert.ok(copied.includes('cordis.patch.yml'))
  assert.ok(copied.includes('settings.yaml'))
  assert.equal(existsSync(join(backupDir, 'package.json')), true)
  assert.ok(copied.length <= SNAPSHOT_FILES.length)
  // 缺文件不报错
  const copied2 = snapshotProfileConfigs(join(dir, 'nope'), backupDir)
  assert.deepEqual(copied2, [])
})

test('buildUpgradeReport：报告包含丢失插件与合并条目', () => {
  const report = buildUpgradeReport({
    fromRuntime: '0.1.17-0.1.2-alpha.2-2eb3978c',
    toRuntime: '0.2.0-0.1.2-rc.1-e13b24f3',
    snapshotDir: 'C:/snap',
    oldManifest: {
      dependencies: { 'dsh-web-preview-panel': '^0.2.4', '@max-null/dsh-chat-rail': '0.6.1' },
    },
    newManifest: {
      dependencies: { '@max-null/dsh-chat-rail': '0.6.1' },
    },
    patchMerge: { merged: 1, ids: ['mcp-filesystem'] },
  })
  assert.equal(report.userPluginsLost.length, 1)
  assert.equal(report.userPluginsLost[0].name, 'dsh-web-preview-panel')
  assert.equal(report.patchMerged.count, 1)
  assert.ok(Array.isArray(report.notes))
})

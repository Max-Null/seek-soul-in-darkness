import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractVersion, normVersion, parseReleaseNotes } from '../src/release-notes.ts'

const NOTES_OK = `# v0.1.13 发布说明（2026-08-26）

## 内置升级

- **dsh-memory 0.5.2**：注入预算治理
- **dsh-plugin-center 0.2.13**：热更新识别

## 调整

- 移出 dsh-web-preview-panel 预制`

test('extractVersion：首行 # vX.Y.Z 提取', () => {
  assert.equal(extractVersion(NOTES_OK), '0.1.13')
  assert.equal(extractVersion('# 0.1.13 发布说明'), '0.1.13')
  assert.equal(extractVersion('没有版本行\n- 无'), null)
  assert.equal(extractVersion(''), null)
  assert.equal(extractVersion(null), null)
})

test('normVersion：去 v 前缀归一化', () => {
  assert.equal(normVersion('v0.1.13'), '0.1.13')
  assert.equal(normVersion('0.1.13'), '0.1.13')
  assert.equal(normVersion(null), null)
})

test('parseReleaseNotes：标题/日期/分节/过滤空节', () => {
  const parsed = parseReleaseNotes(NOTES_OK)
  assert.equal(parsed.version, '0.1.13')
  assert.equal(parsed.title, 'v0.1.13 发布说明（2026-08-26）')
  assert.equal(parsed.date, '2026-08-26')
  assert.equal(parsed.sections.length, 2)
  assert.equal(parsed.sections[0].heading, '内置升级')
  assert.equal(parsed.sections[0].items.length, 2)
  assert.equal(parsed.sections[1].heading, '调整')
  // 无列表项的节被过滤
  const empty = parseReleaseNotes('# v0.1.13\n\n## 空节\n\n## 有内容\n\n- 项')
  assert.equal(empty.sections.length, 1)
  assert.equal(empty.sections[0].heading, '有内容')
})

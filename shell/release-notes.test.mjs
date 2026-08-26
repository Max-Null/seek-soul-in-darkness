import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractVersion, shouldShow, renderNotes } from './release-notes.mjs'

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

test('shouldShow：版本有条目且未看过才弹（fractal 守卫）', () => {
  // 版本一致 + 从未看过（首次）→ 弹
  assert.equal(shouldShow(NOTES_OK, '0.1.13', ''), true)
  // 本版本看过 → 不弹（每版本只弹一次）
  assert.equal(shouldShow(NOTES_OK, '0.1.13', '0.1.13'), false)
  // 从旧版本升级 → 弹
  assert.equal(shouldShow(NOTES_OK, '0.1.13', '0.1.12'), true)
  // 条目版本 ≠ 当前版本 → 不弹（防错版本弹窗）
  assert.equal(shouldShow(NOTES_OK, '0.1.14', '0.1.12'), false)
  // 无条目 → 不弹
  assert.equal(shouldShow('无版本内容', '0.1.13', ''), false)
  // v 前缀/大小写归一化
  assert.equal(shouldShow('# v0.1.13', 'v0.1.13', '0.1.13'), false)
})

test('renderNotes：标题/日期/节/列表/加粗/转义', () => {
  const r = renderNotes(NOTES_OK)
  assert.equal(r.title, 'v0.1.13 发布说明（2026-08-26）')
  assert.equal(r.date, '2026-08-26')
  assert.ok(r.sectionsHtml.includes('<h3>内置升级</h3>'))
  assert.ok(r.sectionsHtml.includes('<strong>dsh-memory 0.5.2</strong>'))
  assert.ok(r.sectionsHtml.includes('<li>'))
  assert.equal(r.sectionsHtml.includes('调整'), true)

  // XSS 转义：脚本内容不直接进 HTML
  const evil = renderNotes('# v0.1.13\n\n## 安全\n\n- <img src=x onerror=alert(1)>')
  assert.ok(evil.sectionsHtml.includes('&lt;img'))
  assert.ok(!evil.sectionsHtml.includes('<img'))
})

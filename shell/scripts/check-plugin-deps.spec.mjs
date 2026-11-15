/**
 * check-plugin-deps 的自测（骨架纪律：每 gate 一个自测）
 *
 * 纪律同其它门：自测演练**门本身**（构造临时插件集语料，跑真实脚本），自己收尾。
 *
 * 两条用例对应这道门存在的理由：
 * ① 依赖齐全时**不能误报**——2026-11-15 实测踩过：有些包（`@codemirror/legacy-modes`）
 *    的 `exports` 不让 CJS 解析，若只用 `require.resolve` 判断，会把「在」判成「缺」；
 * ② 真缺一个依赖时**必须红**，并且指到具体是哪个包的哪个依赖——否则拿到报错也不知道去补谁。
 *
 * `node --test scripts/check-plugin-deps.spec.mjs` 直接可跑。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.join(HERE, 'check-plugin-deps.mjs')

/** 跑真实门脚本，返回 { code, out }。 */
function runGate(dir) {
  try {
    const out = execFileSync(process.execPath, [GATE, dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { code: 0, out }
  } catch (error) {
    return { code: error.status ?? 1, out: `${error.stdout ?? ''}${error.stderr ?? ''}` }
  }
}

/**
 * 造一个最小插件集。
 * @param {string} bundle - bundle 名。
 * @param {Record<string, string> | undefined} deps - 该插件的 dependencies。
 * @returns {string} 插件集根目录。
 */
function makeSet(bundle, deps) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-deps-'))
  const entity = path.join(dir, 'node_modules', bundle)
  fs.mkdirSync(entity, { recursive: true })
  fs.writeFileSync(path.join(dir, 'ssid-plugins.json'), JSON.stringify({ schemaVersion: 1, bundles: [bundle] }))
  const manifest = { name: bundle, version: '1.0.0' }
  if (deps !== undefined) manifest.dependencies = deps
  fs.writeFileSync(path.join(entity, 'package.json'), JSON.stringify(manifest))
  return dir
}

test('依赖齐全时通过，且不因 exports 限制误报', () => {
  const dir = makeSet('pkg-a', { 'dep-lib': '^1' })
  const depDir = path.join(dir, 'node_modules', 'dep-lib')
  fs.mkdirSync(depDir, { recursive: true })
  // 只有 exports、没有 main：require.resolve 在 CJS 下会失败，但包确实在
  fs.writeFileSync(path.join(depDir, 'package.json'), JSON.stringify({
    name: 'dep-lib',
    version: '1.0.0',
    exports: { '.': { import: './index.mjs' } },
  }))
  const { code, out } = runGate(dir)
  assert.equal(code, 0, out)
  assert.match(out, /全部可解析/)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('缺依赖时失败，并指到「哪个插件 → 哪个依赖」', () => {
  const dir = makeSet('pkg-a', { 'missing-lib': '^1' })
  const { code, out } = runGate(dir)
  assert.equal(code, 1)
  assert.match(out, /pkg-a → missing-lib/)
  fs.rmSync(dir, { recursive: true, force: true })
})

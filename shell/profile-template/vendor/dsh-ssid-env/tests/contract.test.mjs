/**
 * `@max-null/dsh-ssid-env` 的装载契约测试。
 *
 * 主要锁一条事故判据：本插件的 `apply` 会读 `ctx.systemPrompt`，因此必须在
 * `inject` 里声明它——Cordis 的属性代理对未声明的服务直接抛
 * `cannot get property "systemPrompt" without inject`，而这条错误发生在插件
 * 装载期，会把整个 profile 拉不起来（2026-09-17 安装版思灵实测：启动失败、
 * 界面只剩错误页）。声明缺失时下面的断言会红，而不是等到用户装机才炸。
 *
 * 另外锁住插件名与包名一致（bundle patch 按此名挂载），以及「不在 SSiD 内
 * 保持沉默」这一自述前提。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import * as plugin from '../lib/index.mjs'

/** 相对本测试文件定位包根，避免依赖 cwd。 */
const packageRoot = new URL('../', import.meta.url)

test('inject 声明 systemPrompt：apply 会读它，未声明即装载期抛错', () => {
  assert.ok(Array.isArray(plugin.inject), 'inject 必须是数组')
  assert.ok(
    plugin.inject.includes('systemPrompt'),
    `inject 必须包含 systemPrompt，当前为 ${JSON.stringify(plugin.inject)}`,
  )
})

test('插件名与包名一致：bundle patch 按此名挂载', () => {
  const manifest = JSON.parse(readFileSync(new URL('package.json', packageRoot), 'utf8'))
  assert.equal(plugin.name, manifest.name)
})

test('不在 SSiD 内时不注册任何内容：自述不能说谎', () => {
  const saved = process.env.SSID_PROFILE_DIR
  delete process.env.SSID_PROFILE_DIR
  try {
    let calls = 0
    const ctx = { systemPrompt: { section: () => { calls += 1 } } }
    assert.equal(plugin.apply(ctx), undefined)
    assert.equal(calls, 0, '缺少 SSiD 标识时不应注册 system-prompt 段落')
  } finally {
    if (saved === undefined) delete process.env.SSID_PROFILE_DIR
    else process.env.SSID_PROFILE_DIR = saved
  }
})

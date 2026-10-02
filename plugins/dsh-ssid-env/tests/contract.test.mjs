/**
 * `@max-null/dsh-ssid-env` 的装载契约测试。
 *
 * 锁三条判据：
 *
 * ① 事故判据 —— `apply` 会读 `ctx.systemPrompt`，因此必须在 `inject` 里声明它；
 *    漏声明会在**装载期**抛 `cannot get property "systemPrompt" without inject`，
 *    把整棵插件树连同其后的条目一起拉不起来（2026-09-17 安装版思灵实测：启动失败、
 *    界面只剩错误页）。
 *
 * ② 失效判据 —— 桌面壳标识必须按**目标进程里真的存在**的变量探测。这条已经错过两次：
 *    0.1.0 / 0.1.1 读自建壳时代的 `SSID_PROFILE_DIR`；0.1.2 改读 `DSH_SHELL` /
 *    `DSH_PROFILE_DIR`，依据是工具子进程（pwsh）里看得到它们——而工具进程的环境由内核
 *    在 spawn 时按需拼装，**内核自己并没有**这两个变量。结果两版都每次返回 undefined，
 *    不报错、日志无痕，那段提示词自 1.0.0 起一次都没注入（2026-10-03 在装版 1.1.6 上
 *    探针直读内核环境确认）。所以判据取 `SSID_SHELL_VERSION`，并且两个方向都要锁：
 *    在 SSiD 内必须注册，不在 SSiD 内必须沉默。
 *
 * ③ 反例判据 —— 只设 `DSH_SHELL` / `DSH_PROFILE_DIR` 时**必须不注册**。这一条专门把
 *    0.1.2 的错误锁死：任何时候有人想把判据改回那两个变量，这个用例立刻失败。
 *
 * 另外锁住插件名与包名一致（bundle patch 按此名挂载），以及自述必须带上隔离落点与共存
 * 事实——那正是它存在的理由。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import * as plugin from '../lib/index.mjs'

/** 相对本测试文件定位包根，避免依赖 cwd。 */
const packageRoot = new URL('../', import.meta.url)

/** 与探测相关的环境变量；每个用例结束后逐项还原。 */
const ENV_KEYS = [
  'DSH_SHELL',
  'DSH_PROFILE_DIR',
  'DSH_PROFILE',
  'SSID_SESSION_ISOLATED_ROOT',
  'SSID_STORAGE_ROOT',
  'SSID_SHELL_VERSION',
]

/**
 * 在给定环境下执行一段代码，结束后还原全部相关变量。
 * @param values - 本次要设置的环境变量。
 * @param run - 在设置好环境后执行的函数。
 * @returns run 的返回值。
 */
function withEnv(values, run) {
  const saved = new Map(ENV_KEYS.map(key => [key, process.env[key]]))
  try {
    for (const key of ENV_KEYS) delete process.env[key]
    for (const [key, value] of Object.entries(values)) process.env[key] = value
    return run()
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

/**
 * 用替身上下文装载插件。
 * @returns 注册的段落；未注册时 undefined。
 */
function load() {
  let section
  plugin.apply({ systemPrompt: { section: value => { section = value } } })
  return section
}

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
  withEnv({}, () => {
    assert.equal(load(), undefined, '缺少 SSiD 标识时不应注册 system-prompt 段落')
  })
})

test('主判据是 SSID_SHELL_VERSION：内核进程里只有它', () => {
  withEnv({ SSID_SHELL_VERSION: '1.1.6' }, () => {
    assert.ok(load() !== undefined, '壳版本存在时必须注册')
  })
  withEnv({ SSID_SHELL_VERSION: '' }, () => {
    assert.equal(load(), undefined, '壳版本为空串不算标识')
  })
})

test('反例：只有 DSH_SHELL / DSH_PROFILE_DIR 时不注册（0.1.2 就死在这里）', () => {
  withEnv({ DSH_SHELL: '1' }, () => {
    assert.equal(load(), undefined, 'DSH_SHELL 只存在于工具子进程环境，不能当判据')
  })
  withEnv({ DSH_PROFILE_DIR: 'X:\\p' }, () => {
    assert.equal(load(), undefined, 'DSH_PROFILE_DIR 同上')
  })
  withEnv({ DSH_SHELL: '1', DSH_PROFILE_DIR: 'X:\\p' }, () => {
    assert.equal(
      load(),
      undefined,
      '两个都设也不注册 —— 内核进程里它们都是 undefined（2026-10-03 探针实测）',
    )
  })
})

test('自述覆盖隔离落点与共存契约：存储根 / userData / 协议 / 官方桌面版', () => {
  const section = withEnv({
    SSID_SHELL_VERSION: '1.1.6',
    DSH_PROFILE_DIR: 'X:\\p',
    DSH_PROFILE: 'ssid',
    SSID_SESSION_ISOLATED_ROOT: 'X:\\sessions-ssid',
    SSID_STORAGE_ROOT: 'X:\\storages-ssid',
  }, load)

  assert.ok(section !== undefined, '在 SSiD 内必须注册段落')
  assert.equal(section.name, 'ssid-env')
  assert.ok(section.order < 0, '应排在 persona 与其余指令之前')

  const text = section.text
  assert.match(text, /SSiD（思灵）/, '要自报身份')
  assert.match(text, /思灵\.exe/, '要给出进程链判据供复核')
  assert.match(text, /壳版本 1\.1\.6/, '要带上壳版本 —— 它是主判据的可复核形态')
  assert.match(text, /X:\\storages-ssid/, '要带上存储根 —— 两侧工作区登记数不同时靠它分辨')
  assert.match(text, /ssid-shell/, '要说明 userData 让位')
  assert.match(text, /ssid:\/\//, '要说明协议各归各')
  assert.match(text, /官方 DSH 桌面版/, '要说明官方桌面版可以同时运行')
})

test('可选项缺失时自述仍成立：profile 目录不在内核环境里', () => {
  const section = withEnv({ SSID_SHELL_VERSION: '1.1.6' }, load)
  assert.ok(section !== undefined, '只有壳版本也要能注册')
  assert.doesNotMatch(section.text, /profile 目录/, '拿不到的项不许编造')
  assert.doesNotMatch(section.text, /；；/, '省略可选项后不留空档')
})

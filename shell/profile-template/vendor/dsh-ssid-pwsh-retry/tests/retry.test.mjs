/**
 * dsh-ssid-pwsh-retry 的单元测试：只验判定与重试次数，不碰真实工具链。
 *
 * 用假上下文捕获 `tools/execute` 处理器，再用计数版 `next` 观察它调用了几次——
 * 「重试恰好一次」是本插件唯一的对外行为，值得钉住。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { apply, inject, name } from '../lib/index.mjs'

/** 捕获 apply 注册的处理器；顺带断言它挂的是 `tools/execute`。 */
function harness() {
  let handler
  apply({
    on: (event, fn) => {
      assert.equal(event, 'tools/execute')
      handler = fn
    },
  })
  return handler
}

/** 造一个工具结果。 */
function result({ isError = false, text = 'ok' } = {}) {
  return { content: [{ type: 'text', text }], isError }
}

test('插件元数据：名字与注入面', () => {
  assert.equal(name, '@max-null/dsh-ssid-pwsh-retry')
  assert.deepEqual(inject, ['tools'])
})

test('pwsh 命中 spawn EPERM 时重试一次，并返回第二次的结果', async () => {
  const handler = harness()
  let calls = 0
  const next = async () => {
    calls += 1
    return calls === 1 ? result({ isError: true, text: 'Error: spawn EPERM' }) : result({ text: 'ok' })
  }
  const out = await handler({ name: 'pwsh', signal: undefined }, next)
  assert.equal(calls, 2, '必须重试一次')
  assert.equal(out.content[0].text, 'ok', '返回重试后的结果')
})

test('error.message 里的 EPERM 同样识别', async () => {
  const handler = harness()
  let calls = 0
  const next = async () => {
    calls += 1
    return { content: [], isError: true, error: { message: 'spawn EPERM' } }
  }
  await handler({ name: 'pwsh', signal: undefined }, next)
  assert.equal(calls, 2)
})

test('非 pwsh 工具不重试', async () => {
  const handler = harness()
  let calls = 0
  const next = async () => {
    calls += 1
    return result({ isError: true, text: 'Error: spawn EPERM' })
  }
  await handler({ name: 'bash', signal: undefined }, next)
  assert.equal(calls, 1)
})

test('非 EPERM 的错误不重试', async () => {
  const handler = harness()
  let calls = 0
  const next = async () => {
    calls += 1
    return result({ isError: true, text: 'Error: spawn ENOENT' })
  }
  await handler({ name: 'pwsh', signal: undefined }, next)
  assert.equal(calls, 1)
})

test('成功结果不重试', async () => {
  const handler = harness()
  let calls = 0
  const next = async () => {
    calls += 1
    return result({ text: 'ok' })
  }
  await handler({ name: 'pwsh', signal: undefined }, next)
  assert.equal(calls, 1)
})

test('已中止的调用不重试', async () => {
  const handler = harness()
  let calls = 0
  const next = async () => {
    calls += 1
    return result({ isError: true, text: 'spawn EPERM' })
  }
  await handler({ name: 'pwsh', signal: { aborted: true } }, next)
  assert.equal(calls, 1)
})

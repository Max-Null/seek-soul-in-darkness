/**
 * kernel-child-bridge 的协议测试。
 *
 * 为什么值得单独测：反向能力通道是子进程模式下「设置页重启 / 在线更新 / 快捷截图」
 * 唯一的功能来源，而这些功能在 GUI 里难以逐步驱动。协议本身可以在进程内完整验证：
 * 子进程侧发出的调用形状、以及主进程回包是否被正确路由（含超时与错误分支）。
 *
 * 约定：本文件在同一个进程内先装载 bridge（此时把 process.send 换成捕获桩），
 * 再驱动其内部状态——因此用例按顺序执行、且不依赖真实 IPC。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

/** 捕获子进程发出的消息，替代真实 IPC */
const sent: Array<Record<string, unknown>> = []
process.send = ((msg: unknown) => { sent.push(msg as Record<string, unknown>); return true }) as typeof process.send

const bridge = await import('../kernel-child-bridge.ts')

test('能力调用以预期形状发往主进程（restart / screenshot.apply）', async () => {
  const caps = bridge.createCapabilityProxies()
  sent.length = 0

  caps.restart()
  caps.screenshot.apply()

  assert.ok(sent.length >= 2, '两次调用都应产生消息')
  const restart = sent.find((m) => m.name === 'restart')
  const shot = sent.find((m) => m.name === 'screenshot')
  assert.equal(restart?.type, 'capability')
  assert.equal(restart?.method, 'invoke')
  assert.equal(shot?.method, 'apply')
  assert.ok(typeof restart?.callId === 'string' && restart.callId.length > 0, 'callId 必须存在')
})

test('主进程回包被路由到对应 Promise（成功分支）', async () => {
  const caps = bridge.createCapabilityProxies()
  sent.length = 0

  const p = caps.update.check()
  const callId = sent[0]?.callId as string
  assert.ok(callId, '调用应带 callId')

  bridge.handleParentMessage({
    type: 'capabilityReply', callId, ok: true,
    value: { state: 'available', version: '0.2.2' },
  })

  assert.deepEqual(await p, { state: 'available', version: '0.2.2' })
})

test('主进程回包为错误时 Promise 拒绝（错误分支）', async () => {
  const caps = bridge.createCapabilityProxies()
  sent.length = 0

  const p = caps.update.download()
  const callId = sent[0]?.callId as string
  bridge.handleParentMessage({ type: 'capabilityReply', callId, ok: false, error: '主进程侧失败原因' })

  await assert.rejects(p, /主进程侧失败原因/)
})

test('update.onStatus 收到主进程推送的事件', () => {
  const caps = bridge.createCapabilityProxies()
  const seen: unknown[] = []
  const off = caps.update.onStatus((e) => { seen.push(e) })

  bridge.handleParentMessage({ type: 'capabilityEvent', name: 'update:status', payload: { state: 'downloading', percent: 42 } })
  assert.deepEqual(seen, [{ state: 'downloading', percent: 42 }])

  // 退订后不再收到——否则 HMR/重载会累积重复回调
  off()
  bridge.handleParentMessage({ type: 'capabilityEvent', name: 'update:status', payload: { state: 'done' } })
  assert.equal(seen.length, 1, '退订后不应再收到事件')
})

test('未知 callId 与无关消息不会被误消费', () => {
  assert.equal(bridge.handleParentMessage({ type: 'capabilityReply', callId: '不存在的', ok: true }), true)
  assert.equal(bridge.handleParentMessage({ type: 'shutdown' }), false, 'shutdown 应留给调用方处理')
  assert.equal(bridge.handleParentMessage(null), false)
})

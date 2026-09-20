/**
 * keep-awake 状态机的行为契约。
 *
 * 这些断言存在的理由：每一条都对应一个「在真实环境里几乎撞不到、撞到就是
 * 屏幕永远不关」的序列——并发的两个 turn、丢过 turn/start 的回合、尾巴期内
 * 又起一轮、并发下重复的遮罩开关。靠手点界面凑不出这些，只能在这里编排。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createKeepAwake } from '../lib/keep-awake.mjs'

/** 造一个可控环境：记录 start/stop、配置可改、定时器手动推进。 */
function harness(initial = { keepAwake: true, keepAwakeTailMs: 60000 }) {
  const config = { ...initial }
  const calls = { starts: 0, stops: [], logs: [] }
  const timers = new Set()
  let nextId = 1
  const machine = createKeepAwake({
    start: () => { calls.starts += 1; return nextId++ },
    stop: (id) => { calls.stops.push(id) },
    readConfig: () => config,
    log: (text) => { calls.logs.push(text) },
    setTimer: (fn) => { const timer = { fn }; timers.add(timer); return timer },
    clearTimer: (timer) => { timers.delete(timer) },
  })
  return {
    machine,
    calls,
    config,
    /** 触发所有挂着的定时器——模拟尾巴到期。 */
    fireTimers: () => { for (const timer of [...timers]) { timers.delete(timer); timer.fn() } },
    pending: () => timers.size,
  }
}

test('一轮进行中持有；结束后进入尾巴仍持有；尾巴到期才释放', () => {
  const h = harness()
  h.machine.noteTurnStart()
  assert.equal(h.machine.snapshot().holding, true)
  assert.equal(h.calls.starts, 1)

  h.machine.noteTurnEnd()
  // 尾巴期内必须继续持有——目标模式的轮次缝隙靠它覆盖。
  assert.equal(h.machine.snapshot().holding, true)
  assert.equal(h.machine.snapshot().tail, true)
  assert.equal(h.calls.starts, 1, '不得重复开 blocker')

  h.fireTimers()
  assert.equal(h.machine.snapshot().holding, false)
  assert.deepEqual(h.calls.stops, [1])
})

test('并发 turn：先结束的那个不触发尾巴，全部结束才进尾巴', () => {
  const h = harness()
  h.machine.noteTurnStart()
  h.machine.noteTurnStart()
  assert.equal(h.machine.snapshot().turns, 2)

  h.machine.noteTurnEnd()
  assert.equal(h.machine.snapshot().holding, true)
  assert.equal(h.machine.snapshot().tail, false, '还有 turn 在跑，不该进尾巴')

  h.machine.noteTurnEnd()
  assert.equal(h.machine.snapshot().tail, true)

  h.fireTimers()
  assert.equal(h.machine.snapshot().holding, false)
})

test('多余的 turn/end 不会把计数打成负数，也不造成永久持有', () => {
  const h = harness()
  h.machine.noteTurnEnd()
  h.machine.noteTurnEnd()
  assert.equal(h.machine.snapshot().turns, 0)
  // 计数为 0 时再来 end 只会重起尾巴：多保活一个尾巴窗口，不会永久持有。
  h.fireTimers()
  assert.equal(h.machine.snapshot().holding, false)
})

test('尾巴期内又起一轮：旧尾巴被撤掉，不会中途闪断释放', () => {
  const h = harness()
  h.machine.noteTurnStart()
  h.machine.noteTurnEnd()
  assert.equal(h.pending(), 1)

  h.machine.noteTurnStart()
  assert.equal(h.pending(), 0, '旧尾巴定时器必须被撤掉')
  assert.equal(h.machine.snapshot().holding, true)

  h.machine.noteTurnEnd()
  h.fireTimers()
  assert.equal(h.machine.snapshot().holding, false)
  // 全程只开关过一次 blocker——闪断会表现为 starts > 1。
  assert.equal(h.calls.starts, 1)
  assert.equal(h.calls.stops.length, 1)
})

test('配置关闭时不持有，尾巴到期也不持有', () => {
  const h = harness({ keepAwake: false, keepAwakeTailMs: 60000 })
  h.machine.noteTurnStart()
  assert.equal(h.machine.snapshot().holding, false)

  h.machine.noteTurnEnd()
  assert.equal(h.machine.snapshot().holding, false)
  // 这一条防的是：尾巴定时器到期后重新判定为「需要」而把 blocker 又打开。
  h.fireTimers()
  assert.equal(h.machine.snapshot().holding, false)
  assert.equal(h.calls.starts, 0)
})

test('tailMs 为 0 时结束即释放，不进尾巴', () => {
  const h = harness({ keepAwake: true, keepAwakeTailMs: 0 })
  h.machine.noteTurnStart()
  h.machine.noteTurnEnd()
  assert.equal(h.machine.snapshot().tail, false)
  assert.equal(h.machine.snapshot().holding, false)
})

test('遮罩与 turn 计数正交：关遮罩不释放还在跑的 turn', () => {
  const h = harness()
  h.machine.setMask(true)
  assert.equal(h.machine.snapshot().holding, true)

  h.machine.setMask(false)
  assert.equal(h.machine.snapshot().holding, false)

  h.machine.noteTurnStart()
  h.machine.setMask(true)
  h.machine.setMask(false)
  assert.equal(h.machine.snapshot().holding, true, 'turn 还在跑，遮罩关掉不该释放')
  assert.equal(h.machine.snapshot().turns, 1)
})

test('重复打开/关闭遮罩不会重复开关同一个 blocker', () => {
  const h = harness()
  h.machine.setMask(true)
  h.machine.setMask(true)
  h.machine.setMask(true)
  assert.equal(h.calls.starts, 1)
  h.machine.setMask(false)
  assert.equal(h.calls.stops.length, 1)
})

test('releaseTurns：清计数与尾巴，但不动遮罩持有', () => {
  const h = harness()
  h.machine.noteTurnStart()
  h.machine.noteTurnEnd()
  assert.equal(h.machine.snapshot().tail, true)

  h.machine.releaseTurns('kernel-child exit')
  assert.equal(h.machine.snapshot().turns, 0)
  assert.equal(h.machine.snapshot().tail, false)
  assert.equal(h.machine.snapshot().holding, false)
  assert.equal(h.pending(), 0, '尾巴定时器必须被撤掉')

  // 遮罩还开着时，释放执行侧持有不该把屏幕放黑。
  h.machine.setMask(true)
  h.machine.noteTurnStart()
  h.machine.releaseTurns('kernel-child exit')
  assert.equal(h.machine.snapshot().holding, true)
})

/**
 * 子进程侧的能力桥（内核子进程 ↔ Electron 主进程）。
 *
 * 要解决什么：壳层能力（restart / update / screenshot）是**闭包**，无法跨进程传递对象。
 * 内核对它们的用法是「调用壳层提供的服务」+ 订阅状态回调，所以子进程侧可以放一个
 * **代理**：调用时把方法名与参数经 IPC 发给主进程，主进程执行真实能力后回传结果；
 * update.onStatus 这类订阅则由主进程经 IPC 反向推事件。
 *
 * 协议（只传纯数据；函数/类实例一律不传）：
 *   子 → 主  { type: 'capability', name, method, callId, args }
 *   主 → 子  { type: 'capabilityReply', callId, ok, value? , error? }
 *   主 → 子  { type: 'capabilityEvent', name, payload }
 *
 * 超时：主进程不响应（卡死/已退出）时按时失败，避免子进程永久挂起——
 * 这类挂起在 shutdown 阶段会表现为「关闭超时后强杀」，很难归因。
 */
import { randomUUID } from 'node:crypto'

/** 单次能力调用等待主进程响应的上限 */
const CALL_TIMEOUT_MS = 30_000

type ChildMessage =
  | { type: 'capabilityReply', callId: string, ok: true, value?: unknown }
  | { type: 'capabilityReply', callId: string, ok: false, error: string }
  | { type: 'capabilityEvent', name: string, payload?: unknown }

/** 主进程可应答的能力名 */
export type CapabilityName = 'restart' | 'update' | 'screenshot'

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const pending = new Map<string, Pending>()
const listeners = new Map<string, Set<(payload: unknown) => void>>()

/** 向主进程发起一次能力调用（内部用） */
function call(name: CapabilityName, method: string, args: unknown[] = []): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const callId = randomUUID()
    const timer = setTimeout(() => {
      pending.delete(callId)
      reject(new Error(`能力调用超时：${name}.${method}（主进程 ${CALL_TIMEOUT_MS / 1000}s 未响应）`))
    }, CALL_TIMEOUT_MS)
    pending.set(callId, { resolve, reject, timer })
    try {
      process.send?.({ type: 'capability', name, method, callId, args })
    } catch (cause) {
      clearTimeout(timer)
      pending.delete(callId)
      reject(new Error(`能力调用无法送达主进程：${String(cause)}`))
    }
  })
}

/** 处理来自主进程的消息；返回 true 表示已消费 */
export function handleParentMessage(msg: unknown): boolean {
  if (msg === null || typeof msg !== 'object') return false
  const m = msg as ChildMessage
  if (m.type === 'capabilityReply') {
    const slot = pending.get(m.callId)
    if (slot === undefined) return true
    clearTimeout(slot.timer)
    pending.delete(m.callId)
    if (m.ok) slot.resolve(m.value)
    else slot.reject(new Error(m.error))
    return true
  }
  if (m.type === 'capabilityEvent') {
    for (const cb of listeners.get(m.name) ?? []) {
      try { cb(m.payload) } catch { /* 单个订阅者抛错不影响其他订阅者 */ }
    }
    return true
  }
  return false
}

/**
 * 构造与同进程形态**同形**的能力对象，交给 bootKernel 的 opts。
 *
 * 签名对齐 kernel.ts 的 opts：restart 同步返回 void，update 三个方法返回 Promise，
 * screenshot.trigger 同步、apply 返回 boolean。同步方法在子进程里无法真正同步等待
 * 主进程（IPC 是异步的），故：
 *   - restart：发射后不等待（主进程收到即执行 relaunch）
 *   - screenshot.trigger：同上
 *   - screenshot.apply：返回 true（乐观——真正的注册结果由主进程决定；
 *     这是当前唯一的近似点，已在决策表 D14 阶段二里记为待改进）
 */
export function createCapabilityProxies(): {
  restart: () => void
  update: {
    check: () => Promise<{ state: string, version?: string, releaseNotes?: string, error?: string }>
    download: () => Promise<{ ok: boolean, error?: string }>
    install: () => Promise<{ ok: boolean, error?: string }>
    onStatus: (callback: (event: Record<string, unknown>) => void) => () => void
  }
  screenshot: { trigger: () => void, apply: () => boolean }
} {
  const subscribe = (name: string, cb: (payload: unknown) => void): (() => void) => {
    const set = listeners.get(name) ?? new Set()
    set.add(cb)
    listeners.set(name, set)
    return () => { set.delete(cb) }
  }

  return {
    restart: () => { void call('restart', 'invoke').catch(() => { /* 主进程即将 relaunch，失败不影响子进程 */ }) },
    update: {
      check: async () => await call('update', 'check') as { state: string },
      download: async () => await call('update', 'download') as { ok: boolean },
      install: async () => await call('update', 'install') as { ok: boolean },
      onStatus: (callback) => subscribe('update:status', (payload) => { callback((payload ?? {}) as Record<string, unknown>) }),
    },
    screenshot: {
      trigger: () => { void call('screenshot', 'trigger').catch(() => { /* 主进程无壳能力时静默 */ }) },
      apply: () => {
        // 乐观返回 true：Cordis 侧只关心「快捷键是否可用」，真实结果由主进程决定。
        // 见本文件顶部注释与决策表 D14 的待改进项。
        void call('screenshot', 'apply').catch(() => {})
        return true
      },
    },
  }
}

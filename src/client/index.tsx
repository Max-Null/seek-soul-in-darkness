/**
 * @max-null/dsh-ssid-panels client half: four SSiD tabs registered on
 * ctx.betterSidebar (memory / guardian state / habit candidates / balances).
 * dsh-better-sidebar is an optional type-only peer: without it this half
 * registers nothing and the host routes stay unused.
 */
import { createElement, useEffect, useState, type ReactNode } from 'react'
import type {} from 'dsh-better-sidebar'
import type { Context } from 'cordis'

export const inject = ['betterSidebar']

/** POST one /ssid/api method and unwrap the {ok, value|error} envelope. */
async function api(method: string, payload?: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`/ssid/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  })
  const body = await res.json() as { ok?: boolean, value?: unknown, error?: { message?: string } }
  if (body.ok !== true) {
    throw new Error(body.error?.message ?? `${method} failed`)
  }
  return body.value
}

/** Small inline-styled primitives (no CSS build step). */
const ssid = {
  accent: '#4FC3F7',
  wrap: { display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' },
  card: {
    background: 'var(--dsw-alias-bg-layer-1, #131a26)',
    border: '1px solid var(--dsw-alias-border-l2, #1e2836)',
    borderRadius: 10,
    padding: '10px 12px',
  },
  title: { fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-secondary, #67748a)', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  text: { fontSize: 12.5, color: 'var(--dsw-alias-label-primary, #d8e0ea)', lineHeight: 1.55 },
  muted: { fontSize: 11, color: 'var(--dsw-alias-label-secondary, #67748a)' },
  empty: { padding: '28px 12px', textAlign: 'center', fontSize: 12.5, color: 'var(--dsw-alias-label-secondary, #67748a)' },
  btn: {
    padding: '3px 12px', fontSize: 11.5, background: 'none',
    border: '1px solid var(--dsw-alias-border-l2, #1e2836)', borderRadius: 6,
    color: 'var(--dsw-alias-label-primary, #d8e0ea)', cursor: 'pointer',
  },
  badge: (level: number): React.CSSProperties => ({
    fontSize: 10.5, padding: '2px 8px', borderRadius: 10,
    border: '1px solid',
    color: level === 0 ? 'var(--dsw-alias-label-secondary, #67748a)'
      : level === 1 ? '#f7c94f'
        : level === 2 ? '#f7a14f' : '#f76f4f',
    borderColor: level === 0 ? 'var(--dsw-alias-border-l2, #1e2836)'
      : level === 1 ? '#f7c94f55'
        : level === 2 ? '#f7a14f55' : '#f76f4f55',
  }),
} as const

function tabIcon(path: string): ReactNode {
  return createElement('svg', {
    width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
  }, createElement('path', { d: path }))
}

/** 记忆面板：三态过滤 + 搜索 + 确认/删除。 */
interface MemoryRecord { id: string, content: string, status: string, namespace: string, keywords: string[] }

function MemoryView(): ReactNode {
  const [records, setRecords] = useState<MemoryRecord[]>([])
  const [status, setStatus] = useState('auto')
  const [query, setQuery] = useState('')
  const reload = async (): Promise<void> => {
    try {
      setRecords(await api('memory.list') as MemoryRecord[])
    } catch {
      setRecords([])
    }
  }
  useEffect(() => { void reload() }, [])
  const filtered = records
    .filter(record => record.status === status)
    .filter(record => query === '' || record.content.toLowerCase().includes(query.toLowerCase()))
  return createElement('div', { style: ssid.wrap },
    createElement('input', {
      value: query,
      onChange: (event: { target: { value: string } }) => { setQuery(event.target.value) },
      placeholder: '搜索记忆…',
      style: {
        width: '100%', padding: '6px 10px', fontSize: 12.5, boxSizing: 'border-box',
        background: 'var(--dsw-alias-bg-layer-1, #0f141d)',
        border: '1px solid var(--dsw-alias-border-l2, #1e2836)', borderRadius: 8,
        color: 'var(--dsw-alias-label-primary, #d8e0ea)', outline: 'none',
      },
    }),
    createElement('div', { style: { display: 'flex', gap: 4 } },
      ['auto', 'suggested', 'suggest'].map(label => createElement('button', {
        key: label,
        onClick: () => { setStatus(label) },
        style: { flex: 1, ...ssid.btn, ...(status === label ? { color: ssid.accent, borderColor: ssid.accent } : {}) },
      }, label)),
    ),
    filtered.length === 0
      ? createElement('div', { style: ssid.empty }, '黑暗中未见灵光')
      : filtered.map(record => createElement('div', { key: record.id, style: ssid.card },
        createElement('div', { style: ssid.text }, record.content),
        createElement('div', { style: { ...ssid.muted, marginTop: 6 } }, `${record.namespace} · ${record.status}`),
        createElement('div', { style: { display: 'flex', gap: 6, marginTop: 8 } },
          record.status === 'suggested'
            ? createElement('button', {
              style: ssid.btn,
              onClick: () => { void api('memory.confirm', { id: record.id }).then(() => reload()) },
            }, '确认')
            : null,
          createElement('button', {
            style: ssid.btn,
            onClick: () => { void api('memory.forget', { id: record.id }).then(() => reload()) },
          }, '删除'),
        ),
      )),
  )
}

/** 状态面板：Guardian 触发线快照（1s 轮询，可见时）。 */
function GuardianView(props: { visible: boolean }): ReactNode {
  const [snapshot, setSnapshot] = useState<{ session?: { assertionCount?: number, assertionLevel?: number } | null, reviewQueue?: Array<{ filePath?: string, turn?: number }> }>({})
  useEffect(() => {
    if (!props.visible) return
    const tick = (): void => {
      void api('guardian.snapshot').then(value => { setSnapshot(value as typeof snapshot) }).catch(() => {})
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => { clearInterval(timer) }
  }, [props.visible])
  const session = snapshot.session
  const count = session?.assertionCount ?? 0
  const level = session?.assertionLevel ?? 0
  const queue = snapshot.reviewQueue ?? []
  const label = level === 0 ? '安静' : `${level} 级`
  return createElement('div', { style: ssid.wrap },
    createElement('div', { style: ssid.card },
      createElement('div', { style: ssid.title },
        createElement('span', null, '断言计数'),
        createElement('span', { style: ssid.badge(level) }, label),
      ),
      createElement('div', { style: { fontSize: 22, fontWeight: 700, color: 'var(--dsw-alias-label-primary, #d8e0ea)' } }, String(count)),
    ),
    createElement('div', { style: ssid.card },
      createElement('div', { style: ssid.title }, '编辑审查队列'),
      queue.length === 0
        ? createElement('div', { style: ssid.muted }, '无待审查项')
        : queue.map((item, index) => createElement('div', { key: index, style: { ...ssid.text, fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
          `${item.turn !== undefined ? `第 ${item.turn} 轮 · ` : ''}${item.filePath ?? '(无路径)'}`,
        )),
    ),
  )
}

/** 习惯面板：dsh-habit 候选（第一级人工闸门）。 */
interface HabitCandidate { id: string, habit: string, confidence: string, evidenceCount: number, status: string }

function HabitView(props: { visible: boolean }): ReactNode {
  const [candidates, setCandidates] = useState<HabitCandidate[]>([])
  const reload = async (): Promise<void> => {
    try {
      setCandidates(await api('habit.snapshot') as HabitCandidate[])
    } catch {
      setCandidates([])
    }
  }
  useEffect(() => {
    if (!props.visible) return
    void reload()
    const timer = setInterval(() => { void reload() }, 1000)
    return () => { clearInterval(timer) }
  }, [props.visible])
  const pending = candidates.filter(candidate => candidate.status === 'pending')
  return createElement('div', { style: ssid.wrap },
    pending.length === 0
      ? createElement('div', { style: ssid.empty }, '黑暗中未见灵光')
      : pending.map(candidate => createElement('div', { key: candidate.id, style: ssid.card },
        createElement('div', { style: ssid.title },
          createElement('span', null, '候选习惯'),
          createElement('span', { style: ssid.badge(candidate.confidence === 'high' ? 1 : candidate.confidence === 'medium' ? 2 : 3) }, candidate.confidence),
        ),
        createElement('div', { style: ssid.text }, candidate.habit),
        createElement('div', { style: { ...ssid.muted, marginTop: 4 } }, `证据 ${candidate.evidenceCount} 条`),
        createElement('div', { style: { display: 'flex', gap: 6, marginTop: 8 } },
          createElement('button', { style: ssid.btn, onClick: () => { void api('habit.confirm', { id: candidate.id }).then(() => reload()) } }, '确认（写入记忆）'),
          createElement('button', { style: ssid.btn, onClick: () => { void api('habit.discard', { id: candidate.id }).then(() => reload()) } }, '丢弃'),
        ),
      )),
  )
}

/** 余额面板：DS/K3 两条余额 + 手动刷新。 */
interface BalanceInfo { ok: boolean, isAvailable?: boolean, balanceInfos?: Array<{ currency: string, totalBalance: string }>, message?: string }

function BalanceView(): ReactNode {
  const [result, setResult] = useState<{ ds?: BalanceInfo, kimi?: BalanceInfo }>({})
  const [updated, setUpdated] = useState<string | null>(null)
  const refresh = async (): Promise<void> => {
    const [ds, kimi] = await Promise.all([
      api('balance.deepseek').then(value => value as BalanceInfo).catch(() => ({ ok: false, message: '查询异常' }) as BalanceInfo),
      api('balance.kimi').then(value => value as BalanceInfo).catch(() => ({ ok: false, message: '查询异常' }) as BalanceInfo),
    ])
    setResult({ ds, kimi })
    setUpdated(new Date().toLocaleTimeString('zh-CN', { hour12: false }))
  }
  useEffect(() => { void refresh() }, [])
  const card = (name: string, info: BalanceInfo | undefined): ReactNode => createElement('div', { style: ssid.card },
    createElement('div', { style: ssid.title },
      createElement('span', null, name),
      info?.ok === true
        ? createElement('span', { style: ssid.badge(info.isAvailable === true ? 0 : 3) }, info.isAvailable === true ? '可用' : '余额不足')
        : null,
    ),
    info === undefined
      ? createElement('div', { style: ssid.muted }, '查询中…')
      : !info.ok
        ? createElement('div', { style: ssid.muted }, info.message ?? '查询失败')
        : createElement('div', { style: { fontSize: 22, fontWeight: 700, color: 'var(--dsw-alias-label-primary, #d8e0ea)' } },
          `¥ ${Number(info.balanceInfos?.[0]?.totalBalance ?? '0').toFixed(2)}`),
  )
  return createElement('div', { style: ssid.wrap },
    card('DeepSeek', result.ds),
    card('Kimi K3', result.kimi),
    createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch' } },
      createElement('button', { style: ssid.btn, onClick: () => { void refresh() } }, '刷新'),
      createElement('div', { style: { ...ssid.muted, textAlign: 'center' } }, updated === null ? '尚未查询' : `上次更新 ${updated}`),
    ),
  )
}

/** Plugin body: register the four tabs (optional peer degrades to no-op). */
export function apply(ctx: Context): void {
  if (ctx.betterSidebar === undefined) return
  ctx.effect(() => ctx.betterSidebar.registerTab({
    id: '@max-null/dsh-ssid-panels:memory',
    title: () => '记忆',
    icon: tabIcon('M12 7v14M16 12h2M16 8h2M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3zM6 12h2M6 8h2'),
    order: 60,
    single: true,
    component: () => createElement(MemoryView),
  }))
  ctx.effect(() => ctx.betterSidebar.registerTab({
    id: '@max-null/dsh-ssid-panels:guardian',
    title: () => '状态',
    icon: tabIcon('M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2'),
    order: 61,
    single: true,
    component: ({ visible }) => createElement(GuardianView, { visible }),
  }))
  ctx.effect(() => ctx.betterSidebar.registerTab({
    id: '@max-null/dsh-ssid-panels:habit',
    title: () => '习惯',
    icon: tabIcon('m17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14m-14 18-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3'),
    order: 62,
    single: true,
    component: ({ visible }) => createElement(HabitView, { visible }),
  }))
  ctx.effect(() => ctx.betterSidebar.registerTab({
    id: '@max-null/dsh-ssid-panels:balance',
    title: () => '余额',
    icon: tabIcon('M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4'),
    order: 63,
    single: true,
    component: () => createElement(BalanceView),
  }))
}

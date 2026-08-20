/**
 * @max-null/dsh-ssid-panels client half: four SSiD tabs registered on
 * ctx.betterSidebar (memory / guardian state / habit candidates / balances).
 * dsh-better-sidebar is an optional type-only peer: without it this half
 * registers nothing and the host routes stay unused.
 *
 * i18n: follows the DSH locale service when present (optional ctx.get('locale')
 * + 'locale/change'), silently falling back to Chinese otherwise — the same
 * pattern dsh-plugin-center uses.
 */
import { createElement, useEffect, useState, type ReactNode } from 'react'
import type {} from 'dsh-better-sidebar'
import type { Context } from 'cordis'

export const inject = ['slots']

// ---- SSiD 品牌标记（rc.8 品牌槽位：sidebar.brand.mark / conversation.hero.brand.mark） ----
// 槽位由 ui-sidebar/ui-conversation 声明（带 FishLogo fallback），官方
// ui-brand-official 仅在 DSH_CLIENT_BUILD_PROFILE=official 时占用，SSiD 场景
// 无冲突。此组件重现 assets/logo.svg 的 Si 瞳孔（圆角方块 + 轨道 + 瞳孔 + 高光），
// 纯 currentColor 无关（沿用 logo 的 #0ea5e9 品牌蓝，深色底由壳主题提供）。
const BRAND_MARK_PATHS = [
  'M128 76a52 52 0 1 0 0 104 52 52 0 0 0 0-104Zm0 10a42 42 0 1 1 0 84 42 42 0 0 1 0-84Z',
  'M128 48a80 80 0 1 0 0 160 80 80 0 0 0 0-160Zm0 8a72 72 0 1 1 0 144 72 72 0 0 1 0-144Z',
  'M128 22a106 106 0 1 0 0 212 106 106 0 0 0 0-212Zm0 8a98 98 0 1 1 0 196 98 98 0 0 1 0-196Z',
]
/** SSiD Si-pupil mark, sized by the slot owner prop. */
function SsidBrandMark({ size = 24, className }: { size?: number; className?: string }): ReactNode {
  return createElement('svg', {
    width: size, height: size, viewBox: '0 0 256 256',
    className, 'aria-hidden': true,
  },
    // 同心轨道（3 层，透明度递减）
    BRAND_MARK_PATHS.map((d, i) => createElement('path', {
      key: 'ring' + i, d, fill: 'none', stroke: '#0ea5e9',
      strokeWidth: 2, opacity: 0.45 - i * 0.09,
    })),
    // 瞳孔：虹膜 + 瞳孔 + 高光
    createElement('circle', { cx: 128, cy: 128, r: 38, fill: '#0369a1' }),
    createElement('circle', { cx: 128, cy: 128, r: 27, fill: '#0ea5e9' }),
    createElement('circle', { cx: 128, cy: 128, r: 13, fill: '#0b1220' }),
    createElement('circle', { cx: 119, cy: 118, r: 7, fill: '#fff', opacity: 0.9 }),
  )
}

// ---- settings nav icon ----
// DSH 0.1.x 的 settings.section 注册只投影 id/order/label，设置壳对外部 section
// 一律渲染默认齿轮（无 icon 契约字段）。照 dsh-better-sidebar 的 settings-nav-icon
// 模式：MutationObserver 按 label 文本标记设置对话框里本插件「关于 SSiD」那一行，
// 由下面注入的 CSS 把齿轮替换成 Lucide info 图标。标记不拥有壳结构，disposer
// 移除标记，HMR-safe。
const SETTINGS_NAV_MARKER = 'data-dsh-ssid-panels-settings-nav'
const SETTINGS_NAV_CSS = `
[data-dsh-ssid-panels-settings-nav] > svg:first-child { display: none; }
[data-dsh-ssid-panels-settings-nav]::before {
  content: '';
  flex: none;
  width: 16px;
  height: 16px;
  background: currentColor;
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpath d='M12 16v-4'/%3E%3Cpath d='M12 8h.01'/%3E%3C/svg%3E") center / contain no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpath d='M12 16v-4'/%3E%3Cpath d='M12 8h.01'/%3E%3C/svg%3E") center / contain no-repeat;
}
`
function registerSettingsNavIcon(label: () => string): () => void {
  if (typeof document === 'undefined') return () => {}
  let styleInjected = false
  const injectStyle = (): void => {
    if (styleInjected) return
    styleInjected = true
    const style = document.createElement('style')
    style.setAttribute('data-plugin', '@max-null/dsh-ssid-panels')
    style.textContent = SETTINGS_NAV_CSS
    document.head.append(style)
  }
  injectStyle()
  let disposed = false
  const sync = (): void => {
    if (disposed) return
    const currentLabel = label().trim()
    const buttons = document.querySelectorAll<HTMLButtonElement>('[role="dialog"] nav button')
    buttons.forEach((button) => {
      const matches = currentLabel.length > 0 && button.textContent?.trim() === currentLabel
      if (matches) button.setAttribute(SETTINGS_NAV_MARKER, '')
      else button.removeAttribute(SETTINGS_NAV_MARKER)
    })
  }
  sync()
  const observer = new MutationObserver(sync)
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  return () => {
    disposed = true
    observer.disconnect()
    document.querySelectorAll(`[${SETTINGS_NAV_MARKER}]`)
      .forEach((element) => { element.removeAttribute(SETTINGS_NAV_MARKER) })
  }
}

// ---- i18n (DSH zh/en bilingual, plugin-center pattern) ----
type LocaleId = 'zh' | 'en'
const STRINGS = {
  zh: {
    about: '关于 SSiD',
    tabGuardian: '状态',
    tabHabit: '习惯',
    tabBalance: '余额',
    assertions: '断言计数',
    quiet: '安静',
    level: '{n} 级',
    reviewQueue: '编辑审查队列',
    noPending: '无待审查项',
    turn: '第 {n} 轮 · ',
    noPath: '(无路径)',
    habitCandidates: '候选习惯',
    evidence: '证据 {n} 条',
    confirmToMemory: '确认（写入记忆）',
    discard: '丢弃',
    available: '可用',
    insufficient: '余额不足',
    querying: '查询中…',
    queryFailed: '查询失败',
    refresh: '刷新',
    notQueried: '尚未查询',
    lastUpdated: '上次更新 {t}',
    missingKey: '未配置 API Key',
    httpFailed: '查询失败（HTTP {status}）',
    title: '思灵 (SSiD)',
    slogan: '于黑暗中，探寻灵魂。',
    checkUpdates: '检查更新',
    noRelease: '暂无发布版本',
    newVersion: '新版本可用：{name}（{tag}，{date}）',
    latestVersion: '已是最新：{name}（{tag}）',
    checking: '检查中…',
    checkNow: '立即检查',
    checkFailed: '更新检查失败',
    apiFailed: '检查失败（HTTP {status}）',
    changelog: '更新日志',
    none: '（无）',
    presetPlugins: '预制插件',
    notifyTitle: '通知设置',
    notifyEnabled: '启用通知',
    notifyEnabledDesc: '窗口失焦（最小化/被遮挡）时以 Windows 通知提醒；聚焦时不打扰',
    notifyReplyDone: '会话完成',
    notifyReplyDoneDesc: '每轮会话完成时通知（含用时）',
    notifyQuestion: '提问',
    notifyQuestionDesc: 'AI 向你提问、需要回复时通知',
    notifyApproval: '授权申请',
    notifyApprovalDesc: '工具请求授权、需要处理时通知',
  },
  en: {
    about: 'About SSiD',
    tabGuardian: 'Status',
    tabHabit: 'Habits',
    tabBalance: 'Balance',
    assertions: 'Assertions',
    quiet: 'Quiet',
    level: 'Level {n}',
    reviewQueue: 'Edit review queue',
    noPending: 'No pending reviews',
    turn: 'Turn {n} · ',
    noPath: '(no path)',
    habitCandidates: 'Habit candidates',
    evidence: '{n} evidence',
    confirmToMemory: 'Confirm (save to memory)',
    discard: 'Discard',
    available: 'Available',
    insufficient: 'Insufficient',
    querying: 'Querying…',
    queryFailed: 'Query failed',
    refresh: 'Refresh',
    notQueried: 'Not queried yet',
    lastUpdated: 'Last updated {t}',
    missingKey: 'API key not configured',
    httpFailed: 'Query failed (HTTP {status})',
    title: 'SSiD',
    slogan: 'Seek the soul in the dark.',
    checkUpdates: 'Check for updates',
    noRelease: 'No published release',
    newVersion: 'New version: {name} ({tag}, {date})',
    latestVersion: 'Up to date: {name} ({tag})',
    checking: 'Checking…',
    checkNow: 'Check now',
    checkFailed: 'Update check failed',
    apiFailed: 'Check failed (HTTP {status})',
    changelog: 'Changelog',
    none: '(none)',
    presetPlugins: 'Bundled plugins',
    notifyTitle: 'Notifications',
    notifyEnabled: 'Enable notifications',
    notifyEnabledDesc: 'Windows notifications when the window is unfocused (minimized/covered); silent while focused',
    notifyReplyDone: 'Reply done',
    notifyReplyDoneDesc: 'Notify when each turn completes (with duration)',
    notifyQuestion: 'Questions',
    notifyQuestionDesc: 'Notify when the AI asks you a question',
    notifyApproval: 'Approvals',
    notifyApprovalDesc: 'Notify when a tool requests approval',
  },
} as const
type StringKey = keyof typeof STRINGS.zh
let localeId: LocaleId = 'zh'
const localeListeners = new Set<() => void>()
function adoptLocale(id: string | undefined): void {
  const next: LocaleId = id === 'en' ? 'en' : 'zh'
  if (next === localeId) return
  localeId = next
  localeListeners.forEach(l => l())
}
function fmt(tpl: string, vars: Record<string, unknown> = {}): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''))
}
/** Copy function + locale subscription: mounted components re-render on DSH language switch. */
function useT(): (key: StringKey, vars?: Record<string, unknown>) => string {
  const [id, setId] = useState(localeId)
  useEffect(() => {
    const l = (): void => { setId(localeId) }
    localeListeners.add(l)
    return () => { localeListeners.delete(l) }
  }, [])
  return (key, vars) => fmt(STRINGS[id][key] ?? STRINGS.zh[key], vars)
}

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

/**
 * 记忆面板（0.3.0）：三组分组（待审核/已审核·按需/常驻注入）+ namespace
 * 筛选 + 搜索 + 「常驻注入」开关（approved 可切、suggested 禁用）+ 确认/
 * 删除 + 刷新 + 「整理记忆」按钮（一点即发：建会话→open→input 就绪后
 * setDraft→submit，机制实证自 dsh-better-sidebar conversation-draft.ts）。
 */

/** 状态面板：Guardian 触发线快照（1s 轮询，可见时）。 */
function GuardianView(props: { visible: boolean }): ReactNode {
  const t = useT()
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
  const label = level === 0 ? t('quiet') : t('level', { n: level })
  return createElement('div', { style: ssid.wrap },
    createElement('div', { style: ssid.card },
      createElement('div', { style: ssid.title },
        createElement('span', null, t('assertions')),
        createElement('span', { style: ssid.badge(level) }, label),
      ),
      createElement('div', { style: { fontSize: 22, fontWeight: 700, color: 'var(--dsw-alias-label-primary, #d8e0ea)' } }, String(count)),
    ),
    createElement('div', { style: ssid.card },
      createElement('div', { style: ssid.title }, t('reviewQueue')),
      queue.length === 0
        ? createElement('div', { style: ssid.muted }, t('noPending'))
        : queue.map((item, index) => createElement('div', { key: index, style: { ...ssid.text, fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
          `${item.turn !== undefined ? t('turn', { n: item.turn }) : ''}${item.filePath ?? t('noPath')}`,
        )),
    ),
  )
}

/** 习惯面板：dsh-habit 候选（第一级人工闸门）。 */
interface HabitCandidate { id: string, habit: string, confidence: string, evidenceCount: number, status: string }

function HabitView(props: { visible: boolean }): ReactNode {
  const t = useT()
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
      ? createElement('div', { style: ssid.empty }, t('noPending'))
      : pending.map(candidate => createElement('div', { key: candidate.id, style: ssid.card },
        createElement('div', { style: ssid.title },
          createElement('span', null, t('habitCandidates')),
          createElement('span', { style: ssid.badge(candidate.confidence === 'high' ? 1 : candidate.confidence === 'medium' ? 2 : 3) }, candidate.confidence),
        ),
        createElement('div', { style: ssid.text }, candidate.habit),
        createElement('div', { style: { ...ssid.muted, marginTop: 4 } }, t('evidence', { n: candidate.evidenceCount })),
        createElement('div', { style: { display: 'flex', gap: 6, marginTop: 8 } },
          createElement('button', { style: ssid.btn, onClick: () => { void api('habit.confirm', { id: candidate.id }).then(() => reload()) } }, t('confirmToMemory')),
          createElement('button', { style: ssid.btn, onClick: () => { void api('habit.discard', { id: candidate.id }).then(() => reload()) } }, t('discard')),
        ),
      )),
  )
}

/** 余额面板：DS/K3 两条余额 + 手动刷新。 */
interface BalanceInfo { ok: boolean, code?: 'missing-key' | 'http-failed', status?: number, isAvailable?: boolean, balanceInfos?: Array<{ currency: string, totalBalance: string }>, message?: string }

function BalanceView(): ReactNode {
  const t = useT()
  const [result, setResult] = useState<{ ds?: BalanceInfo, kimi?: BalanceInfo }>({})
  const [updated, setUpdated] = useState<string | null>(null)
  const refresh = async (): Promise<void> => {
    const [ds, kimi] = await Promise.all([
      api('balance.deepseek').then(value => value as BalanceInfo).catch(() => ({ ok: false, code: 'http-failed' as const }) as BalanceInfo),
      api('balance.kimi').then(value => value as BalanceInfo).catch(() => ({ ok: false, code: 'http-failed' as const }) as BalanceInfo),
    ])
    setResult({ ds, kimi })
    setUpdated(new Date().toLocaleTimeString(localeId === 'en' ? 'en-US' : 'zh-CN', { hour12: false }))
  }
  useEffect(() => { void refresh() }, [])
  const errorText = (info: BalanceInfo): string => {
    if (info.code === 'missing-key') return t('missingKey')
    if (info.code === 'http-failed') return `${t('httpFailed', { status: info.status ?? '?' })}${info.message !== undefined && info.message !== '' ? ` (${info.message})` : ''}`
    return info.message ?? t('queryFailed')
  }
  const card = (name: string, info: BalanceInfo | undefined): ReactNode => createElement('div', { style: ssid.card },
    createElement('div', { style: ssid.title },
      createElement('span', null, name),
      info?.ok === true
        ? createElement('span', { style: ssid.badge(info.isAvailable === true ? 0 : 3) }, info.isAvailable === true ? t('available') : t('insufficient'))
        : null,
    ),
    info === undefined
      ? createElement('div', { style: ssid.muted }, t('querying'))
      : !info.ok
        ? createElement('div', { style: ssid.muted }, errorText(info))
        : createElement('div', { style: { fontSize: 22, fontWeight: 700, color: 'var(--dsw-alias-label-primary, #d8e0ea)' } },
          `¥ ${Number(info.balanceInfos?.[0]?.totalBalance ?? '0').toFixed(2)}`),
  )
  return createElement('div', { style: ssid.wrap },
    card('DeepSeek', result.ds),
    card('Kimi K3', result.kimi),
    createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch' } },
      createElement('button', { style: ssid.btn, onClick: () => { void refresh() } }, t('refresh')),
      createElement('div', { style: { ...ssid.muted, textAlign: 'center' } }, updated === null ? t('notQueried') : t('lastUpdated', { t: updated })),
    ),
  )
}

/** 通知设置（2026-08-18）：总开关 + 三场景；配置存 ~/.ssid/notify.json，
 *  壳层主进程读同一文件实时生效。位于设置页「关于 SSiD」内。 */
interface NotifyConfig { enabled: boolean, replyDone: boolean, question: boolean, approval: boolean }

function NotifySettings(): ReactNode {
  const t = useT()
  const [config, setConfig] = useState<NotifyConfig | null>(null)
  useEffect(() => {
    void api('notify.get').then(value => { setConfig(value as NotifyConfig) }, () => { /* keep null */ })
  }, [])
  const toggle = async (key: keyof NotifyConfig): Promise<void> => {
    if (config === null) return
    const next = { ...config, [key]: !config[key] }
    setConfig(next)
    void api('notify.set', next).then(value => { setConfig(value as NotifyConfig) }, () => { setConfig(config) })
  }
  const row = (key: keyof NotifyConfig, labelKey: StringKey, descKey: StringKey): ReactNode => createElement('div', { style: ssid.card },
    createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
      createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 4 } },
        createElement('span', { style: { fontSize: 14, fontWeight: 600, color: 'var(--dsw-alias-label-primary, #d8e0ea)' } }, t(labelKey)),
        createElement('span', { style: { ...ssid.muted, fontSize: 12 } }, t(descKey)),
      ),
      createElement('button', {
        type: 'button',
        style: {
          width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', padding: 0,
          background: config !== null && config[key] ? 'var(--dsw-alias-state-business-primary, #4FC3F7)' : 'var(--dsw-alias-bg-module-platform, rgba(128,148,168,.2))',
          transition: 'background .15s',
        },
        onClick: () => { void toggle(key) },
      },
        createElement('span', { style: { display: 'block', width: 16, height: 16, borderRadius: 8, background: '#fff', marginLeft: config !== null && config[key] ? 22 : 2, transition: 'margin-left .15s' } }),
      ),
    ),
  )
  return createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
    row('enabled', 'notifyEnabled', 'notifyEnabledDesc'),
    row('replyDone', 'notifyReplyDone', 'notifyReplyDoneDesc'),
    row('question', 'notifyQuestion', 'notifyQuestionDesc'),
    row('approval', 'notifyApproval', 'notifyApprovalDesc'),
  )
}

/** 关于 SSiD 设置页：版本 / 检查更新 / 更新日志 / 预制插件。 */
interface UpdateInfo {  currentVersion: string
  code?: 'api-failed' | 'check-failed'
  status?: number
  latest?: { tag: string, name: string, body: string, publishedAt: string } | null
  releases?: Array<{ tag: string, name: string, body: string, publishedAt: string }>
  message?: string
}
interface AboutInfo { shellVersion: string, plugins: Array<{ id: string, name: string, version?: string, descriptionZh?: string, descriptionEn?: string }> }

function SsidAboutSection(): ReactNode {
  const t = useT()
  const [about, setAbout] = useState<AboutInfo | null>(null)
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [checking, setChecking] = useState(false)
  const check = async (): Promise<void> => {
    setChecking(true)
    try {
      setUpdate(await api('update-check') as UpdateInfo)
    } catch {
      setUpdate({ currentVersion: about?.shellVersion ?? '0.0.0', code: 'check-failed' })
    } finally {
      setChecking(false)
    }
  }
  useEffect(() => {
    void api('about').then((value) => {
      console.log('[ssid-about] about loaded:', JSON.stringify(value))
      setAbout(value as AboutInfo)
    }).catch((error: unknown) => {
      console.error('[ssid-about] about failed:', error instanceof Error ? error.message : String(error))
    })
  }, [])
  const latest = update?.latest ?? null
  const newer = latest !== null && latest.tag !== '' && latest.tag !== `v${update?.currentVersion ?? ''}`
  const descOf = (plugin: { descriptionZh?: string, descriptionEn?: string }): string =>
    localeId === 'en'
      ? (plugin.descriptionEn ?? plugin.descriptionZh ?? '')
      : (plugin.descriptionZh ?? plugin.descriptionEn ?? '')
  return createElement('div', { style: { ...ssid.wrap, maxWidth: 640, margin: '0 auto', width: '100%' } },
    createElement('div', { style: ssid.card },
      createElement('div', { style: ssid.title }, createElement('span', null, t('title'))),
      createElement('div', { style: { fontSize: 22, fontWeight: 700, color: 'var(--dsw-alias-label-primary, #d8e0ea)' } },
        `v${about?.shellVersion ?? '…'}`),
      createElement('div', { style: ssid.muted }, t('slogan')),
    ),
    createElement('div', { style: ssid.card },
      createElement('div', { style: ssid.title }, createElement('span', null, t('notifyTitle'))),
      createElement(NotifySettings),
    ),
    createElement('div', { style: ssid.card },
      createElement('div', { style: ssid.title }, createElement('span', null, t('checkUpdates'))),      latest === null
        ? update?.code === 'api-failed'
          ? createElement('div', { style: ssid.muted }, t('apiFailed', { status: update.status ?? '?' }))
          : update?.code === 'check-failed'
            ? createElement('div', { style: ssid.muted }, t('checkFailed'))
            : createElement('div', { style: ssid.muted }, t('noRelease'))
        : newer
          ? createElement('div', { style: { ...ssid.text, color: ssid.accent } }, t('newVersion', { name: latest.name, tag: latest.tag, date: latest.publishedAt.slice(0, 10) }))
          : createElement('div', { style: ssid.text }, t('latestVersion', { name: latest.name, tag: latest.tag })),
      createElement('button', { style: { ...ssid.btn, marginTop: 8 }, onClick: () => { void check() }, disabled: checking }, checking ? t('checking') : t('checkNow')),
    ),
    createElement('div', { style: ssid.card },
      createElement('div', { style: ssid.title }, createElement('span', null, t('changelog'))),
      (update?.releases ?? []).length === 0
        ? createElement('div', { style: ssid.muted }, t('none'))
        : (update?.releases ?? []).map(release => createElement('div', { key: release.tag, style: { marginBottom: 10 } },
          createElement('div', { style: { ...ssid.text, fontWeight: 600 } }, `${release.name}（${release.tag}）· ${release.publishedAt.slice(0, 10)}`),
          createElement('pre', { style: { ...ssid.muted, whiteSpace: 'pre-wrap', margin: '4px 0 0', fontSize: 11.5 } }, release.body),
        )),
    ),
    createElement('div', { style: ssid.card },
      createElement('div', { style: ssid.title }, createElement('span', null, t('presetPlugins'))),
      (about?.plugins ?? []).length === 0
        ? createElement('div', { style: ssid.muted }, t('none'))
        : (about?.plugins ?? []).map(plugin => createElement('div', { key: plugin.id, style: { padding: '5px 0', borderBottom: '1px solid var(--dsw-alias-border-l2, #1e2836)' } },
          createElement('div', { style: { display: 'flex', alignItems: 'baseline', gap: 6 } },
            createElement('span', { style: { ...ssid.text, fontWeight: 600, fontSize: 12 } }, plugin.name),
            createElement('span', { style: { ...ssid.muted, fontSize: 10.5 } }, plugin.version !== undefined ? `v${plugin.version}` : ''),
          ),
          descOf(plugin) !== ''
            ? createElement('div', { style: { ...ssid.muted, fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 } }, descOf(plugin))
            : null,
        )),
    ),
  )
}

/** The locale service's minimal surface (optional read + change event). */
interface LocaleFace {
  getLocale?: () => { active?: string }
}
/** Context verbs the i18n wiring needs beyond declared services. */
interface LocaleAwareContext {
  get?: (name: string) => unknown
  on?: (event: string, handler: (payload: unknown) => void) => void
}

/** Plugin body: settings about section (unconditional) + sidebar tabs (optional peer). */
export function apply(ctx: Context): void {
  // 双语：初始快照 + locale/change 事件（DSH 语言切换时组件经 useT 重渲染）。
  // locale 服务缺失时静默降级为中文（dsh-plugin-center 同款接线）。
  const face = ctx as unknown as LocaleAwareContext
  const locale = face.get?.('locale') as LocaleFace | undefined
  const initial = locale?.getLocale?.()?.active
  if (typeof initial === 'string') adoptLocale(initial)
  face.on?.('locale/change', (snap) => { adoptLocale((snap as { active?: string } | undefined)?.active) })

  // 设置导航图标：标记本插件行后由 CSS 把默认齿轮替换为 info（HMR-safe）。
  ctx.effect(() => registerSettingsNavIcon(() => STRINGS[localeId].about))

  // 设置页「关于 SSiD」：settings.section 顶级条目。
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'ssid-about',
    order: 100,
    label: () => STRINGS[localeId].about,
    inject: () => ({}),
  }, () => createElement(SsidAboutSection)))

  // rc.8 品牌槽位（sidebar.brand.mark / conversation.hero.brand.mark）：
  // 官方 ui-brand-official 在发布构建（DSH_CLIENT_BUILD_PROFILE=official 静态
  // 编译进 bundle）下以 priority 0 占用；single 槽 lowest renders，注册
  // priority -1 以 shadow 官方占位（同一 priority 重复注册会抛错）。
  ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register(
    { name: 'sidebar.brand.mark', priority: -1 },
    ({ size, className }: { size?: number; className?: string }) => createElement(SsidBrandMark, { size, className }),
  ))
  ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register(
    { name: 'conversation.hero.brand.mark', priority: -1 },
    ({ size, className }: { size?: number; className?: string }) => createElement(SsidBrandMark, { size, className }),
  ))

  // 侧栏 3 tab（记忆 tab 已归还 dsh-memory 自带——2026-08-19 归属迁移）：
  // betterSidebar 是可选软依赖（未安装时设置页仍可用）。
  ctx.inject(['betterSidebar'], (sidebarCtx: Context) => {
    const service = sidebarCtx.betterSidebar
    if (service === undefined) return
    sidebarCtx.effect(() => service.registerTab({
      id: '@max-null/dsh-ssid-panels:guardian',
      title: () => STRINGS[localeId].tabGuardian,
      icon: tabIcon('M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2'),
      order: 61,
      single: true,
      component: ({ visible }) => createElement(GuardianView, { visible }),
    }))
    sidebarCtx.effect(() => service.registerTab({
      id: '@max-null/dsh-ssid-panels:habit',
      title: () => STRINGS[localeId].tabHabit,
      icon: tabIcon('m17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14m-14 18-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3'),
      order: 62,
      single: true,
      component: ({ visible }) => createElement(HabitView, { visible }),
    }))
    sidebarCtx.effect(() => service.registerTab({
      id: '@max-null/dsh-ssid-panels:balance',
      title: () => STRINGS[localeId].tabBalance,
      icon: tabIcon('M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4'),
      order: 63,
      single: true,
      component: () => createElement(BalanceView),
    }))
  })
}

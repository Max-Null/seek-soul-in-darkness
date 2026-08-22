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
import { createElement, Fragment, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type {} from 'dsh-better-sidebar'
import type { Context } from 'cordis'

export const inject = ['slots']

// ---- SSiD 品牌标记（rc.8 品牌槽位：sidebar.brand.mark / conversation.hero.brand.mark） ----
// 槽位由 ui-sidebar/ui-conversation 声明（带 FishLogo fallback）。官方
// ui-brand-official 在发布构建（DSH_CLIENT_BUILD_PROFILE=official 静态编译）
// 以 priority 0 占用 single 槽；本插件注册 priority -1（lowest renders）
// shadow 官方占位（2026-08-20 实测同 priority 会抛冲突）。
// 标记直接使用应用图标（shell/assets/icon.png 96px）内联 data-URL，与
// 任务栏/窗口图标一致（2026-08-20 用户反馈：之前误用了 assets/logo.svg 重现）。
import { SSID_ICON_DATA_URL } from './icon-data'

/** SSiD brand mark: the app icon, sized by the slot owner prop. */
function SsidBrandMark({ size = 24, className }: { size?: number; className?: string }): ReactNode {
  return createElement('img', {
    width: size, height: size, src: SSID_ICON_DATA_URL,
    className, alt: '', 'aria-hidden': true,
    style: { borderRadius: Math.max(2, size * 0.14), display: 'block' },
  })
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
    sessionRootTitle: '会话存储',
    sessionRootIsolated: '独立会话存储',
    sessionRootIsolatedDesc: '与手动 dsh web 的会话目录隔离，避免两个宿主并发写坏会话日志；重启 SSiD 后生效',
    sessionRootApplied: '当前生效：{v}',
    sessionRootAppliedOn: '独立（sessions-ssid）',
    sessionRootAppliedOff: '共享（sessions）',
    sessionRootPendingHint: '重启 SSiD 后生效（当前开关与生效状态不一致）',
    sessionRootImport: '载入原 DSH 会话',
    sessionRootImportDesc: '把共享根的历史会话复制到独立根（原件保留，已存在的会话跳过）',
    sessionRootImporting: '载入中…',
    sessionRootImportDone: '已载入 {copied} 个，跳过 {skipped} 个',
    sessionRootImportFailed: '载入出错 {n} 个，请查看日志',
    sessionRootRestartConfirm: '切换后需要重启 DSH 才能生效，是否现在重启？',
    sessionRootRestartBusy: '有 {n} 个会话正在进行中，未执行重启；设置已保存，请等待完成后再重启',
    sessionRootRestarting: '正在重启 DSH…',
    sessionRootRestartUnavailable: '当前环境不支持自动重启，请手动重启 SSiD',
    sessionRootRestartAskTitle: '需要重启生效',
    sessionRootRestartAskBody: '切换已保存，重启思灵后生效（有进行中会话时会先检查）',
    sessionRootRestartNow: '立即重启',
    sessionRootRestartLater: '稍后',
    sessionRootCounts: '独立根 {a} 个会话 · 共享根 {b} 个会话 · 已载入 {c} 个',
    sessionRootClear: '移除已载入会话',
    sessionRootClearConfirm: '将删除 {n} 个已载入的会话（隔离后新建的会话与共享根都不受影响，原件保留）。确定移除？',
    sessionRootCleared: '已移除 {n} 个已载入会话',
    sessionRootRefreshHint: '重启思灵后生效（载入/清空不触发会话列表刷新）',
    sessionRootRestartBtn: '重启思灵',
    sessionRootLoadFailed: '无法读取会话存储状态（插件服务未就绪）；请重启 SSiD 后重试',
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
    sessionRootTitle: 'Session storage',
    sessionRootIsolated: 'Isolate session storage',
    sessionRootIsolatedDesc: 'Separate the session directory from the manual dsh web, so two hosts cannot corrupt the same log; takes effect after restarting SSiD',
    sessionRootApplied: 'Active: {v}',
    sessionRootAppliedOn: 'isolated (sessions-ssid)',
    sessionRootAppliedOff: 'shared (sessions)',
    sessionRootPendingHint: 'Takes effect after restarting SSiD (switch differs from active state)',
    sessionRootImport: 'Import original DSH sessions',
    sessionRootImportDesc: 'Copy historical sessions from the shared root into the isolated root (originals kept; existing ids skipped)',
    sessionRootImporting: 'Importing…',
    sessionRootImportDone: 'Imported {copied}, skipped {skipped}',
    sessionRootImportFailed: '{n} import error(s); check the log',
    sessionRootRestartConfirm: 'A DSH restart is required for the switch to take effect. Restart now?',
    sessionRootRestartBusy: '{n} session(s) still in progress — restart skipped; setting saved, restart later',
    sessionRootRestarting: 'Restarting DSH…',
    sessionRootRestartUnavailable: 'Auto-restart unavailable here; please restart DSH manually',
    sessionRootRestartAskTitle: 'Restart required',
    sessionRootRestartAskBody: 'Switch saved; takes effect after restarting SSiD (active sessions are checked first)',
    sessionRootRestartNow: 'Restart now',
    sessionRootRestartLater: 'Later',
    sessionRootCounts: 'Isolated root {a} sessions · shared root {b} sessions · imported {c}',
    sessionRootClear: 'Remove imported sessions',
    sessionRootClearConfirm: 'This deletes {n} imported session(s) only (sessions created after isolation and the shared root are untouched; originals kept). Remove now?',
    sessionRootCleared: 'Removed {n} imported session(s)',
    sessionRootRefreshHint: 'Takes effect after restarting SSiD (import/clear does not refresh the session list in-place)',
    sessionRootRestartBtn: 'Restart SSiD',
    sessionRootLoadFailed: 'Cannot read session storage state (plugin service not ready); restart SSiD and retry',
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

/** 自绘确认弹窗（2026-08-22，替代原生 window.confirm，与插件中心同款样式；
 *  重启确认与「清空独立根」的二次确认共用，danger 时确认按钮红色）。 */
function ConfirmDialog({ title, body, confirmLabel, cancelLabel, danger = false, onConfirm, onClose }: {
  title: string, body: string, confirmLabel: string, cancelLabel: string, danger?: boolean,
  onConfirm: () => void, onClose: () => void,
}): ReactNode {
  return createPortal(
    createElement('div', { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 } },
      createElement('div', { style: { width: 'min(420px, 92vw)', background: 'var(--dsw-alias-bg-layer-1, #131a26)', border: '1px solid var(--dsw-alias-border-l2, #1e2836)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 } },
        createElement('div', { style: { fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-label-primary, #d8e0ea)' } }, title),
        createElement('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #67748a)', lineHeight: 1.5 } }, body),
        createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
          createElement('button', { type: 'button', style: ssid.btn, onClick: onClose }, cancelLabel),
          createElement('button', {
            type: 'button',
            style: danger
              ? { padding: '3px 12px', fontSize: 11.5, background: 'var(--dsw-alias-state-business-critical, #f76f4f)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontWeight: 600 }
              : {
                padding: '3px 12px', fontSize: 11.5, border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
                background: 'var(--dsw-alias-button-primary-fill)',
                color: 'var(--dsw-alias-label-primary-foreground)',
              },
            onClick: onConfirm,
          }, confirmLabel),
        ),
      ),
    ),
    document.body,
  )
}

/** 会话存储隔离设置（2026-08-22）：独立 root 开关 + 载入原 DSH 会话。
 *  配置存 ~/.ssid/session-root.json（isolated=开关，applied=boot 生效值，
 *  由 shell/kernel.ts 回写）；载入＝把共享根会话复制到独立根（原件保留）。 */
interface SessionRootInfo {
  isolated: boolean
  applied: boolean
  /** 壳层重启通道是否可用（SSiD 内嵌 boot 才有；手动 dsh web 为 false）。 */
  restartable?: boolean
  sharedRoot?: string
  isolatedRoot?: string
  sharedSessions?: number
  isolatedSessions?: number
  /** B 方案（2026-08-23）：已从共享根载入的会话数（移除按钮可用性依据）。 */
  importedSessions?: number
  /** 持久判定（host）：本次启动后是否载入/移除过会话（重启按钮按需展示）。 */
  listNeedsRestart?: boolean
}
interface SessionImportResult { copied: number, skipped: number, errors: string[] }

function SessionRootSettings(): ReactNode {
  const t = useT()
  const [info, setInfo] = useState<SessionRootInfo | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [importing, setImporting] = useState(false)
  // 统一「操作反馈行」：载入/移除/重启结果都显示在卡片内同一位置。
  const [resultNotice, setResultNotice] = useState<string | null>(null)
  // 自绘「立即重启 / 稍后」确认弹窗（与插件中心 RestartDialog 同款样式，
  // 不再用原生 window.confirm，保持与 DSH 主题一致）。
  const [restartAsk, setRestartAsk] = useState(false)
  useEffect(() => {
    void api('sessionRoot.get').then(value => {
      setInfo(value as SessionRootInfo)
      setLoadFailed(false)
    }, () => { setLoadFailed(true) })
  }, [])
  const runRestartNow = (): void => {
    void api('sessionRoot.restart').then(result => {
      const r = result as { ok?: boolean, code?: string, activeSessions?: number }
      if (r.code === 'busy') {
        setResultNotice(t('sessionRootRestartBusy', { n: r.activeSessions ?? 0 }))
      } else if (r.ok === true) {
        setResultNotice(t('sessionRootRestarting'))
      }
    }).catch(() => setResultNotice(t('sessionRootRestartUnavailable')))
  }
  const toggle = async (): Promise<void> => {
    if (info === null) return
    const nextIsolated = !info.isolated
    const previous = info
    setInfo({ ...info, isolated: nextIsolated })
    setResultNotice(null)
    try {
      const saved = await api('sessionRoot.set', { isolated: nextIsolated }) as SessionRootInfo
      setInfo(saved)
      // 状态发生变化时才需要重启（isolation 开启/关闭都算变化）。
      if (nextIsolated !== info.applied) {
        if (saved.restartable === true) {
          // 壳层重启通道可用（SSiD）：自绘弹窗确认后自动重启。
          setRestartAsk(true)
        } else {
          // 手动 dsh web：只保存，提示手动重启生效。
          setResultNotice(t('sessionRootRestartUnavailable'))
        }
      }
    } catch {
      setInfo(previous)
    }
  }
  const runImport = async (): Promise<void> => {
    setImporting(true)
    try {
      const r = await api('sessionRoot.import') as SessionImportResult
      // 统一操作反馈行：载入/移除/重启提示都进 resultNotice（同一位置）。
      setResultNotice(r.errors.length > 0
        ? t('sessionRootImportFailed', { n: r.errors.length })
        : t('sessionRootImportDone', { copied: r.copied, skipped: r.skipped }))
      // 重启按钮是否出现由 host 持久判定（listNeedsRestart：清单 mtime vs
      // boot 时刻），重开面板/跳过再载入都不会丢；重启后自动消失。
      void api('sessionRoot.get').then(value => setInfo(value as SessionRootInfo), () => { /* keep */ })
    } catch (error: unknown) {
      setResultNotice(t('sessionRootImportFailed', { n: 1 }))
    } finally {
      setImporting(false)
    }
  }
  const [clearAsk, setClearAsk] = useState(false)
  const runClear = async (): Promise<void> => {
    setClearAsk(false)
    try {
      const r = await api('sessionRoot.clear') as { cleared?: number }
      setResultNotice(t('sessionRootCleared', { n: r.cleared ?? 0 }))
      void api('sessionRoot.get').then(value => setInfo(value as SessionRootInfo), () => { /* keep */ })
    } catch (error: unknown) {
      setResultNotice(t('sessionRootImportFailed', { n: 1 }))
    }
  }
  const pending = info !== null && info.isolated !== info.applied
  return createElement(Fragment, null,
    createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
      createElement('div', { style: ssid.card },
        createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
          createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 4 } },
            createElement('span', { style: { fontSize: 14, fontWeight: 600, color: 'var(--dsw-alias-label-primary, #d8e0ea)' } }, t('sessionRootIsolated')),
            createElement('span', { style: { ...ssid.muted, fontSize: 12 } }, t('sessionRootIsolatedDesc')),
          ),
          createElement('button', {
            type: 'button',
            disabled: info === null,
            style: {
              width: 40, height: 22, borderRadius: 11, border: 'none', cursor: info === null ? 'not-allowed' : 'pointer', padding: 0, opacity: info === null ? 0.5 : 1,
              background: info !== null && info.isolated ? 'var(--dsw-alias-state-business-primary, #4FC3F7)' : 'var(--dsw-alias-bg-module-platform, rgba(128,148,168,.2))',
              transition: 'background .15s',
            },
            onClick: () => { void toggle() },
          },
            createElement('span', { style: { display: 'block', width: 16, height: 16, borderRadius: 8, background: '#fff', marginLeft: info !== null && info.isolated ? 22 : 2, transition: 'margin-left .15s' } }),
          ),
        ),
      ),
      info === null
        ? createElement('div', { style: { ...ssid.muted, fontSize: 12, padding: '0 2px', color: '#f76f4f' } }, t('sessionRootLoadFailed'))
        : createElement('div', { style: { ...ssid.muted, fontSize: 12, padding: '0 2px' } },
          pending
            ? t('sessionRootPendingHint')
            : t('sessionRootApplied', { v: info.applied ? t('sessionRootAppliedOn') : t('sessionRootAppliedOff') }),
        ),
      info !== null
        ? createElement('div', { style: { ...ssid.muted, fontSize: 12, padding: '0 2px' } },
          t('sessionRootCounts', { a: info.isolatedSessions ?? 0, b: info.sharedSessions ?? 0, c: info.importedSessions ?? 0 }),
        )
        : null,
      info?.isolated === true
        ? createElement('div', { style: ssid.card },
          // 1) 标题 + 描述（垂直堆叠，描述可换行不再被按钮挤压）
          createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
            createElement('span', { style: { fontSize: 14, fontWeight: 600, color: 'var(--dsw-alias-label-primary, #d8e0ea)' } }, t('sessionRootImport')),
            createElement('span', { style: { ...ssid.muted, fontSize: 12, lineHeight: 1.5 } }, t('sessionRootImportDesc')),
          ),
          // 2) 主操作行：与 DSH 官方「编辑/删除」同款幽灵按钮（右对齐）
          createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 } },
            createElement('button', {
              type: 'button',
              disabled: importing,
              style: {
                padding: '3px 12px', fontSize: 11.5, borderRadius: 6, cursor: 'pointer', fontWeight: 600,
                border: 'none', background: 'transparent',
                color: 'var(--dsw-alias-label-primary, #d8e0ea)',
              },
              onClick: () => { void runImport() },
            }, importing ? t('sessionRootImporting') : t('sessionRootImport')),
            createElement('button', {
              type: 'button',
              style: {
                padding: '3px 12px', fontSize: 11.5, borderRadius: 6, cursor: 'pointer',
                border: 'none', background: 'transparent',
                color: 'var(--dsw-alias-state-error-primary, #f76f4f)',
              },
              disabled: (info?.importedSessions ?? 0) === 0,
              onClick: () => { setClearAsk(true) },
            }, t('sessionRootClear')),
          ),
          // 3) 统一操作反馈行（载入/移除/重启提示都在此）
          resultNotice !== null
            ? createElement('div', { style: { ...ssid.muted, fontSize: 12, marginTop: 8, color: ssid.accent } }, resultNotice)
            : null,
          // 4) 重启行（host 持久判定：本次启动后载入/移除过会话才出现）
          info?.listNeedsRestart === true
            ? createElement('div', {
              style: {
                display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, paddingTop: 10,
                borderTop: '1px solid var(--dsw-alias-border-l2, #1e2836)',
              },
            },
              createElement('button', {
                type: 'button',
                style: {
                  padding: '3px 12px', fontSize: 11.5, borderRadius: 6, cursor: 'pointer',
                  border: 'none', background: 'transparent',
                  color: 'var(--dsw-alias-label-primary, #d8e0ea)',
                },
                onClick: () => { setRestartAsk(true) },
              }, t('sessionRootRestartBtn')),
              createElement('span', { style: { ...ssid.muted, fontSize: 11 } }, t('sessionRootRefreshHint')),
            )
            : null,
        )
        : null,
    ),
    restartAsk
      ? createElement(ConfirmDialog, {
        title: t('sessionRootRestartAskTitle'), body: t('sessionRootRestartAskBody'),
        confirmLabel: t('sessionRootRestartNow'), cancelLabel: t('sessionRootRestartLater'),
        onConfirm: () => { setRestartAsk(false); runRestartNow() },
        onClose: () => { setRestartAsk(false) },
      })
      : null,
    clearAsk
      ? createElement(ConfirmDialog, {
        title: t('sessionRootClear'), body: t('sessionRootClearConfirm', { n: info?.importedSessions ?? 0 }),
        confirmLabel: t('sessionRootClear'), cancelLabel: t('sessionRootRestartLater'), danger: true,
        onConfirm: () => { void runClear() },
        onClose: () => { setClearAsk(false) },
      })
      : null,
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
      createElement('div', { style: ssid.title }, createElement('span', null, t('sessionRootTitle'))),
      createElement(SessionRootSettings),
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
  // 侧边栏品牌名（fallback "DSH Local Build"）→ 思灵。
  ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register(
    { name: 'sidebar.brand.name', priority: -1 },
    () => createElement('span', { style: { fontSize: 13, fontWeight: 600 } }, '思灵'),
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

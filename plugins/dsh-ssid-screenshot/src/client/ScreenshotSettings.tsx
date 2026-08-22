/**
 * ScreenshotSettings: two General-settings rows (settings.general.item —
 * the additive seat for a single setting that needs no page of its own).
 *
 * Rows (each fetched/saved through /ssid/api/screenshot/*):
 *  - screenshot-hide: 截图时是否隐藏思灵窗口（checkbox，切换即保存）
 *  - screenshot-hotkey: 全局快捷键（input，回车/失焦即保存，实时重注册）
 *
 * The General row contract: the section supplies no props at all — copy,
 * current value, and the write path are all the registrant's own.
 */
import { createElement, useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { screenshotGet, screenshotSet } from './api'

/** Product copy (zh/en via the document lang). */
const STRINGS: Record<string, Record<string, string>> = {
  zh: {
    hideTitle: '截图时隐藏思灵窗口',
    hideDesc: '开：冻结帧不含思灵自身（引用其他应用）；关：冻结帧包含思灵（可框选对话内容）',
    hotkeyTitle: '截图全局快捷键',
    hotkeyDesc: 'Electron accelerator 语法，如 Control+Shift+A；保存后立即生效',
    placeholder: 'Control+Shift+A',
    saved: '✓ 已保存',
    saveFail: '保存失败：',
    hotkeyInvalid: '格式无效，例：Control+Shift+A',
    loadFail: '加载失败',
  },
  en: {
    hideTitle: 'Hide the SSiD window while capturing',
    hideDesc: 'On: frozen frame excludes SSiD (reference other apps); Off: includes SSiD (can box-select conversation content)',
    hotkeyTitle: 'Capture global shortcut',
    hotkeyDesc: 'Electron accelerator syntax, e.g. Control+Shift+A; takes effect immediately',
    placeholder: 'Control+Shift+A',
    saved: '✓ Saved',
    saveFail: 'Save failed: ',
    hotkeyInvalid: 'Invalid format, e.g. Control+Shift+A',
    loadFail: 'Failed to load',
  },
}

function langStrings(): Record<string, string> {
  const lang = typeof document !== 'undefined' ? (document.documentElement.lang || 'zh').toLowerCase() : 'zh'
  return STRINGS[lang.startsWith('zh') ? 'zh' : 'en']
}

/** Row styles — the DSH General-settings row language (title/desc left, control right). */
const CSS = [
  '.ssd3r{display:flex;align-items:center;gap:16px;padding:12px 0}',
  '.ssd3r+.ssd3r{border-top:1px solid var(--dsw-alias-border-l2)}',
  '.ssd3r-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
  '.ssd3r-title{font-size:13px;font-weight:500;line-height:1.5;color:var(--dsw-alias-label-primary)}',
  '.ssd3r-desc{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}',
  '.ssd3r-check{flex:none;width:16px;height:16px;margin:0;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}',
  '.ssd3r-input{flex:none;width:200px;height:34px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-3);font:inherit;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary)}',
  '.ssd3r-input:focus-visible{outline:none;border-color:var(--dsw-alias-brand-primary)}',
  '.ssd3r-input::placeholder{color:var(--dsw-alias-label-tertiary)}',
  '.ssd3r-msg{font-size:12px;line-height:1.5}',
  '.ssd3r-msg[data-ok=true]{color:var(--dsw-alias-state-success-primary)}',
  '.ssd3r-msg[data-ok=false]{color:var(--dsw-alias-state-error-primary)}',
].join('')

const STYLE_ID = '@max-null/dsh-ssid-screenshot/settings.css'
if (typeof document !== 'undefined' && document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`) === null) {
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-ssid-screenshot'
  tag.dataset.pluginCss = STYLE_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
}

const HOTKEY_PATTERN = /^[A-Za-z0-9+]+$/

/** One General-row skeleton: title/desc left, control right, transient msg below the title. */
function Row(props: { title: string, desc: string, control: ReactNode, msg: { ok: boolean, text: string } | null }): ReactNode {
  return createElement('div', { className: 'ssd3r' }, [
    createElement('div', { key: 'text', className: 'ssd3r-text' }, [
      createElement('div', { key: 'title', className: 'ssd3r-title' }, props.title),
      createElement('div', { key: 'desc', className: 'ssd3r-desc' }, props.desc),
      props.msg !== null
        ? createElement('div', { key: 'msg', className: 'ssd3r-msg', 'data-ok': props.msg.ok ? 'true' : 'false' }, props.msg.text)
        : null,
    ]),
    props.control,
  ])
}

/** 隐藏窗口开关行：切换即保存；非壳环境（无此能力）整行隐藏。 */
export function ScreenshotHideRow(): ReactNode {
  const t = langStrings()
  const [value, setValue] = useState<boolean | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean, text: string } | null>(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    let cancelled = false
    screenshotGet()
      .then((config) => {
        if (cancelled) return
        if (!config.shellAvailable) {
          setHidden(true)
          return
        }
        setValue(config.hideWindow)
      })
      .catch(() => { if (!cancelled) setMsg({ ok: false, text: t.loadFail }) })
    return () => { cancelled = true }
  }, [t])

  if (hidden) return null

  const toggle = useCallback((): void => {
    const next = !value
    setValue(next)
    setMsg(null)
    screenshotSet({ hideWindow: next })
      .then(() => setMsg({ ok: true, text: t.saved }))
      .catch((error: unknown) => {
        setValue(!next)
        setMsg({ ok: false, text: t.saveFail + (error instanceof Error ? error.message : String(error)) })
      })
  }, [value, t])

  return createElement(Row, {
    title: t.hideTitle,
    desc: t.hideDesc,
    msg,
    control: createElement('input', {
      className: 'ssd3r-check',
      type: 'checkbox',
      checked: value === true,
      disabled: value === null,
      'aria-label': t.hideTitle,
      onChange: toggle,
    }),
  })
}

/** 全局快捷键行：回车/失焦即保存（延时 300ms 防抖）；非壳环境整行隐藏。 */
export function ScreenshotHotkeyRow(): ReactNode {
  const t = langStrings()
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean, text: string } | null>(null)
  const [hidden, setHidden] = useState(false)
  const timer = useRef(0)

  useEffect(() => {
    let cancelled = false
    screenshotGet()
      .then((config) => {
        if (cancelled) return
        if (!config.shellAvailable) {
          setHidden(true)
          return
        }
        setValue(config.hotkey)
      })
      .catch(() => { if (!cancelled) setMsg({ ok: false, text: t.loadFail }) })
    return () => { cancelled = true }
  }, [t])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  if (hidden) return null

  const save = useCallback((raw: string): void => {
    window.clearTimeout(timer.current)
    const hotkey = raw.trim()
    if (hotkey === '') return
    if (!HOTKEY_PATTERN.test(hotkey)) {
      setMsg({ ok: false, text: t.hotkeyInvalid })
      return
    }
    setSaving(true)
    setMsg(null)
    screenshotSet({ hotkey })
      .then(() => { setMsg({ ok: true, text: t.saved }) })
      .catch((error: unknown) => {
        setMsg({ ok: false, text: t.saveFail + (error instanceof Error ? error.message : String(error)) })
      })
      .finally(() => { setSaving(false) })
  }, [t])

  const scheduleSave = useCallback((raw: string): void => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => save(raw), 300)
  }, [save])

  return createElement(Row, {
    title: t.hotkeyTitle,
    desc: t.hotkeyDesc,
    msg,
    control: createElement('input', {
      className: 'ssd3r-input',
      type: 'text',
      value,
      placeholder: t.placeholder,
      spellCheck: false,
      disabled: saving,
      onKeyDown: (e: { key: string }) => { if (e.key === 'Enter') save(value) },
      onChange: (e: { target: { value: string } }) => { setValue(e.target.value); setMsg(null) },
      onBlur: () => scheduleSave(value),
    }),
  })
}

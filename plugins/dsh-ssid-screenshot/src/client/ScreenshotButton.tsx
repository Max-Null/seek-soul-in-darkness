/**
 * ScreenshotButton: the composer's right-tool-seat entry (conversation.input.right
 * — the official "before the send button" seat, same seat as dsh-draft-polish).
 * Clicked → POST /ssid/api/screenshot/trigger → 壳层开全屏框选浮层；截图完成后
 * 由本插件 client 半（index.ts）投递到输入框。无 SSiD 壳（手动 dsh web）时
 * 503 → toast 提示。
 *
 * 视觉顺序：本按钮显示在润色按钮左侧（CSS order 规则，见下方 STYLES：
 * model seat/ContextMeter = 0，本 wrap = 1，润色 wrap = 2，发送 = 3）。
 */
import { createElement, useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { screenshotTrigger } from './api'

/** Product copy (zh/en via the document lang, same pattern as dsh-draft-polish). */
const STRINGS: Record<string, Record<string, string>> = {
  zh: {
    button: '截图',
    tooltip: '框选屏幕区域，截图直接进入消息框（快捷键见设置）',
    shellOnly: '截图仅在思灵桌面壳（SSiD）可用',
    failed: '截图触发失败：',
  },
  en: {
    button: 'Capture',
    tooltip: 'Box-select a screen region; the image lands in the composer',
    shellOnly: 'Capture is only available inside the SSiD desktop shell',
    failed: 'Capture failed: ',
  },
}

function langStrings(): Record<string, string> {
  const lang = typeof document !== 'undefined' ? (document.documentElement.lang || 'zh').toLowerCase() : 'zh'
  return STRINGS[lang.startsWith('zh') ? 'zh' : 'en']
}

/** Button + toast styles (theme-variable driven, same posture as polish button). */
const CSS = [
  '.ssd3-wrap{position:relative;display:grid;place-items:center}',
  '.ssd3-wrap{order:1}',
  '.ssd3-btn{background:0 0;border:none;border-radius:999px;width:28px;height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;place-items:center;display:grid;flex:none;transition:background-color .15s,color .15s;padding:0}',
  '.ssd3-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary)}',
  '.ssd3-btn:disabled{opacity:.5;cursor:default}',
  '.ssd3-toast{position:fixed;bottom:80px;left:50%;background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 14px;font-size:13px;line-height:20px;pointer-events:none;z-index:9999;white-space:nowrap;transform:translate(-50%,0);animation:ssd3-fade .15s ease-out;max-width:70vw;overflow:hidden;text-overflow:ellipsis}',
  '.ssd3-toast[data-error=true] span{color:var(--dsw-alias-state-error-primary)}',
  '@keyframes ssd3-fade{from{opacity:0;transform:translate(-50%,4px)}to{opacity:1;transform:translate(-50%,0)}}',
].join('')

const STYLE_ID = '@max-null/dsh-ssid-screenshot/button.css'
if (typeof document !== 'undefined') {
  document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`)?.remove()
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-ssid-screenshot'
  tag.dataset.pluginCss = STYLE_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
}

/** Lucide `camera` glyph (currentColor). */
function IconCamera(): ReactNode {
  return createElement('svg', {
    viewBox: '0 0 16 16',
    width: '15',
    height: '15',
    fill: 'none',
    'aria-hidden': true,
  }, createElement('path', {
    d: 'M5.1 3.2a.5.5 0 0 1 .4-.2h5a.5.5 0 0 1 .4.2l.9 1.2h2.2a1 1 0 0 1 1 1v6.6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5.4a1 1 0 0 1 1-1h2.2l.9-1.2Zm-.06.8-.75 1H2v7h12v-7h-2.29l-.75-1H5.04ZM8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0-1.2a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6Z',
    fill: 'currentColor',
  }))
}

/** 截图按钮：触发壳层框选浮层（无草稿依赖，任何会话状态可点）。 */
export function ScreenshotButton(): ReactNode {
  const t = langStrings()
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ text: string, error: boolean } | null>(null)
  const toastTimer = useRef(0)

  const showToast = useCallback((text: string, error: boolean): void => {
    setToast({ text, error })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => { setToast(null) }, 2500)
  }, [])

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  const handleClick = useCallback((): void => {
    if (busy) return
    setBusy(true)
    screenshotTrigger()
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        showToast(message.includes('shell') ? t.shellOnly : t.failed + message, true)
      })
      .finally(() => { setBusy(false) })
  }, [busy, showToast, t])

  return createElement('div', { className: 'ssd3-wrap' }, [
    createElement('button', {
      key: 'btn',
      type: 'button',
      className: 'ssd3-btn',
      disabled: busy,
      'aria-label': t.button,
      title: t.tooltip,
      onClick: handleClick,
    }, IconCamera()),
    toast !== null
      ? createElement('div', { key: 'toast', className: 'ssd3-toast' },
        createElement('span', { 'data-error': toast.error ? 'true' : 'false' }, toast.text))
      : null,
  ])
}

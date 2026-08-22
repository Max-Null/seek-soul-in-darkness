/**
 * ScreenshotButton: the composer's right-tool-seat entry (conversation.input.right
 * — the same seat as dsh-draft-polish), dual-engine:
 *
 *  - SSiD 壳内（引擎 A）：POST /ssid/api/screenshot/trigger → 壳开全屏浮层
 *    （多显示器、快捷键、隐藏窗口、像素级帧）。
 *  - 纯 DSH / 无壳（引擎 B）：点击手势内同步调用 navigator.mediaDevices
 *    .getDisplayMedia（系统选择器选一个屏幕）→ 抓一帧 → 页面内全屏遮罩
 *    CaptureOverlay（框选 + 红框标注）→ 官方 drop intake 投递。
 *
 * 探测（shellAvailable，来自 host 的 /ssid/api/screenshot/get）在组件挂载时
 * 拉取并缓存——点击必须同步决定引擎（getDisplayMedia 要求用户手势调用栈），
 * 不能先 await 再选。
 */
import { createElement, useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { screenshotGet, screenshotTrigger } from './api'
import { CaptureOverlay, type CaptureOverlayProps } from './CaptureOverlay'
import { deliverToComposer } from './delivery'

/** Product copy (zh/en via the document lang, same pattern as dsh-draft-polish). */
const STRINGS: Record<string, Record<string, string>> = {
  zh: {
    button: '截图',
    tooltip: '框选屏幕区域，截图直接进入消息框（支持标注；思灵壳内可用快捷键）',
    triggerFailed: '截图触发失败：',
    captureUnsupported: '当前浏览器不支持屏幕捕获',
    captureRejected: '未获得屏幕共享权限',
    captureFailed: '截图失败：',
  },
  en: {
    button: 'Capture',
    tooltip: 'Box-select a screen region; the image lands in the composer (annotation supported)',
    triggerFailed: 'Capture failed: ',
    captureUnsupported: 'Screen capture is not supported by this browser',
    captureRejected: 'Screen share permission was not granted',
    captureFailed: 'Capture failed: ',
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

/** 壳探测缓存（模块级，避免重复探测；失败后回调为 false 即切换引擎 B）。 */
let shellProbe: boolean | null = null

/** 截图按钮：双引擎截图（壳浮层 或 浏览器 getDisplayMedia + 页面遮罩）。 */
export function ScreenshotButton(): ReactNode {
  const t = langStrings()
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ text: string, error: boolean } | null>(null)
  const [overlay, setOverlay] = useState<Omit<CaptureOverlayProps, 'onDone' | 'onCancel'> | null>(null)
  const toastTimer = useRef(0)

  const showToast = useCallback((text: string, error: boolean): void => {
    setToast({ text, error })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => { setToast(null) }, 2500)
  }, [])

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  // 挂载时探测壳（失败不阻塞：引擎 B 兜底）。
  useEffect(() => {
    let cancelled = false
    screenshotGet()
      .then((config) => { if (!cancelled) shellProbe = config.shellAvailable })
      .catch(() => { if (!cancelled) shellProbe = false })
    return () => { cancelled = true }
  }, [])

  /** 引擎 A：壳浮层（异步触发；失败切换引擎 B 缓存）。 */
  const triggerShell = useCallback((): void => {
    screenshotTrigger()
      .then(() => { setBusy(false) })
      .catch((error: unknown) => {
        shellProbe = false
        setBusy(false)
        const message = error instanceof Error ? error.message : String(error)
        showToast(t.triggerFailed + message, true)
      })
  }, [showToast, t])

  /** 引擎 B：浏览器屏幕捕获（必须在用户手势内同步调用 getDisplayMedia）。 */
  const beginBrowserCapture = useCallback((): void => {
    const media = navigator.mediaDevices
    if (media === undefined || typeof media.getDisplayMedia !== 'function') {
      showToast(t.captureUnsupported, true)
      return
    }
    setBusy(true)
    void (async () => {
      const stream = await media.getDisplayMedia({ video: { displaySurface: 'screen' }, audio: false }).catch(() => null)
      if (stream === null) {
        setBusy(false)
        showToast(t.captureRejected, true)
        return
      }
      try {
        const track = stream.getVideoTracks()[0]
        const settings = track.getSettings()
        const video = document.createElement('video')
        video.srcObject = stream
        video.muted = true
        await video.play()
        const w = Math.max(1, Math.round(settings.width ?? video.videoWidth ?? 0))
        const h = Math.max(1, Math.round(settings.height ?? video.videoHeight ?? 0))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d')!.drawImage(video, 0, 0, w, h)
        const dataUrl = canvas.toDataURL('image/png')
        for (const item of stream.getTracks()) item.stop()
        video.srcObject = null
        setBusy(false)
        setOverlay({ dataUrl, width: w, height: h })
      } catch (error: unknown) {
        for (const item of stream.getTracks()) item.stop()
        setBusy(false)
        showToast(t.captureFailed + (error instanceof Error ? error.message : String(error)), true)
      }
    })()
  }, [showToast, t])

  const handleClick = useCallback((): void => {
    if (busy || overlay !== null) return
    setBusy(true)
    // 同步决定引擎：壳存在走壳浮层；否则浏览器捕获（getDisplayMedia 在手势内）。
    if (shellProbe === true) triggerShell()
    else beginBrowserCapture()
  }, [busy, overlay, triggerShell, beginBrowserCapture])

  const overlayDone = useCallback((dataUrl: string): void => {
    setOverlay(null)
    void deliverToComposer(dataUrl).catch((error: unknown) => {
      console.warn(`[ssid-screenshot] delivery failed: ${error instanceof Error ? error.message : String(error)}`)
    })
  }, [])

  const overlayCancel = useCallback((): void => { setOverlay(null) }, [])

  return createElement('div', { className: 'ssd3-wrap' }, [
    createElement('button', {
      key: 'btn',
      type: 'button',
      className: 'ssd3-btn',
      disabled: busy || overlay !== null,
      'aria-label': t.button,
      title: t.tooltip,
      onClick: handleClick,
    }, IconCamera()),
    toast !== null
      ? createElement('div', { key: 'toast', className: 'ssd3-toast' },
        createElement('span', { 'data-error': toast.error ? 'true' : 'false' }, toast.text))
      : null,
    overlay !== null
      ? createElement(CaptureOverlay, {
          key: 'overlay',
          dataUrl: overlay.dataUrl,
          width: overlay.width,
          height: overlay.height,
          onDone: overlayDone,
          onCancel: overlayCancel,
        })
      : null,
  ])
}

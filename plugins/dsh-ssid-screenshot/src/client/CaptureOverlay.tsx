/**
 * CaptureOverlay: 纯 DSH（浏览器模式）的全屏截图遮罩。
 *
 * 与壳层浮层（shell/screenshot.html）同一套交互：左键拖拽框选 → 双击/回车
 * 进入标注（红框强调）→ 回车/「完成」交付；右键/Esc 逐级回退（撤当前框 →
 * 撤已画框 → 回框选 → 退出）。
 *
 * 坐标口径：**全部交互状态存「帧物理坐标」**（拖拽时经 wrap 显示尺寸实时
 * 换算），渲染时再换算回显示像素绘制——同一套数据既驱动选区 CSS 也驱动
 * 最终 canvas 合成，避免两套坐标漂移。
 *
 * 通过 createPortal 挂到 document.body（由 ScreenshotButton 渲染）。
 */
import { createElement, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

/** 组件 props（width/height = getDisplayMedia track 的物理分辨率）。 */
export interface CaptureOverlayProps {
  dataUrl: string
  width: number
  height: number
  onDone: (dataUrl: string) => void
  onCancel: () => void
}

interface Point { x: number, y: number }
interface Rect { x: number, y: number, w: number, h: number }

const CSS = [
  '.ssd3ov{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.98);display:flex;align-items:center;justify-content:center;cursor:crosshair;user-select:none}',
  '.ssd3ov-wrap{position:relative;display:flex;align-items:center;justify-content:center}',
  '.ssd3ov-frame{display:block;pointer-events:none}',
  '.ssd3ov-dim{position:absolute;inset:0;background:rgba(0,0,0,.42);pointer-events:none}',
  '.ssd3ov-sel{position:absolute;border:1px solid #4FC3F7;background:rgba(79,195,247,.08);box-shadow:0 0 0 100000px rgba(0,0,0,.42);pointer-events:none;display:none}',
  '.ssd3ov-sel::before,.ssd3ov-sel::after{content:"";position:absolute;width:14px;height:14px;border-color:#4FC3F7;border-style:solid}',
  '.ssd3ov-sel::before{left:-1px;top:-1px;border-width:3px 0 0 3px}',
  '.ssd3ov-sel::after{right:-1px;bottom:-1px;border-width:0 3px 3px 0}',
  '.ssd3ov-size{position:absolute;right:6px;bottom:6px;padding:2px 8px;border-radius:4px;background:rgba(10,14,20,.85);color:#E1F5FE;font:12px/1.6 "Microsoft YaHei UI","PingFang SC","Segoe UI",sans-serif;pointer-events:none;display:none}',
  '.ssd3ov-tip{position:fixed;top:24px;left:50%;transform:translateX(-50%);padding:8px 20px;border-radius:18px;background:rgba(10,14,20,.78);color:#E1F5FE;font:13px/1.6 "Microsoft YaHei UI","PingFang SC","Segoe UI",sans-serif;pointer-events:none;white-space:nowrap;z-index:1}',
  '.ssd3ov-tip em{font-style:normal;color:#4FC3F7}',
  '.ssd3ov-tip em.red{color:#FF5B4D}',
  '.ssd3ov-panel{position:fixed;right:20px;top:20px;display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:10px;background:rgba(10,14,20,.82);z-index:1}',
  '.ssd3ov-btn{padding:5px 12px;border:none;border-radius:14px;background:rgba(255,255,255,.12);color:#E1F5FE;font:13px/1.6 "Microsoft YaHei UI","PingFang SC","Segoe UI",sans-serif;cursor:pointer}',
  '.ssd3ov-btn:hover{background:rgba(255,255,255,.2)}',
  '.ssd3ov-btn-done{padding:5px 16px;background:#2E6BE6;color:#fff}',
  '.ssd3ov-btn-done:hover{background:#3B78F5}',
].join('\n')

const STYLE_ID = '@max-null/dsh-ssid-screenshot/overlay.css'
if (typeof document !== 'undefined' && document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`) === null) {
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-ssid-screenshot'
  tag.dataset.pluginCss = STYLE_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
}

function norm(x1: number, y1: number, x2: number, y2: number): Rect {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('frame decode failed'))
    image.src = src
  })
}

/** 视口内容适配尺寸（≤96vw/≤94vh 等比缩放，contains）。 */
function fitSize(w: number, h: number): { w: number, h: number } {
  const availW = window.innerWidth * 0.96
  const availH = window.innerHeight * 0.94
  const scale = Math.min(availW / w, availH / h, 1)
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) }
}

/** 浏览器截图遮罩（框选 + 标注 + 交付）。 */
export function CaptureOverlay(props: CaptureOverlayProps): ReactNode {
  const { dataUrl, width, height, onDone, onCancel } = props
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const annoCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const annoOrigin = useRef<Point | null>(null)

  const [phase, setPhase] = useState<'select' | 'annotate'>('select')
  /** 帧的显示尺寸（select 用整屏帧、annotate 用裁剪图，各自计算）。 */
  const [showSize, setShowSize] = useState<{ w: number, h: number } | null>(null)
  const [cropUrl, setCropUrl] = useState<string | null>(null)
  const [selPhys, setSelPhys] = useState<Rect | null>(null)
  const [dragStart, setDragStart] = useState<Point | null>(null)
  const [annoRects, setAnnoRects] = useState<Rect[]>([])
  const [annoDraft, setAnnoDraft] = useState<Rect | null>(null)

  // 事件处理器只绑定一次：全部活状态经 ref 镜像读取。
  const live = useRef({ phase, selPhys, dragStart, annoRects, annoDraft, cropUrl, showSize })
  live.current = { phase, selPhys, dragStart, annoRects, annoDraft, cropUrl, showSize }

  /** 显示坐标 → 帧物理坐标。 */
  const toPhys = useCallback((clientX: number, clientY: number): Point | null => {
    const wrap = wrapRef.current
    if (wrap === null) return null
    const r = wrap.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return null
    return {
      x: ((clientX - r.left) / r.width) * width,
      y: ((clientY - r.top) / r.height) * height,
    }
  }, [width, height])

  const cropAndEnterAnnotate = useCallback(async (): Promise<void> => {
    const s = live.current
    if (s.selPhys === null || s.selPhys.w < 2 || s.selPhys.h < 2) return
    const image = await loadImage(dataUrl)
    const canvas = document.createElement('canvas')
    canvas.width = s.selPhys.w
    canvas.height = s.selPhys.h
    canvas.getContext('2d')!.drawImage(image, s.selPhys.x, s.selPhys.y, s.selPhys.w, s.selPhys.h, 0, 0, s.selPhys.w, s.selPhys.h)
    setAnnoRects([])
    setAnnoDraft(null)
    setCropUrl(canvas.toDataURL('image/png'))
    setShowSize(fitSize(canvas.width, canvas.height))
    setPhase('annotate')
  }, [dataUrl])

  const finish = useCallback(async (): Promise<void> => {
    const s = live.current
    if (s.cropUrl === null) return
    const image = await loadImage(s.cropUrl)
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(image, 0, 0)
    ctx.strokeStyle = '#FF3B30'
    ctx.lineWidth = 3
    ctx.fillStyle = 'rgba(255, 59, 48, .12)'
    for (const r of s.annoRects) {
      ctx.strokeRect(r.x, r.y, r.w, r.h)
      ctx.fillRect(r.x, r.y, r.w, r.h)
    }
    onDone(canvas.toDataURL('image/png'))
  }, [onDone])

  const cancelOrBack = useCallback((): void => {
    const s = live.current
    if (s.phase === 'annotate') {
      if (s.annoDraft !== null) setAnnoDraft(null)
      else if (s.annoRects.length > 0) setAnnoRects(s.annoRects.slice(0, -1))
      else {
        setPhase('select')
        setCropUrl(null)
        setAnnoRects([])
        setAnnoDraft(null)
        setSelPhys(null)
        setShowSize(null)
      }
      return
    }
    onCancel()
  }, [onCancel])

  // ---- 全局事件（挂载时绑定一次） ----
  useEffect(() => {
    const onMouseDown = (event: MouseEvent): void => {
      if (event.button === 2) {
        event.preventDefault()
        cancelOrBack()
        return
      }
      if (event.button !== 0) return
      const s = live.current
      if (s.phase === 'annotate') {
        const p = toPhys(event.clientX, event.clientY)
        if (p === null) return
        setAnnoDraft({ x: p.x, y: p.y, w: 0, h: 0 })
        annoOrigin.current = p
        return
      }
      setDragStart({ x: event.clientX, y: event.clientY })
      setSelPhys(null)
    }
    const onMouseMove = (event: MouseEvent): void => {
      const s = live.current
      if (s.phase === 'annotate') {
        if (s.annoDraft !== null) {
          const p = toPhys(event.clientX, event.clientY)
          if (p === null || annoOrigin.current === null) return
          setAnnoDraft(norm(annoOrigin.current.x, annoOrigin.current.y, p.x, p.y))
        }
        return
      }
      if (s.dragStart !== null) {
        const p = toPhys(event.clientX, event.clientY)
        if (p === null) return
        const origin = toPhys(s.dragStart.x, s.dragStart.y)
        if (origin === null) return
        setSelPhys(norm(origin.x, origin.y, p.x, p.y))
      }
    }
    const onMouseUp = (): void => {
      const s = live.current
      if (s.phase === 'annotate') {
        if (s.annoDraft !== null && s.annoDraft.w >= 4 && s.annoDraft.h >= 4) {
          setAnnoRects([...s.annoRects, s.annoDraft])
        }
        setAnnoDraft(null)
        annoOrigin.current = null
        return
      }
      if (s.selPhys !== null && s.selPhys.w < 4 && s.selPhys.h < 4) setSelPhys(null)
      setDragStart(null)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') cancelOrBack()
      else if (event.key === 'Enter') {
        if (live.current.phase === 'annotate') void finish().catch(() => {})
        else void cropAndEnterAnnotate().catch(() => {})
      }
    }
    const onDblClick = (): void => {
      if (live.current.phase === 'annotate') void finish().catch(() => {})
      else void cropAndEnterAnnotate().catch(() => {})
    }
    const onContextMenu = (event: Event): void => event.preventDefault()

    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('dblclick', onDblClick)
    document.addEventListener('contextmenu', onContextMenu)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('dblclick', onDblClick)
      document.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [cancelOrBack, cropAndEnterAnnotate, finish, toPhys])

  // ---- 帧尺寸计算（首次渲染后测量 image 或裁剪图） ----
  useEffect(() => {
    let cancelled = false
    if (phase === 'select') {
      void loadImage(dataUrl).then((image) => {
        if (!cancelled) setShowSize(fitSize(image.naturalWidth, image.naturalHeight))
      }).catch(() => {})
    } else if (phase === 'annotate' && cropUrl !== null) {
      void loadImage(cropUrl).then((image) => {
        if (!cancelled) setShowSize(fitSize(image.naturalWidth, image.naturalHeight))
      }).catch(() => {})
    }
    return () => { cancelled = true }
  }, [phase, cropUrl, dataUrl])

  // ---- annotate 红框 canvas 重绘 ----
  useEffect(() => {
    const canvas = annoCanvasRef.current
    if (canvas === null || phase !== 'annotate' || showSize === null) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const scaleX = showSize.w / width
    const scaleY = showSize.h / height
    const draw = (r: Rect): void => {
      const x = r.x * scaleX
      const y = r.y * scaleY
      const w = r.w * scaleX
      const h = r.h * scaleY
      ctx.strokeStyle = '#FF5B4D'
      ctx.lineWidth = 2.5
      ctx.strokeRect(x, y, w, h)
      ctx.fillStyle = 'rgba(255, 91, 77, .12)'
      ctx.fillRect(x, y, w, h)
    }
    for (const r of annoRects) draw(r)
    if (annoDraft !== null) draw(annoDraft)
  }, [phase, showSize, width, height, annoRects, annoDraft])

  if (showSize === null) {
    return createPortal(createElement('div', { className: 'ssd3ov' }), document.body)
  }

  const s = live.current
  const scaleX = showSize.w / width
  const scaleY = showSize.h / height
  const selDisplay = s.selPhys === null ? null : {
    x: s.selPhys.x * scaleX,
    y: s.selPhys.y * scaleY,
    w: s.selPhys.w * scaleX,
    h: s.selPhys.h * scaleY,
  }

  const tip = phase === 'select'
    ? createElement('div', { className: 'ssd3ov-tip' },
        createElement('em', null, '拖拽 '), '选择截图区域 · ',
        createElement('em', null, '双击 / 回车 '), '确认 · ',
        createElement('em', null, '右键'), ' 取消')
    : createElement('div', { className: 'ssd3ov-tip' },
        '拖拽画', createElement('em', { className: 'red' }, '红框 '), '强调 · ',
        createElement('em', null, '回车 '), '完成 · ',
        createElement('em', null, '右键'), ' 撤销框 / 重选')

  const panel = phase === 'annotate'
    ? createElement('div', { className: 'ssd3ov-panel' }, [
        createElement('button', {
          key: 'undo', type: 'button', className: 'ssd3ov-btn',
          onClick: () => setAnnoRects(annoRects.slice(0, -1)),
        }, '撤销'),
        createElement('button', {
          key: 'redo', type: 'button', className: 'ssd3ov-btn',
          onClick: cancelOrBack,
        }, '重选'),
        createElement('button', {
          key: 'done', type: 'button', className: 'ssd3ov-btn ssd3ov-btn-done',
          onClick: () => { void finish().catch(() => {}) },
        }, '完成'),
      ])
    : null

  return createPortal(
    createElement('div', { className: 'ssd3ov' }, [
      createElement('div', {
        key: 'wrap', className: 'ssd3ov-wrap', ref: wrapRef,
        style: { width: showSize.w, height: showSize.h },
      }, [
        createElement('img', {
          key: 'frame', className: 'ssd3ov-frame',
          src: phase === 'select' ? dataUrl : (cropUrl ?? undefined),
          style: { width: showSize.w, height: showSize.h },
          alt: '',
        }),
        phase === 'select'
          ? createElement('div', { key: 'dim', className: 'ssd3ov-dim' })
          : null,
        phase === 'select' && selDisplay !== null && selDisplay.w > 1 && selDisplay.h > 1
          ? createElement('div', {
              key: 'sel', className: 'ssd3ov-sel',
              style: {
                display: 'block',
                left: selDisplay.x, top: selDisplay.y,
                width: selDisplay.w, height: selDisplay.h,
              },
            })
          : null,
        phase === 'select' && selDisplay !== null && selDisplay.w > 1 && selDisplay.h > 1
          ? createElement('div', {
              key: 'size', className: 'ssd3ov-size',
              style: { display: 'block' },
            }, `${Math.round(s.selPhys!.w)} × ${Math.round(s.selPhys!.h)}`)
          : null,
        phase === 'annotate'
          ? createElement('canvas', {
              key: 'anno', ref: annoCanvasRef,
              width: showSize.w, height: showSize.h,
              className: 'ssd3ov-anno',
              style: { position: 'absolute', inset: 0, pointerEvents: 'none' },
            })
          : null,
      ]),
      tip,
      panel,
    ]),
    document.body,
  )
}

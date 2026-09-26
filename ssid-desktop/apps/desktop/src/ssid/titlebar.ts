/**
 * SSiD 自绘标题栏。
 *
 * 官方壳在 Windows 上已经用 `titleBarStyle: 'hidden'`（无边框 + 页面自绘 caption），
 * 只是把窗口控件交给 `titleBarOverlay` 的原生绘制。本模块把那三个控件改成自绘，
 * 并把思灵壳标题栏的内容整体搬过来——品牌区、运行形态徽章、DSH 版本胶囊、
 * 统一按钮组（会话管理 / 插件中心 / 底栏 / 侧栏 / 悬浮球）。
 *
 * 采用**页面注入**而非独立 BrowserView：官方壳的窗口内容已经是
 * `WebContentsView` 布局，再叠一层会与它的 40-DIP caption 预留打架；
 * 注入 DOM 则天然复用同一层，且因为与页面同上下文，按钮可以直接派发
 * `ssid:titlebar` 事件，不必像原壳那样绕一圈 IPC 回页面。
 */

import { ipcMain, type BrowserWindow } from 'electron'
import { SSID_TITLEBAR_CHANNELS } from './titlebar-channels.ts'

/** 注入节点 id：既是删除抓手，也是「页面重载后要不要补」的判据。 */
const TITLEBAR_DOM_ID = 'ssid-shell-titlebar'

/** 与官方 `WINDOWS_TITLEBAR_HEIGHT` 保持同高，避免替换后内容区跳动。 */
const TITLEBAR_HEIGHT = 40

/**
 * 让位宽度：**按页面实际占位动态测量**。
 *
 * caption 区里属于页面的可交互元素原有两个（「收起侧边栏」x=12..40、「新建会话」x=48..76），
 * 现在它们已被接管隐藏（见 `CAPTURED_ACTIONS`），所以**量到 0 才是常态** —— 这时让位必须真的
 * 归零、品牌区贴左（它自带 10px 内边距）。原来那个 48 的下限是「页面按钮还在」年代留下的，
 * 留着就会在左上角撑出一条谁也说不清来历的空白。
 *
 * 接管一旦失效（DSH 改了结构、原件仍在页面上），测量值自然把它们算进去、让位自己长回来 ——
 * 这层降级不需要额外分支。
 */
const MIN_LEADING_GUTTER = 0

/** 让位与页面元素之间留出的间隙。 */
const GUTTER_GAP = 8

/** caption 区内会被测量的页面元素：只认可交互的，空的占位容器不算。 */
const CAPTION_INTERACTIVE_SELECTOR = 'button, a, input, select, textarea, [role="button"], [tabindex]'

/**
 * caption 取色所读的两个设计 token，与官方 `preload-windows.ts` 同源：
 * 侧栏填充色作底、主标签色作字。变量缺失时按深浅主题退回近似值。
 */
const CAPTION_FILL_VAR = '--dsw-specific-sidebar-fill'
const CAPTION_SYMBOL_VAR = '--dsw-alias-label-primary'

/** 自绘层持有的两个 CSS 变量名，供主进程在收到页面实测调色板后覆盖。 */
const TITLEBAR_FILL_PROP = '--ssid-titlebar-bg'
const TITLEBAR_SYMBOL_PROP = '--ssid-titlebar-fg'

/**
 * 统一按钮组，与 `dsh-quick-toolbar` 的 `ssid:titlebar` 监听逐一对应：
 * 派发的 `detail` 就是下表的值。顺序沿用原壳 2026-08-19 定下的用户心智模型
 * （底栏在左、侧栏在右）。
 */
const TITLEBAR_ACTIONS: readonly { readonly id: string; readonly label: string; readonly detail: string; readonly icon: string }[] = [
  {
    id: 'session-manager',
    label: '会话管理',
    detail: 'session-manager',
    icon: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M5 6.5h6M5 9.5h4" stroke-linecap="round"/>',
  },
  {
    id: 'plugin-center',
    label: '插件中心',
    detail: 'plugin-center',
    icon: '<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>',
  },
  {
    id: 'bottom',
    label: '底栏',
    detail: 'bottom',
    icon: '<rect x="2" y="2" width="12" height="12" rx="1"/><path d="M2 10h12"/>',
  },
  {
    id: 'sidebar',
    label: '侧栏',
    detail: 'sidebar',
    icon: '<rect x="2" y="2" width="12" height="12" rx="1"/><path d="M10 2v12"/>',
  },
]

/** 悬浮球开关：走同一个事件通道，图标按开启状态点亮。 */
const FLOAT_ACTION = {
  id: 'qt-float',
  label: '悬浮球',
  detail: 'quick-toolbar-toggle',
  icon: '<circle cx="8" cy="8" r="5.6"/><circle class="ssid-float-dot" cx="8" cy="8" r="2.4" stroke="none"/>',
}

/**
 * 从 DSH 手里接管的 caption 区按钮：隐藏原按钮，功能收进本工具栏。
 *
 * 识别同时用三重独立判据（类名语义后缀 / 标准属性 `aria-keyshortcuts` / 几何位置），
 * 任一命中即认。**刻意不碰 `hHd-Xa_` 这类前缀** —— 那是 DSH 构建期生成的哈希，
 * 每次构建都可能变，绑上去的代价是升级后静默失效；语义后缀与快捷键属性则稳得多。
 *
 * 找不到时**不隐藏、也不启用接管按钮**（见 `syncCaptured`）：宁可退回「页面按钮与工具栏
 * 并排」，也不做出「藏了但点不动」的死按钮 —— DSH 改了结构时，功能至少还在。
 */
const CAPTURED_ACTIONS: readonly {
  readonly id: string
  readonly label: string
  readonly suffix: string
  readonly shortcut: string
  readonly icon: string
}[] = [
  {
    // 图标规格与旁边那组对齐：矩形一律 12×12、rx=1，线条撑满 12 个单位。原先写的
    // 12×10 + rx=1.5，以及只有 9 单位的加号，跟原壳那五个摆在一起能明显看出小一圈。
    id: 'sidebar-toggle', label: '侧边栏', suffix: '_toggle', shortcut: 'Control+B',
    icon: '<rect x="2" y="2" width="12" height="12" rx="1"/><path d="M6 2v12"/>',
  },
  {
    id: 'new-session', label: '新建会话', suffix: '_newSession', shortcut: 'Control+N',
    icon: '<path d="M8 2v12M2 8h12"/>',
  },
]

/** 窗口控件图标（24 视框，与原壳一致）；最大化与还原各一枚，按窗口状态切换。 */
const CONTROL_ICONS = {
  minimize: '<path d="M5 12h14"/>',
  maximize: '<rect x="5" y="5" width="14" height="14" rx="1"/>',
  restore: '<rect x="7" y="7" width="10" height="10" rx="1"/><path d="M7 7V5a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-2"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
} as const

/** 思灵品牌标记（22×24 图标），沿用原壳 `titlebar.html` 里的同一份资源。 */
const BRAND_MARK = 'data:image/png;base64,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'

/** 是否已在主进程注册过控件处理器：`ipcMain.handle` 重复注册同名通道会抛错。 */
let controlsInstalled = false

/**
 * 注入配置：壳身份与品牌信息，由主进程提供。
 */
export interface SsidTitlebarOptions {
  /** 标题栏左侧显示的产品名。 */
  readonly productName: string
  /** DSH 版本；显示为 `DSH <版本>` 胶囊，为空则不显示。 */
  readonly dshVersion?: string | undefined
  /** 运行形态徽章文案（如 `DEV`），仅非打包运行时传入；为空则整个徽章不出现。 */
  readonly shellMode?: string | undefined
}

/**
 * 注册窗口控件处理器（幂等）。
 * @param window - 被控窗口取值器；窗口可能被重建，故用惰性取值而非捕获实例。
 */
function installTitlebarControls(window: () => BrowserWindow | undefined): void {
  if (controlsInstalled) return
  controlsInstalled = true
  const target = (): BrowserWindow | undefined => {
    const candidate = window()
    return candidate === undefined || candidate.isDestroyed() ? undefined : candidate
  }
  ipcMain.handle(SSID_TITLEBAR_CHANNELS.minimize, () => { target()?.minimize() })
  ipcMain.handle(SSID_TITLEBAR_CHANNELS.toggleMaximize, () => {
    const win = target()
    if (win === undefined) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.handle(SSID_TITLEBAR_CHANNELS.close, () => { target()?.close() })
}

/**
 * 生成控件回调桥。写在页面主世界，转调 preload 暴露的受限转发口；
 * 转发口缺席时按钮保留外观但不响应，不影响窗口其余部分。
 * @returns 一段可交给 `executeJavaScript` 的 IIFE。
 */
function buildControlBridgeScript(): string {
  const channels = {
    minimize: SSID_TITLEBAR_CHANNELS.minimize,
    maximize: SSID_TITLEBAR_CHANNELS.toggleMaximize,
    close: SSID_TITLEBAR_CHANNELS.close,
  }
  return `if (typeof window.ssidTitlebarControl !== 'function') {
         window.ssidTitlebarControl = (action) => {
           const channel = ${JSON.stringify(channels)}[action]
           if (channel === undefined) return undefined
           return window.__ssidIpcInvoke?.(channel)
         }
       }`
}

/**
 * 生成标题栏注入脚本。
 *
 * 品牌区与按钮组都按原壳标题栏还原；按钮不回调主进程，直接在本页面派发
 * `ssid:titlebar`（`dsh-quick-toolbar` 监听它，见该插件 client 的监听表）。
 * @param options - 壳身份与品牌信息。
 * @returns 一段可交给 `executeJavaScript` 的 IIFE。
 */
function buildTitlebarScript(options: SsidTitlebarOptions): string {
  // 接管来的按钮排在最前：它们对应 caption 区最左侧那两个位置，顺序与用户心智一致。
  const actions = [...CAPTURED_ACTIONS, ...TITLEBAR_ACTIONS, FLOAT_ACTION]
  // 传给页面侧的查找条件；`icon` 只用于主进程这侧生成 SVG，不进页面数据。
  const captures = CAPTURED_ACTIONS.map(({ id, label, suffix, shortcut }) => ({ id, label, suffix, shortcut }))
  return `(() => {
  const ID = ${JSON.stringify(TITLEBAR_DOM_ID)}
  const old = document.getElementById(ID)
  if (old) old.remove()

  // 官方 caption 的取色方式：把 token 铺到探针上再读计算值。canvas 这一步
  // 与官方一致——当前 Chromium 会把 oklch() 等新语法原样返回，过一遍像素才拿得到确定值。
  const dark = document.documentElement.dataset.dsDarkTheme !== undefined
    || document.body.hasAttribute('data-ds-dark-theme')
    || matchMedia('(prefers-color-scheme: dark)').matches
  const fallback = dark ? { bg: '#1b1b1c', fg: '#e6edf6' } : { bg: '#f9fafb', fg: '#0f1115' }
  const readCaptionColors = () => {
    const probe = document.createElement('span')
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;'
      + 'background-color:var(${CAPTION_FILL_VAR});color:var(${CAPTION_SYMBOL_VAR})'
    document.body.appendChild(probe)
    const style = getComputedStyle(probe)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })
    // 变量缺席时计算值是全透明，据此判定并退回近似值。
    const opaque = (value) => {
      if (context === null) return null
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = value
      context.fillRect(0, 0, 1, 1)
      const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data
      return alpha === 0 ? null : 'rgba(' + red + ', ' + green + ', ' + blue + ', ' + (alpha / 255) + ')'
    }
    const bg = opaque(style.backgroundColor)
    const fg = opaque(style.color)
    probe.remove()
    return { bg: bg ?? fallback.bg, fg: fg ?? fallback.fg }
  }
  const colors = readCaptionColors()

  const bar = document.createElement('div')
  bar.id = ID
  // 归属标记：手动注入的节点要能被认出是壳的手笔，别被插件 HMR 当成自己的东西删掉。
  bar.setAttribute('data-plugin', 'ssid-shell-titlebar')
  bar.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'right:0',
    'height:${String(TITLEBAR_HEIGHT)}px', 'z-index:2147483646',
    'display:flex', 'align-items:stretch', 'box-sizing:border-box',
    'font:400 12px/1 "Microsoft YaHei UI","Segoe UI",system-ui,sans-serif',
    '${TITLEBAR_FILL_PROP}:' + colors.bg,
    '${TITLEBAR_SYMBOL_PROP}:' + colors.fg,
    'pointer-events:none', 'user-select:none',
  ].join(';')

  // 让位段：透明且不接收事件，点击因此穿透到页面放在 caption 区的按钮。
  const gutter = document.createElement('div')
  gutter.style.cssText = 'width:${String(MIN_LEADING_GUTTER)}px;flex:none'
  bar.appendChild(gutter)

  // 让位宽度按页面实际占位测量，不写死：侧栏展开时 caption 区只有「收起侧边栏」，
  // 收起时 DSH 会把「新建会话」也挪进来（实测 x=48..76），写死 48 就把它盖住了。
  // 只认可交互元素 —— 同样落在 caption 区的空容器不该占位。
  const measureGutter = () => {
    let right = 0
    for (const el of document.querySelectorAll(${JSON.stringify(CAPTION_INTERACTIVE_SELECTOR)})) {
      if (bar.contains(el)) continue
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      // 只看落在 caption 高度内、且自身不高于 caption 的元素
      if (rect.top >= ${String(TITLEBAR_HEIGHT)} || rect.bottom <= 0) continue
      if (rect.height > ${String(TITLEBAR_HEIGHT)} + 4) continue
      if (rect.right > right) right = rect.right
    }
    // 量到 0 说明 caption 区已经没有页面元素（都被接管了）—— 这时连间隙都不给，
    // 否则又会在左上角留出一条看不出用途的空白。
    if (right === 0) return ${String(MIN_LEADING_GUTTER)}
    return Math.ceil(right) + ${String(GUTTER_GAP)}
  }
  let gutterPending = false
  const syncGutter = () => {
    if (gutterPending) return
    gutterPending = true
    requestAnimationFrame(() => {
      gutterPending = false
      gutter.style.width = measureGutter() + 'px'
    })
  }
  syncGutter()
  // 侧栏收起 / 展开会把按钮挪进挪出 caption 区，晚渲染也要覆盖；DSH 是 React 渲染，
  // 那两个按钮常在 did-finish-load 之后才出现，所以重试要一直挂着。syncCaptured 只改
  // display（属性），不产生 childList 变化，不会自激。
  // 注意：本段整体是模板字符串的字面内容，注释里不能出现反引号或美元大括号。
  new MutationObserver(() => { syncGutter(); syncCaptured() }).observe(document.body, { childList: true, subtree: true })

  const main = document.createElement('div')
  main.style.cssText = [
    'flex:1', 'min-width:0', 'display:flex', 'align-items:center',
    'background:var(${TITLEBAR_FILL_PROP})', 'color:var(${TITLEBAR_SYMBOL_PROP})',
    'pointer-events:auto', '-webkit-app-region:drag',
  ].join(';')
  bar.appendChild(main)

  // ── 品牌区：思灵 + 运行形态徽章 + DSH 版本胶囊 ──────────────────────────
  const brand = document.createElement('div')
  brand.style.cssText = 'display:flex;align-items:center;gap:7px;padding:0 10px;height:100%;flex:none'
  const mark = document.createElement('img')
  mark.src = ${JSON.stringify(BRAND_MARK)}
  mark.alt = ''
  mark.style.cssText = 'width:15px;height:15px;flex:none'
  brand.appendChild(mark)
  const name = document.createElement('span')
  name.textContent = ${JSON.stringify(options.productName)}
  // 行高与徽章统一到 15px（logo 也是 15）：这几个元素由 align-items:center 对齐的是**盒子中心**，
  // 盒子高度不一致时中心对齐照样看着参差不齐（实测 12 / 15 / 15 / 18，上下边缘差 3px）。
  name.style.cssText = 'font-size:12px;line-height:15px;letter-spacing:.14em;white-space:nowrap'
  brand.appendChild(name)
  const mode = ${JSON.stringify(options.shellMode ?? '')}
  if (mode !== '') {
    const badge = document.createElement('span')
    badge.textContent = mode
    // 内联样式：避免为一个徽章再动样式表
    badge.style.cssText = 'margin-left:5px;padding:0 4px;border:1px solid currentColor;'
      + 'border-radius:3px;font-size:9px;line-height:13px;opacity:.65;letter-spacing:.5px'
    brand.appendChild(badge)
  }
  // DSH 版本：优先取页面自己量到的（本地构建会在侧栏标出带 commit 的完整版本），
  // 取不到再用主进程给的。
  const readPageVersion = () => {
    const el = document.querySelector('[class*="buildVersion"]')
    const text = el === null || el.textContent === null ? '' : el.textContent.trim()
    return text
  }
  const dshVersion = readPageVersion() || ${JSON.stringify(options.dshVersion ?? '')}
  if (dshVersion !== '') {
    const version = document.createElement('span')
    version.textContent = 'DSH ' + dshVersion
    // 13px 行高 + 上下各 1px 边框 = 15px，与 logo、DEV 徽章、产品名三者同高。
    // 原来是 16px 行高（合计 18px），比旁边那个徽章高出一截，并排看着就没对齐。
    version.style.cssText = 'font-size:10px;line-height:13px;padding:0 6px;margin-left:2px;'
      + 'opacity:.65;border:1px solid currentColor;border-radius:999px;letter-spacing:.03em;white-space:nowrap'
    brand.appendChild(version)
  }
  main.appendChild(brand)

  const spacer = document.createElement('div')
  spacer.style.cssText = 'flex:1;height:100%;min-width:8px'
  main.appendChild(spacer)

  // ── 统一按钮组：直接派发 ssid:titlebar，由 dsh-quick-toolbar 执行 ────────
  const fire = (detail) => {
    window.dispatchEvent(new CustomEvent('ssid:titlebar', { detail }))
  }
  const actions = document.createElement('div')
  actions.style.cssText = 'display:flex;height:100%;flex:none;pointer-events:auto;-webkit-app-region:no-drag'
  const mkAction = (item) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.ssidAction = item.id
    button.title = item.label
    button.setAttribute('aria-label', item.label)
    button.innerHTML = '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" '
      + 'stroke="currentColor" stroke-width="1.5">' + item.icon + '</svg>'
    button.style.cssText = [
      'width:40px', 'height:100%', 'background:none', 'border:0', 'padding:0',
      'color:inherit', 'cursor:pointer', 'display:flex', 'align-items:center',
      'justify-content:center', 'transition:background .12s', '-webkit-app-region:no-drag',
    ].join(';')
    button.onmouseenter = () => { button.style.background = 'rgba(128,148,168,.14)' }
    button.onmouseleave = () => { button.style.background = 'none' }
    return button
  }
  const actionButtons = {}
  for (const item of ${JSON.stringify(actions)}) {
    const button = mkAction(item)
    actionButtons[item.id] = button
    actions.appendChild(button)
  }

  // ── 接管 DSH 在 caption 区自己画的按钮：隐藏原件，功能收进本工具栏 ──────────
  // 判据必须叠加几何位置：实测右栏的入口按钮（y=37）会跨进这个高度，只按类名后缀或
  // 快捷键匹配就会误伤它。
  const CAPTURES = ${JSON.stringify(captures)}
  const capturedRefs = {}
  // 对照模式：临时隐藏我们这层、把页面原件放回去，用来看 DSH 原样。只能是纯显示态开关 ——
  // titleBarStyle 是构造选项、运行时改不了，所以「切回官方标题栏」在 Electron 里做不到，
  // 能做的只是「把我们画的收起来」。
  let contrast = false
  const inCaptionBand = (el) => {
    const rect = el.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
      && rect.top < ${String(TITLEBAR_HEIGHT)} && rect.bottom > 0
      && rect.height <= ${String(TITLEBAR_HEIGHT)} + 4
  }
  const findCaptionButton = (target) => {
    const bySuffix = []
    const byShortcut = []
    for (const el of document.querySelectorAll('button')) {
      if (bar.contains(el)) continue
      const cls = typeof el.className === 'string' ? el.className : ''
      // 语义后缀是首选判据，且**不做几何过滤**：我们接管的动作恰恰是把它 display:none，
      // 而隐藏后 rect 全是 0 —— 拿几何当过滤条件，被自己藏起来的那个就永远找不回来。
      if (cls.split(/\\s+/).some((part) => part.endsWith(target.suffix))) { bySuffix.push(el); continue }
      // aria-keyshortcuts 只作次选，且必须落在 caption 带内：同一个快捷键在页面别处也有，
      // 实测侧栏里那个宽版「新建会话」（hHd-Xa_brand）同样标了 Control+N，不加几何限制
      // 就会把侧栏里的真按钮藏掉。
      if (el.getAttribute('aria-keyshortcuts') === target.shortcut && inCaptionBand(el)) byShortcut.push(el)
    }
    return bySuffix[0] ?? byShortcut[0] ?? null
  }
  const syncCaptured = () => {
    // 对照模式下不该再把原件藏回去 —— 那正是要看的对象。
    if (contrast) return
    for (const target of CAPTURES) {
      // 先认引用、再谈查找。已接管的节点正被我们隐藏着，它的 getBoundingClientRect 全 0，
      // 再走一遍几何查找就认不出它，于是每次同步都误判成「DSH 改了结构」——自我失效。
      // 只有引用真的不见了（React 重渲染换掉节点）才重新查找。
      let el = capturedRefs[target.id]
      if (el === undefined || el === null || !el.isConnected) el = findCaptionButton(target)
      capturedRefs[target.id] = el
      // 找不到就什么都不动，尤其**不要**据此停用我们的按钮：React 换节点只需一帧，
      // 换节点的中间态里新节点还没布局，几何查找必然落空 —— 按那一帧下判断，按钮会
      // 永久停在不可用上（DOM 随后不再变化，也就没有下一次同步来纠正）。
      if (el === null) continue
      el.style.setProperty('display', 'none', 'important')
    }
  }
  // 点的时候再查一次，绕开上面那次「中间态落空」。
  const activateCaptured = (target) => {
    let el = capturedRefs[target.id]
    if (el === undefined || el === null || !el.isConnected) el = findCaptionButton(target)
    if (el === null) return false
    capturedRefs[target.id] = el
    el.style.setProperty('display', 'none', 'important')
    el.click()
    return true
  }
  // 原件当前不渲染时（那个入口只在特定布局下出现）退回它自己声明的快捷键。
  // aria-keyshortcuts 是 DSH 给的，直接派发 keydown 即可，不必复刻它的内部调用路径。
  const parseShortcut = (value) => {
    const parts = String(value).split('+')
    const key = parts[parts.length - 1]
    if (key === undefined || key === '') return null
    return {
      key: key.toLowerCase(),
      code: 'Key' + key.toUpperCase(),
      ctrlKey: parts.includes('Control'),
      shiftKey: parts.includes('Shift'),
      altKey: parts.includes('Alt'),
      metaKey: parts.includes('Meta'),
    }
  }
  syncCaptured()
  for (const target of CAPTURES) {
    const button = actionButtons[target.id]
    if (button === undefined) continue
    button.dataset.ssidCaptured = 'true'
    button.onclick = () => {
      if (activateCaptured(target)) return
      const shortcut = parseShortcut(target.shortcut)
      if (shortcut !== null) document.dispatchEvent(new KeyboardEvent('keydown', { ...shortcut, bubbles: true }))
    }
  }

  // ── 对照模式：把我们画的收起来，露出 DSH 原样 ─────────────────────────────
  // 纯显示态开关。之所以只能做到这一步：titleBarStyle 是构造选项，运行时改不了，
  // 所以「切回官方标题栏」在 Electron 里做不到 —— 能收的只有我们自己注入的这层。
  // 收起来期间没有窗口按钮与拖拽区，用托盘切回来即可。
  // 恢复时不能只清空 inline display：那会退回 CSS 默认的 block，而容器本该是 flex
  // （main 的 flex:1 依赖它），一来一回标题栏就散架了。记下原值再显式还原。
  const barDisplay = bar.style.display === '' ? 'flex' : bar.style.display
  const applyContrast = () => {
    bar.style.display = contrast ? 'none' : barDisplay
    for (const target of CAPTURES) {
      const el = capturedRefs[target.id]
      if (el === undefined || el === null || !el.isConnected) continue
      if (contrast) el.style.removeProperty('display')
      else el.style.setProperty('display', 'none', 'important')
    }
  }
  // 主进程经 executeJavaScript 调用；无参数即取反，返回切换后的状态以便日志核对。
  window.__ssidContrast = (next) => {
    contrast = next === undefined ? !contrast : next === true
    applyContrast()
    return contrast
  }

  actionButtons['session-manager'].onclick = () => { fire('session-manager') }
  actionButtons['plugin-center'].onclick = () => { fire('plugin-center') }
  actionButtons['bottom'].onclick = () => { fire('bottom') }
  actionButtons['sidebar'].onclick = () => { fire('sidebar') }

  // 悬浮球：乐观切换图标，真实状态由 quick-toolbar 的 host 状态接口回读（动态端口下
  // 页面 localStorage 不可作持久态，该接口是唯一真源）。
  const floatButton = actionButtons['qt-float']
  const setFloat = (on) => {
    floatButton.classList.toggle('ssid-float-on', on === true)
    floatButton.title = on === true ? '悬浮球（开）' : '悬浮球（关）'
    floatButton.style.color = on === true ? '#4FC3F7' : ''
  }
  setFloat(false)
  floatButton.onclick = () => {
    const next = !floatButton.classList.contains('ssid-float-on')
    setFloat(next)
    fire('quick-toolbar-toggle')
  }
  // 悬浮球状态回读。这个请求要等 Host 就绪才有答案：壳的协议 handler 在 Host 未起来时直接
  // 返回 503（main.ts 的 protocol.handle），而这句注入常赶在 Host ready 之前跑 —— 于是控制台
  // 会刷出 503。退避重试若干次；始终读不到就停在默认态，功能不受影响（点一下照样能切）。
  const readFloatState = (attempt) => {
    fetch('/quick-toolbar/api/state', { credentials: 'same-origin' })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('host not ready')))
      .then((data) => { if (data.state !== undefined) setFloat(data.state.shellVisible === true) })
      .catch(() => {
        if (attempt < 5) setTimeout(() => { readFloatState(attempt + 1) }, 400 * (attempt + 1))
      })
  }
  readFloatState(0)
  main.appendChild(actions)

  // ── 窗口控件：最小化 / 最大化↔还原 / 关闭 ──────────────────────────────
  const controls = document.createElement('div')
  controls.style.cssText = 'display:flex;height:100%;flex:none;pointer-events:auto;-webkit-app-region:no-drag'
  const mkControl = (id, iconPath, options_) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.ssidControl = id
    button.setAttribute('aria-label', id)
    button.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" '
      + 'stroke="currentColor" stroke-width="2" stroke-linecap="round">' + iconPath + '</svg>'
    button.style.cssText = [
      'width:52px', 'height:100%', 'background:none', 'border:0', 'padding:0',
      'color:inherit', 'cursor:pointer', 'display:flex', 'align-items:center',
      'justify-content:center', 'transition:background .12s', '-webkit-app-region:no-drag',
    ].join(';')
    button.onmouseenter = () => {
      button.style.background = options_.hoverBackground ?? 'rgba(128,148,168,.14)'
      if (options_.hoverColor !== undefined) button.style.color = options_.hoverColor
    }
    button.onmouseleave = () => {
      button.style.background = 'none'
      button.style.color = ''
    }
    return button
  }
  const controlSvg = ${JSON.stringify(CONTROL_ICONS)}
  const minimize = mkControl('minimize', controlSvg.minimize, {})
  const maximize = mkControl('maximize', controlSvg.maximize, {})
  const close = mkControl('close', controlSvg.close, { hoverBackground: '#e81123', hoverColor: '#fff' })
  minimize.onclick = () => window.ssidTitlebarControl('minimize')
  maximize.onclick = () => window.ssidTitlebarControl('maximize')
  close.onclick = () => window.ssidTitlebarControl('close')
  controls.append(minimize, maximize, close)
  main.appendChild(controls)

  // 最大化状态：自绘层与窗口同处一个渲染进程，直接按尺寸判定即可，
  // 不必像原壳那样由主进程推事件（还原图标是这里唯一的用处）。
  const syncMaximized = () => {
    const maximized = window.outerWidth >= screen.availWidth - 12
      && window.outerHeight >= screen.availHeight - 12
    maximize.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" '
      + 'stroke="currentColor" stroke-width="2" stroke-linecap="round">'
      + (maximized ? controlSvg.restore : controlSvg.maximize) + '</svg>'
    maximize.setAttribute('aria-label', maximized ? 'restore' : 'maximize')
  }
  syncMaximized()
  window.addEventListener('resize', syncMaximized)

  // ── 修掉侧栏品牌区底部那 1px 裁切 ─────────────────────────────────────────
  // DSH 在 Windows 标题栏模式下把品牌区下移 1px（ui-sidebar 的
  // [data-windows-titlebar] .brandIdentity），而它的父容器 .brand 是 overflow:hidden 配
  // min-width:0 —— 那是用来裁切过长品牌名的有意设计 —— 下移后底部正好被切掉 1px。
  // 两条规则各自都没错，凑在一起才出问题。这里只把位移压回去，裁切保护原样保留。
  // 选择器用语义后缀而不是 hHd-Xa_ 前缀：后者是 DSH 构建期哈希，会随版本变。
  if (document.getElementById('ssid-brand-clip-fix') === null) {
    const fix = document.createElement('style')
    fix.id = 'ssid-brand-clip-fix'
    fix.textContent = '[data-windows-titlebar] [class*="brandIdentity"]{transform:none !important}'
    document.head.appendChild(fix)
  }
  document.body.appendChild(bar)
})()`
}

/**
 * 用页面回传的实测调色板刷新已注入的标题栏。
 *
 * 页面通过 `dsh-desktop:windows-appearance` 报告它自己量到的 caption 配色
 * （用户切主题或换皮肤时会变），自绘层据此跟随，不必猜主题。
 * @param window - 主窗口。
 * @param color - 页面测得的 caption 填充色，已由调用方校验为 CSS 颜色值。
 * @param symbolColor - 页面测得的 caption 符号色，同样已校验。
 */
export function applySsidTitlebarTheme(window: BrowserWindow, color: string, symbolColor: string): void {
  if (window.isDestroyed()) return
  window.webContents.executeJavaScript(
    `(() => {
       const bar = document.getElementById(${JSON.stringify(TITLEBAR_DOM_ID)})
       if (bar === null) return
       bar.style.setProperty(${JSON.stringify(TITLEBAR_FILL_PROP)}, ${JSON.stringify(color)})
       bar.style.setProperty(${JSON.stringify(TITLEBAR_SYMBOL_PROP)}, ${JSON.stringify(symbolColor)})
     })()`, true).catch(() => undefined)
}

/**
 * 切换页面的对照模式：收起自绘标题栏，并把被接管的页面原件放回去，用来对照 DSH 原样。
 *
 * **这不是「切回官方标题栏」** —— `titleBarStyle` 是构造选项，运行时改不了，所以官方那三个
 * 原生窗口按钮无法这样拿回来。对照期间没有窗口按钮与拖拽区，用托盘里同一项切回即可。
 * @param window - 主窗口。
 * @param next - 目标状态；省略则取反，返回切换后的状态。
 */
export function toggleSsidContrast(window: BrowserWindow, next?: boolean): void {
  if (window.isDestroyed()) return
  const argument = next === undefined ? '' : String(next)
  window.webContents.executeJavaScript(
    `typeof window.__ssidContrast === 'function' ? window.__ssidContrast(${argument}) : null`, true)
    .then((result: unknown) => { console.info('desktop contrast mode:', result) })
    .catch(() => undefined)
}

/**
 * 给窗口装上 SSiD 自绘标题栏。
 *
 * 页面每次加载完成后重建注入节点——与遮罩同因：页面重载会冲掉手动注入的 DOM。
 * @param window - 主窗口。
 * @param options - 壳身份与品牌信息。
 */
export function installSsidTitlebar(window: BrowserWindow, options: SsidTitlebarOptions): void {
  installTitlebarControls(() => (window.isDestroyed() ? undefined : window))
  const injectShellFlag = (): void => {
    if (window.isDestroyed()) return
    // 壳标志要尽早：dsh-quick-toolbar 按它决定是否加载壳样式、隐藏被标题栏接管的原按钮，
    // 并在受控模式下让悬浮球状态跟随壳。晚于插件 apply 会让这几项不生效。
    window.webContents.executeJavaScript('window.__SSID_SHELL__ = true', true).catch(() => undefined)
  }
  const inject = (): void => {
    if (window.isDestroyed()) return
    window.webContents.executeJavaScript(buildControlBridgeScript(), true).catch(() => undefined)
    window.webContents.executeJavaScript(buildTitlebarScript(options), true).catch(() => undefined)
  }
  window.webContents.on('dom-ready', injectShellFlag)
  window.webContents.on('did-finish-load', () => { injectShellFlag(); inject() })
  if (!window.webContents.isLoading()) inject()
}

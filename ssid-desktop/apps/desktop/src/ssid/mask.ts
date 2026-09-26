/**
 * SSiD 屏幕遮罩。
 *
 * 与思灵壳 `shell/main.mjs:1640-1830` 同语义：**只盖本窗口，不铺屏**（铺满屏幕是「锁电脑」，
 * 那是另一件事）。显示有托盘项与全局快捷键两个入口，解除除了这两处还有遮罩上那个
 * **长按 2 秒**的按钮（单击无效，防随手点掉）；设了口令时长按满 2 秒才现身输入框，
 * 且托盘/快捷键**只负责把输入框调出来**，不直接解除——否则口令形同虚设。
 *
 * 实现方式是**注入 DSH 页面内部**，不是独立窗口：能真正模糊到下层内容的只有同一页面内的
 * `backdrop-filter`，跨窗口一律无效（思灵壳实测排除了 Windows acrylic、透明窗口、独立窗口
 * 三条路）。代价是遮罩依附页面——页面重载会把它冲掉，所以要按状态补回；解除信号也走
 * 页面 → `console-message` 回传。
 *
 * 配置读 `~/.ssid/notify.json` 的 `mask` 段，与现装思灵共用一份，用户换壳后不必重设。
 */

import { readFileSync } from 'node:fs'
import { BrowserWindow } from 'electron'
import { ssidNotifyConfigPath } from './notify.ts'

/** 注入节点 id：既是删除抓手，也是「页面重载后要不要补」的判据。 */
const MASK_DOM_ID = 'ssid-shell-mask'

/** 页面侧解除信号，经 `console-message` 回传。 */
const RELEASE_SIGNAL = '__SSID_MASK_RELEASE__'

/**
 * 遮罩文字的光晕。用「白字 + 一圈黑晕」而不是深色底板：底板会挡住正中间那块内容，
 * 而「看得见底下的动静」正是遮罩存在的意义。多层是为了做出柔和过渡——单层硬阴影在
 * 大字号下会有明显锯齿边。
 */
const TEXT_HALO = 'text-shadow:0 0 3px rgba(0,0,0,.92),0 0 6px rgba(0,0,0,.82),'
  + '0 0 12px rgba(0,0,0,.68),0 0 22px rgba(0,0,0,.5),0 1px 2px rgba(0,0,0,.9)'

/** 遮罩配置；字段与 `~/.ssid/notify.json` 的 `mask` 段一一对应。 */
export interface SsidMaskConfig {
  readonly text: string
  readonly alpha: number
  readonly blur: number
  readonly passcode: string
  /** 全局快捷键；空串表示不注册。 */
  readonly hotkey: string
}

/** 缺省配置：与思灵壳的出厂值一致。 */
const DEFAULT_MASK: SsidMaskConfig = {
  text: '正在专注，稍后回复',
  alpha: 0.86,
  blur: 18,
  passcode: '',
  hotkey: 'Control+Alt+M',
}

/**
 * 读取遮罩配置。
 * @param path - 配置文件路径，默认 `~/.ssid/notify.json`。
 * @returns 遮罩配置；任何读取或解析失败都退化为缺省值。
 */
export function readSsidMaskConfig(path: string = ssidNotifyConfigPath()): SsidMaskConfig {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { mask?: Record<string, unknown> }
    const mask = parsed.mask ?? {}
    const text = typeof mask['text'] === 'string' && mask['text'].trim() !== '' ? mask['text'] : DEFAULT_MASK.text
    // 浓度两个值都夹到合法域：越界会把遮罩变全透明或全黑，越界 blur 直接拖垮合成。
    const alpha = typeof mask['alpha'] === 'number' && Number.isFinite(mask['alpha'])
      ? Math.min(1, Math.max(0, mask['alpha']))
      : DEFAULT_MASK.alpha
    const blur = typeof mask['blur'] === 'number' && Number.isFinite(mask['blur'])
      ? Math.min(64, Math.max(0, Math.round(mask['blur'])))
      : DEFAULT_MASK.blur
    // 口令原样存：它不是安全边界，不做任何「看起来更安全」的处理。
    const passcode = typeof mask['passcode'] === 'string' ? mask['passcode'] : DEFAULT_MASK.passcode
    const hotkey = typeof mask['hotkey'] === 'string' ? mask['hotkey'].trim() : DEFAULT_MASK.hotkey
    return { text, alpha, blur, passcode, hotkey }
  } catch {
    return DEFAULT_MASK
  }
}

/**
 * 生成遮罩注入脚本。文案与浓度按**当时**的配置生成——改了 notify.json，下一次开启即生效。
 * @param config - 遮罩配置。
 * @returns 可交给 `executeJavaScript` 的 IIFE。
 */
function buildMaskScript(config: SsidMaskConfig): string {
  return `(() => {
  const ID = ${JSON.stringify(MASK_DOM_ID)}
  const old = document.getElementById(ID)
  if (old) old.remove()
  const d = document.createElement('div')
  d.id = ID
  // 归属标记：手动注入的节点要能被认出是壳的手笔，别被插件 HMR 顺手删掉。
  d.setAttribute('data-plugin', 'ssid-shell-mask')
  d.style.cssText = ['position:fixed', 'inset:0', 'z-index:2147483647',
    'background:rgba(9,12,20,${String(config.alpha)})',
    'backdrop-filter:blur(${String(config.blur)}px)', '-webkit-backdrop-filter:blur(${String(config.blur)}px)',
    'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
    'gap:22px', 'color:#eaf1f8', 'user-select:none', 'cursor:default',
    'font-family:"Microsoft YaHei UI","Segoe UI",system-ui,sans-serif'].join(';')
  const mk = (tag, css, txt) => { const el = document.createElement(tag); el.style.cssText = css; if (txt) el.textContent = txt; return el }
  const PASSCODE = ${JSON.stringify(config.passcode)}
  const LOCKED = PASSCODE !== ''
  const title = mk('div', 'max-width:82%;padding:0 24px;font-size:34px;font-weight:600;line-height:1.5;letter-spacing:2px;text-align:center;word-break:break-word;color:#fff;${TEXT_HALO}', ${JSON.stringify(config.text)})
  // 提示语按有没有口令分叉：不说清楚的话，用户会以为长按就能解，然后卡在那里。
  const hint = mk('div', 'font-size:13px;letter-spacing:.5px;color:rgba(255,255,255,.92);${TEXT_HALO}', LOCKED ? '按住下方按钮 2 秒，再输入口令解除' : '按住下方按钮 2 秒解除')
  const btn = mk('button', 'position:relative;margin-top:6px;padding:12px 32px;overflow:hidden;font:inherit;font-size:15px;color:#fff;background:rgba(8,11,18,.55);border:1px solid rgba(255,255,255,.28);border-radius:999px;box-shadow:0 2px 14px rgba(0,0,0,.4);cursor:pointer;user-select:none;${TEXT_HALO}')
  btn.type = 'button'
  const fill = mk('div', 'position:absolute;inset:0;width:0;background:rgba(90,160,255,.5);pointer-events:none')
  const label = mk('span', 'position:relative', '按住解除')
  btn.appendChild(fill); btn.appendChild(label)

  // 口令输入区：初始隐藏，有口令时长按满 2 秒才现身。
  const panel = mk('div', 'display:none;flex-direction:column;align-items:center;gap:8px;margin-top:4px')
  const input = mk('input', 'width:220px;height:38px;padding:0 14px;border-radius:10px;border:1px solid rgba(255,255,255,.35);background:rgba(8,11,18,.62);color:#fff;font:inherit;font-size:16px;letter-spacing:2px;text-align:center;outline:none;${TEXT_HALO}')
  input.type = 'password'
  input.autocomplete = 'off'
  input.placeholder = '口令'
  const err = mk('div', 'display:none;font-size:12px;color:#ffb4b4;${TEXT_HALO}', '口令不对')
  const go = mk('button', 'padding:8px 22px;font:inherit;font-size:14px;color:#fff;background:rgba(8,11,18,.55);border:1px solid rgba(255,255,255,.28);border-radius:999px;cursor:pointer;${TEXT_HALO}', '解除')
  go.type = 'button'
  panel.appendChild(input); panel.appendChild(err); panel.appendChild(go)

  const release = () => { console.log(${JSON.stringify(RELEASE_SIGNAL)}) }
  const submit = () => {
    if (input.value === PASSCODE) { release(); return }
    err.style.display = 'block'
    input.value = ''
    input.focus()
  }
  const openPanel = () => {
    panel.style.display = 'flex'
    err.style.display = 'none'
    input.focus()
  }
  // 供壳调用：托盘项与全局快捷键在有口令时只把输入框调出来，不直接解除。
  window.__ssidMaskPrompt = openPanel

  // 长按 2 秒：单击无效。进度条按按住时长填充，松手即回零。
  const HOLD_MS = 2000
  let holding = false
  let started = 0
  let raf = 0
  const step = () => {
    if (!holding) return
    const ratio = Math.min(1, (Date.now() - started) / HOLD_MS)
    fill.style.width = (ratio * 100) + '%'
    if (ratio >= 1) {
      holding = false
      fill.style.width = '0'
      if (LOCKED) openPanel()
      else release()
      return
    }
    raf = requestAnimationFrame(step)
  }
  const begin = (event) => {
    event.preventDefault()
    if (holding) return
    holding = true
    started = Date.now()
    raf = requestAnimationFrame(step)
  }
  const end = () => {
    holding = false
    cancelAnimationFrame(raf)
    fill.style.width = '0'
  }
  btn.addEventListener('pointerdown', begin)
  btn.addEventListener('pointerup', end)
  btn.addEventListener('pointerleave', end)
  btn.addEventListener('pointercancel', end)
  go.addEventListener('click', submit)
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') submit() })
  // 输入区展开后自发聚焦：Electron 窗口可能未聚焦，点一下才拿到键盘。
  input.addEventListener('blur', () => { if (panel.style.display !== 'none') setTimeout(() => input.focus(), 0) })

  d.appendChild(title); d.appendChild(hint); d.appendChild(btn); d.appendChild(panel)
  document.body.appendChild(d)
  // 遮罩期间按住 Esc 不关（防止误触），但要挡住键盘焦点跑到下面去。
  d.addEventListener('keydown', (event) => { event.stopPropagation() })
  return true
})()`
}

/** 遮罩状态与注入的唯一持有者。状态只有一份，托盘、快捷键、页面按钮三处入口共用。 */
export class SsidMask {
  private maskActive = false

  /**
   * @param window - 主窗口取值器；窗口可能被重建，故用惰性取值而非捕获实例。
   * @param onActiveChange - 状态变化通知。保活（`keep-awake`）靠它同步「遮罩开着就别息屏」，
   *   而不是在托盘/快捷键/页面释放信号三处各写一遍——漏一个就会永远不息屏。
   */
  constructor(
    private readonly window: () => BrowserWindow | undefined,
    private readonly onActiveChange?: (active: boolean) => void,
  ) {}

  /** 遮罩当前是否生效（托盘文案与页面重载补回都读它）。 */
  get active(): boolean {
    return this.maskActive
  }

  /** 记录新状态并通知订阅者；状态没变则只返回。 */
  private setActive(next: boolean): void {
    if (this.maskActive === next) return
    this.maskActive = next
    this.onActiveChange?.(next)
  }

  /**
   * 切换遮罩。有口令时只把输入框调出来，不直接解除。
   * @returns 切换后的状态。
   */
  toggle(): boolean {
    if (this.maskActive) this.hide()
    else this.show()
    return this.maskActive
  }

  /** 显示遮罩。已在显示状态时改为把口令输入框调出来。 */
  show(): void {
    const win = this.target()
    if (win === undefined) return
    if (this.maskActive) {
      void win.webContents.executeJavaScript('window.__ssidMaskPrompt?.()', true).catch(() => undefined)
      return
    }
    this.setActive(true)
    void win.webContents.executeJavaScript(buildMaskScript(readSsidMaskConfig()), true).catch(() => undefined)
  }

  /** 解除遮罩。 */
  hide(): void {
    // 先记状态再动 DOM：即使窗口已销毁（取不到 win），保活也必须释放。
    this.setActive(false)
    const win = this.target()
    if (win === undefined) return
    void win.webContents
      .executeJavaScript(`document.getElementById(${JSON.stringify(MASK_DOM_ID)})?.remove()`, true)
      .catch(() => undefined)
  }

  /**
   * 页面每次加载完成后按状态补回遮罩——注入节点活不过页面重载。
   * @param window - 刚完成加载的窗口。
   */
  restore(window: BrowserWindow): boolean {
    if (!this.maskActive || window.isDestroyed()) return false
    void window.webContents.executeJavaScript(buildMaskScript(readSsidMaskConfig()), true).catch(() => undefined)
    return true
  }

  /**
   * 判定一条 console 消息是否为遮罩的解除信号。
   * @param message - `console-message` 的正文。
   * @returns 是否需要据此隐藏遮罩。
   */
  static isReleaseSignal(message: string): boolean {
    return message.includes(RELEASE_SIGNAL)
  }

  private target(): BrowserWindow | undefined {
    const candidate = this.window()
    return candidate === undefined || candidate.isDestroyed() ? undefined : candidate
  }
}

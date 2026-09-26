import type { MenuItemConstructorOptions } from 'electron'
import { afterEach, expect, it, vi } from 'vitest'
import { resolveDesktopLocale } from '../src/locale.ts'
import { DesktopTray } from '../src/tray.ts'

const native = await vi.hoisted(async () => {
  const { EventEmitter } = await import('node:events')
  const trays: FakeTray[] = []
  class FakeTray extends EventEmitter {
    readonly setToolTip = vi.fn()
    readonly setContextMenu = vi.fn()
    readonly destroy = vi.fn()
    constructor(readonly image: unknown) { super(); trays.push(this) }
  }
  const menus: MenuItemConstructorOptions[][] = []
  return {
    trays, FakeTray, menus,
    createFromPath: vi.fn((path: string) => ({ path })),
    buildFromTemplate: vi.fn((template: MenuItemConstructorOptions[]) => { menus.push(template); return { template } }),
  }
})
vi.mock('electron', () => ({
  Tray: native.FakeTray,
  nativeImage: { createFromPath: native.createFromPath },
  Menu: { buildFromTemplate: native.buildFromTemplate },
}))

afterEach(() => { native.trays.length = 0; native.menus.length = 0; vi.clearAllMocks() })

function setup(locale = 'en') {
  let current = resolveDesktopLocale(locale)
  const open = vi.fn()
  const quit = vi.fn()
  const tray = new DesktopTray({ iconPath: 'C:/app/resources/tray.ico', locale: () => current, open, quit })
  return { tray, open, quit, native: native.trays[0]!, setLocale: (next: string) => { current = resolveDesktopLocale(next) } }
}

function labels(menu: MenuItemConstructorOptions[]): (string | undefined)[] {
  return menu.map(item => item.type === 'separator' ? 'separator' : item.label)
}

it('shows the application icon with its name as the tooltip and an Open / Quit menu', () => {
  const f = setup()
  expect(native.createFromPath).toHaveBeenCalledWith('C:/app/resources/tray.ico')
  expect(f.native.image).toEqual({ path: 'C:/app/resources/tray.ico' })
  expect(f.native.setToolTip).toHaveBeenCalledWith('思灵')
  expect(labels(native.menus[0]!)).toEqual(['Open 思灵', 'separator', 'Quit 思灵'])
  expect(f.native.setContextMenu).toHaveBeenCalledWith({ template: native.menus[0] })
})

it('opens the window on a single click and routes menu entries to the open and quit actions', () => {
  const f = setup()
  f.native.emit('click')
  expect(f.open).toHaveBeenCalledOnce()
  const menu = native.menus[0]!
  ;(menu[0] as { click: () => void }).click()
  ;(menu[2] as { click: () => void }).click()
  expect(f.open).toHaveBeenCalledTimes(2)
  expect(f.quit).toHaveBeenCalledOnce()
})

it('relabels the menu in the current locale and ignores relabel after disposal', () => {
  const f = setup()
  f.setLocale('zh')
  f.tray.relabel()
  expect(labels(native.menus[1]!)).toEqual(['打开 思灵', 'separator', '退出 思灵'])
  f.tray.dispose()
  f.tray.dispose()
  expect(f.native.destroy).toHaveBeenCalledOnce()
  f.tray.relabel()
  expect(native.menus).toHaveLength(2)
})

function setupWithExtras(locale = 'en') {
  let current = resolveDesktopLocale(locale)
  const open = vi.fn()
  const quit = vi.fn()
  const extras = {
    reload: vi.fn(), restartBackend: vi.fn(), mask: vi.fn(), contrast: vi.fn(),
    restartApplication: vi.fn(), disablePlugins: vi.fn(),
  }
  const tray = new DesktopTray({ iconPath: 'C:/app/resources/tray.ico', locale: () => current, open, quit, extras })
  return { tray, open, quit, extras, native: native.trays[0]!, setLocale: (next: string) => { current = resolveDesktopLocale(next) } }
}

it('appends the SSiD maintenance entries between Open and Quit when extras are supplied', () => {
  setupWithExtras()
  const en = resolveDesktopLocale('en').messages
  expect(labels(native.menus[0]!)).toEqual([
    'Open 思灵',
    en.reloadPageMenu, en.restartBackendMenu, en.trayMaskMenu, en.trayContrastMenu,
    'separator',
    en.restartAppHostMenu, en.restartInSafeMode,
    'separator',
    'Quit 思灵',
  ])
})

it('routes every SSiD maintenance entry to its own action', () => {
  const f = setupWithExtras()
  const menu = native.menus[0]!
  const click = (index: number): void => { (menu[index] as { click: () => void }).click() }
  click(1); click(2); click(3); click(4); click(6); click(7)
  expect(f.extras.reload).toHaveBeenCalledOnce()
  expect(f.extras.restartBackend).toHaveBeenCalledOnce()
  expect(f.extras.mask).toHaveBeenCalledOnce()
  expect(f.extras.contrast).toHaveBeenCalledOnce()
  expect(f.extras.restartApplication).toHaveBeenCalledOnce()
  expect(f.extras.disablePlugins).toHaveBeenCalledOnce()
  // 维护项不得串到官方的两个入口上。
  expect(f.open).not.toHaveBeenCalled()
  expect(f.quit).not.toHaveBeenCalled()
})

it('labels the tray safe-mode entry with the non-destructive wording, not the recovery one', () => {
  const f = setupWithExtras()
  // 回归防线：托盘这一项执行的是非破坏的「以纯净模式重启」（只少加载第三方层、数据一律不动），
  // 而 `disableThirdPartyPlugins` 那条文案描述的是崩溃恢复对话框的写操作（备份并清空 profile
  // patch）。两者语义相反，托盘不准再引用后者 —— 那会告诉用户「数据不动」却实际清空 patch。
  expect(labels(native.menus[0]!)).toContain('Restart in safe mode (no third-party plugins; data untouched)')
  expect(labels(native.menus[0]!)).not.toContain('Disable third-party plugins, back up profile patch, and restart')
  f.setLocale('zh')
  f.tray.relabel()
  expect(labels(native.menus[1]!)).toContain('以纯净模式重启（不加载第三方插件，数据不动）')
  expect(labels(native.menus[1]!)).not.toContain('禁用第三方插件、备份 profile patch 并重启')
})

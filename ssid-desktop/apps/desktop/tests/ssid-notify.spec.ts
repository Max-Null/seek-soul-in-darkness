/**
 * 通知音的平台分派与失败语义。
 *
 * macOS 上没有 powershell，`spawn` 失败以**异步** error 事件冒出来，同步 try/catch 捕不到——
 * 那条路径曾把每次通知变成主进程 uncaughtException，所以这里既锁平台分派，也锁吞噬行为。
 */
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const deps = vi.hoisted(() => ({
  spawn: vi.fn<(command: string, args: readonly string[], options: unknown) => EventEmitter>(),
  show: vi.fn(),
  isSupported: vi.fn(() => true),
}))

vi.mock('node:child_process', () => ({ spawn: deps.spawn }))
vi.mock('electron', () => ({
  // notify.ts 只在类型位置引用 BrowserWindow，运行时不需要它。
  BrowserWindow: undefined,
  Notification: class {
    static isSupported = deps.isSupported
    show = deps.show
  },
}))

const { deliverSsidNotify, notificationSoundCommand, playNotificationSound } =
  await import('../src/ssid/notify.ts')

/** 用例创建的临时目录，逐个删掉。 */
const created: string[] = []

beforeEach(() => {
  deps.spawn.mockReset()
  deps.show.mockReset()
  deps.isSupported.mockReset()
  deps.isSupported.mockReturnValue(true)
})

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('notificationSoundCommand', () => {
  it('uses the PowerShell system sound on Windows', () => {
    const sound = notificationSoundCommand('win32')
    expect(sound?.command).toBe('powershell')
    expect(sound?.args.join(' ')).toContain('[System.Media.SystemSounds]::Asterisk.Play()')
  })

  it('uses afplay and a bundled system sound on macOS', () => {
    expect(notificationSoundCommand('darwin')).toEqual({
      command: '/usr/bin/afplay',
      args: ['/System/Library/Sounds/Glass.aiff'],
    })
  })

  it('has no command on platforms without an implementation', () => {
    for (const platform of ['linux', 'freebsd', 'openbsd', 'sunos', 'aix', 'android'] as const) {
      expect(notificationSoundCommand(platform)).toBeNull()
    }
  })
})

describe('playNotificationSound', () => {
  it('spawns the platform command with output ignored', () => {
    deps.spawn.mockReturnValue(new EventEmitter())
    playNotificationSound('win32')
    expect(deps.spawn).toHaveBeenCalledExactlyOnceWith(
      'powershell',
      expect.arrayContaining(['-NoProfile', '-WindowStyle', 'Hidden']),
      { windowsHide: true, stdio: 'ignore' },
    )
  })

  it('does not spawn anything on a platform without a sound command', () => {
    playNotificationSound('linux')
    expect(deps.spawn).not.toHaveBeenCalled()
  })

  it('swallows the asynchronous spawn failure that used to crash the main process', () => {
    const child = new EventEmitter()
    deps.spawn.mockReturnValue(child)
    playNotificationSound('darwin')
    expect(() => child.emit('error', new Error('spawn powershell ENOENT'))).not.toThrow()
  })

  it('proves the asynchronous-failure probe above can fail', () => {
    // 无监听者的 EventEmitter 'error' 会抛出：这条对照锁住上一条用例不是空转。
    expect(() => new EventEmitter().emit('error', new Error('spawn powershell ENOENT'))).toThrow()
  })
})

describe('deliverSsidNotify', () => {
  it('plays a sound alongside a delivered notification', () => {
    deps.spawn.mockReturnValue(new EventEmitter())
    const delivered = deliverSsidNotify(
      () => undefined,
      { title: 't', body: 'b' },
      'replyDone',
      join(tmpdir(), 'ssid-notify-absent.json'),
    )
    expect(delivered).toBe(true)
    expect(deps.spawn).toHaveBeenCalledTimes(1)
    expect(deps.show).toHaveBeenCalledTimes(1)
  })

  it('stays silent when the scene is switched off', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ssid-notify-off-'))
    created.push(dir)
    const configPath = join(dir, 'notify.json')
    writeFileSync(configPath, JSON.stringify({ replyDone: false }))
    const delivered = deliverSsidNotify(() => undefined, { title: 't', body: 'b' }, 'replyDone', configPath)
    expect(delivered).toBe(false)
    expect(deps.spawn).not.toHaveBeenCalled()
  })
})

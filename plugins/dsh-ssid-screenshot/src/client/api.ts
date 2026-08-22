/**
 * /ssid/api/screenshot/* client API (host half: dsh-ssid-screenshot src/index.ts).
 * Wire envelope mirrors dsh-ssid-panels: { ok, value | error }.
 */

/** 截图配置视图（+ 壳能力标记）。 */
export interface ScreenshotConfigView {
  hideWindow: boolean
  hotkey: string
  /** 是否运行在 SSiD 壳内（决定「立即生效」还是「重启后生效」）。 */
  shellAvailable: boolean
}

/** 保存结果（+ 快捷键是否已即时重注册）。 */
export interface ScreenshotConfigSaved extends ScreenshotConfigView {
  appliedHotkey: boolean
}

/** POST one method and unwrap the envelope. */
async function api<T>(method: string, payload?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/ssid/api/screenshot/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  })
  let body: { ok?: boolean, value?: T, error?: { message?: string } }
  try {
    body = await res.json() as { ok?: boolean, value?: T, error?: { message?: string } }
  } catch {
    throw new Error(`screenshot API ${method}: HTTP ${res.status}`)
  }
  if (body.ok !== true || body.value === undefined) {
    throw new Error(body.error?.message ?? `screenshot API ${method}: HTTP ${res.status}`)
  }
  return body.value
}

export function screenshotGet(): Promise<ScreenshotConfigView> {
  return api('get')
}

export function screenshotSet(payload: { hideWindow?: boolean, hotkey?: string }): Promise<ScreenshotConfigSaved> {
  return api('set', payload)
}

export function screenshotTrigger(): Promise<{ ok: boolean }> {
  return api('trigger')
}

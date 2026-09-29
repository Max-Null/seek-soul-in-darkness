/**
 * SSiD 壳版本向内核侧的暴露。
 *
 * `dsh-ssid-panels` 的 host 半读 `process.env.SSID_SHELL_VERSION`（缺失时回退 `'0.0.0'`），
 * 用于设置页「关于 SSiD」的版本号与检查更新的 currentVersion。这条注入链属于自建壳，
 * fork 形态一直没有跟过来，于是那个位置恒显示 `v0.0.0`（2026-09-30 装版 1.1.3 实测）。
 *
 * 这里给的是**产品版本**（`app.getVersion()`，思灵自己的版本号）；内核版本另有
 * `resolveDshVersion()`，两者彼此独立，别混用。
 */
import { app } from 'electron'

/**
 * 注入壳产品版本。
 *
 * 与另外两处环境准备（`installSsidMcpEnv`、`applySessionRootIsolation`）一样，**必须在每一个
 * `backend.start()` 调用点之前**执行 —— Host 子进程的 env 是构造时的快照，晚于它注入到不了。
 * @returns 本次写入的版本号，供调用方记日志。
 */
export function installSsidShellVersion(): string {
  const version = app.getVersion()
  process.env['SSID_SHELL_VERSION'] = version
  return version
}

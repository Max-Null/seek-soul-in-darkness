/**
 * 退出时结束随包 node 子进程。
 *
 * 思灵的内核从 `resources\node\node.exe` 拉起 MCP 引擎（Playwright、CodeGraph）。
 * 壳退出后它们可能变成孤儿、继续占着安装目录里的文件，覆盖安装时就成了安装器
 * 「应用仍在运行」的拦路石。这里在退出的最后阶段兜底清理一遍。
 *
 * 判据与安装器一致（可执行文件路径以资源目录开头），所以只会命中随包进程，
 * 碰不到用户自己装的 node。
 */

import { execFileSync } from 'node:child_process'

/**
 * 结束从应用资源目录启动的全部进程；失败不抛出。
 * @param resourcesPath - `process.resourcesPath`；未打包或非 Windows 时什么都不做。
 */
export function killPackagedChildProcesses(resourcesPath: string | undefined): void {
  if (process.platform !== 'win32' || resourcesPath === undefined || resourcesPath === '') return
  // PowerShell 单引号字符串里的单引号要写成两个。
  const prefix = resourcesPath.replaceAll("'", "''")
  const script = 'Get-CimInstance -ClassName Win32_Process | Where-Object { $_.Path -and '
    + `$_.Path.StartsWith('${prefix}', 'CurrentCultureIgnoreCase') -and $_.ProcessId -ne $PID } | `
    + 'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }'
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      timeout: 5000,
      windowsHide: true,
      // 不接管输出：退出路径上不该为了日志多开管道。
      stdio: 'ignore',
    })
  } catch {
    // 清理是尽力而为：失败也不影响退出流程。
  }
}

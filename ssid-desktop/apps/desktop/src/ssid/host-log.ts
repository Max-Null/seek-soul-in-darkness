/**
 * Host 子进程输出的落盘日志。
 *
 * 存在的理由：`host-process.ts` 原本把 Host 的 stdout `pipe(process.stdout)`（GUI 进程
 * 没有控制台，等于丢弃），stderr 只留在内存里供 Host 崩溃时拼诊断。结果是 Host 内部
 * 抛出的普通异常（例如 `present.open` 路由 500）**没有任何去处** —— 2026-09-28 排查
 * 「用文件管理器显示无效」时就卡在这里：知道失败发生在哪一段调用里，却拿不到堆栈。
 *
 * 路径落在 `<DSH_HOME>/logs/host.log`：与 DSH 的家同在，隔离实例（独立 `DSH_HOME`）
 * 的日志因此天然分离，不会互相污染。
 *
 * @module ssid/host-log
 */

import { createWriteStream, mkdirSync, renameSync, statSync, type WriteStream } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** 单文件上限：超过就在打开前轮转一代（只保留一代，避免无限增长）。 */
const MAX_LOG_BYTES = 8 * 1024 * 1024

/** 一个已打开的 Host 日志目标。 */
export interface HostLogSink {
  /** 写入一段 Host 输出；解码由调用方负责。 */
  write(text: string): void
  /** 冲刷并关闭；Host 退出时调用。 */
  close(): Promise<void>
}

/**
 * 解析 Host 日志文件路径。
 *
 * `DSH_HOME` 缺失或为空时退回 `~/.dsh`，与 DSH 自身的兜底一致。
 * @param environment - 启动 Host 时使用的环境。
 * @returns 日志文件绝对路径。
 */
export function hostLogPath(environment: NodeJS.ProcessEnv): string {
  const configured = environment.DSH_HOME
  const home = configured === undefined || configured === '' ? join(homedir(), '.dsh') : configured
  return join(home, 'logs', 'host.log')
}

/**
 * 打开一个追加写的 Host 日志目标。
 *
 * 目录不存在则创建；已有文件超过 {@link MAX_LOG_BYTES} 时先改名成 `.1` 再开新文件。
 * 写入走异步流：Host 的输出量不受控，同步写会卡住 Electron 主进程。
 * @param path - 日志文件绝对路径，通常来自 {@link hostLogPath}。
 * @returns 可写可关的日志目标。
 */
export function createHostLogSink(path: string): HostLogSink {
  mkdirSync(dirname(path), { recursive: true })
  rotateIfOversized(path)
  const stream: WriteStream = createWriteStream(path, { flags: 'a' })
  // 打开失败（磁盘只读、路径被占）不该拖垮壳：丢掉这一路的日志，其余照常。
  stream.on('error', () => {})
  return {
    write: (text: string): void => { stream.write(text) },
    close: (): Promise<void> => new Promise<void>((resolve) => { stream.end(() => { resolve() }) }),
  }
}

/** 文件超过上限时轮转一代；任何失败都只是放弃轮转，不影响开新文件。 */
function rotateIfOversized(path: string): void {
  try {
    if (statSync(path).size < MAX_LOG_BYTES) return
    renameSync(path, `${path}.1`)
  } catch {
    // 文件不存在（首次运行）或改名失败：直接往下走，追加写自会处理。
  }
}

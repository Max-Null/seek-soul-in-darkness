/**
 * CodeGraph 索引目录的首次引导 —— **不阻塞启动**的那一半。
 *
 * ## 为什么不能在启动路径上问
 *
 * MCP 的 env（`SSID_MCP_CG_WS` / `SSID_MCP_CG_ENABLE`）必须在 Host 子进程启动**前**注入，
 * 而对话框要等人点击。最初把引导直接放进 `installSsidMcpEnv({ promptWorkspace })` 的
 * await 链里，于是它把 Host 启动卡在那个 await 上。2026-09-26 实测的触发条件很平常：
 * **全新的 `DSH_HOME`（没有任何会话可供探测）+ `~/.ssid/codegraph.json` 缺席** ——
 * 启动就停在那里：没有报错、没有超时，进程活着但 Host 永不 spawn，界面上只剩一个
 * 等待点击的对话框。无人值守启动（脚本 / CI / 远程）会**永久**挂住。
 *
 * ## 改法
 *
 * 引导挪到 Host 就绪之后：目录没解析出来时，codegraph 条目本就停用（不影响其他功能），
 * 问出来的结果写进配置，**下次启动生效**。窗口不可见时干脆不问 —— 那正是无人值守场景。
 *
 * 纯逻辑（该不该问、记什么）在这个模块里，弹窗由调用方提供，便于测试。
 */

import { join } from 'node:path'
import { readCodeGraphConfig, codeGraphConfigPath, resolveCodeGraphWorkspace, writeCodeGraphConfig } from './codegraph-adapt.ts'

/** {@link shouldGuideCodeGraph} 的输入。 */
export interface CodeGraphGuideInput {
  /** DSH_HOME（会话根在其下）。 */
  readonly dshHome: string
  /** 当前 profile 名（隔离会话根是 `sessions-<名>`）。 */
  readonly profileName: string
  /** 环境快照，默认 `process.env`（读 `SSID_MCP_CG_WS`）。 */
  readonly env?: NodeJS.ProcessEnv
  /** 用户主目录，仅为测试可注入。 */
  readonly home?: string
}

/**
 * 现在该不该问用户目录：目录解析不出来、且用户从未表过态。
 *
 * 「解析得出来」包括 env 指定、配置里已写、以及**最近会话探测命中** —— 探测命中时
 * 自动适配已经成功，再弹窗就是打扰（这个误弹在会话文件名正则修好之前真实发生过）。
 * @param input - 宿主事实。
 * @returns 需要引导则为 true。
 */
export function shouldGuideCodeGraph(input: CodeGraphGuideInput): boolean {
  const { dshHome, profileName, env = process.env } = input
  const configPath = input.home === undefined ? codeGraphConfigPath() : codeGraphConfigPath(input.home)
  const config = readCodeGraphConfig(configPath) ?? {}
  if (config['decided'] === true) return false
  const resolved = resolveCodeGraphWorkspace({
    envWorkspace: env.SSID_MCP_CG_WS,
    config,
    sessionRoots: [join(dshHome, `sessions-${profileName}`), join(dshHome, 'sessions')],
    ...input.home === undefined ? {} : { home: input.home },
  })
  return resolved.workspace === null
}

/**
 * 记下用户的选择（选定的目录，或「暂不启用」的 null）。
 *
 * 无论选了什么都写 `decided: true` —— 它是「用户已经表过态」的印记，
 * 语义是「别再问了」，而不是「已经启用」。
 * @param workspace - 选定的项目目录，或 null 表示暂不启用。
 * @param home - 用户主目录，仅为测试可注入。
 * @throws 配置文件写不进去时（调用方自己决定是否吞掉）。
 */
export function recordCodeGraphDecision(workspace: string | null, home?: string): void {
  const configPath = home === undefined ? codeGraphConfigPath() : codeGraphConfigPath(home)
  const config = readCodeGraphConfig(configPath) ?? {}
  writeCodeGraphConfig(configPath, {
    ...config,
    workspace,
    decided: true,
    decidedAt: new Date().toISOString(),
  })
}

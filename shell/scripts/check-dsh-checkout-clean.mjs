#!/usr/bin/env node
/**
 * check-dsh-checkout-clean —— DSH 源码只引用不改（用户长期约定）
 *
 * 为什么值得一个门：
 * 工作区里的 `deepseek-harness/` 与 `dsh-web-runtime/` 是 DSH 上游源码。约定是
 * **只引用不改**——目标是跟随 DSH 版本迭代；一旦改了源码，既跟不上上游，又会让
 * dev（tsx 直接跑 checkout 源码）与装版（加载 profile 里的官方 npm 包）跑**行为不同
 * 的实现**，把「dev 正常 / 装版坏」变成不可信的对照。
 *
 * 2026-09-14 的 405 排查就栽在这里：`packages/client/connection/src/{index,rpc-host}.ts`
 * 在两个 checkout 里带着同一份未提交补丁（引入 `webServerCtx` / `attachWebServer`），
 * 而整个诊断的机制推理都建立在读过的那份补丁版源码上。约定写在工作区 `AGENTS.md`
 * 的布局注里，但没有门，所以没拦住。
 *
 * 判定（只查「已跟踪文件被修改」，M/D/R/T 任一即违规）：
 *   - 不查未跟踪文件：`.tmp-*` 诊断脚本、`.dsh/`、构建产物都是正常噪声，查了会误报
 *   - 不查删除：`dsh-web-runtime` 有一批 symlink 在 Windows 上没落成（既有状态），
 *     另有 `CLAUDE.md` 一处是上游仓库自身的删除——都不是「改源码」
 *   - 找不到 checkout（未克隆/未建副本）不算违规，但会被点名，避免静默跳过
 *
 * 需要适配时改什么：profile 的 `cordis.patch.yml` patch 条目、我们自己的插件源码、
 * SSiD 壳代码——**不是**这里。
 *
 * 自测：SSID_DSH_ROOTS 指向临时目录。
 * 退出码：0 通过 / 1 违规 / 2 空语料（一个 checkout 都没找到）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createGate } from './lib/gate-report.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SHELL = path.resolve(HERE, '..')
const REPO = path.resolve(SHELL, '..')
const WORKSPACE = path.resolve(REPO, '..')

/** 默认检视工作区里的两个 DSH checkout；可用 SSID_DSH_ROOTS 注入临时目录做自测。 */
const ROOTS = process.env.SSID_DSH_ROOTS !== undefined
  ? process.env.SSID_DSH_ROOTS.split(path.delimiter).filter(Boolean)
  : [path.join(WORKSPACE, 'deepseek-harness'), path.join(WORKSPACE, 'dsh-web-runtime')]

const gate = createGate({ id: 'check-dsh-checkout-clean', label: 'DSH 源码只引用不改', base: REPO })

/** 只看会改变源码内容的那些状态（新增/修改/类型变化）；删除与未跟踪不计。 */
const VIOLATING = new Set(['M', 'R', 'C', 'T', 'U'])

/**
 * 是否真的检视过至少一个仓库 —— 决定正常路径是「通过」还是「空语料」。
 *
 * 不能用「有没有违规」来判：**检查过且干净是常态**（尤其只有一个 checkout 时），
 * 那样会把最常见的正常结果报成 exit 2。
 */
let sawRepo = false
const repos = []

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

for (const root of ROOTS) {
  const label = path.basename(root)
  // 默认列表里只认真正的 DSH checkout；SSID_DSH_ROOTS 注入时不套这个规则。
  // 注意 `deepseek-harness` 不以 `dsh` 开头 —— 用白名单，别用 `^dsh` 前缀（会把它漏掉）。
  if (process.env.SSID_DSH_ROOTS === undefined
    && !/^(deepseek-harness|dsh[-_])/i.test(label)) {
    gate.info(`跳过（不是 DSH checkout）：${label}`)
    continue
  }
  if (!fs.existsSync(root)) {
    gate.info(`跳过（不存在）：${label}`)
    continue
  }
  if (!fs.existsSync(path.join(root, '.git'))) {
    gate.info(`跳过（非 git 仓库）：${label}`)
    continue
  }
  sawRepo = true
  repos.push(label)
  gate.inspect()

  let out
  try {
    out = git(root, ['status', '--porcelain', '--untracked-files=no'])
  } catch (cause) {
    gate.violation(root, null, `git status 失败：${String(cause).slice(0, 200)}`)
    continue
  }

  const rows = out.split('\n').map(l => l.trimEnd()).filter(l => l !== '')
  for (const row of rows) {
    // porcelain v1: XY <path>；取 X（索引）与 Y（工作树）两个状态位
    const x = row[0]
    const y = row[1]
    const file = row.slice(3)
    if (!VIOLATING.has(x) && !VIOLATING.has(y)) continue
    gate.violation(
      path.join(root, file),
      null,
      `DSH 源码被改动（${label}）—— 约定「只引用不改」。需要适配请改 profile 的 cordis.patch.yml / 我们自己的插件或壳代码`,
    )
  }
  gate.info(`${label}：源码干净 ✓`)
}

// 「检查过且干净」是正常通过；只有**一个仓库都没检视到**才是空语料（fail-loud）。
if (sawRepo) {
  gate.info(`已检视 ${repos.length} 个 DSH checkout：${repos.join('、')}`)
} else {
  console.error('  （未找到任何 DSH checkout —— 检查路径是否正确）')
}

process.exit(gate.done())

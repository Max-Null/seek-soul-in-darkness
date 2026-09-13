/**
 * 内核诊断探针 —— 按需启用，默认零输出。
 *
 * 为什么保留成一个模块而不是删掉或常驻：
 *   - 2026-09-14 的 405 排查靠它定位（结论见 `docs/决策/2026-09-14-插件中心405诊断记录.md`），
 *     删掉等于下次从零再写一遍；
 *   - 常驻又会每次启动灌几十行进 `~/.ssid/kernel-child.log`，把真实错误埋掉。
 * 所以：**代码留在仓库里，执行由 `SSID_KERNEL_PROBE=1` 决定**。默认路径完全无副作用。
 *
 * 启用方式（子进程继承 Electron 主进程环境，所以主进程设了就生效）：
 *   dev   : `$env:SSID_KERNEL_PROBE='1'; npm start`
 *   装版  : 设用户级环境变量 `SSID_KERNEL_PROBE=1` 后重启思灵
 * 输出落在 `~/.ssid/kernel-child.log`（host-process.mjs 把子进程 stderr 落盘）。
 *
 * 已固化的用法要点（踩过的坑，别重犯）：
 *   - `ctx.registry` 是 RegistryService，**不是 Map** —— 用 `.values()` 迭代
 *     （`vendor/cordis/src/reflect.ts:316` 的 `notify()` 就是这么遍历的）
 *   - `ctx.get(name)` 与 `ctx.<name>` **不是同一条路径**：前者读 fiber store，
 *     后者走 cordis 的拓扑敏感属性代理；两个都打印才能分清"服务不存在"与
 *     "存在但这个 ctx 够不着"
 *   - 延迟复探（+5s/+20s）用来区分「还没醒」与「确实没成」：cordis 的 `_reload()`
 *     有 `await Promise.resolve()` 让位，boot 刚返回时 fiber 可能仍在微任务队列里
 *   - 服务名清单按被查问题改；`slots` 这类可选服务缺了是正常的，别当故障
 */

/** 探一次：服务可见性 + `ctx.<name>` 代理可用性。 */
export function probeServices(kernel, tag = '') {
  const names = [
    'pluginCenter', 'pluginCenterRpc', 'remote', 'apiProxy',
    'loader', 'skills', 'tools', 'slots', 'webServer', 'connection',
  ]
  for (const name of names) {
    let viaGet = false
    try { viaGet = kernel.get(name) !== undefined } catch { viaGet = false }
    let viaProxy = 'n/a'
    try {
      viaProxy = String(kernel.ctx[name] !== undefined)
    } catch (cause) {
      viaProxy = `throw:${cause instanceof Error ? cause.message : String(cause)}`
    }
    console.error(`ssid: [probe${tag}] ${name}: get=${String(viaGet)} proxy=${viaProxy}`)
  }
}

/** 探一次：各 runtime 下没进 ACTIVE 的 fiber，带 inject / store / missing / error。 */
export function probeFibers(kernel, tag = '') {
  // 不是 Map —— 用 notify() 同款迭代方式
  const runtimes = typeof kernel.ctx.registry?.values === 'function'
    ? [...kernel.ctx.registry.values()]
    : []
  if (runtimes.length === 0) {
    console.error(`ssid: [fibers${tag}] registry.values() 不可用或为空`)
    return
  }
  let total = 0
  let active = 0
  const rows: string[] = []
  for (const runtime of runtimes) {
    for (const fiber of runtime.fibers ?? []) {
      total++
      // FiberState：0 PENDING / 1 LOADING / 2 ACTIVE / 3 FAILED / 4 DISPOSED / 5 UNLOADING
      if (Math.floor(Number(fiber.state)) === 2) { active++; continue }
      const injected = Object.keys(fiber.inject ?? {})
      const held = Object.keys(fiber._store ?? {})
      rows.push(
        `runtime=${runtime.name ?? '(anon)'} fiber=${String(fiber.name ?? '?')} state=${String(fiber.state)}`
        + ` inject=[${injected.join('|')}] store=[${held.join('|')}]`
        + ` missing=[${injected.filter(k => !held.includes(k)).join('|')}]`
        + (fiber._error ? ` error=${String(fiber._error).slice(0, 180)}` : ''),
      )
    }
  }
  console.error(`ssid: [fibers${tag}] runtime ${runtimes.length}，fiber ${total}，ACTIVE ${active}，非 ACTIVE ${rows.length}`)
  for (const row of rows.slice(0, 30)) console.error(`ssid: [fibers${tag}]   ${row}`)
}

/**
 * 跑一轮完整探针。**只在 `SSID_KERNEL_PROBE=1` 时被调用**（见 kernel-child.ts）。
 *
 * @param kernel - `bootKernel()` 的返回值
 */
export function probeKernel(kernel) {
  probeServices(kernel, '')
  probeFibers(kernel, '')
  // 延迟复探：区分「还没醒」与「确实没成」
  setTimeout(() => { probeServices(kernel, '+5s') }, 5000)
  setTimeout(() => {
    probeServices(kernel, '+20s')
    probeFibers(kernel, '+20s')
  }, 20000)
}

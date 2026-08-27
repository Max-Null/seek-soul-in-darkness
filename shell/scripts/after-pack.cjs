// afterPack 钩子：内置纯 Node 运行时 + 归档完整性校验
// 背景（v0.1.3）：dsh-runtime 已由 prepare-runtime.mjs 打成单文件
// dsh-runtime.tar.gz（extraResources 直拷），首启由 main.mjs 解压；
// 本钩子不再复制 node_modules 目录。node 保留（worker / MCP / pnpm 执行器）。
// 跨平台（2026-08-27 macOS 支持）：win32 注入 node.exe（koffi COM worker）；
// darwin/linux 注入无扩展名 node（Playwright MCP / pnpm.cjs 执行）。
const { cpSync, existsSync, statSync } = require('node:fs')
const { execFileSync } = require('node:child_process')
const { join, resolve } = require('node:path')

/** @param {import('electron-builder').AfterPackContext} context */
module.exports = async function afterPack(context) {
  // 应用 Resources 目录：win/linux = appOutDir/resources；mac =
  // appOutDir/Electron.app/Contents/Resources（2026-08-27 macos runner
  // 实测——原写死 appOutDir/resources 在 mac 上找不到归档致 afterPack 失败）
  const isMac = context.packager.platform.name === 'mac'
  const appResourcesDir = isMac
    ? join(context.appOutDir, 'Electron.app', 'Contents', 'Resources')
    : join(context.appOutDir, 'resources')
  // 归档完整性校验：extraResources 复制失败时立刻失败，避免交付残缺安装包
  const archive = join(appResourcesDir, 'dsh-runtime.tar.gz')
  if (!existsSync(archive)) {
    throw new Error(`[after-pack] 缺少 ${archive}（请先运行 node scripts/prepare-runtime.mjs）`)
  }
  console.log(`[after-pack] dsh-runtime.tar.gz OK (${(statSync(archive).size / 1024 / 1024).toFixed(1)} MB)`)

  injectBundledNode(context, appResourcesDir)
}

/**
 * 内置纯 Node 运行时，注入 <appResourcesDir>/node/<nodeName>：
 *  - win32：DSH 目录选择器 worker 用 koffi.view 读 COM 内存，Electron 进程
 *    （V8 memory cage 启用）禁止 external buffers，任何 koffi 版本在
 *    Electron 内调用 view 都会 FATAL 崩溃（koffi.dev 文档明确注明）。
 *    因此 worker 必须由纯 node.exe 执行。优先 NVM 的 v22.22.2
 *    （满足 DSH ≥22.13 要求），找不到时回退 PATH 中的 node。
 *  - darwin/linux：无扩展名 node 二进制——SSID_MCP_NODE（Playwright MCP）与
 *    捆绑 pnpm（pnpm.cjs）的执行器，同样不能用 electron 的 execPath
 *    （ABI 不匹配）。候选：Homebrew 双路径 → PATH（which 解析，覆盖 macos
 *    runner 的 hostedtoolcache 布局）。
 */
function injectBundledNode(context, appResourcesDir) {
  const isWin = process.platform === 'win32'
  const name = isWin ? 'node.exe' : 'node'
  const candidates = []
  if (isWin) {
    candidates.push(
      process.env.NVM_HOME ? resolve(process.env.NVM_HOME, 'v22.22.2/node.exe') : '',
      // dev 裸跑时 electron dist 自带 node.exe；打包纯净目录没有则跳过
      resolve(context.packager.projectDir, 'node_modules/electron/dist/node.exe'),
    )
  } else {
    candidates.push('/opt/homebrew/bin/node', '/usr/local/bin/node')
  }
  // PATH 兜底：which/where 解析真实绝对路径（darwin 下 PATH 未必含 /usr/local/bin）
  try {
    const found = execFileSync(isWin ? 'where' : 'which', [name], { encoding: 'utf8', timeout: 5000 })
      .split(/\r?\n/)[0]?.trim()
    if (found !== undefined && found !== '') candidates.push(found)
  } catch { /* which 失败（PATH 无 node）不阻塞 */ }
  candidates.push(name)
  for (const cand of candidates) {
    if (cand !== '' && existsSync(cand)) {
      const nodeDest = join(appResourcesDir, 'node', name)
      cpSync(cand, nodeDest, { force: true })
      console.log(`[after-pack] ${name} (${cand}) -> ${nodeDest}`)
      return
    }
  }
  console.log('[after-pack] no candidate node found; runtime will rely on PATH resolution')
}

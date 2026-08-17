// afterPack 钩子：内置纯 Node 运行时 + 归档完整性校验
// 背景（v0.1.3）：dsh-runtime 已由 prepare-runtime.mjs 打成单文件
// dsh-runtime.tar.gz（extraResources 直拷），首启由 main.mjs 解压；
// 本钩子不再复制 node_modules 目录。node.exe 保留（目录选择器 worker 用）。
const { cpSync, existsSync, statSync } = require('node:fs')
const { join, resolve } = require('node:path')

/** @param {import('electron-builder').AfterPackContext} context */
module.exports = async function afterPack(context) {
  // 归档完整性校验：extraResources 复制失败时立刻失败，避免交付残缺安装包
  const archive = join(context.appOutDir, 'resources/dsh-runtime.tar.gz')
  if (!existsSync(archive)) {
    throw new Error(`[after-pack] 缺少 resources/dsh-runtime.tar.gz（请先运行 node scripts/prepare-runtime.mjs）`)
  }
  console.log(`[after-pack] dsh-runtime.tar.gz OK (${(statSync(archive).size / 1024 / 1024).toFixed(1)} MB)`)

  // 内置纯 Node 运行时：DSH 目录选择器 worker 用 koffi.view 读 COM 内存，
  // Electron 进程（V8 memory cage 启用）禁止 external buffers，任何 koffi
  // 版本在 Electron 内调用 view 都会 FATAL 崩溃（koffi.dev 文档明确注明）。
  // 因此 worker 必须由纯 node.exe 执行。优先取 nvm 目录下的 v22.22.2
  // （满足 DSH ≥22.13 要求），找不到时回退到 PATH 中的 node。
  const candidates = [
    process.env.NVM_HOME ? resolve(process.env.NVM_HOME, 'v22.22.2/node.exe') : '',
    resolve(context.packager.projectDir, 'node_modules/electron/dist/node.exe'),
    'node.exe',
  ]
  for (const cand of candidates) {
    if (cand && existsSync(cand)) {
      const nodeDest = join(context.appOutDir, 'resources/node/node.exe')
      cpSync(cand, nodeDest, { force: true })
      console.log(`[after-pack] node.exe (${cand}) -> ${nodeDest}`)
      break
    }
  }
}

// afterPack 钩子：把 shell/dsh-runtime/node_modules 复制进打包产物
// 背景：electron-builder 26 不复制名为 node_modules 的目录内容（issue #3104），
// 内置 runtime 闭包（dsh-runtime）必须在此补全，否则打包版无法定位 DSH 运行时。
// 硬链接解引用：pnpm hoisted 布局下 @aiden0z 等文件是硬链接，安装到用户机器后链接失效，必须 dereference 拷贝实体。
const { cpSync, existsSync } = require('node:fs')
const { join, resolve } = require('node:path')

/** @param {import('electron-builder').AfterPackContext} context */
module.exports = async function afterPack(context) {
  const src = resolve(context.packager.projectDir, 'dsh-runtime/node_modules')
  const dest = join(context.appOutDir, 'resources/dsh-runtime/node_modules')
  cpSync(src, dest, { recursive: true, force: true, dereference: true })
  console.log(`[after-pack] dsh-runtime/node_modules -> ${dest}`)

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

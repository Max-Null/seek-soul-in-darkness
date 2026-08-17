// afterPack 钩子：把 shell/dsh-runtime/node_modules 复制进打包产物
// 背景：electron-builder 26 不复制名为 node_modules 的目录内容（issue #3104），
// 内置 runtime 闭包（dsh-runtime）必须在此补全，否则打包版无法定位 DSH 运行时。
// 硬链接解引用：pnpm hoisted 布局下 @aiden0z 等文件是硬链接，安装到用户机器后链接失效，必须 dereference 拷贝实体。
const { cpSync } = require('node:fs')
const { join, resolve } = require('node:path')

/** @param {import('electron-builder').AfterPackContext} context */
module.exports = async function afterPack(context) {
  const src = resolve(context.packager.projectDir, 'dsh-runtime/node_modules')
  const dest = join(context.appOutDir, 'resources/dsh-runtime/node_modules')
  cpSync(src, dest, { recursive: true, force: true, dereference: true })
  console.log(`[after-pack] dsh-runtime/node_modules -> ${dest}`)
}

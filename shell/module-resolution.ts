/**
 * Profile-relative 插件包解析，用于 electron 主进程直接 boot DSH。
 *
 * 学习 anywhere-labs 的 dsh-plugin-desktop（module-resolution.ts）：electron
 * 里 DSH 的 native addon（node-addon-require-builtin）探测不到标准 Node 的
 * V8 embedder，`ctx.loader.internal` 为 undefined，loader 退化成从 tree.ts
 * 位置 `import(name)`，bare specifier 找不到 profile 目录的插件。
 *
 * 解法：用 Node 24 的纯 JS `registerHooks` 把 loader 发出的 bare specifier
 * 的 parentURL 改写到 profile 目录，Node 的 node_modules 向上查找就能命中
 * `~/.dsh/profiles/node_modules`（healProfilesModuleFallback 建立的平面
 * symlink，覆盖所有 @deepseek-ai/dsh-*）和 profile 自己的 node_modules
 * （第三方插件）。
 *
 * 与 anywhere-labs 的差异：它打包运行，loader 的 import 在包入口文件里，
 * 用 `parentURL === LOADER_ENTRY_URL` 判断；SSiD 跑源码（tsx），import 在
 * `vendor/loader/src/config/tree.ts` 里，所以判断 parentURL 落在 loader 的
 * src 目录内。
 */

import { registerHooks } from 'node:module'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/** loader 包源码目录（tsx paths 把 @deepseek-ai/cordis-plugin-loader 解析到这里）。 */
const LOADER_SRC_DIR = dirname(
  fileURLToPath(import.meta.resolve('@deepseek-ai/cordis-plugin-loader')),
)

/** 是否是需要 Node 包解析的 bare specifier。 */
function isBareSpecifier(specifier: string): boolean {
  return !specifier.startsWith('.') && !specifier.startsWith('/') && !URL.canParse(specifier)
}

/**
 * 安装 loader 请求的 profile 相对解析钩子。
 * @param profileBaseUrl - profile 目录内 package.json 的 file URL（解析锚点）。
 * @returns 幂等的注销函数。
 */
export function installProfilePackageResolver(profileBaseUrl: string): () => void {
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      const parent = context.parentURL ?? ''
      const fromLoader = parent.startsWith(LOADER_SRC_DIR)
      if (!fromLoader || !isBareSpecifier(specifier)) {
        return nextResolve(specifier, context)
      }
      return nextResolve(specifier, { ...context, parentURL: profileBaseUrl })
    },
  })
  let active = true
  return () => {
    if (!active) return
    active = false
    hooks.deregister()
  }
}

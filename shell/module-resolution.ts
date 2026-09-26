/**
 * Profile-relative 插件包解析，用于 electron 主进程直接 boot DSH。
 *
 * 学习 anywhere-labs 的 dsh-plugin-desktop（module-resolution.ts）：electron
 * 里 DSH 的 native addon（node-addon-require-builtin）探测不到标准 Node 的
 * V8 embedder，`ctx.loader.internal` 为 undefined，loader 退化成从 tree.ts
 * 位置 `import(name)`，bare specifier 找不到 profile 目录的插件。
 *
 * 解法：用 Node 24 的纯 JS `registerHooks` 拦截 loader 发出的 bare specifier，
 * 把 `@deepseek-ai/dsh-*` 直接解析到 profile 自己的 node_modules（内置闭包 +
 * 第三方插件），其余交给 Node 从 profile 目录向上查找。
 *
 * 与 anywhere-labs 的差异：它打包运行，loader 的 import 在包入口文件里，
 * 用 `parentURL === LOADER_ENTRY_URL` 判断；SSiD 跑源码（tsx），import 在
 * `vendor/loader/src/config/tree.ts` 里，所以判断 parentURL 落在 loader 的
 * src 目录内。
 */

import { createRequire, registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'

/** 是否是需要 Node 包解析的 bare specifier。 */
function isBareSpecifier(specifier: string): boolean {
  return !specifier.startsWith('.') && !specifier.startsWith('/') && !URL.canParse(specifier)
}

/**
 * loader 包源码目录的 URL 前缀（带尾部斜杠）。运行时从 profile 解析
 * （不依赖模块顶层的 import.meta.resolve——打包后它无法解析 bare 名）。
 * 开发版经 tsx paths、打包版经 profile 平面 symlink，都命中 DSH checkout
 * 的 vendor/loader/src。保持 URL 形式比较——parentURL 是 file:// URL。
 */
function loaderSrcPrefix(profileBaseUrl: string): string {
  const profileRequire = createRequire(profileBaseUrl)
  const pkgPath = profileRequire.resolve('@deepseek-ai/cordis-plugin-loader/package.json')
  return new URL('.', pathToFileURL(pkgPath)).href
}

/**
 * 安装 loader 请求的 profile 相对解析钩子。
 * @param profileBaseUrl - profile 目录内 package.json 的 file URL（解析锚点）。
 * @returns 幂等的注销函数。
 */
export function installProfilePackageResolver(profileBaseUrl: string): () => void {
  const prefix = loaderSrcPrefix(profileBaseUrl)
  // bundle 形态下 loader 代码内联进 kernel.bundle.mjs，其 import 的
  // parentURL 是 bundle 自身；源码形态下是 checkout 的 vendor/loader/src
  // （tsx paths 会把静态 import 的 cordis-plugin-loader 指到 checkout，
  // 此时闭包 prefix 匹配不上，需按 vendor/loader 目录兜底判定）。
  const selfUrl = import.meta.url
  const profileRequire = createRequire(profileBaseUrl)
  const resolvedCache = new Map<string, string | undefined>()
  /**
   * 用 Node 自己的解析器（不走 ESM 钩子）把一个 bare specifier 解析成闭包路径。
   *
   * 为什么不直接把 parentURL 换掉再交给下一个 ESM 钩子：dev 形态下 tsx 会读
   * shell/tsconfig.json 的 paths，把 `@deepseek-ai/dsh-*` 指向 checkout 的
   * `src`，于是同一进程里同一个包出现两份——`node_modules/` 内的发起方
   * （tsx 的 paths 不作用于 node_modules 内的文件）拿到 profile 闭包，
   * 被重写过的发起方拿到 checkout 源码。两份 `@deepseek-ai/dsh-scope` 各持
   * 一个 `Symbol('dsh.scope')`：registry 用 A 份打 scope 标记，preset 的行用
   * B 份去读，永远读不到，于是每个 preset 的每一行都注册进全局层并抛
   * `prompt section "…" is already registered`，会话无法创建（2026-09-24 实测）。
   * createRequire 直接走 Node 的 CJS 解析，绕开 tsx 的 paths，保证整个插件图
   * 落在同一份闭包上。装版没有 tsx，本来就只有一份；这里统一的是 dev 形态。
   */
  const resolveInProfile = (specifier: string): string | undefined => {
    // 只收 DSH 插件包。cordis 系（`@deepseek-ai/cordis`、`cordis-plugin-*`）
    // 必须留给下一个解析器：dev 形态下它们是 checkout 源码（tsx paths），
    // loader 也来自同一份源码，换掉会造成源码 loader × 闭包 cordis 的混用
    // （实测报 `does not provide an export named 'FiberState'`）。
    if (!specifier.startsWith('@deepseek-ai/dsh-')) return undefined
    if (resolvedCache.has(specifier)) return resolvedCache.get(specifier)
    let resolved: string | undefined
    try { resolved = pathToFileURL(profileRequire.resolve(specifier)).href } catch { resolved = undefined }
    resolvedCache.set(specifier, resolved)
    return resolved
  }
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      const parent = context.parentURL ?? ''
      const fromLoader =
        parent.startsWith(prefix) || parent === selfUrl || parent.includes('/vendor/loader/')
      const resolvedInProfile = isBareSpecifier(specifier) ? resolveInProfile(specifier) : undefined
      if (resolvedInProfile !== undefined) {
        // `@deepseek-ai/dsh-*` 一律停在闭包：同一进程里这些包必须只有一份实例。
        // 它们是共享模块级状态的——`dsh-scope` 的 `Symbol('dsh.scope')` 就是典型：
        // 两份实例会让「给 ctx 打 scope 标记」与「按标记找回 scope」用上不同的
        // symbol，scope 永远读不回来，于是每个 preset 的每一行都注册进全局层并抛
        // `prompt section "…" is already registered`，会话无法创建。
        //
        // 三个来源都要收敛（2026-09-24 实测各自的解析结果）：
        //   - loader 自己 import 插件行；
        //   - 闭包内的文件之间的相互 import；
        //   - tsx 依 shell/tsconfig.json 的 paths 把 `@deepseek-ai/dsh-system-prompt`
        //     之类解析到 checkout 源码后，它在源码侧发起的 `dsh-scope` 请求——
        //     这一类最隐蔽，只按 parentURL 判断会漏掉。
        // createRequire 直接走 Node 的解析器，不经 ESM 钩子，因此绕开 tsx 的
        // paths。装版无 tsx，本来就只有一份；这里统一的是 dev 形态。
        return { url: resolvedInProfile, shortCircuit: true }
      }
      if (!fromLoader || !isBareSpecifier(specifier)) return nextResolve(specifier, context)
      // 闭包里没有的 bare specifier（cordis 系）：dev 形态下它们是 checkout 源码，
      // loader 也来自同一份源码，保持原来的 parentURL 重写即可。
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

/**
 * Resolved fields required to embed a macOS updater feed.
 *
 * `generic` 分支的 `provider` 可选：`package-macos.ts` 直接把 COS 配置
 * （`DesktopAutoUpdateConfig`，只有 `publicUrl`）传进来，语义上就是 generic 来源。
 */
export type MacOSAppUpdateFeed =
  | { readonly provider?: 'generic', readonly publicUrl: string }
  | { readonly provider: 'github', readonly owner: string, readonly repo: string }

/** Packaged electron-updater configuration for macOS. */
export type MacOSAppUpdateConfig =
  | { readonly provider: 'generic', readonly url: string, readonly channel: 'nightly', readonly updaterCacheDirName: string }
  | { readonly provider: 'github', readonly owner: string, readonly repo: string, readonly updaterCacheDirName: string }

/** Resolve the macOS feed from the final electron-builder configuration (generic COS or GitHub Releases). */
export function resolveMacOSAppUpdateFeed(publish: unknown): MacOSAppUpdateFeed

/** Create the electron-updater configuration embedded before code signing. */
export function createMacOSAppUpdateConfig(
  update: MacOSAppUpdateFeed,
  updaterCacheDirName: string,
): MacOSAppUpdateConfig

/** Write the updater configuration into an assembled App before signing. */
export function writeMacOSAppUpdateConfig(
  resourcesDir: string,
  update: MacOSAppUpdateFeed,
  updaterCacheDirName: string,
): Promise<void>

/** Verify the updater configuration inside an assembled macOS App. */
export function verifyMacOSAppUpdateConfig(
  appPath: string,
  update: MacOSAppUpdateFeed,
  updaterCacheDirName?: string,
): Promise<void>

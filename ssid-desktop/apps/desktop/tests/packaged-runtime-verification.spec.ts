import { describe, expect, it, vi } from 'vitest'

const { verifyDesktopRuntime } = vi.hoisted(() => ({
  verifyDesktopRuntime: vi.fn<(root: string, expected: string) => Promise<void>>(async () => undefined),
}))
// The hook imports the built tree, which a clean checkout has not produced; this is the path it resolves.
vi.mock('/apps/desktop/lib/types/runtime-tree.js', () => ({ verifyDesktopRuntime }))
vi.mock('../scripts/windows-asar-unpack.mjs', async importOriginal => ({
  ...await importOriginal<typeof import('../scripts/windows-asar-unpack.mjs')>(),
  verifyWindowsAsarUnpack: async () => undefined,
}))

const ENVIRONMENT = {
  DSH_DESKTOP_APP_ID: 'com.example.installer',
  DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://policy.example.com',
  DSH_DESKTOP_MANDATORY_UPDATE_CONFIG: JSON.stringify({ allowedAuthOrigins: ['https://login.example.com'] }),
  DSH_DESKTOP_TARGET_PLATFORM: 'win32',
  DSH_DESKTOP_TARGET_ARCH: 'x64',
  DSH_DESKTOP_UNSIGNED: '1',
  DOWNLOAD_TEST_ORIGIN: 'https://desktop-updates.example.com',
  DOWNLOAD_TEST_RELEASE_ID: '0123456789abcdef0123456789abcdef',
}

const CONTEXT = { appOutDir: 'out', packager: { getResourcesDir: () => 'out/resources' } }

/**
 * Run the packaging hook that verifies the bundled runtime.
 * @returns The version that hook required the runtime to declare.
 */
async function requiredRuntimeVersion(preparedRuntime?: string, preparedRuntimeVersion?: string): Promise<unknown> {
  verifyDesktopRuntime.mockClear()
  const { createElectronBuilderConfig } = await import('../scripts/electron-builder-config.mjs')
  const config = createElectronBuilderConfig(ENVIRONMENT, 'win32', 'x64', preparedRuntime, preparedRuntimeVersion)
  await config.afterPack(CONTEXT as never)
  return verifyDesktopRuntime.mock.calls[0]?.[1]
}

describe('packaged runtime verification', () => {
  it('requires the dsh version when the target tree supplies the runtime', async () => {
    // SSiD：afterPack 校验的是**内核**（dsh）版本 —— 产品版本自 1.0.0 起独立于内核版本
    // （6d850dddba）。官方那时两者同值，所以读 apps/desktop 的 package.json 也能过。
    const dshVersion = (JSON.parse(
      await import('node:fs/promises').then(async fs => fs.readFile(new URL('../../../package.json', import.meta.url), 'utf8')),
    ) as { version: string }).version
    expect(await requiredRuntimeVersion()).toBe(dshVersion)
  })

  it('requires the version installed-update qualification wrote into its private runtime', async () => {
    // Qualification rewrites the runtime's own version, so comparing against the product version would always fail.
    expect(await requiredRuntimeVersion('/qualification/dsh', '0.1.6-alpha.2.20260921.1')).toBe('0.1.6-alpha.2.20260921.1')
  })

  it('does not let a build version change what the bundled runtime must declare', async () => {
    const readVersion = async (relative: string): Promise<string> => (JSON.parse(
      await import('node:fs/promises').then(async fs => fs.readFile(new URL(relative, import.meta.url), 'utf8')),
    ) as { version: string }).version
    const dshVersion = await readVersion('../../../package.json')
    const productVersion = await readVersion('../package.json')
    const { createElectronBuilderConfig } = await import('../scripts/electron-builder-config.mjs')
    const { desktopBuildVersionPrefix } = await import('../scripts/desktop-build-version.mjs')
    verifyDesktopRuntime.mockClear()
    // 稳定版产品版本必须带 `-test.` 才是合法构建版本（validateDesktopBuildVersion 的要求）：
    // 直接拼 `${productVersion}.20260921.1` 在稳定版 1.0.0 上会得到四点式版本而抛错。
    const buildVersion = `${desktopBuildVersionPrefix(productVersion)}20260921.1`
    const config = createElectronBuilderConfig(
      { ...ENVIRONMENT, DSH_DESKTOP_BUILD_VERSION: buildVersion }, 'win32', 'x64')
    expect(config.extraMetadata).toMatchObject({ version: buildVersion })
    await config.afterPack(CONTEXT as never)
    expect(verifyDesktopRuntime.mock.calls[0]?.[1]).toBe(dshVersion)
  })
})

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ root: '', keychainCalls: 0 }))

vi.mock('../scripts/desktop-package-environment.mjs', () => ({
  loadDesktopPackageEnvironment: () => ({
    DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://policy.example.com',
    DSH_DESKTOP_TARGET_PLATFORM: 'darwin',
    DSH_DESKTOP_TARGET_ARCH: 'arm64',
  }),
  validateDesktopPackageEnvironment: () => {},
}))
vi.mock('../scripts/macos-signing-keychain.mjs', () => ({
  withMacOSSigningKeychain: async (_environment: object, action: (environment: object) => Promise<unknown>) => {
    state.keychainCalls += 1
    return action({ CSC_KEYCHAIN: 'fixture-keychain' })
  },
}))
// 这个套件假造宿主平台，真实探测只会报告本机缺的东西，而不是被测的行为。
vi.mock('../scripts/desktop-toolchain-preflight.ts', () => ({ requireDesktopToolchain: async () => {} }))
// 打包子进程换成一次立即失败：这条链要观察的是它开始之前的签名准备。
vi.mock('../scripts/packaging-run.mjs', async (importOriginal) => {
  const original = await importOriginal<typeof import('../scripts/packaging-run.mjs')>()
  return { ...original, createPackagingRun: (...args: Parameters<typeof original.createPackagingRun>) => {
    const run = original.createPackagingRun(state.root, args[1], args[2])
    return { ...run, run: async (stage: string) => { throw new Error(`stage refused: ${stage}`) } }
  } }
})

afterEach(async () => {
  await rm(state.root, { recursive: true, force: true })
})

/** Drive the real command entry point on a fabricated Apple Silicon host. */
async function runPackagingCommand(unsigned: boolean): Promise<void> {
  state.root = await mkdtemp(join(tmpdir(), 'macos-unsigned-keychain-'))
  state.keychainCalls = 0
  const savedPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!
  const savedArch = Object.getOwnPropertyDescriptor(process, 'arch')!
  const savedArgv = process.argv
  const savedExit = process.exitCode
  const savedDirectory = process.env.DSH_DESKTOP_PACKAGING_RUN_DIR
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    Object.defineProperty(process, 'platform', { ...savedPlatform, value: 'darwin' })
    Object.defineProperty(process, 'arch', { ...savedArch, value: 'arm64' })
    process.argv = [process.execPath, fileURLToPath(new URL('../scripts/package-target.ts', import.meta.url)),
      'mac-arm64', ...(unsigned ? ['--unsigned'] : [])]
    vi.resetModules()
    await import('../scripts/package-target.ts')
  } finally {
    Object.defineProperty(process, 'platform', savedPlatform)
    Object.defineProperty(process, 'arch', savedArch)
    process.argv = savedArgv
    process.exitCode = savedExit
    if (savedDirectory === undefined) delete process.env.DSH_DESKTOP_PACKAGING_RUN_DIR
    else process.env.DSH_DESKTOP_PACKAGING_RUN_DIR = savedDirectory
    stderr.mockRestore()
    consoleLog.mockRestore()
  }
}

// SSiD：未签名 mac 构建没有 p12 可导入，也没有可核对的发布身份，因此不该建临时签名钥匙串。
it('does not build a signing keychain for an unsigned macOS build', async () => {
  await runPackagingCommand(true)
  expect(state.keychainCalls).toBe(0)
})

// 负样本：签名通道必须仍然建钥匙串，否则「未签名」与「不签名」就成了同一件事。
it('still builds a signing keychain for a signed macOS build', async () => {
  await runPackagingCommand(false)
  expect(state.keychainCalls).toBe(1)
})

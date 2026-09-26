import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createMacOSAppUpdateConfig,
  resolveMacOSAppUpdateFeed,
  verifyMacOSAppUpdateConfig,
  writeMacOSAppUpdateConfig,
} from '../scripts/macos-app-update-config.mjs'

const roots: string[] = []
const update = { provider: 'generic' as const, publicUrl: 'https://desktop-updates.example.com/dsh-desk/feeds/mac-arm64/' }

async function fixture(): Promise<{ appPath: string; resourcesDir: string }> {
  const root = await mkdtemp(join(tmpdir(), 'desktop-macos-update-config-'))
  roots.push(root)
  const appPath = join(root, 'DeepSeek Harness.app')
  const resourcesDir = join(appPath, 'Contents', 'Resources')
  await mkdir(resourcesDir, { recursive: true })
  return { appPath, resourcesDir }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('macOS packaged updater configuration', () => {
  it('uses the final generic Nightly provider configured for the build', () => {
    expect(resolveMacOSAppUpdateFeed([{ provider: 'generic', url: update.publicUrl, channel: 'nightly' }]))
      .toEqual(update)
    for (const publish of [undefined, [],
      [{ provider: 'generic', channel: 'latest', url: update.publicUrl }]]) {
      expect(() => resolveMacOSAppUpdateFeed(publish)).toThrow(/macOS update config/u)
    }
  })

  // SSiD：GitHub Releases 也是合法来源（思灵的发布方式），因此不再要求 generic + Nightly。
  it('accepts a GitHub Releases provider end to end', async () => {
    const feed = { provider: 'github' as const, owner: 'Max-Null', repo: 'seek-soul-in-darkness' }
    expect(resolveMacOSAppUpdateFeed([feed])).toEqual(feed)
    expect(createMacOSAppUpdateConfig(feed, 'ssid-updater')).toEqual({
      provider: 'github',
      owner: 'Max-Null',
      repo: 'seek-soul-in-darkness',
      updaterCacheDirName: 'ssid-updater',
    })
    const paths = await fixture()
    await writeMacOSAppUpdateConfig(paths.resourcesDir, feed, 'ssid-updater')
    await expect(verifyMacOSAppUpdateConfig(paths.appPath, feed, 'ssid-updater')).resolves.toBeUndefined()
  })

  it('writes and verifies the fixed release feed before signing', async () => {
    const paths = await fixture()
    expect(createMacOSAppUpdateConfig(update, 'deepseek-harness-updater')).toEqual({
      provider: 'generic',
      url: update.publicUrl,
      channel: 'nightly',
      updaterCacheDirName: 'deepseek-harness-updater',
    })
    await writeMacOSAppUpdateConfig(paths.resourcesDir, update, 'deepseek-harness-updater')
    await expect(verifyMacOSAppUpdateConfig(paths.appPath, update, 'deepseek-harness-updater')).resolves.toBeUndefined()
  })

  it.each([
    ['missing', undefined],
    ['wrong feed', 'provider: generic\nurl: https://wrong.example.com/\nchannel: nightly\nupdaterCacheDirName: fixture\n'],
    ['missing cache directory', `provider: generic\nurl: ${update.publicUrl}\nchannel: nightly\n`],
  ] as const)('rejects %s updater configuration', async (_label, contents) => {
    const paths = await fixture()
    if (contents !== undefined) await writeFile(join(paths.resourcesDir, 'app-update.yml'), contents)
    await expect(verifyMacOSAppUpdateConfig(paths.appPath, update)).rejects.toThrow(/macOS update config/u)
  })

  it('rejects another updater cache directory when the signed value is known', async () => {
    const paths = await fixture()
    await writeMacOSAppUpdateConfig(paths.resourcesDir, update, 'wrong-updater')
    await expect(verifyMacOSAppUpdateConfig(paths.appPath, update, 'deepseek-harness-updater'))
      .rejects.toThrow(/expected deepseek-harness-updater/u)
  })
})

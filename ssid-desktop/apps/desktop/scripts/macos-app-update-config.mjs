/** Write and verify the updater configuration sealed into a macOS application. */

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { dump, load } from 'js-yaml'

const CONFIG_FILENAME = 'app-update.yml'
const CHANNEL = 'nightly'

function object(value, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`desktop macOS update config: ${label} must be an object`)
  }
  return value
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value === '') {
    throw new Error(`desktop macOS update config: ${label} must be a non-empty string`)
  }
  return value
}

/**
 * Resolve the macOS update feed from the final electron-builder configuration.
 *
 * SSiD 支持两种：官方自身的 `generic`（腾讯 COS，要求 Nightly 渠道），以及指向
 * GitHub Releases 的 `github`（思灵的发布方式 —— 不需要自备静态托管与上传密钥）。
 * @param {unknown} publish - Final electron-builder publish setting.
 * @returns {{ provider: 'generic', publicUrl: string } | { provider: 'github', owner: string, repo: string }} Resolved feed used by the packaged App.
 */
export function resolveMacOSAppUpdateFeed(publish) {
  if (!Array.isArray(publish) || publish.length !== 1) {
    throw new Error('desktop macOS update config: publish must contain exactly one provider')
  }
  const provider = object(publish[0], 'publish provider')
  if (provider.provider === 'generic') {
    if (provider.channel !== CHANNEL) {
      throw new Error('desktop macOS update config: publish provider must be generic Nightly')
    }
    return { provider: 'generic', publicUrl: nonEmptyString(provider.url, 'publish provider URL') }
  }
  if (provider.provider === 'github') {
    return {
      provider: 'github',
      owner: nonEmptyString(provider.owner, 'publish provider owner'),
      repo: nonEmptyString(provider.repo, 'publish provider repo'),
    }
  }
  throw new Error('desktop macOS update config: publish provider must be generic or github')
}

/**
 * Create the electron-updater configuration embedded before code signing.
 * @param {{ provider: 'generic', publicUrl: string } | { provider: 'github', owner: string, repo: string }} update - Resolved update feed.
 * @param {string} updaterCacheDirName - electron-builder application cache directory.
 * @returns {Record<string, string>} Packaged updater fields.
 */
export function createMacOSAppUpdateConfig(update, updaterCacheDirName) {
  const cacheDirName = nonEmptyString(updaterCacheDirName, 'updater cache directory')
  if (update.provider === 'github') {
    return {
      provider: 'github',
      owner: nonEmptyString(update.owner, 'github owner'),
      repo: nonEmptyString(update.repo, 'github repo'),
      updaterCacheDirName: cacheDirName,
    }
  }
  return {
    provider: 'generic',
    url: nonEmptyString(update.publicUrl, 'public URL'),
    channel: CHANNEL,
    updaterCacheDirName: cacheDirName,
  }
}

/**
 * Write the updater configuration into an assembled App before signing.
 * @param {string} resourcesDir - App Contents/Resources directory.
 * @param {{ provider: 'generic', publicUrl: string } | { provider: 'github', owner: string, repo: string }} update - Resolved update feed.
 * @param {string} updaterCacheDirName - electron-builder application cache directory.
 * @returns {Promise<void>} Resolves after the configuration is durable.
 */
export async function writeMacOSAppUpdateConfig(resourcesDir, update, updaterCacheDirName) {
  const config = createMacOSAppUpdateConfig(update, updaterCacheDirName)
  await writeFile(join(resourcesDir, CONFIG_FILENAME), dump(config, { lineWidth: -1, noRefs: true }))
}

/**
 * Verify the updater configuration inside an assembled macOS App.
 * @param {string} appPath - Application bundle path.
 * @param {{ provider: 'generic', publicUrl: string } | { provider: 'github', owner: string, repo: string }} update - Expected update feed.
 * @param {string | undefined} updaterCacheDirName - Exact cache directory when known.
 * @returns {Promise<void>} Resolves when the packaged configuration matches the release destination.
 */
export async function verifyMacOSAppUpdateConfig(appPath, update, updaterCacheDirName = undefined) {
  const path = join(appPath, 'Contents', 'Resources', CONFIG_FILENAME)
  let parsed
  try {
    parsed = load(await readFile(path, 'utf8'))
  }
  catch (error) {
    throw new Error(`desktop macOS update config: cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
  const config = object(parsed, CONFIG_FILENAME)
  const matches = update.provider === 'github'
    ? config.provider === 'github' && config.owner === update.owner && config.repo === update.repo
    : config.provider === 'generic' && config.url === update.publicUrl && config.channel === CHANNEL
  if (!matches) {
    const expected = update.provider === 'github' ? `${update.owner}/${update.repo}` : update.publicUrl
    throw new Error(`desktop macOS update config: ${path} does not match ${expected}`)
  }
  const actualCacheDirName = nonEmptyString(config.updaterCacheDirName, `${CONFIG_FILENAME}.updaterCacheDirName`)
  if (updaterCacheDirName !== undefined && actualCacheDirName !== updaterCacheDirName) {
    throw new Error(`desktop macOS update config: ${path} has updater cache directory ${actualCacheDirName}; expected ${updaterCacheDirName}`)
  }
}

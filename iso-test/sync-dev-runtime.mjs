// Regenerate the dev development project when its runtime record no longer matches the
// checkout's kernel version.
//
// Why this exists: the shell's `resolveDshVersion()` reads
// `<project>/desktop-runtime.json` -> `release.version` for the version shown in the
// About screen. That record is written by `prepareDevelopmentProject`, which only runs
// inside `dev.ts`; `start-dev.ps1` deliberately bypasses `dev.ts` (it needs its own
// Electron switches), so after a kernel bump the About screen kept showing the previous
// release while the kernel actually loaded the new one (the `@deepseek-ai/dsh` entry is
// a junction into the checkout, so it always follows the source tree).
//
// Idempotent: exits without touching anything when the record already matches.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const CHECKOUT = 'H:\\MaxNull\\WorkStation\\.ssid-build\\checkout'
const APP = join(CHECKOUT, 'apps', 'desktop')
const PROJECT = join(APP, '.desktop-build', 'development', 'project')

const readVersion = path => {
  const value = JSON.parse(readFileSync(path, 'utf8'))
  return typeof value.version === 'string' ? value.version : undefined
}

const want = readVersion(join(CHECKOUT, 'package.json'))
const recordPath = join(PROJECT, 'desktop-runtime.json')
let have
try {
  have = JSON.parse(readFileSync(recordPath, 'utf8'))?.release?.version
} catch {
  have = undefined
}

if (have === want) {
  console.log(`dev runtime record is current (@deepseek-ai/dsh@${want}); nothing to do`)
  process.exit(0)
}

console.log(`dev runtime record is stale (${String(have)} -> ${want}); rebuilding ${PROJECT}`)

const toUrl = p => 'file:///' + p.replace(/\\/g, '/')
const { prepareDevelopmentProject } = await import(
  toUrl(join(APP, 'scripts', 'development-project.ts')))
const { resolveDesktopBuildTarget } = await import(
  toUrl(join(APP, 'scripts', 'desktop-build-paths.mjs')))
const { DESKTOP_HOST_PROTOCOL_VERSION } = await import(
  toUrl(join(APP, 'src', 'host-protocol.ts')))

const pkgVersion = (path, label) => {
  const value = JSON.parse(readFileSync(path, 'utf8'))
  if (typeof value.version !== 'string') throw new Error(`${label}: missing version`)
  return value.version
}

const release = {
  schemaVersion: 1,
  version: want,
  hostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
  nodeVersion: execFileSync(
    createRequire(import.meta.url)(join(APP, 'node_modules', 'electron')),
    ['-p', 'process.versions.node'],
    { encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } },
  ).trim(),
  pnpmVersion: pkgVersion(join(APP, 'node_modules', 'pnpm', 'package.json'), 'pnpm package'),
}

prepareDevelopmentProject({
  projectDir: PROJECT,
  cliDir: join(CHECKOUT, 'apps', 'cli'),
  hostDir: join(CHECKOUT, 'apps', 'desktop-host'),
  dependencyDir: join(CHECKOUT, 'node_modules', '.pnpm', 'node_modules'),
  release,
  target: resolveDesktopBuildTarget(),
})
console.log(`dev runtime record rebuilt for @deepseek-ai/dsh@${want}`)

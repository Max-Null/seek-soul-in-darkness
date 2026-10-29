#!/usr/bin/env node
/**
 * 生成 @max-null 全家桶的 DSH 插件市场索引（format 1）。
 *
 * 只收 `profile-template` 里以 npm 版本声明的 `@max-null/*`：vendor（`file:`）那几款
 * 不发布 npm，查不到 registry 事实，列进去只会让人装失败。
 *
 * 输出 `market/index.json`，由 jsdelivr 直接代理 GitHub 文件：
 *   https://cdn.jsdelivr.net/gh/Max-Null/seek-soul-in-darkness@main/market/index.json
 * 所以既不需要 GitHub Pages，也不需要单独发一个 npm 包。
 *
 * 用法：node scripts/gen-market-index.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const template = JSON.parse(readFileSync(join(root, 'shell/profile-template/package.json'), 'utf8'))
const entries = Object.entries(template.dependencies ?? {})
  .filter(([name, spec]) => name.startsWith('@max-null/') && !/^(file|link):/u.test(spec))

/**
 * 取一个包在 registry 上的事实：精确版本、发布时间（秒）、DSH peer 范围。
 * format 1 三者都是必填，缺一就不能列；顺带要求 `dsh.bundle`，否则装了也会被拒。
 * @param {string} name - npm 包名。
 * @returns {Promise<{ version: string, publishTimestamp: number, dshRange: string, manifest: any } | null>}
 */
async function registryFacts(name) {
  for (const registry of ['https://registry.npmjs.org', 'https://registry.npmmirror.com']) {
    try {
      const res = await fetch(`${registry}/${name.replace('/', '%2F')}`, { signal: AbortSignal.timeout(15000) })
      if (!res.ok) continue
      const doc = await res.json()
      const latest = doc['dist-tags']?.latest
      if (latest === undefined) continue
      const manifest = doc.versions?.[latest]
      if (manifest?.dsh?.bundle === undefined) continue
      const dshRange = Object.entries(manifest.peerDependencies ?? {})
        .find(([peer]) => peer.startsWith('@deepseek-ai/dsh'))?.[1]
      if (dshRange === undefined) continue
      const published = doc.time?.[latest]
      const publishTimestamp = published === undefined ? 0 : Math.floor(Date.parse(published) / 1000)
      if (!publishTimestamp) continue
      return { version: latest, publishTimestamp, dshRange, manifest }
    } catch { /* 换下一个 registry */ }
  }
  return null
}

const plugins = []
for (const [name] of entries) {
  const facts = await registryFacts(name)
  if (facts === null) {
    console.warn(`跳过 ${name}：registry 上缺 dsh.bundle / DSH peer 范围 / 发布时间`)
    continue
  }
  const description = typeof facts.manifest.description === 'string' ? facts.manifest.description : ''
  plugins.push({
    name,
    ...description === '' ? {} : { description: { en: description, zh: description } },
    author: 'Max Null',
    'dist-tags': { latest: facts.version },
    versions: [{
      version: facts.version,
      publishTimestamp: facts.publishTimestamp,
      source: { type: 'npm' },
      engines: { dsh: facts.dshRange },
    }],
  })
  console.log(`✓ ${name}@${facts.version}`)
}

const index = {
  format: 1,
  title: { en: 'MaxNull SSiD plugins', zh: 'MaxNull 思灵插件全家桶' },
  description: { en: 'The @max-null plugin family behind SSiD', zh: '思灵（SSiD）背后的 @max-null 插件全家桶' },
  plugins,
}
mkdirSync(join(root, 'market'), { recursive: true })
writeFileSync(join(root, 'market/index.json'), `${JSON.stringify(index, null, 2)}\n`)
console.log(`\n写出 ${plugins.length} 条 → market/index.json`)

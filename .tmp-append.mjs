import { readFileSync, writeFileSync } from 'node:fs'

const f = process.argv[2]
let t = readFileSync(f, 'utf8')
if (t.includes('binding guard')) { console.log('already'); process.exit(0) }
const add = `

// v0.1.14 回归：绑定层曾 \`{...autoUpdater}\` spread 导致原型方法（on）丢失 →
// packaged 首启 \`autoUpdater.on is not a function\`。绑定点必须保留原型。
test('binding guard: 不可 spread autoUpdater（原型 on/checkForUpdates 必须保留）', async () => {
  const { EventEmitter } = await import('node:events')
  const au = new EventEmitter()
  au.checkForUpdates = async () => {}
  au.downloadUpdate = async () => {}
  au.downloadedUpdateHelper = { file: 'x.exe' }
  const spread = { ...au }
  assert.equal(typeof spread.on, 'undefined', 'spread 丢失原型 on（v0.1.14 bug 根因）')
  // Proxy 委托方案（updater.mjs）：原型保留 + spawnInstaller 注入
  let spawned = null
  const proxied = new Proxy(au, {
    get(target, prop) {
      if (prop === 'spawnInstaller') return (p) => { spawned = p }
      return Reflect.get(target, prop)
    },
  })
  assert.equal(typeof proxied.on, 'function')
  assert.equal(typeof proxied.checkForUpdates, 'function')
  proxied.spawnInstaller('y.exe')
  assert.equal(spawned, 'y.exe')
})
`
writeFileSync(f, t.trimEnd() + '\n' + add, 'utf8')
console.log('appended')

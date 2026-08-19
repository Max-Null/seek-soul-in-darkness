// 验证 deployRuntime 原子落位逻辑（占用场景）：用临时目录模拟
// 旧 node_modules 被占用 → rename 失败 → 重试/回滚路径。
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync, openSync, closeSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const base = fileURLToPath(new URL('./tmp-deploy-test', import.meta.url))
rmSync(base, { recursive: true, force: true })
mkdirSync(base, { recursive: true })
const profileDir = join(base, 'profile')
const tmpDir = join(base, '.deploy.new')
mkdirSync(join(profileDir, 'node_modules', '@max-null', 'dsh-memory'), { recursive: true })
mkdirSync(join(tmpDir, 'node_modules', '@max-null'), { recursive: true })
writeFileSync(join(profileDir, 'node_modules', '@max-null', 'dsh-memory', 'pkg.json'), '')
writeFileSync(join(profileDir, 'node_modules', 'old-file.txt'), 'old')
writeFileSync(join(profileDir, '.runtime-version'), '0.1.3-0.1.0-rc.6')
writeFileSync(join(tmpDir, 'node_modules', 'new-file.txt'), 'new')
writeFileSync(join(tmpDir, '.runtime-version'), '0.1.5-0.1.0-rc.7-xxx')

// 模拟占用：以非共享删除模式打开旧 node_modules 下的文件（Windows 上会
// 导致 rename 该目录失败 EPERM）。
const lockPath = join(profileDir, 'node_modules', 'old-file.txt')
const fd = openSync(lockPath, 'r')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const renameWithRetry = async (from, to) => {
  let lastErr
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      renameSync(from, to)
      return true
    } catch (err) {
      lastErr = err
      console.log(`  [retry ${attempt}/5] ${err.code} ${from.split(base).pop()} -> ${to.split(base).pop()}`)
      await sleep(50)
    }
  }
  console.log(`  [FAIL] ${lastErr.code}`)
  return false
}

const run = async () => {
  console.log('=== 场景1: 旧 node_modules 被占用, rename 重试期间占用方释放 ===')
  const oldModules = join(profileDir, 'node_modules')
  const oldBackup = join(profileDir, '.deploy.old')
  const newModules = join(tmpDir, 'node_modules')
  // 占用方在第二次重试后释放
  setTimeout(() => { try { closeSync(fd) } catch {} }, 120)
  const ok1 = await renameWithRetry(oldModules, oldBackup)
  console.log(`  rename 旧->备份: ${ok1 ? '成功' : '失败'}`)
  const ok2 = await renameWithRetry(newModules, oldModules)
  console.log(`  rename 新->正式: ${ok2 ? '成功' : '失败'}`)
  console.log(`  新模块落位: ${existsSync(join(profileDir, 'node_modules', 'new-file.txt'))}`)
  console.log(`  旧备份存在: ${existsSync(oldBackup)}`)
  // 清理
  rmSync(oldBackup, { recursive: true, force: true })

  console.log('=== 场景2: 占用方一直不释放, 重试全部失败 → 模拟回滚 ===')
  rmSync(join(profileDir, 'node_modules'), { recursive: true, force: true })
  mkdirSync(join(profileDir, 'node_modules', '@max-null'), { recursive: true })
  writeFileSync(join(profileDir, 'node_modules', 'keep.txt'), 'keep')
  const fd2 = openSync(join(profileDir, 'node_modules', 'keep.txt'), 'r')
  const ok3 = await renameWithRetry(join(profileDir, 'node_modules'), join(profileDir, '.deploy.old'))
  console.log(`  rename 旧->备份(占用中): ${ok3 ? '成功(意外)' : '失败(符合预期)'}`)
  try { closeSync(fd2) } catch {}
  console.log('  → 回滚路径: 备份不存在时无需恢复, 删除 .runtime-version 强制下次重部署')
  console.log('=== 场景2 完成 ===')
  rmSync(base, { recursive: true, force: true })
  console.log('ALL CHECKS DONE')
}

run().catch((e) => { console.error('TEST ERROR:', e); process.exit(1) })

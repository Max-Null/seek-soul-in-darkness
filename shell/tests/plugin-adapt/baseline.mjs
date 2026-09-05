// 生成/更新样式基线：设置 UPDATE_SNAPSHOTS=1 后透传 playwright test
process.env.UPDATE_SNAPSHOTS = '1'
const { spawnSync } = await import('node:child_process')
const result = spawnSync('pnpm', ['exec', 'playwright', 'test'], { stdio: 'inherit' })
process.exit(result.status ?? 1)

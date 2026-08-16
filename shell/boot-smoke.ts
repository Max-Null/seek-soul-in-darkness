/**
 * SSiD 壳 boot 冒烟验证：不依赖 electron，证明"SSiD 能从自己的目录 boot 起
 * DSH 官方 web profile"这条核心链路。
 *
 * 跑法：`node --import tsx/esm boot-smoke.ts`
 * 成功标志：boot 成功 → 打印监听端口 → fetch `/` 拿到 200 + 非空 HTML。
 */

import { bootKernel } from './kernel.ts'

async function main(): Promise<void> {
  const { port, shutdown } = await bootKernel()
  const url = `http://127.0.0.1:${port}/`
  const res = await fetch(url)
  const text = await res.text()
  console.log(`SSiD boot OK: ${url} -> HTTP ${res.status} (${text.length} bytes)`)
  console.log(text.slice(0, 160))
  shutdown.shutdown(0)
}

main().catch((cause: unknown) => {
  console.error('SSiD boot FAILED:', cause instanceof Error ? cause.stack ?? cause.message : String(cause))
  process.exit(1)
})

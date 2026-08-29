/**
 * SSiD 壳 boot 冒烟验证：不依赖 electron，证明"SSiD 能从自己的目录 boot 起
 * DSH 官方 web profile"这条核心链路。
 *
 * 跑法：`node --import tsx/esm boot-smoke.ts`
 * 成功标志：boot 成功 → 打印监听端口 → fetch `/` 拿到 200 + 非空 HTML；
 * master 内核（0.1.2-alpha.1）web 服务带 token 认证，未带 token 的裸 fetch
 * 返回 401（dsh web authentication required）——同样证明服务已就绪。
 */

import { bootKernel } from './kernel.ts'

async function main(): Promise<void> {
  const { port, shutdown } = await bootKernel()
  const url = `http://127.0.0.1:${port}/`
  const res = await fetch(url)
  const text = await res.text()
  const ready = res.status === 200 || res.status === 401
  console.log(`SSiD boot ${ready ? 'OK' : 'FAILED'}: ${url} -> HTTP ${res.status} (${text.length} bytes)`)
  if (ready) {
    console.log(text.slice(0, 160))
    await shutdown(0)
  } else {
    console.error(text.slice(0, 400))
    await shutdown(1)
  }
}

main().catch((cause: unknown) => {
  console.error('SSiD boot FAILED:', cause instanceof Error ? cause.stack ?? cause.message : String(cause))
  process.exit(1)
})

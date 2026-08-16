/**
 * SSiD 壳 —— DSH 内核子进程入口。
 *
 * boot DSH web profile 后打印就绪端口并保持运行，等父进程（electron）加载。
 */

import { bootKernel } from './kernel.ts'

const { port } = await bootKernel()
// 明确标记，父进程解析这一行拿到端口。保持运行：webServer 在 listen。
console.log(`SSID_READY port=${port}`)

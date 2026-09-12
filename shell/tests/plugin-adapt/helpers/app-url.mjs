/**
 * 取「另一个实例」的完整地址（含当前 launch token）。
 *
 * 为什么需要它：本目录的探针分两类。多数访问的是通过 CDP（默认 9222）连上的
 * 那个实例，用 helpers/ssid.ts 的 findDshPage() 就能从页面 URL 拿到含 token 的
 * 地址。但 rc1-clean 探针访问的是**另一个 profile 的独立实例**（默认 3083），
 * 与 CDP 连的不是同一个，所以推不出它的地址。
 *
 * 而 launch token 每次进程启动都变（见笔记 2026-08-24-browser-token-authentication：
 * token 从不持久化），所以它只能由调用者按当前值提供——写死在文件里既跑不通
 * 也不该进仓库。
 *
 * 用法：
 *   SSID_APP_URL='http://127.0.0.1:3083/?token=<当前 token>' node probe-3083.mjs
 */

const raw = process.env.SSID_APP_URL

if (raw === undefined || raw === '') {
  console.error('[app-url] 需要 SSID_APP_URL，形如 http://127.0.0.1:3083/?token=<当前 token>')
  console.error('[app-url] 从 rc1-clean 实例的窗口地址栏取当前值（token 每次启动都会变）。')
  process.exit(2)
}

/** 完整地址，含 token。 */
export const APP_URL = raw

/** 同一实例的源（协议 + 主机 + 端口），用于拼接同源的相对路径。 */
export const APP_ORIGIN = new URL(raw).origin

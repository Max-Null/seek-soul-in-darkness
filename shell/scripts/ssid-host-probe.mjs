#!/usr/bin/env node
/**
 * 问思灵的 Host「你现在广播了哪些客户端插件批（combo）」。
 *
 * ## 为什么需要它
 *
 * 装版思灵的页面跑在 `dsh-app://` 自定义协议下，Host 是 `127.0.0.1` 上的私有端口，
 * 且**只认壳注入的认证 cookie**（壳在启动时用 launch token 换一枚签名 cookie，
 * 之后每个转发请求都由壳加上它，`apps/desktop/src/web-document.ts:forwardWebRequest`）。
 * 于是「控制台报 `plugins/??…&rev=…` 加载失败」这类问题，直接 curl 会得到
 * 401/404 的混合噪声，**分不清「`/plugins` 路由没注册」与「这个组合没被广播」**——
 * 而这两种情况的处置完全不同。
 *
 * 本脚本用本机 `$DSH_HOME/.credentials.yaml` 里 `client-connection/browser-session`
 * 的签名密钥自签一枚 cookie（与 Host 的校验算法同源，
 * `packages/client/connection/src/browser-auth.ts`），于是可以**只读**地问 Host。
 *
 * ## 能回答
 *
 * - `manifest`：当前广播的 combo 批次（项数 + rev）与单行 URL 数量。
 * - `rows`：每个插件的单行 URL（`plugins/??<id>/client.js&rev=<rowRev>`）是否 200。
 * - `check <url>`：任意 `/plugins` URL 的状态码与字节数。
 *
 * ## 判据
 *
 * `ClientModuleRegistry.bundleResource()`（`packages/client/modules/src/index.ts`）只服务
 * **当前批 / 上一批 / 精确 chunk URL**，其余一律 404。所以：
 * 「某个批 URL 404 且不在 `manifest` 列出的当前广播里」= **请求它的页面手上那份批已经过期**
 * （典型成因：实例启动后 profile 声明被改写，插件集变化使批重新分组）。
 * 组合与 rev **两者都必须完全一致**：同 rev 换了组合、同组合换了 rev，都是 404。
 *
 * ## 答不了
 *
 * 页面手上那份 manifest 的内容（要读页面的 console/network）、是谁改写了 profile 声明、
 * 以及历史批的组成——本脚本只反映「此刻 Host 在广播什么」。
 *
 * ## 用法
 *
 * ```sh
 * node ssid-host-probe.mjs manifest [--port 19388] [--home <dir>]
 * node ssid-host-probe.mjs rows     [--port 19388]
 * node ssid-host-probe.mjs check "plugins/??<id>/client.js&rev=<rev>"
 * ```
 *
 * `--home` 默认 `$DSH_HOME`，未设则 `~/.dsh`。`--port` 默认 `19388`（装版 Host 的默认端口）。
 * 退出码：`0` 正常；`1` 命中问题（`check` 非 200、或 `rows` 有行不是 200）；`2` 用法或环境错误。
 */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createHash, createHmac } from 'node:crypto'

const EXIT_OK = 0
const EXIT_PROBLEM = 1
const EXIT_USAGE = 2

/** 浏览器会话密钥在凭据文档里的记录键。 */
const AUTH_RECORD = 'client-connection/browser-session'

/** cookie 名与载荷版本，取自 Host 侧的 browser-auth 实现。 */
const COOKIE_PREFIX = 'dsh-auth-'
const COOKIE_PAYLOAD_VERSION = 1

/** 自签 cookie 的有效期；远短于 Host 的 maxAge 上限，故不会因超限被拒。 */
const COOKIE_LIFETIME_MILLISECONDS = 24 * 60 * 60 * 1000

function usage(message) {
  if (message !== undefined) console.error(`错误：${message}`)
  console.error('用法：node ssid-host-probe.mjs <manifest|rows|check> [参数] [--port <n>] [--home <dir>]')
  process.exit(EXIT_USAGE)
}

/** 解析 `--name value` 形式的参数；未知位置参数保持顺序返回。 */
function parseArgs(argv) {
  const positional = []
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) {
      positional.push(token)
      continue
    }
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) usage(`缺少 ${token} 的值`)
    options[token.slice(2)] = value
    index += 1
  }
  return { positional, options }
}

/**
 * 读出浏览器会话签名密钥。
 * @param home - DSH 主目录。
 * @returns 32 字节密钥。
 */
function readSessionSecret(home) {
  const path = join(home, '.credentials.yaml')
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    usage(`读不到凭据文档 ${path}：${error.message}`)
  }
  const matched = new RegExp(`${AUTH_RECORD}:[\\s\\S]*?secret:\\s*([A-Za-z0-9_-]+)`, 'u').exec(text)
  if (matched === null) usage(`凭据文档里没有 ${AUTH_RECORD} 的 secret（Host 尚未在该 home 下 mint 过会话）`)
  const secret = Buffer.from(matched[1].replaceAll('-', '+').replaceAll('_', '/'), 'base64')
  if (secret.byteLength !== 32) usage(`凭据文档里的 secret 长度异常（${String(secret.byteLength)} 字节，应为 32）`)
  return secret
}

function base64Url(value) {
  return Buffer.from(value).toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
}

/**
 * 按 Host 的校验算法自签一枚 authority 绑定的会话 cookie。
 * @param authority - 请求的 `host` 头，形如 `127.0.0.1:19388`。
 * @param secret - 浏览器会话签名密钥。
 * @returns `name=value` 形式的 Cookie 头值。
 */
function signCookie(authority, secret) {
  const issuedAt = Date.now()
  const payload = {
    version: COOKIE_PAYLOAD_VERSION,
    authority,
    issuedAt,
    expiresAt: issuedAt + COOKIE_LIFETIME_MILLISECONDS,
  }
  const body = base64Url(Buffer.from(JSON.stringify(payload), 'utf8'))
  const signature = base64Url(createHmac('sha256', secret).update(body).digest())
  const name = COOKIE_PREFIX + base64Url(createHash('sha256').update(authority).digest())
  return `${name}=v1.${body}.${signature}`
}

/**
 * 取回 Host 的 index 文档（其中的 boot 清单列出当前广播的每个 combo）。
 * @param port - Host 端口。
 * @param secret - 浏览器会话签名密钥。
 * @returns index HTML。
 */
async function fetchIndex(port, secret) {
  const authority = `127.0.0.1:${String(port)}`
  const response = await fetch(`http://${authority}/`, { headers: { cookie: signCookie(authority, secret) } })
  if (response.status !== 200) {
    usage(`GET http://${authority}/ 返回 ${String(response.status)}；端口或 home 不对（未认证请求一律 401）`)
  }
  return await response.text()
}

/**
 * 从 index HTML 里取出文档相对的 combo 引用。
 * @param html - index HTML。
 * @returns 批引用与单行引用。
 */
function readReferences(html) {
  const all = [...new Set([...html.matchAll(/plugins\/\?\?[^"'\s<>)]+/gu)].map(match => match[0]))]
    // 索引文档里同时内联着构建客户端引用的脚本源码（`plugins/??${…}&rev=${rev}`），
    // 那些模板不是真实引用；真实引用的 rev 恒为 12 位十六进制。
    .filter(reference => !reference.includes('${') && /&rev=[0-9a-f]{12}$/u.test(reference))
  const ids = reference => reference.split('&rev=')[0].split('??')[1].split(',')
  return {
    batches: all.filter(reference => ids(reference).length > 1),
    singles: all.filter(reference => ids(reference).length === 1),
  }
}

function describeBatch(reference) {
  const [list, rev] = reference.split('&rev=')
  const packages = list.split('??')[1].split(',')
  return { rev, count: packages.length, packages, reference }
}

/** 归一化用户给的 URL：接受 `dsh-app://app/...`、绝对 URL 或裸路径。 */
function normalizePath(input) {
  const withoutScheme = input.replace(/^dsh-app:\/\/[^/]*\//u, '').replace(/^\/+/u, '')
  return withoutScheme.startsWith('plugins/') ? withoutScheme : `plugins/${withoutScheme}`
}

async function fetchResource(port, secret, path) {
  const authority = `127.0.0.1:${String(port)}`
  const response = await fetch(`http://${authority}/${path}`, {
    headers: { cookie: signCookie(authority, secret) },
  })
  const body = Buffer.from(await response.arrayBuffer())
  return { status: response.status, bytes: body.byteLength }
}

const { positional, options } = parseArgs(process.argv.slice(2))
const command = positional[0]
if (command === undefined) usage('缺少子命令')
const port = Number.parseInt(options.port ?? '19388', 10)
if (!Number.isSafeInteger(port) || port <= 0 || port > 65535) usage(`--port 非法：${String(options.port)}`)
const home = options.home ?? process.env.DSH_HOME ?? join(homedir(), '.dsh')
const secret = readSessionSecret(home)

if (command === 'manifest') {
  const references = readReferences(await fetchIndex(port, secret))
  console.log(`Host 127.0.0.1:${String(port)} 当前广播：`)
  for (const reference of references.batches.map(describeBatch)) {
    console.log(`  批  rev=${reference.rev}  ${String(reference.count)} 项`)
  }
  console.log(`  单行引用 ${String(references.singles.length)} 条`)
  process.exit(EXIT_OK)
}

if (command === 'check') {
  const target = positional[1]
  if (target === undefined) usage('check 需要给出要核对的 URL')
  const path = normalizePath(target)
  const { status, bytes } = await fetchResource(port, secret, path)
  const [list, rev] = path.split('&rev=')
  const packages = list.split('??')[1]?.split(',') ?? []
  console.log(`rev=${String(rev)}  ${String(packages.length)} 项  →  HTTP ${String(status)}  ${String(bytes)} 字节`)
  if (status !== 200) {
    console.log('判据：非 200 表示这份组合不在「当前批 / 上一批」里，即请求它的页面手上那份批已过期。')
    process.exit(EXIT_PROBLEM)
  }
  process.exit(EXIT_OK)
}

if (command === 'rows') {
  const references = readReferences(await fetchIndex(port, secret))
  let failures = 0
  for (const single of references.singles) {
    const { status } = await fetchResource(port, secret, single)
    if (status !== 200) {
      failures += 1
      console.log(`  FAIL HTTP ${String(status)}  ${single}`)
    }
  }
  const total = references.singles.length
  console.log(`单行 URL：${String(total - failures)}/${String(total)} 返回 200`)
  process.exit(failures === 0 ? EXIT_OK : EXIT_PROBLEM)
}

usage(`未知子命令 ${command}`)

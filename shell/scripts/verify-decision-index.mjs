// 验证 docs/决策/index.html 生成物本身可用（不信任「写出成功」）
//
// 期望值全部**动态锚定**到目录里实际的 .md 文件数，避免每新增一篇决策记录就要改验证器。
//
// 用法：node shell/scripts/verify-decision-index.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const DEC_DIR = path.join(REPO, 'docs', '决策');
const HTML = path.join(DEC_DIR, 'index.html');

if (!fs.existsSync(HTML)) {
  console.error(`\n  ✗ 找不到 ${HTML}\n    先跑：node shell/scripts/build-decision-index.mjs\n`);
  process.exit(2);
}
const html = fs.readFileSync(HTML, 'utf8');
const nFiles = fs.readdirSync(DEC_DIR).filter((f) => f.endsWith('.md')).length;
let fail = 0;
const ok = (c, msg) => { console.log((c ? '  ✓ ' : '  ✗ ') + msg); if (!c) fail++; };

// 1. 取出内联 script
const sm = html.match(/<script>([\s\S]*?)<\/script>/);
ok(!!sm, '找到内联 <script> 块');
const js = sm[1];

// 2. 语法检查（把超大 DATA 换成占位符再解析，避免逐个 token 解析 1MB）
// DATA 是**单行**（JSON.stringify 会把正文换行转义成 \n 两字符，已实测确认），
// 所以用单行贪婪提取；早先用 `;\n` 的非贪婪正则会吃到 PAGE_JS 里的 `;\n`，把代码当 JSON。
const DATA_RE = /^var DATA=(.+);$/m;
const dm = js.match(DATA_RE);
const slim = js.replace(DATA_RE, 'var DATA={entries:[],totalBytes:0,generatedAt:"1970-01-01T00:00:00.000Z"};');
ok(!!dm, 'DATA 字面量按单行成功定位');
ok(slim.length < js.length, `DATA 字面量已被剥离（${js.length} → ${slim.length} 字符）`);
try { new Function(slim); ok(true, '内联 JS 语法检查通过'); }
catch (e) { ok(false, '内联 JS 语法错误：' + e.message); }

// 3. 内联 DATA 能被 JSON.parse，且篇数与目录实际一致
let data = null;
if (dm) { try { data = JSON.parse(dm[1]); } catch (e) { ok(false, 'DATA JSON.parse 失败：' + e.message); } }
ok(!!data, 'DATA 可被 JSON.parse');
if (data) ok(data.entries.length === nFiles, `DATA 条数 = ${data.entries.length} == 目录实际 ${nFiles} 个 .md`);

// 4. JS 引用的 DOM id 必须全部存在于 HTML 里（否则 E("x") 会在运行时返回 null）
const ids = [...new Set([...slim.matchAll(/E\("([a-z]+)"\)/g)].map((m) => m[1]))];
const missing = ids.filter((id) => !html.includes(`id="${id}"`));
ok(missing.length === 0, `JS 引用的 ${ids.length} 个 DOM id 全部存在${missing.length ? '，缺：' + missing.join(',') : ''}`);

// 5. 提取 md() 函数源码（括号配对扫描）并真的对全部正文跑一遍
const at = js.indexOf('function md(src){');
let depth = 0, end = -1;
for (let p = js.indexOf('{', at); p < js.length; p++) {
  if (js[p] === '{') depth++;
  else if (js[p] === '}') { depth--; if (depth === 0) { end = p + 1; break; } }
}
ok(end > at, `提取到 md() 源码 ${end - at} 字符`);
// md() 是 IIFE 内部函数，依赖同作用域的 esc()，必须一并取出，否则单独 eval 会 ReferenceError
const escAt = js.indexOf('var esc=');
const escLine = js.slice(escAt, js.indexOf('\n', escAt));
ok(escAt > 0 && /esc=function/.test(escLine), '一并提取到 esc() 依赖');
let md = null;
try { md = new Function(escLine + '\nreturn ' + js.slice(at, end))(); ok(typeof md === 'function', 'md() 可实例化'); }
catch (e) { ok(false, 'md() 提取/实例化失败：' + e.message); }

if (md && data) {
  const N = data.entries.length;
  let empty = 0, rawScript = 0, withHeading = 0, withTable = 0, withFence = 0, totalH = 0;
  const t0 = Date.now();
  for (const e of data.entries) {
    const out = md(e.body);
    if (!out || out.length < 20) empty++;
    if (/<script/i.test(out)) rawScript++;              // 正文里的 <script> 必须被转义
    if (/<h[1-6]>/.test(out)) withHeading++;
    if (/<table>/.test(out)) withTable++;
    if (/<pre><code>/.test(out)) withFence++;
    totalH += out.length;
  }
  const ms = Date.now() - t0;
  ok(empty === 0, `${N} 篇渲染均非空（空/过短 ${empty} 篇）`);
  ok(rawScript === 0, `渲染输出中未转义的 <script 出现 ${rawScript} 次（须为 0）`);
  ok(withHeading >= N - 2, `渲染出标题的 ${withHeading} 篇（共 ${N} 篇）`);
  ok(ms < 5000, `渲染 ${N} 篇耗时 ${ms} ms（无死循环；曾因段落分支不推进 i 而 120 s 超时）`);
  console.log(`  · 参考：含表格 ${withTable} 篇 / 含代码块 ${withFence} 篇 / 渲染后总长 ${(totalH / 1024 / 1024).toFixed(2)} MB`);
}

console.log(`\n  ${fail === 0 ? '全部通过' : fail + ' 项失败'}\n`);
process.exit(fail ? 1 : 0);

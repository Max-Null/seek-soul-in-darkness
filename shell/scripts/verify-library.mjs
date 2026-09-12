/**
 * 图书馆验证器
 *
 * **三个库同源**（dsh-anatomy / dsh-skills / seek-soul-in-darkness），内容应逐字一致；
 * 改动其中一份时要同步另外两份 —— 否则会出现「甲库验证通过、乙库实际已坏」。
 *
 * 它验的是**图书馆这个产物**，不是库的内容：
 *   - 内联脚本语法、DATA 可解析、篇数、分类齐全
 *   - **frontmatter 已被剥离**（SKILL.md 特有，漏剥会被渲染器当正文）
 *   - **真跑一遍页面脚本**：卡片数 == 篇数、列表与详情无 undefined 类名/文本
 *
 * 为什么必须真跑：class 里的 undefined 之类是**运行时才拼出来的**，静态搜 HTML 查不到 ——
 * 这条是本库的验证器被写出来的直接原因（曾因此漏过一个会渲染成 undefined 的缺陷）。
 *
 * 用法：node verify-library.mjs [库目录] [期望篇数]
 *   不带参数时验证本文件所在的库。
 */
// 图书馆验证器（通用）：真跑页面脚本，不靠静态搜索
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 不带参数时验证**本文件所在的库** —— 这样每个库收一份就自成闭环，不用记路径
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = process.argv[2] ?? HERE;
const EXPECT = process.argv[3] ? Number(process.argv[3]) : null;

const HTML = path.join(DIR, 'index.html');
if (!fs.existsSync(HTML)) { console.error('  ✗ 找不到 ' + HTML); process.exit(2); }
const html = fs.readFileSync(HTML, 'utf8');

let fail = 0;
const ok = (c, msg) => { console.log((c ? '  ✓ ' : '  ✗ ') + msg); if (!c) fail++; };

// 1. 内联脚本语法
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const DATA_RE = /^var DATA=(.+);$/m;
ok(!!js.match(DATA_RE), 'DATA 单行可定位');
const slim = js.replace(DATA_RE, 'var DATA={entries:[],totalBytes:0,generatedAt:"1970-01-01T00:00:00.000Z"};');
try { new Function(slim); ok(true, '内联 JS 语法通过'); } catch (e) { ok(false, '语法错误：' + e.message); }

// 2. DATA 可解析
const data = JSON.parse(js.match(DATA_RE)[1]);
ok(Array.isArray(data.entries), `DATA 可解析：${data.entries.length} 篇`);
if (EXPECT) ok(data.entries.length === EXPECT, `篇数 == ${EXPECT}`);

// 3. frontmatter 必须已被剥离（body 不得以 --- 开头）
const fmLeft = data.entries.filter((e) => /^\s*---\r?\n/.test(e.body));
ok(fmLeft.length === 0, `frontmatter 已剥离（残留 ${fmLeft.length} 篇）${fmLeft.length ? '：' + fmLeft.slice(0, 3).map((e) => e.file).join(', ') : ''}`);

// 4. 分类齐全（字段名在两个世代里不同：母版 SSiD 用 statusKind，派生版用 group）
const groupOf = (e) => e.group ?? e.statusKind ?? '?';
const groups = [...new Set(data.entries.map(groupOf))];
ok(groups.length > 0, `分类：${groups.join(' / ')}`);

// 5. 真跑页面脚本（静态搜不到运行时才拼出的内容）
const els = {};
const mk = (id) => ({ id, innerHTML: '', value: '', hidden: false, _h: {},
  addEventListener(t, f) { (this._h[t] = this._h[t] || []).push(f); }, focus() {}, blur() {},
  hasAttribute: () => false, getAttribute: () => null });
const doc = { getElementById: (id) => els[id] || (els[id] = mk(id)), addEventListener(t, f) { if (t === 'click') (doc._c = doc._c || []).push(f); }, activeElement: null };
try {
  new Function('document', 'window', 'location', 'history', js)(doc, { addEventListener() {} }, { hash: '', pathname: '/', search: '' }, { replaceState() {} });
  const list = els.list?.innerHTML ?? '';
  const n = (list.match(/data-file=/g) || []).length;
  ok(n === data.entries.length, `列表渲染 ${n} 张卡片 == ${data.entries.length} 篇`);
  ok(!/class="[^"]*undefined/.test(list), '列表无 undefined 类名');
  ok(!/>undefined</.test(list), '列表无 undefined 文本');

  // 详情页（取第一篇）
  const first = data.entries[0];
  const fake = { hasAttribute: (a) => a === 'data-file', getAttribute: () => first.file };
  (doc._c || []).forEach((f) => f({ target: { closest: () => fake } }));
  const det = els.detail?.innerHTML ?? '';
  ok(/>undefined</.test(det) === false, '详情页无 undefined 文本');
  ok(det.includes(groupOf(first)), `详情页显示分类「${groupOf(first)}」`);
  ok(/<h2>/.test(det), '详情页渲染出标题');
} catch (e) {
  ok(false, '页面脚本执行抛错：' + e.message.split('\n')[0]);
}

console.log(`\n  ${fail === 0 ? '全部通过' : fail + ' 项失败'}  （${path.basename(DIR)}）\n`);
process.exit(fail ? 1 : 0);

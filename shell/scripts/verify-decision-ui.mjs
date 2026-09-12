// 行为验证：用迷你 DOM shim 真跑 docs/决策/index.html 的页面逻辑
//
// 关键设计：期望值**动态计算**，不硬编码篇数 —— 否则每新增一篇决策记录验证器就得改。
//   · 总数锚定到目录里实际的 .md 文件数（独立于构建器自身的统计，能抓到漏纳）
//   · 筛选期望值由内联 DATA 现算，验证的是「渲染/筛选逻辑」对不对，而非抄来的数字
//
// 用法：node shell/scripts/verify-decision-ui.mjs
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
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// ── 迷你 DOM shim ────────────────────────────────────────────────
const els = {};
function makeEl(id) {
  const h = {};
  return {
    id, innerHTML: '', value: '', hidden: false, _h: h,
    addEventListener(t, fn) { (h[t] = h[t] || []).push(fn); },
    focus() {}, blur() {}, hasAttribute: () => false, getAttribute: () => null,
  };
}
const clickHandlers = [];
const documentShim = {
  getElementById: (id) => els[id] || (els[id] = makeEl(id)),
  addEventListener: (t, fn) => { if (t === 'click') clickHandlers.push(fn); },
  activeElement: null,
};
const locationShim = { hash: '', pathname: '/index.html', search: '' };
// replaceState 必须真写回 hash，否则「深链是否写入」这条断言恒为假（shim 的局限，不是页面 bug）
const historyShim = {
  replaceState(_state, _title, url) {
    const i = String(url).indexOf('#');
    locationShim.hash = i >= 0 ? String(url).slice(i) : '';
  },
};
const windowShim = { addEventListener() {} };

let fail = 0;
const ok = (c, msg) => { console.log((c ? '  ✓ ' : '  ✗ ') + msg); if (!c) fail++; };
const count = (s, re) => (s.match(re) || []).length;

// ── 独立锚定：目录里真实的 .md 文件数 ────────────────────────────
const nFiles = fs.readdirSync(DEC_DIR).filter((f) => f.endsWith('.md')).length;
const data = JSON.parse(js.match(/^var DATA=(.+);$/m)[1]);
ok(data.entries.length === nFiles, `索引纳入 ${data.entries.length} 篇 == 目录实际 ${nFiles} 个 .md`);
const N = data.entries.length;
const expOf = (kind) => data.entries.filter((e) => e.statusKind === kind).length;

// 用真实 DATA 跑完整页面脚本
try {
  new Function('document', 'window', 'location', 'history', js)(documentShim, windowShim, locationShim, historyShim);
  ok(true, '页面脚本在 shim 环境下执行无异常');
} catch (e) { ok(false, '页面脚本执行抛错：' + e.message); }

// ── 静态断言 ─────────────────────────────────────────────────────
ok(new RegExp(N + ' 篇').test(els.stat.innerHTML), `侧栏统计：${els.stat.innerHTML.replace(/<[^>]+>/g, '')}`);
ok(count(els.fst.innerHTML, /class="chip/g) === 5, `状态筛选 5 个 chip（实测 ${count(els.fst.innerHTML, /class="chip/g)}）`);
ok(count(els.fym.innerHTML, /class="chip/g) >= 2, `月份筛选 ${count(els.fym.innerHTML, /class="chip/g)} 个 chip`);
ok(count(els.ftag.innerHTML, /class="chip/g) === 26, `标签筛选 ${count(els.ftag.innerHTML, /class="chip/g)} 个 chip（Top 26）`);
ok(count(els.list.innerHTML, /data-file=/g) === N, `初始列表 ${count(els.list.innerHTML, /data-file=/g)} 张卡片（期望 ${N}）`);
ok(new RegExp('共 ' + N + ' 篇').test(els.hint.innerHTML), '提示行显示总数');

// ── 交叉断言：筛选后的条数必须等于按同一数据现算的期望值 ──────────
function click(attr, val) {
  const fake = { hasAttribute: (a) => a === attr, getAttribute: () => val };
  clickHandlers.forEach((fn) => fn({ target: { closest: () => fake } }));
  return count(els.list.innerHTML, /data-file=/g);
}
for (const kind of ['进行中', '已完成', '已决策', '未标注']) {
  const got = click('data-st', kind);
  const exp = expOf(kind);
  ok(got === exp, `点「${kind}」筛出 ${got} 条 == 期望 ${exp}`);
}
click('data-st', '未标注'); // 取消勾选

// ── 搜索（含 140ms debounce）─────────────────────────────────────
els.q.value = 'ffmpeg';
els.q._h.input[0].call(els.q);
await new Promise((r) => setTimeout(r, 260));
const nSearch = count(els.list.innerHTML, /data-file=/g);
ok(nSearch > 0 && nSearch < N, `搜索「ffmpeg」筛出 ${nSearch} 条（0 < n < ${N}）`);
ok(/<mark>/.test(els.list.innerHTML), '搜索结果含关键词高亮 <mark>');
ok(!/data-file=/.test(els.list.innerHTML) || nSearch < N, '搜索结果确实被收窄');

// 搜索命中数必须与对同一数据现算的结果一致
const expSearch = data.entries.filter((e) => (e.title + ' ' + e.body + ' ' + e.tags.join(' ')).toLowerCase().includes('ffmpeg')).length;
ok(nSearch === expSearch, `搜索命中 ${nSearch} 条 == 期望 ${expSearch}（大小写不敏感全文匹配）`);

els.q.value = '';
els.q._h.input[0].call(els.q);
await new Promise((r) => setTimeout(r, 260));
ok(count(els.list.innerHTML, /data-file=/g) === N, `清空搜索后恢复 ${N} 条`);

// ── 深链：点开一篇 → 详情渲染 ────────────────────────────────────
const sample = data.entries.find((e) => e.statusKind === '进行中') || data.entries[0];
click('data-file', sample.file);
ok(count(els.detail.innerHTML, /<h2>/) === 1, '点开条目后详情页渲染出唯一 h2');
ok(els.detail.innerHTML.includes(sample.title.slice(0, 12).replace(/[<>&]/g, '')), '详情标题正确');
ok(els.detail.innerHTML.includes(sample.statusKind), `详情显示状态「${sample.statusKind}」`);
ok(/<blockquote>/.test(els.detail.innerHTML) || /<h[23]>/.test(els.detail.innerHTML), '正文结构渲染（blockquote 或标题）');
ok(/查看原始 markdown/.test(els.detail.innerHTML), '保留原始 markdown 折叠入口');
ok(locationShim.hash.includes(encodeURIComponent(sample.file)), `深链写入 hash：${decodeURIComponent(locationShim.hash)}`);

console.log(`\n  ${fail === 0 ? '全部通过' : fail + ' 项失败'}\n`);
process.exit(fail ? 1 : 0);

import { chromium } from '@playwright/test';

const TITLE = '会话历史加载失败原因';
const MARK = '加载更早'; // 该会话内容区特征文本
const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const pages = b.contexts()[0]?.pages() ?? [];
const p = pages.find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()));
if (!p) { console.log('NO_PAGE'); await b.close(); process.exit(1); }

const logs = [];
p.on('console', (m) => logs.push({ level: m.type(), text: m.text() }));
const responses = [];
p.on('response', (r) => { if (r.status() >= 400) responses.push({ url: r.url().slice(-90), status: r.status() }); });

// 1) 先切到「新会话」（清空内容区）
try {
  const nc = p.getByRole('button', { name: /新建会话/ }).first();
  if (await nc.count()) { await nc.click({ timeout: 4000 }); console.log('SWITCHED_TO_NEW'); }
} catch (e) { console.log('NEW_SESSION_CLICK_ERR'); }
await p.waitForTimeout(1200);

// 前置断言：内容区应已无大会话特征文本（确保起始干净）
const pre = await p.evaluate((m) => (document.body.innerText || '').includes(m), MARK);
console.log('PRE_CLEAN:', !pre ? 'OK(无MARK)' : 'WARN(还有MARK——新会话切换未生效)');
if (pre) await p.waitForTimeout(2000);

// 2) 侧边栏列表里点击大会话条目（DOM 精准点击）
const clicked = await p.evaluate((t) => {
  const list = document.querySelector('[data-slot="sidebar.workspaces"], .bhn1Oq_list, aside');
  if (!list) return 'NO_LIST';
  const els = [...list.querySelectorAll('li, [data-slot], button, div')].filter((el) => (el.textContent || '').includes(t) && el.offsetWidth > 0);
  if (els.length === 0) return 'NO_ENTRY';
  let target = els[els.length - 1];
  // 找到最小可点击祖先（li/button）或直接用最小元素
  for (const el of els) { if (el.tagName === 'LI' || el.tagName === 'BUTTON' || el.getAttribute('data-slot')) target = el; }
  target.click();
  return 'CLICKED:' + target.tagName + '.' + (target.className || '').toString().slice(0, 30);
}, TITLE);
console.log('CLICK:', clicked);

// 3) 计时轮询：内容区出现该会话特征文本
const t0 = Date.now();
let done = false, elapsed = 0;
for (let i = 0; i < 80; i++) {
  await new Promise((r) => setTimeout(r, 400));
  elapsed = Date.now() - t0;
  const state = await p.evaluate((m) => {
    const body = document.body.innerText || '';
    const inContent = body.includes(m);
    const conv = document.querySelector('[data-slot="conversation"]');
    return { inContent, convLen: conv ? (conv.innerText || '').length : -1 };
  }, MARK);
  if (state.inContent && state.convLen > 100) { done = true; break; }
  if (elapsed > 30000) break;
}
console.log('LOADED:', done, 'elapsed_ms:', elapsed, '<=12000:', elapsed <= 12000);
const errs = logs.filter((l) => l.level === 'error' || l.level === 'exception');
console.log('CONSOLE_ERRORS:', errs.length);
errs.slice(0, 5).forEach((x) => console.log('ERR>', x.text.slice(0, 150)));
console.log('HTTP_4xx:', JSON.stringify(responses.slice(0, 6)));
await b.close();

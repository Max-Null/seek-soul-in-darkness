import { chromium } from '@playwright/test';

const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const pages = b.contexts()[0]?.pages() ?? [];
const p = pages.find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()));
const logs = [];
p.on('console', (m) => logs.push({ level: m.type(), text: m.text().slice(0, 260) }));
p.on('pageerror', (e) => logs.push({ level: 'pageerror', text: String(e).slice(0, 260) }));
await p.reload({ waitUntil: 'load' }).catch(() => {});
await new Promise((r) => setTimeout(r, 5000));
await p.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].filter((x) => (x.textContent || '').trim() === '设置');
  if (btns.length) btns[0].click();
});
await new Promise((r) => setTimeout(r, 1400));
// 打开设置页插件 tab
await p.evaluate(() => {
  const items = [...document.querySelectorAll('button, [role="tab"], li')].filter((x) => (x.textContent || '').trim() === '插件');
  if (items.length) items[items.length - 1].click();
});
await new Promise((r) => setTimeout(r, 1200));
const hasCard = await p.evaluate(() => (document.body.innerText || '').includes('使用官方轮次导航条'));
console.log('HAS_CARD:', hasCard);
const errs = logs.filter((x) => x.level === 'error' || x.level === 'exception' || x.level === 'pageerror' || /chat-rail|rail|settingsScope|pending|failed/i.test(x.text));
console.log('PROBLEM_LOGS:', errs.length);
errs.slice(0, 10).forEach((x) => console.log('>', x.level, x.text.slice(0, 240)));
await b.close();

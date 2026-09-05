import { chromium } from '@playwright/test';

const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const pages = b.contexts()[0]?.pages() ?? [];
const p = pages.find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()));
if (!p) { console.log('NO_PAGE'); await b.close(); process.exit(1); }
await p.waitForTimeout(2500);
const logs = [];
p.on('console', (m) => logs.push(m.text().slice(0, 200)));

// 1) 打开设置页（侧边栏「设置」按钮）→ 插件页 → 找 chat-rail 卡片
let settingsClick = false;
try {
  const s = p.getByText('设置', { exact: true }).first();
  if (await s.count()) { await s.click({ timeout: 5000 }); settingsClick = true; }
} catch {}
await p.waitForTimeout(1500);
const card = await p.evaluate(() => {
  const body = document.body.innerText || '';
  const hasCard = body.includes('使用官方轮次导航条') || body.includes('official turn navigation');
  const cb = [...document.querySelectorAll('input[type="checkbox"]')].filter((i) => {
    const parent = i.closest('label');
    return parent && /官方轮次导航|official turn navigation/i.test(parent.textContent || '');
  })[0];
  return { hasCard, cbFound: !!cb, cbChecked: cb instanceof HTMLInputElement ? cb.checked : null };
});
console.log('SETTINGS_CLICK:', settingsClick);
console.log('CARD:', JSON.stringify(card));

// 2) 打开大会话（rail 出现前提）
try { await p.getByText(/新建会话/).first().click({ timeout: 4000 }); } catch {}
await new Promise((r) => setTimeout(r, 900));
try {
  const expand = p.getByText(/展开其余/).first();
  if (await expand.count()) { await expand.click({ timeout: 3000 }); await p.waitForTimeout(500); }
} catch {}
await p.evaluate(() => {
  const list = document.querySelector('[data-slot="sidebar.workspaces"], .bhn1Oq_list, aside');
  if (!list) return;
  const els = [...list.querySelectorAll('li, [data-slot], button, div')].filter((el) => (el.textContent || '').includes('会话历史加载失败原因') && el.offsetWidth > 0);
  if (els.length) els[els.length - 1].click();
});
await p.waitForTimeout(3500);

const state = async () => p.evaluate(() => {
  const rail = document.querySelector('.crl_nav');
  const official = document.querySelector('nav[aria-label="轮次导航"], nav[aria-label="Turn navigation"]');
  const hideStyle = document.querySelector('style[data-crl-hide-official]');
  const rowBtns = document.querySelectorAll('[data-crl-star]').length;
  return {
    railVisible: rail !== null && getComputedStyle(rail).display !== 'none',
    officialVisible: official !== null && getComputedStyle(official).display !== 'none',
    hideStyleInjected: hideStyle !== null,
    rowBtns,
  };
});
console.log('DEFAULT:', JSON.stringify(await state()));

// 3) 回设置页切换开关 → 回会话验证官方模式
try {
  const s = p.getByText('设置', { exact: true }).first();
  if (await s.count()) await s.click({ timeout: 5000 });
} catch {}
await p.waitForTimeout(1200);
const toggled = await p.evaluate(() => {
  const cb = [...document.querySelectorAll('input[type="checkbox"]')].filter((i) => {
    const parent = i.closest('label');
    return parent && /官方轮次导航|official turn navigation/i.test(parent.textContent || '');
  })[0];
  if (cb instanceof HTMLInputElement) { cb.click(); return true; }
  return false;
});
console.log('TOGGLE:', toggled);
await p.waitForTimeout(800);
await p.evaluate(() => {
  const list = document.querySelector('[data-slot="sidebar.workspaces"], .bhn1Oq_list, aside');
  if (!list) return;
  const els = [...list.querySelectorAll('li, [data-slot], button, div')].filter((el) => (el.textContent || '').includes('会话历史加载失败原因') && el.offsetWidth > 0);
  if (els.length) els[els.length - 1].click();
});
await p.waitForTimeout(3500);
console.log('OFFICIAL_MODE:', JSON.stringify(await state()));
const errs = logs.filter((x) => /error|cannot|undefined/i.test(x));
console.log('ERRS:', errs.length, errs.slice(0, 3));
await b.close();

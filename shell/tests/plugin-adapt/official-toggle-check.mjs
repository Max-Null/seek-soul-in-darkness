import { chromium } from '@playwright/test';

const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const pages = b.contexts()[0]?.pages() ?? [];
const p = pages.find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()));
if (!p) { console.log('NO_PAGE'); await b.close(); process.exit(1); }
await p.waitForTimeout(2500);

// 先打开大会话（rail ≥2 条用户消息才显示）
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

// 打开设置面板（齿轮）
const gear = await p.evaluate(() => {
  const btn = document.querySelector('[aria-label="设置"], [aria-label="Settings"]');
  if (btn) { btn.click(); return true; }
  return false;
});
console.log('GEAR_CLICKED:', gear);
await p.waitForTimeout(400);
const panel = await p.evaluate(() => {
  const el = document.querySelector('.crl_settingsPanel');
  const cb = el?.querySelector('input[type="checkbox"]');
  return { panel: !!el, checkbox: !!cb, checked: cb instanceof HTMLInputElement ? cb.checked : null };
});
console.log('PANEL:', JSON.stringify(panel));

// 打开开关（官方模式）
const toggled = await p.evaluate(() => {
  const cb = document.querySelector('.crl_settingsPanel input[type="checkbox"]');
  if (cb instanceof HTMLInputElement) { cb.click(); return true; }
  return false;
});
console.log('TOGGLE_CLICKED:', toggled);
await p.waitForTimeout(800);
console.log('OFFICIAL_MODE:', JSON.stringify(await state()));

// 切回（chat-rail 模式）
await p.evaluate(() => {
  const cb = document.querySelector('.crl_settingsPanel input[type="checkbox"]');
  if (cb instanceof HTMLInputElement) cb.click();
});
await p.waitForTimeout(800);
console.log('BACK_RAIL_MODE:', JSON.stringify(await state()));

// 重启持久化验证：写入 state（再次切官方模式——持久化由 settings API 保存）
await p.evaluate(() => { const cb = document.querySelector('.crl_settingsPanel input[type="checkbox"]'); if (cb instanceof HTMLInputElement) cb.click(); });
await p.waitForTimeout(800);
console.log('PERSIST_CHECK(官方 again):', JSON.stringify(await state()));
await b.close();

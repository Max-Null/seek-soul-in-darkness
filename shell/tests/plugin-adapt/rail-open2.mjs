import { chromium } from '@playwright/test';

const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const pages = b.contexts()[0]?.pages() ?? [];
const p = pages.find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()));
if (!p) { console.log('NO_PAGE'); await b.close(); process.exit(1); }
// 点「插件更新: @max-null/dsh-plugin-center」会话（顶部可见）
try {
  const t = p.getByText('插件更新: @max-null/dsh-plugin-center').first();
  if (await t.count()) { await t.click({ timeout: 5000 }); console.log('CLICKED_PC_SESSION'); }
  else console.log('NOT_FOUND');
} catch (e) { console.log('ERR', String(e).slice(0, 100)); }
await p.waitForTimeout(4000);
const r = await p.evaluate(() => {
  const rail = document.querySelector('.crl_nav');
  const official = document.querySelector('nav[aria-label="轮次导航"], nav[aria-label="Turn navigation"]');
  return {
    railVisible: rail !== null && getComputedStyle(rail).display !== 'none',
    railItems: rail ? rail.querySelectorAll('[data-crl-index], .crl_item').length : -1,
    officialVisible: official !== null && getComputedStyle(official).display !== 'none',
    bodyHead: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 70),
  };
});
console.log('STATE:', JSON.stringify(r));
await b.close();

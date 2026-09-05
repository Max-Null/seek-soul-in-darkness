import { chromium } from '@playwright/test';

const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const pages = b.contexts()[0]?.pages() ?? [];
const p = pages.find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()));
if (!p) { console.log('NO_PAGE'); await b.close(); process.exit(1); }
// 点一个可见会话（顶部任一非「新会话」行）
const clicked = await p.evaluate(() => {
  const list = document.querySelector('[data-slot="sidebar.workspaces"], .bhn1Oq_list, aside');
  if (!list) return 'NO_LIST';
  const rows = [...list.querySelectorAll('[data-slot], li, button')].filter((el) => {
    const t = (el.textContent || '').trim();
    return t.length > 3 && !/^新会话$|^插件更新$|^工作区$|^设置$|^未分组$|^展开其余|^收起$|^收起其余/.test(t) && el.offsetWidth > 0;
  });
  if (!rows.length) return 'NO_ROWS:' + (list.className || '').toString().slice(0, 30);
  rows[0].click();
  return 'CLICKED:' + (rows[0].textContent || '').replace(/\s+/g, ' ').slice(0, 30);
});
console.log(clicked);
await p.waitForTimeout(3500);
const r = await p.evaluate(() => {
  const rail = document.querySelector('.crl_nav');
  const official = document.querySelector('nav[aria-label="轮次导航"], nav[aria-label="Turn navigation"]');
  return {
    railVisible: rail !== null && getComputedStyle(rail).display !== 'none',
    railItems: rail ? rail.querySelectorAll('[data-crl-index]').length : -1,
    officialVisible: official !== null && getComputedStyle(official).display !== 'none',
    bodyHead: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 60),
  };
});
console.log('STATE:', JSON.stringify(r));
await b.close();

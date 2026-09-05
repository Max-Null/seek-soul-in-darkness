import { chromium } from '@playwright/test';

const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const pages = b.contexts()[0]?.pages() ?? [];
const p = pages.find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()));
if (!p) { console.log('NO_PAGE'); await b.close(); process.exit(1); }

// 打开设置页（侧边栏底部第一个「设置」按钮——排除 quick-toolbar 面板内的）
await p.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].filter((x) => (x.textContent || '').trim() === '设置');
  if (btns.length) btns[0].click();
});
await p.waitForTimeout(1300);

// 点「插件」Tab（设置页内的 tab 按钮）
const tabClicked = await p.evaluate(() => {
  const tabs = [...document.querySelectorAll('button, [role="tab"]')].filter((x) => /^插件$|^Plugins$/i.test((x.textContent || '').trim()));
  if (tabs.length) { tabs[tabs.length - 1].click(); return 'CLICKED:' + tabs.length; }
  return 'NO_TAB:' + [...document.querySelectorAll('button')].map((x) => (x.textContent || '').trim().slice(0, 8)).filter(Boolean).slice(0, 12).join('|');
});
console.log('TAB:', tabClicked);
await p.waitForTimeout(1200);

const card = await p.evaluate(() => {
  const body = document.body.innerText || '';
  const cb = [...document.querySelectorAll('input[type="checkbox"]')].find((i) => {
    const parent = i.closest('label');
    return parent && /官方轮次导航|official turn navigation/i.test(parent.textContent || '');
  });
  return {
    textInPage: body.includes('使用官方轮次导航条') || body.toLowerCase().includes('official turn navigation'),
    cbFound: !!cb,
    cbChecked: cb instanceof HTMLInputElement ? cb.checked : null,
    bodySnip: body.replace(/\s+/g, ' ').slice(0, 160),
  };
});
console.log('CARD:', JSON.stringify(card, null, 1));

// 切换 → hideStyle 联动
const toggled = await p.evaluate(() => {
  const cb = [...document.querySelectorAll('input[type="checkbox"]')].find((i) => {
    const parent = i.closest('label');
    return parent && /官方轮次导航|official turn navigation/i.test(parent.textContent || '');
  });
  if (cb instanceof HTMLInputElement) { cb.click(); return true; }
  return false;
});
console.log('TOGGLE:', toggled);
await p.waitForTimeout(1000);
console.log('AFTER_ON:', JSON.stringify(await p.evaluate(() => ({ hideStyle: document.querySelector('style[data-crl-hide-official]') !== null }))));
await b.close();

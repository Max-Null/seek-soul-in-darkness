import { chromium } from '@playwright/test';

const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const pages = b.contexts()[0]?.pages() ?? [];
const p = pages.find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()));
if (!p) { console.log('NO_PAGE'); await b.close(); process.exit(1); }

// 1) 点侧边栏「设置」（evaluate 文本精确匹配的 button）
const clicked = await p.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].filter((x) => (x.textContent || '').trim() === '设置');
  if (!btns.length) return 'NO_BTN';
  btns[btns.length - 1].click();
  return 'CLICKED';
});
console.log('SETTINGS_CLICK:', clicked);
await p.waitForTimeout(1500);

// 2) 找 chat-rail 卡片（「使用官方轮次导航条」）
let card = await p.evaluate(() => {
  const body = document.body.innerText || '';
  const cb = [...document.querySelectorAll('input[type="checkbox"]')].find((i) => {
    const parent = i.closest('label');
    return parent && /官方轮次导航|official turn navigation/i.test(parent.textContent || '');
  });
  return {
    textInPage: body.includes('使用官方轮次导航条') || body.toLowerCase().includes('official turn navigation'),
    cbFound: !!cb,
    cbChecked: cb instanceof HTMLInputElement ? cb.checked : null,
  };
});
console.log('CARD:', JSON.stringify(card));

// 3) 切换开关 → 检查 hideStyle 状态（联动：切官方 = 屏蔽 css 移除）
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
let after = await p.evaluate(() => ({
  hideStyleInjected: document.querySelector('style[data-crl-hide-official]') !== null,
}));
console.log('AFTER_ON(官方):', JSON.stringify(after));

// 4) 切回
await p.evaluate(() => {
  const cb = [...document.querySelectorAll('input[type="checkbox"]')].find((i) => {
    const parent = i.closest('label');
    return parent && /官方轮次导航|official turn navigation/i.test(parent.textContent || '');
  });
  if (cb instanceof HTMLInputElement) cb.click();
});
await p.waitForTimeout(1000);
after = await p.evaluate(() => ({
  hideStyleInjected: document.querySelector('style[data-crl-hide-official]') !== null,
}));
console.log('AFTER_OFF(chat-rail):', JSON.stringify(after));
await b.close();

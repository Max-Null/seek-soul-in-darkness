import { chromium } from '@playwright/test';

const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const pages = b.contexts()[0]?.pages() ?? [];
const p = pages.find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()));
await p.waitForTimeout(2200);
// 打开设置页 → 插件 tab → 展开 chat-rail 卡片 → 截图
await p.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].filter((x) => (x.textContent || '').trim() === '设置');
  if (btns.length) btns[0].click();
});
await new Promise((r) => setTimeout(r, 1300));
await p.evaluate(() => {
  const items = [...document.querySelectorAll('button, [role="tab"], li')].filter((x) => (x.textContent || '').trim() === '插件');
  if (items.length) items[items.length - 1].click();
});
await new Promise((r) => setTimeout(r, 1200));
// 展开 chat-rail 卡片（crlSetCard header）
const opened = await p.evaluate(() => {
  const h = document.querySelector('.crlSetCard .crlSetHeader');
  if (h instanceof HTMLButtonElement) { h.click(); return true; }
  return false;
});
await new Promise((r) => setTimeout(r, 600));
const info = await p.evaluate(() => {
  const card = document.querySelector('.crlSetCard');
  if (!card) return { found: false };
  const cs = getComputedStyle(card);
  const sw = card.querySelector('.crlSetSwitch');
  return {
    found: true,
    border: cs.border.slice(0, 24), radius: cs.borderRadius, bg: cs.backgroundColor,
    name: card.querySelector('.crlSetName')?.textContent,
    hasSwitch: !!sw, switchOn: sw?.classList.contains('on'),
  };
});
console.log('CARD:', JSON.stringify(info));
await p.screenshot({ path: 'H:/MaxNull/WorkStation/.dsh-tmp/chatrail-card.png' });
console.log('shot ok');
await b.close();

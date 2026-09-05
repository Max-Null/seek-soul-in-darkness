import { chromium } from '@playwright/test';

const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const pages = b.contexts()[0]?.pages() ?? [];
const p = pages.find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()));
const r = await p.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('button')) {
    if (el.offsetWidth < 26 || el.offsetWidth > 48 || el.offsetHeight < 26 || el.offsetHeight > 48) continue;
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (rect.y < 250 || rect.y > 420) continue;
    out.push({
      cls: (el.className || '').toString().slice(0, 45),
      label: el.getAttribute('aria-label') || '',
      rad: cs.borderRadius, bg: cs.backgroundColor.slice(0, 24),
      x: Math.round(rect.x), y: Math.round(rect.y), w: el.offsetWidth, h: el.offsetHeight,
      svg: !!el.querySelector('svg'),
    });
  }
  return out;
});
console.log(JSON.stringify(r, null, 1));
await b.close();

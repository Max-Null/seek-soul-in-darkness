import { chromium } from '@playwright/test';

const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const pages = b.contexts()[0]?.pages() ?? [];
const p = pages.find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()));
await p.screenshot({ path: 'H:/MaxNull/WorkStation/.dsh-tmp/full-vp.png' });
const r = await p.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('*')) {
    if (el.offsetWidth < 20 || el.offsetWidth > 90 || el.offsetHeight < 20 || el.offsetHeight > 90) continue;
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'absolute' && cs.position !== 'sticky') continue;
    const rect = el.getBoundingClientRect();
    out.push({
      tag: el.tagName, id: el.id || '', cls: (el.className || '').toString().slice(0, 40),
      label: el.getAttribute('aria-label') || '',
      rad: cs.borderRadius, bg: cs.backgroundColor.slice(0, 24),
      x: Math.round(rect.x), y: Math.round(rect.y), w: el.offsetWidth, h: el.offsetHeight,
      hasBars: !!el.querySelector('svg'),
    });
  }
  return out;
});
console.log(JSON.stringify(r, null, 1));
await b.close();

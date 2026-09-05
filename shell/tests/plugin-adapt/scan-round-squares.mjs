import { chromium } from '@playwright/test';

const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const pages = b.contexts()[0]?.pages() ?? [];
const p = pages.find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()));
const r = await p.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('button, div, section, a')) {
    if (el.offsetWidth < 25 || el.offsetWidth > 90 || el.offsetHeight < 25 || el.offsetHeight > 90) continue;
    const cs = getComputedStyle(el);
    const rad = parseFloat(cs.borderRadius);
    if (rad < 2 || rad > 12) continue;
    const bg = cs.backgroundColor;
    if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') continue;
    const rect = el.getBoundingClientRect();
    const pos = cs.position;
    if (pos !== 'fixed' && pos !== 'absolute' && pos !== 'sticky') continue;
    out.push({
      tag: el.tagName, id: el.id, cls: (el.className || '').toString().slice(0, 50),
      label: el.getAttribute('aria-label') || '',
      rad: cs.borderRadius, bg, w: el.offsetWidth, h: el.offsetHeight,
      x: Math.round(rect.x), y: Math.round(rect.y), pos,
    });
  }
  return out;
});
console.log(JSON.stringify(r, null, 1));
await b.close();

import { chromium } from '@playwright/test';

const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const pages = b.contexts()[0]?.pages() ?? [];
const p = pages.find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()));
if (!p) { console.log('NO_PAGE'); await b.close(); process.exit(1); }
const r = await p.evaluate(() => {
  const out = [];
  for (const [cx, cy] of [[272, 334], [272, 320], [272, 352]]) {
    const chain = [];
    let el = document.elementFromPoint(cx, cy);
    while (el && chain.length < 6) {
      const cs = getComputedStyle(el);
      chain.push({
        tag: el.tagName, id: el.id || '', cls: (el.className || '').toString().slice(0, 45),
        label: el.getAttribute('aria-label') || '',
        rad: cs.borderRadius, bg: cs.backgroundColor.slice(0, 26), pos: cs.position,
        w: el.offsetWidth, h: el.offsetHeight, z: cs.zIndex, ov: cs.overflow.slice(0, 10),
      });
      el = el.parentElement;
    }
    out.push({ at: [cx, cy], chain });
  }
  return out;
});
console.log(JSON.stringify(r, null, 1));
await b.close();

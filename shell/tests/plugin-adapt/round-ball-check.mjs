import { chromium } from '@playwright/test';

const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const pages = b.contexts()[0]?.pages() ?? [];
const p = pages.find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()));
if (!p) { console.log('NO_PAGE'); await b.close(); process.exit(1); }
const r = await p.evaluate(() => {
  // 找汉堡/折叠类按钮（svg 三道杠或 aria-label 含 折叠/sidebar/toggle）
  const cand = [...document.querySelectorAll('button')].filter((b2) => {
    const label = (b2.getAttribute('aria-label') || '') + (b2.title || '');
    const hasBars = !!b2.querySelector('svg') && /bar|line|fold|collapse|menu|折叠|侧边栏|sidebar|panel/i.test(label + (b2.className || ''));
    return hasBars || /折叠|折叠侧边栏|collapse|toggle/i.test(label);
  });
  return cand.map((b2) => {
    const cs = getComputedStyle(b2);
    // 找出所有覆盖 border-radius 的 style 规则来源
    let radiusSource = null;
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.selectorText && rule.style && rule.style.borderRadius && b2.matches(rule.selectorText)) {
            radiusSource = { sel: rule.selectorText.slice(0, 80), radius: rule.style.borderRadius, href: sheet.href ? sheet.href.split('/').pop() : 'inline' };
            break;
          }
        }
        if (radiusSource) break;
      } catch { }
    }
    return {
      label: b2.getAttribute('aria-label'),
      cls: (b2.className || '').toString().slice(0, 90),
      border: cs.borderRadius,
      w: b2.offsetWidth, h: b2.offsetHeight,
      pluginStyle: b2.closest('[data-slot]')?.getAttribute('data-slot') || null,
      radiusSource,
    };
  }).slice(0, 4);
});
console.log(JSON.stringify(r, null, 1));
await b.close();

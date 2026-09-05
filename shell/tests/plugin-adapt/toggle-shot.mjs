import { chromium } from '@playwright/test';

const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const pages = b.contexts()[0]?.pages() ?? [];
const p = pages.find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()));
const sel = 'button[aria-label="收起侧边栏"], button[aria-label="折叠侧边栏"], .hHd-Xa_iconButton';
const info = await p.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return { label: el.getAttribute('aria-label'), cls: (el.className || '').toString().slice(0, 60), rad: cs.borderRadius, bg: cs.backgroundColor, w: el.offsetWidth, h: el.offsetHeight, x: Math.round(r.x), y: Math.round(r.y) };
}, sel);
console.log('TOGGLE:', JSON.stringify(info));
for (const s2 of ['button[aria-label="收起侧边栏"]', 'button[aria-label="折叠侧边栏"]', '.hHd-Xa_iconButton']) {
  const h = await p.$(s2).catch(() => null);
  if (h) { await h.screenshot({ path: 'H:/MaxNull/WorkStation/.dsh-tmp/sidebar-toggle.png' }); console.log('shot:', s2); break; }
}
await b.close();

import { chromium } from '@playwright/test';

const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const pages = b.contexts()[0]?.pages() ?? [];
const p = pages.find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()));
const r = await p.evaluate(() => {
  const styles = [];
  for (const s of document.querySelectorAll('style')) {
    const t = s.textContent || '';
    if (t.includes('ssid-toolbar') || t.includes('corner-shape')) {
      styles.push({ id: s.getAttribute('data-plugin') || s.getAttribute('data-dsh-quick-toolbar') || '', len: t.length, hasRound: t.includes('corner-shape:round'), hasBallRule: t.includes('#ssid-toolbar-ball{'), sample: t.slice(0, 60) });
    }
  }
  // 匹配 root 的 corner-shape 声明来源
  const root = document.querySelector('#ssid-toolbar');
  let decl = [];
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule.selectorText && rule.style && rule.style.cornerShape && root.matches(rule.selectorText)) {
          decl.push({ sel: rule.selectorText.slice(0, 60), val: rule.style.cornerShape, href: (sheet.href || 'inline').split('/').pop() });
        }
      }
    } catch {}
  }
  return { styles, decl };
});
console.log(JSON.stringify(r, null, 1));
await b.close();

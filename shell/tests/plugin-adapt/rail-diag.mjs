import { chromium } from '@playwright/test';

const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const pages = b.contexts()[0]?.pages() ?? [];
const p = pages.find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()));
const logs = [];
p.on('console', (m) => logs.push({ level: m.type(), text: m.text().slice(0, 220) }));
await p.reload({ waitUntil: 'load' }).catch(() => {});
await p.waitForTimeout(4000);
const r = await p.evaluate(() => {
  const rail = document.querySelector('.crl_nav');
  const styles = document.querySelectorAll('style[data-plugin]');
  const ids = Array.from(styles).map((s) => s.getAttribute('data-plugin'));
  return {
    railExists: !!rail,
    railCls: rail ? (rail.className).toString().slice(0, 30) : null,
    chatRailStyle: ids.filter((i) => i === 'dsh-chat-rail').length,
    pluginStyles: ids.length,
    bodyHead: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 80),
  };
});
console.log('RESULT:', JSON.stringify(r, null, 1));
const errs = logs.filter((l) => l.level === 'error' || l.level === 'exception' || /chat-rail|rail/i.test(l.text));
console.log('ERRS:', errs.length);
errs.slice(0, 8).forEach((x) => console.log('ERR>', x.level, x.text.slice(0, 220)));
await b.close();

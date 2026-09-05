import { chromium } from '@playwright/test';

const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const pages = b.contexts()[0]?.pages() ?? [];
const p = pages.find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()));
if (!p) { console.log('NO_PAGE'); await b.close(); process.exit(1); }
const logs = [];
p.on('console', (m) => logs.push({ level: m.type(), text: m.text() }));
await p.reload({ waitUntil: 'load' }).catch(() => {});
await new Promise((r) => setTimeout(r, 7000));
const r = await p.evaluate(() => {
  const pluginStyles = Array.from(document.querySelectorAll('style[data-plugin]')).map((s) => s.getAttribute('data-plugin'));
  return {
    pluginStyles,
    bodySnippet: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 160),
    dataSlotCount: document.querySelectorAll('[data-slot]').length,
  };
});
const bad = logs.filter((l) => /#130|Minified React error|reading 'height'|slot entry crashed|Cannot read properties|Failed to load plugins|TypeError|ReferenceError/.test(l.text));
console.log('PLUGIN_STYLES:', JSON.stringify(r.pluginStyles));
console.log('SLOT_COUNT:', r.dataSlotCount);
console.log('BODY:', r.bodySnippet);
console.log('BAD_COUNT:', bad.length);
bad.slice(0, 8).forEach((x) => console.log('BAD>', x.text.slice(0, 180)));
const errs = logs.filter((l) => l.level === 'error');
console.log('ERROR_OTHER:', errs.length - bad.length);
await b.close();

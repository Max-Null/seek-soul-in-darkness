import { chromium } from '@playwright/test';

const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const pages = b.contexts()[0]?.pages() ?? [];
const p = pages.find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()));
if (!p) { console.log('NO_PAGE'); await b.close(); process.exit(1); }
const logs = [];
p.on('console', (msg) => logs.push(msg.text()));
await p.reload({ waitUntil: 'load' }).catch(() => {});
await new Promise((r) => setTimeout(r, 6000));
const srcs = await p.evaluate(() => Array.from(document.querySelectorAll('script')).map((s) => s.src).filter(Boolean).slice(0, 4));
const bad = logs.filter((t) => /#130|Minified React error|reading 'height'|slot entry crashed|Cannot read properties/.test(t));
console.log('SCRIPTS:', JSON.stringify(srcs));
console.log('BAD_COUNT:', bad.length);
bad.slice(0, 8).forEach((t) => console.log('BAD>', t.slice(0, 200)));
await b.close();

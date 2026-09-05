import { chromium } from '@playwright/test';

const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const pages = b.contexts()[0]?.pages() ?? [];
const p = pages.find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()));
if (!p) { console.log('NO_PAGE', pages.map((x) => x.url())); await b.close(); process.exit(1); }
const r = await p.evaluate(async () => {
  try {
    const res = await fetch(window.location.origin + '/', { credentials: 'include' });
    const t = await res.text();
    const m = t.match(/assets\/index-[^"]+/g);
    return { status: res.status, assets: m ? m.slice(0, 3) : null, hasHtml: t.includes('<div id="root">') || t.includes('<script') };
  } catch (e) { return { err: String(e) }; }
});
console.log(JSON.stringify(r));
await b.close();

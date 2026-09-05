import { chromium } from '@playwright/test';

const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const pages = b.contexts()[0]?.pages() ?? [];
const p = pages.find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()));
if (!p) { console.log('NO_PAGE', pages.map((x) => x.url())); await b.close(); process.exit(1); }
const r = await p.evaluate(async () => {
  async function sha(u) {
    const res = await fetch(u, { credentials: 'include' });
    if (!res.ok) return `HTTP ${res.status}`;
    const buf = await res.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 16);
  }
  const out = {};
  for (const a of ['assets/index-D-eoFxDP.js', 'assets/index-Df-65__b.js']) {
    out[a] = await sha(window.location.origin + '/' + a);
  }
  return out;
});
console.log(JSON.stringify(r));
await b.close();

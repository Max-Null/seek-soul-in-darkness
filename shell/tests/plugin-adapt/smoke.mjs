import { chromium } from '@playwright/test';

const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const pages = b.contexts()[0]?.pages() ?? [];
const p = pages.find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()));
if (!p) { console.log('NO_PAGE'); await b.close(); process.exit(1); }
const r = await p.evaluate(() => {
  const q = (s) => document.querySelectorAll(s).length;
  const hasSettings = [...document.querySelectorAll('button')].some((b2) => /set|setting|设置/i.test(b2.textContent || ''));
  return {
    title: document.title,
    buttons: q('button'),
    asideChildren: q('aside *'),
    sessionList: q('[data-slot]'),
    settingsBtn: hasSettings,
    rootChildren: q('#root > *'),
    bodyHead: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 140),
  };
});
console.log(JSON.stringify(r, null, 1));
await b.close();

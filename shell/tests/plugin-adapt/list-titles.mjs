import { chromium } from '@playwright/test';

const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const pages = b.contexts()[0]?.pages() ?? [];
const p = pages.find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()));
const r = await p.evaluate(() => {
  const items = [];
  const list = document.querySelector('[data-slot="sidebar.workspaces"]') || document.querySelector('.bhn1Oq_list') || document.body;
  for (const el of list.querySelectorAll('[data-slot], li, button, div')) {
    const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (txt && txt.length > 2 && txt.length < 60 && el.children.length <= 3) {
      if (!items.includes(txt)) items.push(txt);
    }
  }
  return items.slice(0, 40);
});
console.log(JSON.stringify(r, null, 1));
await b.close();

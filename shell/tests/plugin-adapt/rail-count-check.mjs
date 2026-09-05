import { chromium } from '@playwright/test';

const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const pages = b.contexts()[0]?.pages() ?? [];
const p = pages.find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()));
if (!p) { console.log('NO_PAGE'); await b.close(); process.exit(1); }
// 打开大会话（同 big-session-check 路径）
try { await p.getByText(/新建会话/).first().click({ timeout: 4000 }); } catch {}
await p.waitForTimeout(1000);
try {
  const expand = p.getByText(/展开其余/).first();
  if (await expand.count()) { await expand.click({ timeout: 3000 }); await p.waitForTimeout(600); }
} catch {}
const clicked = await p.evaluate(() => {
  const list = document.querySelector('[data-slot="sidebar.workspaces"], .bhn1Oq_list, aside');
  if (!list) return 'NO_LIST';
  const els = [...list.querySelectorAll('li, [data-slot], button, div')].filter((el) => (el.textContent || '').includes('会话历史加载失败原因') && el.offsetWidth > 0);
  if (!els.length) return 'NO_ENTRY';
  const t = els[els.length - 1];
  t.click();
  return 'CLICKED';
});
console.log('CLICK:', clicked);
await p.waitForTimeout(3500);
// 量导航杆
const r = await p.evaluate(() => {
  const nav = document.querySelector('[data-crl-index]')?.closest('div[class*="crl_"]') || document.querySelector('#ssid-chat-rail, .crl_root, [class*="crl"]');
  const items = document.querySelectorAll('[data-crl-index], [class*="crl_item"], [class*="crlItem"]').length;
  const navInfo = nav ? { cls: (nav.className || '').toString().slice(0, 40), childCount: nav.children.length } : null;
  const hasCrl = !!nav;
  // 老会话加载状态
  const openState = /加载|loading|hasMore|loadOlder/i.test((document.body.innerText || '').slice(0, 500));
  return { items, hasCrl, navInfo, loadingText: openState };
});
console.log('RAIL:', JSON.stringify(r, null, 1));
await b.close();

import { chromium } from '@playwright/test';

const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const pages = b.contexts()[0]?.pages() ?? [];
const p = pages.find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()));
await p.waitForTimeout(2400);
await p.evaluate(() => {
  const b2 = [...document.querySelectorAll('button')].filter((x) => (x.textContent || '').trim() === '设置');
  if (b2.length) b2[0].click();
});
await new Promise((r) => setTimeout(r, 1300));
await p.evaluate(() => {
  const i = [...document.querySelectorAll('button, [role="tab"], li')].filter((x) => (x.textContent || '').trim() === '插件');
  if (i.length) i[i.length - 1].click();
});
await new Promise((r) => setTimeout(r, 1200));
const r = await p.evaluate(() => {
  const body = document.body.innerText || '';
  const card = [...document.querySelectorAll('li')].find((el) => (el.textContent || '').includes('截图行为设置'));
  return {
    hasCaptureCard: body.includes('截图行为设置'),
    cardFound: !!card,
    cardName: card?.querySelector('.ssd3CardName')?.textContent || null,
    desc: card?.querySelector('.ssd3CardDesc')?.textContent?.slice(0, 30) || null,
  };
});
console.log('CAPTURE_CARD:', JSON.stringify(r));
if (r.cardFound) {
  try { await p.locator('.ssd3Card .ssd3CardHeader').first().click({ timeout: 4000 }); } catch {}
  await new Promise((x) => setTimeout(x, 500));
  const s = await p.evaluate(() => {
    const c = [...document.querySelectorAll('li')].find((el) => (el.textContent || '').includes('截图行为设置'));
    if (!c) return null;
    return { cls: c.className, bg: getComputedStyle(c).backgroundColor, rows: c.querySelectorAll('.ssd3r').length, chev: !!c.querySelector('svg') };
  });
  console.log('OPEN:', JSON.stringify(s));
}
await p.screenshot({ path: 'H:/MaxNull/WorkStation/.dsh-tmp/capture-card.png' });
console.log('shot ok');
await b.close();

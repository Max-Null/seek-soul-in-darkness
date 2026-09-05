import { chromium } from '@playwright/test';

const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const pages = b.contexts()[0]?.pages() ?? [];
const p = pages.find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()));
// 观察 3 个时刻（300ms/2s/5s）：样式注入前后均应圆
for (const wait of [300, 2000, 5000]) {
  await new Promise((r) => setTimeout(r, wait === 300 ? 300 : wait - (wait === 2000 ? 300 : 2000)));
  const st = await p.evaluate(() => {
    const root = document.querySelector('#ssid-toolbar');
    const ball = document.querySelector('#ssid-toolbar-ball');
    if (!root || !ball) return { missing: true };
    const rc = getComputedStyle(root);
    const bc = getComputedStyle(ball);
    return { rootRad: rc.borderRadius, ballRad: bc.borderRadius, rootCls: root.className, ballOp: bc.opacity };
  });
  console.log(`t=${wait}ms:`, JSON.stringify(st));
}
const h = await p.$('#ssid-toolbar');
if (h) await h.screenshot({ path: 'H:/MaxNull/WorkStation/.dsh-tmp/ball-final.png' });
console.log('final shot ok');
await b.close();

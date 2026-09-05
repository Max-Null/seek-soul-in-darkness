import { chromium } from '@playwright/test';

const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const pages = b.contexts()[0]?.pages() ?? [];
const p = pages.find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()));
if (!p) { console.log('NO_PAGE'); await b.close(); process.exit(1); }
// 不点击任何东西，直接抓初始状态
await p.waitForTimeout(1500);
const r = await p.evaluate(() => {
  const root = document.querySelector('#ssid-toolbar');
  const ball = document.querySelector('#ssid-toolbar-ball');
  if (!root || !ball) return { missing: true };
  const rc = getComputedStyle(root);
  return {
    rootCls: root.className,
    rootW: root.offsetWidth, rootH: root.offsetHeight,
    rootRad: rc.borderRadius,
    ballLeft: ball.style.left, ballTop: ball.style.top,
    ballRect: ball.getBoundingClientRect().toJSON ? { x: ball.getBoundingClientRect().x, y: ball.getBoundingClientRect().y } : null,
  };
});
console.log('INIT:', JSON.stringify(r));
const h = await p.$('#ssid-toolbar');
if (h) await h.screenshot({ path: 'H:/MaxNull/WorkStation/.dsh-tmp/ball-init.png' });
await b.close();

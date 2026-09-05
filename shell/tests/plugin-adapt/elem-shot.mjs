import { chromium } from '@playwright/test';

const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const pages = b.contexts()[0]?.pages() ?? [];
const p = pages.find((x) => /^http/.test(x.url()) && !/file:/.test(x.url()));
const h = await p.$('#ssid-toolbar');
if (h) { await h.screenshot({ path: 'H:/MaxNull/WorkStation/.dsh-tmp/ball-element.png' }); console.log('root ok'); }
const h2 = await p.$('#ssid-toolbar-ball');
if (h2) { await h2.screenshot({ path: 'H:/MaxNull/WorkStation/.dsh-tmp/ball-element-btn.png' }); console.log('ball ok'); }
await b.close();

import { chromium } from '@playwright/test';

const URL = 'http://127.0.0.1:3083/?token=GWFGMz9oLpvU7J5a4Eu4IYF6v0XPU-w_mw_Ob3lSU4s';
const b = await chromium.launch({ headless: true, executablePath: 'C:\\Users\\MaxNull\\AppData\\Local\\ms-playwright\\chromium-1237\\chrome-win64\\chrome.exe' });
const ctx = await b.newContext();
const p = await ctx.newPage();
const logs = [];
p.on('console', (msg) => logs.push({ level: msg.type(), text: msg.text() }));
await p.goto(URL, { waitUntil: 'load', timeout: 30_000 }).catch((e) => console.log('GOTO_ERR', String(e).slice(0, 150)));
await p.waitForTimeout(4000);
const r = await p.evaluate(() => {
  const hasSettings = [...document.querySelectorAll('button')].some((b2) => /set|setting|设置/i.test(b2.textContent || ''));
  return {
    title: document.title,
    buttons: document.querySelectorAll('button').length,
    settingsBtn: hasSettings,
    bodyHead: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 120),
  };
});
const bad = logs.filter((l) => /#130|Minified React error|reading 'height'|slot entry crashed|Cannot read properties/.test(l.text));
console.log('PAGE:', JSON.stringify(r, null, 1));
console.log('BAD_COUNT:', bad.length);
bad.slice(0, 6).forEach((x) => console.log('BAD>', x.text.slice(0, 160)));
console.log('ERROR_COUNT:', logs.filter((l) => l.level === 'error').length);
await b.close();

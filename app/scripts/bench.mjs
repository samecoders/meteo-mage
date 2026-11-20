// ?bench=N 을 헤드리스 크롬으로 돌려 결과 한 줄을 출력. 로컬 서버(python tools/serve.py 8081)가 떠 있어야 함.
// 사용: node scripts/bench.mjs [N] [URL]
import puppeteer from 'puppeteer-core';
const N = process.argv[2] || '60000';
const BASE = process.argv[3] || process.env.GAME_URL || 'http://localhost:8081/';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setViewport({ width: 360, height: 640, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { const t = m.text(); if (t.startsWith('BENCH')) console.log(t); });
await page.goto(BASE + '?bench=' + N, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => /BENCH/.test(document.getElementById('debug').textContent), { timeout: 120000, polling: 1000 });
await browser.close();

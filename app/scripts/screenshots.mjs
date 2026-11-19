// 스토어 스크린샷(1080×1920) 자동 촬영. 로컬 서버(python tools/serve.py, 8081)가 떠 있어야 함.
// 사용: node scripts/screenshots.mjs [ko|en ...]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.GAME_URL || 'http://localhost:8081/';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
// IOS=1 이면 아이폰 6.9인치(1290×2796), 아니면 안드로이드(1080×1920)
const IOS = !!process.env.IOS;
const VIEW = IOS ? { width: 430, height: 932 } : { width: 360, height: 640 };
const langs = process.argv.slice(2).length ? process.argv.slice(2) : ['ko', 'en'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});

for (const lang of langs) {
  const dir = join(app, 'store', IOS ? 'screenshots-ios' : 'screenshots', lang);
  mkdirSync(dir, { recursive: true });
  const page = await browser.newPage();
  await page.setViewport({ ...VIEW, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate((lang) => {
    const k = 'meteor_mage_save';
    const d = JSON.parse(localStorage.getItem(k) || '{}');
    d.tutorialDone = true;
    d.settings = { ...(d.settings || {}), lang, nickname: lang === 'ko' ? '메테오장인' : 'StarCaster', country: lang === 'ko' ? 'KR' : 'US' };
    d.bank = Math.max(d.bank || 0, 12500);
    localStorage.setItem(k, JSON.stringify(d));
  }, lang);
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(1500);
  const shot = async (name) => { await page.screenshot({ path: join(dir, name + '.png') }); console.log(lang, name); };

  // 1) 타이틀
  await shot('1_title');

  // 2) 게임: 빠르게 진행시켜 몹을 잔뜩 모음(무적), 레벨업 카드는 자동 선택
  await page.click('#tStart');
  await sleep(500);
  await page.evaluate(async () => {
    const { G, tick } = await import('/js/game.js');
    const { updatePlayer } = await import('/js/player.js');
    const { cardsFor, applyCard } = await import('/js/upgrade.js');
    G.god = true;
    const inp = { mx: 0, my: 0 };
    const pick = () => {
      while (G.mode === 'levelup' && G.levelQueue.length) {
        const { cards } = cardsFor(G, G.levelQueue[0]);
        applyCard(G, cards[0]); G.levelQueue.shift();
      }
      if (G.mode === 'levelup') G.mode = 'play';
    };
    for (let f = 0; f < 60 * 75; f++) {                 // 게임 시간 75초
      const a = G.time * 0.35;
      inp.mx = Math.cos(a); inp.my = Math.sin(a);
      updatePlayer(G, inp, 1 / 60);
      if (f & 1) tick();
      if (G.mana >= 100 && f % 600 === 0) { const { queueTap } = await import('/js/game.js'); queueTap(G.player.x, G.player.y); }
      pick();
      G.events.length = 0;
    }
    G.mana = 72;
  });
  await sleep(1200);
  await shot('2_horde');

  // 3) 메테오 낙하 중 → 4) 폭발 직후
  await page.evaluate(async () => {
    const { G, queueTap } = await import('/js/game.js');
    G.mana = 100; queueTap(G.player.x, G.player.y);
  });
  await sleep(650);
  await shot('3_meteor');
  await sleep(800);
  await shot('4_explosion');

  // 5) 레벨업 카드
  await page.evaluate(async () => {
    const { G } = await import('/js/game.js');
    const lv = Math.ceil((G.stats.level + 1) / 5) * 5;  // 특수 카드가 나오는 레벨
    G.levelQueue.push(lv); G.mode = 'levelup'; G.events.push({ type: 'levelup' });
  });
  await sleep(1200);
  await shot('5_levelup');

  // 6) 상점
  await page.evaluate(async () => {
    const { G } = await import('/js/game.js');
    G.levelQueue.length = 0; G.mode = 'title';
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(1200);
  await page.click('#tShop');
  await sleep(1500);
  await shot('6_shop');
  await page.close();

  if (IOS) continue;
  // 그래픽 이미지 1024×500 (Play 스토어 상단 배너)
  const fp = await browser.newPage();
  await fp.setViewport({ width: 1024, height: 500, deviceScaleFactor: 1 });
  await fp.goto(BASE + 'app/store/feature.html?lang=' + lang, { waitUntil: 'networkidle0' });
  await sleep(300);
  await fp.screenshot({ path: join(app, 'store', `feature_${lang}.png`) });
  console.log(lang, 'feature');
  await fp.close();
}
await browser.close();

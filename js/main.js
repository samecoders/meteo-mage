// 부팅, 화면 크기, 메인 루프(고정 틱 + 보간 렌더), 게임 흐름.
import { CONFIG, TICK_DT } from './config.js';
import { save } from './save.js';
import { initI18n, t } from './i18n.js';
import { loadAssets, SPRITE_ORDER, SPR } from './assets.js';
import { buildAtlas } from './render/atlas.js';
import { Renderer } from './render/gl.js';
import { batches, allocBatches, fillMobs, fillDecor, fillTop, fillUnder, fillParticlesBatch, fillOver, emitVisuals } from './render/sprites.js';
import { updateEffects, shake, setQualityLevel, getQualityLevel, setSpriteRects, addSpriteFx } from './render/effects.js';
import { G, initSim, newGame, tick, queueTap } from './game.js';
import { M } from './sim/mobs.js';
import { input, initInput, updateInput, resetInput } from './input.js';
import { updatePlayer } from './player.js';
import { tryDash, dashPreview } from './dash.js';
import { buyShield, buyDash } from './shop.js';
import { cardsFor, applyCard } from './upgrade.js';
import { sfx, unlockAudio, setSound, suspendAudio } from './audio.js';
import { bench, parseBench, setupBench, benchInput, benchTick, benchFrame } from './bench.js';
import { submitScore } from './ranking.js';
import * as UI from './ui.js';

const params = new URLSearchParams(location.search);
const BENCH_N = parseBench();
const DEBUG = params.get('debug') === '1' || BENCH_N > 0;

const view = {
  cssW: 1, cssH: 1, dpr: 1, devW: 1, devH: 1,
  iw: 360, ih: 640, curShort: CONFIG.view.baseShort,
  camX: 0, camY: 0, left: 0, top: 0,
};

let renderer = null, atlas = null, canvas = null;
let acc = 0, alpha = 0, last = 0;
const tmp2 = [0, 0];

// ------------------------------------------------------------ 화면 크기
function resize() {
  const r = canvas.getBoundingClientRect();
  view.cssW = Math.max(1, r.width); view.cssH = Math.max(1, r.height);
  view.dpr = Math.min(window.devicePixelRatio || 1, 3);
  view.devW = Math.max(1, Math.round(view.cssW * view.dpr));
  view.devH = Math.max(1, Math.round(view.cssH * view.dpr));
  const short = Math.min(view.devW, view.devH);
  const k = CONFIG.view.maxShort / short;
  renderer.resize(view.devW, view.devH, Math.ceil(view.devW * k) + 2, Math.ceil(view.devH * k) + 2);
}

/** 내부 해상도: 짧은 변 = curShort 픽셀(월드 2배). 긴 변은 기기 비율대로 더 넓게 */
function computeView() {
  const short = Math.min(view.devW, view.devH);
  const S = Math.round(view.curShort);
  view.iw = Math.max(1, Math.round(view.devW * S / short));
  view.ih = Math.max(1, Math.round(view.devH * S / short));
  const cx = Math.round(view.camX * 0.5), cy = Math.round(view.camY * 0.5);
  view.left = cx - (view.iw >> 1) + shake.x;
  view.top = cy - (view.ih >> 1) + shake.y;
}

function screenToWorld(x, y, out) {
  out[0] = (view.left - shake.x + x / view.cssW * view.iw) * 2;
  out[1] = (view.top - shake.y + y / view.cssH * view.ih) * 2;
  return out;
}
function worldToScreen(x, y, out) {
  out[0] = (x * 0.5 - view.left) / view.iw * view.cssW;
  out[1] = (y * 0.5 - view.top) / view.ih * view.cssH;
  return out;
}

// ------------------------------------------------------------ 게임 흐름
function startGame() {
  unlockAudio();
  newGame({ skin: save.data.skinEquipped, hero: save.data.heroEquipped, bench: BENCH_N > 0, benchCount: BENCH_N });
  if (BENCH_N > 0) setupBench(G, BENCH_N);
  view.camX = G.player.x; view.camY = G.player.y;
  view.curShort = G.zoomShort;
  acc = 0; alpha = 0;
  resetInput();
  UI.showScreen(null);
  UI.showHud(true);
  if (!save.data.tutorialDone && !G.bench) {
    UI.startTutorial(() => { save.data.tutorialDone = true; save.write(); });
  }
}

function toTitle() {
  G.mode = 'title';
  UI.stopTutorial();
  UI.showHud(false);
  UI.showScreen('title');
}

function pause() {
  if (G.mode !== 'play' || !G.player.alive) return;
  G.mode = 'paused';
  resetInput();
  UI.showScreen('pause');
}
function resume() {
  if (G.mode !== 'paused') return;
  G.mode = 'play';
  last = performance.now();
  UI.showScreen(null);
}

function showLevelUp() {
  const level = G.levelQueue[0];          // 0 = 보물상자 보너스 카드
  const { special, cards } = cardsFor(G, level);
  sfx.levelUp();
  if (level > 0) addSpriteFx(0, 4, SPR.fx_levelup, 1, 0.9, 0, -10, false, true);
  UI.showLevelUp(level, special, cards, (id) => {
    applyCard(G, id);
    G.levelQueue.shift();
    sfx.click();
    if (G.levelQueue.length) showLevelUp();
    else { UI.showScreen(null); G.mode = 'play'; last = performance.now(); }
  });
}

async function gameOver() {
  UI.stopTutorial();
  const s = G.stats;
  const rec = {
    kills: s.kills, surviveSec: Math.floor(G.time), level: s.level, maxCombo: s.maxCombo,
    maxMobs: s.maxMobs, skin: G.skin.id, hero: G.hero, date: Date.now(),
  };
  // 쓰지 않고 남은 골드 → 보관 골드
  const bankAdd = G.bench ? 0 : Math.max(0, Math.floor(s.gold));
  save.data.bank += bankAdd;
  const isBest = G.bench ? false : save.addRecord(rec);
  save.write();
  UI.showHud(false);
  UI.showGameOver(rec, bankAdd, isBest);
  if (G.bench) return;
  const st = save.data.settings;
  if (!st.nickname) { UI.setRankStatus({ ok: false, noNick: true }); return; }
  UI.setRankStatus({ pending: true });
  const r = await submitScore({ ...rec, nickname: st.nickname, country: st.country || 'XX' });
  UI.setRankStatus(r);
}

function vibrate(ms) { if (save.data.settings.vibrate && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* */ } } }

function processEvents() {
  const ev = G.events;
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    switch (e.type) {
      case 'explosion': sfx.explosion(G.skin, e.kills); if (e.kills > 500) vibrate(Math.min(120, 20 + e.kills / 100)); break;
      case 'combo': {
        UI.comboPopup(e.kills, e.mult);
        worldToScreen(e.x, e.y, tmp2);
        UI.killPopup(tmp2[0], tmp2[1], e.kills);
        break;
      }
      case 'launch': sfx.launch(); break;
      case 'manaFull': UI.manaFullFx(); sfx.manaFull(); vibrate(30); break;
      case 'dashReady': UI.dashReadyFx(); sfx.dashReady(); break;
      case 'levelup': showLevelUp(); break;
      case 'boss': UI.toast(t('boss.appears', { name: t('boss.' + CONFIG.boss.kinds[e.kind].key) }), 'warn'); sfx.boss(); vibrate(80); break;
      case 'bossKill': UI.toast(t('boss.killed'), 'gold'); sfx.bossKill(); break;
      case 'bossCharge': sfx.charge(); break;
      case 'summon': sfx.summon(); break;
      case 'fireball': sfx.fireball(); break;
      case 'fireHit': addSpriteFx(e.x, e.y, SPR.fx_explosion, 1, 0.3, 0, 0); break;
      case 'item':
        sfx.item(e.kind);
        UI.toast(t('item.' + e.kind), e.kind === 'chest' ? 'gold' : 'mana');
        addSpriteFx(e.x, e.y, SPR.fx_hit, 1, 0.3, 0, -40);
        if (e.kind !== 'chest') vibrate(30);
        break;
      case 'nearMiss': UI.toast(t('nearMiss'), 'mana'); sfx.nearMiss(); break;
      case 'shieldBreak': UI.toast(t('shield.broken'), 'mana'); sfx.shield(); vibrate(60); break;
      case 'death': sfx.death(); vibrate(250); break;
      case 'hurt': sfx.hurt(); vibrate(40); UI.hurtFx(); break;
      case 'gameover': gameOver(); break;
    }
  }
  ev.length = 0;
}

// ------------------------------------------------------------ 화질 자동 조절
const fpsWin = { t: 0, frames: 0, fps: 60, goodWins: 0 };
function applyQualitySetting() {
  const q = save.data.settings.quality;
  if (q === 'high') setQualityLevel(2); else if (q === 'mid') setQualityLevel(1); else if (q === 'low') setQualityLevel(0);
}
function autoQuality(dt) {
  fpsWin.t += dt; fpsWin.frames++;
  if (fpsWin.t < CONFIG.quality.window) return;
  fpsWin.fps = fpsWin.frames / fpsWin.t;
  fpsWin.t = 0; fpsWin.frames = 0;
  if (save.data.settings.quality !== 'auto' || G.mode !== 'play') return;
  const q = getQualityLevel();
  if (fpsWin.fps < CONFIG.quality.downFps && q > 0) { setQualityLevel(q - 1); fpsWin.goodWins = 0; }
  else if (fpsWin.fps > CONFIG.quality.upFps) { if (++fpsWin.goodWins >= 3 && q < 2) { setQualityLevel(q + 1); fpsWin.goodWins = 0; } }
  else fpsWin.goodWins = 0;
}

// ------------------------------------------------------------ 메인 루프
let simAvg = 0, renderAvg = 0, dbgT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  const frameMs = now - last;
  last = now;
  if (dt > 0.25) dt = 0.25;
  if (dt < 0) dt = 0;
  autoQuality(dt);
  if (renderer.lost) return;

  updateInput();
  if (G.bench && G.mode === 'play') benchInput(G, input, dt);

  let ticks = 0, simMs = 0, effDt = 0;
  if (G.mode === 'play') {
    if (G.hitstop > 0) G.hitstop -= dt;          // 의도된 짧은 멈춤
    else {
      effDt = dt;
      updatePlayer(G, input, dt);                // 법사 이동은 프레임마다
      acc += dt;
      const t0 = performance.now();
      const maxT = CONFIG.sim.maxCatchupTicks;
      while (acc >= TICK_DT && ticks < maxT) {
        if (G.bench) benchTick(G, TICK_DT);
        tick();
        acc -= TICK_DT; ticks++;
        if (G.mode !== 'play') break;
      }
      if (acc >= TICK_DT) acc = acc % TICK_DT;   // 너무 밀리면 게임 시간을 늦춤(폭주 방지)
      simMs = performance.now() - t0;
    }
    alpha = Math.min(1, acc / TICK_DT);
  }
  processEvents();

  // 카메라: 법사를 부드럽게 따라감, 줌은 천천히
  const p = G.player;
  if (G.mode === 'play' || G.mode === 'over') {
    const k = 1 - Math.exp(-CONFIG.view.camLerp * dt);
    view.camX += (p.x - view.camX) * k; view.camY += (p.y - view.camY) * k;
    const zs = CONFIG.view.zoomSpeed * dt;
    view.curShort += Math.max(-zs, Math.min(zs, G.zoomShort - view.curShort));
  }
  emitVisuals(G, effDt);
  updateEffects(effDt, dt);

  // 렌더
  const r0 = performance.now();
  computeView();
  const time = now / 1000;
  fillMobs(view, alpha, p.x);
  fillDecor(view, time);
  fillTop(view, alpha, G, time);
  fillUnder(view, G, time, input.dashHeld && p.alive && G.mode === 'play' ? dashPreview(G, input, tmp2) : null);
  fillParticlesBatch(view);
  fillOver(view, G, time, alpha);
  renderer.begin(view.iw, view.ih);
  renderer.ground(view.left, view.top, atlas.rects[SPR.ground], atlas.rects[SPR.ground_dirt], CONFIG.decor.dirtThreshold);
  renderer.sprites(batches.decor, G.time);
  renderer.shapes(batches.under);
  renderer.sprites(batches.mobs, G.time);
  renderer.sprites(batches.top, G.time);
  renderer.shapes(batches.parts);
  renderer.shapes(batches.over);
  renderer.end();
  const renderMs = performance.now() - r0;

  if (G.mode === 'play' || G.mode === 'paused' || G.mode === 'levelup') { UI.updateHud(G, now, input); UI.updateBossArrows(G, view); }
  if (ticks) simAvg = simAvg * 0.9 + (simMs / ticks) * 0.1;
  renderAvg = renderAvg * 0.9 + renderMs * 0.1;
  if (G.bench) benchFrame(frameMs, simMs, ticks, renderMs);
  if (DEBUG && now - dbgT > 250) {
    dbgT = now;
    UI.setDebug(
      `fps ${fpsWin.fps.toFixed(0)}  mobs ${M.n}\n` +
      `sim ${simAvg.toFixed(2)} ms/tick  render ${renderAvg.toFixed(2)} ms\n` +
      `quality ${['low', 'mid', 'high'][getQualityLevel()]} (${save.data.settings.quality})  ${renderer.isGL2 ? 'WebGL2' : 'WebGL1'}\n` +
      `internal ${view.iw}x${view.ih}  zoom ${G.zoomShort}  t ${G.time.toFixed(1)}s\n` +
      `drawn ${batches.mobs.count}  near ${G.nearCount}` + (bench.report ? '\n' + bench.report : ''));
  }
}

// ------------------------------------------------------------ 부팅
async function boot() {
  save.load();
  setSound(save.data.settings.sound);
  canvas = document.getElementById('gl');
  try {
    renderer = new Renderer(canvas);
  } catch (e) {
    UI.fatal('WebGL is not available on this device/browser.\n' + e.message);
    return;
  }
  await initI18n(save.data.settings.lang);
  const assets = await loadAssets();
  atlas = buildAtlas(SPRITE_ORDER, assets.sprites);
  renderer.setAtlas(atlas);
  setSpriteRects(atlas.rects);
  if (DEBUG) console.table(assets.report);

  const cap = Math.max(CONFIG.sim.maxMobs, BENCH_N);
  initSim(cap);
  allocBatches(cap);

  applyQualitySetting();
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 50));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

  initInput(document.getElementById('touch'), {
    blocked: () => G.mode !== 'play',
    onAnyPress: unlockAudio,
    onTap: (x, y) => {
      if (G.mode !== 'play' || !G.player.alive) return;
      screenToWorld(x, y, tmp2);
      if (!queueTap(tmp2[0], tmp2[1])) { UI.manaShake(); sfx.deny(); }
    },
    onDashHold: () => {},
    onDash: () => { if (G.mode === 'play' && tryDash(G, input)) sfx.dash(); },
    onShield: () => runShop('shield'),
    onDashUp: () => runShop('dash'),
    onPause: () => { if (G.mode === 'play') pause(); else if (G.mode === 'paused') resume(); },
  });

  UI.initUI({
    assets, atlas,
    start: startGame,
    resume, toTitle, pause,
    retry: startGame,
    runShop,
    dashDown: () => { if (G.mode === 'play') { unlockAudio(); input.dashHeld = true; } },
    dashUp: () => { if (input.dashHeld) { input.dashHeld = false; if (G.mode === 'play' && tryDash(G, input)) sfx.dash(); } },
    dashCancel: () => { input.dashHeld = false; },
    onSound: (on) => setSound(on),
    onQuality: () => applyQualitySetting(),
    debug: DEBUG,
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { pause(); suspendAudio(true); }
    else { suspendAudio(false); last = performance.now(); }
  });

  last = performance.now();
  requestAnimationFrame(frame);

  if (BENCH_N > 0) startGame();
  else UI.showScreen(save.data.settings.nickname ? 'title' : 'nick');
}

function runShop(kind) {
  if (G.mode !== 'play') return;
  const ok = kind === 'shield' ? buyShield(G) : buyDash(G);
  if (ok) sfx.buy(); else { sfx.deny(); UI.shopDeny(kind); }
}

boot().catch((e) => { console.error(e); UI.fatal(String(e && e.stack || e)); });

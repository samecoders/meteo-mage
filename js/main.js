// 부팅, 화면 크기, 메인 루프(고정 틱 + 보간 렌더), 게임 흐름.
import { CONFIG, TICK_DT, applyDifficulty } from './config.js';
import { save } from './save.js';
import { initI18n, t, fmt } from './i18n.js';
import { loadAssets, SPRITE_ORDER, SPR } from './assets.js';
import { buildAtlas } from './render/atlas.js';
import { Renderer } from './render/gl.js';
import { batches, allocBatches, fillMobs, fillDecor, fillTop, fillUnder, fillParticlesBatch, fillOver, emitVisuals } from './render/sprites.js';
import { updateEffects, shake, setQualityLevel, getQualityLevel, setSpriteRects, addSpriteFx } from './render/effects.js';
import { G, initSim, newGame, tick, queueMeteor, learnMeteor, resumePush } from './game.js';
import { M, B } from './sim/mobs.js';
import { dropItem, applyItem, KIND } from './items.js';
import { autoplay, startAutoplay, autoplayStep } from './autoplay.js';
import { input, initInput, updateInput, resetInput } from './input.js';
import { updatePlayer } from './player.js';
import { tryDash, dashPreview } from './dash.js';
import { buyShield, buyDash } from './shop.js';
import { cardsFor, applyCard, isLearnLevel, cardPct } from './upgrade.js';
import { sfx, unlockAudio, setSound, suspendAudio, setVolumes, setMusicScene, duckMusic, playMusic, playJingle, preloadMusic, audioReady, setOnUnlock } from './audio.js';
import { currentMusic } from './music.js';
import { bench, parseBench, setupBench, benchInput, benchTick, benchFrame } from './bench.js';
import { submitScore, startPendingLoop, fetchTop } from './ranking.js';
import { HEROES, heroPrice, ownsHero } from './shop.js';
import { spawnTreasure, treasureTargets, siege, KIND_WOOD, KIND_GOLD, KIND_RUIN } from './treasure.js';
import { relicChoices, applyRelic, wouldResonate, RELIC_KEYS } from './relics.js';
import { triggerEvent } from './events.js';
import { killFraction, mobHpNow } from './meteor.js';
import * as UI from './ui.js';

const params = new URLSearchParams(location.search);
// ?difficulty=easy|normal|hard : 시험용(랭킹은 normal 만 등록). 화면에는 아직 난이도 선택 없음
if (params.get('difficulty')) applyDifficulty(params.get('difficulty'));
const BENCH_N = parseBench();
const AUTOPLAY = params.get('autoplay') === '1';
const DEBUG = params.get('debug') === '1' || BENCH_N > 0 || AUTOPLAY;

const view = {
  cssW: 1, cssH: 1, dpr: 1, devW: 1, devH: 1,
  iw: 360, ih: 640, curShort: CONFIG.view.baseShort,
  camX: 0, camY: 0, left: 0, top: 0,
  leadX: 0, leadY: 0,
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
  if (!BENCH_N) unlockAudio();
  slowUntil = 0;
  UI.clearToasts(); UI.hideDeathCause();
  newGame({ skin: save.data.skinEquipped, hero: save.data.heroEquipped, bench: BENCH_N > 0, benchCount: BENCH_N });
  if (BENCH_N > 0) setupBench(G, BENCH_N);
  view.camX = G.player.x; view.camY = G.player.y; view.leadX = 0; view.leadY = 0;
  G.escapeHint = CONFIG.meteor.escapeHint && save.data.settings.escapeHint;   // 그림 전용
  view.curShort = G.zoomShort;
  acc = 0; alpha = 0;
  resetInput();
  UI.showScreen(null);
  UI.showHud(true);
  if (!save.data.tutorialDone && !G.bench && !AUTOPLAY) {
    // 안내 중에는 게임이 멈춰 있음(시간·몹 생성 없음). 끝나거나 건너뛰면 그때부터 시작
    G.mode = 'intro';
    UI.startTutorial(() => {
      save.data.tutorialDone = true; save.write();
      if (G.mode === 'intro') { G.mode = 'play'; acc = 0; last = performance.now(); resetInput(); }
    });
  }
}

function toTitle() {
  G.mode = 'title';
  UI.clearToasts(); UI.hideDeathCause();
  UI.stopTutorial();
  UI.hideLearn();
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

/** 레벨업: 카드 2장(또는 특수 3장) — 고르면 즉시 재개하고 주변 몹을 밀어냄. 레벨 5는 메테오 습득 연출 */
function showLevelUp() {
  if (!G.levelQueue.length) { if (G.relicQueue.length) { G.mode = 'relic'; showRelicChoice(); } else finishLevelUps(); return; }
  const level = G.levelQueue[0];
  if (isLearnLevel(level)) { showLearn(); return; }
  const { special, cards } = cardsFor(G, level);
  if (!cards.length) { G.levelQueue.shift(); showLevelUp(); return; }
  playJingle('levelup');
  addSpriteFx(0, 4, SPR.fx_levelup, 1, 0.9, 0, -10, false, true);
  // 다시 뽑기: 무작위 카드(마법탄·특수)일 때만 — 범위/위력 두 장은 항상 같으므로 없음
  const canReroll = G.rerollLeft > 0 && (special || level < CONFIG.meteor.unlockLevel);
  UI.showLevelUp(level, special, cards, (id) => {
    applyCard(G, id);
    G.levelQueue.shift();
    sfx.click();
    showLevelUp();
  }, canReroll ? () => { G.rerollLeft--; sfx.click(); showLevelUp(); } : null);
}
/** 유물 선택: 화면 위쪽 절반, 게임 정지. 고르면 주변 몹을 밀어내고 재개 */
function showRelicChoice() {
  if (!G.relicQueue.length) { finishLevelUps(); return; }
  const tier = G.relicQueue[0];
  const cards = relicChoices(G, tier);
  if (!cards.length) { G.relicQueue.shift(); showRelicChoice(); return; }
  sfx.chest('gold');
  UI.showRelicChoice(tier, cards.map((k) => ({ key: k, res: wouldResonate(G, k) })), (key) => {
    applyRelic(G, key);
    G.relicQueue.shift();
    sfx.click();
    showRelicChoice();
  });
}
function finishLevelUps() {
  UI.showScreen(null);
  resumePush();
  G.mode = 'play'; last = performance.now(); acc = 0;
}
/** 레벨 5: 게임이 잠깐 멈추고 하늘에서 빛 + "메테오 습득!" 3초 안내. 마력 링은 가득 찬 채로 시작 */
function showLearn() {
  G.mode = 'learn';
  learnMeteor();
  UI.showScreen(null);
  playJingle('meteor');
  vibrate(80);
  worldToScreen(G.player.x, G.player.y, tmp2);
  UI.showLearn(tmp2[0], () => {
    if (G.mode !== 'learn') return;
    G.levelQueue.shift();
    UI.manaFullFx();
    if (G.levelQueue.length) { G.mode = 'levelup'; showLevelUp(); }
    else finishLevelUps();
  });
}

/** 죽은 원인 문구: 내 메테오 / 포위당함 / 늑대 무리 / 보스 / 드래곤 불덩이 … */
function deathCauseText() {
  const src = G.stats.deathBy;
  if (!src) return '';
  if (src === 'meteor') return t('death.meteor');
  if (src === 'boss') return t('death.boss');
  if (src === 'fireball') return t('death.fireball');
  if (G.time - G.lastRingT < 20) return t('death.ring');          // 포위 무리가 나온 뒤 20초 안
  return t('death.mob', { mob: t('mob.' + src) });
}

/** 결과 화면 다음 목표: 내 최고 기록까지 / 캐릭터 해금까지 / 이번 주 10위까지 */
function goalLines(rec, prevBest, weekTop) {
  const out = [];
  if (prevBest && rec.kills < prevBest.kills) out.push(t('goal.best', { n: fmt(prevBest.kills - rec.kills) }));
  const next = HEROES.filter((h) => !ownsHero(h)).sort((a, b) => heroPrice(a) - heroPrice(b))[0];
  if (next) {
    const need = heroPrice(next) - save.data.bank;
    out.push(need > 0 ? t('goal.hero', { name: t('hero.' + next), n: fmt(need) }) : t('goal.heroReady', { name: t('hero.' + next) }));
  }
  if (weekTop && weekTop.length >= 10 && rec.kills < weekTop[9].kills) out.push(t('goal.week10', { n: fmt(weekTop[9].kills - rec.kills) }));
  return out;
}

async function gameOver() {
  UI.stopTutorial();
  const s = G.stats;
  const prevBest = save.data.best && save.data.best.season === CONFIG.ranking.season ? { ...save.data.best } : null;
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
  UI.showGameOver(rec, bankAdd, isBest, deathCauseText(), G.relics.slice());
  UI.showGoals(goalLines(rec, prevBest, null));
  if (G.bench) return;
  const st = save.data.settings;
  if (!st.nickname) { UI.setRankStatus({ ok: false, noNick: true }); return; }
  UI.setRankStatus({ pending: true });
  const r = await submitScore({ ...rec, nickname: st.nickname, country: st.country || 'XX' });
  if (G.mode !== 'over') return;                       // 이미 다시 시작함
  UI.setRankStatus(r);
  if (r.ok) {
    const wk = await fetchTop('week', null, 10).catch(() => null);
    if (G.mode === 'over' && wk && !wk.offline) UI.showGoals(goalLines(rec, prevBest, wk.rows));
  }
}

function vibrate(ms) { if (save.data.settings.vibrate && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* */ } } }

function processEvents() {
  const ev = G.events;
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    switch (e.type) {
      case 'explosion': sfx.explosion(G.skin, e.kills); duckMusic(); if (e.kills > 500) vibrate(Math.min(120, 20 + e.kills / 100)); break;
      case 'combo': {
        UI.comboPopup(e.kills, e.mult);
        worldToScreen(e.x, e.y, tmp2);
        UI.killPopup(tmp2[0], tmp2[1], e.kills);
        break;
      }
      case 'launch': sfx.launch(); playJingle('call_' + G.skin.id, false, CONFIG.audio.callDuck); break;   // 모양별 메테오 징글, 음악 절반
      case 'launch2': sfx.launch(); break;
      case 'eventWarn':   // 사건 2초 전: 상단 경고(음악은 경고 순간 전환)
        UI.toast(t('event.warn.' + e.kind), 'warn big'); sfx.ringWarn(); vibrate(60); break;
      case 'compassHint': if (treasureTargets(G).length) UI.toast(t('event.compass'), 'treasure'); break;
      case 'manaFull': UI.manaFullFx(); sfx.manaFull(); vibrate(30); break;
      case 'dashReady': UI.dashReadyFx(); sfx.dashReady(); break;
      case 'levelup': showLevelUp(); break;
      case 'relicChoice': showRelicChoice(); break;
      case 'relic': UI.toast(t('relic.' + e.key + '.name'), 'legend', 'relic_' + e.key); playJingle('relic'); break;
      case 'resonance': UI.toast(t('relic.resonance') + ' ' + t('res.' + e.key), 'ruin big'); playJingle('resonance'); vibrate(120); break;
      case 'phoenix': UI.toast(t('relic.phoenixRevive'), 'legend big'); sfx.learn(); vibrate(200); break;
      case 'boss': UI.toast(t('boss.appears', { name: t('boss.' + CONFIG.boss.kinds[e.kind].key) }), 'warn'); playJingle('bossj'); vibrate(80); break;
      case 'bossKill': UI.toast(t('boss.killed'), 'gold'); sfx.bossKill(); break;
      case 'bossCharge': sfx.charge(); break;
      case 'summon': sfx.summon(); break;
      case 'fireball': sfx.fireball(); break;
      case 'fireHit': addSpriteFx(e.x, e.y, SPR.fx_explosion, 1, 0.3, 0, 0); break;
      case 'item':
        sfx.item(e.kind, e.rarity);
        UI.toast(t('item.' + e.kind + '.name'), e.rarity === 'legend' ? 'legend' : e.rarity === 'rare' ? 'rare' : e.kind === 'chest' ? 'gold' : 'mana', e.kind);
        addSpriteFx(e.x, e.y, SPR.fx_hit, 1, 0.3, 0, -40);
        vibrate(e.rarity === 'legend' ? 80 : 30);
        break;
      case 'heal': sfx.heal(); break;
      // ---- 보물
      case 'treasureSpawn': if (e.kind !== 'wood') UI.toast(t('treasure.spawn.' + e.kind), e.kind === 'ruin' ? 'ruin' : 'treasure'); break;
      case 'treasureOpen':
        UI.toast(t('treasure.open.' + e.kind), (e.kind === 'ruin' ? 'ruin' : 'treasure') + ' big');
        playJingle('chest'); vibrate(e.kind === 'wood' ? 40 : 120);
        if (e.kind === 'ruin') { UI.ruinSky(); setTimeout(() => UI.toast(t('treasure.siege'), 'warn big'), 1000); }
        break;
      case 'mimic': UI.toast(t('treasure.mimic'), 'warn big'); playJingle('bossj'); vibrate(100); break;
      case 'mimicKill': break;   // 보상 알림은 treasureOpen(kind mimic)
      case 'rune': UI.toast(t('treasure.rune', { n: e.n, of: e.of }), 'ruin'); sfx.rune(); break;
      case 'elitesCleared': UI.toast(t('treasure.elites'), 'treasure'); break;
      case 'kill': if (e.k > 0) sfx.kill(e.n); break;
      case 'bolt': sfx.bolt(); break;
      case 'nearMiss': UI.toast(t('nearMiss'), 'mana'); sfx.nearMiss(); break;
      case 'shieldBreak': UI.toast(t('shield.broken'), 'mana'); sfx.shield(); vibrate(60); break;
      case 'death': {   // 0.6초 슬로모션 + 죽은 원인 크게
        sfx.death(); vibrate(250);
        slowUntil = performance.now() + CONFIG.ui.deathSlowMs;
        UI.showDeathCause(deathCauseText());
        break;
      }
      case 'hurt': sfx.hurt(); vibrate(60); UI.hurtFx(); break;
      case 'gameover': playJingle('gameover', true); gameOver(); break;
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
  if (now < slowUntil) dt *= CONFIG.ui.deathSlowScale;   // 죽는 순간 슬로모션
  const frameMs = now - last;
  last = now;
  if (dt > 0.25) dt = 0.25;
  if (dt < 0) dt = 0;
  autoQuality(dt);
  if (renderer.lost) return;

  updateInput();
  if (G.bench && G.mode === 'play') benchInput(G, input, dt);

  let ticks = 0, simMs = 0, effDt = 0;
  if (AUTOPLAY && autoplay.on) {
    // 자동 플레이: 게임 프레임을 여러 번 돌려 빨리 감기(렌더는 지금 상태만)
    const t0 = performance.now();
    UI.setAutoplayText(autoplayStep(CONFIG.bench.autoplaySpeed));
    simMs = performance.now() - t0;
    effDt = dt; alpha = 1;
  } else if (G.mode === 'play') {
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

  // 카메라: 법사를 부드럽게 따라감 + 이동 방향으로 살짝 앞을 더 보여 줌(lead), 줌은 천천히
  const p = G.player;
  if (G.mode === 'play' || G.mode === 'over') {
    const V = CONFIG.view, k = 1 - Math.exp(-V.camLerp * dt);
    let lx = p.vx * V.lead, ly = p.vy * V.lead;
    const ll = Math.hypot(lx, ly);
    if (ll > V.leadMax) { lx *= V.leadMax / ll; ly *= V.leadMax / ll; }
    if (!p.alive) { lx = 0; ly = 0; }
    const kl = 1 - Math.exp(-3 * dt);
    view.leadX += (lx - view.leadX) * kl; view.leadY += (ly - view.leadY) * kl;
    view.camX += (p.x + view.leadX - view.camX) * k; view.camY += (p.y + view.leadY - view.camY) * k;
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

  if (G.mode === 'play' || G.mode === 'paused' || G.mode === 'levelup' || G.mode === 'intro' || G.mode === 'learn' || G.mode === 'relic') { UI.updateHud(G, now, input); UI.updateBossArrows(G, view); }
  updateMusic(now);
  treasurePing(now);
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

// ------------------------------------------------------------ 보물이 화면 안이면 "띠링" — 가까울수록 빨라짐
let pingNext = 0;
function treasurePing(now) {
  if (G.mode !== 'play' || !G.player.alive || G.bench || AUTOPLAY) return;
  const list = treasureTargets(G);
  if (!list.length) return;
  const tg = list[0], T = CONFIG.treasure;
  worldToScreen(tg.x, tg.y, tmp2);
  const onScreen = tmp2[0] > 0 && tmp2[1] > 0 && tmp2[0] < view.cssW && tmp2[1] < view.cssH;
  if (!onScreen || tg.d > T.pingNear) return;
  if (now < pingNext) return;
  pingNext = now + 250 + 1000 * (tg.d / T.pingNear);
  sfx.ping(1 - tg.d / T.pingNear);
}

// ------------------------------------------------------------ 배경음악: 장면에 맞는 곡(2초 크로스페이드)
let battleUntil = 0, slowUntil = 0;
const musicHold = {};
const IN_GAME = { play: 1, paused: 1, levelup: 1, learn: 1, intro: 1, relic: 1 };
function updateMusic(now) {
  if (!audioReady() || G.bench || AUTOPLAY) return;
  const A = CONFIG.audio, inGame = !!IN_GAME[G.mode];
  let want = currentMusic();
  if (G.mode === 'title') want = UI.musicOverride() || 'title';   // 캐릭터 화면: 고른 캐릭터 테마
  else if (inGame) {
    // 우선순위(높은 순): 별 > 유적 대습격 > 보스 > 습격(늑대·골렘·포위) > 몹 2만 이상 > 캐릭터 테마.
    // 조건이 끝나도 hold(5초) 동안은 그 곡을 유지
    let boss = false;
    for (let i = 0; i < B.length; i++) if (B[i].active) { boss = true; break; }
    const raid = G.raidKind && G.time < G.raidUntil ? G.raidKind : null;
    const conds = [
      ['star', G.starT > 0 && G.player.alive],
      [A.tracks.ruin ? 'ruin' : 'siege', siege.siegeT > 0],
      ['boss', boss],
      [raid || '_raid', !!raid],
      ['battle', M.n >= A.battleMobs],
    ];
    want = (G.char && G.char.theme) || 'field';
    for (const [name, on] of conds) {
      if (on) musicHold[name] = now + A.hold * 1000;
      if (on || now < (musicHold[name] || 0)) { if (name !== '_raid') { want = name; break; } }
    }
  }
  setMusicScene(inGame);
  if (want && want !== currentMusic() && G.mode !== 'over') playMusic(want);
}
function onAudioUnlocked() {
  if (G.bench || AUTOPLAY) return;   // 측정·자동 플레이는 음악 없음
  updateMusic(performance.now());
  // 타이틀 곡 먼저, 나머지는 천천히 미리(게임 시작을 막지 않음)
  const theme = (CONFIG.characters[save.data.heroEquipped] || CONFIG.characters.mage).theme;
  setTimeout(() => preloadMusic([theme]), 1500);
  setTimeout(() => preloadMusic(['levelup', 'meteor', 'chest', 'call_' + save.data.skinEquipped]), 4000);
  setTimeout(() => preloadMusic(['relic', 'resonance', 'bossj', 'gameover']), 7000);
}

// ------------------------------------------------------------ 부팅
async function boot() {
  save.load();
  setSound(save.data.settings.sound);
  setVolumes(save.data.settings.musicVolume, save.data.settings.sfxVolume);
  setOnUnlock(onAudioUnlocked);
  // 첫 터치(어디든) 전에는 소리를 내지 않음
  window.addEventListener('pointerdown', () => { if (!BENCH_N && !AUTOPLAY) unlockAudio(); }, true);
  window.addEventListener('keydown', () => { if (!BENCH_N && !AUTOPLAY) unlockAudio(); }, true);
  canvas = document.getElementById('gl');
  try {
    renderer = new Renderer(canvas);
  } catch (e) {
    UI.fatal('WebGL is not available on this device/browser.\n' + e.message);
    return;
  }
  await initI18n(save.data.settings.lang);
  globalThis.__itemName = (k) => t('item.' + k + '.name');   // 아이템 그림이 없을 때 첫 글자용
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
    onTap: () => {},          // 평원을 톡 눌러도 아무 일 없음(이동 조이스틱만). 메테오는 버튼 / Space
    onMeteor: () => fireMeteor(),
    onDashHold: () => {},
    onDash: () => { if (G.mode === 'play' && tryDash(G, input)) sfx.dash(); },
    // 튕기기 대시: 이동하던 손가락을 빠르게 쓸고 뗌 → 그 방향으로
    flickEnabled: () => save.data.settings.flickDash,
    onFlick: (dx, dy) => { if (G.mode === 'play' && tryDash(G, input, dx, dy)) sfx.dash(); },
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
    meteor: () => fireMeteor(),
    onSound: (on) => setSound(on),
    onVolume: () => setVolumes(save.data.settings.musicVolume, save.data.settings.sfxVolume),
    onQuality: () => applyQualitySetting(),
    debug: DEBUG,
    // ?debug=1 : 아이템을 법사 옆에 바로 소환 / 레벨 올리기 / 무적
    debugItem: (key) => { if (G.mode !== 'play') return; const p = G.player; dropItem(KIND[key], p.x + p.faceX * 60, p.y + p.faceY * 60); },
    debugLevel: () => { if (G.mode !== 'play') return; G.addExp(G.stats.expNeed - G.stats.exp + 0.01); },
    debugGod: (b) => { G.god = !G.god; b.style.background = G.god ? '#e04040' : ''; },
    debugWood: () => { if (G.mode === 'play') spawnTreasure(G, KIND_WOOD, { near: true, mimic: false }); },
    debugMimic: () => { if (G.mode === 'play') spawnTreasure(G, KIND_WOOD, { near: true, mimic: true }); },
    debugGold: () => { if (G.mode === 'play') spawnTreasure(G, KIND_GOLD, { near: true }); },
    debugRuin: () => { if (G.mode === 'play') spawnTreasure(G, KIND_RUIN, { near: true }); },
    debugRelic: (key) => { if (G.mode === 'play') applyRelic(G, key); },
    debugRelicChoice: () => { if (G.mode === 'play') { G.relicQueue.push('normal'); } },
    debugEvent: (k) => { if (G.mode === 'play') triggerEvent(G, k); },
    relicKeys: RELIC_KEYS,
    // 레벨업 카드 예상 효과: 범위 → 면적 +32%, 위력 → '골렘 처치 범위 62% → 81%'
    // 범위·위력 카드 설명의 숫자를 이번 증가율로(같은 카드를 거듭 고르면 줄어듦)
    cardDesc: (id) => {
      const d = t(`card.${id}.desc`);
      if (id !== 'range' && id !== 'power') return d;
      return d.replace(id === 'range' ? /15/ : /30/, String(Math.round(cardPct(G, id) * 100)));
    },
    cardExtra: (id) => {
      const MC = CONFIG.meteor;
      if (id === 'range') return ' ' + t('card.range.extra', { n: Math.round(((1 + cardPct(G, 'range')) ** 2 - 1) * 100) });
      if (id !== 'power') return '';
      const P = G.meteorPower, P2 = P * (1 + cardPct(G, 'power'));
      for (const key of ['golem', 'darkknight', 'orc', 'skeleton', 'goblin', 'mushroom', 'slime', 'wolf']) {   // 단단한 몹부터: 처치 범위가 달라지는 첫 몹
        const hp = mobHpNow(key), a = killFraction(hp, P), b = killFraction(hp, P2);
        if (b > a + 0.005) return ' ' + t('card.power.extra', { mob: t('mob.' + key), a: Math.round(a * 100), b: Math.round(b * 100) });
      }
      return '';
    },
  });

  setupNativeApp();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { pause(); suspendAudio(true); }
    else { suspendAudio(false); last = performance.now(); }
  });

  last = performance.now();
  requestAnimationFrame(frame);
  // 못 올린 기록(최대 5개)은 30초마다 하나씩 다시 보냄 — 게임 중에는 서버 요청 없음
  if (!BENCH_N && !AUTOPLAY) startPendingLoop(() => !IN_GAME[G.mode]);

  if (BENCH_N > 0) startGame();
  else if (AUTOPLAY) {
    UI.showScreen(null);
    startAutoplay(CONFIG.bench.autoplayGames);
    view.camX = G.player.x; view.camY = G.player.y;
    UI.showHud(true);
  } else UI.showScreen(save.data.settings.nickname ? 'title' : 'nick');
}

/** 메테오 버튼 / Space: 마력이 가득 차면 지금 법사가 서 있는 자리에 메테오 */
function fireMeteor() {
  if (G.mode !== 'play' || !G.player.alive || !G.meteorLearned) return;
  unlockAudio();
  if (!queueMeteor()) { UI.manaShake(); sfx.deny(); }
}

function runShop(kind) {
  if (G.mode !== 'play') return;
  const ok = kind === 'shield' ? buyShield(G) : buyDash(G);
  if (ok) sfx.buy(); else { sfx.deny(); UI.shopDeny(kind); }
}

boot().catch((e) => { console.error(e); UI.fatal(String(e && e.stack || e)); });

// ------------------------------------------------------------ 앱(Capacitor) 전용: 웹에서는 아무것도 안 함
function setupNativeApp() {
  try {
    const Cap = window.Capacitor;
    if (!Cap || !Cap.isNativePlatform || !Cap.isNativePlatform()) return;
    document.documentElement.classList.add('native');
    const App = (Cap.Plugins && Cap.Plugins.App) || (Cap.registerPlugin && Cap.registerPlugin('App'));
    if (!App) return;
    App.addListener('backButton', () => {
      if (G.mode === 'play' && G.player.alive) { pause(); return; }   // 게임 중: 일시정지
      if (G.mode === 'intro') return;
      if (!UI.handleBack()) App.exitApp();                           // 타이틀: 앱 종료
    });
  } catch (e) { console.warn('native setup failed', e); }            // 앱 기능이 안 돼도 게임은 계속
}

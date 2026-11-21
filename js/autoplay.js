// 자동 플레이 봇(?autoplay=1, tools/balance.html, node 측정 공용). 게임 규칙 코드를 그대로 써서 실제와 같은 틱으로 진행.
// 몹에게서 멀어지는 쪽으로 이동하며 몹을 끌고 다니다가, 마력이 차고 몹이 충분히 모이면 메테오 버튼(내 자리) →
// 몹이 적은 쪽으로 탈출(필요하면 대시). 가까운 아이템 줍기.
import { CONFIG } from './config.js';
import { G, initSim, newGame, tick, queueMeteor, learnMeteor, resumePush } from './game.js';
import { M, B } from './sim/mobs.js';
import { grid, cellX, cellY } from './sim/grid.js';
import { updatePlayer, playerSpeed } from './player.js';
import { tryDash } from './dash.js';
import { cardsFor, applyCard, isLearnLevel } from './upgrade.js';
import { buyShield, buyDash, shieldPrice, dashPrice } from './shop.js';
import { fireballs, items, KINDS } from './items.js';
import { meteors, threatOnPlayer, escapeDir } from './meteor.js';
import { treasureTargets } from './treasure.js';
import { relicChoices, applyRelic } from './relics.js';

let inited = false;
const SPECIAL_PRIORITY = ['vitality', 'twin', 'dash2', 'fastFall', 'magnet', 'fire'];
const BOLT_PRIORITY = ['boltCount', 'boltRate', 'boltPierce'];

/** 레벨업 대기열 처리(카드 고르기 / 메테오 습득) — 화면 없이 바로 */
function resolveLevelUps() {
  while (G.levelQueue.length) {
    const lv = G.levelQueue[0];
    if (isLearnLevel(lv)) learnMeteor();
    else {
      const { special, cards } = cardsFor(G, lv);
      let pick = cards[0];
      if (special) { for (const id of SPECIAL_PRIORITY) if (cards.includes(id)) { pick = id; break; } }
      else if (cards.includes('range')) pick = G.rangeLevel <= G.powerLevel ? 'range' : 'power';
      else { for (const id of BOLT_PRIORITY) if (cards.includes(id)) { pick = id; break; } }
      if (pick) applyCard(G, pick);
    }
    G.levelQueue.shift();
  }
  while (G.relicQueue.length) {   // 유물은 무작위 선택
    const c = relicChoices(G, G.relicQueue.shift());
    if (c.length) applyRelic(G, c[(G.rng() * c.length) | 0]);
  }
  resumePush();
  G.mode = 'play';
}

/** 한 판 시작. skill: 0~1 (반응 속도) */
export function startBotGame({ seed = 1, skill = 0.8, hero = 'fire_mage' } = {}) {
  if (!inited) { if (!M.x) initSim(CONFIG.sim.maxMobs); inited = true; }
  newGame({ seed, hero });
  return {
    seed, skill, f: 0, inp: { mx: 0, my: 0, dashHeld: false }, lx: 1, ly: 0,
    thinkEvery: Math.max(1, Math.round(6 - skill * 4)), meteors: 0, dashes: 0, hits: 0, items: 0,
    treasure: globalThis.__botTreasure ?? true,   // 보물을 찾아가 열지(비교용으로 끌 수 있음)
    lvTimes: {}, manaFullAt: -1, manaWaits: [], fullT: 0, esc: [0, 0],
    need: globalThis.__botNeed ?? 10, wait: globalThis.__botWait ?? 2,
  };
}

/** 60fps 한 프레임 진행. 판이 끝나면 true */
export function botFrame(st) {
  const p = G.player, dt = 1 / 60;
  if (G.mode === 'levelup' || G.mode === 'learn' || G.mode === 'relic') resolveLevelUps();
  if (G.mode !== 'play') return true;
  if (st.f % st.thinkEvery === 0) think(st);
  updatePlayer(G, st.inp, dt);
  if (st.f & 1) tick();
  st.f++;
  for (let i = 0; i < G.events.length; i++) {
    const e = G.events[i];
    if (e.type === 'hurt') st.hits++;
    else if (e.type === 'item') st.items++;
    else if (e.type === 'manaFull') st.manaFullAt = G.time;
    else if (e.type === 'launch' && st.manaFullAt >= 0) st.manaWaits.push(G.time - st.manaFullAt);
  }
  G.events.length = 0;
  const lv = G.stats.level;
  if (!st.lvTimes[lv]) st.lvTimes[lv] = +G.time.toFixed(1);
  return !p.alive && G.dying > 1.4;
}

export function botResult(st) {
  const s = G.stats;
  return {
    seed: st.seed, survived: +G.time.toFixed(1), died: !G.player.alive, deathBy: s.deathBy || '-',
    kills: s.kills, level: s.level, maxCombo: s.maxCombo, meteors: s.meteors, dashes: st.dashes, hits: st.hits, items: st.items,
    treasures: G.stats.treasures || 0, relics: G.relics.length,
    lv5: st.lvTimes[5] ?? null, lv7: st.lvTimes[7] ?? null, lv8: st.lvTimes[8] ?? null, lv10: st.lvTimes[10] ?? null,
    manaCycle: s.meteors > 1 && st.lvTimes[5] != null ? +((G.time - st.lvTimes[5]) / s.meteors).toFixed(1) : null,   // 메테오 습득 후 평균 발사 간격
    dmgTaken: { ...s.dmgTaken }, mobs: M.n,
  };
}

/** 화면 없이 한 판 전체 */
export function runGame({ seed = 1, maxSec = 900, skill = 0.8, hero = 'fire_mage' } = {}) {
  const st = startBotGame({ seed, skill, hero });
  const frames = maxSec * 60;
  for (let f = 0; f < frames; f++) if (botFrame(st)) break;
  return botResult(st);
}

// ------------------------------------------------------------ 봇의 판단 (격자 밀도만 읽음)
function think(st) {
  const p = G.player, g = grid, cs = g.cs, cols = g.cols, cnt = g.count, inp = st.inp, skill = st.skill;
  const pcx = cellX(p.x), pcy = cellY(p.y);
  const RC = 10;
  let close = 0, total = 0;
  for (let v = -RC; v <= RC; v++) {
    for (let u = -RC; u <= RC; u++) {
      const c = cnt[(pcy + v) * cols + pcx + u];
      if (!c) continue;
      total += c;
      const wx = (u + 0.5) * cs, wy = (v + 0.5) * cs;
      if (wx * wx + wy * wy < 75 * 75) close += c;
    }
  }
  for (let i = 0; i < B.length; i++) {
    const b = B[i];
    if (!b.active) continue;
    const wx = b.x - p.x, wy = b.y - p.y;
    if (wx * wx + wy * wy < 90 * 90) close += 5;
  }
  // 위험 지점: 떨어지는 내 메테오
  const danger = [];
  for (let i = 0; i < meteors.length; i++) { const m = meteors[i]; if (m.active) danger.push(m); }

  const tl = st.treasure ? treasureTargets(G) : null;
  const tg = tl && tl.length && tl[0].d < 1600 ? tl[0] : null;
  let mx = 0, my = 0, bestScore = 1e18;
  const spd = playerSpeed(G), star = G.starT > 0;
  for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
    let score = 0;
    for (let h = 0; h < 2; h++) {
      const T = h ? 0.9 : 0.4;
      const fx = p.x + dx * spd * T, fy = p.y + dy * spd * T;
      if (!star) {
        for (let v = -RC; v <= RC; v++) {
          const cy = pcy + v;
          for (let u = -RC; u <= RC; u++) {
            const c = cnt[cy * cols + pcx + u];
            if (!c) continue;
            const wx = g.ox + (pcx + u + 0.5) * cs - fx, wy = g.oy + (cy + 0.5) * cs - fy;
            score += c / (wx * wx + wy * wy + 400) * (h ? 0.6 : 1);
          }
        }
        for (let i = 0; i < B.length; i++) {
          const b = B[i];
          if (!b.active) continue;
          const wx = b.x - fx, wy = b.y - fy;
          score += 40 / (wx * wx + wy * wy + 400);
        }
        for (let i = 0; i < fireballs.length; i++) {
          const fb = fireballs[i];
          if (!fb.active) continue;
          const wx = fb.x + fb.vx * T - fx, wy = fb.y + fb.vy * T - fy;
          score += 30 / (wx * wx + wy * wy + 200);
        }
      } else {
        // 무적의 별: 몹이 많은 쪽으로 돌진(닿으면 즉사)
        for (let v = -RC; v <= RC; v++) for (let u = -RC; u <= RC; u++) {
          const c = cnt[(pcy + v) * cols + pcx + u];
          if (!c) continue;
          const wx = g.ox + (pcx + u + 0.5) * cs - fx, wy = g.oy + (pcy + v + 0.5) * cs - fy;
          score -= c / (wx * wx + wy * wy + 400);
        }
      }
      for (const m of danger) {
        const wx = m.x - fx, wy = m.y - fy, R = G.meteorRadius + 30;
        if (wx * wx + wy * wy < R * R) score += 50;
      }
    }
    // 아이템 쪽으로 끌림
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.active || it.fly > 0) continue;
      const wx = it.x - p.x, wy = it.y - p.y, d = Math.hypot(wx, wy);
      if (d > 650) continue;
      const toward = (wx * dx + wy * dy) / (d || 1);
      score *= 1 - 0.35 * Math.max(0, toward) * (1 - d / 700);
    }
    // 보물 나침반을 따라감(가장 가까운 보물)
    if (tg) {
      const toward = ((tg.x - p.x) * dx + (tg.y - p.y) * dy) / (tg.d || 1);
      score *= 1 - 0.5 * Math.max(0, toward);
    }
    score *= 1 - 0.08 * (dx * st.lx + dy * st.ly);   // 방향을 너무 자주 바꾸지 않게
    if (score < bestScore) { bestScore = score; mx = dx; my = dy; }
  }
  if (total === 0 && !items.some((it) => it.active)) { mx = Math.cos(G.time * 0.3); my = Math.sin(G.time * 0.3); }
  st.lx = mx; st.ly = my;
  inp.mx = mx; inp.my = my;
  // 상자 위에 도착: 멈춰서 열기(몹이 너무 붙으면 포기하고 계속 움직임)
  if (tg && tg.d < CONFIG.treasure.openRadius * 0.7 && close < 4 && tg.t.kind !== 2) { inp.mx = 0; inp.my = 0; }
  else if (tg && tg.d < 160) { inp.mx = (tg.x - p.x) / tg.d; inp.my = (tg.y - p.y) / tg.d; }

  // 내 메테오 반경 안: 몹이 적은 쪽으로 탈출. 곧장 달려서 늦으면 대시
  const threat = star ? null : threatOnPlayer(G);
  if (threat) {
    escapeDir(G, threat, st.esc);
    inp.mx = st.esc[0]; inp.my = st.esc[1];
    const d = Math.hypot(p.x - threat.x, p.y - threat.y), need = (G.meteorRadius + 12 - d) / spd, rem = threat.fall - threat.t;
    if (rem < need + 0.12 + (1 - skill) * 0.1 && p.dashCharges >= 1 && p.dashT <= 0) { if (tryDash(G, inp)) st.dashes++; }
  } else if (G.meteorLearned && G.mana >= CONFIG.mana.max && !star) {
    // 마력이 찼으면 천천히 걸어 몹이 따라붙게
    inp.mx *= 0.55; inp.my *= 0.55;
  }

  // 위험하면 대시(가장 덜 붐빈 쪽으로)
  if (!star && !threat && close >= 3 && p.dashCharges >= 1 && p.dashT <= 0) { if (tryDash(G, inp)) st.dashes++; }

  // 상점
  if (!p.shield && G.stats.gold >= shieldPrice(G)) buyShield(G);
  else if (p.dashLevel < CONFIG.dash.maxUpgrades && G.stats.gold >= dashPrice(G) * 2) buyDash(G);

  // 메테오 버튼: 마력이 찼고 반경 안에 몹이 충분히 모였으면(또는 오래 기다렸으면) 내 자리에. 이미 떨어지는 중이면 기다림
  if (G.meteorLearned && G.mana >= CONFIG.mana.max && !threat) {
    st.fullT += st.thinkEvery / 60;
    const R = G.meteorRadius * 0.85, rc = Math.ceil(R / cs);
    let inR = 0;
    for (let v = -rc; v <= rc; v++) for (let u = -rc; u <= rc; u++) {
      if ((u * cs) ** 2 + (v * cs) ** 2 > R * R) continue;
      inR += cnt[(pcy + v) * cols + pcx + u];
    }
    if ((inR >= st.need || st.fullT > st.wait) && queueMeteor()) { st.meteors++; st.fullT = 0; }
  } else st.fullT = 0;
}

// ------------------------------------------------------------ 브라우저: ?autoplay=1 — 10판 빨리 감기 + 결과 표시
export const autoplay = { on: false, games: 0, idx: 0, st: null, results: [], done: false, text: '' };

export function startAutoplay(n) {
  autoplay.on = true; autoplay.games = n; autoplay.idx = 0; autoplay.results = []; autoplay.done = false;
  autoplay.st = startBotGame({ seed: 1001, skill: 0.8 });
}

/** 화면 프레임마다 호출: speed 게임 프레임만큼 진행. 결과 문구 반환 */
export function autoplayStep(speed) {
  if (!autoplay.on || autoplay.done) return autoplay.text;
  const maxF = CONFIG.bench.autoplayMaxSec * 60;
  for (let k = 0; k < speed; k++) {
    const end = botFrame(autoplay.st) || autoplay.st.f >= maxF;
    if (!end) continue;
    autoplay.results.push(botResult(autoplay.st));
    autoplay.idx++;
    if (autoplay.idx >= autoplay.games) { autoplay.done = true; break; }
    autoplay.st = startBotGame({ seed: 1001 + autoplay.idx, skill: 0.8 });
    break;
  }
  autoplay.text = summary();
  if (autoplay.done) console.log(autoplay.text);
  return autoplay.text;
}

export function summary(results = autoplay.results, total = autoplay.games) {
  const R = results, n = R.length;
  const avg = (f) => (n ? R.reduce((a, r) => a + f(r), 0) / n : 0);
  const avgOf = (k) => { const v = R.filter((r) => r[k] != null); return v.length ? (v.reduce((a, r) => a + r[k], 0) / v.length).toFixed(0) + 's' : '-'; };
  const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  let txt = `AUTOPLAY ${n}/${total}` + (n < total && G.time ? `  (판 ${n + 1}: ${fmtT(G.time)} Lv.${G.stats.level})` : '') + '\n';
  if (n) {
    txt += `평균 생존 ${fmtT(avg((r) => r.survived))}  평균 레벨 ${avg((r) => r.level).toFixed(1)}  평균 킬 ${Math.round(avg((r) => r.kills))}\n`;
    txt += `레벨5 도달 ${avgOf('lv5')}  레벨7 도달 ${avgOf('lv7')}  메테오 주기 ${avgOf('manaCycle')}\n`;
    txt += R.map((r) => `#${r.seed} ${fmtT(r.survived)} Lv${r.level} ${r.deathBy}`).join('  ');
  }
  return txt;
}
export { KINDS };

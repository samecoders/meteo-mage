// 자동 플레이 봇(?autoplay=1, tools/balance.html, node 측정 공용). 게임 규칙 코드를 그대로 써서 실제와 같은 틱으로 진행.
// 몹에게서 멀어지는 쪽으로 이동, 몹이 가장 많은 곳에 메테오(자기 메테오 반경 밖), 가까운 아이템 줍기.
import { CONFIG } from './config.js';
import { G, initSim, newGame, tick, queueTap, learnMeteor, resumePush } from './game.js';
import { M, B } from './sim/mobs.js';
import { grid, cellX, cellY } from './sim/grid.js';
import { updatePlayer, playerSpeed } from './player.js';
import { tryDash } from './dash.js';
import { cardsFor, applyCard, isLearnLevel } from './upgrade.js';
import { buyShield, buyDash, shieldPrice, dashPrice } from './shop.js';
import { fireballs, items, KINDS } from './items.js';
import { meteors } from './meteor.js';

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
  resumePush();
  G.mode = 'play';
}

/** 한 판 시작. skill: 0~1 (반응 속도) */
export function startBotGame({ seed = 1, skill = 0.8 } = {}) {
  if (!inited) { if (!M.x) initSim(CONFIG.sim.maxMobs); inited = true; }
  newGame({ seed });
  return {
    seed, skill, f: 0, inp: { mx: 0, my: 0, dashHeld: false }, lx: 1, ly: 0,
    thinkEvery: Math.max(1, Math.round(6 - skill * 4)), meteors: 0, dashes: 0, hits: 0, items: 0,
    lvTimes: {}, manaFullAt: -1, manaWaits: [],
  };
}

/** 60fps 한 프레임 진행. 판이 끝나면 true */
export function botFrame(st) {
  const p = G.player, dt = 1 / 60;
  if (G.mode === 'levelup' || G.mode === 'learn') resolveLevelUps();
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
    lv5: st.lvTimes[5] ?? null, lv7: st.lvTimes[7] ?? null, lv8: st.lvTimes[8] ?? null, lv10: st.lvTimes[10] ?? null,
    manaCycle: s.meteors > 1 && st.lvTimes[5] != null ? +((G.time - st.lvTimes[5]) / s.meteors).toFixed(1) : null,   // 메테오 습득 후 평균 발사 간격
    dmgTaken: { ...s.dmgTaken }, mobs: M.n,
  };
}

/** 화면 없이 한 판 전체 */
export function runGame({ seed = 1, maxSec = 900, skill = 0.8 } = {}) {
  const st = startBotGame({ seed, skill });
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
    score *= 1 - 0.08 * (dx * st.lx + dy * st.ly);   // 방향을 너무 자주 바꾸지 않게
    if (score < bestScore) { bestScore = score; mx = dx; my = dy; }
  }
  if (total === 0 && !items.some((it) => it.active)) { mx = Math.cos(G.time * 0.3); my = Math.sin(G.time * 0.3); }
  st.lx = mx; st.ly = my;
  inp.mx = mx; inp.my = my;

  // 위험하면 대시(가장 덜 붐빈 쪽으로)
  let inBlast = false;
  for (const m of danger) { const dx = p.x - m.x, dy = p.y - m.y; if (dx * dx + dy * dy < (G.meteorRadius + 10) ** 2 && m.fall - m.t < 0.35) inBlast = true; }
  if (!star && (close >= 3 || inBlast) && p.dashCharges >= 1 && p.dashT <= 0) { if (tryDash(G, inp)) st.dashes++; }

  // 상점
  if (!p.shield && G.stats.gold >= shieldPrice(G)) buyShield(G);
  else if (p.dashLevel < CONFIG.dash.maxUpgrades && G.stats.gold >= dashPrice(G) * 2) buyDash(G);

  // 메테오: 반경 바깥 고리 안에서 가장 빽빽한 곳을, 몹이 올 쪽으로 당겨서 조준
  if (G.meteorLearned && G.mana >= CONFIG.mana.max) {
    const R = G.meteorRadius, minD = R + 60, maxD = R + 420;
    const rc = Math.min(22, Math.ceil(maxD / cs));
    let best = 0, bu = 0, bv = 0;
    for (let v = -rc + 1; v < rc; v++) {
      for (let u = -rc + 1; u < rc; u++) {
        const wx = (u + 0.5) * cs, wy = (v + 0.5) * cs, d = Math.hypot(wx, wy);
        if (d < minD || d > maxD) continue;
        const c = (pcy + v) * cols + pcx + u;
        const s2 = cnt[c] + cnt[c - 1] + cnt[c + 1] + cnt[c - cols] + cnt[c + cols];
        if (s2 > best) { best = s2; bu = u; bv = v; }
      }
    }
    if (best > 0) {
      let tx = g.ox + (pcx + bu + 0.5) * cs, ty = g.oy + (pcy + bv + 0.5) * cs;
      const dx = p.x - tx, dy = p.y - ty, d = Math.hypot(dx, dy) || 1;
      const lead = 85 * G.fallTime * (0.4 + skill * 0.4);   // 몹이 법사 쪽으로 올 만큼 앞당김
      tx += dx / d * Math.min(lead, d - R - 30); ty += dy / d * Math.min(lead, d - R - 30);
      if (queueTap(tx, ty)) st.meteors++;
    }
  }
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

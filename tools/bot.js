// 밸런스 측정용 자동 플레이 봇 (화면 없이 게임 규칙만 돌림).
// tools/balance.html 에서 사용. 게임 코드(js/)를 그대로 불러와 실제와 같은 틱 로직으로 시뮬레이션한다.
import { CONFIG } from '../js/config.js';
import { G, initSim, newGame, tick, queueTap } from '../js/game.js';
import { M, B, SPEED, DMG } from '../js/sim/mobs.js';
import { grid, cellX, cellY } from '../js/sim/grid.js';
import { updatePlayer } from '../js/player.js';
import { tryDash } from '../js/dash.js';
import { cardsFor, applyCard } from '../js/upgrade.js';
import { buyShield, buyDash, shieldPrice, dashPrice } from '../js/shop.js';
import { fireballs, items } from '../js/items.js';

let inited = false;
const BASE_SPEED = Array.from(SPEED);
const BASE_DMG = Array.from(DMG);

/** 몹 타입별 속도·피해 덮어쓰기 (예: { bat: { speed: 110 } }) */
function applyOverrides(ov) {
  const T = CONFIG.mobs.types;
  for (let i = 0; i < T.length; i++) { SPEED[i] = BASE_SPEED[i]; DMG[i] = BASE_DMG[i]; }
  for (const key in (ov || {})) {
    const i = T.findIndex((t) => t.key === key);
    if (i < 0) continue;
    if (ov[key].speed !== undefined) SPEED[i] = ov[key].speed;
    if (ov[key].dmg !== undefined) DMG[i] = ov[key].dmg;
  }
}

const SPECIAL_PRIORITY = ['vitality', 'twin', 'dash2', 'fastFall', 'magnet', 'fire'];

/** 봇 한 판. skill: 0~1 (반응 지연·조준 실력) */
export function runGame({ seed = 1, maxSec = 600, overrides = null, skill = 0.8 } = {}) {
  if (!inited) { initSim(CONFIG.sim.maxMobs); inited = true; }
  applyOverrides(overrides);
  newGame({ seed });
  const p = G.player;
  const inp = { mx: 0, my: 0 };
  const st = { rot: (seed & 1) ? 1 : -1, think: 0, meteors: 0, dashes: 0, hits: 0, lx: 1, ly: 0 };
  const firstHit = {};
  const frames = maxSec * 60, dt = 1 / 60;
  const thinkEvery = Math.max(1, Math.round(6 - skill * 4));   // 실력이 낮을수록 늦게 반응
  let f = 0;
  for (; f < frames; f++) {
    if (G.mode === 'levelup') {
      const lv = G.levelQueue[0];
      const { special, cards } = cardsFor(G, lv);
      let pick = cards[0];
      if (special) { for (const id of SPECIAL_PRIORITY) if (cards.includes(id)) { pick = id; break; } }
      else pick = G.rangeLevel <= G.powerLevel ? 'range' : 'power';
      applyCard(G, pick);
      G.levelQueue.shift();
      if (!G.levelQueue.length) G.mode = 'play';
    }
    if (G.mode !== 'play') break;
    if (f % thinkEvery === 0) think(st, inp, skill);
    updatePlayer(G, inp, dt);
    if (f & 1) tick();
    for (let i = 0; i < G.events.length; i++) {
      const e = G.events[i];
      if (e.type === 'hurt') { st.hits++; if (!firstHit[e.src]) firstHit[e.src] = +G.time.toFixed(1); }
    }
    G.events.length = 0;
    if (!p.alive && G.dying > 1.4) break;
  }
  const s = G.stats;
  return {
    seed, survived: +G.time.toFixed(1), died: !p.alive, deathBy: s.deathBy || '-',
    kills: s.kills, level: s.level, maxCombo: s.maxCombo, meteors: st.meteors, dashes: st.dashes, hits: st.hits,
    dmgTaken: Object.fromEntries(Object.entries(s.dmgTaken).map(([k, v]) => [k, Math.round(v)])),
    firstHit, mobs: M.n,
  };
}

// ------------------------------------------------------------ 봇의 판단 (격자 밀도만 읽음)
function think(st, inp, skill) {
  const p = G.player, g = grid, cs = g.cs, cols = g.cols, cnt = g.count;
  const pcx = cellX(p.x), pcy = cellY(p.y);
  let rx = 0, ry = 0, total = 0, close = 0;
  const RC = 10;
  for (let v = -RC; v <= RC; v++) {
    const cy = pcy + v;
    for (let u = -RC; u <= RC; u++) {
      const c = cnt[cy * cols + pcx + u];
      if (!c) continue;
      const wx = g.ox + (pcx + u + 0.5) * cs - p.x, wy = g.oy + (cy + 0.5) * cs - p.y;
      const d2 = wx * wx + wy * wy + 100;
      const w = c / d2;
      rx -= wx * w; ry -= wy * w; total += c;
      if (d2 < 75 * 75) close += c;
    }
  }
  for (let i = 0; i < B.length; i++) {          // 보스는 크게 피함
    const b = B[i];
    if (!b.active) continue;
    const wx = b.x - p.x, wy = b.y - p.y, d2 = wx * wx + wy * wy + 100;
    if (d2 < 500 * 500) { const w = 60 / d2; rx -= wx * w; ry -= wy * w; if (d2 < 90 * 90) close += 5; }
  }
  let mx = 0, my = 0;
  if (total > 0) {
    // 16방향을 시험: 0.4초·0.9초 뒤 위치 주변이 가장 한산한 방향(지금 방향 유지 약간 선호)
    let bestScore = 1e18;
    const spd = CONFIG.player.speed;
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
      let score = 0;
      for (let h = 0; h < 2; h++) {
        const T = h ? 0.9 : 0.4;
        const fx = p.x + dx * spd * T, fy = p.y + dy * spd * T;
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
      }
      score *= 1 - 0.08 * (dx * st.lx + dy * st.ly);   // 방향을 너무 자주 바꾸지 않게
      if (score < bestScore) { bestScore = score; mx = dx; my = dy; }
    }
    st.lx = mx; st.ly = my;
  } else { mx = Math.cos(G.time * 0.3); my = Math.sin(G.time * 0.3); }
  for (let i = 0; i < items.length; i++) {      // 가까운 아이템은 주우러
    const it = items[i];
    if (!it.active) continue;
    const dx = it.x - p.x, dy = it.y - p.y, d = Math.hypot(dx, dy);
    if (d < 220 && close === 0) { mx += dx / d * 0.8; my += dy / d * 0.8; }
  }
  const ml = Math.hypot(mx, my) || 1;
  inp.mx = mx / ml; inp.my = my / ml;

  // 위험하면 대시(가장 덜 붐빈 쪽으로)
  if (close >= 3 && p.dashCharges >= 1 && p.dashT <= 0) { if (tryDash(G, inp)) st.dashes++; }

  // 상점
  if (!p.shield && G.stats.gold >= shieldPrice(G)) buyShield(G);
  else if (p.dashLevel < CONFIG.dash.maxUpgrades && G.stats.gold >= dashPrice(G) * 2) buyDash(G);

  // 메테오: 마력이 차면 반경 바깥 고리 안에서 가장 빽빽한 곳을, 몹이 올 쪽으로 당겨서 조준
  if (G.mana >= CONFIG.mana.max) {
    const R = G.meteorRadius, minD = R + 60, maxD = R + 420;
    const rc = Math.min(22, Math.ceil(maxD / cs));
    let best = 0, bu = 0, bv = 0;
    for (let v = -rc + 1; v < rc; v++) {
      for (let u = -rc + 1; u < rc; u++) {
        const wx = (u + 0.5) * cs, wy = (v + 0.5) * cs, d = Math.hypot(wx, wy);
        if (d < minD || d > maxD) continue;
        const c = (pcy + v) * cols + pcx + u;
        const s = cnt[c] + cnt[c - 1] + cnt[c + 1] + cnt[c - cols] + cnt[c + cols];
        if (s > best) { best = s; bu = u; bv = v; }
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

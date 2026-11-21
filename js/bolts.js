// 마법탄: 가장 가까운 몹에게 자동 발사. 풀(최대 300발, 타입 배열), 충돌은 격자 3×3 칸만.
// 모두 틱 안에서 처리(공정성). 조준은 격자를 법사 칸에서 바깥 고리 순서로 훑어 찾는다.
import { CONFIG } from './config.js';
import { M, B, RADIUS, EXP } from './sim/mobs.js';
import { grid, cellX, cellY } from './sim/grid.js';
import { addParticle, particleRoom } from './render/effects.js';
import { pal } from './skins.js';

const C = CONFIG.bolts, RL = CONFIG.relics;
const N = C.max;
export const BT = {
  n: 0,
  x: new Float32Array(N), y: new Float32Array(N), px: new Float32Array(N), py: new Float32Array(N),
  vx: new Float32Array(N), vy: new Float32Array(N), life: new Float32Array(N),
  pierce: new Int8Array(N), skip: new Uint8Array(N), gen: new Uint8Array(N),
};

export function clearBolts() { BT.n = 0; }

function addBolt(x, y, vx, vy, pierce, gen, life) {
  if (BT.n >= N) return;
  const i = BT.n++;
  BT.x[i] = BT.px[i] = x; BT.y[i] = BT.py[i] = y; BT.vx[i] = vx; BT.vy[i] = vy;
  BT.life[i] = life || C.life; BT.pierce[i] = pierce; BT.skip[i] = gen ? 2 : 0; BT.gen[i] = gen || 0;
}
function removeBolt(i) {
  const j = --BT.n;
  BT.x[i] = BT.x[j]; BT.y[i] = BT.y[j]; BT.px[i] = BT.px[j]; BT.py[i] = BT.py[j];
  BT.vx[i] = BT.vx[j]; BT.vy[i] = BT.vy[j]; BT.life[i] = BT.life[j]; BT.pierce[i] = BT.pierce[j]; BT.skip[i] = BT.skip[j]; BT.gen[i] = BT.gen[j];
}

const out = [0, 0];
/** 법사에게서 가장 가까운 몹(또는 보스) 위치. 칸 고리를 안쪽부터 — 처음 찾은 고리와 그 다음 고리까지만 비교 */
function nearestTarget(px, py, range) {
  const g = grid, cols = g.cols, start = g.start, items = g.items, X = M.x, Y = M.y, DEAD = M.dead;
  const pcx = cellX(px), pcy = cellY(py), maxK = Math.ceil(range / g.cs);
  let best = range * range, found = false, stopAt = maxK;
  for (let k = 0; k <= stopAt; k++) {
    for (let v = -k; v <= k; v++) {
      const cy = pcy + v;
      if (cy < 0 || cy >= g.rows) continue;
      const edge = v === -k || v === k;
      for (let u = -k; u <= k; u += edge ? 1 : 2 * k || 1) {
        const cx = pcx + u;
        if (cx < 0 || cx >= cols) continue;
        const c = cy * cols + cx;
        for (let q = start[c], e = start[c + 1]; q < e; q++) {
          const i = items[q];
          if (DEAD[i]) continue;
          const dx = X[i] - px, dy = Y[i] - py, d2 = dx * dx + dy * dy;
          if (d2 < best) { best = d2; out[0] = X[i]; out[1] = Y[i]; found = true; }
        }
      }
    }
    if (found && stopAt === maxK) stopAt = Math.min(maxK, k + 1);
  }
  for (let i = 0; i < B.length; i++) {
    const b = B[i];
    if (!b.active) continue;
    const dx = b.x - px, dy = b.y - py, d2 = dx * dx + dy * dy;
    if (d2 < best) { best = d2; out[0] = b.x; out[1] = b.y; found = true; }
  }
  return found;
}

/** 틱마다: 발사 + 이동 + 충돌. 죽인 몹은 DEAD=2 로 표시하고 보상은 한꺼번에 */
export function updateBolts(G, dt) {
  const p = G.player;
  // 발사
  if (p.alive) {
    G.boltT += dt * G.boltRate;
    if (G.boltT >= 1) {
      G.boltT -= 1;
      if (G.boltT > 1) G.boltT = 0;
      if (nearestTarget(p.x, p.y, C.range)) {
        const base = Math.atan2(out[1] - p.y, out[0] - p.x), n = G.boltCount;
        for (let k = 0; k < n; k++) {
          const a = base + (k - (n - 1) / 2) * C.spread;
          addBolt(p.x, p.y - 6, Math.cos(a) * C.speed, Math.sin(a) * C.speed, G.boltPierce);
        }
        G.events.push({ type: 'bolt' });
      }
    }
  }
  if (BT.n === 0) return;
  const g = grid, cols = g.cols, start = g.start, items = g.items;
  const X = M.x, Y = M.y, HP = M.hp, DEAD = M.dead, TY = M.type, FL = M.flash;
  const dmg = C.damage, br = C.radius, slowTicks = G.char && G.char.boltSlow ? Math.round(G.char.boltSlowTime * CONFIG.sim.tickRate) : 0;
  let kills = 0, expSum = 0;
  for (let i = 0; i < BT.n; i++) {
    BT.px[i] = BT.x[i]; BT.py[i] = BT.y[i];
    BT.x[i] += BT.vx[i] * dt; BT.y[i] += BT.vy[i] * dt;
    BT.life[i] -= dt;
    if (BT.life[i] <= 0) { removeBolt(i); i--; continue; }
    if (BT.skip[i]) { BT.skip[i]--; continue; }   // 방금 맞춘 몹을 지나가는 중(관통)
    const bx = BT.x[i], by = BT.y[i];
    const ccx = cellX(bx), ccy = cellY(by);
    let hit = false;
    for (let cy = ccy - 1; cy <= ccy + 1 && !hit; cy++) {
      for (let cx = ccx - 1; cx <= ccx + 1 && !hit; cx++) {
        const c = cy * cols + cx;
        for (let q = start[c], e = start[c + 1]; q < e; q++) {
          const m = items[q];
          if (DEAD[m]) continue;
          const dx = X[m] - bx, dy = Y[m] - by, r = RADIUS[TY[m]] + br;
          if (dx * dx + dy * dy > r * r) continue;
          HP[m] -= BT.gen[i] ? dmg * RL.boltSplitDamage : dmg; FL[m] = CONFIG.mobs.flashTicks;
          if (slowTicks) M.slow[m] = slowTicks;   // 서리 마녀: 맞은 몹 1초 둔화
          if (HP[m] <= 0) { DEAD[m] = 2; kills++; expSum += EXP[TY[m]]; }
          hit = true;
          break;
        }
      }
    }
    if (!hit) {
      for (let k = 0; k < B.length; k++) {
        const b = B[k];
        if (!b.active) continue;
        const dx = b.x - bx, dy = b.y - by, r = CONFIG.boss.radius + br;
        if (dx * dx + dy * dy > r * r) continue;
        b.hp -= dmg; b.flash = 2; hit = true;
        if (b.hp <= 0) { b.active = false; G.onBossDeath(b); G.awardKills(0, 0, false, 1); }
        break;
      }
    }
    if (hit) {
      hitFx(bx, by);
      if (G.R.bolt && !BT.gen[i]) {   // 분열 마법탄: 작은 탄 2개로 갈라짐
        const a = Math.atan2(BT.vy[i], BT.vx[i]);
        for (const s of [-1, 1]) { const aa = a + s * RL.boltSplitAngle; addBolt(bx, by, Math.cos(aa) * C.speed, Math.sin(aa) * C.speed, 0, 1, RL.boltSplitLife); }
      }
      if (BT.pierce[i] > 0) { BT.pierce[i]--; BT.skip[i] = 2; }
      else { removeBolt(i); i--; }
    }
  }
  if (kills) G.awardKills(kills, expSum, false, 0);
}

function hitFx(x, y) {
  const n = Math.min(particleRoom(), 3);
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 80;
    addParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.18 + Math.random() * 0.12, pal(k ? 12 : 31), 2, 0);
  }
}

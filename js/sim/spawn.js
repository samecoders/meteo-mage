// 스폰: 시간별 목표 몹 수 표를 따라 화면 밖 원둘레에서 무리 단위로 생성.
// 한 틱 생성량을 제한해 여러 틱에 나눠 끊김을 막는다.
import { CONFIG } from '../config.js';
import { M, addMob, addBoss } from './mobs.js';

const S = CONFIG.spawn;
const NT = CONFIG.mobs.types.length;

export const spawner = {
  fronts: new Float32Array(S.fronts),
  frontVel: new Float32Array(S.fronts),
  nextBoss: CONFIG.boss.interval,
  bossIndex: 0,
  weights: new Float32Array(NT),
};

export function resetSpawner(rng) {
  for (let i = 0; i < S.fronts; i++) { spawner.fronts[i] = rng() * Math.PI * 2; spawner.frontVel[i] = 0; }
  spawner.nextBoss = CONFIG.boss.interval;
  spawner.bossIndex = 0;
}

/** 시간 t(초)의 필드 목표 몹 수 */
export function targetAt(t) {
  const c = S.curve;
  if (t <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) {
    if (t <= c[i][0]) {
      const a = c[i - 1], b = c[i];
      return Math.round(a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]));
    }
  }
  return Math.min(c[c.length - 1][1], CONFIG.sim.maxMobs);
}

function weightsAt(t) {
  const w = S.typeWeights, out = spawner.weights;
  let a = w[0], b = w[0];
  for (let i = 0; i < w.length; i++) { if (w[i][0] <= t) { a = w[i]; b = w[Math.min(i + 1, w.length - 1)]; } }
  const f = b[0] > a[0] ? Math.min(1, (t - a[0]) / (b[0] - a[0])) : 0;
  for (let k = 0; k < NT; k++) out[k] = a[1][k] + (b[1][k] - a[1][k]) * f;
  return out;
}

function pickType(w, r) {
  let sum = 0;
  for (let k = 0; k < NT; k++) sum += w[k];
  let x = r * sum;
  for (let k = 0; k < NT; k++) { x -= w[k]; if (x <= 0) return k; }
  return 0;
}

export function updateSpawner(G, dt, spawnR) {
  const rng = G.rng;
  // 물결 방향이 천천히 흔들림
  for (let i = 0; i < S.fronts; i++) {
    spawner.frontVel[i] += (rng() - 0.5) * S.frontDrift * 2 * dt;
    spawner.frontVel[i] *= 0.98;
    spawner.fronts[i] += spawner.frontVel[i] * dt * 10;
  }
  const target = G.bench ? G.benchCount : Math.min(targetAt(G.time), M.cap);
  let budget = Math.min(target - M.n, S.perTickMax);
  if (budget > 0) {
    const w = weightsAt(G.bench ? 480 : G.time);   // 벤치마크는 후반 몹 구성
    const baseGroup = Math.max(S.groupMin, Math.min(S.groupMax, target * S.groupPerTarget));
    while (budget > 0) {
      const size = Math.min(budget, Math.max(1, Math.round(baseGroup * (0.7 + rng() * 0.6))));
      const ang = rng() < S.randomGroupChance ? rng() * Math.PI * 2 : spawner.fronts[(rng() * S.fronts) | 0] + (rng() - 0.5) * 0.5;
      const dist = spawnR * (1 + rng() * 0.12);
      const cx = G.player.x + Math.cos(ang) * dist, cy = G.player.y + Math.sin(ang) * dist;
      const spread = 10 + Math.sqrt(size) * 11;
      const type = pickType(w, rng());      // 한 무리는 대체로 같은 종류
      for (let j = 0; j < size; j++) {
        const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * spread;
        const t = rng() < 0.8 ? type : pickType(w, rng());
        if (addMob(cx + Math.cos(a) * r, cy + Math.sin(a) * r, t, (rng() * 255) | 0) < 0) { budget = 0; break; }
      }
      budget -= size;
    }
  }
  // 보스 — 2분마다
  if (!G.bench && G.time >= spawner.nextBoss) {
    spawner.nextBoss += CONFIG.boss.interval;
    const idx = spawner.bossIndex++;
    const hp = CONFIG.boss.hp * Math.pow(CONFIG.boss.hpGrowth, idx);
    const kind = idx % CONFIG.boss.kinds.length;
    const a = rng() * Math.PI * 2;
    if (addBoss(G.player.x + Math.cos(a) * spawnR * 0.85, G.player.y + Math.sin(a) * spawnR * 0.85, hp, kind)) {
      G.events.push({ type: 'boss', kind });
    }
  }
}

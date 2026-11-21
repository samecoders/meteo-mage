// 스폰: 시간별 목표 몹 수 표를 따라 화면 밖 원둘레에서 무리 단위로 생성.
// 한 틱 생성량을 제한해 여러 틱에 나눠 끊김을 막는다.
import { CONFIG } from '../config.js';
import { M, addMob, addBoss } from './mobs.js';

const S = CONFIG.spawn;
const NT = CONFIG.mobs.types.length;

const TYPE_KEYS = CONFIG.mobs.types.map((t) => t.key);
const ROTATION = CONFIG.boss.kinds.map((k, i) => (k.special ? -1 : i)).filter((i) => i >= 0);

export const spawner = {
  ringT: 0, ringWarned: false, ringAngle: 0,
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
  spawner.ringT = S.ring && S.ring.on ? S.ring.from : 1e9;
  spawner.ringWarned = false;
}

/** 시간 t(초)의 필드 목표 몹 수 */
export function targetAt(t) {
  const c = S.curve, k = S.curveMul || 1, cap = CONFIG.sim.maxMobs;
  if (t <= c[0][0]) return Math.round(c[0][1] * k);
  for (let i = 1; i < c.length; i++) {
    if (t <= c[i][0]) {
      const a = c[i - 1], b = c[i];
      return Math.min(cap, Math.round((a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0])) * k));
    }
  }
  return Math.min(Math.round(c[c.length - 1][1] * k), cap);
}

function weightsAt(t) {
  const w = S.typeWeights, out = spawner.weights, from = S.typeFrom || {};
  let a = w[0], b = w[0];
  for (let i = 0; i < w.length; i++) { if (w[i][0] <= t) { a = w[i]; b = w[Math.min(i + 1, w.length - 1)]; } }
  const f = b[0] > a[0] ? Math.min(1, (t - a[0]) / (b[0] - a[0])) : 0;
  for (let k = 0; k < NT; k++) {
    out[k] = a[1][k] + (b[1][k] - a[1][k]) * f;
    const t0 = from[TYPE_KEYS[k]];
    if (t0 !== undefined && t < t0) out[k] = 0;     // 첫 등장 시각 전에는 절대 안 나옴
  }
  return out;
}

/**
 * 포위 무리: 법사를 빙 둘러싼 고리 모양으로 나타나 조여옴. 고리에는 항상 한 군데 틈(gapAngle 라디안).
 * warn 초 전에 'ringWarn' 이벤트(상단 경고).
 */
function updateRing(G, rng) {
  const R = S.ring;
  if (!R || !R.on || G.bench) return;
  if (!spawner.ringWarned && G.time >= spawner.ringT - R.warn) {
    spawner.ringWarned = true;
    spawner.ringAngle = rng() * Math.PI * 2;
    G.events.push({ type: 'ringWarn', angle: spawner.ringAngle });
  }
  if (G.time < spawner.ringT) return;
  spawner.ringT = G.time + R.everyMin + rng() * (R.everyMax - R.everyMin);
  spawner.ringWarned = false;
  const p = G.player, w = weightsAt(G.time);
  const count = Math.min(R.countMax, Math.round(R.count + R.countPerMin * Math.max(0, G.time - R.from) / 60));
  const per = Math.ceil(count / R.rows), gap = R.gapAngle, gapAt = spawner.ringAngle;
  let made = 0;
  for (let row = 0; row < R.rows; row++) {
    const r = R.radius + row * R.rowGap;
    for (let j = 0; j < per; j++) {
      const a = gapAt + gap / 2 + (j + (row ? 0.5 : 0)) / per * (Math.PI * 2 - gap);
      const i = addMob(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, pickType(w, rng()), (rng() * 255) | 0);
      if (i < 0) break;
      made++;
    }
  }
  G.lastRingT = G.time;   // 사망 원인 '포위당함' 판정용
  G.events.push({ type: 'ring', n: made, angle: gapAt });
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
      let dist = spawnR * (1 + rng() * 0.12);
      if (G.time < S.openingTime) {   // 시작 직후: 화면 가장자리 바로 밖(3초 안에 보이게)
        const hw = G.zoomShort, hh = hw * S.openingAspect;   // 화면 반폭·반높이(월드) — 9:16 가정
        const c = Math.abs(Math.cos(ang)) || 1e-6, sn = Math.abs(Math.sin(ang)) || 1e-6;
        dist = Math.min(dist, Math.min(hw / c, hh / sn) + S.openingMargin);
      }
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
  updateRing(G, rng);
  // 보스 — 2분마다
  if (!G.bench && G.time >= spawner.nextBoss) {
    spawner.nextBoss += CONFIG.boss.interval;
    const idx = spawner.bossIndex++;
    const hp = CONFIG.boss.hp * Math.pow(CONFIG.boss.hpGrowth, idx);
    const kind = ROTATION[idx % ROTATION.length];   // 미믹 같은 특수 보스는 순서에서 뺌
    const a = rng() * Math.PI * 2;
    if (addBoss(G.player.x + Math.cos(a) * spawnR * 0.85, G.player.y + Math.sin(a) * spawnR * 0.85, hp, kind)) {
      G.events.push({ type: 'boss', kind });
    }
  }
}

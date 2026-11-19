// 몹 데이터: 객체 없이 최대 수만큼 미리 할당한 타입 배열(SoA).
// 살아 있는 몹은 [0, n) 에 촘촘히. 죽으면 마지막 몹과 자리 바꾸기(swap-remove).
import { CONFIG } from '../config.js';
import { grid } from './grid.js';

const T = CONFIG.mobs.types;
export const SPEED = new Float32Array(T.map((t) => t.speed));
export const RADIUS = new Float32Array(T.map((t) => t.radius));
export const MAXHP = new Float32Array(T.map((t) => t.hp));
export const EXP = new Float32Array(T.map((t) => t.exp));
export const DMG = new Float32Array(T.map((t) => t.dmg ?? 10));
export const TYPE_KEYS = T.map((t) => t.key);
export const MASS = new Float32Array(T.map((t) => t.mass ?? 1));
export const WOBBLE = new Uint8Array(T.map((t) => (t.wobble ? 1 : 0)));
export const NOPRESS = new Uint8Array(T.map((t) => (t.ghost ? 1 : 0)));
export const GHOST = NOPRESS;

export const M = {
  cap: 0, n: 0,
  x: null, y: null,       // 현재 위치
  px: null, py: null,     // 이전 틱 위치(보간용)
  vx: null, vy: null,
  hp: null,
  type: null, phase: null, flash: null, dead: null,
  cell: null,             // 격자 칸 번호(격자 만들 때 채움)
};

export function allocMobs(cap) {
  M.cap = cap; M.n = 0;
  M.x = new Float32Array(cap); M.y = new Float32Array(cap);
  M.px = new Float32Array(cap); M.py = new Float32Array(cap);
  M.vx = new Float32Array(cap); M.vy = new Float32Array(cap);
  M.hp = new Float32Array(cap);
  M.type = new Uint8Array(cap); M.phase = new Uint8Array(cap);
  M.flash = new Uint8Array(cap); M.dead = new Uint8Array(cap);
  M.cell = new Int32Array(cap);
}

export function clearMobs() { M.n = 0; M.dead.fill(0); }

// 공간 재정렬용 임시 배열(미리 할당)
let tmpF = null, tmpU = null, tmpI = null;

/**
 * 몹 배열을 격자 칸 순서(order)로 재배치 — 같은 칸의 몹이 메모리에서도 붙어 있게 해
 * 이동·폭발·격자 계산의 캐시 효율을 높인다. 몇 틱마다 한 번.
 */
export function reorderMobs(order) {
  const n = M.n;
  if (!tmpF || tmpF.length < M.cap) { tmpF = new Float32Array(M.cap); tmpU = new Uint8Array(M.cap); tmpI = new Int32Array(M.cap); }
  permF(M.x, order, n); permF(M.y, order, n); permF(M.px, order, n); permF(M.py, order, n);
  permF(M.vx, order, n); permF(M.vy, order, n); permF(M.hp, order, n);
  permU(M.type, order, n); permU(M.phase, order, n); permU(M.flash, order, n); permU(M.dead, order, n);
  const c = M.cell;
  for (let k = 0; k < n; k++) tmpI[k] = c[order[k]];
  for (let k = 0; k < n; k++) c[k] = tmpI[k];
  for (let k = 0; k < n; k++) order[k] = k;
}
function permF(a, order, n) { for (let k = 0; k < n; k++) tmpF[k] = a[order[k]]; for (let k = 0; k < n; k++) a[k] = tmpF[k]; }
function permU(a, order, n) { for (let k = 0; k < n; k++) tmpU[k] = a[order[k]]; for (let k = 0; k < n; k++) a[k] = tmpU[k]; }

export function addMob(x, y, t, phase) {
  if (M.n >= M.cap) return -1;
  const i = M.n++;
  M.x[i] = x; M.y[i] = y; M.px[i] = x; M.py[i] = y;
  M.vx[i] = 0; M.vy[i] = 0;
  M.hp[i] = MAXHP[t];
  M.type[i] = t; M.phase[i] = phase; M.flash[i] = 0; M.dead[i] = 0;
  return i;
}

function copyMob(from, to) {
  M.x[to] = M.x[from]; M.y[to] = M.y[from];
  M.px[to] = M.px[from]; M.py[to] = M.py[from];
  M.vx[to] = M.vx[from]; M.vy[to] = M.vy[from];
  M.hp[to] = M.hp[from];
  M.type[to] = M.type[from]; M.phase[to] = M.phase[from];
  M.flash[to] = M.flash[from]; M.dead[to] = M.dead[from];
}

/** 죽은 몹 제거. onDead(i) 는 지워지기 직전에 호출(연출용) */
export function compactMobs(onDead) {
  let i = 0;
  while (i < M.n) {
    if (M.dead[i]) {
      onDead(i);
      const last = --M.n;
      if (i !== last) copyMob(last, i);
      M.dead[last] = 0;
    } else i++;
  }
}

/**
 * 이동: 법사 방향 + 격자 밀도 압력(붐빈 칸 → 덜 붐빈 이웃 칸).
 * 몹끼리 직접 비교하지 않음. 멀리 있는 몹은 압력 생략, 너무 멀면 반대편으로 재배치.
 */
export function moveMobs(plx, ply, dt, spawnR, rng, parity, time) {
  const n = M.n, X = M.x, Y = M.y, VX = M.vx, VY = M.vy, TY = M.type, FL = M.flash, PH = M.phase;
  const cfg = CONFIG.mobs;
  // 압력은 짝/홀 몹을 번갈아 2배 세기로 계산(관성으로 부드러워짐) → 비용 절반
  const accel = cfg.accel, pk = cfg.pressureK * 2, pcap = cfg.pressureCap * 2, far = cfg.farSkip;
  const desp = spawnR * cfg.despawnFactor, desp2 = desp * desp;
  const g = grid, inv = g.inv, ox = g.ox, oy = g.oy, cols = g.cols, GG = g.g, c2 = cols * 2;
  const maxU = g.cols - 2, maxV = g.rows - 2;
  for (let i = 0; i < n; i++) {
    const xi = X[i], yi = Y[i];
    const dx = plx - xi, dy = ply - yi;
    const d2 = dx * dx + dy * dy;
    if (d2 > desp2) { // 반대편 화면 밖으로 옮겨 다시 쫓아오게
      const d = Math.sqrt(d2);
      const r = spawnR * (0.95 + rng() * 0.15);
      const side = (rng() - 0.5) * 0.6 * spawnR;
      const ux = dx / d, uy = dy / d;
      const nx = plx + ux * r - uy * side, ny = ply + uy * r + ux * side;
      X[i] = nx; Y[i] = ny; M.px[i] = nx; M.py[i] = ny; VX[i] = 0; VY[i] = 0;
      continue;
    }
    const t = TY[i], s = SPEED[t];
    const k = s / (Math.sqrt(d2) + 0.001);
    let tx = dx * k, ty = dy * k;
    if (WOBBLE[t]) { // 박쥐: 좌우로 흔들며 날기
      let f = time * 1.1 + PH[i] * 0.0039;          // 삼각파(사인보다 싸다)
      f -= f | 0;
      const w = (f < 0.5 ? f * 4 - 1 : 3 - f * 4) * 0.8;
      tx -= dy * k * w; ty += dx * k * w;
    }
    if ((i & 1) === parity && !NOPRESS[t] && dx < far && dx > -far && dy < far && dy > -far) {
      const u = (xi - ox) * inv - 0.5, v = (yi - oy) * inv - 0.5;
      let iu = u | 0, iv = v | 0;
      if (iu < 1) iu = 1; else if (iu > maxU - 1) iu = maxU - 1;
      if (iv < 1) iv = 1; else if (iv > maxV - 1) iv = maxV - 1;
      const fu = u - iu, fv = v - iv;
      const c = (iv * cols + iu) * 2, d = c + c2;
      const w00 = (1 - fu) * (1 - fv), w10 = fu * (1 - fv), w01 = (1 - fu) * fv, w11 = fu * fv;
      let px = (GG[c] * w00 + GG[c + 2] * w10 + GG[d] * w01 + GG[d + 2] * w11) * pk;
      let py = (GG[c + 1] * w00 + GG[c + 3] * w10 + GG[d + 1] * w01 + GG[d + 3] * w11) * pk;
      const pm2 = px * px + py * py, lim = s * pcap;
      if (pm2 > lim * lim) { const f = lim / Math.sqrt(pm2); px *= f; py *= f; }
      tx += px; ty += py;
    }
    VX[i] += (tx - VX[i]) * accel;
    VY[i] += (ty - VY[i]) * accel;
    X[i] = xi + VX[i] * dt;
    Y[i] = yi + VY[i] * dt;
    if (FL[i]) FL[i]--;
  }
}

// ------------------------------------------------------------ 보스 (소수라 별도 고정 배열)
// kind: CONFIG.boss.kinds 번호. state 0 걷기, 1 힘 모으기(오거), 2 돌진(오거)
export const B = [];
for (let i = 0; i < CONFIG.boss.max; i++) {
  B.push({ active: false, kind: 0, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, hp: 0, maxHp: 0, flash: 0, phase: i * 40,
    t: 0, state: 0, st: 0, cx: 0, cy: 0 });
}

export function clearBosses() { for (let i = 0; i < B.length; i++) B[i].active = false; }

export function addBoss(x, y, hp, kind) {
  for (let i = 0; i < B.length; i++) {
    const b = B[i];
    if (b.active) continue;
    b.active = true; b.kind = kind; b.x = b.px = x; b.y = b.py = y; b.vx = b.vy = 0; b.hp = b.maxHp = hp; b.flash = 0;
    b.t = 0; b.state = 0; b.st = 0;
    return b;
  }
  return null;
}

/** 보스 이동 + 능력. 소환·불덩이는 hooks 로 알림(G.events 와 hazards) */
export function moveBosses(G, dt, hooks) {
  const p = G.player, rng = G.rng;
  const KINDS = CONFIG.boss.kinds;
  for (let i = 0; i < B.length; i++) {
    const b = B[i];
    if (!b.active) continue;
    const K = KINDS[b.kind];
    b.px = b.x; b.py = b.y;
    if (b.flash) b.flash--;
    const dx = p.x - b.x, dy = p.y - b.y, d = Math.sqrt(dx * dx + dy * dy) + 0.001;
    let s = K.speed, ax = dx / d, ay = dy / d, lerp = 0.1;
    b.t += dt;
    if (K.key === 'ogre') {
      if (b.state === 0 && b.t >= K.every && d < 900) { b.state = 1; b.st = K.windup; }
      else if (b.state === 1) {
        s = 0; lerp = 0.3;
        if ((G.ticks & 3) === 0) b.flash = 2;
        b.st -= dt;
        if (b.st <= 0) { b.state = 2; b.st = K.chargeTime; b.cx = ax; b.cy = ay; hooks.charge(b); }
      } else if (b.state === 2) {
        s = K.speed * K.chargeMult; ax = b.cx; ay = b.cy; lerp = 0.5;
        b.st -= dt;
        if (b.st <= 0) { b.state = 0; b.t = 0; }
      }
    } else if (K.key === 'lich' && b.t >= K.every) {
      b.t = 0;
      for (let k = 0; k < K.summon; k++) {
        const a = rng() * Math.PI * 2, r = 50 + rng() * 90;
        addMob(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, SUMMON_TYPE, (rng() * 255) | 0);
      }
      hooks.summon(b);
    } else if (K.key === 'dragon' && b.t >= K.every && d < 1100) {
      b.t = 0;
      // 법사가 갈 자리를 예측해 발사
      const lead = d / K.fireSpeed;
      const tx = p.x + p.vx * lead - b.x, ty = p.y + p.vy * lead - b.y, tl = Math.sqrt(tx * tx + ty * ty) + 0.001;
      hooks.fire(b, tx / tl * K.fireSpeed, ty / tl * K.fireSpeed, K.fireRadius, K.fireLife, K.fireDmg);
    }
    b.vx += (ax * s - b.vx) * lerp;
    b.vy += (ay * s - b.vy) * lerp;
    b.x += b.vx * dt; b.y += b.vy * dt;
  }
}

const SUMMON_TYPE = Math.max(0, CONFIG.mobs.types.findIndex((t) => t.key === 'skeleton'));
export const SLIME_TYPE = Math.max(0, CONFIG.mobs.types.findIndex((t) => t.key === 'slime'));

// 시각 효과(게임 규칙과 무관): 파티클, 날아가는 몹 잔해, 크레이터, 충격파 링, 잔상, 화면 흔들림.
// 모두 미리 할당한 풀. 화질 단계에 따라 상한만 달라짐.
import { CONFIG } from '../config.js';
import { pal } from '../skins.js';

const E = CONFIG.effects;
let Q = 2;
export function setQualityLevel(q) { Q = Math.max(0, Math.min(2, q)); }
export function getQualityLevel() { return Q; }

// ------------------------------------------------------------ 파티클 (사각 픽셀)
const PCAP = Math.max(...E.maxParticles);
const P = {
  n: 0, x: new Float32Array(PCAP), y: new Float32Array(PCAP), vx: new Float32Array(PCAP), vy: new Float32Array(PCAP),
  life: new Float32Array(PCAP), max: new Float32Array(PCAP), col: new Uint32Array(PCAP), size: new Float32Array(PCAP), grav: new Float32Array(PCAP),
};
export function addParticle(x, y, vx, vy, life, col, size, grav) {
  if (P.n >= E.maxParticles[Q]) return;
  const i = P.n++;
  P.x[i] = x; P.y[i] = y; P.vx[i] = vx; P.vy[i] = vy; P.life[i] = life; P.max[i] = life;
  P.col[i] = col; P.size[i] = size; P.grav[i] = grav || 0;
}
export function particleRoom() { return E.maxParticles[Q] - P.n; }

// ------------------------------------------------------------ 몹 잔해 (폭발 1회 최대 2,000)
const KCAP = Math.max(...E.maxCorpses);
const K = {
  n: 0, x: new Float32Array(KCAP), y: new Float32Array(KCAP), z: new Float32Array(KCAP),
  vx: new Float32Array(KCAP), vy: new Float32Array(KCAP), vz: new Float32Array(KCAP),
  life: new Float32Array(KCAP), type: new Uint8Array(KCAP), flip: new Uint8Array(KCAP),
};
export function addCorpse(x, y, type, cx, cy, strong) {
  if (K.n >= E.maxCorpses[Q]) return false;
  const i = K.n++;
  let dx = x - cx, dy = y - cy;
  const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
  dx /= d; dy /= d;
  const sp = strong ? 160 + Math.random() * 260 : 20 + Math.random() * 40;
  K.x[i] = x; K.y[i] = y; K.z[i] = 0;
  K.vx[i] = dx * sp; K.vy[i] = dy * sp; K.vz[i] = strong ? 220 + Math.random() * 260 : 60;
  K.life[i] = strong ? 0.55 + Math.random() * 0.3 : 0.4;
  K.type[i] = type; K.flip[i] = dx < 0 ? 1 : 0;
  return true;
}

// ------------------------------------------------------------ 크레이터
const CCAP = Math.max(...E.maxCraters);
const CR = { n: 0, x: new Float32Array(CCAP), y: new Float32Array(CCAP), r: new Float32Array(CCAP), life: new Float32Array(CCAP), c0: new Uint32Array(CCAP), c1: new Uint32Array(CCAP) };
export function addCrater(x, y, r, c0, c1) {
  const cap = E.maxCraters[Q];
  if (cap === 0) return;
  let i;
  if (CR.n < cap) i = CR.n++;
  else { // 가장 오래된 것 교체
    i = 0;
    for (let k = 1; k < CR.n; k++) if (CR.life[k] < CR.life[i]) i = k;
  }
  CR.x[i] = x; CR.y[i] = y; CR.r[i] = r; CR.life[i] = E.craterLife; CR.c0[i] = c0; CR.c1[i] = c1;
}

// ------------------------------------------------------------ 링(충격파·섬광)
const RCAP = 32;
const RG = { n: 0, x: new Float32Array(RCAP), y: new Float32Array(RCAP), r0: new Float32Array(RCAP), r1: new Float32Array(RCAP), t: new Float32Array(RCAP), dur: new Float32Array(RCAP), col: new Uint32Array(RCAP), kind: new Uint8Array(RCAP), th: new Float32Array(RCAP) };
/** kind 0 = 원판 섬광, 1 = 고리 */
export function addRing(x, y, r0, r1, dur, col, kind, th) {
  if (RG.n >= RCAP) return;
  const i = RG.n++;
  RG.x[i] = x; RG.y[i] = y; RG.r0[i] = r0; RG.r1[i] = r1; RG.t[i] = 0; RG.dur[i] = dur; RG.col[i] = col; RG.kind[i] = kind; RG.th[i] = th || 3;
}

// ------------------------------------------------------------ 대시 잔상
const ACAP = 16;
const AF = { n: 0, x: new Float32Array(ACAP), y: new Float32Array(ACAP), flip: new Uint8Array(ACAP), life: new Float32Array(ACAP), max: new Float32Array(ACAP) };
export function addAfterimage(x, y, flip, life) {
  if (AF.n >= ACAP) return;
  const i = AF.n++;
  AF.x[i] = x; AF.y[i] = y; AF.flip[i] = flip; AF.life[i] = AF.max[i] = life || 0.28;
}

// ------------------------------------------------------------ 번개(천둥의 두루마리) — 그림만, 지연을 두고 연쇄로
const XCAP = 320, STRIKE_DUR = 0.22;
const ST = { n: 0, x: new Float32Array(XCAP), y: new Float32Array(XCAP), t: new Float32Array(XCAP) };
export function addStrike(x, y, delay) {
  if (ST.n >= XCAP) return;
  const i = ST.n++;
  ST.x[i] = x; ST.y[i] = y; ST.t[i] = -delay;
}
/** 지그재그 번개: 하늘에서 목표까지 사각 픽셀로 */
export function fillStrikes(batch, V, colA, colB) {
  for (let i = 0; i < ST.n; i++) {
    const t = ST.t[i];
    if (t < 0) continue;
    const sx = ST.x[i] * 0.5 - V.left, sy = ST.y[i] * 0.5 - V.top;
    if (sx < -20 || sx > V.iw + 20 || sy < -10 || sy > V.ih + 120) continue;
    const f = t / STRIKE_DUR;
    let x = sx + ((i * 37) % 21) - 10, y = sy - 110;
    const seg = 7, h = 110 / seg;
    for (let k = 0; k < seg; k++) {
      const nx = k === seg - 1 ? sx : sx + (((i * 13 + k * 29 + ((t * 40) | 0)) % 17) - 8), ny = y + h;
      for (let q = 0; q < 4; q++) batch.push(x + (nx - x) * q / 4, y + (ny - y) * q / 4, f < 0.5 ? 1.5 : 1, 0, q & 1 ? colB : colA, 3, 255, 0, 0);
      x = nx; y = ny;
    }
    if (f < 0.6) batch.push(sx, sy, 6 + f * 10, 0, colA, 0, 140, 0, 0);
  }
}
function updateStrikes(dt) {
  for (let i = 0; i < ST.n; i++) {
    ST.t[i] += dt;
    if (ST.t[i] >= STRIKE_DUR) { const j = --ST.n; ST.x[i] = ST.x[j]; ST.y[i] = ST.y[j]; ST.t[i] = ST.t[j]; i--; }
  }
}

// ------------------------------------------------------------ 스프라이트 이펙트(폭발 그림, 타격, 레벨업 고리, 동전)
let RECTS = null;
export function setSpriteRects(r) { RECTS = r; }
export function spriteW(i) { return RECTS && RECTS[i] ? RECTS[i][2] : 0; }
const SCAP = 96;
const SF = {
  n: 0, x: new Float32Array(SCAP), y: new Float32Array(SCAP), vx: new Float32Array(SCAP), vy: new Float32Array(SCAP),
  life: new Float32Array(SCAP), max: new Float32Array(SCAP), spr: new Uint8Array(SCAP), scale: new Uint8Array(SCAP),
  grav: new Uint8Array(SCAP), follow: new Uint8Array(SCAP),
};
/** grav: 중력으로 떨어짐(동전), follow: x,y 를 법사 기준 오프셋으로 */
export function addSpriteFx(x, y, spr, scale, life, vx, vy, grav, follow) {
  if (SF.n >= SCAP) return;
  const i = SF.n++;
  SF.x[i] = x; SF.y[i] = y; SF.vx[i] = vx || 0; SF.vy[i] = vy || 0; SF.life[i] = life; SF.max[i] = life;
  SF.spr[i] = spr; SF.scale[i] = scale; SF.grav[i] = grav ? 1 : 0; SF.follow[i] = follow ? 1 : 0;
}
function updateSpriteFx(dt) {
  for (let i = 0; i < SF.n; i++) {
    SF.life[i] -= dt;
    if (SF.life[i] <= 0) {
      const j = --SF.n;
      SF.x[i] = SF.x[j]; SF.y[i] = SF.y[j]; SF.vx[i] = SF.vx[j]; SF.vy[i] = SF.vy[j]; SF.life[i] = SF.life[j]; SF.max[i] = SF.max[j];
      SF.spr[i] = SF.spr[j]; SF.scale[i] = SF.scale[j]; SF.grav[i] = SF.grav[j]; SF.follow[i] = SF.follow[j];
      i--; continue;
    }
    if (SF.grav[i]) SF.vy[i] += 700 * dt;
    SF.x[i] += SF.vx[i] * dt; SF.y[i] += SF.vy[i] * dt;
  }
}
export function fillSpriteFx(batch, V, plx, ply) {
  for (let i = 0; i < SF.n; i++) {
    const f = SF.life[i] / SF.max[i];
    const fade = f < 0.45 ? ((1 - f / 0.45) * 63) | 0 : 0;
    const x = SF.follow[i] ? plx + SF.x[i] : SF.x[i], y = SF.follow[i] ? ply + SF.y[i] : SF.y[i];
    batch.push(x * 0.5 - V.left, y * 0.5 - V.top, SF.spr[i], 0, 0, SF.scale[i], fade);
  }
}

// ------------------------------------------------------------ 화면 흔들림
export const shake = { amp: 0, x: 0, y: 0 };
export function addShake(a) { shake.amp = Math.min(E.shakeMax, Math.max(shake.amp, a)); }

export function clearEffects() { P.n = 0; K.n = 0; CR.n = 0; RG.n = 0; AF.n = 0; SF.n = 0; ST.n = 0; shake.amp = 0; }

/** dt: 효과 진행 시간(히트스톱·일시정지면 0), realDt: 화면 흔들림용 실제 시간 */
export function updateEffects(dt, realDt) {
  updateShake(realDt);
  if (dt <= 0) return;
  updateSpriteFx(dt);
  updateStrikes(dt);
  // 파티클
  const drag = Math.exp(-2.5 * dt);
  for (let i = 0; i < P.n; i++) {
    P.life[i] -= dt;
    if (P.life[i] <= 0) { swapP(i, --P.n); i--; continue; }
    P.vx[i] *= drag; P.vy[i] = P.vy[i] * drag + P.grav[i] * dt;
    P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt;
  }
  // 잔해
  for (let i = 0; i < K.n; i++) {
    K.life[i] -= dt;
    if (K.life[i] <= 0) { swapK(i, --K.n); i--; continue; }
    K.x[i] += K.vx[i] * dt; K.y[i] += K.vy[i] * dt;
    K.vz[i] -= 900 * dt; K.z[i] = Math.max(0, K.z[i] + K.vz[i] * dt);
  }
  for (let i = 0; i < CR.n; i++) {
    CR.life[i] -= dt;
    if (CR.life[i] <= 0) { const j = --CR.n; CR.x[i] = CR.x[j]; CR.y[i] = CR.y[j]; CR.r[i] = CR.r[j]; CR.life[i] = CR.life[j]; CR.c0[i] = CR.c0[j]; CR.c1[i] = CR.c1[j]; i--; }
  }
  for (let i = 0; i < RG.n; i++) {
    RG.t[i] += dt;
    if (RG.t[i] >= RG.dur[i]) {
      const j = --RG.n;
      RG.x[i] = RG.x[j]; RG.y[i] = RG.y[j]; RG.r0[i] = RG.r0[j]; RG.r1[i] = RG.r1[j]; RG.t[i] = RG.t[j]; RG.dur[i] = RG.dur[j]; RG.col[i] = RG.col[j]; RG.kind[i] = RG.kind[j]; RG.th[i] = RG.th[j];
      i--;
    }
  }
  for (let i = 0; i < AF.n; i++) {
    AF.life[i] -= dt;
    if (AF.life[i] <= 0) { const j = --AF.n; AF.x[i] = AF.x[j]; AF.y[i] = AF.y[j]; AF.flip[i] = AF.flip[j]; AF.life[i] = AF.life[j]; AF.max[i] = AF.max[j]; i--; }
  }
}

function updateShake(dt) {
  // 흔들림 (정수 픽셀)
  shake.amp *= Math.exp(-7 * dt);
  if (shake.amp < 0.3) { shake.amp = 0; shake.x = 0; shake.y = 0; }
  else { shake.x = Math.round((Math.random() * 2 - 1) * shake.amp); shake.y = Math.round((Math.random() * 2 - 1) * shake.amp); }
}

function swapP(i, j) {
  P.x[i] = P.x[j]; P.y[i] = P.y[j]; P.vx[i] = P.vx[j]; P.vy[i] = P.vy[j]; P.life[i] = P.life[j];
  P.max[i] = P.max[j]; P.col[i] = P.col[j]; P.size[i] = P.size[j]; P.grav[i] = P.grav[j];
}
function swapK(i, j) {
  K.x[i] = K.x[j]; K.y[i] = K.y[j]; K.z[i] = K.z[j]; K.vx[i] = K.vx[j]; K.vy[i] = K.vy[j]; K.vz[i] = K.vz[j];
  K.life[i] = K.life[j]; K.type[i] = K.type[j]; K.flip[i] = K.flip[j];
}

// ------------------------------------------------------------ 배치 채우기 (월드 → 내부 픽셀: x*0.5 - left)
export function fillCraters(batch, V) {
  for (let i = 0; i < CR.n; i++) {
    const sx = CR.x[i] * 0.5 - V.left, sy = CR.y[i] * 0.5 - V.top, r = CR.r[i] * 0.5;
    if (sx < -r || sy < -r || sx > V.iw + r || sy > V.ih + r) continue;
    const f = Math.min(1, CR.life[i] / 6);
    batch.push(sx, sy, r * 0.82, 0, CR.c0[i], 0, (110 * f) | 0, 0, 0);
    batch.push(sx, sy, r * 0.55, 0, CR.c1[i], 0, (150 * f) | 0, 0, 0);
    batch.push(sx, sy, r * 0.84, 2, CR.c1[i], 1, (200 * f) | 0, 0, 0);
  }
}

export function fillCorpses(batch, V) {
  for (let i = 0; i < K.n; i++) {
    const sx = K.x[i] * 0.5 - V.left, sy = (K.y[i] - K.z[i]) * 0.5 - V.top;
    if (sx < -20 || sy < -20 || sx > V.iw + 20 || sy > V.ih + 20) continue;
    const l = K.life[i];
    const fade = l < 0.3 ? Math.min(63, ((0.3 - l) / 0.3 * 63) | 0) : 0;
    batch.push(sx, sy, K.type[i], K.flip[i] | (l > 0.4 ? 2 : 0), 0, 1, fade);
  }
}

export function fillAfterimages(batch, V, sprite) {
  for (let i = 0; i < AF.n; i++) {
    const fade = Math.min(63, (((1 - AF.life[i] / AF.max[i]) * 0.7 + 0.3) * 63) | 0);
    batch.push(AF.x[i] * 0.5 - V.left, AF.y[i] * 0.5 - V.top, sprite, AF.flip[i] | 8, 0, 1, fade);
  }
}

export function fillParticles(batch, V) {
  for (let i = 0; i < P.n; i++) {
    const sx = P.x[i] * 0.5 - V.left, sy = P.y[i] * 0.5 - V.top;
    if (sx < -4 || sy < -4 || sx > V.iw + 4 || sy > V.ih + 4) continue;
    const f = P.life[i] / P.max[i];
    batch.push(sx, sy, P.size[i] * 0.5 * (f > 0.5 ? 1 : 0.6), 0, P.col[i], 3, f > 0.25 ? 255 : 128, 0, 0);
  }
}

export function fillRings(batch, V) {
  for (let i = 0; i < RG.n; i++) {
    const f = RG.t[i] / RG.dur[i];
    const r = (RG.r0[i] + (RG.r1[i] - RG.r0[i]) * (1 - (1 - f) * (1 - f))) * 0.5;
    const sx = RG.x[i] * 0.5 - V.left, sy = RG.y[i] * 0.5 - V.top;
    const dens = Math.max(30, (255 * (1 - f)) | 0);
    if (RG.kind[i] === 0) batch.push(sx, sy, r, 0, RG.col[i], 0, dens, 0, 0);
    else batch.push(sx, sy, r, RG.th[i] * (1 - f * 0.6), RG.col[i], 1, dens, 0, 0);
  }
}

export const WHITE = pal(31);

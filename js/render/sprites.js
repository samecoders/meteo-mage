// 프레임마다 인스턴스 배치 채우기. 몹 전체는 하나의 타입 배열 → 인스턴스 드로우 한 번.
// 좌표 변환: 내부 픽셀 = 월드 × 0.5 - (화면 좌상단 월드 픽셀). 반올림은 셰이더에서.
import { CONFIG } from '../config.js';
import { SpriteBatch, ShapeBatch } from './gl.js';
import { M, B } from '../sim/mobs.js';
import { O } from '../orbs.js';
import { meteors, fires, threatOnPlayer, escapeDir, killFraction, mobHpNow } from '../meteor.js';
import { SPR, FACE_LEFT } from '../assets.js';
import { items, fireballs, KINDS, RARITY, ITEM_CHEST } from '../items.js';
import { BT } from '../bolts.js';
import { treasures, KIND_WOOD, KIND_GOLD, KIND_RUIN } from '../treasure.js';
import { playerSpeed } from '../player.js';
import { pal } from '../skins.js';
import { fillCraters, fillCorpses, fillAfterimages, fillParticles, fillRings, fillSpriteFx, fillStrikes, addParticle, addAfterimage, particleRoom, getQualityLevel } from './effects.js';

export const batches = {
  mobs: null,
  decor: new SpriteBatch(1024),   // 장식물·마력 구슬 (몹 아래)
  top: new SpriteBatch(4096),
  under: new ShapeBatch(2048),
  parts: new ShapeBatch(4600),
  over: new ShapeBatch(6000),
};
export function allocBatches(cap) { batches.mobs = new SpriteBatch(cap); }

const RED = pal(22), DARK = pal(1), WHITE = pal(31), CYAN = pal(12), BLUE = pal(11), ORANGE = pal(23), YELLOW = pal(24), INK = pal(28);
const GHOST_FLAG = new Uint8Array(CONFIG.mobs.types.map((t) => (t.ghost ? 16 : 0)));
const BOSS_SPR = CONFIG.boss.kinds.map((k) => SPR[k.sprite]);
const ITEM_SPR = KINDS.map((k) => SPR['item_' + k]);
// 등급 빛: 일반 흰 빛, 희귀 파랑 빛, 전설 금빛 기둥, 보물상자 금빛
const RARITY_GLOW = { common: pal(31), rare: pal(11), legend: pal(24), boss: pal(24) };
const ITEM_GLOW = RARITY.map((r) => RARITY_GLOW[r]);
const RAINBOW = [22, 23, 24, 6, 12, 11, 21].map(pal);
// 보물 색: 나무=갈색, 황금=금색, 유적=보라
const TREASURE_COL = [pal(19), pal(24), pal(21)];
const TREASURE_SPR = [SPR.chest_wood, SPR.chest_gold, SPR.altar];
const DECOR_SPR = CONFIG.decor.kinds.map((k) => SPR[k]);
export const HERO_SPR = Object.fromEntries(Object.entries(CONFIG.characters).map(([k, c]) => [k, SPR[c.sprite]]));

/** 몹: 보간 위치 + 화면 밖 제외 */
export function fillMobs(V, alpha, plx) {
  const b = batches.mobs;
  const f32 = b.f32, u32 = b.u32;
  const n = M.n, X = M.x, Y = M.y, PX = M.px, PY = M.py, TY = M.type, PH = M.phase, FL = M.flash, WD = M.wound;
  const left = V.left, top = V.top, maxX = V.iw + 20, maxY = V.ih + 20;
  const scaleBits = (1 << 24) >>> 0;
  let o = 0;
  for (let i = 0; i < n; i++) {
    const px = PX[i], py = PY[i];
    const wx = px + (X[i] - px) * alpha;
    const sx = wx * 0.5 - left;
    if (sx < -20 || sx > maxX) continue;
    const sy = (py + (Y[i] - py) * alpha) * 0.5 - top;
    if (sy < -20 || sy > maxY) continue;
    f32[o] = sx; f32[o + 1] = sy;
    const t = TY[i];
    const flags = 4 | (wx > plx ? 1 : 0) | (FL[i] ? 2 : 0) | GHOST_FLAG[t] | (WD[i] ? 32 : 0);
    u32[o + 2] = (t | (flags << 8) | (PH[i] << 16) | scaleBits) >>> 0;
    o += 3;
  }
  b.count = o / 3;
}

// 장식물 위치: 월드 칸마다 정수 해시로 결정(무한 평원, 저장 불필요)
function hash2(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** 몹 아래: 평원 장식물 + 마력 구슬(보석) */
export function fillDecor(V, time) {
  const b = batches.decor;
  b.reset();
  const D = CONFIG.decor, ch = D.chunk;
  const x0 = Math.floor((V.left * 2 - 80) / ch), x1 = Math.floor(((V.left + V.iw) * 2 + 80) / ch);
  const y0 = Math.floor((V.top * 2 - 80) / ch), y1 = Math.floor(((V.top + V.ih) * 2 + 80) / ch);
  const lim = (D.chance * 65536) | 0;
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const h = hash2(cx, cy);
      if ((h & 0xffff) >= lim) continue;
      const k = DECOR_SPR[(h >>> 16) % DECOR_SPR.length];
      const wx = cx * ch + ((h >>> 8) & 0xff) / 255 * ch, wy = cy * ch + ((h >>> 20) & 0xff) / 255 * ch;
      b.push(wx * 0.5 - V.left, wy * 0.5 - V.top, k, (h >>> 31) & 1, 0, 1, 0);
    }
  }
  const gem = SPR.item_expgem;
  for (let i = 0; i < O.n; i++) {
    const sx = O.x[i] * 0.5 - V.left, sy = O.y[i] * 0.5 - V.top;
    if (sx < -10 || sy < -10 || sx > V.iw + 10 || sy > V.ih + 10) continue;
    if (O.life[i] < 5 && ((time * 8) | 0) % 2) continue;
    // 담긴 마력이 많을수록 크게(정수 배율)
    b.push(sx, sy - (((time * 3 + i * 0.37) % 1) < 0.5 ? 1 : 0), gem, 0, 0, O.v[i] >= 12 ? 2 : 1, 0);
  }
}

/** 위에 그리는 스프라이트: 잔해 → 아이템 → 보스 → 불덩이 → 잔상 → 법사 → 이펙트 → 떨어지는 메테오 */
export function fillTop(V, alpha, G, time) {
  const b = batches.top;
  b.reset();
  fillCorpses(b, V);
  for (const t of treasures) {
    if (!t.active) continue;
    const sx = t.x * 0.5 - V.left, sy = t.y * 0.5 - V.top;
    if (t.kind === KIND_RUIN) for (const rn of t.runes) if (!rn[2]) b.push(rn[0] * 0.5 - V.left, rn[1] * 0.5 - V.top - (((time * 2) % 1) < 0.5 ? 1 : 0), SPR.rune, 0, 0, 1, 0);
    if (sx < -40 || sy < -40 || sx > V.iw + 40 || sy > V.ih + 40) continue;
    const shake = t.gauge > 0 && t.kind !== KIND_RUIN ? (((time * 30) | 0) % 2) : 0;   // 여는 중: 덜컹
    b.push(sx + shake, sy, TREASURE_SPR[t.kind], 0, 0, 1, 0);
  }
  const blinkLast = CONFIG.items.blinkLast;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it.active) continue;
    if (it.fly <= 0 && it.life < blinkLast && ((time * (it.life < 2 ? 12 : 6)) | 0) % 2) continue;
    let x = it.x, y = it.y, hop = 0;
    if (it.fly > 0) { const f = 1 - it.fly / 0.35; x = it.sx + (it.x - it.sx) * f; y = it.sy + (it.y - it.sy) * f; hop = Math.sin(f * Math.PI) * 18; }
    // 살짝 떠서 위아래로
    const bob = it.kind === ITEM_CHEST ? 0 : 3 + (((time * 2.2 + i * 0.3) % 1) < 0.5 ? 1 : 0);
    b.push(x * 0.5 - V.left, y * 0.5 - V.top - bob - hop, ITEM_SPR[it.kind], 0, 0, 1, 0);
  }
  for (let i = 0; i < B.length; i++) {
    const o = B[i];
    if (!o.active) continue;
    const wx = o.px + (o.x - o.px) * alpha, wy = o.py + (o.y - o.py) * alpha;
    const spr = BOSS_SPR[o.kind];
    const flip = (wx > G.player.x ? 1 : 0) ^ FACE_LEFT[spr];
    b.push(wx * 0.5 - V.left, wy * 0.5 - V.top, spr, flip | (o.flash ? 2 : 0) | 4, o.phase, 1, 0);
  }
  for (let i = 0; i < fireballs.length; i++) {
    const f = fireballs[i];
    if (!f.active) continue;
    const wx = f.px + (f.x - f.px) * alpha, wy = f.py + (f.y - f.py) * alpha;
    b.push(wx * 0.5 - V.left, wy * 0.5 - V.top, SPR.meteor_fire, f.vx > 0 ? 1 : 0, 0, 1, 0);
  }
  const hero = HERO_SPR[G.hero] ?? SPR.mage;
  fillAfterimages(b, V, hero);
  if (G.clone && G.clone.t > 0) {   // 그림자 분신(유물): 깜빡이는 잔상
    const blink = G.clone.t < 0.6 && ((time * 12) | 0) % 2;
    if (!blink) b.push(G.clone.x * 0.5 - V.left, G.clone.y * 0.5 - V.top, hero, G.player.flip | 8, 0, 1, 20);
  }
  const p = G.player;
  if (p.alive) {
    const star = G.starT > 0;
    const blink = !star && p.invuln > 0 && ((time * 12) | 0) % 2 === 0;
    // 무적의 별: 번쩍임, 끝나기 2초 전부터 깜빡
    const starFlash = star && (G.starT < CONFIG.items.starBlink ? ((time * 10) | 0) % 2 : ((time * 6) | 0) % 3 === 0);
    if (!blink) b.push(p.x * 0.5 - V.left, p.y * 0.5 - V.top, hero, p.flip | ((Math.abs(p.vx) + Math.abs(p.vy) > 20) ? 4 : 0) | (starFlash ? 2 : 0), 0, 1, 0);
  }
  fillSpriteFx(b, V, p.x, p.y);
  const spr = SPR[G.skin.sprite];
  for (let i = 0; i < meteors.length; i++) {
    const m = meteors[i];
    if (!m.active || m.t < 0) continue;
    const f = Math.min(1, m.t / m.fall), h = (1 - f) * (m.kind === 2 ? 380 : 760);
    b.push((m.x + h * 0.55) * 0.5 - V.left, (m.y - h) * 0.5 - V.top, spr, 0, 0, m.kind === 2 ? 1 : 2, 0);
  }
}

/** 땅 위 도형: 크레이터, 화염 지대, 구슬, 낙하 그림자, 목표 원, 대시 미리보기 */
export function fillUnder(V, G, time, dashPrev) {
  const b = batches.under;
  b.reset();
  const q = getQualityLevel();
  fillCraters(b, V);
  for (let i = 0; i < fires.length; i++) {
    const z = fires[i];
    if (!z.active) continue;
    const sx = z.x * 0.5 - V.left, sy = z.y * 0.5 - V.top;
    const d = Math.min(1, z.t / 1.0);
    b.push(sx, sy, z.r * 0.5, 0, pal(3), 0, (90 * d) | 0, 0, 0);
    b.push(sx, sy, z.r * 0.5, 2, ORANGE, 2, (220 * d) | 0, 18, ((time * 60) | 0) & 255);
  }
  // 보물: 바닥 빛 + 열기 게이지(원형) / 유적: 룬석 다 모으면 제단 원이 빛남
  for (const t of treasures) {
    if (!t.active) continue;
    const sx = t.x * 0.5 - V.left, sy = t.y * 0.5 - V.top, col = TREASURE_COL[t.kind];
    if (sx < -60 || sy < -60 || sx > V.iw + 60 || sy > V.ih + 60) continue;
    const pulse = ((time * 3) % 1) < 0.5;
    if (t.kind === KIND_RUIN) {
      const ready = t.picked >= t.runes.length;
      b.push(sx, sy + 6, CONFIG.treasure.ruin.altarRadius * 0.5, 2, col, ready ? 1 : 2, ready ? 255 : 140, ready ? 0 : 16, ((time * 20) | 0) & 255);
      if (ready) b.push(sx, sy + 6, CONFIG.treasure.ruin.altarRadius * 0.5, 0, col, 0, pulse ? 90 : 60, 0, 0);
      continue;
    }
    b.push(sx, sy + 4, pulse ? 12 : 11, 0, col, 0, 70, 0, 0);
    const R = CONFIG.treasure.openRadius * 0.5;
    b.push(sx, sy + 4, R, 1, col, 2, 150, 12, ((time * 30) | 0) & 255);
    if (t.gauge > 0) {   // 원형 게이지: 채워진 만큼 점
      const n = 24, k = Math.round(t.gauge * n);
      for (let q = 0; q < k; q++) { const a = -Math.PI / 2 + q / n * Math.PI * 2; b.push(sx + Math.cos(a) * (R + 3), sy + 4 + Math.sin(a) * (R + 3), 1.5, 0, t.kind === KIND_GOLD ? YELLOW : WHITE, 3, 255, 0, 0); }
    }
    if (t.kind === KIND_GOLD && t.elites > 0) b.push(sx, sy + 4, CONFIG.treasure.gold.eliteRing * 0.5, 1, YELLOW, 2, 90, 20, ((time * 10) | 0) & 255);
  }
  // 아이템 바닥 빛(등급 색으로 반짝)
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it.active || it.fly > 0) continue;
    const sx = it.x * 0.5 - V.left, sy = it.y * 0.5 - V.top;
    if (sx < -30 || sy < -60 || sx > V.iw + 30 || sy > V.ih + 30) continue;
    const pulse = ((time * 3 + i * 0.37) % 1) < 0.5;
    const col = ITEM_GLOW[it.kind], big = it.kind === ITEM_CHEST ? 1.3 : 1;
    b.push(sx, sy + 2, (pulse ? 9 : 8) * big, 0, col, 0, 70, 0, 0);
    b.push(sx, sy + 2, (pulse ? 11 : 10) * big, 1, col, 2, 200, 8, ((time * 30) | 0) & 255);
  }
  const RM = G.meteorRadius * 0.5, REDC = pal(22);
  for (let i = 0; i < meteors.length; i++) {
    const m = meteors[i];
    if (!m.active || (m.follow && m.t < 0) || (m.kind === 2 && m.t < 0)) continue;   // 쌍둥이 둘째 발: 떨어질 자리가 정해지기 전
    const sx = m.x * 0.5 - V.left, sy = m.y * 0.5 - V.top;
    const R = m.kind === 2 ? CONFIG.relics.rainRadius * 0.5 : RM, RED = m.kind === 2 ? ORANGE : REDC;
    const f = Math.max(0, m.t / m.fall);
    // 붉은 원(폭발 반경) + 남은 시간: 안쪽 테두리가 반경에서 중심으로 줄어듦
    if (CONFIG.effects.shadows[q] && m.t >= 0) b.push(sx, sy, R * (0.12 + 0.4 * f), 0, DARK, 0, (70 + 140 * f) | 0, 0, 0);
    b.push(sx, sy, R, 0, RED, 0, m.t >= 0 ? 40 + (90 * f) | 0 : 30, 0, 0);
    b.push(sx, sy, R, 2, RED, 2, 255, 24, ((time * 40) | 0) & 255);
    if (m.t >= 0) b.push(sx, sy, Math.max(1, R * (1 - f)), 2, f > 0.7 && ((time * 12) | 0) % 2 ? WHITE : RED, 1, 255, 0, 0);

  }
  if (dashPrev) {
    const p = G.player;
    const x0 = p.x * 0.5 - V.left, y0 = p.y * 0.5 - V.top, x1 = dashPrev[0] * 0.5 - V.left, y1 = dashPrev[1] * 0.5 - V.top;
    const len = Math.hypot(x1 - x0, y1 - y0), steps = Math.max(1, (len / 6) | 0);
    for (let k = 1; k <= steps; k++) b.push(x0 + (x1 - x0) * k / steps, y0 + (y1 - y0) * k / steps, 1, 0, WHITE, 3, 150, 0, 0);
    b.push(x1, y1, 7, 1, WHITE, 2, 160, 8, ((time * 80) | 0) & 255);
  }
}

export function fillParticlesBatch(V) {
  const b = batches.parts;
  b.reset();
  fillParticles(b, V);
}

/** 위에 덮는 도형: 충격파 링, 섬광, 쉴드, 보스 체력 막대 */
export function fillOver(V, G, time, alpha) {
  const b = batches.over;
  b.reset();
  fillRings(b, V);
  fillStrikes(b, V, WHITE, YELLOW);
  // '골렘도 죽는 범위' 점선 원 — 몹 위에 그려서 무리 속에서도 보이게(위력을 올리면 넓어짐)
  for (let i = 0; i < meteors.length; i++) {
    const m = meteors[i];
    if (!m.active || m.kind === 2 || (m.follow && m.t < 0)) continue;
    const kf = killFraction(mobHpNow(CONFIG.meteor.killRangeMob), G.meteorPower * (m.kind === 1 ? CONFIG.relics.echoPower : 1));
    if (kf > 0.02) b.push(m.x * 0.5 - V.left, m.y * 0.5 - V.top, G.meteorRadius * 0.5 * kf, 2, YELLOW, 2, 255, 14, ((time * 25) | 0) & 255);
  }
  // 보물 빛기둥(종류별 색) — 가까울수록 빨리 반짝임
  for (const t of treasures) {
    if (!t.active) continue;
    const sx = t.x * 0.5 - V.left, sy = t.y * 0.5 - V.top;
    if (sx < -20 || sx > V.iw + 20 || sy < -20 || sy > V.ih + 140) continue;
    const d = Math.hypot(t.x - G.player.x, t.y - G.player.y), rate = 2 + Math.max(0, 1 - d / 700) * 8;
    const on = ((time * rate) | 0) % 2, col = TREASURE_COL[t.kind], h = t.kind === KIND_RUIN ? 70 : 50;
    b.push(sx, sy - h - 6, 3 + on, h, col, 4, 110, 0, 0);
    b.push(sx, sy - h - 6, 1, h, WHITE, 4, on ? 200 : 120, 0, 0);
    if (t.kind === KIND_RUIN) for (const rn of t.runes) if (!rn[2]) { const rx = rn[0] * 0.5 - V.left, ry = rn[1] * 0.5 - V.top; b.push(rx, ry - 26, 1 + on, 22, col, 4, 120, 0, 0); }
  }
  // 엘리트 몹: 금테두리
  if (G.elitesAlive > 0) {
    const EL = M.elite, X = M.x, Y = M.y, n = M.n, gold = ((time * 6) | 0) % 2 ? YELLOW : ORANGE;
    for (let i = 0; i < n; i++) {
      if (!EL[i]) continue;
      const sx = X[i] * 0.5 - V.left, sy = Y[i] * 0.5 - V.top;
      if (sx < -10 || sy < -10 || sx > V.iw + 10 || sy > V.ih + 10) continue;
      b.push(sx, sy, 9, 2, gold, 1, 255, 0, 0);
    }
  }
  // 전설 아이템: 금빛 기둥
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it.active || it.fly > 0 || RARITY[it.kind] !== 'legend') continue;
    const sx = it.x * 0.5 - V.left, sy = it.y * 0.5 - V.top;
    if (sx < -10 || sx > V.iw + 10 || sy < -10 || sy > V.ih + 80) continue;
    b.push(sx, sy - 34, 2 + (((time * 4) | 0) % 2), 32, YELLOW, 4, 110, 0, 0);
    b.push(sx, sy - 34, 1, 32, WHITE, 4, 160, 0, 0);
  }
  // 마법탄: 밝은 머리 + 꼬리
  for (let i = 0; i < BT.n; i++) {
    const sx = BT.x[i] * 0.5 - V.left, sy = BT.y[i] * 0.5 - V.top;
    if (sx < -4 || sy < -4 || sx > V.iw + 4 || sy > V.ih + 4) continue;
    const tx = (BT.x[i] - BT.vx[i] * 0.025) * 0.5 - V.left, ty = (BT.y[i] - BT.vy[i] * 0.025) * 0.5 - V.top;
    b.push(tx, ty, 1, 0, BLUE, 3, 255, 0, 0);
    b.push((sx + tx) / 2, (sy + ty) / 2, 1, 0, CYAN, 3, 255, 0, 0);
    b.push(sx, sy, 1.5, 0, WHITE, 3, 255, 0, 0);
  }
  const p = G.player;
  if (p.alive && p.shield) b.push(p.x * 0.5 - V.left, p.y * 0.5 - V.top, 19, 1, CYAN, 2, 200, 10, ((time * 50) | 0) & 255);
  // 무적의 별: 무지개빛 고리
  if (p.alive && G.starT > 0 && !(G.starT < CONFIG.items.starBlink && ((time * 10) | 0) % 2)) {
    const sx = p.x * 0.5 - V.left, sy = p.y * 0.5 - V.top, k = (time * 14) | 0;
    b.push(sx, sy, 15, 2, RAINBOW[k % RAINBOW.length], 1, 255, 0, 0);
    b.push(sx, sy, 19, 1, RAINBOW[(k + 3) % RAINBOW.length], 2, 220, 12, (k * 9) & 255);
  }
  // 내 메테오 반경 안: 몹이 가장 적은 쪽으로 연한 화살표(설정에서 끔)
  if (p.alive && G.escapeHint && CONFIG.meteor.target === 'center') {
    const m = threatOnPlayer(G);
    if (m && escapeDir(G, m, hintDir)) {
      const sx = p.x * 0.5 - V.left, sy = p.y * 0.5 - V.top, blink = ((time * 6) | 0) % 2;
      const dx = hintDir[0], dy = hintDir[1];
      for (let k = 0; k < 5; k++) b.push(sx + dx * (16 + k * 3), sy + dy * (16 + k * 3), 1, 0, WHITE, 3, blink ? 150 : 100, 0, 0);
      const tx = sx + dx * 31, ty = sy + dy * 31;   // 화살촉
      b.push(tx - dx * 3 - dy * 3, ty - dy * 3 + dx * 3, 1, 0, WHITE, 3, 150, 0, 0);
      b.push(tx - dx * 3 + dy * 3, ty - dy * 3 - dx * 3, 1, 0, WHITE, 3, 150, 0, 0);
    }
  }
  // 무리 속에서도 법사가 보이게: 발밑 표시 고리(그림만)
  if (p.alive) {
    const pulse = ((time * 4) | 0) % 2;
    const sx = p.x * 0.5 - V.left, sy = p.y * 0.5 - V.top;
    b.push(sx, sy + 12, 9 + pulse, 1, YELLOW, 1, 255, 0, 0);
  }
  for (let i = 0; i < B.length; i++) {
    const o = B[i];
    if (!o.active) continue;
    const wx = o.px + (o.x - o.px) * alpha, wy = o.py + (o.y - o.py) * alpha;
    const sx = wx * 0.5 - V.left, sy = wy * 0.5 - V.top - 34;
    const w = 18, f = Math.max(0, o.hp / o.maxHp);
    b.push(sx, sy, w + 1, 2, INK, 4, 255, 0, 0);
    b.push(sx - w + w * f, sy, w * f, 1, RED, 4, 255, 0, 0);
  }
}

const hintDir = [0, 0];

/** 프레임마다 시각용 파티클 생성(메테오 꼬리, 화염) — 게임 규칙과 무관 */
export function emitVisuals(G, dt) {
  if (dt <= 0) return;
  const sk = G.skin;
  // 빠르게 움직일 때: 짧은 픽셀 잔상 + 속도선 / 무적의 별: 무지개 반짝이
  const p = G.player;
  if (p.alive && p.dashT <= 0) {
    const v = Math.hypot(p.vx, p.vy), top = playerSpeed(G);
    if (v > top * CONFIG.player.fastTrail) {
      p.trailT -= dt;
      if (p.trailT <= 0) { p.trailT = 0.07; addAfterimage(p.x - p.vx * 0.02, p.y - p.vy * 0.02, p.flip, 0.14); }
      const ux = p.vx / v, uy = p.vy / v, n = Math.min(particleRoom(), 2);
      for (let k = 0; k < n; k++) {
        const side = (Math.random() - 0.5) * 30;
        addParticle(p.x - ux * (14 + Math.random() * 10) - uy * side, p.y - uy * (14 + Math.random() * 10) + ux * side - 4,
          -ux * 260, -uy * 260, 0.08 + Math.random() * 0.05, k ? WHITE : pal(14), 2, 0);
      }
    }
    if (G.starT > 0 && particleRoom() > 0) {
      const a = Math.random() * Math.PI * 2;
      addParticle(p.x + Math.cos(a) * 14, p.y + Math.sin(a) * 14 - 6, Math.cos(a) * 30, -40, 0.4, RAINBOW[(Math.random() * RAINBOW.length) | 0], 2, 0);
    }
  }
  for (let i = 0; i < meteors.length; i++) {
    const m = meteors[i];
    if (!m.active || m.t < 0) continue;
    const f = Math.min(1, m.t / m.fall), h = (1 - f) * 760;
    const x = m.x + h * 0.55, y = m.y - h;
    const n = Math.min(particleRoom(), 4);
    for (let k = 0; k < n; k++) {
      addParticle(x + (Math.random() - 0.3) * 16, y + (Math.random() - 0.7) * 16, 140 + Math.random() * 80, -220 - Math.random() * 120,
        0.25 + Math.random() * 0.3, pal(sk.trail[(Math.random() * sk.trail.length) | 0]), 2 + (Math.random() * 3 | 0), 0);
    }
  }
  for (let i = 0; i < fireballs.length; i++) {
    const f = fireballs[i];
    if (!f.active) continue;
    const n = Math.min(particleRoom(), 2);
    for (let k = 0; k < n; k++) {
      addParticle(f.x + (Math.random() - 0.5) * 14, f.y + (Math.random() - 0.5) * 14, -f.vx * 0.2, -f.vy * 0.2,
        0.3 + Math.random() * 0.2, pal(Math.random() < 0.5 ? 23 : 22), 2, 0);
    }
  }
  for (let i = 0; i < fires.length; i++) {
    const z = fires[i];
    if (!z.active) continue;
    const n = Math.min(particleRoom(), 3);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * z.r;
      addParticle(z.x + Math.cos(a) * r, z.y + Math.sin(a) * r, 0, -30 - Math.random() * 40, 0.4 + Math.random() * 0.4,
        pal(Math.random() < 0.5 ? 23 : 24), 2, -20);
    }
  }
}

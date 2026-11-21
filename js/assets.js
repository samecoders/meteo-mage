// 이미지 로드 + 없을 때 코드로 만든 픽셀 도형 텍스처.
// image/ 에 파일을 넣으면 코드 수정 없이 자동 교체(로드 시 pixel.js 로 저해상도 변환).
import { CONFIG } from './config.js';
import { pixelize, nativeSprite, makePalette, idxToCanvas, addOutline } from './pixel.js';
import { SKINS } from './skins.js';

// 아틀라스 스프라이트 순서 (인덱스가 셰이더 u_rect 배열 위치)
// 맨 앞은 몹 타입 순서 그대로(타입 번호 = 스프라이트 번호).
export const SPRITE_ORDER = [
  ...CONFIG.mobs.types.map((t) => t.sprite),
  ...CONFIG.boss.kinds.map((k) => k.sprite),
  'mage', 'hero_apprentice', 'hero_pyromancer', 'hero_icewitch', 'hero_necromancer',
  'meteor_fire', 'meteor_ice', 'meteor_poison', 'meteor_lightning', 'meteor_dark', 'meteor_gold',
  'fx_explosion', 'fx_hit', 'fx_levelup',
  'item_expgem', 'item_coin',
  ...CONFIG.items.kinds.map((k) => 'item_' + k.key),
  'chest_wood', 'chest_gold', 'altar', 'rune',
  'prop_tree', 'prop_rock', 'prop_bush', 'prop_ruin',
  'ground', 'ground_dirt',
];
export const SPR = {};
SPRITE_ORDER.forEach((n, i) => { SPR[n] = i; });
/** 왼쪽을 보는 그림(좌우 반전 기준을 뒤집어야 함) */
export const FACE_LEFT = new Uint8Array(SPRITE_ORDER.length);
SPRITE_ORDER.forEach((n, i) => { if (CONFIG.sprites[n] && CONFIG.sprites[n].faceLeft) FACE_LEFT[i] = 1; });

const pal = makePalette(CONFIG.pixel.palette);

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// ------------------------------------------------------------ 작은 래스터 도구
class PB {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Int16Array(w * h).fill(-1); }
  px(x, y, c) { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c; }
  get(x, y) { x = ((x % this.w) + this.w) % this.w; y = ((y % this.h) + this.h) % this.h; return this.d[y * this.w + x]; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c); }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) {
      for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(x, y, c);
      }
    }
  }
  disc(cx, cy, r, c) { this.ellipse(cx, cy, r, r, c); }
  line(x0, y0, x1, y1, c) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) | 0;
    for (let i = 0; i <= n; i++) this.px(Math.round(x0 + (x1 - x0) * i / (n || 1)), Math.round(y0 + (y1 - y0) * i / (n || 1)), c);
  }
  outline() { addOutline(this.d, this.w, this.h, CONFIG.pixel.outlineIndex); return this; }
  canvas() { return idxToCanvas(this.d, this.w, this.h, pal); }
}

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ------------------------------------------------------------ 코드로 만든 스프라이트
const GEN = {
  mob_slime() {
    const b = new PB(12, 12);
    b.ellipse(6, 7.5, 5, 4.2, 7);
    b.rect(1, 8, 10, 2, 7);
    for (let x = 2; x < 10; x++) b.px(x, 10, 25);
    b.px(1, 9, 25); b.px(10, 9, 25);
    b.px(3, 5, 6); b.px(4, 4, 6); b.px(3, 6, 6); b.px(4, 5, 13);
    b.px(7, 6, 1); b.px(9, 6, 1); b.px(7, 7, 1); b.px(9, 7, 1);
    b.px(8, 9, 25);
    return b.outline();
  },
  mob_wolf() {
    const b = new PB(16, 16);
    b.ellipse(7, 9.5, 5.2, 2.8, 30);
    for (let x = 3; x <= 10; x++) b.px(x, 7, 15);
    for (let x = 4; x <= 9; x++) b.px(x, 11, 14);
    b.ellipse(12, 7.5, 2.8, 2.3, 30);
    b.rect(13, 8, 2, 2, 14);
    b.px(15, 8, 1);
    b.px(11, 4, 15); b.px(11, 5, 15); b.px(12, 5, 15); b.px(10, 5, 15);
    b.px(13, 7, 22);
    b.rect(4, 12, 1, 3, 15); b.rect(6, 12, 1, 2, 15); b.rect(9, 12, 1, 3, 15); b.rect(11, 11, 1, 3, 15);
    b.px(2, 8, 14); b.px(1, 7, 14); b.px(1, 6, 30); b.px(2, 9, 30);
    return b.outline();
  },
  mob_golem() {
    const b = new PB(20, 20);
    b.rect(5, 7, 10, 8, 15);
    b.rect(6, 7, 8, 1, 14);
    b.rect(7, 2, 6, 5, 14);
    b.rect(7, 2, 6, 1, 31);
    b.rect(2, 8, 3, 7, 15); b.rect(15, 8, 3, 7, 15);
    b.rect(2, 8, 3, 1, 14); b.rect(15, 8, 3, 1, 14);
    b.rect(2, 15, 3, 2, 16); b.rect(15, 15, 3, 2, 16);
    b.rect(6, 15, 3, 3, 16); b.rect(11, 15, 3, 3, 16);
    b.px(10, 4, 23); b.px(12, 4, 23);
    b.px(9, 10, 23); b.px(10, 11, 23); b.px(11, 10, 23); b.px(10, 9, 23);
    b.px(6, 12, 16); b.px(7, 13, 16); b.px(13, 9, 16);
    b.px(5, 7, 26); b.px(6, 7, 27); b.px(14, 13, 26); b.px(8, 2, 26);
    return b.outline();
  },
  mob_boss() {
    const b = new PB(40, 40);
    b.ellipse(7, 24, 4, 6.5, 2); b.ellipse(33, 24, 4, 6.5, 2);
    b.rect(11, 31, 6, 6, 2); b.rect(23, 31, 6, 6, 2);
    b.rect(10, 36, 8, 2, 1); b.rect(22, 36, 8, 2, 1);
    b.ellipse(20, 24, 13.5, 11, 20);
    b.ellipse(21, 27, 8, 6.5, 21);
    b.ellipse(22, 13, 9, 7.5, 20);
    b.ellipse(22, 11, 7, 4, 21);
    b.line(16, 8, 12, 2, 5); b.line(15, 8, 11, 3, 5); b.px(11, 1, 31);
    b.line(28, 8, 31, 2, 5); b.line(29, 8, 32, 3, 5); b.px(32, 1, 31);
    b.rect(23, 11, 2, 2, 24); b.rect(28, 11, 2, 2, 24);
    b.px(23, 11, 31); b.px(28, 11, 31);
    b.rect(23, 16, 7, 2, 22); b.px(24, 16, 31); b.px(26, 16, 31); b.px(28, 16, 31);
    for (let x = 9; x < 32; x++) b.px(x, 33, 2);
    b.px(5, 30, 13); b.px(7, 31, 13); b.px(31, 31, 13); b.px(33, 30, 13);
    return b.outline();
  },
  mage() {
    const b = new PB(24, 24);
    for (let y = 10; y <= 21; y++) {
      const hw = 2 + (y - 10) * 0.42;
      for (let x = Math.round(11 - hw); x <= Math.round(11 + hw); x++) b.px(x, y, x < 11 - hw * 0.3 ? 9 : 10);
    }
    for (let x = 8; x <= 14; x++) b.px(x, 15, 24);
    b.disc(12, 8.5, 3, 19);
    b.px(14, 8, 1);
    b.rect(10, 11, 5, 2, 13); b.px(11, 13, 13); b.px(12, 13, 13);
    b.rect(6, 6, 12, 1, 9);
    for (let y = 0; y < 6; y++) { const hw = (6 - y) * 0.75; for (let x = Math.round(12 - hw); x <= Math.round(12 + hw); x++) b.px(x + (y < 2 ? 2 - y : 0), y, 9); }
    b.px(11, 3, 24);
    b.line(18, 7, 18, 22, 17);
    b.disc(18.5, 5, 2.2, 12); b.px(18, 4, 31);
    b.px(17, 13, 19);
    b.rect(8, 22, 3, 1, 17); b.rect(13, 22, 3, 1, 17);
    return b.outline();
  },
  ground() {
    const b = new PB(32, 32);
    const r = rng(7);
    for (let i = 0; i < 32 * 32; i++) { const v = r(); b.d[i] = v < 0.1 ? 25 : v < 0.2 ? 27 : 26; }
    for (let k = 0; k < 7; k++) { // 풀 포기 (가장자리에서 감싸 이어짐)
      const x = (r() * 32) | 0, y = (r() * 32) | 0;
      b.d[((y + 1) % 32) * 32 + x] = 27; b.d[y * 32 + x] = 6; b.d[((y + 1) % 32) * 32 + ((x + 1) % 32)] = 27; b.d[((y + 1) % 32) * 32 + ((x + 31) % 32)] = 27;
    }
    for (let k = 0; k < 2; k++) {
      const x = (r() * 32) | 0, y = (r() * 32) | 0;
      b.d[y * 32 + x] = k ? 24 : 13;
    }
    return b;
  },
  icon() {
    const b = new PB(32, 32);
    b.rect(0, 0, 32, 32, 1);
    const r = rng(3);
    for (let i = 0; i < 18; i++) b.px(r() * 32, r() * 32, i % 3 ? 14 : 31);
    drawMeteor(b, SKINS[0], 4, 4, 1.25);
    return b;
  },
};

function drawMeteor(b, skin, ox, oy, s) {
  const [core, mid, outer, dark] = skin.body;
  for (let t = 0; t <= 1; t += 0.04) {           // 오른쪽 위로 뻗는 꼬리
    const x = ox + (12 + 9 * t) * s, y = oy + (12 - 9 * t) * s, rr = (4.2 * (1 - t) + 0.6) * s;
    b.disc(x, y, rr, outer);
  }
  for (let t = 0; t <= 0.7; t += 0.05) {
    const x = ox + (11 + 8 * t) * s, y = oy + (13 - 8 * t) * s, rr = (2.4 * (1 - t / 0.7) + 0.4) * s;
    b.disc(x, y, rr, mid);
  }
  b.disc(ox + 9 * s, oy + 15 * s, 5.6 * s, outer);
  b.disc(ox + 9 * s, oy + 15 * s, 4.4 * s, mid);
  b.disc(ox + 8.5 * s, oy + 15.5 * s, 2.8 * s, core);
  b.px(ox + 6 * s, oy + 17 * s, dark); b.px(ox + 11 * s, oy + 17 * s, dark); b.px(ox + 9 * s, oy + 19 * s, dark);
}

for (const sk of SKINS) {
  GEN[sk.sprite] = () => { const b = new PB(24, 24); drawMeteor(b, sk, 0, 0, 1); return b.outline(); };
}

// 주인공 모습: 법사 그림의 옷 색만 바꿈 (9 = 어두운 옷, 10 = 밝은 옷)
function recolor(b, map) { for (let i = 0; i < b.d.length; i++) if (map[b.d[i]] !== undefined) b.d[i] = map[b.d[i]]; return b; }
GEN.hero_apprentice = () => recolor(GEN.mage(), { 9: 25, 10: 26 });
GEN.hero_pyromancer = () => recolor(GEN.mage(), { 9: 3, 10: 22 });
GEN.hero_icewitch = () => recolor(GEN.mage(), { 9: 11, 10: 12 });
GEN.hero_necromancer = () => recolor(GEN.mage(), { 9: 1, 10: 20 });

// 이미지가 없을 때 쓰는 단순 몹 도형: 몸통 색 c0(밝음)·c1(어두움), 눈 색 eye
function blob(w, h, c0, c1, eye, extra) {
  const b = new PB(w, h);
  b.ellipse(w / 2, h * 0.58, w / 2 - 1.2, h * 0.38, c1);
  b.ellipse(w / 2 - 0.5, h * 0.52, w / 2 - 2, h * 0.32, c0);
  if (extra) extra(b, w, h);
  b.px(w * 0.62, h * 0.45, eye); b.px(w * 0.78, h * 0.45, eye);
  return b.outline();
}
GEN.mob_bat = () => blob(14, 10, 20, 2, 22, (b) => { b.line(0, 3, 4, 6, 2); b.line(13, 3, 9, 6, 2); });
GEN.mob_mushroom = () => blob(12, 14, 19, 18, 1, (b) => { b.ellipse(6, 4.5, 5.5, 3.5, 22); b.px(4, 3, 31); b.px(8, 4, 31); });
GEN.mob_goblin = () => blob(14, 14, 6, 7, 1, (b) => { b.px(1, 5, 7); b.px(12, 5, 7); });
GEN.mob_skeleton = () => blob(16, 16, 13, 14, 1, (b) => { b.line(13, 4, 15, 14, 17); });
GEN.mob_ghost = () => blob(16, 16, 31, 12, 9, (b) => { for (let x = 2; x < 14; x += 3) b.px(x, 14, -1); });
GEN.mob_orc = () => blob(18, 18, 26, 25, 22, (b) => { b.rect(14, 6, 2, 9, 17); });
GEN.mob_darkknight = () => blob(18, 20, 29, 1, 22, (b) => { b.rect(8, 1, 3, 3, 22); b.line(16, 4, 16, 16, 14); });
GEN.boss_slimeking = () => blob(40, 34, 6, 7, 1, (b) => { b.rect(14, 2, 12, 4, 24); b.px(15, 1, 24); b.px(20, 0, 24); b.px(25, 1, 24); });
GEN.boss_lich = () => blob(36, 40, 21, 20, 6, (b) => { b.disc(18, 10, 6, 13); b.rect(12, 2, 12, 3, 24); });
GEN.boss_dragon = () => blob(40, 40, 22, 3, 24, (b) => { b.ellipse(8, 14, 7, 10, 3); b.ellipse(32, 14, 7, 10, 3); });
GEN.fx_explosion = () => { const b = new PB(24, 24); b.disc(12, 12, 11, 22); b.disc(12, 12, 8.5, 23); b.disc(12, 12, 5.5, 24); b.disc(11, 11, 2.5, 31); return b; };
GEN.fx_hit = () => { const b = new PB(16, 16); b.line(8, 0, 8, 15, 24); b.line(0, 8, 15, 8, 24); b.line(3, 3, 12, 12, 31); b.line(12, 3, 3, 12, 31); b.disc(8, 8, 2, 31); return b; };
GEN.fx_levelup = () => { const b = new PB(32, 20); b.ellipse(16, 13, 15, 6, 24); b.ellipse(16, 13, 13, 4.5, -1); for (let x = 5; x < 28; x += 5) b.line(x, 2, x, 7, 5); return b; };
GEN.item_expgem = () => { const b = new PB(10, 8); for (let y = 0; y < 8; y++) { const hw = y < 3 ? 2 + y : 7 - y; for (let x = 5 - hw; x < 5 + hw; x++) b.px(x, y, y < 3 ? 12 : 11); } return b.outline(); };
GEN.item_coin = () => { const b = new PB(10, 10); b.disc(5, 5, 4.5, 23); b.disc(5, 5, 3.3, 24); b.px(4, 3, 31); return b.outline(); };
GEN.item_potion = () => { const b = new PB(10, 12); b.disc(5, 8, 4, 22); b.rect(4, 1, 2, 4, 14); b.px(3, 7, 31); return b.outline(); };
GEN.item_magnet = () => { const b = new PB(12, 12); b.disc(6, 6, 5, 22); b.disc(6, 6, 2.5, -1); b.rect(1, 6, 10, 6, -1); b.rect(1, 6, 3, 4, 22); b.rect(8, 6, 3, 4, 22); b.rect(1, 9, 3, 2, 14); b.rect(8, 9, 3, 2, 14); return b.outline(); };
GEN.item_chest = () => { const b = new PB(16, 14); b.rect(1, 4, 14, 9, 18); b.rect(1, 2, 14, 4, 17); b.rect(1, 7, 14, 1, 24); b.rect(7, 6, 2, 3, 24); return b.outline(); };
// 보물(그림이 없을 때)
GEN.chest_wood = () => { const b = new PB(20, 20); b.rect(2, 7, 16, 11, 18); b.rect(2, 4, 16, 5, 17); b.rect(2, 9, 16, 1, 28); b.rect(9, 8, 2, 4, 19); return b.outline(); };
GEN.chest_gold = () => { const b = new PB(20, 20); b.rect(2, 7, 16, 11, 24); b.rect(2, 4, 16, 5, 23); b.rect(2, 9, 16, 1, 18); b.rect(9, 8, 2, 4, 31); b.px(4, 5, 31); return b.outline(); };
GEN.mimic = () => { const b = new PB(24, 24); b.rect(2, 10, 20, 12, 18); b.rect(2, 4, 20, 5, 17); for (let x = 3; x < 21; x += 3) { b.px(x, 9, 31); b.px(x + 1, 10, 31); } b.rect(3, 9, 18, 1, 22); b.px(7, 6, 24); b.px(16, 6, 24); return b.outline(); };
GEN.altar = () => { const b = new PB(40, 40); b.rect(6, 28, 28, 8, 15); b.rect(10, 18, 20, 10, 14); b.rect(14, 6, 12, 12, 30); b.disc(20, 12, 4, 21); b.px(19, 11, 31); return b.outline(); };
GEN.rune = () => { const b = new PB(12, 12); b.ellipse(6, 6, 5, 5.5, 20); b.line(4, 3, 7, 9, 21); b.line(7, 3, 4, 9, 12); return b.outline(); };
GEN.prop_tree = () => { const b = new PB(22, 24); b.rect(9, 15, 4, 8, 17); b.disc(11, 9, 9, 25); b.disc(10, 8, 7, 26); b.disc(8, 6, 3, 27); return b.outline(); };
GEN.prop_rock = () => { const b = new PB(16, 14); b.ellipse(8, 8, 7, 5.5, 15); b.ellipse(7, 7, 5, 3.5, 14); b.px(5, 5, 31); return b.outline(); };
GEN.prop_bush = () => { const b = new PB(18, 14); b.disc(6, 8, 5, 25); b.disc(12, 8, 5, 25); b.disc(9, 6, 5, 26); b.px(7, 6, 22); b.px(12, 7, 22); return b.outline(); };
GEN.prop_ruin = () => { const b = new PB(16, 26); b.rect(4, 3, 8, 21, 14); b.rect(2, 22, 12, 3, 15); b.rect(3, 1, 10, 3, 13); b.line(6, 5, 6, 20, 15); return b.outline(); };
GEN.ground_dirt = () => {
  const b = new PB(32, 32); const r = rng(9);
  for (let i = 0; i < 32 * 32; i++) { const v = r(); b.d[i] = v < 0.12 ? 17 : v < 0.25 ? 19 : 18; }
  return b;
};

function genTitleBg() {
  const W = 180, H = 320;
  const b = new PB(W, H);
  const r = rng(11);
  const bands = [1, 16, 9, 20, 2];
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < H; y++) {
    const f = Math.min(0.999, y / 230) * (bands.length - 1);
    const i0 = Math.floor(f), fr = f - i0;
    for (let x = 0; x < W; x++) {
      const th = (bayer[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
      b.d[y * W + x] = fr > th ? bands[Math.min(bands.length - 1, i0 + 1)] : bands[i0];
    }
  }
  for (let i = 0; i < 90; i++) b.px(r() * W, r() * 200, r() < 0.3 ? 31 : r() < 0.5 ? 14 : 13);
  b.disc(140, 52, 15, 5); b.disc(147, 47, 13, 1);
  for (let i = 0; i < 3; i++) {   // 유성 줄기
    const sx = 20 + i * 45 + r() * 20, sy = 20 + r() * 60, len = 30 + r() * 30;
    for (let t = 0; t < len; t++) b.px(sx + t, sy - t * 0.9, t < len * 0.3 ? 24 : t < len * 0.6 ? 23 : 22);
  }
  drawMeteor(b, SKINS[0], 52, 96, 2);
  for (let x = 0; x < W; x++) {     // 언덕
    const h1 = 228 + Math.sin(x * 0.045) * 9 + Math.sin(x * 0.11) * 4;
    const h2 = 246 + Math.sin(x * 0.03 + 2) * 7;
    for (let y = Math.floor(h1); y < H; y++) b.px(x, y, 25);
    for (let y = Math.floor(h2); y < H; y++) b.px(x, y, (x + y) % 7 === 0 ? 27 : 26);
  }
  for (let i = 0; i < 160; i++) b.px(r() * W, 250 + r() * 70, r() < 0.15 ? 6 : 27);
  return b.canvas();
}

// 아이템 그림이 없을 때: 등급 색 도형 + 이름 첫 글자
const RARITY_COL = { common: [31, 14], rare: [11, 10], legend: [24, 23], boss: [19, 17] };
function itemFallback(key, size) {
  const kind = CONFIG.items.kinds.find((k) => k.key === key);
  const col = RARITY_COL[kind ? kind.rarity : 'common'];
  const [w, h] = size;
  const b = new PB(w, h);
  b.ellipse(w / 2, h / 2, w / 2 - 1, h / 2 - 1, col[1]);
  b.ellipse(w / 2 - 0.5, h / 2 - 0.5, w / 2 - 2.5, h / 2 - 2.5, col[0]);
  b.outline();
  const c = b.canvas(), ctx = c.getContext('2d');
  let ch = key[0].toUpperCase();
  try { const nm = (globalThis.__itemName && globalThis.__itemName(key)) || ''; if (nm) ch = [...nm][0]; } catch (e) { /* */ }
  ctx.font = `bold ${Math.round(h * 0.62)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = CONFIG.pixel.palette[1];
  ctx.fillText(ch, w / 2, h / 2 + 1);
  // 글자 가장자리 반투명 제거(픽셀 느낌)
  const im = ctx.getImageData(0, 0, w, h), d = im.data;
  for (let i = 0; i < d.length; i += 4) d[i + 3] = d[i + 3] < 128 ? 0 : 255;
  ctx.putImageData(im, 0, 0);
  return c;
}

/**
 * 모든 이미지를 로드(없으면 생성).
 * @returns {sprites:{name:canvas}, titleBg, icon, report:{name:'image'|'code'}}
 */
export async function loadAssets() {
  const S = CONFIG.sprites;
  const names = Object.keys(S);
  const imgs = await Promise.all(names.map(async (n) => {
    const img = await loadImage('image/' + S[n].file);
    return img || (S[n].alt ? loadImage('image/' + S[n].alt) : null);
  }));
  const sprites = {};
  const report = {};
  let titleBg = null, icon = null;
  const P = CONFIG.pixel;
  for (let i = 0; i < names.length; i++) {
    const n = names[i], spec = S[n], img = imgs[i];
    let canvas = null;
    if (img && n === 'icon') {   // 파비콘용: 원본을 64px 로 (최근접)
      canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
      const c = canvas.getContext('2d'); c.imageSmoothingEnabled = false; c.drawImage(img, 0, 0, 64, 64);
      report[n] = 'image';
    } else if (img) {
      try {
        const w = img.naturalWidth, h = img.naturalHeight;
        if (spec.fit && (w > spec.size[0] || h > spec.size[1])) {   // 맵 아이템: 정해진 크기(16×16)로 줄임
          canvas = pixelize(img, { w: spec.size[0], h: spec.size[1], tile: false, P }).canvas;
          report[n] = 'image(fit ' + w + 'x' + h + '→' + spec.size[0] + ')';
        } else if (w <= P.nativeMax && h <= P.nativeMax) {
          canvas = nativeSprite(img, P, !spec.tile);            // 이미 도트 그림 → 원래 해상도
          report[n] = 'image(native ' + canvas.width + 'x' + canvas.height + ')';
        } else {
          canvas = pixelize(img, { w: spec.size[0], h: spec.size[1], tile: !!spec.tile, P }).canvas;
          report[n] = 'image(converted)';
        }
      } catch (e) { console.warn('이미지 처리 실패', n, e); }
    }
    if (!canvas) {
      report[n] = 'code';
      if (n === 'title_bg') canvas = genTitleBg();
      else if (GEN[n]) canvas = GEN[n]().canvas();
      else if (n.startsWith('item_')) canvas = itemFallback(n.slice(5), spec.size);
    }
    if (n === 'title_bg') titleBg = canvas;
    else if (n === 'icon') icon = canvas;
    else sprites[n] = canvas;
  }
  // HTML UI 전용 이미지 — 있으면 주소, 없으면 null
  const uiNames = CONFIG.uiImages;
  const uiImgs = await Promise.all(uiNames.map((n) => loadImage('image/' + n + '.png')));
  const ui = {};
  uiNames.forEach((n, i) => { ui[n] = uiImgs[i] ? 'image/' + n + '.png' : null; });
  return { sprites, titleBg, icon, ui, report };
}

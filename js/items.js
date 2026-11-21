// 맵 아이템 18종(평원에 저절로 생김 + 보스 보물상자)과 드래곤 불덩이. 모두 틱에서만 처리(공정성, 시드 난수).
// 효과는 그 판에만 유지. 시간제 효과를 다시 먹으면 시간이 연장된다.
import { CONFIG } from './config.js';
import { M, B, EXP } from './sim/mobs.js';
import { grid, cellX, cellY } from './sim/grid.js';
import { addStrike } from './render/effects.js';

const IC = CONFIG.items;
export const KINDS = IC.kinds.map((k) => k.key);
export const KIND = {};
KINDS.forEach((k, i) => { KIND[k] = i; });
export const RARITY = IC.kinds.map((k) => k.rarity);
export const ITEM_CHEST = KIND.chest;

export const items = [];
for (let i = 0; i < IC.max; i++) items.push({ active: false, kind: 0, x: 0, y: 0, life: 0, field: false, fly: 0, sx: 0, sy: 0 });

const FB_MAX = 24;
export const fireballs = [];
for (let i = 0; i < FB_MAX; i++) fireballs.push({ active: false, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, r: 0, life: 0, dmg: 0 });

export function clearItems() {
  for (let i = 0; i < items.length; i++) items[i].active = false;
  for (let i = 0; i < fireballs.length; i++) fireballs[i].active = false;
}

/** 아이템 놓기. fromX/fromY 를 주면 그 자리에서 튀어나와 x,y 로 날아감(보물상자) */
export function dropItem(kind, x, y, fromX, fromY) {
  let slot = null;
  for (let i = 0; i < items.length; i++) if (!items[i].active) { slot = items[i]; break; }
  if (!slot) { // 가득 차면 가장 오래된 아이템 교체(보물상자는 남김)
    for (let i = 0; i < items.length; i++) if (items[i].kind !== ITEM_CHEST && (!slot || items[i].life < slot.life)) slot = items[i];
    if (!slot) return null;
  }
  slot.active = true; slot.kind = kind; slot.x = x; slot.y = y; slot.field = false;
  slot.life = kind === ITEM_CHEST ? IC.chestLife : IC.life;
  slot.fly = fromX !== undefined ? 0.35 : 0;
  slot.sx = fromX ?? x; slot.sy = fromY ?? y;
  return slot;
}

export function spawnFireball(x, y, vx, vy, r, life, dmg) {
  for (let i = 0; i < fireballs.length; i++) {
    const f = fireballs[i];
    if (f.active) continue;
    f.active = true; f.x = f.px = x; f.y = f.py = y; f.vx = vx; f.vy = vy; f.r = r; f.life = life; f.dmg = dmg || 1;
    return;
  }
}

// ------------------------------------------------------------ 무작위 종류(등급 → 종류)
function eligible(G, key) {
  const p = G.player;
  if (key === 'chest') return false;
  if (key === 'star' && countOnField(KIND.star) >= IC.starMaxField) return false;   // 화면에 한 번에 1개까지
  if (!G.meteorLearned && IC.meteorOnly.includes(key)) return false;
  switch (key) {
    case 'heart': return p.maxHp < IC.heartMax;
    case 'boots': return p.boots < IC.bootsMax;
    case 'feather': return p.feathers < IC.featherMax;
    case 'orb': return G.orbItems < IC.orbMax;
    case 'ring': return G.ringItems < IC.ringMax;
    case 'lens': return G.lensItems < IC.lensMax;
  }
  return true;
}
const pool = [];
/** 등급을 고른 뒤 그 등급 안에서 종류별 가중치(items.kindWeight, 기본 1)로 */
export function randomKind(G) {
  const rng = G.rng, r = rng(), R = IC.rarity, KW = IC.kindWeight || {};
  const want = r < R.legend ? 'legend' : r < R.legend + R.rare ? 'rare' : 'common';
  for (const tier of [want, 'common', 'rare', 'legend']) {
    pool.length = 0;
    let sum = 0;
    for (let k = 0; k < KINDS.length; k++) if (RARITY[k] === tier && eligible(G, KINDS[k])) { pool.push(k); sum += KW[KINDS[k]] ?? 1; }
    if (!pool.length) continue;
    let x = rng() * sum;
    for (const k of pool) { x -= KW[KINDS[k]] ?? 1; if (x <= 0) return k; }
    return pool[pool.length - 1];
  }
  return KIND.coins;
}
function countOnField(kind) { let n = 0; for (let i = 0; i < items.length; i++) if (items[i].active && items[i].kind === kind) n++; return n; }

/** 평원 아이템 생성 타이머 */
export function updateItemSpawner(G, dt) {
  if (G.bench) return;
  G.itemT -= dt;
  if (G.itemT > 0) return;
  G.itemT = IC.everyMin + G.rng() * (IC.everyMax - IC.everyMin);
  let n = 0;
  for (let i = 0; i < items.length; i++) if (items[i].active && items[i].field) n++;
  if (n >= IC.fieldMax) return;
  const first = !G.itemFirstDone; G.itemFirstDone = true;   // 첫 아이템은 가까이
  const d1 = first ? IC.firstDistMin : IC.distMin, d2 = first ? IC.firstDistMax : IC.distMax;
  const a = G.rng() * Math.PI * 2, d = d1 + G.rng() * (d2 - d1);
  const it = dropItem(randomKind(G), G.player.x + Math.cos(a) * d, G.player.y + Math.sin(a) * d);
  if (it) it.field = true;
}

// ------------------------------------------------------------ 효과
/** 가까운 몹 count 마리 인덱스를 out 에 (칸 고리 순서 — 대략 가까운 순) */
const near = new Int32Array(IC.thunderCount);
function nearestMobs(px, py, count) {
  const g = grid, cols = g.cols, start = g.start, itemsG = g.items, DEAD = M.dead;
  const pcx = cellX(px), pcy = cellY(py);
  let n = 0;
  for (let k = 0; k < 40 && n < count; k++) {
    for (let v = -k; v <= k && n < count; v++) {
      const cy = pcy + v;
      if (cy < 0 || cy >= g.rows) continue;
      const edge = v === -k || v === k;
      for (let u = -k; u <= k && n < count; u += edge ? 1 : 2 * k || 1) {
        const cx = pcx + u;
        if (cx < 0 || cx >= cols) continue;
        const c = cy * cols + cx;
        for (let q = start[c], e = start[c + 1]; q < e && n < count; q++) { const i = itemsG[q]; if (!DEAD[i]) near[n++] = i; }
      }
    }
  }
  return n;
}

function applyItem(G, kind, x, y) {
  const p = G.player, key = KINDS[kind], s = G.stats;
  switch (key) {
    case 'star': G.starT += IC.starTime; break;
    case 'potion': p.hp = Math.min(p.maxHp, p.hp + 1); p.healPop = 0.4; break;
    case 'heart': p.maxHp = Math.min(IC.heartMax, p.maxHp + 1); p.hp = p.maxHp; p.healPop = 0.4; break;
    case 'crystal':
      if (G.meteorLearned) G.mana = CONFIG.mana.max;
      else G.addExp(s.expNeed * IC.crystalExpPct);
      break;
    case 'boots': p.boots = Math.min(IC.bootsMax, p.boots + 1); break;
    case 'feather': p.feathers = Math.min(IC.featherMax, p.feathers + 1); break;
    case 'magnet': G.magnetAll = IC.magnetTime; break;
    case 'coins': { const g = Math.round(IC.coinsGold + IC.coinsGoldPerMin * G.time / 60); s.gold += g; s.goldEarned += g; break; }
    case 'scroll': G.addExp(s.expNeed * IC.scrollPct); break;
    case 'hourglass': G.slowT += IC.hourglassTime; break;
    case 'bomb': G.blast(x, y, IC.bombRadius, IC.bombPower); break;
    case 'thunder': {
      const n = nearestMobs(p.x, p.y, IC.thunderCount);
      const HP = M.hp, DEAD = M.dead, TY = M.type;
      let kills = 0, expSum = 0;
      for (let k = 0; k < n; k++) {
        const i = near[k];
        addStrike(M.x[i], M.y[i], k * 0.004);          // 번개가 연쇄로(그림만)
        HP[i] -= IC.thunderDamage;
        if (HP[i] <= 0 && !DEAD[i]) { DEAD[i] = 2; kills++; expSum += EXP[TY[i]]; }
      }
      for (let k = 0; k < B.length; k++) {
        const b = B[k];
        if (!b.active) continue;
        const dx = b.x - p.x, dy = b.y - p.y;
        if (dx * dx + dy * dy < 600 * 600) { b.hp -= G.meteorPower * 2; b.flash = 4; addStrike(b.x, b.y, 0); if (b.hp <= 0) { b.active = false; G.onBossDeath(b); G.awardKills(0, 0, false, 1); } }
      }
      if (kills) G.awardKills(kills, expSum, false, 0);
      break;
    }
    case 'orb': G.orbItems++; G.boltCount = Math.min(CONFIG.bolts.maxCount, G.boltCount + 1); break;
    case 'ring': G.ringItems++; G.meteorPower *= 1 + IC.ringPct; break;
    case 'lens': G.lensItems++; G.meteorRadius *= 1 + IC.lensPct; break;
    case 'twin': G.twinT += IC.twinTime; break;
    case 'fury': G.furyT += IC.furyTime; break;
    case 'chest': {
      for (let k = 0; k < IC.chestItems; k++) {
        const a = (k / IC.chestItems + G.rng() * 0.2) * Math.PI * 2, d = 60 + G.rng() * 40;
        dropItem(randomKind(G), x + Math.cos(a) * d, y + Math.sin(a) * d, x, y);
      }
      break;
    }
  }
  G.events.push({ type: 'item', kind: key, rarity: RARITY[kind], x, y });
}
export { applyItem };

/** 틱마다: 아이템 줍기 + 불덩이 이동·판정 */
export function updateItems(G, dt, dashing) {
  const p = G.player;
  const pk = IC.pickupRadius * (G.char && G.char.pickup ? G.char.pickup : 1), pr2 = pk * pk;   // 견습 마법사 +50%
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it.active) continue;
    if (it.fly > 0) { it.fly = Math.max(0, it.fly - dt); continue; }
    it.life -= dt;
    if (it.life <= 0) { it.active = false; continue; }
    if (!p.alive) continue;
    const dx = p.x - it.x, dy = p.y - it.y;
    if (dx * dx + dy * dy > pr2) continue;
    it.active = false;
    applyItem(G, it.kind, it.x, it.y);
  }
  const pr = CONFIG.player.radius;
  for (let i = 0; i < fireballs.length; i++) {
    const f = fireballs[i];
    if (!f.active) continue;
    f.px = f.x; f.py = f.y;
    f.x += f.vx * dt; f.y += f.vy * dt;
    f.life -= dt;
    if (f.life <= 0) { f.active = false; continue; }
    if (!p.alive || dashing) continue;           // 대시 중에는 통과
    const dx = p.x - f.x, dy = p.y - f.y, r = f.r + pr;
    if (dx * dx + dy * dy < r * r) { f.active = false; G.hurtPlayer(1, 'fireball'); G.events.push({ type: 'fireHit', x: f.x, y: f.y }); }
  }
}

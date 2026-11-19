// 떨어지는 아이템(마력 물약, 자석, 보스 보물상자)과 드래곤 불덩이. 모두 틱에서만 처리(공정성).
import { CONFIG } from './config.js';

const IC = CONFIG.items;
export const ITEM_POTION = 0, ITEM_MAGNET = 1, ITEM_CHEST = 2;

export const items = [];
for (let i = 0; i < IC.max; i++) items.push({ active: false, kind: 0, x: 0, y: 0, life: 0 });

const FB_MAX = 24;
export const fireballs = [];
for (let i = 0; i < FB_MAX; i++) fireballs.push({ active: false, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, r: 0, life: 0, dmg: 0 });

export function clearItems() {
  for (let i = 0; i < items.length; i++) items[i].active = false;
  for (let i = 0; i < fireballs.length; i++) fireballs[i].active = false;
}

export function dropItem(kind, x, y) {
  let slot = null;
  for (let i = 0; i < items.length; i++) if (!items[i].active) { slot = items[i]; break; }
  if (!slot) { // 가득 차면 가장 오래된 일반 아이템 교체(보물상자는 남김)
    for (let i = 0; i < items.length; i++) if (items[i].kind !== ITEM_CHEST && (!slot || items[i].life < slot.life)) slot = items[i];
    if (!slot) return;
  }
  slot.active = true; slot.kind = kind; slot.x = x; slot.y = y;
  slot.life = kind === ITEM_CHEST ? IC.life * 3 : IC.life;
}

export function spawnFireball(x, y, vx, vy, r, life, dmg) {
  for (let i = 0; i < fireballs.length; i++) {
    const f = fireballs[i];
    if (f.active) continue;
    f.active = true; f.x = f.px = x; f.y = f.py = y; f.vx = vx; f.vy = vy; f.r = r; f.life = life; f.dmg = dmg || 20;
    return;
  }
}

/** 틱마다: 아이템 줍기 + 불덩이 이동·판정 */
export function updateItems(G, dt, dashing) {
  const p = G.player;
  const pr2 = IC.pickupRadius * IC.pickupRadius;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it.active) continue;
    it.life -= dt;
    if (it.life <= 0) { it.active = false; continue; }
    if (!p.alive) continue;
    const dx = p.x - it.x, dy = p.y - it.y;
    if (dx * dx + dy * dy > pr2) continue;
    it.active = false;
    if (it.kind === ITEM_POTION) {        // 체력 물약
      p.hp = Math.min(p.maxHp, p.hp + IC.potionHeal);
      G.events.push({ type: 'item', kind: 'potion', x: it.x, y: it.y });
    } else if (it.kind === ITEM_MAGNET) {
      G.magnetAll = 2.5;
      G.events.push({ type: 'item', kind: 'magnet', x: it.x, y: it.y });
    } else {
      for (let k = 0; k < IC.chestCards; k++) G.levelQueue.push(0);   // 0 = 보물상자 보너스 카드
      G.events.push({ type: 'item', kind: 'chest', x: it.x, y: it.y });
    }
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
    if (dx * dx + dy * dy < r * r) { f.active = false; G.hurtPlayer(f.dmg, 'fireball'); G.events.push({ type: 'fireHit', x: f.x, y: f.y }); }
  }
}

// 보물 탐험: 나무 상자(10% 미믹), 황금 상자(엘리트 호위), 고대 유적(룬석 3개 + 제단).
// 맵 아이템(지나가면 줍기)과 달리 찾아가서 열어야 한다. 모두 틱 안에서, 시드 난수로(공정성).
// 등장 시간·거리 규칙은 모두에게 같고 위치만 판마다 다르다.
import { CONFIG } from './config.js';
import { M, B, EXP, GUARD, addMob, addBoss } from './sim/mobs.js';
import { dropItem, randomKind } from './items.js';
import { addRing, addShake, addParticle, particleRoom } from './render/effects.js';
import { pal } from './skins.js';

const T = CONFIG.treasure;
export const KIND_WOOD = 0, KIND_GOLD = 1, KIND_RUIN = 2;
export const TREASURE_KEYS = ['wood', 'gold', 'ruin'];

// 보물 슬롯(고정 배열). runes: 룬석 3개 [x,y,picked]
export const treasures = [];
for (let i = 0; i < T.max; i++) {
  treasures.push({ active: false, kind: 0, x: 0, y: 0, gauge: 0, life: 0, mimic: false, elites: 0, runes: [], picked: 0, id: i + 1 });
}
const st = { woodT: 0, goldT: 0, ruinIdx: 0, siegeT: 0, siegeAcc: 0, siegeX: 0, siegeY: 0 };
export const siege = st;

export function resetTreasures() {
  for (const t of treasures) { t.active = false; GUARD.x[t.id] = NaN; GUARD.y[t.id] = NaN; }
  st.woodT = T.wood.first; st.goldT = T.gold.first; st.ruinIdx = 0; st.siegeT = 0; st.siegeAcc = 0;
  GUARD.r2 = T.gold.guardRadius * T.gold.guardRadius;
}

function freeSlot() { for (const t of treasures) if (!t.active) return t; return null; }
/** 법사에게서 거리 d1~d2 사이 무작위 위치 */
function placeAround(G, d1, d2, out) {
  const a = G.rng() * Math.PI * 2, d = d1 + G.rng() * (d2 - d1);
  out[0] = G.player.x + Math.cos(a) * d; out[1] = G.player.y + Math.sin(a) * d;
  return out;
}
const tmp = [0, 0];
const mul = (G) => (G.treasureMul || 1);   // 3단계 '탐사자의 렌즈' 등: 보물이 더 자주

/** 보물 하나 만들기(디버그 버튼도 이것을 씀). near: 법사 바로 옆(디버그) */
export function spawnTreasure(G, kind, opts = {}) {
  const t = freeSlot();
  if (!t) return null;
  const p = G.player;
  if (opts.near) { tmp[0] = p.x + 220; tmp[1] = p.y - 60; }
  else if (kind === KIND_WOOD) placeAround(G, T.wood.distMin, T.wood.distMax, tmp);
  else if (kind === KIND_GOLD) placeAround(G, T.gold.distMin, T.gold.distMax, tmp);
  else placeAround(G, T.ruin.distMin, T.ruin.distMax, tmp);
  t.active = true; t.kind = kind; t.x = tmp[0]; t.y = tmp[1]; t.gauge = 0; t.elites = 0; t.picked = 0; t.runes.length = 0;
  t.mimic = kind === KIND_WOOD && (opts.mimic ?? G.rng() < T.wood.mimicChance);
  t.life = kind === KIND_WOOD ? T.wood.life : kind === KIND_GOLD ? T.gold.life : 1e9;
  if (kind === KIND_GOLD) {
    // 금테두리 엘리트 8~15마리가 상자를 둘러쌈(지금 시각의 몹 종류 중 무작위, 체력 ×10)
    const n = T.gold.elitesMin + Math.floor(G.rng() * (T.gold.elitesMax - T.gold.elitesMin + 1));
    const types = [2, 4, 5, 7];   // 늑대·고블린·해골·오크
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2, r = T.gold.eliteRing;
      const i = addMob(t.x + Math.cos(a) * r, t.y + Math.sin(a) * r, types[k % types.length], (a / (Math.PI * 2) * 255) | 0);
      if (i < 0) break;
      M.hp[i] *= T.gold.eliteHp; M.elite[i] = t.id;
      t.elites++;
    }
    GUARD.x[t.id] = t.x; GUARD.y[t.id] = t.y;
    G.elitesAlive += t.elites;
  }
  if (kind === KIND_RUIN) {
    for (let k = 0; k < T.ruin.runes; k++) {
      const a = (k / T.ruin.runes + G.rng() * 0.25) * Math.PI * 2, r = T.ruin.runeRadius * (0.45 + G.rng() * 0.55);
      t.runes.push([t.x + Math.cos(a) * r, t.y + Math.sin(a) * r, 0]);
    }
  }
  G.events.push({ type: 'treasureSpawn', kind: TREASURE_KEYS[kind] });
  return t;
}

/** 엘리트가 죽었을 때(compactMobs 콜백에서) */
export function onEliteDead(G, id) {
  G.elitesAlive = Math.max(0, G.elitesAlive - 1);
  const t = treasures[id - 1];
  if (t && t.active && t.kind === KIND_GOLD && t.elites > 0) {
    t.elites--;
    if (t.elites === 0) G.events.push({ type: 'elitesCleared', x: t.x, y: t.y });
  }
}

function burst(G, x, y, col, big) {
  addRing(x, y, 8, big ? 260 : 150, 0.45, col, 1, 4);
  addRing(x, y, 4, big ? 120 : 70, 0.2, pal(31), 0);
  const n = Math.min(particleRoom(), big ? 80 : 40);
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 220;
    addParticle(x, y - 8, Math.cos(a) * s, Math.sin(a) * s - 80, 0.5 + Math.random() * 0.4, k & 1 ? col : pal(31), 2, 200);
  }
  addShake(big ? 5 : 3);
  G.hitstop = Math.max(G.hitstop, big ? 0.15 : 0.08);   // 화면 살짝 멈춤
}

function close(t) { t.active = false; GUARD.x[t.id] = NaN; GUARD.y[t.id] = NaN; }

/** 황금 상자 보상: 즉시 레벨업 + (3단계) 유물 3개 중 1개 */
function goldReward(G, x, y, src) {
  for (let k = 0; k < T.gold.levels; k++) G.addExp(G.stats.expNeed - G.stats.exp + 0.01);
  G.events.push({ type: 'treasureOpen', kind: src, x, y, relic: 'normal' });
}

function openTreasure(G, t) {
  const p = G.player;
  if (t.kind === KIND_WOOD) {
    G.addExp(G.stats.expNeed * T.wood.expPct);
    for (let k = 0; k < T.wood.items; k++) {
      const a = (k / T.wood.items + G.rng() * 0.3) * Math.PI * 2, d = 60 + G.rng() * 30;
      dropItem(randomKind(G), t.x + Math.cos(a) * d, t.y + Math.sin(a) * d, t.x, t.y);
    }
    burst(G, t.x, t.y, pal(19), false);
    G.events.push({ type: 'treasureOpen', kind: 'wood', x: t.x, y: t.y });
  } else if (t.kind === KIND_GOLD) {
    burst(G, t.x, t.y, pal(24), true);
    goldReward(G, t.x, t.y, 'gold');
  } else {
    // 유적 개방: 1초 연출 + 레벨 +2 + (3단계) 전설 유물 + 10초 대습격
    burst(G, t.x, t.y, pal(21), true);
    G.hitstop = Math.max(G.hitstop, T.ruin.openPause);
    for (let k = 0; k < T.ruin.levels; k++) G.addExp(G.stats.expNeed - G.stats.exp + 0.01);
    st.siegeT = T.ruin.siegeTime; st.siegeAcc = 0; st.siegeX = p.x; st.siegeY = p.y;
    G.events.push({ type: 'treasureOpen', kind: 'ruin', x: t.x, y: t.y, relic: 'legend' });
  }
  G.stats.treasures = (G.stats.treasures || 0) + 1;
  close(t);
}

/** 미믹: 상자가 이빨을 드러내며 작은 보스로 + 주변에 몹 무리 */
function wakeMimic(G, t) {
  const MC = T.mimic, kind = CONFIG.boss.kinds.findIndex((k) => k.key === 'mimic');
  const hp = MC.hp * Math.pow(MC.hpGrowth, G.time / 60);
  const b = addBoss(t.x, t.y, hp, kind);
  if (b) b.mimic = true;
  for (let k = 0; k < MC.summon; k++) {
    const a = G.rng() * Math.PI * 2, r = MC.summonRadius * (0.6 + G.rng() * 0.4);
    if (addMob(t.x + Math.cos(a) * r, t.y + Math.sin(a) * r, k % 3 ? 0 : 4, (G.rng() * 255) | 0) < 0) break;
  }
  addRing(t.x, t.y, 10, 200, 0.4, pal(22), 1, 4);
  addShake(5);
  G.events.push({ type: 'mimic', x: t.x, y: t.y });
  close(t);
}
/** 미믹을 잡으면 황금 상자 보상 */
export function onMimicDead(G, b) { burst(G, b.x, b.y, pal(24), true); goldReward(G, b.x, b.y, 'mimic'); }

/** 틱마다: 생성 타이머, 열기 게이지, 룬석 줍기, 대습격 */
export function updateTreasures(G, dt) {
  if (G.bench) return;
  const p = G.player;
  // 생성
  st.woodT -= dt * mul(G);
  if (st.woodT <= 0) { st.woodT = T.wood.everyMin + G.rng() * (T.wood.everyMax - T.wood.everyMin); spawnTreasure(G, KIND_WOOD); }
  st.goldT -= dt * mul(G);
  if (st.goldT <= 0) { st.goldT = T.gold.everyMin + G.rng() * (T.gold.everyMax - T.gold.everyMin); spawnTreasure(G, KIND_GOLD); }
  if (st.ruinIdx < T.ruin.times.length && G.time >= T.ruin.times[st.ruinIdx]) { st.ruinIdx++; spawnTreasure(G, KIND_RUIN); }

  const r2 = T.openRadius * T.openRadius;
  for (const t of treasures) {
    if (!t.active) continue;
    t.life -= dt;
    if (t.life <= 0) { close(t); continue; }
    if (!p.alive) continue;
    const dx = p.x - t.x, dy = p.y - t.y, on = dx * dx + dy * dy < r2;
    if (t.kind === KIND_RUIN) {
      for (const rn of t.runes) {
        if (rn[2]) continue;
        const rx = p.x - rn[0], ry = p.y - rn[1];
        if (rx * rx + ry * ry < T.ruin.runePick * T.ruin.runePick) {
          rn[2] = 1; t.picked++;
          addRing(rn[0], rn[1], 4, 60, 0.3, pal(21), 1, 3);
          G.events.push({ type: 'rune', n: t.picked, of: t.runes.length });
        }
      }
      const ar = T.ruin.altarRadius;
      if (t.picked >= t.runes.length && dx * dx + dy * dy < ar * ar) openTreasure(G, t);
      continue;
    }
    const time = t.kind === KIND_WOOD ? T.wood.openTime : T.gold.openTime;
    if (t.kind === KIND_GOLD && t.elites === 0) { openTreasure(G, t); continue; }   // 엘리트를 모두 잡으면 바로 열림
    if (on) {
      t.gauge = Math.min(1, t.gauge + dt / time);
      if (t.mimic && t.gauge >= T.mimic.wakeAt) { wakeMimic(G, t); continue; }
      if (t.gauge >= 1) openTreasure(G, t);
    } else if (t.gauge > 0) t.gauge = Math.max(0, t.gauge - dt * T.wood.decay);
  }

  // 유적 대습격: 10초간 사방에서
  if (st.siegeT > 0) {
    st.siegeT -= dt; st.siegeAcc += dt;
    const R = T.ruin;
    if (st.siegeAcc >= R.siegeEvery) {
      st.siegeAcc -= R.siegeEvery;
      const n = Math.round(R.siegeCount + R.siegeCountPerMin * G.time / 60), per = Math.ceil(n / R.siegeDirs);
      for (let d = 0; d < R.siegeDirs; d++) {
        const a = d / R.siegeDirs * Math.PI * 2 + G.rng() * 0.3;
        const cx = p.x + Math.cos(a) * R.siegeRadius, cy = p.y + Math.sin(a) * R.siegeRadius;
        for (let k = 0; k < per; k++) {
          const aa = G.rng() * Math.PI * 2, rr = Math.sqrt(G.rng()) * 60;
          if (addMob(cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr, (G.rng() * 6) | 0, (G.rng() * 255) | 0) < 0) break;
        }
      }
    }
  }
}

/** 나침반용: 가장 가까운(또는 rank 번째) 보물 목표. 유적은 남은 룬석 → 다 모으면 제단 */
const targets = [];
export function treasureTargets(G) {
  targets.length = 0;
  const p = G.player;
  for (const t of treasures) {
    if (!t.active) continue;
    let tx = t.x, ty = t.y;
    if (t.kind === KIND_RUIN && t.picked < t.runes.length) {
      let bd = 1e18;
      for (const rn of t.runes) { if (rn[2]) continue; const d = (rn[0] - p.x) ** 2 + (rn[1] - p.y) ** 2; if (d < bd) { bd = d; tx = rn[0]; ty = rn[1]; } }
    }
    targets.push({ t, x: tx, y: ty, d: Math.hypot(tx - p.x, ty - p.y) });
  }
  targets.sort((a, b) => a.d - b.d);
  return targets;
}

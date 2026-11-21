// 유물: 황금 상자·미믹(일반 3개 중 1개), 고대 유적(전설 3개 중 1개). 그 판 내내 유지, 한 판 최대 6개, 중복 없음.
// 두 유물을 함께 가지면 공명(추가 효과). 효과 판정은 각 모듈(meteor·bolts·game·spawn·treasure)이 G.R[키] 를 보고 처리.
import { CONFIG } from './config.js';

const RC = CONFIG.relics;
export const RELICS = RC.list;                 // [{ key, rarity }]
export const RELIC_KEYS = RELICS.map((r) => r.key);
const RARITY = Object.fromEntries(RELICS.map((r) => [r.key, r.rarity]));
export function relicRarity(key) { return RARITY[key]; }

/** 공명: 두 유물 → 공명 키 */
export const RESONANCES = RC.resonance;        // [{ key, a, b }]

export function resetRelics(G) { G.relics = []; G.R = {}; G.res = {}; G.relicQueue = []; G.phoenixUsed = false; }

/** 아직 없는 공명 상대가 있는지(선택 창에서 테두리 빛남) */
export function wouldResonate(G, key) {
  for (const r of RESONANCES) {
    if ((r.a === key && G.R[r.b]) || (r.b === key && G.R[r.a])) return r.key;
  }
  return null;
}

/**
 * 선택지 3개. tier 'legend' = 유적(전설 우선, 모자라면 희귀로 채움), 'normal' = 황금 상자(등급 가중치로 무작위).
 * 시드 난수 G.rng 로 — 같은 시드면 같은 선택지
 */
export function relicChoices(G, tier) {
  const free = RELIC_KEYS.filter((k) => !G.R[k]);
  const rng = G.rng, out = [];
  const pick = (pool, weight) => {
    let sum = 0;
    for (const k of pool) sum += weight(k);
    let x = rng() * sum;
    for (const k of pool) { x -= weight(k); if (x <= 0) return k; }
    return pool[pool.length - 1];
  };
  let pool = free.slice();
  const order = tier === 'legend' ? ['legend', 'rare', 'common'] : null;
  while (out.length < RC.choices && pool.length) {
    let k;
    if (order) { const tierNow = order.find((t) => pool.some((p) => RARITY[p] === t)); k = pick(pool.filter((p) => RARITY[p] === tierNow), () => 1); }
    else k = pick(pool, (p) => RC.weight[RARITY[p]]);
    out.push(k);
    pool = pool.filter((p) => p !== k);
  }
  return out;
}

/** 유물 얻기. 공명이 생기면 'resonance' 이벤트 */
export function applyRelic(G, key) {
  if (G.R[key] || G.relics.length >= RC.max) return;
  G.relics.push(key); G.R[key] = true;
  const p = G.player;
  switch (key) {
    case 'heart': p.maxHp += RC.heartPlus; p.hp = p.maxHp; p.healPop = 0.4; break;
    case 'lens': G.treasureMul = RC.lensTreasureMul; G.compass2 = true; break;
    case 'crown': G.crown = true; break;
  }
  for (const r of RESONANCES) {
    if (!G.res[r.key] && G.R[r.a] && G.R[r.b]) { G.res[r.key] = true; G.events.push({ type: 'resonance', key: r.key }); }
  }
  G.events.push({ type: 'relic', key });
}

/** 보물 보상으로 유물 선택 대기열에 추가(꽉 찼으면 무시) */
export function queueRelic(G, tier) {
  if (G.relics.length + G.relicQueue.length >= RC.max) return;
  if (!RELIC_KEYS.some((k) => !G.R[k])) return;
  G.relicQueue.push(tier);
}

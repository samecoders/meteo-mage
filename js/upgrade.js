// 경험치·레벨업 카드.
// 레벨 1~4: 마법탄 카드(개수/발사 속도/관통 중 무작위 2장). 레벨 5: 메테오 습득(카드 대신).
// 레벨 6~: 메테오 범위/위력. 특수 카드는 레벨 10, 15, 20…
import { CONFIG } from './config.js';

const PR = CONFIG.progress;
const BC = CONFIG.bolts;

export function expNeed(level) {
  const tb = PR.expTable, n = tb.length;
  if (level <= n) return tb[Math.max(0, level - 1)];
  return Math.round(tb[n - 1] * Math.pow(PR.expGrowth, level - n));
}

/** 경험치 추가. 한 번에 여러 레벨이 오르면 levelQueue 에 쌓임 */
export function addExp(G, amount) {
  const s = G.stats;
  s.exp += amount;
  while (s.exp >= s.expNeed) {
    s.exp -= s.expNeed;
    s.level++;
    s.expNeed = expNeed(s.level);
    G.levelQueue.push(s.level);
  }
}

export const SPECIALS = ['twin', 'fire', 'magnet', 'dash2', 'fastFall', 'vitality'];
export const BOLT_CARDS = ['boltCount', 'boltRate', 'boltPierce'];

function specialAvailable(G, id) {
  switch (id) {
    case 'twin': return !G.twin;
    case 'fire': return !G.fire;
    case 'magnet': return G.magnetLevel < 3;
    case 'dash2': return G.player.dashMax < 2;
    case 'fastFall': return G.fallTime > CONFIG.meteor.fastFallTime;
    case 'vitality': return G.player.maxHp < CONFIG.items.heartMax;
  }
  return false;
}
function boltAvailable(G, id) {
  if (id === 'boltCount') return G.boltCount < BC.maxCount;
  if (id === 'boltPierce') return G.boltPierce < BC.maxPierce;
  return true;
}

/** 이 레벨에서 메테오를 배우는지 */
export function isLearnLevel(level) { return level === CONFIG.meteor.unlockLevel; }

/**
 * 해당 레벨의 카드 목록. 카드 섞기는 게임 시드 난수(G.rng)로 — 같은 시드면 같은 카드.
 * level 은 새로 오른 레벨(2부터). 레벨 5(메테오 습득)는 카드가 없다.
 */
export function cardsFor(G, level) {
  const rng = G.rng;
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
  if (level < CONFIG.meteor.unlockLevel) {
    const pool = shuffle(BOLT_CARDS.filter((id) => boltAvailable(G, id)));
    return { special: false, cards: pool.slice(0, 2) };
  }
  if (level % PR.specialEvery === 0 && !isLearnLevel(level)) {
    const pool = shuffle(SPECIALS.filter((id) => specialAvailable(G, id)));
    if (pool.length) return { special: true, cards: pool.slice(0, 3) };
  }
  return { special: false, cards: ['range', 'power'] };
}

/** 다음 범위·위력 카드의 증가율: 같은 카드를 거듭 고를수록 조금씩 줄어듦(번갈아 고르는 게 이득) */
export function cardPct(G, id) {
  const MC = CONFIG.meteor;
  const steps = id === 'range' ? MC.rangeCardSteps : MC.powerCardSteps, n = id === 'range' ? G.rangeLevel : G.powerLevel;
  return steps ? steps[Math.min(n, steps.length - 1)] : (id === 'range' ? MC.rangeCardPct : MC.powerCardPct);
}

export function applyCard(G, id) {
  const MC = CONFIG.meteor;
  switch (id) {
    case 'range': G.meteorRadius *= 1 + cardPct(G, 'range'); G.rangeLevel++; break;
    case 'power': G.meteorPower *= 1 + cardPct(G, 'power'); G.powerLevel++; break;
    case 'twin': G.twin = true; break;
    case 'fire': G.fire = true; break;
    case 'magnet': G.magnetLevel++; break;
    case 'dash2': G.player.dashMax = 2; G.player.dashCharges = Math.min(2, G.player.dashCharges + 1); break;
    case 'fastFall': G.fallTime = MC.fastFallTime; break;
    case 'vitality': G.player.maxHp = Math.min(CONFIG.items.heartMax, G.player.maxHp + 1); G.player.hp = G.player.maxHp; break;
    case 'boltCount': G.boltCount = Math.min(BC.maxCount, G.boltCount + 1); break;
    case 'boltRate': G.boltRate *= 1 + BC.rateCardPct; break;
    case 'boltPierce': G.boltPierce = Math.min(BC.maxPierce, G.boltPierce + 1); break;
  }
}

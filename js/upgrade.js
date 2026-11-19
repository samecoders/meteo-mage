// 경험치·레벨업 카드. 필요 경험치는 지수 곡선(수천 킬이 한 번에 나오므로).
import { CONFIG } from './config.js';

const PR = CONFIG.progress;

export function expNeed(level) { return Math.round(PR.expBase * Math.pow(PR.expGrowth, level - 1)); }

/** 경험치 추가. 한 번에 여러 레벨이 오르면 pendingLevels 에 쌓임 */
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

function specialAvailable(G, id) {
  switch (id) {
    case 'twin': return !G.twin;
    case 'fire': return !G.fire;
    case 'magnet': return G.magnetLevel < 3;
    case 'dash2': return G.player.dashMax < 2;
    case 'fastFall': return G.fallTime > CONFIG.meteor.fastFallTime;
    case 'vitality': return G.player.maxHp < CONFIG.player.hp * 2;
  }
  return false;
}

/** 해당 레벨의 카드 목록 (5레벨마다 특수 카드 3장 중 1장, 그 외 2장) */
export function cardsFor(G, level) {
  if (level % PR.specialEvery === 0) {
    const pool = SPECIALS.filter((id) => specialAvailable(G, id));
    for (let i = pool.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    if (pool.length) return { special: true, cards: pool.slice(0, 3) };
  }
  return { special: false, cards: ['range', 'power'] };
}

export function applyCard(G, id) {
  const MC = CONFIG.meteor;
  switch (id) {
    case 'range': G.meteorRadius *= 1 + MC.rangeCardPct; G.rangeLevel++; break;
    case 'power': G.meteorPower *= 1 + MC.powerCardPct; G.powerLevel++; break;
    case 'twin': G.twin = true; break;
    case 'fire': G.fire = true; break;
    case 'magnet': G.magnetLevel++; break;
    case 'dash2': G.player.dashMax = 2; G.player.dashCharges = Math.min(2, G.player.dashCharges + 1); break;
    case 'fastFall': G.fallTime = MC.fastFallTime; break;
    case 'vitality': G.player.maxHp += CONFIG.player.hp * 0.25; G.player.hp = G.player.maxHp; break;
  }
}

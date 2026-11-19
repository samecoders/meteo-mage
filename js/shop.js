// 판 안 상점(쉴드, 대시 강화 — 그 판에만 유효) + 보관 골드로 사는 메테오 모양 상점
import { CONFIG } from './config.js';
import { save } from './save.js';
import { SKINS, skinPrice } from './skins.js';

const S = CONFIG.shop;

export function shieldPrice(G) { return Math.round(S.shieldBase * Math.pow(S.shieldGrowth, G.shieldBought)); }
export function dashPrice(G) { return Math.round(S.dashBase * Math.pow(S.dashGrowth, G.player.dashLevel)); }
export function canBuyShield(G) { return G.player.alive && !G.player.shield && G.stats.gold >= shieldPrice(G); }
export function canBuyDash(G) { return G.player.alive && G.player.dashLevel < CONFIG.dash.maxUpgrades && G.stats.gold >= dashPrice(G); }

export function buyShield(G) {
  if (!canBuyShield(G)) return false;
  G.stats.gold -= shieldPrice(G);
  G.shieldBought++;
  G.player.shield = true;
  return true;
}

export function buyDash(G) {
  if (!canBuyDash(G)) return false;
  G.stats.gold -= dashPrice(G);
  G.player.dashLevel++;
  return true;
}

// ------------------------------------------------------------ 메테오 모양
export function ownsSkin(id) { return save.data.skinsOwned.includes(id); }

export function buySkin(id) {
  if (ownsSkin(id)) return true;
  const price = skinPrice(id);
  if (save.data.bank < price) return false;
  save.data.bank -= price;
  save.data.skinsOwned.push(id);
  save.data.skinEquipped = id;
  save.write();
  return true;
}

export function equipSkin(id) {
  if (!ownsSkin(id)) return false;
  save.data.skinEquipped = id;
  save.write();
  return true;
}

export function allSkins() { return SKINS; }

// ------------------------------------------------------------ 주인공 모습(꾸미기 전용)
export const HEROES = Object.keys(CONFIG.heroes.prices);
export function heroPrice(id) { return CONFIG.heroes.prices[id] ?? 0; }
export function ownsHero(id) { return save.data.heroesOwned.includes(id); }
export function buyHero(id) {
  if (ownsHero(id)) return true;
  const price = heroPrice(id);
  if (save.data.bank < price) return false;
  save.data.bank -= price;
  save.data.heroesOwned.push(id);
  save.data.heroEquipped = id;
  save.write();
  return true;
}
export function equipHero(id) {
  if (!ownsHero(id)) return false;
  save.data.heroEquipped = id;
  save.write();
  return true;
}

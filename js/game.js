// 한 판의 상태(G)와 고정 틱 로직. 게임 규칙은 모두 여기서 30틱/초로만 진행된다.
import { CONFIG, TICK_DT } from './config.js';
import { M, B, RADIUS, DMG, TYPE_KEYS, allocMobs, clearMobs, clearBosses, compactMobs, moveMobs, moveBosses, reorderMobs, addMob, SLIME_TYPE } from './sim/mobs.js';
import { clearItems, updateItems, dropItem, spawnFireball, ITEM_CHEST } from './items.js';
import { SPR } from './assets.js';
import { grid, allocGrid, buildGrid, cellX, cellY } from './sim/grid.js';
import { resetSpawner, updateSpawner } from './sim/spawn.js';
import { createPlayer, resetPlayer } from './player.js';
import { isDashing } from './dash.js';
import { resetMeteors, launchMeteor, updateMeteors, updateFires, pushMobs } from './meteor.js';
import { clearOrbs, updateOrbs } from './orbs.js';
import { addExp, expNeed } from './upgrade.js';
import { clearEffects, addCorpse, addRing, addShake, addParticle, addSpriteFx } from './render/effects.js';
import { skinById, pal } from './skins.js';

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const G = {
  mode: 'title',           // title | play | levelup | paused | over
  bench: false, benchCount: 0,
  seed: 0, rng: Math.random,
  time: 0, ticks: 0,
  player: createPlayer(),
  mana: 0,
  meteorRadius: 0, meteorPower: 0, fallTime: 0,
  twin: false, fire: false, magnetLevel: 0, rangeLevel: 0, powerLevel: 0,
  skin: skinById('fire'),
  hero: 'mage',
  magnetAll: 0,           // 자석 아이템 남은 시간
  stats: null,
  levelQueue: [], levelUpWait: 0,
  shieldBought: 0,
  goldFrac: 0,
  hitstop: 0,
  dying: 0,
  zoomShort: CONFIG.view.baseShort, // 게임 상태로 정해지는 줌 단계(기기와 무관)
  spawnR: CONFIG.spawn.radius,
  events: [],
  taps: [],
  corpseX: 0, corpseY: 0,
  nearCount: 0,
  hurtPlayer, awardKills, onBossDeath,
};

export function initSim(cap) {
  allocMobs(cap);
  allocGrid(cap);
}

export function newGame(opts) {
  G.bench = !!opts.bench;
  G.benchCount = opts.benchCount || 0;
  G.seed = (opts.seed ?? (Math.random() * 2 ** 31)) >>> 0;
  G.rng = mulberry32(G.seed);
  G.time = 0; G.ticks = 0;
  resetPlayer(G.player);
  G.mana = CONFIG.mana.start;
  const MC = CONFIG.meteor;
  G.meteorRadius = MC.radius; G.meteorPower = MC.power; G.fallTime = MC.fallTime;
  G.twin = false; G.fire = false; G.magnetLevel = 0; G.rangeLevel = 0; G.powerLevel = 0;
  G.skin = skinById(opts.skin || 'fire');
  G.hero = opts.hero || 'mage';
  G.magnetAll = 0;
  G.stats = { kills: 0, maxCombo: 0, maxMobs: 0, gold: 0, level: 1, exp: 0, expNeed: expNeed(1), bossKills: 0, goldEarned: 0, dmgTaken: {}, deathBy: '' };
  G.levelQueue.length = 0; G.levelUpWait = 0;
  G.shieldBought = 0; G.goldFrac = 0; G.hitstop = 0; G.dying = 0;
  G.events.length = 0; G.taps.length = 0;
  clearMobs(); clearBosses(); clearOrbs(); clearItems(); resetMeteors(); clearEffects();
  resetSpawner(G.rng);
  updateZoom();
  G.mode = 'play';
}

/** 메테오 범위로 정해지는 줌 단계(360/480/600)와 스폰 반경 */
function updateZoom() {
  const V = CONFIG.view;
  const need = G.meteorRadius * 2 * V.zoomFit / V.worldPerPx;
  let step = V.zoomSteps[V.zoomSteps.length - 1];
  for (let i = 0; i < V.zoomSteps.length; i++) if (V.zoomSteps[i] >= need) { step = V.zoomSteps[i]; break; }
  G.zoomShort = step;
  G.spawnR = CONFIG.spawn.radius * step / V.baseShort;
}

/** 탭: 마력이 가득 찼을 때만 다음 틱에 메테오 발사 */
export function queueTap(wx, wy) {
  if (G.mode !== 'play' || !G.player.alive || G.mana < CONFIG.mana.max) return false;
  G.taps.push(wx, wy);
  return true;
}

// 마력용 주변 칸 오프셋(칸 중심 거리 기준)
const nearOffs = [];
{
  const cs = CONFIG.grid.cellSize, r = CONFIG.mana.nearRadius, k = Math.ceil(r / cs);
  for (let v = -k; v <= k; v++) for (let u = -k; u <= k; u++) if ((u * cs) ** 2 + (v * cs) ** 2 <= r * r) nearOffs.push(u, v);
}

/**
 * 법사 피해. src: 피해 원인(몹 타입 키, 'boss', 'fireball', 'meteor') — 통계·연출용.
 * 쉴드가 있으면 1회 막고, 아니면 체력이 깎이고 잠깐 무적 + 주변 몹을 밀쳐냄. 체력 0 이면 사망.
 */
function hurtPlayer(dmg, src) {
  const p = G.player;
  if (!p.alive || G.bench || G.god || p.invuln > 0) return;   // G.god: 콘솔 테스트 전용
  if (p.shield) {
    const S = CONFIG.shop;
    p.shield = false;
    p.invuln = S.shieldInvuln;
    pushMobs(p.x, p.y, S.shieldPushRadius, S.shieldPushImpulse);
    addRing(p.x, p.y, 10, S.shieldPushRadius, 0.4, pal(12), 1, 4);
    addRing(p.x, p.y, 10, S.shieldPushRadius * 0.7, 0.25, pal(31), 0);
    addShake(4);
    G.events.push({ type: 'shieldBreak' });
    return;
  }
  const PC = CONFIG.player;
  p.hp -= dmg;
  p.sinceHurt = 0;
  G.stats.dmgTaken[src] = (G.stats.dmgTaken[src] || 0) + dmg;
  if (p.hp > 0) {
    p.invuln = PC.hurtInvuln;
    pushMobs(p.x, p.y, PC.knockRadius, PC.knockImpulse);
    addRing(p.x, p.y, 8, PC.knockRadius, 0.25, pal(22), 1, 3);
    addShake(3);
    G.events.push({ type: 'hurt', dmg, src });
    return;
  }
  p.hp = 0;
  G.stats.deathBy = src;
  p.alive = false;
  G.dying = 0.0001;
  addShake(6);
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 160;
    addParticle(p.x, p.y, Math.cos(a) * s, Math.sin(a) * s, 0.6 + Math.random() * 0.5, pal(i % 2 ? 10 : 12), 2, 0);
  }
  G.events.push({ type: 'death', byMeteor: src === 'meteor' });
}

// 보스 능력 알림(소환·돌진·불덩이) — 판정은 틱 안에서, 연출만 이벤트로
const bossHooks = {
  charge(b) { G.events.push({ type: 'bossCharge', x: b.x, y: b.y }); },
  summon(b) {
    addRing(b.x, b.y, 20, 160, 0.5, pal(6), 1, 3);
    G.events.push({ type: 'summon', x: b.x, y: b.y });
  },
  fire(b, vx, vy, r, life, dmg) {
    spawnFireball(b.x + vx * 0.12, b.y + vy * 0.12 - 20, vx, vy, r, life, dmg);
    G.events.push({ type: 'fireball', x: b.x, y: b.y });
  },
};

/** 보스가 죽었을 때: 보물상자, 슬라임 왕은 슬라임으로 터짐 */
function onBossDeath(b) {
  const K = CONFIG.boss.kinds[b.kind];
  dropItem(ITEM_CHEST, b.x, b.y);
  if (K.split) {
    const rng = G.rng;
    for (let k = 0; k < K.split; k++) {
      const a = rng() * Math.PI * 2, r = 20 + Math.sqrt(rng()) * 140;
      const i = addMob(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, SLIME_TYPE, (rng() * 255) | 0);
      if (i < 0) break;
      M.vx[i] = Math.cos(a) * 220; M.vy[i] = Math.sin(a) * 220;
    }
  }
  addRing(b.x, b.y, 10, 260, 0.6, pal(24), 1, 5);
  addSpriteFx(b.x, b.y, SPR.fx_explosion, 4, 0.5, 0, 0);
  addShake(6);
  G.events.push({ type: 'bossKill', kind: b.kind, x: b.x, y: b.y });
}

function awardKills(kills, expSum, isCombo, bossKills) {
  const s = G.stats, PR = CONFIG.progress;
  if (kills + bossKills <= 0) return;
  s.kills += kills + bossKills;
  const mult = isCombo ? 1 + PR.comboMultK * Math.log10(1 + kills) : 1;
  let exp = expSum * mult + bossKills * CONFIG.boss.exp;
  G.goldFrac += kills / PR.killsPerGold * mult;
  let gold = Math.floor(G.goldFrac);
  G.goldFrac -= gold;
  if (isCombo) {
    let bonus = 0;
    for (let i = 0; i < PR.comboGoldBonus.length; i++) if (kills >= PR.comboGoldBonus[i][0]) bonus = PR.comboGoldBonus[i][1];
    gold += bonus;
    if (kills > s.maxCombo) s.maxCombo = kills;
    if (kills > 0) G.events.push({ type: 'combo', kills, mult, x: G.corpseX, y: G.corpseY });
  }
  gold += bossKills * CONFIG.boss.gold;
  s.bossKills += bossKills;
  s.gold += gold; s.goldEarned += gold;
  addExp(G, exp);
}

function onDeadMob(i) {
  if (M.dead[i] === 1) addCorpse(M.x[i], M.y[i], M.type[i], G.corpseX, G.corpseY, true);
  else addCorpse(M.x[i], M.y[i], M.type[i], M.x[i], M.y[i] - 1, false);
}

/** 고정 틱 1회 */
export function tick() {
  const dt = TICK_DT, p = G.player;
  G.time += dt; G.ticks++;

  buildGrid(p.x, p.y);
  if (G.ticks % 10 === 0) reorderMobs(grid.items);   // 캐시 효율용 공간 재정렬

  // 탭 → 메테오
  for (let i = 0; i < G.taps.length; i += 2) {
    if (G.mana >= CONFIG.mana.max && p.alive) {
      G.mana = 0;
      launchMeteor(G, G.taps[i], G.taps[i + 1]);
      G.events.push({ type: 'launch' });
    }
  }
  G.taps.length = 0;

  updateMeteors(G, dt);
  updateFires(G, dt);

  // 법사 접촉 판정: 주변 3×3 칸만
  if (p.alive && !isDashing(p) && p.invuln <= 0 && !G.bench) {
    const pr = CONFIG.player.radius;
    const pcx = cellX(p.x), pcy = cellY(p.y), cols = grid.cols, start = grid.start, items = grid.items;
    // 닿은 것 중 가장 아픈 것 하나만 피해(무적 시간 동안은 추가 피해 없음)
    let dmg = 0, src = '';
    for (let cy = pcy - 1; cy <= pcy + 1; cy++) {
      for (let cx = pcx - 1; cx <= pcx + 1; cx++) {
        const c = cy * cols + cx;
        for (let k = start[c], e = start[c + 1]; k < e; k++) {
          const i = items[k];
          if (M.dead[i]) continue;
          const t = M.type[i];
          const dx = M.x[i] - p.x, dy = M.y[i] - p.y, r = RADIUS[t] + pr;
          if (dx * dx + dy * dy < r * r && DMG[t] > dmg) { dmg = DMG[t]; src = TYPE_KEYS[t]; }
        }
      }
    }
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      if (!b.active) continue;
      const dx = b.x - p.x, dy = b.y - p.y, r = CONFIG.boss.radius + pr;
      if (dx * dx + dy * dy < r * r && CONFIG.boss.contactDmg > dmg) { dmg = CONFIG.boss.contactDmg; src = 'boss'; }
    }
    if (dmg > 0) hurtPlayer(dmg, src);
  }

  // 마력: 시간 + 주변 몹 수(로그, 상한) + 구슬
  const MA = CONFIG.mana;
  let near = 0;
  {
    const pcx = cellX(p.x), pcy = cellY(p.y), cols = grid.cols, cnt = grid.count;
    for (let k = 0; k < nearOffs.length; k += 2) near += cnt[(pcy + nearOffs[k + 1]) * cols + pcx + nearOffs[k]];
  }
  G.nearCount = near;
  if (G.magnetAll > 0) G.magnetAll -= dt;
  const orbGain = updateOrbs(G, dt);
  updateItems(G, dt, isDashing(p));
  // 체력 자연 회복(마지막 피해 후 잠시 뒤부터)
  if (p.alive) {
    p.sinceHurt += dt;
    if (p.sinceHurt >= CONFIG.player.regenDelay && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + CONFIG.player.regen * dt);
  }
  if (p.alive) {
    const before = G.mana;
    G.mana = Math.min(MA.max, G.mana + (MA.regen + Math.min(MA.nearCap, MA.nearK * Math.log2(1 + near))) * dt + orbGain);
    if (before < MA.max && G.mana >= MA.max) G.events.push({ type: 'manaFull' });
  }

  // 죽은 몹 제거(swap-remove) → 이전 위치 저장 → 이동 → 스폰
  compactMobs(onDeadMob);
  M.px.set(M.x); M.py.set(M.y);
  moveMobs(p.x, p.y, dt, G.spawnR, G.rng, G.ticks & 1, G.time);
  moveBosses(G, dt, bossHooks);
  updateZoom();
  updateSpawner(G, dt, G.spawnR);

  let bosses = 0;
  for (let i = 0; i < B.length; i++) if (B[i].active) bosses++;
  if (M.n + bosses > G.stats.maxMobs) G.stats.maxMobs = M.n + bosses;

  // 레벨업 대기
  if (G.levelQueue.length && p.alive) {
    G.levelUpWait += dt;
    if (G.levelUpWait >= CONFIG.progress.levelUpDelay) { G.levelUpWait = 0; G.mode = 'levelup'; G.events.push({ type: 'levelup' }); }
  }
  if (!p.alive) {
    G.dying += dt;
    if (G.dying >= 1.4 && G.mode === 'play') { G.mode = 'over'; G.events.push({ type: 'gameover' }); }
  }
}

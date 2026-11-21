// 한 판의 상태(G)와 고정 틱 로직. 게임 규칙은 모두 여기서 30틱/초로만 진행된다.
import { CONFIG, TICK_DT } from './config.js';
import { M, B, RADIUS, DMG, EXP, TYPE_KEYS, allocMobs, clearMobs, clearBosses, compactMobs, moveMobs, moveBosses, reorderMobs, addMob, SLIME_TYPE } from './sim/mobs.js';
import { clearItems, updateItems, updateItemSpawner, dropItem, spawnFireball, ITEM_CHEST } from './items.js';
import { SPR } from './assets.js';
import { grid, allocGrid, buildGrid, cellX, cellY } from './sim/grid.js';
import { resetSpawner, updateSpawner } from './sim/spawn.js';
import { createPlayer, resetPlayer } from './player.js';
import { isDashing } from './dash.js';
import { resetMeteors, launchMeteor, updateMeteors, updateFires, pushMobs, castingOnPlayer, explode } from './meteor.js';
import { clearBolts, updateBolts } from './bolts.js';
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
  mode: 'title',           // title | intro | play | levelup | learn | paused | over
  bench: false, benchCount: 0,
  seed: 0, rng: Math.random,
  time: 0, ticks: 0,
  player: createPlayer(),
  mana: 0,
  meteorLearned: false,    // 레벨 5에 메테오 습득
  meteorRadius: 0, meteorPower: 0, fallTime: 0,
  twin: false, fire: false, magnetLevel: 0, rangeLevel: 0, powerLevel: 0,
  // 마법탄
  boltT: 0, boltRate: 0, boltCount: 0, boltPierce: 0,
  // 아이템 효과(남은 시간) / 중첩 수
  starT: 0, slowT: 0, twinT: 0, furyT: 0, magnetAll: 0,
  itemT: 0, orbItems: 0, ringItems: 0, lensItems: 0,
  // 연속 킬 콤보(2초 안에 이어지면 유지)
  chainN: 0, chainLast: -99,
  skin: skinById('fire'),
  hero: 'mage',
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
  addExp: (amount) => addExp(G, amount),
  blast: (x, y, R, power) => explode(G, x, y, R, power, true),
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
  G.mana = 0;
  G.meteorLearned = G.bench;
  const MC = CONFIG.meteor, BC = CONFIG.bolts;
  G.meteorRadius = MC.radius; G.meteorPower = MC.power; G.fallTime = MC.fallTime;
  G.twin = false; G.fire = false; G.magnetLevel = 0; G.rangeLevel = 0; G.powerLevel = 0;
  G.boltT = 0; G.boltRate = BC.rate; G.boltCount = BC.count; G.boltPierce = BC.pierce;
  G.starT = 0; G.slowT = 0; G.twinT = 0; G.furyT = 0; G.magnetAll = 0;
  G.itemT = CONFIG.items.firstAt; G.orbItems = 0; G.ringItems = 0; G.lensItems = 0;
  G.chainN = 0; G.chainLast = -99; G.lastRingT = -99;
  G.skin = skinById(opts.skin || 'fire');
  G.hero = opts.hero || 'mage';
  G.stats = { kills: 0, maxCombo: 0, maxChain: 0, maxMobs: 0, gold: 0, level: 1, exp: 0, expNeed: expNeed(1), bossKills: 0, goldEarned: 0, dmgTaken: {}, deathBy: '', meteors: 0 };
  G.levelQueue.length = 0; G.levelUpWait = 0;
  G.shieldBought = 0; G.goldFrac = 0; G.hitstop = 0; G.dying = 0;
  G.events.length = 0; G.taps.length = 0;
  clearMobs(); clearBosses(); clearOrbs(); clearItems(); clearBolts(); resetMeteors(); clearEffects();
  M.hpMul = CONFIG.mobs.easeHp; M.speedMul = CONFIG.mobs.easeSpeed * CONFIG.mobs.speedMul;
  resetSpawner(G.rng);
  updateZoom();
  G.mode = 'play';
}

/** 레벨 5: 메테오 습득. 마력 링이 가득 찬 채로 시작 */
export function learnMeteor() {
  G.meteorLearned = true;
  G.mana = CONFIG.mana.max;
}

/** 레벨업 카드를 고르고 다시 시작할 때: 법사 주변 몹을 밀어내 바로 죽지 않게 */
export function resumePush() {
  const p = G.player, PR = CONFIG.progress;
  pushMobs(p.x, p.y, PR.resumePushRadius, PR.resumePushImpulse);
  addRing(p.x, p.y, 10, PR.resumePushRadius, 0.3, pal(24), 1, 3);
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

/**
 * 메테오 버튼(또는 Space): 메테오를 배웠고 마력이 가득 찼을 때만. 낙하 지점 = 누른 순간 법사가 서 있는 자리.
 * 판정은 다음 틱에서(공정성). 'tap' 모드(옛 방식)일 때만 wx, wy 를 씀
 */
export function queueMeteor(wx, wy) {
  if (G.mode !== 'play' || !G.player.alive || !G.meteorLearned || G.mana < CONFIG.mana.max) return false;
  if (CONFIG.meteor.target === 'center' || wx === undefined) { wx = G.player.x; wy = G.player.y; }
  G.taps.push(wx, wy);
  return true;
}
export const queueTap = queueMeteor;

// 마력용 주변 칸 오프셋(칸 중심 거리 기준)
const nearOffs = [];
{
  const cs = CONFIG.grid.cellSize, r = CONFIG.mana.nearRadius, k = Math.ceil(r / cs);
  for (let v = -k; v <= k; v++) for (let u = -k; u <= k; u++) if ((u * cs) ** 2 + (v * cs) ** 2 <= r * r) nearOffs.push(u, v);
}

function breakShield(p) {
  const S = CONFIG.shop;
  p.shield = false;
  p.invuln = S.shieldInvuln;
  pushMobs(p.x, p.y, S.shieldPushRadius, S.shieldPushImpulse);
  addRing(p.x, p.y, 10, S.shieldPushRadius, 0.4, pal(12), 1, 4);
  addRing(p.x, p.y, 10, S.shieldPushRadius * 0.7, 0.25, pal(31), 0);
  addShake(4);
  G.events.push({ type: 'shieldBreak' });
}

function killPlayer(src) {
  const p = G.player;
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

/**
 * 법사 피해. src: 원인(몹 타입 키, 'boss', 'fireball', 'meteor') — 통계·연출용.
 * 무적의 별: 모두 막음. 자기 메테오: 쉴드만 막고 아니면 한 방에 죽음(맞은 뒤 무적 시간도 소용없음).
 * 그 밖: 하트 1칸 + 1.5초 무적 + 주변 몹을 넓게 밀쳐냄. 쉴드가 있으면 1회 막음.
 */
function hurtPlayer(dmg, src) {
  const p = G.player;
  if (!p.alive || G.bench || G.god) return;   // G.god: 콘솔·디버그 테스트 전용
  if (G.starT > 0) return;
  G.stats.dmgTaken[src] = (G.stats.dmgTaken[src] || 0) + 1;
  if (src === 'meteor') {
    if (p.shield) { breakShield(p); return; }
    killPlayer(src);
    return;
  }
  if (p.invuln > 0) { G.stats.dmgTaken[src]--; return; }
  if (CONFIG.meteor.castGuard && castingOnPlayer()) { G.stats.dmgTaken[src]--; return; }  // 'center' 모드 전용
  if (p.shield) { breakShield(p); return; }
  const PC = CONFIG.player;
  p.hp -= 1;
  p.sinceHurt = 0; p.regenT = 0;
  if (p.hp > 0) {
    p.invuln = PC.hurtInvuln;
    pushMobs(p.x, p.y, PC.knockRadius, PC.knockImpulse);
    addRing(p.x, p.y, 8, PC.knockRadius, 0.3, pal(22), 1, 3);
    addShake(3);
    G.events.push({ type: 'hurt', src });
    return;
  }
  killPlayer(src);
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
  const exp = expSum * mult + bossKills * CONFIG.boss.exp;
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
  // 연속 킬 콤보(그림·소리용, 게임 시간 기준)
  if (G.time - G.chainLast <= PR.chainTime) G.chainN += kills + bossKills; else G.chainN = kills + bossKills;
  G.chainLast = G.time;
  if (G.chainN > s.maxChain) s.maxChain = G.chainN;
  G.events.push({ type: 'kill', n: G.chainN, k: kills + bossKills });
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

  // 초반 완화(체력·속도) × 시간의 모래시계
  {
    const MB = CONFIG.mobs, f = Math.min(1, G.time / MB.easeTime);
    M.hpMul = MB.easeHp + (1 - MB.easeHp) * f;
    M.speedMul = (MB.easeSpeed + (1 - MB.easeSpeed) * f) * MB.speedMul * (G.slowT > 0 ? CONFIG.items.hourglassSlow : 1);
  }
  if (G.starT > 0) G.starT = Math.max(0, G.starT - dt);
  if (G.slowT > 0) G.slowT = Math.max(0, G.slowT - dt);
  if (G.twinT > 0) G.twinT = Math.max(0, G.twinT - dt);
  if (G.furyT > 0) G.furyT = Math.max(0, G.furyT - dt);

  buildGrid(p.x, p.y);
  if (G.ticks % 10 === 0) reorderMobs(grid.items);   // 캐시 효율용 공간 재정렬

  // 탭 → 메테오
  for (let i = 0; i < G.taps.length; i += 2) {
    if (G.mana >= CONFIG.mana.max && p.alive && G.meteorLearned) {
      G.mana = 0;
      G.stats.meteors++;
      launchMeteor(G, G.taps[i], G.taps[i + 1]);
      G.events.push({ type: 'launch' });
    }
  }
  G.taps.length = 0;

  updateMeteors(G, dt);
  updateFires(G, dt);
  updateBolts(G, dt);

  // 법사 접촉 판정: 주변 3×3 칸만. 무적의 별이면 닿는 몹은 즉사
  if (p.alive && !G.bench) {
    const pr = CONFIG.player.radius;
    const pcx = cellX(p.x), pcy = cellY(p.y), cols = grid.cols, start = grid.start, items = grid.items;
    const star = G.starT > 0, check = star || (!isDashing(p) && p.invuln <= 0);
    if (check) {
      let dmg = 0, src = '', kills = 0, expSum = 0;
      const extra = star ? 10 : 0;
      for (let cy = pcy - 1; cy <= pcy + 1; cy++) {
        for (let cx = pcx - 1; cx <= pcx + 1; cx++) {
          const c = cy * cols + cx;
          for (let k = start[c], e = start[c + 1]; k < e; k++) {
            const i = items[k];
            if (M.dead[i]) continue;
            const t = M.type[i];
            const dx = M.x[i] - p.x, dy = M.y[i] - p.y, r = RADIUS[t] + pr + extra;
            if (dx * dx + dy * dy >= r * r) continue;
            if (star) { M.dead[i] = 2; kills++; expSum += EXP[t]; }
            else if (DMG[t] > dmg) { dmg = DMG[t]; src = TYPE_KEYS[t]; }
          }
        }
      }
      for (let i = 0; i < B.length; i++) {
        const b = B[i];
        if (!b.active) continue;
        const dx = b.x - p.x, dy = b.y - p.y, r = CONFIG.boss.radius + pr + extra;
        if (dx * dx + dy * dy >= r * r) continue;
        if (star) { b.hp -= 40 * dt; b.flash = 2; if (b.hp <= 0) { b.active = false; onBossDeath(b); awardKills(0, 0, false, 1); } }
        else { dmg = 1; src = 'boss'; }
      }
      if (kills) awardKills(kills, expSum, false, 0);
      if (dmg > 0) hurtPlayer(1, src);
    }
  }

  // 마력(메테오를 배운 뒤): 시간 + 주변 몹 수(로그, 상한) + 구슬. 마력 폭주면 3배
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
  updateItemSpawner(G, dt);
  // 하트 자동 회복: 마지막으로 맞고 6초 뒤부터 5초마다 1칸
  if (p.alive) {
    p.sinceHurt += dt;
    if (p.sinceHurt >= CONFIG.player.regenDelay && p.hp < p.maxHp) {
      p.regenT -= dt;
      if (p.regenT <= 0) { p.hp++; p.regenT = CONFIG.player.regenEvery; p.healPop = 0.4; G.events.push({ type: 'heal' }); }
    } else if (p.hp >= p.maxHp) p.regenT = 0;
  }
  if (p.alive && G.meteorLearned) {
    const before = G.mana;
    const rate = (MA.regen + Math.min(MA.nearCap, MA.nearK * Math.log2(1 + near))) * (G.furyT > 0 ? CONFIG.items.furyMult : 1);
    G.mana = Math.min(MA.max, G.mana + rate * dt + orbGain);
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

  // 레벨업 대기(0.15초 뒤 카드 / 레벨 5는 메테오 습득)
  if (G.levelQueue.length && p.alive) {
    G.levelUpWait += dt;
    if (G.levelUpWait >= CONFIG.progress.levelUpDelay) { G.levelUpWait = 0; G.mode = 'levelup'; G.events.push({ type: 'levelup' }); }
  }
  if (!p.alive) {
    G.dying += dt;
    if (G.dying >= 1.4 && G.mode === 'play') { G.mode = 'over'; G.events.push({ type: 'gameover' }); }
  }
}

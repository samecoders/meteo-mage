// 메테오: 낙하 → 폭발. 피해는 원에 걸치는 격자 칸만 돈다.
// 모양(skin)은 그림·색·소리만 바꾸며 반경·위력·낙하 시간·판정은 모두 같다.
import { CONFIG } from './config.js';
import { M, B, EXP } from './sim/mobs.js';
import { grid, cellX, cellY } from './sim/grid.js';
import { spawnOrb } from './orbs.js';
import { addParticle, addCrater, addRing, addShake, particleRoom, addSpriteFx, spriteW, WHITE, addStrike } from './render/effects.js';
import { pal } from './skins.js';
import { SPR } from './assets.js';
import { playerSpeed } from './player.js';

const MC = CONFIG.meteor, RL = CONFIG.relics, SK = CONFIG.skins.perks;

export const meteors = [];
// kind: 0 메테오, 1 메아리(유물), 2 유성우 작은 운석(유물, 법사 피해 없음)
for (let i = 0; i < MC.maxActive; i++) meteors.push({ active: false, x: 0, y: 0, t: 0, fall: 1, own: false, follow: false, kind: 0, killType: -1 });

export const fires = [];
// kind: 0 화염(화염 지대 카드·혜성 꼬리), 1 잔불(불꽃 운석), 2 독(독 운석). dps = 위력 × 이 값(초당)
for (let i = 0; i < 24; i++) fires.push({ active: false, x: 0, y: 0, r: 0, t: 0, acc: 0, dps: 0, kind: 0 });

export function resetMeteors() {
  for (let i = 0; i < meteors.length; i++) meteors[i].active = false;
  for (let i = 0; i < fires.length; i++) fires[i].active = false;
}

function addMeteor(x, y, t0, fall, own, follow, kind) {
  for (let i = 0; i < meteors.length; i++) {
    const m = meteors[i];
    if (m.active) continue;
    m.active = true; m.x = x; m.y = y; m.t = t0; m.fall = fall; m.own = own; m.follow = !!follow; m.kind = kind || 0; m.killType = -1;
    return m;
  }
  return null;
}

/**
 * 낙하 시간 = max(기본 낙하 시간, 폭발 반경 ÷ (법사 현재 이동 속도 × escapeFactor))
 * → 범위를 아무리 키워도 대시 없이 곧장 달리면 빠져나갈 수 있음
 */
export function fallTimeFor(G) {
  return Math.max(G.fallTime, G.meteorRadius / (playerSpeed(G) * MC.escapeFactor));
}

/**
 * 'center': 누른 순간 법사가 서 있는 자리(x, y)에 고정해서 떨어짐(법사를 따라가지 않음).
 * 쌍둥이: 둘째 발은 twinDelay 초 뒤 그때 법사가 있는 자리에.
 */
export function launchMeteor(G, x, y) {
  const own = MC.target === 'center';
  const fall = own ? fallTimeFor(G) : G.fallTime;
  const m = addMeteor(x, y, 0, fall, own, false);
  if (m) m.killType = killTarget(typesNear(x, y, G.meteorRadius), G.meteorPower);   // 점선 원 대상(누른 순간 반경 안 몹 기준)
  if (G.twin || G.twinT > 0) addMeteor(x, y, -MC.twinDelay, fall, own, own);
}

/**
 * 탈출 방향: 메테오 중심에서 바깥쪽을 우선하되, 16방향 중 반경 밖까지 가는 길에 몹이 가장 적은 쪽.
 * 격자 칸 수만 읽음(그림·봇 공용). out 에 단위 벡터
 */
export function escapeDir(G, m, out) {
  const p = G.player, g = grid, cols = g.cols, cnt = g.count, R = G.meteorRadius;
  let best = 1e18;
  const ox = p.x - m.x, oy = p.y - m.y, od = Math.hypot(ox, oy) || 1;
  for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
    let s = 0;
    for (let q = 1; q <= 4; q++) {
      const d = R * 0.35 * q;
      s += cnt[cellY(p.y + dy * d) * cols + cellX(p.x + dx * d)] * (5 - q);
    }
    // 중심에서 바깥으로 갈수록(빨리 빠져나감) 유리
    s += (1 - (dx * ox + dy * oy) / od) * 3;
    if (s < best) { best = s; out[0] = dx; out[1] = dy; }
  }
  return true;
}

/**
 * 이 위력으로 hp 짜리 몹이 죽는 범위(반경 대비 0~1). 피해 = 위력 × (1 - 가장자리비율 × 거리/반경)
 */
export function killFraction(hp, power) {
  return Math.max(0, Math.min(1, (1 - hp / power) / MC.edgeDamage));
}
/** 반경 안에 있는 몹 종류(비트 마스크, 격자 칸 단위 — 메테오를 부를 때·카드 창에서만) */
export function typesNear(x, y, radius) {
  const g = grid, cols = g.cols, start = g.start, items = g.items, TY = M.type, r2 = (radius + g.cs) ** 2;
  let mask = 0;
  const c0 = cellX(x - radius), c1 = cellX(x + radius), r0 = cellY(y - radius), r1 = cellY(y + radius);
  for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
    const mx = g.ox + (cx + 0.5) * g.cs - x, my = g.oy + (cy + 0.5) * g.cs - y;
    if (mx * mx + my * my > r2) continue;
    const c = cy * cols + cx;
    for (let k = start[c], e = start[c + 1]; k < e; k++) mask |= 1 << TY[items[k]];
  }
  return mask;
}
const TYPES_BY_HP = CONFIG.mobs.types.map((t, i) => i).sort((a, b) => CONFIG.mobs.types[b].hp - CONFIG.mobs.types[a].hp);
/**
 * 점선 원 대상: 반경 안에 있는 몹 중 처치 반경이 0%보다 크고 100%보다 작은 가장 단단한 종류(없으면 -1).
 * power2 를 주면(카드 예상) 'power→power2 에서 처치 범위가 넓어지는' 가장 단단한 종류
 */
export function killTarget(mask, power, power2) {
  for (const t of TYPES_BY_HP) {
    if (!(mask & (1 << t))) continue;
    const hp = CONFIG.mobs.types[t].hp * M.hpMul, a = killFraction(hp, power);
    if (power2 !== undefined) { if (killFraction(hp, power2) > a + 0.005) return t; }
    else if (a > 0 && a < 1) return t;
  }
  return -1;
}

/** 지금 시각(새로 생기는 몹 기준) 그 종류의 체력 */
export function mobHpNow(key) {
  const t = CONFIG.mobs.types.find((x) => x.key === key);
  return t ? t.hp * M.hpMul : 0;
}

/** 법사가 지금 내 메테오 반경 안에 있으면 그 메테오(가장 먼저 터지는 것), 없으면 null */
export function threatOnPlayer(G) {
  let best = null;
  const p = G.player;
  for (let i = 0; i < meteors.length; i++) {
    const m = meteors[i];
    if (!m.active || m.t < 0 || m.kind === 2) continue;
    const dx = p.x - m.x, dy = p.y - m.y, R = G.meteorRadius;
    if (dx * dx + dy * dy < R * R && (!best || m.fall - m.t < best.fall - best.t)) best = m;
  }
  return best;
}

/** 중앙 메테오가 낙하 중인지(시전 보호막) */
export function castingOnPlayer() {
  for (let i = 0; i < meteors.length; i++) { const m = meteors[i]; if (m.active && m.own && m.t >= 0) return true; }
  return false;
}

export function updateMeteors(G, dt) {
  for (let i = 0; i < meteors.length; i++) {
    const m = meteors[i];
    if (!m.active) continue;
    const before = m.t;
    m.t += dt;
    if (m.follow && before < 0 && m.t >= 0) {       // 쌍둥이 둘째 발: 이 순간 법사 자리로 고정
      m.x = G.player.x; m.y = G.player.y; m.follow = false; m.fall = fallTimeFor(G);
      G.events.push({ type: 'launch2' });
    }
    // 암흑 별(모양): 낙하 마지막 0.3초 동안 반경 1.1배 안 몹을 아주 약하게 끌어당김
    if (G.skin.id === 'dark' && m.kind === 0 && m.t >= 0 && m.fall - m.t <= SK.dark.last) pullMobs(m.x, m.y, G.meteorRadius * SK.dark.range, SK.dark.pull * dt);
    // 중력의 핵: 낙하 중 폭발 중심으로 몹을 끌어당김(메아리 폭발은 공명일 때만)
    if (G.R.gravity && m.t >= 0 && (m.kind === 0 || (m.kind === 1 && G.res.gravityEcho))) pullMobs(m.x, m.y, G.meteorRadius * RL.gravityRange, RL.gravityPull * dt);
    if (m.t >= m.fall) {
      m.active = false;
      if (m.kind === 2) { explode(G, m.x, m.y, RL.rainRadius, G.meteorPower * RL.rainPower, true, true); continue; }   // 유성우: 법사 피해 없음
      explode(G, m.x, m.y, 0, m.kind === 1 ? G.meteorPower * RL.echoPower : 0);
      if (m.kind === 0) {
        // 메아리 룬: 2초 뒤 같은 자리에 50% 위력(법사도 맞음, 붉은 원 다시 표시)
        if (G.R.echo) addMeteor(m.x, m.y, -(RL.echoDelay - RL.echoFall), RL.echoFall, m.own, false, 1);
        // 유성우: 주변에 작은 운석 6개
        if (G.R.rain) for (let k = 0; k < RL.rainCount; k++) {
          const a = G.rng() * Math.PI * 2, r = G.meteorRadius * (0.5 + G.rng() * (RL.rainSpread - 0.5));
          addMeteor(m.x + Math.cos(a) * r, m.y + Math.sin(a) * r, -k * 0.12, RL.rainFall, false, false, 2);
        }
      }
    }
  }
}

/** 메테오 모양 부가 능력: 폭발에서 살아남은 몹에만(격자 칸 단위). 골드는 game.awardKills */
function skinPerk(G, x, y, R, power) {
  switch (G.skin.id) {
    case 'fire': addFire(x, y, R * SK.fire.radius / 0.85, SK.fire.time, SK.fire.dps, 1); break;
    case 'poison': addFire(x, y, R, SK.poison.time, SK.poison.total / SK.poison.time, 2); break;
    case 'ice': slowMobs(x, y, R, Math.round(SK.ice.time * CONFIG.sim.tickRate), true); break;
    case 'lightning': {
      // 중심에 가까운 살아남은 몹 5마리(칸 고리를 안쪽부터)에 번개
      const g = grid, cols = g.cols, start = g.start, items = g.items, HP = M.hp, DEAD = M.dead, TY = M.type;
      const pcx = cellX(x), pcy = cellY(y), maxK = Math.ceil(R / g.cs);
      let n = 0, kills = 0, expSum = 0;
      for (let k = 0; k <= maxK && n < SK.lightning.count; k++) {
        for (let v = -k; v <= k && n < SK.lightning.count; v++) {
          const edge = v === -k || v === k;
          for (let u = -k; u <= k && n < SK.lightning.count; u += edge ? 1 : 2 * k || 1) {
            const c = (pcy + v) * cols + pcx + u;
            for (let q = start[c], e = start[c + 1]; q < e && n < SK.lightning.count; q++) {
              const i = items[q];
              if (DEAD[i]) continue;
              n++;
              HP[i] -= power * SK.lightning.power;
              addStrike(M.x[i], M.y[i], n * 0.03);
              if (HP[i] <= 0) { DEAD[i] = 2; kills++; expSum += EXP[TY[i]]; }
            }
          }
        }
      }
      if (kills) G.awardKills(kills, expSum, false, 0);
      break;
    }
  }
}

/** 반경 안 살아 있는 몹에 둔화(틱 수) 표시 */
export function slowMobs(x, y, radius, ticks, quiet) {
  const g = grid, cols = g.cols, start = g.start, items = g.items, r2 = radius * radius, SL = M.slow;
  const c0 = cellX(x - radius), c1 = cellX(x + radius), r0 = cellY(y - radius), r1 = cellY(y + radius);
  for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
    const c = cy * cols + cx;
    for (let k = start[c], e = start[c + 1]; k < e; k++) { const i = items[k]; const dx = M.x[i] - x, dy = M.y[i] - y; if (dx * dx + dy * dy < r2) SL[i] = ticks; }
  }
  if (!quiet) addRing(x, y, radius * 0.6, radius, 0.7, pal(18), 2, 4);
  else addRing(x, y, radius * 0.3, radius, 0.5, pal(12), 1, 2);   // 서리(그림만)
}

/** 중력: 반경 안 몹을 중심으로 조금씩 끌어당김(격자 칸만) */
export function pullMobs(x, y, radius, step) {
  const g = grid, cols = g.cols, start = g.start, items = g.items, r2 = radius * radius;
  const X = M.x, Y = M.y;
  const c0 = cellX(x - radius), c1 = cellX(x + radius), r0 = cellY(y - radius), r1 = cellY(y + radius);
  for (let cy = r0; cy <= r1; cy++) {
    for (let cx = c0; cx <= c1; cx++) {
      const c = cy * cols + cx;
      for (let k = start[c], e = start[c + 1]; k < e; k++) {
        const i = items[k];
        const dx = x - X[i], dy = y - Y[i], d2 = dx * dx + dy * dy;
        if (d2 > r2 || d2 < 100) continue;
        const d = Math.sqrt(d2), s = Math.min(step, d - 8) / d;
        X[i] += dx * s; Y[i] += dy * s;
      }
    }
  }
}

// 폭발 1회의 구슬 묶음용 블록 누적(미리 할당)
const BS = CONFIG.orbs.blockCells;
const BCOLS = Math.ceil(CONFIG.grid.cols / BS), BROWS = Math.ceil(CONFIG.grid.rows / BS);
const blockKills = new Int32Array(BCOLS * BROWS);
const blockSX = new Float32Array(BCOLS * BROWS);
const blockSY = new Float32Array(BCOLS * BROWS);
const touched = new Int32Array(BCOLS * BROWS);
let touchedN = 0;

function noteKill(x, y) {
  const b = ((cellY(y) / BS) | 0) * BCOLS + ((cellX(x) / BS) | 0);
  if (blockKills[b] === 0) touched[touchedN++] = b;
  blockKills[b]++; blockSX[b] += x; blockSY[b] += y;
}

/**
 * 폭발 판정 + 보상 + 연출. 메테오는 R·power 를 생략(현재 값). 마나 폭탄은 noSelf=true(법사 피해 없음).
 */
export function explode(G, x, y, Rr, powerR, noSelf, small) {
  const R = Rr || G.meteorRadius, R2 = R * R, power = powerR || G.meteorPower, edge = MC.edgeDamage;
  const SR = R * MC.shockRange, SR2 = SR * SR, imp = MC.shockImpulse;
  const g = grid, cs = g.cs, cols = g.cols, start = g.start, items = g.items;
  const X = M.x, Y = M.y, HP = M.hp, DEAD = M.dead, VX = M.vx, VY = M.vy, FL = M.flash, TY = M.type;
  let kills = 0, expSum = 0, overkill = 0;
  const WD = M.wound;
  touchedN = 0;
  G.corpseX = x; G.corpseY = y;

  const c0 = cellX(x - SR - cs), c1 = cellX(x + SR + cs), r0 = cellY(y - SR - cs), r1 = cellY(y + SR + cs);
  for (let cy = r0; cy <= r1; cy++) {
    const wy0 = g.oy + cy * cs, wy1 = wy0 + cs;
    const ny = y < wy0 ? wy0 : y > wy1 ? wy1 : y;
    for (let cx = c0; cx <= c1; cx++) {
      const wx0 = g.ox + cx * cs, wx1 = wx0 + cs;
      const nx = x < wx0 ? wx0 : x > wx1 ? wx1 : x;
      const ddx = nx - x, ddy = ny - y;
      if (ddx * ddx + ddy * ddy > SR2 + cs * cs) continue;   // 원에 걸치지 않는 칸 건너뜀
      const c = cy * cols + cx;
      for (let k = start[c], e = start[c + 1]; k < e; k++) {
        const i = items[k];
        if (DEAD[i]) continue;
        const dx = X[i] - x, dy = Y[i] - y, d2 = dx * dx + dy * dy;
        if (d2 >= SR2) continue;
        const d = Math.sqrt(d2) + 0.001;
        if (d2 < R2) {
          HP[i] -= power * (1 - edge * (d / R));
          FL[i] = CONFIG.mobs.flashTicks;
          if (HP[i] <= 0) {
            DEAD[i] = 1; kills++; expSum += EXP[TY[i]];
            overkill -= HP[i];                   // 남은 피해(오버킬)
            noteKill(X[i], Y[i]);
            continue;
          }
          WD[i] = 1;                             // 살아남음: 붉게 어두워짐
          const k2 = imp * 0.6;
          VX[i] += dx / d * k2; VY[i] += dy / d * k2;
        } else { // 반경 바깥 충격파: 살짝 밀어냄
          const k2 = imp * (1 - (d - R) / (SR - R));
          VX[i] += dx / d * k2; VY[i] += dy / d * k2;
        }
      }
    }
  }

  // 보스
  let bossKills = 0;
  for (let i = 0; i < B.length; i++) {
    const b = B[i];
    if (!b.active) continue;
    const dx = b.x - x, dy = b.y - y, d = Math.sqrt(dx * dx + dy * dy);
    if (d < R + CONFIG.boss.radius * 0.5) {
      b.hp -= power * (1 - edge * Math.min(1, d / R));
      b.flash = 4;
      addSpriteFx(b.x, b.y - 20, SPR.fx_hit, 2, 0.25, 0, -30);
      if (b.hp <= 0) { b.active = false; bossKills++; G.onBossDeath(b); }
    }
  }

  // 법사: 폭발 순간 반경 안이면 대시 중이어도 한 방에 죽음(쉴드·무적의 별만 막음). 반경 바로 바깥이면 아슬아슬 보너스
  const p = G.player;
  if (p.alive && !noSelf) {
    const dx = p.x - x, dy = p.y - y, d = Math.sqrt(dx * dx + dy * dy);
    if (d < R) {
      G.hurtPlayer(0, 'meteor');
    } else if (d < R + CONFIG.mana.nearMissBand) {
      G.mana = Math.min(CONFIG.mana.max, G.mana + CONFIG.mana.nearMissBonus);
      G.events.push({ type: 'nearMiss' });
    }
  }

  // 마력 구슬: 블록 단위로 묶어서
  const mpk = kills > 0 ? Math.min(CONFIG.orbs.manaPerKill, CONFIG.orbs.maxPerBlast / kills) : 0;
  for (let k = 0; k < touchedN; k++) {
    const b = touched[k], n = blockKills[b];
    spawnOrb(blockSX[b] / n, blockSY[b] / n, n * mpk);
    blockKills[b] = 0; blockSX[b] = 0; blockSY[b] = 0;
  }

  G.awardKills(kills, expSum, true, bossKills);
  // 오버킬 피해의 일부를 마력으로 환급(폭발 한 번 최대 30%) — 위력 강화가 헛되지 않게
  if (!noSelf && overkill > 0 && G.meteorLearned) {
    const gain = Math.min(MC.overkillMax, overkill * MC.overkillRefund);
    G.mana = Math.min(CONFIG.mana.max, G.mana + gain);
    G.stats.refund = (G.stats.refund || 0) + gain;
  }
  if (!noSelf) skinPerk(G, x, y, R, power);
  // 캐릭터 고유 능력(내 메테오 폭발만)
  const C = G.char;
  if (!noSelf && C) {
    if (C.harvestKills && kills >= C.harvestKills && G.time - G.harvestT >= C.harvestCd && G.player.alive) {   // 강령술사: 영혼 수확
      G.harvestT = G.time;
      if (G.player.hp < G.player.maxHp) { G.player.hp++; G.player.healPop = 0.4; }
      G.events.push({ type: 'charAbility', key: 'harvest' });
    }
    if (C.burnKills && kills >= C.burnKills && G.meteorLearned) {   // 화염술사: 연소
      G.mana = Math.min(CONFIG.mana.max, G.mana + C.burnMana);
      G.events.push({ type: 'charAbility', key: 'burn' });
    }
  }
  explosionFx(G, x, y, R, kills, small);
  if (G.fire && !noSelf) addFire(x, y, R);
  G.events.push({ type: 'explosion', x, y, kills, small: !!small });
}

function explosionFx(G, x, y, R, kills, small) {
  const sk = G.skin;
  addRing(x, y, R * 0.3, R * 1.05, 0.08, WHITE, 0);
  // 폭발 그림을 반경에 맞는 정수 배율로(픽셀이 깨지지 않게)
  const exW = spriteW(SPR.fx_explosion) || 24;
  addSpriteFx(x, y, SPR.fx_explosion, Math.max(1, Math.round(R / exW)), 0.3, 0, 0);
  addRing(x, y, R * 0.6, R * 1.0, 0.16, pal(sk.burst[1]), 0);
  addRing(x, y, R * 0.9, R * MC.shockRange, 0.45, pal(sk.ring), 1, 4);
  addRing(x, y, R * 0.5, R * 1.3, 0.3, WHITE, 1, 2);
  addCrater(x, y, R, pal(sk.crater[0]), pal(sk.crater[1]));
  const n = Math.min(particleRoom(), 140 + (R | 0));
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * R * 3.2;
    const r = Math.random() * R * 0.4;
    addParticle(x + Math.cos(a) * r, y + Math.sin(a) * r, Math.cos(a) * s, Math.sin(a) * s,
      0.35 + Math.random() * 0.6, pal(sk.burst[(Math.random() * sk.burst.length) | 0]), 2 + ((Math.random() * 3) | 0), 0);
  }
  // 동전이 튀어 오름(그림만)
  const coins = Math.min(14, Math.floor(Math.log2(1 + kills)));
  for (let i = 0; i < coins; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    addSpriteFx(x + (Math.random() - 0.5) * R * 0.6, y + (Math.random() - 0.5) * R * 0.6, SPR.item_coin, 1, 0.7 + Math.random() * 0.3,
      Math.cos(a) * 120, Math.sin(a) * 260, true);
  }
  addShake(2 + Math.min(5, Math.log10(1 + kills) * 1.6));
  const hk = Math.min(1, kills / MC.hitstopKills);
  if (kills > 0 && !small) G.hitstop = Math.max(G.hitstop, MC.hitstopMin + (MC.hitstopMax - MC.hitstopMin) * hk);
}

// ------------------------------------------------------------ 화염 지대 (격자 칸 단위)
export function addFire(x, y, R, dur, dps, kind) {
  let slot = fires[0];
  for (let i = 0; i < fires.length; i++) { if (!fires[i].active) { slot = fires[i]; break; } if (fires[i].t < slot.t) slot = fires[i]; }
  slot.active = true; slot.x = x; slot.y = y; slot.r = R * 0.85; slot.t = dur || MC.fireDuration; slot.acc = 0;
  slot.dps = dps ?? MC.fireDps; slot.kind = kind || 0;
}

export function updateFires(G, dt) {
  const g = grid, cs = g.cs, cols = g.cols, start = g.start, items = g.items;
  const X = M.x, Y = M.y, HP = M.hp, DEAD = M.dead, TY = M.type, FL = M.flash;
  for (let f = 0; f < fires.length; f++) {
    const z = fires[f];
    if (!z.active) continue;
    z.t -= dt;
    if (z.t <= 0) { z.active = false; continue; }
    const dmg = G.meteorPower * z.dps * dt, r2 = z.r * z.r;
    let kills = 0, expSum = 0;
    const c0 = cellX(z.x - z.r), c1 = cellX(z.x + z.r), r0 = cellY(z.y - z.r), r1 = cellY(z.y + z.r);
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        // 칸 중심이 원 안인 칸만 탄다
        const mx = g.ox + (cx + 0.5) * cs - z.x, my = g.oy + (cy + 0.5) * cs - z.y;
        if (mx * mx + my * my > r2) continue;
        const c = cy * cols + cx;
        for (let k = start[c], e = start[c + 1]; k < e; k++) {
          const i = items[k];
          if (DEAD[i]) continue;
          HP[i] -= dmg;
          if (HP[i] <= 0) { DEAD[i] = 2; kills++; expSum += EXP[TY[i]]; }
          else if ((G.ticks & 7) === 0) FL[i] = 1;
        }
      }
    }
    if (kills) G.awardKills(kills, expSum, false, 0);
  }
}

/** 쉴드가 깨질 때 주변 몹을 넓게 밀쳐냄 */
export function pushMobs(x, y, radius, impulse) {
  const g = grid, cols = g.cols, start = g.start, items = g.items, r2 = radius * radius;
  const X = M.x, Y = M.y, VX = M.vx, VY = M.vy;
  const c0 = cellX(x - radius), c1 = cellX(x + radius), r0 = cellY(y - radius), r1 = cellY(y + radius);
  for (let cy = r0; cy <= r1; cy++) {
    for (let cx = c0; cx <= c1; cx++) {
      const c = cy * cols + cx;
      for (let k = start[c], e = start[c + 1]; k < e; k++) {
        const i = items[k];
        const dx = X[i] - x, dy = Y[i] - y, d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const d = Math.sqrt(d2) + 0.01, f = impulse * (1 - d / radius * 0.5);
        VX[i] += dx / d * f; VY[i] += dy / d * f;
        X[i] += dx / d * Math.max(0, 40 - d * 0.2);
        Y[i] += dy / d * Math.max(0, 40 - d * 0.2);
      }
    }
  }
}

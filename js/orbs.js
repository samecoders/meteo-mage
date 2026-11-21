// 마력 구슬: 폭발 하나에 격자 블록 단위로 묶어 큰 구슬 몇 개만. 필드 최대 300개.
import { CONFIG } from './config.js';

const C = CONFIG.orbs;
export const O = {
  n: 0,
  x: new Float32Array(C.max), y: new Float32Array(C.max),
  v: new Float32Array(C.max), life: new Float32Array(C.max),
};

export function clearOrbs() { O.n = 0; }

export function spawnOrb(x, y, value) {
  while (value > 0) {
    const v = Math.min(value, C.maxValue);
    value -= v;
    if (O.n < C.max) {
      const i = O.n++;
      O.x[i] = x; O.y[i] = y; O.v[i] = v; O.life[i] = C.life;
    } else { // 가득 차면 가장 가까운 구슬에 합침
      let best = 0, bd = 1e18;
      for (let i = 0; i < O.n; i++) {
        const dx = O.x[i] - x, dy = O.y[i] - y, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      }
      O.v[best] += v;
    }
  }
}

function removeOrb(i) {
  const j = --O.n;
  O.x[i] = O.x[j]; O.y[i] = O.y[j]; O.v[i] = O.v[j]; O.life[i] = O.life[j];
}

/** 틱마다: 자석·줍기. 주운 마력 합계를 반환 */
export function updateOrbs(G, dt) {
  const p = G.player;
  const all = G.magnetAll > 0;    // 자석 아이템: 필드의 모든 구슬을 빠르게 끌어옴
  const cm = G.char && G.char.pickup ? G.char.pickup : 1;   // 견습 마법사: 흡수 범위 +50%
  const mag = all ? 1e6 : C.magnetRadius * Math.pow(C.magnetCardMult, G.magnetLevel) * cm;
  const mag2 = mag * mag, pick2 = (C.pickupRadius * cm) ** 2;
  const speed = all ? C.magnetSpeed * 3 : C.magnetSpeed;
  let gained = 0;
  for (let i = 0; i < O.n; i++) {
    O.life[i] -= dt;
    if (O.life[i] <= 0) { removeOrb(i); i--; continue; }
    if (!p.alive) continue;
    const dx = p.x - O.x[i], dy = p.y - O.y[i], d2 = dx * dx + dy * dy;
    if (d2 < pick2) { gained += O.v[i]; removeOrb(i); i--; continue; }
    if (d2 < mag2) {
      const d = Math.sqrt(d2), s = Math.min(d, speed * dt);
      O.x[i] += dx / d * s; O.y[i] += dy / d * s;
    }
  }
  return gained;
}

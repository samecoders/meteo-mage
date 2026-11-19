// 법사: 이동은 프레임마다(조작감), 몹 접촉 판정은 틱에서 격자로.
import { CONFIG } from './config.js';
import { updateDash } from './dash.js';

export function resetPlayer(p) {
  p.x = 0; p.y = 0; p.vx = 0; p.vy = 0;
  p.faceX = 1; p.faceY = 0; p.flip = 0;
  p.alive = true; p.invuln = 0; p.shield = false;
  p.maxHp = CONFIG.player.hp; p.hp = p.maxHp; p.sinceHurt = 99;
  p.dashLevel = 0; p.dashMax = 1; p.dashCharges = 1; p.dashCd = 0;
  p.dashT = 0; p.dashDx = 0; p.dashDy = 0; p.dashSpeed = 0; p.ghostT = 0;
  p.deathT = 0;
}

export function createPlayer() { const p = {}; resetPlayer(p); return p; }

/** 프레임마다: 목표 속도로 가속·감속 보간 */
export function updatePlayer(G, input, dt) {
  const p = G.player;
  if (!p.alive) return;
  if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
  if (updateDash(G, dt)) return;
  const C = CONFIG.player;
  const mx = input.mx, my = input.my;
  const a = 1 - Math.exp(-C.accel * dt);
  p.vx += (mx * C.speed - p.vx) * a;
  p.vy += (my * C.speed - p.vy) * a;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  const m2 = mx * mx + my * my;
  if (m2 > 0.02) {
    const m = Math.sqrt(m2);
    p.faceX = mx / m; p.faceY = my / m;
    if (Math.abs(mx) > 0.05) p.flip = mx < 0 ? 1 : 0;
  }
}

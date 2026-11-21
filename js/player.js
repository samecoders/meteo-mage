// 법사: 이동은 프레임마다(조작감), 몹 접촉 판정은 틱에서 격자로.
import { CONFIG } from './config.js';
import { updateDash } from './dash.js';

export function resetPlayer(p) {
  p.x = 0; p.y = 0; p.vx = 0; p.vy = 0;
  p.faceX = 1; p.faceY = 0; p.flip = 0;
  p.alive = true; p.invuln = 0; p.shield = false;
  p.maxHp = CONFIG.player.hearts; p.hp = p.maxHp; p.sinceHurt = 99; p.regenT = 0; p.healPop = 0;
  p.dashLevel = 0; p.dashMax = 1; p.dashCharges = 1; p.dashCd = 0;
  p.dashT = 0; p.dashDx = 0; p.dashDy = 0; p.dashSpeed = 0; p.ghostT = 0;
  p.deathT = 0;
  p.boots = 0; p.feathers = 0;
  p.trailT = 0;
}

export function createPlayer() { const p = {}; resetPlayer(p); return p; }

/** 지금 최고 이동 속도(신속의 장화·무적의 별 포함) */
export function playerSpeed(G) {
  const p = G.player, IC = CONFIG.items;
  return CONFIG.player.speed * (G.char ? G.char.speed : 1) * (1 + IC.bootsPct * p.boots) * (G.starT > 0 ? 1 + IC.starSpeed : 1);
}

/** 프레임마다: 0.08초 안에 최고 속도, 손을 떼면 바로 멈춤(밀리지 않음) */
export function updatePlayer(G, input, dt) {
  const p = G.player;
  if (!p.alive) return;
  if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
  if (updateDash(G, dt)) return;
  const C = CONFIG.player, sp = playerSpeed(G);
  const mx = input.mx, my = input.my;
  const tx = mx * sp, ty = my * sp;
  const moving = mx * mx + my * my > 0.0004;
  // 속도 차이를 한 프레임 최대 변화량(가속 또는 정지 기준)만큼 좁힘
  const maxDv = sp / (moving ? C.accelTime : C.stopTime) * dt;
  let dx = tx - p.vx, dy = ty - p.vy;
  const dl = Math.sqrt(dx * dx + dy * dy);
  if (dl > maxDv) { dx *= maxDv / dl; dy *= maxDv / dl; }
  p.vx += dx; p.vy += dy;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  const m2 = mx * mx + my * my;
  if (m2 > 0.02) {
    const m = Math.sqrt(m2);
    p.faceX = mx / m; p.faceY = my / m;
    if (Math.abs(mx) > 0.05) p.flip = mx < 0 ? 1 : 0;
  }
}

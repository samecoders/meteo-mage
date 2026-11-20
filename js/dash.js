// 대시: 이동 중이면 그 방향, 멈춰 있으면 마지막으로 바라본 방향으로 순간 돌진(튕기기 대시는 손가락 방향).
// 대시 중에는 몹 접촉 무적. 메테오 폭발은 피할 수 없음(판정은 meteor.js).
import { CONFIG } from './config.js';
import { addAfterimage } from './render/effects.js';

const D = CONFIG.dash;

/** 대시 거리. 범위 카드로 메테오 반경이 커지면 같은 비율로 늘어남 */
export function dashDistance(p, G) {
  const grow = G && D.scaleWithMeteor ? Math.max(1, G.meteorRadius / CONFIG.meteor.radius) : 1;
  return D.distance * (1 + D.upgradePct * p.dashLevel) * grow;
}
/** 대시 쿨타임(바람의 깃털 1개당 -12%) */
export function dashCooldown(p) { return D.cooldown * Math.pow(1 - CONFIG.items.featherPct, p.feathers || 0); }
export function isDashing(p) { return p.dashT > 0; }

function dir(G, input, out) {
  const p = G.player;
  const m2 = input.mx * input.mx + input.my * input.my;
  if (m2 > 0.02) { const m = Math.sqrt(m2); out[0] = input.mx / m; out[1] = input.my / m; }
  else { out[0] = p.faceX; out[1] = p.faceY; }
  return out;
}

const tmp = [0, 0];

/** 대시 끝 지점(미리보기용) */
export function dashPreview(G, input, out) {
  const p = G.player;
  dir(G, input, tmp);
  const d = dashDistance(p, G);
  out[0] = p.x + tmp[0] * d; out[1] = p.y + tmp[1] * d;
  return out;
}

/** dx, dy 를 주면 그 방향(튕기기 대시), 아니면 이동 방향 */
export function tryDash(G, input, dx, dy) {
  const p = G.player;
  if (!p.alive || p.dashT > 0 || p.dashCharges < 1) return false;
  if (dx !== undefined && (dx || dy)) { const l = Math.hypot(dx, dy); tmp[0] = dx / l; tmp[1] = dy / l; }
  else dir(G, input, tmp);
  p.dashCharges--;
  p.dashDx = tmp[0]; p.dashDy = tmp[1];
  p.dashT = D.duration;
  p.dashSpeed = dashDistance(p, G) / D.duration;
  p.ghostT = 0;
  if (Math.abs(tmp[0]) > 0.05) p.flip = tmp[0] < 0 ? 1 : 0;
  p.faceX = tmp[0]; p.faceY = tmp[1];
  return true;
}

/** 프레임마다: 쿨타임 충전 + 대시 이동. 대시 중이면 true */
export function updateDash(G, dt) {
  const p = G.player;
  if (p.dashCharges < p.dashMax) {
    p.dashCd += dt;
    if (p.dashCd >= dashCooldown(p)) {
      p.dashCd = 0; p.dashCharges++;
      G.events.push({ type: 'dashReady' });
    }
  } else p.dashCd = 0;
  if (p.dashT <= 0) return false;
  const step = Math.min(dt, p.dashT);
  p.x += p.dashDx * p.dashSpeed * step;
  p.y += p.dashDy * p.dashSpeed * step;
  p.dashT -= dt;
  p.ghostT -= dt;
  if (p.ghostT <= 0) {
    p.ghostT = D.duration / D.afterimages;
    addAfterimage(p.x, p.y, p.flip);
  }
  if (p.dashT <= 0) {
    p.dashT = 0;
    const s = CONFIG.player.speed * 0.8;
    p.vx = p.dashDx * s; p.vy = p.dashDy * s;
  }
  return true;
}

// ?bench=60000 : 몹 N마리를 즉시 배치, 법사 자동 원 운동(무적), 10초마다 자동 메테오.
// 60초 측정 결과를 디버그 표시와 콘솔에 남긴다.
import { CONFIG } from './config.js';
import { addMob } from './sim/mobs.js';
import { launchMeteor } from './meteor.js';

export const bench = {
  active: false, n: 0, angle: 0, timer: 0,
  frames: 0, t0: 0, simSum: 0, simMax: 0, ticks: 0, renderSum: 0, hitches: 0, worstFrame: 0, done: false, report: '',
};

export function parseBench() {
  const v = new URLSearchParams(location.search).get('bench');
  if (v === null) return 0;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 300000) : CONFIG.sim.maxMobs;
}

export function setupBench(G, n) {
  bench.active = true; bench.n = n; bench.angle = 0; bench.timer = 0;
  bench.frames = 0; bench.t0 = performance.now(); bench.simSum = 0; bench.simMax = 0; bench.ticks = 0;
  bench.renderSum = 0; bench.hitches = 0; bench.worstFrame = 0; bench.done = false; bench.report = '';
  const rng = G.rng, R = G.spawnR * 1.5;
  // 후반(마지막 가중치 표)의 몹 구성으로 채움
  const w = CONFIG.spawn.typeWeights[CONFIG.spawn.typeWeights.length - 1][1];
  const sum = w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, r = 120 + Math.sqrt(rng()) * R;
    let x = rng() * sum, t = 0;
    while (t < w.length - 1 && x > w[t]) { x -= w[t]; t++; }
    if (addMob(G.player.x + Math.cos(a) * r, G.player.y + Math.sin(a) * r, t, (rng() * 255) | 0) < 0) break;
  }
  G.player.x = CONFIG.bench.circleRadius; G.player.y = 0;
}

/** 원을 그리며 도는 가상 입력 */
export function benchInput(G, input, dt) {
  const C = CONFIG.bench;
  bench.angle += C.circleSpeed * dt;
  const tx = Math.cos(bench.angle) * C.circleRadius, ty = Math.sin(bench.angle) * C.circleRadius;
  let dx = tx - G.player.x, dy = ty - G.player.y;
  const d = Math.hypot(dx, dy);
  if (d > 1) { dx /= d; dy /= d; } else { dx = -Math.sin(bench.angle); dy = Math.cos(bench.angle); }
  input.mx = dx; input.my = dy;
}

export function benchTick(G, dt) {
  bench.timer += dt;
  if (bench.timer >= CONFIG.bench.autoMeteorEvery) {
    bench.timer = 0;
    const p = G.player;
    launchMeteor(G, p.x - p.faceX * 260, p.y - p.faceY * 260);
  }
}

export function benchFrame(frameMs, simMs, ticks, renderMs) {
  if (!bench.active || bench.done) return;
  const el = performance.now() - bench.t0;
  if (el < 2000) return; // 워밍업 제외
  bench.frames++;
  bench.simSum += simMs; bench.ticks += ticks;
  if (ticks) bench.simMax = Math.max(bench.simMax, simMs / ticks);
  bench.renderSum += renderMs;
  if (frameMs > 50) bench.hitches++;
  bench.worstFrame = Math.max(bench.worstFrame, frameMs);
  if (el >= 62000) {
    bench.done = true;
    const secs = (el - 2000) / 1000;
    bench.report = `BENCH ${bench.n} mobs, ${secs.toFixed(0)}s: avg ${(bench.frames / secs).toFixed(1)} fps, ` +
      `sim ${(bench.simSum / Math.max(1, bench.ticks)).toFixed(2)} ms/tick (max ${bench.simMax.toFixed(2)}), ` +
      `render ${(bench.renderSum / bench.frames).toFixed(2)} ms/frame, frames>50ms: ${bench.hitches}, worst ${bench.worstFrame.toFixed(0)} ms`;
    console.log(bench.report);
  }
}

// 입력: Pointer Events, 손가락마다 역할 구분(이동 조이스틱 / 탭 / 무시).
// 몹 데이터는 절대 건드리지 않는다(탭은 큐에 넣고 틱에서 처리).
const TAP_MS = 250, TAP_PX = 12, JOY_R = 56, DEAD = 0.12;

export const input = {
  mx: 0, my: 0,          // 최종 이동 벡터(길이 0~1)
  dashHeld: false,       // 대시 버튼/Shift 를 누르고 있음 (미리보기)
  joyActive: false,
};

const ptrs = [];
for (let i = 0; i < 10; i++) ptrs.push({ id: -1, x0: 0, y0: 0, x: 0, y: 0, t0: 0, role: 0 }); // role 0 대기, 1 조이스틱, 2 무시
const keys = { up: false, down: false, left: false, right: false };
const joy = { ox: 0, oy: 0, vx: 0, vy: 0 };
let joyPtr = null;
let cb = null, baseEl = null, knobEl = null, layerEl = null;

function find(id) { for (let i = 0; i < ptrs.length; i++) if (ptrs[i].id === id) return ptrs[i]; return null; }
function free() { for (let i = 0; i < ptrs.length; i++) if (ptrs[i].id === -1) return ptrs[i]; return null; }

function startJoy(p) {
  joyPtr = p; p.role = 1;
  joy.ox = p.x0; joy.oy = p.y0;
  input.joyActive = true;
  baseEl.style.display = knobEl.style.display = 'block';
  updateJoy(p.x, p.y);
}

function updateJoy(x, y) {
  let dx = x - joy.ox, dy = y - joy.oy;
  let d = Math.sqrt(dx * dx + dy * dy);
  if (d > JOY_R) { // 손가락이 멀리 가면 조이스틱 중심이 따라옴
    const k = (d - JOY_R) / d;
    joy.ox += dx * k; joy.oy += dy * k;
    dx = x - joy.ox; dy = y - joy.oy; d = JOY_R;
  }
  const m = d / JOY_R;
  if (m < DEAD) { joy.vx = 0; joy.vy = 0; }
  else { const s = (m - DEAD) / (1 - DEAD) / (d || 1); joy.vx = dx * s; joy.vy = dy * s; }
  baseEl.style.transform = `translate(${joy.ox - JOY_R}px, ${joy.oy - JOY_R}px)`;
  knobEl.style.transform = `translate(${joy.ox + dx - 22}px, ${joy.oy + dy - 22}px)`;
}

function endJoy() {
  joyPtr = null; joy.vx = 0; joy.vy = 0;
  input.joyActive = false;
  baseEl.style.display = knobEl.style.display = 'none';
}

function onDown(e) {
  if (cb.blocked()) return;
  const p = free();
  if (!p) return;
  p.id = e.pointerId; p.x0 = p.x = e.clientX; p.y0 = p.y = e.clientY; p.t0 = performance.now(); p.role = 0;
  try { layerEl.setPointerCapture(e.pointerId); } catch (err) { /* */ }
  cb.onAnyPress();
  e.preventDefault();
}

function onMove(e) {
  const p = find(e.pointerId);
  if (!p) return;
  p.x = e.clientX; p.y = e.clientY;
  if (p.role === 0) {
    const dx = p.x - p.x0, dy = p.y - p.y0;
    if (dx * dx + dy * dy >= TAP_PX * TAP_PX) { if (!joyPtr) startJoy(p); else p.role = 2; }
  }
  if (p.role === 1) updateJoy(p.x, p.y);
}

function onUp(e) {
  const p = find(e.pointerId);
  if (!p) return;
  if (p.role === 0 && e.type === 'pointerup' && performance.now() - p.t0 <= TAP_MS) cb.onTap(p.x, p.y);
  if (p.role === 1) endJoy();
  p.id = -1;
}

/** 프레임마다: 오래 누른 손가락은 조이스틱으로 승격, 최종 이동 벡터 계산 */
export function updateInput() {
  const now = performance.now();
  if (!joyPtr) {
    for (let i = 0; i < ptrs.length; i++) {
      const p = ptrs[i];
      if (p.id !== -1 && p.role === 0 && now - p.t0 > TAP_MS) { startJoy(p); break; }
    }
  }
  let mx = joy.vx, my = joy.vy;
  if (!joyPtr) {
    mx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    my = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    if (mx && my) { mx *= Math.SQRT1_2; my *= Math.SQRT1_2; }
  }
  input.mx = mx; input.my = my;
}

export function resetInput() {
  for (let i = 0; i < ptrs.length; i++) ptrs[i].id = -1;
  endJoy();
  keys.up = keys.down = keys.left = keys.right = false;
  input.dashHeld = false;
  input.mx = input.my = 0;
}

const KEYMAP = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };

export function initInput(layer, callbacks) {
  cb = callbacks; layerEl = layer;
  baseEl = document.getElementById('joyBase');
  knobEl = document.getElementById('joyKnob');
  layer.addEventListener('pointerdown', onDown);
  layer.addEventListener('pointermove', onMove);
  layer.addEventListener('pointerup', onUp);
  layer.addEventListener('pointercancel', onUp);
  layer.addEventListener('lostpointercapture', onUp);
  window.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    const k = KEYMAP[e.code];
    if (k) { keys[k] = true; e.preventDefault(); return; }
    if (e.repeat) return;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { input.dashHeld = true; cb.onDashHold(); }
    else if (e.code === 'KeyE') cb.onShield();
    else if (e.code === 'KeyR') cb.onDashUp();
    else if (e.code === 'Escape' || e.code === 'KeyP') cb.onPause();
  });
  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code];
    if (k) keys[k] = false;
    if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && input.dashHeld) { input.dashHeld = false; cb.onDash(); }
  });
  window.addEventListener('blur', () => { keys.up = keys.down = keys.left = keys.right = false; });
}

// 법사 중심의 유한 격자. 매 틱 카운팅 정렬(cellStart/cellCount)로 다시 만든다.
// 영역 밖 몹은 가장자리 칸에 들어간다.
import { CONFIG } from '../config.js';
import { M, MASS } from './mobs.js';

const C = CONFIG.grid;

export const grid = {
  cs: C.cellSize,
  inv: 1 / C.cellSize,
  cols: C.cols,
  rows: C.rows,
  ox: 0, oy: 0,                       // 칸 (0,0) 의 월드 좌표
  count: new Int32Array(C.cols * C.rows),
  start: new Int32Array(C.cols * C.rows + 1),
  cursor: new Int32Array(C.cols * C.rows),
  items: null,                        // 정렬된 몹 인덱스
  g: new Float32Array(C.cols * C.rows * 2), // 밀도 압력 기울기(덜 붐빈 쪽 방향), [gx, gy] 교차 저장
  press: new Float32Array(C.cols * C.rows),
};

export function allocGrid(cap) { grid.items = new Int32Array(cap); }

/** 칸 좌표(정수) — 범위 밖은 가장자리로 고정 */
export function cellX(x) { let c = Math.floor((x - grid.ox) * grid.inv); return c < 0 ? 0 : c >= grid.cols ? grid.cols - 1 : c; }
export function cellY(y) { let c = Math.floor((y - grid.oy) * grid.inv); return c < 0 ? 0 : c >= grid.rows ? grid.rows - 1 : c; }

export function buildGrid(cx, cy) {
  const g = grid, cs = g.cs, cols = g.cols, rows = g.rows, inv = g.inv;
  g.ox = Math.floor(cx / cs) * cs - (cols >> 1) * cs;
  g.oy = Math.floor(cy / cs) * cs - (rows >> 1) * cs;
  const ox = g.ox, oy = g.oy;
  const count = g.count, P = g.press, n = M.n, X = M.x, Y = M.y, TY = M.type, cellOf = M.cell;
  count.fill(0);
  P.fill(0);
  const maxX = cols - 1, maxY = rows - 1;
  for (let i = 0; i < n; i++) {
    let u = ((X[i] - ox) * inv) | 0, v = ((Y[i] - oy) * inv) | 0;
    if (X[i] < ox) u = 0; else if (u > maxX) u = maxX;
    if (Y[i] < oy) v = 0; else if (v > maxY) v = maxY;
    const c = v * cols + u;
    cellOf[i] = c;
    count[c]++;
    P[c] += MASS[TY[i]];          // 큰 몹일수록 칸을 더 차지
  }
  const start = g.start, cursor = g.cursor, N = cols * rows;
  let acc = 0;
  for (let c = 0; c < N; c++) { start[c] = acc; cursor[c] = acc; acc += count[c]; }
  start[N] = acc;
  const items = g.items;
  for (let i = 0; i < n; i++) items[cursor[cellOf[i]]++] = i;

  // 밀도 압력장: P = (칸의 mass 합)² (붐빌수록 급격히 커짐). 기울기는 덜 붐빈 쪽을 향함.
  const G2 = g.g;
  for (let c = 0; c < N; c++) { const k = P[c]; P[c] = k * k; }
  for (let v = 1; v < maxY; v++) {
    const row = v * cols;
    for (let u = 1; u < maxX; u++) {
      const c = row + u;
      G2[c * 2] = (P[c - 1] - P[c + 1]) * 0.5;
      G2[c * 2 + 1] = (P[c - cols] - P[c + cols]) * 0.5;
    }
  }
}

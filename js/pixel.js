// AI 이미지 → 진짜 저해상도 픽셀 스프라이트 변환
// (1) 마젠타 배경 투명 처리 (2) 불투명 영역 잘라내기 (3) 칸마다 최빈색으로 축소(평균·보간 없음)
// (4) 고정 팔레트에 맞추기 (5) 반투명 제거 (6) 외곽선이 없으면 1픽셀 어두운 테두리 추가
// ※ (3)(4): 원본 픽셀을 먼저 팔레트 색으로 맞춘 뒤 칸마다 가장 많이 나온 팔레트 색을 고릅니다.
//    AI 이미지는 미세한 색 노이즈가 많아, 원본 색 그대로 최빈값을 세면 의미가 없기 때문입니다.

export function makePalette(hexes) {
  const n = hexes.length;
  const rgb = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const h = hexes[i].replace('#', '');
    rgb[i * 3] = parseInt(h.slice(0, 2), 16);
    rgb[i * 3 + 1] = parseInt(h.slice(2, 4), 16);
    rgb[i * 3 + 2] = parseInt(h.slice(4, 6), 16);
  }
  return { n, rgb, hex: hexes };
}

export function nearestIndex(pal, r, g, b) {
  let best = 0, bd = 1e12;
  const p = pal.rgb;
  for (let i = 0; i < pal.n; i++) {
    const dr = r - p[i * 3], dg = g - p[i * 3 + 1], db = b - p[i * 3 + 2];
    // 사람 눈 기준 가중 거리 (redmean 근사)
    const rm = (r + p[i * 3]) * 0.5;
    const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

export function luma(pal, i) {
  const p = pal.rgb;
  return 0.299 * p[i * 3] + 0.587 * p[i * 3 + 1] + 0.114 * p[i * 3 + 2];
}

function sourceData(src) {
  const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0);
  return { data: ctx.getImageData(0, 0, w, h).data, w, h };
}

/** 팔레트 인덱스 배열(-1 = 투명) → canvas */
export function idxToCanvas(idx, w, h, pal) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const im = ctx.createImageData(w, h);
  const d = im.data, p = pal.rgb;
  for (let i = 0; i < w * h; i++) {
    const k = idx[i];
    if (k < 0) continue;
    d[i * 4] = p[k * 3]; d[i * 4 + 1] = p[k * 3 + 1]; d[i * 4 + 2] = p[k * 3 + 2]; d[i * 4 + 3] = 255;
  }
  ctx.putImageData(im, 0, 0);
  return c;
}

/** 투명 픽셀 중 4방향 이웃에 불투명이 있으면 외곽선 색으로 */
export function addOutline(idx, w, h, oi) {
  const src = idx.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (src[i] >= 0) continue;
      if ((x > 0 && src[i - 1] >= 0) || (x < w - 1 && src[i + 1] >= 0) ||
          (y > 0 && src[i - w] >= 0) || (y < h - 1 && src[i + w] >= 0)) idx[i] = oi;
    }
  }
  return idx;
}

function needsOutline(idx, w, h, pal, P) {
  let edges = 0, dark = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const k = idx[i];
      if (k < 0) continue;
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
        idx[i - 1] < 0 || idx[i + 1] < 0 || idx[i - w] < 0 || idx[i + w] < 0;
      if (!edge) continue;
      edges++;
      if (luma(pal, k) < P.darkLuma) dark++;
    }
  }
  return edges > 0 && dark / edges < P.outlineNeeded;
}

/**
 * 칸마다 최빈 팔레트 색으로 축소.
 * mode 'contain': 비율 유지해 tw×th 안에 맞춤(가운데 정렬), 'cover': 꽉 채우고 넘치는 부분 잘라냄
 */
function downscale(idx, sw, box, tw, th, mode, npal, out, outW, offX0, offY0) {
  const bw = box[2] - box[0], bh = box[3] - box[1];
  let scale, ow, oh, sx0 = box[0], sy0 = box[1];
  if (mode === 'cover') {
    scale = Math.min(bw / tw, bh / th);
    ow = tw; oh = th;
    sx0 += (bw - tw * scale) / 2;
    sy0 += (bh - th * scale) / 2;
  } else {
    scale = Math.max(bw / tw, bh / th);
    ow = Math.min(tw, Math.max(1, Math.round(bw / scale)));
    oh = Math.min(th, Math.max(1, Math.round(bh / scale)));
  }
  const offX = offX0 + Math.floor((tw - ow) / 2);
  const offY = offY0 + Math.floor((th - oh) / 2);
  const counts = new Int32Array(npal + 1);
  for (let oy = 0; oy < oh; oy++) {
    const y0 = Math.floor(sy0 + oy * scale);
    const y1 = Math.max(y0 + 1, Math.floor(sy0 + (oy + 1) * scale));
    for (let ox = 0; ox < ow; ox++) {
      const x0 = Math.floor(sx0 + ox * scale);
      const x1 = Math.max(x0 + 1, Math.floor(sx0 + (ox + 1) * scale));
      counts.fill(0);
      for (let y = y0; y < y1; y++) {
        const row = y * sw;
        for (let x = x0; x < x1; x++) counts[idx[row + x] + 1]++;
      }
      let best = 0, bc = -1;
      for (let k = 0; k <= npal; k++) if (counts[k] > bc) { bc = counts[k]; best = k; }
      out[(offY + oy) * outW + offX + ox] = best - 1;
    }
  }
}

/**
 * 메인 변환 함수
 * @param src  Image | Canvas
 * @param o    { w, h, tile(bool: 자르기·외곽선 없이 꽉 채움), P: CONFIG.pixel }
 * @returns { canvas, idx|null, converted }
 */
export function pixelize(src, o) {
  const P = o.P;
  const pal = makePalette(P.palette);
  const { data, w: sw, h: sh } = sourceData(src);
  const tw = o.w, th = o.h;

  // 이미 목표 크기와 같으면 다시 변환하지 않음 (반투명만 정리)
  if (sw === tw && sh === th) {
    const c = document.createElement('canvas');
    c.width = tw; c.height = th;
    const ctx = c.getContext('2d');
    const im = ctx.createImageData(tw, th);
    for (let i = 0; i < tw * th; i++) {
      const a = data[i * 4 + 3];
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      const key = isKey(r, g, b, P);
      if (a < P.alphaThreshold || key) continue;
      im.data[i * 4] = r; im.data[i * 4 + 1] = g; im.data[i * 4 + 2] = b; im.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(im, 0, 0);
    return { canvas: c, idx: null, converted: false };
  }

  // (1)(4)(5) 배경 제거 + 팔레트 맞추기 + 반투명 제거
  const idx = new Int16Array(sw * sh);
  const cache = new Map();
  for (let i = 0; i < sw * sh; i++) {
    const a = data[i * 4 + 3];
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    if (a < P.alphaThreshold || isKey(r, g, b, P)) { idx[i] = -1; continue; }
    const key = (r << 16) | (g << 8) | b;
    let k = cache.get(key);
    if (k === undefined) { k = nearestIndex(pal, r, g, b); cache.set(key, k); }
    idx[i] = k;
  }

  // (2) 불투명 영역만 잘라내기
  let box = [0, 0, sw, sh];
  if (!o.tile) {
    let x0 = sw, y0 = sh, x1 = -1, y1 = -1;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        if (idx[y * sw + x] < 0) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) { // 전부 투명
      const empty = new Int16Array(tw * th).fill(-1);
      return { canvas: idxToCanvas(empty, tw, th, pal), idx: empty, converted: true };
    }
    box = [x0, y0, x1 + 1, y1 + 1];
  }

  // (3) 최빈색 축소
  let out = new Int16Array(tw * th).fill(-1);
  downscale(idx, sw, box, tw, th, o.tile ? 'cover' : 'contain', pal.n, out, tw, 0, 0);

  // (6) 외곽선
  if (!o.tile && needsOutline(out, tw, th, pal, P)) {
    out = new Int16Array(tw * th).fill(-1);
    downscale(idx, sw, box, tw - 2, th - 2, 'contain', pal.n, out, tw, 1, 1);
    addOutline(out, tw, th, P.outlineIndex);
  }
  return { canvas: idxToCanvas(out, tw, th, pal), idx: out, converted: true };
}

/**
 * 이미 도트로 찍힌 작은 이미지: 크기를 바꾸지 않는다.
 * 마젠타 배경 제거 → 투명 테두리 잘라내기 → 반투명 제거(+ 원하면 팔레트 맞추기).
 * crop=false 면 원래 캔버스 크기 유지(타일 등).
 */
export function nativeSprite(src, P, crop) {
  const { data, w, h } = sourceData(src);
  const pal = P.snapNative ? makePalette(P.palette) : null;
  const cache = new Map();
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    if (data[i * 4 + 3] < P.alphaThreshold || isKey(r, g, b, P)) { data[i * 4 + 3] = 0; continue; }
    data[i * 4 + 3] = 255;
    if (pal) {
      const key = (r << 16) | (g << 8) | b;
      let k = cache.get(key);
      if (k === undefined) { k = nearestIndex(pal, r, g, b); cache.set(key, k); }
      data[i * 4] = pal.rgb[k * 3]; data[i * 4 + 1] = pal.rgb[k * 3 + 1]; data[i * 4 + 2] = pal.rgb[k * 3 + 2];
    }
    const x = i % w, y = (i / w) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (!crop || x1 < 0) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; }
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const ctx = c.getContext('2d');
  const im = ctx.createImageData(cw, ch);
  for (let y = 0; y < ch; y++) {
    const s = ((y + y0) * w + x0) * 4;
    im.data.set(data.subarray(s, s + cw * 4), y * cw * 4);
  }
  ctx.putImageData(im, 0, 0);
  return c;
}

function isKey(r, g, b, P) {
  const k = P.keyColor;
  const dr = r - k[0], dg = g - k[1], db = b - k[2];
  return dr * dr + dg * dg + db * db < P.keyTolerance * P.keyTolerance;
}

/** 정수배 최근접 확대 (아이콘 저장용) */
export function scaleCanvas(src, k) {
  const c = document.createElement('canvas');
  c.width = src.width * k; c.height = src.height * k;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

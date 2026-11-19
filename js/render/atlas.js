// 스프라이트들을 하나의 텍스처 아틀라스로 합치기 (단순 선반 배치, 밉맵 없음)
export function buildAtlas(order, sprites) {
  const pad = 1;
  let size = 128;
  for (;;) {
    const rects = tryPack(order, sprites, size, pad);
    if (rects) {
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      for (let i = 0; i < order.length; i++) {
        const s = sprites[order[i]], r = rects[i];
        if (s) ctx.drawImage(s, r[0], r[1]);
      }
      // 셰이더 uniform 용 [x, y, w, h] 평탄 배열
      const flat = new Float32Array(order.length * 4);
      for (let i = 0; i < order.length; i++) flat.set(rects[i], i * 4);
      return { canvas: c, size, rects, flat };
    }
    size *= 2;
    if (size > 4096) throw new Error('atlas too big');
  }
}

function tryPack(order, sprites, size, pad) {
  const rects = [];
  let x = 0, y = 0, rowH = 0;
  for (let i = 0; i < order.length; i++) {
    const s = sprites[order[i]];
    const w = s ? s.width : 1, h = s ? s.height : 1;
    if (x + w > size) { x = 0; y += rowH + pad; rowH = 0; }
    if (y + h > size) return null;
    rects.push([x, y, w, h]);
    x += w + pad;
    rowH = Math.max(rowH, h);
  }
  return rects;
}

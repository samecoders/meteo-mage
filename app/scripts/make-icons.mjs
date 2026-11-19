// image/icon-512.png → capacitor-assets 입력(assets/). 도트 그림이라 확대는 nearest.
import sharp from 'sharp';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(app, '..', 'image', 'icon-512.png');
const out = (f) => join(app, 'assets', f);

const { data, info } = await sharp(src).raw().toBuffer({ resolveWithObject: true });
const px = (x, y) => { const i = (y * info.width + x) * info.channels; return { r: data[i], g: data[i + 1], b: data[i + 2] }; };
const bg = px(60, 256);                                   // 테두리 안쪽 보라색
console.log('background', bg);

// 1) 예전 방식 아이콘: 그림 그대로 1024
await sharp(src).resize(1024, 1024, { kernel: 'nearest' }).png().toFile(out('icon-only.png'));
// 2) 적응형 배경: 단색
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { ...bg, alpha: 1 } } }).png().toFile(out('icon-background.png'));
// 3) 적응형 전경: 어두운 테두리를 잘라낸 그림을 가운데 72% 크기로
// 테두리를 잘라내고, 바탕 보라색에 가까운 픽셀은 투명하게(단색 배경과 이음새 없게)
const B = 40, D = 640, W = 512 - 2 * B;
const crop = await sharp(src).extract({ left: B, top: B, width: W, height: W }).ensureAlpha().raw().toBuffer();
for (let i = 0; i < crop.length; i += 4) {
  const d = Math.abs(crop[i] - bg.r) + Math.abs(crop[i + 1] - bg.g) + Math.abs(crop[i + 2] - bg.b);
  if (d < 40) crop[i + 3] = 0;
}
const fg = await sharp(crop, { raw: { width: W, height: W, channels: 4 } }).resize(D, D, { kernel: 'nearest' }).png().toBuffer();
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: fg, left: (1024 - D) >> 1, top: (1024 - D) >> 1 }]).png().toFile(out('icon-foreground.png'));
// 4) 스플래시: 검은 바탕 가운데 아이콘
const ic = await sharp(src).resize(768, 768, { kernel: 'nearest' }).png().toBuffer();
for (const f of ['splash.png', 'splash-dark.png'])
  await sharp({ create: { width: 2732, height: 2732, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
    .composite([{ input: ic, left: (2732 - 768) >> 1, top: (2732 - 768) >> 1 }]).png().toFile(out(f));
console.log('done');

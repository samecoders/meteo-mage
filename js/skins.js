// 메테오 모양(꾸미기 전용). 그림·색·효과음 음색만 바뀌고 판정 수치는 전혀 없음.
// 색은 CONFIG.pixel.palette 의 인덱스.
import { CONFIG } from './config.js';

export const SKINS = [
  { id: 'fire',      sprite: 'meteor_fire',      body: [24, 23, 22, 3],  trail: [24, 23, 22],  burst: [31, 24, 23, 22, 4], crater: [28, 17], ring: 23,
    sound: { wave: 'sawtooth', base: 55, cutoff: 900, noiseQ: 0.7 } },
  { id: 'ice',       sprite: 'meteor_ice',       body: [31, 12, 11, 10], trail: [13, 12, 11],  burst: [31, 13, 12, 11, 14], crater: [9, 15],  ring: 12,
    sound: { wave: 'triangle', base: 90, cutoff: 2400, noiseQ: 4 } },
  { id: 'poison',    sprite: 'meteor_poison',    body: [6, 7, 25, 2],    trail: [6, 7, 20],    burst: [6, 7, 27, 21, 20], crater: [25, 2],  ring: 6,
    sound: { wave: 'square', base: 48, cutoff: 600, noiseQ: 8 } },
  { id: 'lightning', sprite: 'meteor_lightning', body: [31, 13, 24, 10], trail: [31, 24, 12],  burst: [31, 24, 12, 11, 13], crater: [16, 9],  ring: 24,
    sound: { wave: 'square', base: 110, cutoff: 5000, noiseQ: 1.5 } },
  { id: 'dark',      sprite: 'meteor_dark',      body: [21, 20, 2, 1],   trail: [21, 20, 2],   burst: [21, 20, 2, 31, 12], crater: [1, 20],  ring: 21,
    sound: { wave: 'sine', base: 38, cutoff: 400, noiseQ: 3 } },
  { id: 'gold',      sprite: 'meteor_gold',      body: [31, 24, 5, 18],  trail: [24, 5, 19],   burst: [31, 24, 5, 19, 23], crater: [17, 18], ring: 24,
    sound: { wave: 'triangle', base: 70, cutoff: 3000, noiseQ: 6 } },
];

export function skinById(id) {
  for (let i = 0; i < SKINS.length; i++) if (SKINS[i].id === id) return SKINS[i];
  return SKINS[0];
}
export function skinPrice(id) { return CONFIG.skins.prices[id] ?? 0; }

// 팔레트 인덱스 → 셰이더용 RGBA(u32, 리틀엔디언 바이트 순서 r,g,b,a)
const PAL_U32 = new Uint32Array(CONFIG.pixel.palette.length);
const PAL_CSS = [];
for (let i = 0; i < CONFIG.pixel.palette.length; i++) {
  const h = CONFIG.pixel.palette[i].replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  PAL_U32[i] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
  PAL_CSS[i] = CONFIG.pixel.palette[i];
}
export function pal(i) { return PAL_U32[i]; }
export function palCss(i) { return PAL_CSS[i]; }

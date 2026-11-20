// 배경음악: audio/*.mp3 가 있으면 그 파일, 없으면 아래 악보를 FM풍 합성(오실레이터 2개 변조) + 드럼으로 연주한 내장 음악.
// 곡은 모두 이 게임을 위해 새로 작곡한 것(90년대 항해 모험 RPG 관현악 분위기: 현악 선율 + 금관 팡파르 + 팀파니·스네어 행진).
// 내장 음악은 OfflineAudioContext 로 한 번 AudioBuffer 에 녹음 → 파일과 똑같이 AudioBufferSourceNode.loop 로 틈 없이 반복.
import { CONFIG } from './config.js';

const A = CONFIG.audio;

// ------------------------------------------------------------------ 악보
// 음표: "음이름옥타브/박" (예 F#5/1.5), 쉼표 "r/박". 화음: 마디마다 하나(D, Bm, F#m, A7, Bb, C#dim …)
// 드럼: 한 마디 16칸 문자열. 'x' 침, '.' 쉼. fills: { 마디번호(0부터): { 악기: 패턴 } }
// 반주(auto): pad = 현악 화음, bass = 'march'(1·3박 근음·5음) | 'drive'(8분 근음) | 'walk'
//             stab = 금관 화음 찌르기 칸 패턴, arp = 하프 아르페지오 칸 패턴
const SCORES = {
  // 타이틀: 출항하는 듯한 웅장하고 희망찬 곡. D장조, 느긋한 4/4
  title: {
    bpm: 92, loop: true,
    chords: ['D', 'A', 'Bm', 'G', 'D', 'G', 'A', 'A', 'G', 'A', 'F#m', 'Bm', 'G', 'A', 'D', 'D'],
    melody: { inst: 'str', oct: 0, notes:
      'A4/2 D5/1 E5/1 | F#5/3 E5/1 | D5/1.5 C#5/.5 B4/1 A4/1 | B4/3 r/1 | ' +
      'A4/1 D5/1 F#5/1 A5/1 | G5/2 F#5/1 E5/1 | E5/1.5 F#5/.5 E5/1 C#5/1 | A4/4 | ' +
      'B4/1 D5/1 G5/2 | A5/1.5 G5/.5 F#5/1 E5/1 | F#5/1.5 E5/.5 C#5/1 A4/1 | D5/1 C#5/1 B4/2 | ' +
      'G4/1 B4/1 D5/1 G5/1 | F#5/1 E5/1 A5/2 | F#5/2 E5/1 D5/1 | D5/4' },
    brass: { inst: 'brass', notes:
      'D4/.33 D4/.33 D4/.34 A4/3 | r/4 | r/4 | G4/.5 G4/.5 B4/1 D5/2 | ' +
      'D4/.33 D4/.33 D4/.34 A4/3 | r/4 | A4/.5 A4/.5 C#5/1 E5/2 | r/4 | ' +
      'G4/.33 G4/.33 G4/.34 D5/3 | r/4 | r/4 | r/4 | ' +
      'D4/.33 D4/.33 D4/.34 G4/1 B4/1 D5/1 | C#5/2 E5/2 | D5/4 | r/4' },
    pad: 'str', padVol: 0.5, bass: 'march', arp: 'x...x...x...x...',
    drums: { T: 'x.......x.......', S: '............x.x.', C: '' },
    fills: { 7: { S: 'x.x.x.x.xxxxxxxx' }, 15: { S: 'x.x.x.x.xxxxxxxx', T: 'x...x...x.x.xxxx' }, 0: { C: 'x...............' }, 8: { C: 'x...............' } },
  },
  // 평원: 경쾌하고 빠른 모험 행진곡. G장조
  field: {
    bpm: 132, loop: true,
    chords: ['G', 'G', 'C', 'D', 'G', 'Em', 'Am', 'D', 'C', 'D', 'Bm', 'Em', 'C', 'D', 'G', 'D7'],
    melody: { inst: 'str', notes:
      'G4/.5 B4/.5 D5/1 D5/.5 E5/.5 D5/1 | B4/.5 D5/.5 G5/1.5 F#5/.5 E5/1 | E5/.5 G5/.5 E5/.5 C5/.5 E5/1 D5/1 | D5/1.5 C5/.5 B4/1 A4/1 | ' +
      'G4/.5 B4/.5 D5/1 G5/1 F#5/.5 G5/.5 | E5/1.5 D5/.5 B4/2 | C5/.5 E5/.5 A5/1 G5/.5 E5/.5 C5/1 | D5/3 r/1 | ' +
      'E5/1 G5/1 C6/1.5 B5/.5 | A5/1 F#5/1 D5/2 | B4/.5 D5/.5 F#5/1 F#5/.5 G5/.5 F#5/1 | E5/1.5 F#5/.5 G5/1 B5/1 | ' +
      'C6/1 B5/.5 A5/.5 G5/1 E5/1 | F#5/1 A5/1 D6/1 C6/1 | B5/1.5 A5/.5 G5/1 D5/1 | A5/1 F#5/1 D5/1 A4/1' },
    brass: { inst: 'brass', notes:
      'r/4 | r/4 | r/4 | D4/.5 D4/.25 D4/.25 A4/1 r/2 | r/4 | r/4 | r/4 | D4/.5 D4/.5 F#4/.5 A4/.5 D5/2 | ' +
      'G4/1 C5/1 E5/2 | F#4/1 A4/1 D5/2 | r/4 | r/4 | E4/1 G4/1 C5/2 | D5/.5 D5/.25 D5/.25 F#5/1 A5/2 | G5/4 | r/4' },
    pad: 'str', padVol: 0.35, bass: 'march', stab: '....x.......x...',
    drums: { T: 'x.......x.......', S: 'x...x.xxx...x.x.', H: '..x...x...x...x.' },
    fills: { 7: { S: 'x.x.x.x.xxxxxxxx' }, 15: { S: 'xxxxx.x.xxxxxxxx', T: 'x...x...x.x.x.x.' }, 0: { C: 'x...............' }, 8: { C: 'x...............' } },
  },
  // 위기: 보스·대군. D단조, 몰아치는 리듬
  battle: {
    bpm: 150, loop: true,
    chords: ['Dm', 'Dm', 'Bb', 'C', 'Dm', 'Dm', 'Bb', 'A', 'Gm', 'A', 'Dm', 'Bb', 'Gm', 'C', 'A', 'A7'],
    melody: { inst: 'str', notes:
      'D5/.5 D5/.5 F5/.5 A5/.5 G5/1 F5/1 | E5/.5 F5/.5 D5/1 A4/2 | Bb4/.5 D5/.5 F5/1 Bb5/1 A5/1 | G5/1.5 F5/.5 E5/1 C5/1 | ' +
      'D5/.5 F5/.5 A5/1 D6/1 C6/1 | A5/1 F5/1 D5/2 | F5/.5 G5/.5 Bb5/1 A5/.5 G5/.5 F5/1 | E5/1 C#5/1 A4/2 | ' +
      'G4/.5 Bb4/.5 D5/1 G5/1 F5/1 | E5/1.5 D5/.5 C#5/1 E5/1 | F5/1.5 E5/.5 D5/1 A5/1 | Bb5/1 A5/1 G5/1 F5/1 | ' +
      'G5/1.5 F5/.5 E5/1 D5/1 | E5/1 G5/1 C6/2 | C#6/1 A5/1 E5/1 C#5/1 | A5/2 r/1 A4/1' },
    brass: { inst: 'brass', notes:
      'D4/.25 D4/.25 r/.5 D4/.25 D4/.25 r/.5 F4/1 A4/1 | r/4 | Bb3/.25 Bb3/.25 r/.5 Bb3/.25 Bb3/.25 r/.5 D4/1 F4/1 | C4/1 E4/1 G4/2 | ' +
      'D4/.25 D4/.25 r/.5 D4/.25 D4/.25 r/.5 F4/1 A4/1 | r/4 | r/4 | A3/1 C#4/1 E4/2 | ' +
      'G3/.5 G3/.5 Bb3/1 D4/2 | A3/.5 A3/.5 C#4/1 E4/2 | r/4 | F4/1 D4/1 Bb3/2 | r/4 | C4/.5 C4/.5 E4/1 G4/2 | A4/.25 A4/.25 A4/.5 C#5/1 E5/2 | A4/4' },
    pad: 'str', padVol: 0.4, bass: 'drive', stab: 'x.....x...x.....',
    drums: { K: 'x.......x.......', S: '....x.......x...', T: 'x.x.x.x.x.x.x.x.', H: 'x.x.x.x.x.x.x.x.' },
    fills: { 7: { S: '....x.......xxxx' }, 15: { S: 'x.x.x.x.xxxxxxxx' }, 0: { C: 'x...............' }, 8: { C: 'x...............' } },
  },
  // 무적의 별: 짧고 신나는 루프. F장조, 빠르게
  star: {
    bpm: 168, loop: true,
    chords: ['F', 'Bb', 'C', 'C7'],
    melody: { inst: 'brass', notes:
      'F5/.5 A5/.5 C6/.5 A5/.5 F5/.5 A5/.5 C6/1 | D6/.5 C6/.5 Bb5/.5 D6/.5 F6/1 D6/1 | C6/.5 E6/.5 G6/.5 E6/.5 C6/.5 Bb5/.5 G5/1 | A5/.5 C6/.5 F6/1 E6/.5 C6/.5 G5/1' },
    pad: 'str', padVol: 0.3, bass: 'drive', arp: 'xxxxxxxxxxxxxxxx',
    drums: { K: 'x...x...x...x...', S: '....x.......x...', H: 'xxxxxxxxxxxxxxxx' },
    fills: { 3: { S: '....x...x.xxxxxx' } },
  },
  // 징글(한 번): 메테오 습득 — 장엄한 팡파르
  meteor: {
    bpm: 100, loop: false, bars: 2,
    chords: ['D', 'D'],
    melody: { inst: 'brass', notes: 'D4/.33 D4/.33 D4/.34 A4/1 r/.25 D5/.25 F#5/.5 A5/1 | A5/3 r/1' },
    melody2: { inst: 'str', notes: 'r/1 D5/1 F#5/1 A5/1 | D6/3 r/1' },
    pad: 'str', padVol: 0.6, padBars: 2,
    drums: { T: 'x...x...xxxxxxxx' },
    fills: { 1: { T: 'x...............', C: 'x...............' } },
  },
  // 징글: 레벨 업
  levelup: {
    bpm: 150, loop: false, bars: 2, gain: 2.4,
    chords: ['C', 'C'],
    melody: { inst: 'brass', notes: 'C5/.25 E5/.25 G5/.25 r/.25 C6/.5 G5/.25 C6/.25 E6/2 | r/4' },
    pad: 'str', padVol: 0.4, arp: 'xxxxxxxx........',
    drums: { S: '........x.x.x...' },
    fills: { 1: { C: 'x...............' } },
  },
  // 징글: 게임 오버 — 단조로 가라앉음
  gameover: {
    bpm: 76, loop: false, bars: 2,
    chords: ['Am', 'E'],
    melody: { inst: 'str', notes: 'A4/1 G4/1 F4/1 E4/1 | D#4/1 E4/3' },
    pad: 'str', padVol: 0.5,
    drums: { T: 'x.......x.......' },
    fills: { 1: { T: 'x...............' } },
  },
};

// ------------------------------------------------------------------ 음 이름 → 주파수
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function midi(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) return 60;
  return 12 * (+m[3] + 1) + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
function parseNotes(str) {
  const out = [];
  let beat = 0;
  for (const tok of str.split(/\s+/)) {
    if (!tok || tok === '|') continue;
    const [p, d] = tok.split('/');
    const dur = parseFloat(d) || 1;
    if (p !== 'r') out.push({ beat, dur, n: midi(p) });
    beat += dur;
  }
  return out;
}
/** 화음 이름 → 근음 midi(옥타브 3) + 구성음 반음 간격 */
function chord(name) {
  const m = /^([A-G])([#b]?)(m|dim)?(7)?$/.exec(name) || [0, 'C', '', '', ''];
  const root = 48 + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const third = m[3] === 'm' || m[3] === 'dim' ? 3 : 4, fifth = m[3] === 'dim' ? 6 : 7;
  const iv = [0, third, fifth];
  if (m[4]) iv.push(10);
  return { root, iv };
}

// ------------------------------------------------------------------ FM 악기
// ratio: 변조 오실레이터 주파수 비율, idx: [처음, 유지] 변조 지수, a/d/s/r: 소리 크기 엔벨로프, vol, pan
const INST = {
  str:   { ratio: 1, idx: [1.4, 0.9], idxT: 0.3, a: 0.07, d: 0.25, s: 0.75, r: 0.22, vol: 0.16, vib: 0.006, pan: -0.15, wave: 'sine', double: true },
  brass: { ratio: 1, idx: [0.6, 2.6], idxT: 0.06, a: 0.035, d: 0.15, s: 0.8, r: 0.12, vol: 0.15, vib: 0.003, pan: 0.2, wave: 'sine' },
  bass:  { ratio: 1, idx: [1.6, 0.6], idxT: 0.15, a: 0.008, d: 0.25, s: 0.45, r: 0.08, vol: 0.26, vib: 0, pan: 0, wave: 'sine' },
  harp:  { ratio: 3.5, idx: [2.2, 0], idxT: 0.25, a: 0.003, d: 0.35, s: 0, r: 0.2, vol: 0.06, vib: 0, pan: 0.35, wave: 'sine' },
  pad:   { ratio: 1, idx: [0.9, 0.7], idxT: 0.5, a: 0.25, d: 0.4, s: 0.8, r: 0.4, vol: 0.05, vib: 0, pan: 0, wave: 'triangle' },
};

function fmNote(c, out, t, dur, freq, I, vel) {
  const car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), amp = c.createGain(), pan = c.createStereoPanner();
  car.type = I.wave; mod.type = 'sine';
  car.frequency.value = freq; mod.frequency.value = freq * I.ratio;
  // 변조 지수 엔벨로프(금관은 점점 밝아지고, 현악은 처음이 밝음)
  mg.gain.setValueAtTime(I.idx[0] * freq, t);
  mg.gain.linearRampToValueAtTime(I.idx[1] * freq, t + I.idxT);
  mod.connect(mg); mg.connect(car.frequency);
  if (I.vib) { // 비브라토
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 5.2; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(freq * I.vib, t + 0.35);
    lfo.connect(lg); lg.connect(car.frequency); lfo.start(t); lfo.stop(t + dur + I.r + 0.05);
  }
  const v = I.vol * (vel || 1), end = t + Math.max(dur, I.a + 0.02);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(v, t + I.a);
  amp.gain.setTargetAtTime(v * I.s, t + I.a, I.d / 3);
  amp.gain.setValueAtTime(I.s > 0 ? v * I.s : 0.0001, end);
  amp.gain.setTargetAtTime(0, end, I.r / 3);
  pan.pan.value = I.pan;
  car.connect(amp); amp.connect(pan); pan.connect(out);
  car.start(t); mod.start(t);
  car.stop(end + I.r + 0.1); mod.stop(end + I.r + 0.1);
  if (I.double) { // 현악: 살짝 어긋난 둘째 목소리로 합주 느낌
    const c2 = c.createOscillator(); c2.type = I.wave; c2.frequency.value = freq * 1.004; c2.detune.value = 0;
    mg.connect(c2.frequency); c2.connect(amp); c2.start(t); c2.stop(end + I.r + 0.1);
  }
}

// ------------------------------------------------------------------ 드럼
let noiseBuf = null;
function noiseFor(c) {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
  noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let s = 12345;
  for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = s / 0x3fffffff - 1; }
  return noiseBuf;
}
function noiseHit(c, out, t, type, f, q, dur, vol, pan) {
  const src = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(), p = c.createStereoPanner();
  src.buffer = noiseFor(c); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.setTargetAtTime(0, t + 0.005, dur / 4);
  p.pan.value = pan || 0;
  src.connect(fl); fl.connect(g); g.connect(p); p.connect(out);
  src.start(t, (t * 7.31) % 0.5); src.stop(t + dur + 0.05);
}
function toneHit(c, out, t, f0, f1, dur, vol, wave) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = wave || 'sine';
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur * 0.6);
  g.gain.setValueAtTime(vol, t); g.gain.setTargetAtTime(0, t + 0.005, dur / 4);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
}
const DRUM = {
  T(c, out, t, root, accent) { const f = hz(root - 12); toneHit(c, out, t, f * 1.03, f, 0.9, 0.34 * accent); noiseHit(c, out, t, 'lowpass', 300, 1, 0.12, 0.12 * accent); },   // 팀파니(근음)
  S(c, out, t, root, accent) { noiseHit(c, out, t, 'bandpass', 1900, 0.9, 0.16, 0.2 * accent, 0.1); toneHit(c, out, t, 210, 170, 0.08, 0.08 * accent, 'triangle'); },
  K(c, out, t) { toneHit(c, out, t, 130, 45, 0.22, 0.42); },
  H(c, out, t) { noiseHit(c, out, t, 'highpass', 8000, 0.7, 0.04, 0.045, -0.2); },
  C(c, out, t) { noiseHit(c, out, t, 'highpass', 5500, 0.6, 1.3, 0.09, 0.15); },
};

// ------------------------------------------------------------------ 악보 → 녹음
const RATE = 24000;   // 내장 음악 녹음 표본율(가볍게)
async function renderScore(name, mainCtx) {
  const S = SCORES[name];
  const spb = 60 / S.bpm, bars = S.bars || S.chords.length, len = bars * 4 * spb;
  const tail = S.loop ? 1.6 : 2.2;
  const total = Math.ceil((len + tail) * RATE);
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const c = new OAC(2, total, RATE);
  const bus = c.createGain(); bus.gain.value = 0.9 * (S.gain || 1);
  const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3;
  bus.connect(comp); comp.connect(c.destination);
  const T = (beat) => beat * spb;
  // 선율
  for (const key of ['melody', 'melody2', 'brass']) {
    const part = S[key];
    if (!part) continue;
    const I = INST[part.inst];
    for (const nt of parseNotes(part.notes)) fmNote(c, bus, T(nt.beat), nt.dur * spb * 0.95, hz(nt.n + (part.oct || 0) * 12), I, key === 'brass' ? 0.9 : 1);
  }
  // 반주: 마디마다 화음
  for (let b = 0; b < bars; b++) {
    const ch = chord(S.chords[b % S.chords.length]), t0 = b * 4;
    if (S.pad) for (const iv of ch.iv.slice(0, 3)) fmNote(c, bus, T(t0), 4 * spb * 0.98, hz(ch.root + 12 + iv), INST.pad, S.padVol / 0.5);
    if (S.bass === 'march') { fmNote(c, bus, T(t0), spb * 0.8, hz(ch.root - 12), INST.bass); fmNote(c, bus, T(t0 + 2), spb * 0.8, hz(ch.root - 12 + 7), INST.bass); fmNote(c, bus, T(t0 + 1), spb * 0.3, hz(ch.root), INST.bass, 0.4); fmNote(c, bus, T(t0 + 3), spb * 0.3, hz(ch.root + 7), INST.bass, 0.4); }
    else if (S.bass === 'drive') for (let k = 0; k < 8; k++) fmNote(c, bus, T(t0 + k * 0.5), spb * 0.42, hz(ch.root - 12 + (k === 6 ? 7 : 0)), INST.bass, k % 2 ? 0.7 : 1);
    if (S.stab) for (let k = 0; k < 16; k++) if (S.stab[k] === 'x') for (const iv of ch.iv.slice(0, 3)) fmNote(c, bus, T(t0 + k / 4), spb * 0.35, hz(ch.root + 12 + iv), INST.brass, 0.45);
    if (S.arp) { const seq = [0, 1, 2, 3, 2, 1]; let q = 0; for (let k = 0; k < 16; k++) if (S.arp[k] === 'x') { const i = seq[q++ % seq.length]; const n = ch.root + 24 + (i < ch.iv.length ? ch.iv[i] : 12); fmNote(c, bus, T(t0 + k / 4), spb * 0.3, hz(n), INST.harp); } }
    // 드럼(마디별 덧씌움)
    const dr = { ...(S.drums || {}), ...((S.fills && S.fills[b]) || {}) };
    for (const ins in dr) {
      const pat = dr[ins];
      for (let k = 0; k < 16 && k < pat.length; k++) if (pat[k] === 'x') DRUM[ins](c, bus, T(t0 + k / 4), ch.root, k % 4 === 0 ? 1 : 0.7);
    }
  }
  const rendered = await c.startRendering();
  // 반복 곡: 끝을 넘친 울림을 앞부분에 겹쳐 넣고 정확히 곡 길이로 자름 → 이음매 없음
  const n = S.loop ? Math.round(len * RATE) : total;
  const outBuf = mainCtx.createBuffer(2, n, RATE);
  for (let ch = 0; ch < 2; ch++) {
    const src = rendered.getChannelData(ch), dst = outBuf.getChannelData(ch);
    dst.set(src.subarray(0, n));
    if (S.loop) for (let i = n; i < total; i++) dst[i - n] += src[i];
  }
  return outBuf;
}

// ------------------------------------------------------------------ 파일 → 앞뒤 무음 자르기
function trimSilence(ctx, buf) {
  const th = A.trimThreshold, chs = buf.numberOfChannels, n = buf.length;
  let a = n, b = 0;
  for (let ch = 0; ch < chs; ch++) {
    const d = buf.getChannelData(ch);
    let i = 0; while (i < n && Math.abs(d[i]) < th) i++;
    let j = n - 1; while (j > i && Math.abs(d[j]) < th) j--;
    if (i < a) a = i; if (j > b) b = j;
  }
  if (a >= b) return buf;
  const out = ctx.createBuffer(chs, b - a + 1, buf.sampleRate);
  for (let ch = 0; ch < chs; ch++) out.getChannelData(ch).set(buf.getChannelData(ch).subarray(a, b + 1));
  return out;
}

/**
 * 루프 지점을 적지 않은 반복 곡 파일: 끝의 페이드아웃을 찾아 잘라내고(짧은 구간 소리 크기가 곡 중앙값의 60% 밑으로
 * 떨어지기 시작하는 곳), 끝 0.5초를 곡 처음과 크로스페이드로 구워 넣어 이음매 없이 반복되게 만든다.
 * 정확한 지점은 config audio.tracks.<이름>.loopStart / loopEnd 로 지정하면 그것을 씀.
 */
function autoLoop(ctx, buf) {
  const sr = buf.sampleRate, chs = buf.numberOfChannels, n = buf.length, win = Math.round(sr * 0.1);
  // 가볍게: 중앙값은 1초마다 한 칸만 표본, 페이드는 끝에서부터 거꾸로만 찾음(메인 스레드 멈춤 방지)
  const d0 = buf.getChannelData(0), nw = Math.floor(n / win);
  const rmsAt = (w) => { let s = 0; for (let k = w * win, e = k + win; k < e; k += 2) s += d0[k] * d0[k]; return Math.sqrt(s / (win / 2)); };
  const samp = [];
  for (let w = 0; w < nw; w += 10) samp.push(rmsAt(w));
  samp.sort((a, b) => a - b);
  const med = samp[samp.length >> 1] || 0;
  let last = nw - 1;
  while (last > nw * 0.5 && rmsAt(last) < med * 0.6) last--;
  const L = Math.min(n, (last + 1) * win), X = Math.min(Math.round(sr * 0.5), L >> 3);
  if (L - 2 * X <= 0) return buf;
  const out = ctx.createBuffer(chs, L - X, sr);
  for (let ch = 0; ch < chs; ch++) {
    const src = buf.getChannelData(ch), dst = out.getChannelData(ch);
    dst.set(src.subarray(X, L));                          // 처음 X 는 끝에 섞어 넣으므로 건너뜀
    const base = L - 2 * X;                              // 끝 X 구간: 끝소리 줄이며 처음소리 키움
    for (let i = 0; i < X; i++) { const a = i / X; dst[base + i] = src[L - X + i] * Math.cos(a * Math.PI / 2) + src[i] * Math.sin(a * Math.PI / 2); }
  }
  return out;
}

// ------------------------------------------------------------------ 재생기
const M = { ctx: null, out: null, cur: null, want: null, cache: {}, jingleUntil: 0, source: {}, used: {} };
const KEEP_LONG = 2;   // 긴 곡 파일(약 3분)은 메모리에 2곡까지만(지금 곡 + 다음 곡). 나머지는 필요할 때 다시 풀어 씀

/** 오래 안 쓴 긴 곡 버퍼를 놓아 메모리 절약(내장 곡·징글은 작아서 그대로) */
function evictLong() {
  const longs = Object.keys(M.cache).filter((k) => M.source[k] === 'file' && A.tracks[k].loop && k !== M.want && (!M.cur || M.cur.name !== k));
  const keep = KEEP_LONG - 1;
  if (longs.length <= keep) return;
  longs.sort((a, b) => (M.used[a] || 0) - (M.used[b] || 0));
  for (const k of longs.slice(0, longs.length - keep)) delete M.cache[k];
}

export function initMusic(ctx, out) { M.ctx = ctx; M.out = out; }

/** 곡 버퍼: 파일 우선, 없으면 내장 곡 녹음. 한 번만 */
export function loadTrack(name) {
  if (M.cache[name]) return M.cache[name];
  const tr = A.tracks[name], ctx = M.ctx;
  M.cache[name] = (async () => {
    try {
      const res = await fetch('audio/' + tr.file, { cache: 'force-cache' });
      const type = res.headers.get('content-type') || '';
      if (res.ok && !type.includes('text/html')) {
        const raw = await res.arrayBuffer();
        const buf = await new Promise((ok, bad) => ctx.decodeAudioData(raw, ok, bad));
        M.source[name] = 'file';
        const trimmed = trimSilence(ctx, buf);
        return tr.loop && !(tr.loopEnd > 0) && !(tr.loopStart > 0) ? autoLoop(ctx, trimmed) : trimmed;
      }
    } catch (e) { /* 파일 없음 → 내장 */ }
    M.source[name] = 'built-in';
    return renderScore(name, ctx);
  })();
  M.cache[name].catch((e) => { console.warn('music load failed', name, e); delete M.cache[name]; });
  return M.cache[name];
}

/** 반복 곡으로 전환(2초 크로스페이드). 같은 곡이면 그대로 */
export function playMusic(name) {
  if (!M.ctx) return;
  if (M.want === name) return;
  M.want = name;
  if (!name) { fadeOut(M.cur, 0.8); M.cur = null; return; }
  M.used[name] = performance.now();
  loadTrack(name).then((buf) => {
    if (M.want !== name || !M.ctx) return;
    const ctx = M.ctx, tr = A.tracks[name], now = ctx.currentTime;
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf; src.loop = true;
    if (tr.loopEnd > 0) { src.loopStart = tr.loopStart || 0; src.loopEnd = Math.min(tr.loopEnd, buf.duration); }
    else if (tr.loopStart > 0) { src.loopStart = tr.loopStart; src.loopEnd = buf.duration; }
    const fade = M.cur ? A.crossfade : 0.6;
    g.gain.setValueAtTime(0.0001, now); g.gain.linearRampToValueAtTime(1, now + fade);
    src.connect(g); g.connect(M.out); src.start(now);
    fadeOut(M.cur, fade);
    M.cur = { name, src, g };
    setTimeout(evictLong, (fade + 0.5) * 1000);
  }).catch(() => {});
}
function fadeOut(cur, t) {
  if (!cur || !M.ctx) return;
  const now = M.ctx.currentTime;
  cur.g.gain.cancelScheduledValues(now);
  cur.g.gain.setValueAtTime(cur.g.gain.value, now);
  cur.g.gain.linearRampToValueAtTime(0.0001, now + t);
  try { cur.src.stop(now + t + 0.05); } catch (e) { /* */ }
}
export function stopMusic(t) { M.want = null; fadeOut(M.cur, t ?? 0.8); M.cur = null; }
export function currentMusic() { return M.want; }

/** 징글 한 번(2~5초): 그동안 배경음악을 낮춤. stopBgm 이면 배경음악을 멈춤(게임 오버) */
export function playJingle(name, stopBgm) {
  if (!M.ctx) return;
  if (stopBgm) stopMusic(0.4);
  loadTrack(name).then((buf) => {
    const ctx = M.ctx, now = ctx.currentTime;
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf; g.gain.value = 1;
    src.connect(g); g.connect(M.out); src.start(now);
    if (M.cur && !stopBgm) {
      const cg = M.cur.g.gain;
      cg.cancelScheduledValues(now); cg.setValueAtTime(cg.value, now);
      cg.linearRampToValueAtTime(0.25, now + 0.08);
      cg.setValueAtTime(0.25, now + buf.duration - 0.6);
      cg.linearRampToValueAtTime(1, now + buf.duration + 0.4);
    }
  }).catch(() => {});
}

/** 미리 불러오기(게임 시작을 막지 않음) */
export function preloadMusic(names) { if (M.ctx) for (const n of names) loadTrack(n).catch(() => {}); }
export function musicSources() { return { ...M.source }; }

/** 디버그·검사용: 파일과 상관없이 내장 곡을 녹음해서 돌려줌 */
export function renderBuiltIn(name) { return renderScore(name, M.ctx); }
/** 디버그·검사용: 버퍼를 바로 한 번 재생 */
export function previewBuffer(buf) { const s = M.ctx.createBufferSource(); s.buffer = buf; s.connect(M.out); s.start(); return s; }

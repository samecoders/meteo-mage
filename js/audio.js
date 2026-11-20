// 효과음: Web Audio 합성(음원 파일 없음). 첫 터치 이후에만 재생. 동시 재생 최대 8개.
let ctx = null, master = null, noiseBuf = null;
let enabled = true, voices = 0, lastKill = 0, lastBolt = 0;
const MAX_VOICES = 8;

export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = enabled ? 0.55 : 0;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch (e) { ctx = null; }
}

export function setSound(on) {
  enabled = on;
  if (master) master.gain.value = on ? 0.55 : 0;
}

export function suspendAudio(s) {
  if (!ctx) return;
  if (s) ctx.suspend(); else if (enabled) ctx.resume();
}

function ok() { return ctx && enabled && ctx.state === 'running' && voices < MAX_VOICES; }

function track(node, dur) {
  voices++;
  node.onended = () => { voices--; };
  node.stop(ctx.currentTime + dur);
}

function env(g, t, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tone(type, f0, f1, dur, vol, delay) {
  if (!ok()) return;
  const t = ctx.currentTime + (delay || 0);
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, 0.005, vol, dur);
  o.connect(g); g.connect(master);
  o.start(t);
  track(o, (delay || 0) + dur + 0.05);
}

function noise(filterType, f0, f1, q, dur, vol, delay) {
  if (!ok()) return;
  const t = ctx.currentTime + (delay || 0);
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; s.loop = true;
  f.type = filterType; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  env(g, t, 0.01, vol, dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t);
  track(s, (delay || 0) + dur + 0.05);
}

export const sfx = {
  /** 폭발: 모양마다 음색이 다름. 죽은 몹 소리는 폭발 하나에 한 번, 수에 따라 크기·두께만 */
  explosion(skin, kills) {
    const S = skin.sound;
    const big = Math.min(1, Math.log10(1 + kills) / 4);
    tone(S.wave, S.base * 2.2, S.base * 0.5, 0.5 + big * 0.5, 0.5 + big * 0.3);
    noise('lowpass', S.cutoff, 120, S.noiseQ, 0.6 + big * 0.7, 0.6 + big * 0.35);
    if (kills > 0) noise('bandpass', 1400 - big * 900, 300, 1.2 + big * 2, 0.15 + big * 0.35, 0.25 + big * 0.45, 0.04);
  },
  launch() { tone('sine', 1800, 300, 1.0, 0.08); },
  dash() { noise('bandpass', 600, 2400, 1.5, 0.22, 0.35); },
  dashReady() { tone('square', 880, 1320, 0.08, 0.06); },
  manaFull() { tone('triangle', 660, 660, 0.12, 0.12); tone('triangle', 990, 990, 0.18, 0.12, 0.09); },
  deny() { tone('square', 140, 110, 0.12, 0.08); },
  levelUp() { [523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.12, 0.08, i * 0.07)); },
  buy() { tone('square', 988, 988, 0.06, 0.07); tone('square', 1319, 1319, 0.15, 0.07, 0.06); },
  shield() { noise('highpass', 3000, 6000, 0.7, 0.3, 0.3); tone('triangle', 1200, 300, 0.4, 0.15); },
  death() { tone('sawtooth', 400, 40, 1.0, 0.25); noise('lowpass', 800, 60, 1, 0.8, 0.3); },
  boss() { tone('sawtooth', 70, 50, 1.2, 0.25); tone('square', 105, 75, 1.2, 0.1, 0.1); },
  bossKill() { [392, 523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.15, 0.12, i * 0.06)); },
  click() { tone('square', 600, 600, 0.03, 0.05); },
  hurt() { tone('square', 220, 90, 0.18, 0.14); noise('lowpass', 1200, 200, 1, 0.15, 0.2); },
  charge() { tone('sawtooth', 90, 180, 0.35, 0.18); noise('lowpass', 400, 1200, 1, 0.4, 0.2); },
  summon() { tone('triangle', 300, 120, 0.5, 0.12); tone('triangle', 450, 180, 0.5, 0.08, 0.1); },
  fireball() { noise('bandpass', 300, 1600, 2, 0.35, 0.25); },
  /** 아이템 줍기: 크고 경쾌하게(등급이 높을수록 화려하게) */
  item(kind, rarity) {
    if (kind === 'chest') { [523, 784, 1047, 1568, 2093].forEach((f, i) => tone('square', f, f, 0.12, 0.12, i * 0.06)); return; }
    const notes = rarity === 'legend' ? [784, 988, 1175, 1568, 1976] : rarity === 'rare' ? [659, 880, 1109, 1319] : [784, 1047, 1319];
    notes.forEach((f, i) => tone('square', f, f, 0.09, 0.13, i * 0.05));
    tone('triangle', notes[0] / 2, notes[0], 0.25, 0.16);
  },
  heal() { tone('triangle', 880, 880, 0.07, 0.12); tone('triangle', 1320, 1320, 0.12, 0.12, 0.07); },
  learn() { [262, 392, 523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.18, 0.1, i * 0.09)); noise('highpass', 2000, 8000, 0.7, 1.2, 0.12, 0.1); },
  /** 킬 소리: 연속 콤보가 높을수록 음이 올라감(초당 최대 14번) */
  kill(chain) {
    const now = ctx ? ctx.currentTime : 0;
    if (now - lastKill < 0.07) return;
    lastKill = now;
    const f = 330 * Math.pow(2, Math.min(2.5, Math.log2(1 + chain) * 0.32));
    tone('square', f, f * 1.25, 0.05, 0.05);
  },
  bolt() {
    const now = ctx ? ctx.currentTime : 0;
    if (now - lastBolt < 0.12) return;
    lastBolt = now;
    tone('triangle', 1400, 700, 0.05, 0.025);
  },
  nearMiss() { tone('triangle', 1200, 1800, 0.15, 0.1); },
};

/** 미리보기용(상점): 모양 효과음 */
export function previewExplosion(skin) { sfx.explosion(skin, 200); }

// ------------------------------------------------------------ 무적의 별 전용 음악(짧은 반복 아르페지오)
let starTimer = 0, starStep = 0;
const STAR_NOTES = [523, 659, 784, 1047, 784, 659, 587, 740, 880, 1175, 880, 740];
export function starMusic(on) {
  if (on && !starTimer) {
    starStep = 0;
    starTimer = setInterval(() => {
      const f = STAR_NOTES[starStep++ % STAR_NOTES.length];
      tone('square', f, f, 0.09, 0.06);
      if (starStep % 2) tone('triangle', f / 2, f / 2, 0.12, 0.08);
    }, 105);
  } else if (!on && starTimer) { clearInterval(starTimer); starTimer = 0; }
}

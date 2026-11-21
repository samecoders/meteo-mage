// 한 판의 흐름: 큰 사건(포위 무리·늑대 무리 습격·골렘 행진·보스)의 시각표. CONFIG.events 의 표로 관리.
// - 사건 시작 warn(2초) 전에 상단 경고 + 음악 전환
// - 5분 전에는 큰 사건끼리 최소 minGap(20초) 간격(겹치면 뒤 사건을 미룸)
// - 모두 틱 안에서, 시드 난수로(모두에게 같은 규칙)
import { CONFIG } from './config.js';
import { spawnRing, spawnBoss, spawnPack } from './sim/spawn.js';

const E = CONFIG.events;
// 우선순위 높은 순(겹치면 낮은 쪽이 비켜 감)
const KINDS = ['boss', 'wolfRaid', 'golemMarch', 'ring'];
const st = { next: {}, warned: {}, angle: {}, reserved: -1e9, hint: false };
export const eventState = st;

/** 사건 정의(시작 시각·주기). ring 은 난이도 프리셋(spawn.ring) 값 */
function def(kind) {
  if (kind === 'ring') { const R = CONFIG.spawn.ring; return R && R.on ? { first: R.from, everyMin: R.everyMin, everyMax: R.everyMax } : null; }
  if (kind === 'boss') return { first: E.boss.first, everyMin: E.boss.every, everyMax: E.boss.every };
  return E[kind];
}

export function resetEvents(G) {
  st.reserved = -1e9; st.hint = false;
  for (const k of KINDS) { const d = def(k); st.next[k] = d ? d.first : 1e9; st.warned[k] = false; }
}

function fire(G, kind) {
  const minutes = G.time / 60;
  switch (kind) {
    case 'ring': spawnRing(G, st.angle.ring); break;
    case 'boss': spawnBoss(G); break;
    case 'wolfRaid': case 'golemMarch': {
      const d = E[kind];
      const n = Math.min(d.countMax, Math.round(d.count + d.countPerMin * Math.max(0, minutes - d.first / 60)));
      const made = spawnPack(G, d.mob, n, st.angle[kind], d.formation);
      G.events.push({ type: 'raid', kind, n: made });
      break;
    }
  }
}

/** 습격 음악: 경고 순간부터 시작해 raidMusic 초 동안(음악 우선순위는 main.js) */
function raidMusic(G, kind) {
  const m = { ring: 'siege', wolfRaid: 'wolf', golemMarch: 'golem' }[kind];
  if (!m) return;
  G.raidKind = m; G.raidUntil = G.time + E.warn + CONFIG.audio.raidMusic;
}

export function updateEvents(G) {
  if (G.bench) return;
  const t = G.time;
  // 1:00 첫 보물 나침반 안내(그때 보물이 있으면)
  if (!st.hint && t >= E.compassHint) { st.hint = true; G.events.push({ type: 'compassHint' }); }
  for (const k of KINDS) {
    const d = def(k);
    if (!d) continue;
    if (!st.warned[k] && t >= st.next[k] - E.warn) {
      // 5분 전: 이미 경고한 사건이나 우선순위가 더 높은 예정 사건과 20초 안이면 뒤로 미룸
      if (st.next[k] < E.gapUntil) {
        let block = st.next[k] - st.reserved < E.minGap ? st.reserved : -1e9;
        for (const h of KINDS) {
          if (h === k) break;   // 나보다 높은 순위만
          if (def(h) && Math.abs(st.next[h] - st.next[k]) < E.minGap) block = Math.max(block, st.next[h]);
        }
        if (block > -1e9) { st.next[k] = block + E.minGap; continue; }
      }
      st.warned[k] = true;
      st.reserved = Math.max(st.reserved, st.next[k]);
      st.angle[k] = G.rng() * Math.PI * 2;
      raidMusic(G, k);
      G.events.push({ type: 'eventWarn', kind: k, angle: st.angle[k] });
    }
    if (st.warned[k] && t >= st.next[k]) {
      st.warned[k] = false;
      fire(G, k);
      st.next[k] = t + d.everyMin + G.rng() * (d.everyMax - d.everyMin);
    }
  }
}

/** 디버그: 사건 바로 일으키기(2초 경고 후) */
export function triggerEvent(G, kind) { st.next[kind] = G.time + E.warn; st.warned[kind] = false; st.reserved = -1e9; }

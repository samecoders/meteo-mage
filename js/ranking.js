// 랭킹(Supabase REST/RPC, 라이브러리 없이 fetch). 서버 함수 3개만 부른다.
//   submit_score(p_nickname, p_country, p_kills, p_survive_sec, p_level, p_max_combo, p_meteor_skin, p_device_id, p_hero, p_season)
//     → {ok, reason, rank_all, rank_week, rank_today}
//   get_top(p_period, p_country, p_season, p_limit) → [{rank, nickname, country, kills, level, survive_sec, meteor_skin, hero, created_at}]
//     (같은 사람의 여러 기록이 나옴)
//   get_my_rank(p_device_id, p_period, p_country, p_season) → {kills, nickname, hero, rank, total, my_records}
// 키가 비어 있으면 랭킹 끔(내 기기 최고 기록만). 게임 도중에는 서버 요청을 하지 않는다(게임오버·랭킹 화면·시작 화면에서만).
import { CONFIG } from './config.js';
import { save } from './save.js';

const R = CONFIG.ranking;
const PENDING_KEY = 'meteor_mage_pending_scores';   // 못 보낸 기록(최대 5개)
const OLD_PENDING_KEY = 'meteor_mage_pending_score';
const PENDING_MAX = 5, RETRY_MS = 30000;
/** 서버에 보내는 캐릭터 이름(4단계에서 캐릭터 3종으로 바뀔 때까지 모두 불꽃 법사) */
export function serverHero(hero) { const id = CONFIG.heroLegacy[hero] || hero; return CONFIG.characters[id] ? id : 'mage'; }
export function rankingEnabled() { return !!(R.supabaseUrl && R.supabaseKey); }

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

async function rpc(name, body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), R.timeoutMs);   // 5초 타임아웃
  try {
    const res = await fetch(`${R.supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
      method: 'POST',
      // 새 공개 키(sb_publishable_)는 JWT 가 아니므로 apikey 헤더에만 넣는다(Authorization: Bearer 에 넣지 않음)
      headers: { apikey: R.supabaseKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    const txt = await res.text();
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch (e) { /* 본문이 JSON 아님 */ }
    if (!res.ok) throw new HttpError(res.status, (data && data.message) || res.statusText);
    return data;
  } finally { clearTimeout(timer); }
}

const isCountry = (c) => typeof c === 'string' && /^[A-Z]{2}$/.test(c);

// ------------------------------------------------------------ 기록 제출
function readPending() {
  try {
    let list = JSON.parse(localStorage.getItem(PENDING_KEY)) || [];
    const old = JSON.parse(localStorage.getItem(OLD_PENDING_KEY));   // 예전 형식(하나) 옮기기
    if (old) { list.push(old); localStorage.removeItem(OLD_PENDING_KEY); }
    return Array.isArray(list) ? list.filter((r) => r && r.season === R.season) : [];
  } catch (e) { return []; }
}
function writePending(list) { try { if (list.length) localStorage.setItem(PENDING_KEY, JSON.stringify(list)); else localStorage.removeItem(PENDING_KEY); } catch (e) { /* 저장 불가 */ } }
/** 보관: 최대 5개. 넘치면 킬 수가 가장 적은 것부터 버림 */
function keepPending(rec) {
  const list = readPending();
  list.push(rec);
  list.sort((a, b) => b.kills - a.kills);
  writePending(list.slice(0, PENDING_MAX));
}

function payload(rec) {
  return {
    p_nickname: rec.nickname, p_country: rec.country, p_kills: rec.kills, p_survive_sec: Math.floor(rec.surviveSec),
    p_level: rec.level, p_max_combo: rec.maxCombo, p_meteor_skin: rec.skin, p_device_id: save.data.deviceId,
    p_hero: serverHero(rec.hero), p_season: rec.season,
  };
}

/** 서버 한 번 호출 → [결과, 응답]. 결과: 'ok' | 'too_fast' | 'impossible' | 'bad_nickname' | 'retry'(네트워크·서버 문제: 보관) */
async function send(rec) {
  try {
    const r = await rpc('submit_score', payload(rec));
    if (r && r.ok === false) return [['too_fast', 'impossible', 'bad_nickname'].includes(r.reason) ? r.reason : 'impossible', r];
    return ['ok', r || {}];
  } catch (e) { return ['retry', null]; }
}

/**
 * 게임오버 때 제출. 반환: { ok, reason?, queued?, rank?, notConfigured? }
 *  - rank: 이번 주 순위(get_my_rank, 실패하면 없음)
 *  - queued: 오프라인·실패라서 보관함(다음 실행 때 다시 보냄)
 */
export async function submitScore(rec) {
  if (CONFIG.difficulty !== R.rankedDifficulty || !rankingEnabled()) return { ok: false, notConfigured: true };
  const full = { ...rec, season: R.season, country: isCountry(rec.country) ? rec.country : 'XX' };
  if (!isCountry(full.country)) return { ok: false, reason: 'bad_country' };
  const [out, r] = await send(full);
  if (out === 'retry') { keepPending(full); return { ok: false, queued: true }; }
  if (out !== 'ok') return { ok: false, reason: out };
  cache.clear();   // 새 기록 → 랭킹 화면 캐시 비움
  const num = (v) => (v == null ? 0 : Number(v));
  return { ok: true, today: num(r.rank_today), week: num(r.rank_week), all: num(r.rank_all) };
}

/** 보관해 둔 기록 하나 보내기. 게임 중에는 부르지 않는다 */
export async function flushPending() {
  const list = readPending();
  if (!list.length || !rankingEnabled()) return false;
  const [out] = await send(list[0]);
  if (out === 'retry') return false;
  writePending(readPending().filter((r) => r.date !== list[0].date));   // 승인·거부 모두 끝(거부된 기록은 다시 보내지 않음)
  if (out === 'ok') cache.clear();
  return out === 'ok';
}
export function hasPending() { return readPending().length > 0; }
let retryTimer = 0;
/** 시작할 때 한 번: 30초마다 보관 기록 하나씩 보냄(idle() 이 true 일 때만 — 게임 중 제외) */
export function startPendingLoop(idle) {
  if (retryTimer) return;
  const tickFn = () => { if (idle() && hasPending()) flushPending().catch(() => {}); };
  setTimeout(tickFn, 3000);
  retryTimer = setInterval(tickFn, RETRY_MS);
}

// ------------------------------------------------------------ 랭킹 화면
const PERIOD = { today: 'today', week: 'week', all: 'all', country: 'all' };
const cache = new Map();   // key → { t, data }

/** 내 순위: period 'today'|'week'|'all', country null 또는 두 글자 */
export async function myRank(period, country) {
  return rpc('get_my_rank', { p_device_id: save.data.deviceId, p_period: period, p_country: country, p_season: R.season });
}

/**
 * 탭(today/week/all/country)의 상위 목록 + 내 순위. 같은 탭은 cacheSec 동안 캐시.
 * 반환: { rows:[{nickname,country,kills,meteor_skin,hero,mine}], me:{rank,kills}|null, offline }
 * 키가 없거나 실패하면 내 기기 최고 기록 하나(offline: true)
 */
export async function fetchTop(scope, country, limit = 10) {
  if (!rankingEnabled()) return localTop();
  const period = PERIOD[scope] || 'all';
  const cc = scope === 'country' ? (isCountry(country) ? country : null) : null;
  if (scope === 'country' && !cc) return { rows: [], me: null, offline: false };
  const key = `${period}|${cc}|${R.season}|${limit}`, hit = cache.get(key);
  if (hit && Date.now() - hit.t < R.cacheSec * 1000) return hit.data;
  try {
    const [rows, me] = await Promise.all([
      rpc('get_top', { p_period: period, p_country: cc, p_season: R.season, p_limit: limit }),
      myRank(period, cc).catch(() => null),
    ]);
    const n = (v) => (v == null ? 0 : Number(v));
    const data = {
      rows: (Array.isArray(rows) ? rows : []).map((r, i) => ({
        rank: n(r.rank) || i + 1, nickname: String(r.nickname ?? ''), country: String(r.country ?? ''), kills: n(r.kills), level: n(r.level),
        meteor_skin: String(r.meteor_skin ?? 'fire'), hero: String(r.hero ?? 'mage'), mine: false,
      })),
      me: me && me.rank ? { rank: n(me.rank), kills: n(me.kills), total: n(me.total), records: n(me.my_records), nickname: String(me.nickname ?? '') } : null,
      total: me ? n(me.total) : 0,
      offline: false,
    };
    // 내 최고 기록이 10위 안이면 그 줄 표시(순위로 찾음)
    if (data.me) for (const r of data.rows) if (r.rank === data.me.rank && r.kills === data.me.kills) r.mine = true;
    cache.set(key, { t: Date.now(), data });
    return data;
  } catch (e) {
    return localTop();
  }
}

/** 캐시에 있는 목록만(요청 없이). 없으면 null — 결과 화면 '이번 주 10위까지' 용 */
export function peekTop(scope, country, limit = 10) {
  const period = PERIOD[scope] || 'all', cc = scope === 'country' ? country : null;
  const hit = cache.get(`${period}|${cc}|${R.season}|${limit}`);
  return hit && Date.now() - hit.t < R.cacheSec * 1000 * 20 ? hit.data : null;   // 결과 화면용은 10분까지
}

/** 랭킹을 못 쓸 때: 이번 시즌 내 기기 최고 기록 하나 */
function localTop() {
  const s = save.data.settings, b = save.data.best;
  const ok = b && (b.season || 1) === R.season;
  const rows = ok ? [{ rank: 1, nickname: s.nickname || '—', country: s.country, kills: b.kills, level: b.level, meteor_skin: b.skin, hero: b.hero || 'mage', mine: true }] : [];
  return { rows, me: null, offline: true };
}

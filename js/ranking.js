// 랭킹(Supabase REST/RPC, 라이브러리 없이 fetch). 서버 함수 3개만 부른다.
//   submit_score(p_nickname, p_country, p_kills, p_survive_sec, p_level, p_max_combo, p_meteor_skin, p_device_id, p_season) → {ok, reason}
//   get_top(p_period, p_country, p_season, p_limit) → 배열
//   get_my_rank(p_device_id, p_period, p_country, p_season) → {kills, rank}
// 키가 비어 있으면 랭킹 끔(내 기기 최고 기록만). 게임 도중에는 서버 요청을 하지 않는다(게임오버·랭킹 화면·시작 화면에서만).
import { CONFIG } from './config.js';
import { save } from './save.js';

const R = CONFIG.ranking;
const PENDING_KEY = 'meteor_mage_pending_score';
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
function readPending() { try { return JSON.parse(localStorage.getItem(PENDING_KEY)); } catch (e) { return null; } }
function writePending(rec) { try { if (rec) localStorage.setItem(PENDING_KEY, JSON.stringify(rec)); else localStorage.removeItem(PENDING_KEY); } catch (e) { /* 저장 불가 */ } }
/** 보관은 최고 기록 하나만(킬 수 기준) */
function keepPending(rec) {
  const old = readPending();
  if (!old || old.season !== R.season || rec.kills >= old.kills) writePending(rec);
}

function payload(rec) {
  return {
    p_nickname: rec.nickname, p_country: rec.country, p_kills: rec.kills, p_survive_sec: Math.floor(rec.surviveSec),
    p_level: rec.level, p_max_combo: rec.maxCombo, p_meteor_skin: rec.skin, p_device_id: save.data.deviceId, p_season: rec.season,
  };
}

/** 서버 한 번 호출 → 'ok' | 'too_fast' | 'impossible' | 'bad_nickname' | 'retry'(네트워크·서버 문제: 보관) */
async function send(rec) {
  try {
    const r = await rpc('submit_score', payload(rec));
    if (r && r.ok === false) return ['too_fast', 'impossible', 'bad_nickname'].includes(r.reason) ? r.reason : 'impossible';
    return 'ok';
  } catch (e) { return 'retry'; }
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
  const out = await send(full);
  if (out === 'retry') { keepPending(full); return { ok: false, queued: true }; }
  if (out !== 'ok') return { ok: false, reason: out };
  cache.clear();   // 새 기록 → 랭킹 화면 캐시 비움
  const me = await myRank('week', null).catch(() => null);
  return { ok: true, rank: me && me.rank ? Number(me.rank) : 0, period: 'week' };
}

/** 보관해 둔 기록 다시 보내기(다음 실행 때 한 번). 게임 중에는 부르지 않는다 */
export async function flushPending() {
  const rec = readPending();
  if (!rec || !rankingEnabled()) return false;
  if (rec.season !== R.season) { writePending(null); return false; }
  const out = await send(rec);
  if (out !== 'retry') { writePending(null); if (out === 'ok') cache.clear(); }   // 승인·거부 모두 끝(거부된 기록은 다시 보내지 않음)
  return out === 'ok';
}
export function hasPending() { return !!readPending(); }

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
export async function fetchTop(scope, country) {
  if (!rankingEnabled()) return localTop();
  const period = PERIOD[scope] || 'all';
  const cc = scope === 'country' ? (isCountry(country) ? country : null) : null;
  if (scope === 'country' && !cc) return { rows: [], me: null, offline: false };
  const key = `${period}|${cc}|${R.season}`, hit = cache.get(key);
  if (hit && Date.now() - hit.t < R.cacheSec * 1000) return hit.data;
  try {
    const [rows, me] = await Promise.all([
      rpc('get_top', { p_period: period, p_country: cc, p_season: R.season, p_limit: 100 }),
      myRank(period, cc).catch(() => null),
    ]);
    const id = save.data.deviceId;
    const data = {
      rows: (Array.isArray(rows) ? rows : []).map((r) => ({
        nickname: String(r.nickname ?? ''), country: r.country, kills: Number(r.kills), meteor_skin: r.meteor_skin, hero: r.hero || 'mage',
        mine: r.is_mine === true || r.device_id === id,
      })),
      me: me && me.rank ? { rank: Number(me.rank), kills: Number(me.kills) } : null,
      offline: false,
    };
    cache.set(key, { t: Date.now(), data });
    return data;
  } catch (e) {
    return localTop();
  }
}

/** 랭킹을 못 쓸 때: 이번 시즌 내 기기 최고 기록 하나 */
function localTop() {
  const s = save.data.settings, b = save.data.best;
  const ok = b && (b.season || 1) === R.season;
  const rows = ok ? [{ nickname: s.nickname || '—', country: s.country, kills: b.kills, meteor_skin: b.skin, hero: b.hero || 'mage', mine: true }] : [];
  return { rows, me: null, offline: true };
}

// 랭킹: submitScore() 와 fetchTop() 두 함수만 바꾸면 다른 백엔드로 교체 가능.
// 기본 백엔드는 Supabase(REST/RPC, 라이브러리 없이 fetch). 설정이 없거나 오프라인이면 내 기기 기록만.
import { CONFIG } from './config.js';
import { save } from './save.js';

const R = CONFIG.ranking;
export function rankingEnabled() { return !!(R.supabaseUrl && R.supabaseAnonKey) && navigator.onLine !== false; }

async function rpc(name, body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), R.timeoutMs);
  try {
    const res = await fetch(`${R.supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: R.supabaseAnonKey,
        Authorization: `Bearer ${R.supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    const txt = await res.text();
    const data = txt ? JSON.parse(txt) : null;
    if (!res.ok) { const err = new Error((data && data.message) || res.statusText); err.status = res.status; throw err; }
    return data;
  } finally { clearTimeout(timer); }
}

/**
 * 기록 제출. 반환: { ok, rank?, offline?, rejected?, error? }
 * 서버(SQL 함수 submit_score)에서 불가능한 기록·분당 제출 횟수·닉네임을 검사한다.
 */
export async function submitScore(rec) {
  if (!rankingEnabled()) return { ok: false, offline: true, notConfigured: !(R.supabaseUrl && R.supabaseAnonKey) };
  try {
    const r = await rpc('submit_score', {
      p_nickname: rec.nickname,
      p_country: rec.country,
      p_kills: rec.kills,
      p_survive_sec: Math.floor(rec.surviveSec),
      p_level: rec.level,
      p_max_combo: rec.maxCombo,
      p_meteor_skin: rec.skin,
      p_hero: rec.hero || 'mage',
      p_device_id: save.data.deviceId,
      p_season: R.season,
    });
    return { ok: true, rank: r && r.rank };
  } catch (e) {
    if (e.status === 400 || e.status === 403 || e.status === 409) return { ok: false, rejected: true, error: e.message };
    return { ok: false, offline: true, error: e.message };
  }
}

/**
 * 상위 100명 + 내 순위. scope: 'today' | 'week' | 'all' | 'country'
 * 반환: { ok, rows:[{nickname,country,kills,meteor_skin,mine}], me:{rank,kills}|null, offline }
 */
export async function fetchTop(scope, country) {
  if (!rankingEnabled()) return localTop();
  try {
    const [rows, me] = await Promise.all([
      rpc('get_top', { p_scope: scope, p_country: country || '', p_device_id: save.data.deviceId, p_season: R.season }),
      rpc('get_my_rank', { p_scope: scope, p_country: country || '', p_device_id: save.data.deviceId, p_season: R.season }),
    ]);
    return {
      ok: true,
      rows: (rows || []).map((r) => ({ nickname: r.nickname, country: r.country, kills: Number(r.kills), meteor_skin: r.meteor_skin, hero: r.hero || 'mage', mine: r.is_mine === true })),
      me: me && me.rank ? { rank: me.rank, kills: Number(me.kills) } : null,
      offline: false,
    };
  } catch (e) {
    return localTop();
  }
}

function localTop() {
  const s = save.data.settings;
  const rows = save.data.records.filter((r) => (r.season || 1) === R.season).map((r) => ({ nickname: s.nickname || '—', country: s.country, kills: r.kills, meteor_skin: r.skin, hero: r.hero || 'mage', mine: true }));
  return { ok: true, rows, me: rows.length ? { rank: 1, kills: rows[0].kills } : null, offline: true };
}

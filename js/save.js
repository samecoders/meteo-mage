import { CONFIG } from './config.js';
// localStorage 한 키에 버전 번호와 함께 저장. 값이 깨져 있으면 초기값으로 복구.
const KEY = 'meteor_mage_save';
const VERSION = 1;
const SEASON = CONFIG.ranking.season;   // 규칙이 바뀌면 올림. 이전 시즌 기록은 랭킹·최고 기록에 섞이지 않음

function uuid() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function defaults() {
  return {
    v: VERSION,
    deviceId: uuid(),
    bank: 0,                 // 보관 골드
    best: null,              // 최고 기록 {kills, surviveSec, level, maxCombo, skin, date}
    records: [],             // 내 기기 기록 상위 20개
    skinsOwned: ['fire'],
    skinEquipped: 'fire',
    heroesOwned: ['mage'],        // 해금한 캐릭터
    heroEquipped: 'mage',         // 마지막으로 고른 캐릭터
    tutorialDone: false,
    settings: {
      lang: '',
      sound: true,
      vibrate: true,
      flickDash: true,       // 손가락을 튕기듯 쓸면 대시
      escapeHint: true,      // 내 메테오 반경 안에서 탈출 방향 화살표
      musicVolume: CONFIG.audio.musicVolume,
      sfxVolume: CONFIG.audio.sfxVolume,
      quality: 'auto',       // auto | high | mid | low
      nickname: '',
      country: '',
    },
  };
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v) => typeof v === 'string';

function validRecord(r) {
  return r && isNum(r.kills) && r.kills >= 0 && isNum(r.surviveSec) && isNum(r.level) && isNum(r.maxCombo);
}

function sanitize(raw) {
  const d = defaults();
  if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return d;
  if (isStr(raw.deviceId) && raw.deviceId.length >= 8) d.deviceId = raw.deviceId;
  if (isNum(raw.bank) && raw.bank >= 0) d.bank = Math.floor(raw.bank);
  if (validRecord(raw.best)) d.best = raw.best;
  if (Array.isArray(raw.records)) d.records = raw.records.filter(validRecord).slice(0, 20);
  if (Array.isArray(raw.skinsOwned)) {
    const s = raw.skinsOwned.filter(isStr);
    if (!s.includes('fire')) s.unshift('fire');
    d.skinsOwned = s;
  }
  if (isStr(raw.skinEquipped) && d.skinsOwned.includes(raw.skinEquipped)) d.skinEquipped = raw.skinEquipped;
  // 예전 캐릭터 ID 는 새 ID 로 옮김(fire_mage→mage, frost_witch→얼음 마녀, earth_sage→강령술사) — 이미 해금한 것은 가격이 올라도 유지
  const mapHero = (x) => (CONFIG.heroLegacy[x] || x);
  if (Array.isArray(raw.heroesOwned)) {
    const h = [];
    for (const x of raw.heroesOwned) { const id = isStr(x) ? mapHero(x) : null; if (id && CONFIG.characters[id] && !h.includes(id)) h.push(id); }
    if (!h.includes('mage')) h.unshift('mage');
    d.heroesOwned = h;
  }
  if (isStr(raw.heroEquipped) && d.heroesOwned.includes(mapHero(raw.heroEquipped))) d.heroEquipped = mapHero(raw.heroEquipped);
  d.tutorialDone = raw.tutorialDone === true;
  const s = raw.settings || {};
  if (isStr(s.lang)) d.settings.lang = s.lang;
  if (typeof s.sound === 'boolean') d.settings.sound = s.sound;
  if (typeof s.vibrate === 'boolean') d.settings.vibrate = s.vibrate;
  if (typeof s.flickDash === 'boolean') d.settings.flickDash = s.flickDash;
  if (typeof s.escapeHint === 'boolean') d.settings.escapeHint = s.escapeHint;
  if (isNum(s.musicVolume)) d.settings.musicVolume = Math.max(0, Math.min(1, s.musicVolume));
  if (isNum(s.sfxVolume)) d.settings.sfxVolume = Math.max(0, Math.min(1, s.sfxVolume));
  if (['auto', 'high', 'mid', 'low'].includes(s.quality)) d.settings.quality = s.quality;
  if (isStr(s.nickname)) d.settings.nickname = s.nickname.slice(0, 12);
  if (isStr(s.country) && /^[A-Z]{2}$/.test(s.country)) d.settings.country = s.country;
  return d;
}

export const save = {
  data: defaults(),
  load() {
    try {
      const txt = localStorage.getItem(KEY);
      this.data = sanitize(txt ? JSON.parse(txt) : null);
    } catch (e) {
      this.data = defaults();
    }
    this.write();
    return this.data;
  },
  write() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* 저장 불가(사생활 모드 등) */ }
  },
  /** 판 종료 기록 추가. 새 최고 기록이면 true */
  addRecord(rec) {
    const d = this.data;
    rec.season = SEASON;
    d.records.push(rec);
    d.records.sort((a, b) => b.kills - a.kills || a.date - b.date);
    d.records.length = Math.min(d.records.length, 20);
    let isBest = false;
    if (!d.best || d.best.season !== SEASON || rec.kills > d.best.kills) { d.best = rec; isBest = true; }
    this.write();
    return isBest;
  },
};

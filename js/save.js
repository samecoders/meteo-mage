// localStorage 한 키에 버전 번호와 함께 저장. 값이 깨져 있으면 초기값으로 복구.
const KEY = 'meteor_mage_save';
const VERSION = 1;

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
    heroesOwned: ['mage'],
    heroEquipped: 'mage',
    tutorialDone: false,
    settings: {
      lang: '',
      sound: true,
      vibrate: true,
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
  if (Array.isArray(raw.heroesOwned)) {
    const h = raw.heroesOwned.filter(isStr);
    if (!h.includes('mage')) h.unshift('mage');
    d.heroesOwned = h;
  }
  if (isStr(raw.heroEquipped) && d.heroesOwned.includes(raw.heroEquipped)) d.heroEquipped = raw.heroEquipped;
  d.tutorialDone = raw.tutorialDone === true;
  const s = raw.settings || {};
  if (isStr(s.lang)) d.settings.lang = s.lang;
  if (typeof s.sound === 'boolean') d.settings.sound = s.sound;
  if (typeof s.vibrate === 'boolean') d.settings.vibrate = s.vibrate;
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
    d.records.push(rec);
    d.records.sort((a, b) => b.kills - a.kills || a.date - b.date);
    d.records.length = Math.min(d.records.length, 20);
    let isBest = false;
    if (!d.best || rec.kills > d.best.kills) { d.best = rec; isBest = true; }
    this.write();
    return isBest;
  },
};

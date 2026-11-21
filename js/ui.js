// HTML/CSS 오버레이 UI. 모든 문구는 i18n 키로만. HUD 숫자는 초당 10번만 갱신.
import { CONFIG, HUD_BOTTOM_FORBIDDEN } from './config.js';
import { save } from './save.js';
import { t, fmt, fmtCompact, getLanguages, getLang, setLanguage, onLangChange, fitAll } from './i18n.js';
import { SKINS, skinPrice, skinById, palCss } from './skins.js';
import { shieldPrice, dashPrice, canBuyShield, canBuyDash, ownsSkin, buySkin, equipSkin, HEROES, heroPrice, ownsHero, buyHero, equipHero } from './shop.js';
import { fetchTop, rankingEnabled } from './ranking.js';
import { sfx, previewExplosion, unlockAudio } from './audio.js';
import { M, B } from './sim/mobs.js';
import { expNeed } from './upgrade.js';
import { items as fieldItems, KINDS, RARITY } from './items.js';
import { dashCooldown } from './dash.js';

const $ = (id) => document.getElementById(id);
let H = null;
let current = null;
let settingsBack = 'title', nickBack = 'title';
const skinIcons = {};
const heroIcons = {};
let UIIMG = {};
const heroSprite = (id) => (id === 'mage' ? 'mage' : 'hero_' + id);

const SCREENS = { title: 'scrTitle', level: 'scrLevel', pause: 'scrPause', over: 'scrOver', rank: 'scrRank', shop: 'scrShop', settings: 'scrSettings', nick: 'scrNick' };

// ------------------------------------------------------------ 작은 픽셀 그리기 도구 (UI 캔버스용)
function pctx(cv) { const c = cv.getContext('2d'); c.imageSmoothingEnabled = false; return c; }
function dot(c, x, y, col) { c.fillStyle = col; c.fillRect(x | 0, y | 0, 1, 1); }
function disc(c, cx, cy, r, col) {
  c.fillStyle = col;
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    if (dx * dx + dy * dy <= r * r) c.fillRect(x, y, 1, 1);
  }
}
const P = palCss;

// ------------------------------------------------------------ 국가
const COUNTRIES = ('AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ ' +
  'DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP ' +
  'KE KG KH KI KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP ' +
  'NR NZ OM PA PE PG PH PK PL PR PS PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT ' +
  'TV TW TZ UA UG US UY UZ VA VC VE VN VU WS YE ZA ZM ZW').split(' ');
const LANG_COUNTRY = { en: 'US', ko: 'KR', ja: 'JP', zh: 'CN', es: 'ES', pt: 'BR', fr: 'FR', de: 'DE', ru: 'RU', id: 'ID', tr: 'TR', it: 'IT', vi: 'VN', th: 'TH' };

export function flag(cc) {
  if (!cc || !/^[A-Z]{2}$/.test(cc)) return '🏳️';
  return String.fromCodePoint(0x1F1E6 + cc.charCodeAt(0) - 65, 0x1F1E6 + cc.charCodeAt(1) - 65);
}
function guessCountry() {
  const langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en-US'];
  for (const l of langs) { const m = /-([A-Za-z]{2})\b/.exec(l); if (m && COUNTRIES.includes(m[1].toUpperCase())) return m[1].toUpperCase(); }
  const base = String(langs[0]).split('-')[0].toLowerCase();
  return LANG_COUNTRY[base] || 'US';
}
let regionNames = null;
function countryName(cc) {
  try { if (!regionNames || regionNames._lang !== getLang()) { regionNames = new Intl.DisplayNames([getLang()], { type: 'region' }); regionNames._lang = getLang(); } return regionNames.of(cc) || cc; }
  catch (e) { return cc; }
}
function fillCountrySelect(sel, value) {
  const items = COUNTRIES.map((c) => [c, countryName(c)]).sort((a, b) => a[1].localeCompare(b[1], getLang()));
  sel.innerHTML = '';
  for (const [c, n] of items) { const o = document.createElement('option'); o.value = c; o.textContent = `${flag(c)} ${n}`; sel.appendChild(o); }
  sel.value = value;
}

// ------------------------------------------------------------ 화면 전환
export function showScreen(name) {
  for (const k in SCREENS) $(SCREENS[k]).classList.toggle('hidden', k !== name);
  current = name;
  if (name === 'title') refreshTitle();
  if (name === 'shop') openShop(); else stopPreview();
  if (name === 'settings') refreshSettings();
  if (name === 'nick') openNick();
  if (name === 'rank') openRank(rankScope);
  requestAnimationFrame(() => fitAll(name ? $(SCREENS[name]) : document));
}
/** 안드로이드 뒤로 버튼: 화면마다 '뒤로'에 해당하는 버튼을 누름. 처리 못 하면(타이틀) false → 앱 종료 */
const BACK_BTN = { rank: 'rBack', shop: 'sBack', settings: 'stBack', pause: 'pResume', over: 'oTitle' };
export function handleBack() {
  if (current === 'title') return false;
  if (current === 'level' || current === 'nick') return true;      // 카드 선택·이름 정하기는 뒤로로 건너뛰지 않음
  const id = BACK_BTN[current];
  if (id) $(id).click();
  return true;
}
export function screenName() { return current; }

export function showHud(on) {
  $('hud').classList.toggle('hidden', !on);
  if (on) { lastHud = {}; heartsKey = ''; effKey = ''; requestAnimationFrame(() => { fitAll($('hud')); checkHudLayout(); }); }
  else hideLearn();
}

// ------------------------------------------------------------ 배치 검사: 아래쪽 40% 에는 메테오와 대시 버튼만
/**
 * HUD 안의 보이는 요소 중 화면 아래쪽 HUD_BOTTOM_FORBIDDEN(40%) 에 걸치는 것이 있으면 경고(디버그면 분홍 테두리).
 * 허용: CONFIG.ui.bottomAllowed. 화면 전체를 덮는 겹 레이어(팝업·화살표 컨테이너)는 검사 대상이 아님.
 * 버튼은 최소 48×48 CSS 픽셀인지도 본다. 반환: 문제 목록
 */
export function checkHudLayout() {
  const hud = $('hud');
  if (!hud || hud.classList.contains('hidden')) return [];
  const H0 = window.innerHeight, W0 = window.innerWidth, limit = H0 * (1 - HUD_BOTTOM_FORBIDDEN);
  const allowed = new Set(CONFIG.ui.bottomAllowed);
  const bad = [];
  for (const el of hud.querySelectorAll('*')) {
    if (el.closest('#hudBottom') || el.closest('#bossArrows') || el.closest('#popups')) continue;
    el.classList.remove('layoutBad');
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || el.offsetParent === null) continue;
    if (r.height > H0 * 0.9 && r.width > W0 * 0.9) continue;      // 겹 레이어
    if (allowed.has(el.id)) continue;
    if (r.bottom > limit + 1) bad.push({ el: el.id || el.className || el.tagName, why: 'bottom' });
    if (el.tagName === 'BUTTON' && !el.closest('#dbgItems') && (r.width < CONFIG.ui.minButton - 0.5 || r.height < CONFIG.ui.minButton - 0.5)) bad.push({ el: el.id || el.tagName, why: 'small' });
  }
  // 허용된 두 요소는 아래쪽에 있어야 함(위치 변화 확인용)
  for (const id of ['mana', 'btnDash']) { const r = $(id).getBoundingClientRect(); if (r.height && r.top < limit - 1) bad.push({ el: id, why: 'moved' }); }
  if (bad.length) {
    console.warn('HUD 배치 규칙 위반(아래쪽 ' + Math.round(HUD_BOTTOM_FORBIDDEN * 100) + '%):', bad);
    if (H && H.debug) for (const b of bad) { const e = document.getElementById(b.el); if (e) e.classList.add('layoutBad'); }
  }
  if (H && H.debug) {
    let z = $('forbidZone');
    if (!z) { z = document.createElement('div'); z.id = 'forbidZone'; document.body.appendChild(z); }
    z.style.height = (HUD_BOTTOM_FORBIDDEN * 100) + '%';
  }
  return bad;
}
/** 알림 y 좌표(CSS px)가 위 1/3 안인지 */
function inNotifyZone(y) { return y <= window.innerHeight * CONFIG.ui.notifyMaxY; }


export function fatal(msg) {
  const f = $('fatal');
  f.textContent = msg;
  f.classList.remove('hidden');
}
export function setDebug(txt) { const d = $('debug'); d.classList.remove('hidden'); d.textContent = txt; }

// ------------------------------------------------------------ 초기화
export function initUI(h) {
  H = h;
  // 타이틀 배경 (픽셀 그대로 확대)
  const tb = $('titleBg');
  tb.width = h.assets.titleBg.width; tb.height = h.assets.titleBg.height;
  pctx(tb).drawImage(h.assets.titleBg, 0, 0);
  // 모양 아이콘
  for (const sk of SKINS) skinIcons[sk.id] = h.assets.sprites[sk.sprite].toDataURL();
  for (const id of HEROES) heroIcons[id] = h.assets.sprites[heroSprite(id)].toDataURL();
  UIIMG = h.assets.ui || {};
  applyUiSkin();
  // 파비콘(아이콘 이미지가 없을 때도)
  try {
    const ic = document.createElement('canvas'); ic.width = 64; ic.height = 64;
    const c = pctx(ic); c.drawImage(h.assets.icon, 0, 0, 64, 64);
    const link = document.querySelector('link[rel="icon"]'); if (link) link.href = ic.toDataURL();
  } catch (e) { /* */ }

  drawShopIcons();
  const click = (id, fn) => $(id).addEventListener('click', () => { unlockAudio(); sfx.click(); fn(); });
  click('tStart', () => H.start());
  click('tRank', () => { rankBack = 'title'; showScreen('rank'); });
  click('tShop', () => showScreen('shop'));
  click('tSettings', () => { settingsBack = 'title'; showScreen('settings'); });
  click('pResume', () => H.resume());
  click('pSettings', () => { settingsBack = 'pause'; showScreen('settings'); });
  click('pQuit', () => H.toTitle());
  click('oRetry', () => H.retry());
  click('oRank', () => { rankBack = 'over'; showScreen('rank'); });
  click('oTitle', () => H.toTitle());
  click('rBack', () => showScreen(rankBack));
  click('sBack', () => showScreen('title'));
  click('stBack', () => showScreen(settingsBack));
  click('stProfile', () => { nickBack = 'settings'; showScreen('nick'); });
  click('nOk', submitNick);
  $('btnPause').addEventListener('pointerdown', (e) => { e.stopPropagation(); H.pause(); });
  $('btnShield').addEventListener('pointerdown', (e) => { e.preventDefault(); H.runShop('shield'); });
  $('btnDashUp').addEventListener('pointerdown', (e) => { e.preventDefault(); H.runShop('dash'); });
  // 메테오 버튼(마력 링 자리 그대로): 누르면 지금 법사 자리에 메테오
  $('mana').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); H.meteor(); });
  const db = $('btnDash');
  db.addEventListener('pointerdown', (e) => { e.preventDefault(); try { db.setPointerCapture(e.pointerId); } catch (er) { /* */ } H.dashDown(); });
  db.addEventListener('pointerup', (e) => { e.preventDefault(); H.dashUp(); });
  db.addEventListener('pointercancel', () => H.dashCancel());
  for (const b of document.querySelectorAll('#rankTabs button')) b.addEventListener('click', () => { sfx.click(); openRank(b.dataset.scope); });
  for (const b of document.querySelectorAll('#shopTabs button')) b.addEventListener('click', () => { sfx.click(); shopTab = b.dataset.tab; previewSkin = null; openShop(); });
  const arrows = $('bossArrows');
  for (let i = 0; i < CONFIG.boss.max + CONFIG.items.max; i++) { const a = document.createElement('div'); a.className = 'barrow hidden'; a.innerHTML = '<i></i><img alt="">'; arrows.appendChild(a); arrowPool.push(a); }
  for (const k of KINDS) itemIcons[k] = UIIMG['item_' + k] || (h.assets.sprites['item_' + k] && h.assets.sprites['item_' + k].toDataURL());
  if (h.debug) setupDebugItems();
  window.addEventListener('resize', () => setTimeout(checkHudLayout, 100));

  // 설정
  $('stLang').addEventListener('change', async (e) => {
    save.data.settings.lang = e.target.value; save.write();
    await setLanguage(e.target.value);
  });
  click('stSound', () => { save.data.settings.sound = !save.data.settings.sound; save.write(); H.onSound(save.data.settings.sound); refreshSettings(); });
  click('stVib', () => { save.data.settings.vibrate = !save.data.settings.vibrate; save.write(); refreshSettings(); });
  click('stFlick', () => { save.data.settings.flickDash = !save.data.settings.flickDash; save.write(); refreshSettings(); });
  click('stHint', () => { save.data.settings.escapeHint = !save.data.settings.escapeHint; save.write(); refreshSettings(); });
  for (const [id, key] of [['stMusic', 'musicVolume'], ['stSfx', 'sfxVolume']]) {
    $(id).addEventListener('input', (e) => { save.data.settings[key] = Math.round(+e.target.value) / 100; H.onVolume(); });
    $(id).addEventListener('change', () => { save.write(); if (key === 'sfxVolume') sfx.click(); });
  }
  $('stQuality').addEventListener('change', (e) => { save.data.settings.quality = e.target.value; save.write(); H.onQuality(); });
  $('nName').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitNick(); });

  // 킬 팝업 풀
  const pop = $('popups');
  for (let i = 0; i < CONFIG.effects.maxPopups; i++) { const d = document.createElement('div'); d.className = 'kp'; pop.appendChild(d); popPool.push(d); }

  onLangChange(() => {
    regionNames = null;
    if (current) showScreen(current);
    lastHud = {};
  });
  // 모든 문구 다시 적용 (언어 파일 로드 후 처음 한 번)
  applyStatic();
}

function applyStatic() { refreshTitle(); }

/** image/ 에 UI 그림이 있으면 테두리·버튼·아이콘을 그 그림으로(없으면 기존 CSS 모양 그대로) */
function applyUiSkin() {
  const root = document.documentElement;
  if (UIIMG.ui_frame && UIIMG.ui_button) {
    // CSS 변수 안의 상대 주소는 css/ 기준으로 풀리므로 절대 주소로
    const abs = (u) => `url("${new URL(u, location.href).href}")`;
    root.classList.add('uiskin');
    root.style.setProperty('--frame', abs(UIIMG.ui_frame));
    root.style.setProperty('--btn', abs(UIIMG.ui_button));
    root.style.setProperty('--btnp', abs(UIIMG.ui_button_pressed || UIIMG.ui_button));
  }
  const setIco = (id, src) => { const el = $(id); if (el && src) { el.src = src; el.classList.remove('hidden'); } };
  setIco('icoKills', UIIMG.ui_skull);
  setIco('icoTime', UIIMG.ui_clock);
  setIco('icoHeart', UIIMG.ui_heart);
  const shieldImg = UIIMG.ui_shield || UIIMG.icon_shield, dashUpImg = UIIMG.ui_dashup || UIIMG.icon_speed;
  if (shieldImg) { $('icoShield').classList.add('hidden'); setIco('imgShield', shieldImg); }
  if (dashUpImg) { $('icoDash').classList.add('hidden'); setIco('imgDash', dashUpImg); }
  if (UIIMG.ui_dash) { const im = new Image(); im.onload = () => { dashImg = im; dashLast = -1; }; im.src = UIIMG.ui_dash; }
}

// ------------------------------------------------------------ 화면 밖 보스 방향 화살표
const arrowPool = [];
const itemIcons = {};
/** 화면 밖 보스·아이템 방향 화살표. 화살표가 아래쪽 40% 에 들어가면 아이콘 없이 작은 점만 */
export function updateBossArrows(G, V) {
  let k = 0;
  const margin = 34, W = V.cssW, Hh = V.cssH, limit = Hh * (1 - HUD_BOTTOM_FORBIDDEN);
  const place = (x, y, cls, icon, iconKey) => {
    const a = arrowPool[k++];
    if (!a) return;
    const sx = (x * 0.5 - V.left) / V.iw * W, sy = (y * 0.5 - V.top) / V.ih * Hh;
    if (sx > 0 && sy > 0 && sx < W && sy < Hh) { a.classList.add('hidden'); return; }
    const cx = W / 2, cy = Hh / 2, dx = sx - cx, dy = sy - cy;
    const sc = Math.min((W / 2 - margin) / Math.abs(dx || 1e-3), (Hh / 2 - margin) / Math.abs(dy || 1e-3));
    const ay = cy + dy * sc;
    const c = 'barrow ' + cls + (ay > limit ? ' dot' : '');
    if (a._c !== c) { a._c = c; a.className = c; }
    a.style.transform = `translate(${(cx + dx * sc - 20) | 0}px, ${(ay - 20) | 0}px)`;
    a.firstChild.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    if (a.lastChild._k !== iconKey) { a.lastChild._k = iconKey; a.lastChild.src = icon(); }
  };
  for (let i = 0; i < B.length; i++) { const b = B[i]; if (b.active) place(b.x, b.y, 'boss', () => bossIcon(b.kind), 'b' + b.kind); }
  for (let i = 0; i < fieldItems.length; i++) {
    const it = fieldItems[i];
    if (!it.active) continue;
    const key = KINDS[it.kind];
    place(it.x, it.y, 'item ' + RARITY[it.kind], () => itemIcons[key] || '', 'i' + key);
  }
  for (; k < arrowPool.length; k++) if (!arrowPool[k].classList.contains('hidden')) arrowPool[k].classList.add('hidden');
}
const bossIconCache = {};
function bossIcon(kind) {
  if (!bossIconCache[kind]) bossIconCache[kind] = H.assets.sprites[CONFIG.boss.kinds[kind].sprite].toDataURL();
  return bossIconCache[kind];
}

// ------------------------------------------------------------ 타이틀
export function refreshTitle() {
  $('titleBank').textContent = fmt(save.data.bank);
  const b = save.data.best;
  $('titleBest').textContent = b && b.season === CONFIG.ranking.season ? `${t('best')}: ${fmt(b.kills)}` : '';
}

// ------------------------------------------------------------ HUD
let hudT = 0;
let lastHud = {};
function setText(id, v) { if (lastHud[id] !== v) { lastHud[id] = v; $(id).textContent = v; } }

export function updateHud(G, now, input) {
  drawMana(G, now);
  drawDash(G, now, input);
  if (now - hudT < 100) return;
  hudT = now;
  const s = G.stats;
  setText('hudKillsN', fmt(s.kills));
  setText('hudTime', fmtTime(G.time));
  let bosses = 0;
  for (let i = 0; i < B.length; i++) if (B[i].active) bosses++;
  setText('hudMobs', fmt(M.n + bosses));
  setText('hudLv', `Lv.${s.level}`);
  const pct = Math.min(100, (s.exp / s.expNeed) * 100).toFixed(1) + '%';
  if (lastHud.exp !== pct) { lastHud.exp = pct; $('hudExp').style.width = pct; }
  setText('hudGoldN', fmt(s.gold));
  const p = G.player;
  drawHearts(p);
  updateEffects(G);
  updateChain(G);
  toggle('mana', 'locked', !G.meteorLearned);
  const sp = G.player.shield ? '✔' : fmt(shieldPrice(G));
  setText('shieldPrice', sp);
  const dmax = G.player.dashLevel >= CONFIG.dash.maxUpgrades;
  setText('dashPrice', dmax ? 'MAX' : fmt(dashPrice(G)));
  setText('dashLvl', `${G.player.dashLevel}/${CONFIG.dash.maxUpgrades}`);
  toggle('btnShield', 'off', !canBuyShield(G) && !G.player.shield);
  toggle('btnShield', 'owned', G.player.shield);
  toggle('btnDashUp', 'off', !canBuyDash(G));
}
function toggle(id, cls, on) { const k = id + cls; if (lastHud[k] !== on) { lastHud[k] = on; $(id).classList.toggle(cls, on); } }

// ------------------------------------------------------------ 하트(코드로 그린 픽셀)
const HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
let heartsKey = '';
function heartCanvas(full, healing) {
  const c = document.createElement('canvas'); c.width = 9; c.height = 8;
  const x = pctx(c);
  for (let y = 0; y < HEART.length; y++) for (let i = 0; i < 7; i++) {
    if (HEART[y][i] !== '#') continue;
    x.fillStyle = full ? (y === 1 && i === 1 ? P(31) : y > 3 ? P(3) : P(22)) : P(16);
    x.fillRect(i + 1, y + 1, 1, 1);
  }
  for (let y = 0; y < 8; y++) for (let i = 0; i < 9; i++) {   // 외곽선
    if (x.getImageData(i, y, 1, 1).data[3]) continue;
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const xx = i + dx, yy = y + dy; return xx >= 1 && yy >= 1 && xx <= 7 && yy <= 6 && HEART[yy - 1][xx - 1] === '#'; });
    if (n) { x.fillStyle = P(1); x.fillRect(i, y, 1, 1); }
  }
  if (healing) c.className = 'pop';
  return c;
}
let lastHp = -1;
function drawHearts(p) {
  const hp = Math.max(0, Math.ceil(p.hp)), key = hp + '/' + p.maxHp;
  if (key === heartsKey) return;
  const gained = lastHp >= 0 && hp > lastHp;
  heartsKey = key; lastHp = hp;
  const box = $('hearts');
  box.innerHTML = '';
  for (let i = 0; i < p.maxHp; i++) box.appendChild(heartCanvas(i < hp, gained && i === hp - 1));
}

// ------------------------------------------------------------ 켜진 아이템 효과(남은 시간 원형 표시)
const EFFECTS = [
  { key: 'star', t: (G) => G.starT, max: () => CONFIG.items.starTime, blink: CONFIG.items.starBlink },
  { key: 'hourglass', t: (G) => G.slowT, max: () => CONFIG.items.hourglassTime },
  { key: 'twin', t: (G) => G.twinT, max: () => CONFIG.items.twinTime },
  { key: 'fury', t: (G) => G.furyT, max: () => CONFIG.items.furyTime },
  { key: 'magnet', t: (G) => Math.max(0, G.magnetAll), max: () => CONFIG.items.magnetTime },
];
const effMax = {};
let effKey = '';
function updateEffects(G) {
  const on = [];
  for (const e of EFFECTS) { const v = e.t(G); if (v > 0) on.push(e); else effMax[e.key] = 0; }
  const key = on.map((e) => e.key).join(',');
  const box = $('effects');
  if (key !== effKey) {
    effKey = key;
    box.innerHTML = '';
    for (const e of on) { const d = document.createElement('div'); d.className = 'eff'; d.dataset.k = e.key; d.innerHTML = `<img alt="" src="${itemIcons[e.key] || ''}">`; box.appendChild(d); }
  }
  for (const d of box.children) {
    const e = EFFECTS.find((x) => x.key === d.dataset.k), v = e.t(G);
    effMax[e.key] = Math.max(effMax[e.key] || 0, v, e.max());     // 연장되면 원이 다시 가득
    d.style.setProperty('--p', (v / effMax[e.key]).toFixed(3));
    d.classList.toggle('blink', !!e.blink && v < e.blink);
  }
}

// ------------------------------------------------------------ 연속 킬 콤보(2초 안에 이어지면 유지)
let chainShown = 0;
function updateChain(G) {
  const el = $('chain');
  const live = G.chainN >= 2 && G.time - G.chainLast <= CONFIG.progress.chainTime;
  if (!live) { if (chainShown) { el.className = ''; chainShown = 0; } return; }
  if (G.chainN !== chainShown) {
    chainShown = G.chainN;
    el.textContent = t('chain', { n: fmt(G.chainN) });
    el.className = 'on' + (G.chainN >= 500 ? ' fire' : G.chainN >= 50 ? ' hot' : '');
    void el.offsetWidth; el.classList.add('bump');
  }
}

let manaLast = -1, manaFullT = 0;
function drawMana(G, now) {
  const v = Math.min(1, G.mana / CONFIG.mana.max);
  const full = v >= 1;
  const glow = full ? ((now / 120) | 0) % 2 : 0;
  const key = Math.round(v * 200) + glow * 1000;
  if (key === manaLast) return;
  manaLast = key;
  const cv = $('mana'), c = pctx(cv), W = cv.width, cx = W / 2, cy = W / 2;
  c.clearRect(0, 0, W, W);
  disc(c, cx, cy, 19.5, P(1));
  const R0 = 13.5, R1 = 18.5;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.sqrt(dx * dx + dy * dy);
    if (d < R0 || d > R1) continue;
    const a = (Math.atan2(dx, -dy) / (Math.PI * 2) + 1) % 1;
    const on = a <= v;
    c.fillStyle = on ? (full ? (glow ? P(31) : P(12)) : (d > 17 ? P(10) : P(11))) : P(16);
    c.fillRect(x, y, 1, 1);
  }
  disc(c, cx, cy, 12.5, full ? P(10) : P(9));
  // 가운데: 작은 메테오 아이콘
  disc(c, cx - 1, cy + 1, 4.5, full ? P(23) : P(15));
  disc(c, cx - 1.5, cy + 1.5, 2.5, full ? P(24) : P(14));
  for (let k = 0; k < 5; k++) dot(c, cx + 3 + k, cy - 3 - k, full ? P(23) : P(15));
}

let dashLast = -1, dashFlashT = 0, dashImg = null;
function drawDash(G, now, input) {
  const p = G.player;
  const frac = p.dashCharges >= p.dashMax ? 1 : p.dashCd / dashCooldown(p);
  const ready = p.dashCharges >= 1;
  const flash = now < dashFlashT ? ((now / 70) | 0) % 2 : 0;
  const key = Math.round(frac * 100) + (ready ? 1000 : 0) + flash * 2000 + p.dashCharges * 4000 + (input.dashHeld ? 20000 : 0);
  if (key === dashLast) return;
  dashLast = key;
  const cv = $('dashCv'), c = pctx(cv), W = cv.width, cx = W / 2, cy = W / 2;
  c.clearRect(0, 0, W, W);
  disc(c, cx, cy, 13.5, P(1));
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.sqrt(dx * dx + dy * dy);
    if (d < 10 || d > 13) continue;
    const a = (Math.atan2(dx, -dy) / (Math.PI * 2) + 1) % 1;
    c.fillStyle = a <= frac ? (flash ? P(31) : P(24)) : P(16);
    c.fillRect(x, y, 1, 1);
  }
  disc(c, cx, cy, 9.5, ready ? (input.dashHeld ? P(23) : P(4)) : P(29));
  // 가운데 그림: ui_dash.png 가 있으면 그것, 없으면 >> 화살표
  const col = ready ? P(31) : P(30);
  if (dashImg) { c.globalAlpha = ready ? 1 : 0.45; c.drawImage(dashImg, 6, 6, 16, 16); c.globalAlpha = 1; }
  else for (let k = 0; k < 4; k++) { dot(c, 8 + k, 10 + k, col); dot(c, 8 + k, 17 - k, col); dot(c, 13 + k, 10 + k, col); dot(c, 13 + k, 17 - k, col); }
  if (p.dashMax > 1) for (let k = 0; k < p.dashMax; k++) disc(c, 11 + k * 6, 24, 1.5, k < p.dashCharges ? P(24) : P(29));
}

/** 피해를 입었을 때 화면 가장자리 붉게 번쩍 */
export function hurtFx() {
  const el = $('hurtFlash');
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  lastHud = {};   // 체력 숫자 바로 갱신
}
export function dashReadyFx() { dashFlashT = performance.now() + 450; dashLast = -1; }
export function manaFullFx() {
  const el = $('mana');
  el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
}
export function manaShake() {
  const el = $('mana');
  el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
}
export function shopDeny(kind) {
  const el = $(kind === 'shield' ? 'btnShield' : 'btnDashUp');
  el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
}

function drawShopIcons() {
  // 쉴드
  let c = pctx($('icoShield'));
  c.clearRect(0, 0, 12, 12);
  for (let y = 1; y < 11; y++) { const hw = y < 6 ? 4 : 4 - (y - 5) * 0.8; for (let x = Math.round(6 - hw); x < Math.round(6 + hw); x++) dot(c, x, y, x < 6 ? P(11) : P(10)); }
  dot(c, 4, 3, P(31)); dot(c, 4, 4, P(31));
  // 대시 강화
  c = pctx($('icoDash'));
  c.clearRect(0, 0, 12, 12);
  for (let k = 0; k < 4; k++) { dot(c, 2 + k, 3 + k, P(24)); dot(c, 2 + k, 9 - k, P(24)); dot(c, 6 + k, 3 + k, P(23)); dot(c, 6 + k, 9 - k, P(23)); }
  dot(c, 9, 0, P(31)); dot(c, 10, 1, P(31)); dot(c, 11, 0, P(31));
}

// ------------------------------------------------------------ 콤보·팝업·토스트
let comboTimer = 0;
const COMBO_TIERS = [100, 500, 1500, 4000, 10000];
export function comboPopup(kills, mult) {
  const el = $('combo');
  const txt = 'x' + fmt(kills);
  // 숫자가 클수록 크게, 단 화면 폭을 넘지 않게
  const size = Math.min(84, 26 + Math.log10(1 + kills) * 14, window.innerWidth * 0.9 / (0.62 * txt.length));
  el.innerHTML = '';
  let tier = 0;
  for (let i = 0; i < COMBO_TIERS.length; i++) if (kills >= COMBO_TIERS[i]) tier = i + 1;
  if (tier) {
    const tt = document.createElement('div'); tt.className = 'ct t' + tier; tt.textContent = t('combo.t' + tier);
    el.appendChild(tt);
  }
  const n = document.createElement('div'); n.className = 'cn'; n.textContent = txt; n.style.fontSize = size + 'px';
  const m = document.createElement('div'); m.className = 'cm'; m.textContent = t('combo.mult', { m: mult.toFixed(1) });
  el.appendChild(n); el.appendChild(m);
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(comboTimer);
  comboTimer = setTimeout(() => el.classList.remove('show'), 1400);
}
const popPool = [];
let popIdx = 0;
export function killPopup(x, y, kills) {
  if (y > window.innerHeight * (1 - HUD_BOTTOM_FORBIDDEN)) return;   // 아래쪽 40% 에는 띄우지 않음
  const d = popPool[popIdx++ % popPool.length];
  d.textContent = '+' + fmtCompact(kills);
  d.style.left = x + 'px'; d.style.top = y + 'px';
  d.classList.remove('go'); void d.offsetWidth; d.classList.add('go');
}
const TOAST_MAX = CONFIG.ui.toastMax, TOAST_MS = 1600;
/** 짧은 알림(위 1/3 안). 한꺼번에 최대 3개 — 새 알림이 오면 가장 오래된 것부터 사라짐. icon: 아이템 키 */
export function toast(text, kind, icon) {
  const box = $('toasts');
  while (box.children.length >= TOAST_MAX) box.firstChild.remove();
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || '');
  const src = icon ? itemIcons[icon] : null;
  if (src) { const im = document.createElement('img'); im.src = src; im.alt = ''; el.appendChild(im); }
  const sp = document.createElement('span'); sp.textContent = text; el.appendChild(sp);
  box.appendChild(el);
  setTimeout(() => el.classList.add('out'), TOAST_MS);
  setTimeout(() => el.remove(), TOAST_MS + 300);
}
export function clearToasts() { $('toasts').innerHTML = ''; }

/** 죽은 순간: 상단에 원인 크게(“내 메테오”, “늑대 무리”, “포위당함” …) */
export function showDeathCause(text) {
  const el = $('deathCause');
  el.textContent = '';
  const b = document.createElement('div'); b.textContent = text;
  const sm = document.createElement('small'); sm.textContent = t('death.title');
  el.appendChild(sm); el.appendChild(b);
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
}
export function hideDeathCause() { $('deathCause').classList.remove('on'); }
export function itemIcon(key) { return itemIcons[key]; }

// ------------------------------------------------------------ 레벨업 카드
const CARD_ICON = { range: '◎', power: '✸', twin: '⁂', fire: '♨', magnet: '⊛', dash2: '»', fastFall: '↯', vitality: '♥', boltCount: '⁘', boltRate: '≫', boltPierce: '➶' };
const CARD_IMG = { range: 'icon_bigmeteor', power: 'fx_explosion', twin: 'icon_multimeteor', fire: 'meteor_fire_down', magnet: 'item_magnet', dash2: 'icon_speed', fastFall: 'icon_cooldown', vitality: 'icon_hp', boltCount: 'item_orb', boltRate: 'item_feather', boltPierce: 'item_lens' };
export function showLevelUp(level, special, cards, onPick) {
  const chest = level === 0;   // 보스 보물상자 보너스 카드
  $('lvTitle').textContent = chest ? t('chest.title') : t('levelUp');
  $('lvLevel').textContent = chest ? '' : `Lv.${level}`;
  $('lvSub').textContent = chest ? t('chest.sub') : special ? t('special') : t('chooseOne');
  const box = $('cards');
  box.innerHTML = '';
  box.classList.toggle('three', cards.length > 2);
  for (const id of cards) {
    const b = document.createElement('button');
    b.className = 'pix card' + (special ? ' special' : '');
    b.innerHTML = `<span class="ci">${CARD_ICON[id] || '★'}</span><span class="cn fit"></span><span class="cd"></span>`;
    const cimg = UIIMG[CARD_IMG[id]];
    if (cimg) b.querySelector('.ci').innerHTML = `<img src="${cimg}" alt="">`;
    b.querySelector('.cn').textContent = t(`card.${id}.name`);
    b.querySelector('.cd').textContent = t(`card.${id}.desc`);
    let picked = false;
    b.addEventListener('click', () => { if (picked) return; picked = true; onPick(id); });
    box.appendChild(b);
  }
  showScreen('level');
}

// ------------------------------------------------------------ 결과
export function showGameOver(rec, bankAdd, isBest, cause) {
  const rows = [
    ['result.kills', fmt(rec.kills)],
    ['result.time', fmtTime(rec.surviveSec)],
    ['result.level', String(rec.level)],
    ['result.maxCombo', 'x' + fmt(rec.maxCombo)],
    ['result.maxMobs', fmt(rec.maxMobs)],
  ];
  const dl = $('oStats');
  dl.innerHTML = '';
  for (const [k, v] of rows) {
    const r = document.createElement('div'); r.className = 'row';
    const a = document.createElement('span'); a.className = 'fit'; a.textContent = t(k);
    const b = document.createElement('b'); b.textContent = v;
    r.appendChild(a); r.appendChild(b); dl.appendChild(r);
  }
  $('oBank').textContent = t('result.bank', { n: fmt(bankAdd) });
  $('oBest').classList.toggle('hidden', !isBest);
  $('oCause').textContent = cause ? t('result.cause', { cause }) : '';
  $('oRankStatus').textContent = '';
  $('oRankStatus').classList.remove('celebrate');
  $('oGoals').textContent = '';
  hideDeathCause();
  showScreen('over');
}
export function setRankStatus(r) {
  const el = $('oRankStatus');
  if (r.pending) el.textContent = t('rank.submitting');
  else if (r.noNick) el.textContent = t('rank.noNick');
  else if (r.ok) {   // 이번 기록: 오늘 12위 · 이번 주 340위 · 전체 2,105위 (10위 안이면 축하)
    const parts = [['today', r.today], ['week', r.week], ['all', r.all]].filter(([, v]) => v > 0).map(([k, v]) => t('rank.' + k) + ' ' + t('rank.nth', { rank: fmt(v) }));
    el.textContent = parts.length ? t('rank.thisRun', { list: parts.join(' · ') }) : t('rank.saved');
    const top10 = [r.today, r.week, r.all].some((v) => v > 0 && v <= 10);
    el.classList.toggle('celebrate', top10);
    if (top10) { el.textContent = '🏆 ' + el.textContent; sfx.bossKill(); }
  }
  else if (r.reason === 'too_fast') el.textContent = '';                                       // 조용히 넘어감
  else if (r.reason === 'impossible') el.textContent = t('rank.impossible');
  else if (r.reason === 'bad_nickname') el.textContent = t('rank.badNick');
  else if (r.queued) el.textContent = t('rank.queued');
  else if (r.notConfigured) el.textContent = t('rank.local');
  else el.textContent = t('rank.offline');
}
function fmtTime(sec) { const m = Math.floor(sec / 60), s = Math.floor(sec % 60); return `${m}:${String(s).padStart(2, '0')}`; }

// ------------------------------------------------------------ 랭킹
let rankScope = 'today', rankBack = 'title', rankReq = 0;
async function openRank(scope) {
  rankScope = scope;
  for (const b of document.querySelectorAll('#rankTabs button')) b.classList.toggle('on', b.dataset.scope === scope);
  const list = $('rankList');
  // 불러오는 동안 글자 깜빡임 대신 빈 줄 모양
  list.innerHTML = '<div class="rrow skel"><span></span><span></span><span></span></div>'.repeat(10);
  $('rankNote').textContent = '';
  $('rankMe').textContent = '';
  const req = ++rankReq;
  const res = await fetchTop(scope, save.data.settings.country);
  if (req !== rankReq) return;
  list.innerHTML = '';
  $('rankNote').textContent = res.offline ? (rankingEnabled() ? t('rank.offline') : t('rank.local')) : '';
  if (scope === 'country' && !save.data.settings.country) { list.innerHTML = `<div class="rmsg">${t('rank.noCountry')}</div>`; return; }
  renderMyBest(res);
  if (!res.rows.length) { list.innerHTML = `<div class="rmsg">${t('rank.empty')}</div>`; return; }
  // 서버 문자열(닉네임·국가·모양·캐릭터)은 모두 textContent / 검사한 값으로만 — innerHTML 에 넣지 않음
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
  for (const r of res.rows) {
    const row = el('div', 'rrow' + (r.mine ? ' me' : ''));
    const rn = el('span', 'rn');
    const medal = UIIMG[['ui_medal_gold', 'ui_medal_silver', 'ui_medal_bronze'][r.rank - 1]];
    if (r.rank === 1 && UIIMG.ui_crown) { const im = el('img'); im.src = UIIMG.ui_crown; im.alt = '1'; rn.appendChild(im); }
    else if (medal) { const im = el('img'); im.src = medal; im.alt = String(r.rank); rn.appendChild(im); }
    else rn.textContent = fmt(r.rank);
    row.appendChild(rn);
    row.appendChild(el('span', 'rf', flag(r.country)));
    row.appendChild(el('span', 'rname', r.nickname));
    const rh = el('img', 'rh'); rh.alt = ''; rh.src = heroIcon(r.hero); row.appendChild(rh);
    const rs = el('img', 'rs'); rs.alt = ''; rs.src = skinIcons[r.meteor_skin] || skinIcons.fire; row.appendChild(rs);
    row.appendChild(el('b', 'rk', fmt(r.kills)));
    row.appendChild(el('span', 'rl', r.level ? 'Lv' + r.level : ''));
    list.appendChild(row);
  }
}
/** 맨 아래 고정 줄: 내 최고 기록 — 1,234위 / 전체 56,789개 · 킬 · 내 기록 수 */
function renderMyBest(res) {
  const box = $('rankMe');
  box.textContent = '';
  if (!res.me) { if (!res.offline) box.textContent = t('rank.noMine'); return; }
  const m = res.me;
  const a = document.createElement('div');
  a.textContent = t('rank.myBest', { rank: fmt(m.rank), total: fmt(m.total || res.total || 0) });
  const b = document.createElement('small');
  b.textContent = t('rank.myBestSub', { kills: fmt(m.kills), n: fmt(m.records || 1) });
  box.appendChild(a); box.appendChild(b);
}
/** 캐릭터 아이콘: 서버 이름(fire_mage …) → 그림 */
const SERVER_HERO_ICON = { fire_mage: 'mage', frost_witch: 'icewitch', earth_sage: 'apprentice' };
function heroIcon(h) { return heroIcons[h] || heroIcons[SERVER_HERO_ICON[h]] || heroIcons.mage; }

/** 결과 화면: 다음 목표(최대 3줄) */
export function showGoals(lines) {
  const box = $('oGoals');
  box.textContent = '';
  for (const s of lines.slice(0, 3)) { const d = document.createElement('div'); d.textContent = '▶ ' + s; box.appendChild(d); }
}

// ------------------------------------------------------------ 메테오·주인공 상점 (꾸미기 전용)
let shopTab = 'meteor';
let previewSkin = null, previewRaf = 0, previewT = 0;
function openShop() {
  $('shopBank').textContent = fmt(save.data.bank);
  for (const b of document.querySelectorAll('#shopTabs button')) b.classList.toggle('on', b.dataset.tab === shopTab);
  const isHero = shopTab === 'hero';
  $('shopNote').textContent = t(isHero ? 'shop.heroNote' : 'shop.note');
  const grid = $('shopGrid');
  grid.innerHTML = '';
  const list = isHero ? HEROES : SKINS.map((sk) => sk.id);
  const equipped = isHero ? save.data.heroEquipped : save.data.skinEquipped;
  if (!previewSkin || !list.includes(previewSkin)) previewSkin = equipped;
  for (const id of list) {
    const owned = isHero ? ownsHero(id) : ownsSkin(id), eq = equipped === id, price = isHero ? heroPrice(id) : skinPrice(id);
    const card = document.createElement('div');
    card.className = 'skin' + (eq ? ' eq' : '') + (previewSkin === id ? ' sel' : '');
    card.innerHTML = `<img alt=""><span class="sn fit"></span><button class="pix small fit"></button>`;
    card.querySelector('img').src = isHero ? heroIcons[id] : skinIcons[id];
    card.querySelector('.sn').textContent = t((isHero ? 'hero.' : 'skin.') + id);
    const btn = card.querySelector('button');
    if (eq) { btn.textContent = t('shop.equipped'); btn.disabled = true; }
    else if (owned) btn.textContent = t('shop.equip');
    else { btn.textContent = `${t('shop.buy')} ${fmt(price)}`; if (save.data.bank < price) btn.classList.add('off'); }
    card.addEventListener('click', () => {
      previewSkin = id; previewT = 0;
      if (!isHero) previewExplosion(skinById(id));
      for (const c of grid.children) c.classList.remove('sel');
      card.classList.add('sel');
    });
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (owned) { if (isHero) equipHero(id); else equipSkin(id); sfx.click(); }
      else if (isHero ? buyHero(id) : buySkin(id)) { sfx.buy(); toastShop(t('shop.bought')); }
      else { sfx.deny(); toastShop(t('shop.notEnough')); return; }
      previewSkin = id; openShop();
    });
    grid.appendChild(card);
  }
  if (!previewRaf) { previewT = 0; previewRaf = requestAnimationFrame(drawPreview); }
  requestAnimationFrame(() => fitAll($('scrShop')));
}
function toastShop(msg) { const el = $('shopMsg'); el.textContent = msg; clearTimeout(el._t); el._t = setTimeout(() => { el.textContent = ''; }, 1500); }
function stopPreview() { if (previewRaf) cancelAnimationFrame(previewRaf); previewRaf = 0; }

// 미리보기: 메테오가 떨어져 터지는 짧은 장면 / 주인공이 몹에게 쫓기며 걷는 장면
let pvLast = 0, groundPat = null;
function drawPreview(now) {
  previewRaf = requestAnimationFrame(drawPreview);
  const dt = Math.min(0.05, (now - (pvLast || now)) / 1000); pvLast = now;
  previewT += dt;
  const cv = $('shopPreview'), c = pctx(cv), W = cv.width, Hh = cv.height;
  const S = H.assets.sprites;
  if (!groundPat) groundPat = c.createPattern(S.ground, 'repeat');
  c.fillStyle = groundPat; c.fillRect(0, 0, W, Hh);
  if (shopTab === 'hero') {
    const img = S[heroSprite(previewSkin || 'mage')];
    const x = ((previewT * 30) % (W + 80)) - 20, bob = ((previewT * 6) | 0) % 2;
    c.drawImage(img, Math.round(x - img.width / 2), Math.round(Hh * 0.5 - img.height / 2 - bob));
    const sl = S.mob_slime;
    for (let k = 0; k < 3; k++) c.drawImage(sl, Math.round(x - 34 - k * 16 - sl.width / 2), Math.round(Hh * 0.6 + (k % 2) * 8 - (((previewT * 6 + k) | 0) % 2)));
    return;
  }
  if (previewT > 2.6) previewT = 0;
  const sk = skinById(previewSkin || 'fire');
  const tx = W / 2, ty = Hh * 0.62, fall = 1.0;
  const img = S[sk.sprite];
  if (previewT < fall) {
    const f = previewT / fall, h = (1 - f) * 80;
    disc(c, tx, ty, 2 + f * 10, P(1));
    c.drawImage(img, Math.round(tx + h * 0.55 - img.width / 2), Math.round(ty - h - img.height / 2));
  } else {
    const e = previewT - fall;
    const r = Math.min(30, 8 + e * 100);
    if (e < 0.5) {
      disc(c, tx, ty, r, P(sk.burst[e < 0.08 ? 0 : 1]));
      disc(c, tx, ty, r * 0.6, P(sk.burst[0]));
      for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, d = r + e * 40; dot(c, tx + Math.cos(a) * d, ty + Math.sin(a) * d * 0.8, P(sk.burst[k % sk.burst.length])); }
    } else {
      disc(c, tx, ty, 20, P(sk.crater[0]));
      disc(c, tx, ty, 12, P(sk.crater[1]));
    }
  }
}

// ------------------------------------------------------------ 설정
function refreshSettings() {
  const s = save.data.settings;
  const sel = $('stLang');
  if (!sel.options.length) for (const l of getLanguages()) { const o = document.createElement('option'); o.value = l.code; o.textContent = l.name; sel.appendChild(o); }
  sel.value = getLang();
  $('stSound').textContent = s.sound ? t('on') : t('off');
  $('stSound').classList.toggle('off', !s.sound);
  $('stVib').textContent = s.vibrate ? t('on') : t('off');
  $('stVib').classList.toggle('off', !s.vibrate);
  $('stHint').textContent = s.escapeHint ? t('on') : t('off');
  $('stHint').classList.toggle('off', !s.escapeHint);
  $('stMusic').value = Math.round(s.musicVolume * 100);
  $('stSfx').value = Math.round(s.sfxVolume * 100);
  $('stFlick').textContent = s.flickDash ? t('on') : t('off');
  $('stFlick').classList.toggle('off', !s.flickDash);
  const q = $('stQuality');
  q.innerHTML = '';
  for (const k of ['auto', 'high', 'mid', 'low']) { const o = document.createElement('option'); o.value = k; o.textContent = t('quality.' + k); q.appendChild(o); }
  q.value = s.quality;
  $('stProfileName').textContent = `${flag(s.country)} ${s.nickname || '—'}`;
}

// ------------------------------------------------------------ 닉네임·국가
function openNick() {
  const s = save.data.settings;
  $('nName').value = s.nickname;
  $('nErr').textContent = '';
  fillCountrySelect($('nCountry'), s.country || guessCountry());
}
export function validNick(n) {
  const len = [...n].length;
  return len >= 2 && len <= 12 && /^[\p{L}\p{N}_.\- ]+$/u.test(n) && n.trim() === n;
}
function submitNick() {
  const n = $('nName').value.trim().replace(/\s+/g, ' ');
  if (!validNick(n)) { $('nErr').textContent = t('nick.invalid'); sfx.deny(); return; }
  save.data.settings.nickname = n;
  save.data.settings.country = $('nCountry').value;
  save.write();
  showScreen(nickBack);
  nickBack = 'title';
}

// ------------------------------------------------------------ 첫 판 안내: 게임은 안내가 끝나거나 건너뛸 때까지 멈춰 있음
let tutTimer = 0, tutStep = -1, tutNext = null, tutSkip = null;
const TUT = ['move', 'bolt', 'dash'];
const TUT_STEP_MS = 4000;
export function startTutorial(onDone) {
  const el = $('tutorial');
  el.classList.remove('hidden');
  tutStep = -1;
  const finish = () => { stopTutorial(); onDone(); };
  const next = () => {
    clearTimeout(tutTimer);
    tutStep++;
    if (tutStep >= TUT.length) { finish(); return; }
    const k = TUT[tutStep];
    $('tutText').textContent = t('tut.' + k);
    $('tutCount').textContent = `${tutStep + 1}/${TUT.length}`;
    drawTut(k);
    el.dataset.step = k;
    $('btnDash').classList.toggle('pulse', k === 'dash');
    tutTimer = setTimeout(next, TUT_STEP_MS);
  };
  tutNext = (e) => { if (e.target.closest('#tutSkip')) return; sfx.click(); next(); };   // 상자를 누르면 다음 안내
  tutSkip = (e) => { e.stopPropagation(); sfx.click(); finish(); };
  el.querySelector('.tutBox').addEventListener('click', tutNext);
  $('tutSkip').addEventListener('click', tutSkip);
  next();
}
export function stopTutorial() {
  clearTimeout(tutTimer);
  $('btnDash').classList.remove('pulse');
  $('tutorial').classList.add('hidden');
  if (tutNext) { $('tutorial').querySelector('.tutBox').removeEventListener('click', tutNext); tutNext = null; }
  if (tutSkip) { $('tutSkip').removeEventListener('click', tutSkip); tutSkip = null; }
}

function drawTut(k) {
  const cv = $('tutCv'), c = pctx(cv), W = cv.width, Hh = cv.height;
  c.fillStyle = P(26); c.fillRect(0, 0, W, Hh);
  const mage = H.assets.sprites.mage, slime = H.assets.sprites.mob_slime;
  if (k === 'move') {
    disc(c, 20, 22, 11, P(16)); disc(c, 20, 22, 9, P(15)); disc(c, 27, 17, 5, P(14));
    for (let i = 0; i < 12; i++) dot(c, 33 + i, 22, P(31));
    dot(c, 43, 21, P(31)); dot(c, 43, 23, P(31)); dot(c, 42, 20, P(31)); dot(c, 42, 24, P(31));
    c.drawImage(mage, 48, 10);
  } else if (k === 'bolt') {
    c.drawImage(mage, 4, 10);
    for (let i = 0; i < 5; i++) c.drawImage(slime, 58 + (i % 2) * 12, 4 + i * 7);
    for (let i = 0; i < 3; i++) { const x = 30 + i * 9; dot(c, x, 20, P(11)); dot(c, x + 1, 20, P(12)); dot(c, x + 2, 20, P(31)); }
    disc(c, 58, 21, 2.5, P(31));
  } else if (k === 'mana') {
    c.drawImage(mage, 8, 10);
    for (let i = 0; i < 7; i++) c.drawImage(slime, 34 + (i % 3) * 10, 4 + ((i / 3) | 0) * 12 + (i % 2) * 3);
    disc(c, 20, 22, 18, P(11)); disc(c, 20, 22, 17, P(26)); c.drawImage(mage, 8, 10);
  } else if (k === 'tap') {
    for (let i = 0; i < 6; i++) c.drawImage(slime, 4 + (i % 3) * 9, 6 + ((i / 3) | 0) * 13);
    for (let i = 0; i < 8; i++) dot(c, 34 + i, 18, P(31));
    for (let a = 0; a < 40; a++) { const t2 = a / 40 * Math.PI * 2; if (a % 4 < 2) dot(c, 54 + Math.cos(t2) * 12, 20 + Math.sin(t2) * 12, P(22)); }
    disc(c, 54, 20, 2.5, P(31));
  } else {
    for (let i = 0; i < 9; i++) c.drawImage(slime, 30 + (i % 3) * 8, 4 + ((i / 3) | 0) * 11);
    c.drawImage(mage, 2, 10);
    for (let i = 0; i < 10; i++) if (i % 3 < 2) dot(c, 26 + i * 3, 22, P(31));
    c.drawImage(mage, 66, 10);
  }
}

// ------------------------------------------------------------ 메테오 습득(레벨 5): 하늘에서 빛 + 위쪽 안내, 3초
let learnTimer = 0;
export function showLearn(screenX, onDone) {
  const el = $('learn');
  el.querySelector('.beam').style.left = Math.round(screenX) + 'px';
  el.classList.remove('hidden');
  requestAnimationFrame(() => fitAll(el));
  clearTimeout(learnTimer);
  learnTimer = setTimeout(() => { hideLearn(); onDone(); }, CONFIG.meteor.learnTime * 1000);
}
export function hideLearn() { clearTimeout(learnTimer); $('learn').classList.add('hidden'); }

// ------------------------------------------------------------ ?debug=1 : 아이템 바로 소환 버튼
function setupDebugItems() {
  const box = $('dbgItems');
  box.classList.remove('hidden');
  for (const k of KINDS) {
    const b = document.createElement('button');
    b.title = k;
    b.innerHTML = itemIcons[k] ? `<img alt="${k}" src="${itemIcons[k]}">` : k.slice(0, 3);
    b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); H.debugItem && H.debugItem(k); });
    box.appendChild(b);
  }
  for (const [label, fn] of [['Lv+', 'debugLevel'], ['God', 'debugGod']]) {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); H[fn] && H[fn](b); });
    box.appendChild(b);
  }
}

export function setAutoplayText(txt) { const el = $('autoplay'); el.classList.toggle('hidden', !txt); el.textContent = txt || ''; }

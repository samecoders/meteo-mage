// HTML/CSS 오버레이 UI. 모든 문구는 i18n 키로만. HUD 숫자는 초당 10번만 갱신.
import { CONFIG } from './config.js';
import { save } from './save.js';
import { t, fmt, fmtCompact, getLanguages, getLang, setLanguage, onLangChange, fitAll } from './i18n.js';
import { SKINS, skinPrice, skinById, palCss } from './skins.js';
import { shieldPrice, dashPrice, canBuyShield, canBuyDash, ownsSkin, buySkin, equipSkin, HEROES, heroPrice, ownsHero, buyHero, equipHero } from './shop.js';
import { fetchTop, rankingEnabled } from './ranking.js';
import { sfx, previewExplosion, unlockAudio } from './audio.js';
import { M, B } from './sim/mobs.js';
import { expNeed } from './upgrade.js';

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
export function showHud(on) {
  $('hud').classList.toggle('hidden', !on);
  if (on) { lastHud = {}; requestAnimationFrame(() => fitAll($('hud'))); }
}

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
  const db = $('btnDash');
  db.addEventListener('pointerdown', (e) => { e.preventDefault(); try { db.setPointerCapture(e.pointerId); } catch (er) { /* */ } H.dashDown(); });
  db.addEventListener('pointerup', (e) => { e.preventDefault(); H.dashUp(); });
  db.addEventListener('pointercancel', () => H.dashCancel());
  for (const b of document.querySelectorAll('#rankTabs button')) b.addEventListener('click', () => { sfx.click(); openRank(b.dataset.scope); });
  for (const b of document.querySelectorAll('#shopTabs button')) b.addEventListener('click', () => { sfx.click(); shopTab = b.dataset.tab; previewSkin = null; openShop(); });
  const arrows = $('bossArrows');
  for (let i = 0; i < CONFIG.boss.max; i++) { const a = document.createElement('div'); a.className = 'barrow hidden'; a.innerHTML = '<i></i><img alt="">'; arrows.appendChild(a); arrowPool.push(a); }

  // 설정
  $('stLang').addEventListener('change', async (e) => {
    save.data.settings.lang = e.target.value; save.write();
    await setLanguage(e.target.value);
  });
  click('stSound', () => { save.data.settings.sound = !save.data.settings.sound; save.write(); H.onSound(save.data.settings.sound); refreshSettings(); });
  click('stVib', () => { save.data.settings.vibrate = !save.data.settings.vibrate; save.write(); refreshSettings(); });
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
  if (UIIMG.icon_shield) { $('icoShield').classList.add('hidden'); setIco('imgShield', UIIMG.icon_shield); }
  if (UIIMG.icon_speed) { $('icoDash').classList.add('hidden'); setIco('imgDash', UIIMG.icon_speed); }
}

// ------------------------------------------------------------ 화면 밖 보스 방향 화살표
const arrowPool = [];
export function updateBossArrows(G, V) {
  let k = 0;
  const margin = 34, W = V.cssW, Hh = V.cssH;
  for (let i = 0; i < B.length; i++) {
    const b = B[i];
    if (!b.active) continue;
    const a = arrowPool[k++];
    if (!a) break;
    const sx = (b.x * 0.5 - V.left) / V.iw * W, sy = (b.y * 0.5 - V.top) / V.ih * Hh;
    if (sx > 0 && sy > 0 && sx < W && sy < Hh) { a.classList.add('hidden'); continue; }
    const cx = W / 2, cy = Hh / 2, dx = sx - cx, dy = sy - cy;
    const sc = Math.min((W / 2 - margin) / Math.abs(dx || 1e-3), (Hh / 2 - margin) / Math.abs(dy || 1e-3));
    a.classList.remove('hidden');
    a.style.transform = `translate(${(cx + dx * sc - 20) | 0}px, ${(cy + dy * sc - 20) | 0}px)`;
    a.firstChild.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    if (a.lastChild._k !== b.kind) { a.lastChild._k = b.kind; a.lastChild.src = bossIcon(b.kind); }
  }
  for (; k < arrowPool.length; k++) arrowPool[k].classList.add('hidden');
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
  $('titleBest').textContent = b ? `${t('best')}: ${fmt(b.kills)}` : '';
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
  const p = G.player, hpPct = Math.max(0, p.hp / p.maxHp);
  const hw = (hpPct * 100).toFixed(1) + '%';
  if (lastHud.hp !== hw) { lastHud.hp = hw; $('hudHpBar').style.width = hw; }
  setText('hudHpN', String(Math.ceil(p.hp)));
  toggle('hudHp', 'low', hpPct < 0.3);
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

let dashLast = -1, dashFlashT = 0;
function drawDash(G, now, input) {
  const p = G.player;
  const frac = p.dashCharges >= p.dashMax ? 1 : p.dashCd / CONFIG.dash.cooldown;
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
  // >> 화살표
  const col = ready ? P(31) : P(30);
  for (let k = 0; k < 4; k++) { dot(c, 8 + k, 10 + k, col); dot(c, 8 + k, 17 - k, col); dot(c, 13 + k, 10 + k, col); dot(c, 13 + k, 17 - k, col); }
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
  const d = popPool[popIdx++ % popPool.length];
  d.textContent = '+' + fmtCompact(kills);
  d.style.left = x + 'px'; d.style.top = y + 'px';
  d.classList.remove('go'); void d.offsetWidth; d.classList.add('go');
}
let toastT = 0;
export function toast(text, kind) {
  const el = $('toast');
  el.textContent = text;
  el.className = 'show ' + (kind || '');
  clearTimeout(toastT);
  toastT = setTimeout(() => { el.className = ''; }, 1800);
}

// ------------------------------------------------------------ 레벨업 카드
const CARD_ICON = { range: '◎', power: '✸', twin: '⁂', fire: '♨', magnet: '⊛', dash2: '»', fastFall: '↯', vitality: '♥' };
const CARD_IMG = { range: 'icon_bigmeteor', power: 'fx_explosion', twin: 'icon_multimeteor', fire: 'meteor_fire_down', magnet: 'item_magnet', dash2: 'icon_speed', fastFall: 'icon_cooldown', vitality: 'icon_hp' };
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
export function showGameOver(rec, bankAdd, isBest) {
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
  $('oRankStatus').textContent = '';
  showScreen('over');
}
export function setRankStatus(r) {
  const el = $('oRankStatus');
  if (r.pending) el.textContent = t('rank.submitting');
  else if (r.noNick) el.textContent = t('rank.noNick');
  else if (r.ok) el.textContent = r.rank ? t('rank.submitted', { rank: fmt(r.rank) }) : t('rank.saved');
  else if (r.rejected) el.textContent = t('rank.rejected');
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
  list.innerHTML = `<div class="rmsg">${t('rank.loading')}</div>`;
  $('rankMe').textContent = '';
  const req = ++rankReq;
  const res = await fetchTop(scope, save.data.settings.country);
  if (req !== rankReq) return;
  list.innerHTML = '';
  $('rankNote').textContent = res.offline ? (rankingEnabled() ? t('rank.offline') : t('rank.local')) : '';
  if (!res.rows.length) { list.innerHTML = `<div class="rmsg">${t('rank.empty')}</div>`; return; }
  res.rows.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'rrow' + (r.mine ? ' mine' : '');
    const icon = skinIcons[r.meteor_skin] || skinIcons.fire;
    row.innerHTML = `<span class="rn">${i + 1}</span><span class="rf">${flag(r.country)}</span><img class="rh" alt=""><span class="rname"></span><img class="rs" alt=""><b class="rk"></b>`;
    const medal = UIIMG[['ui_medal_gold', 'ui_medal_silver', 'ui_medal_bronze'][i]];
    if (i === 0 && UIIMG.ui_crown) row.querySelector('.rn').innerHTML = `<img src="${UIIMG.ui_crown}" alt="1">`;
    else if (medal) row.querySelector('.rn').innerHTML = `<img src="${medal}" alt="${i + 1}">`;
    row.querySelector('.rname').textContent = r.nickname;
    row.querySelector('.rs').src = icon;
    row.querySelector('.rh').src = heroIcons[r.hero] || heroIcons.mage;
    row.querySelector('.rk').textContent = fmt(r.kills);
    list.appendChild(row);
  });
  if (res.me) $('rankMe').textContent = t('rank.myRank', { rank: fmt(res.me.rank), kills: fmt(res.me.kills) });
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

// ------------------------------------------------------------ 첫 판 안내 (15초)
let tutTimer = 0, tutStep = -1;
const TUT = ['move', 'mana', 'tap', 'dash'];
export function startTutorial(onDone) {
  const el = $('tutorial');
  el.classList.remove('hidden');
  tutStep = -1;
  const next = () => {
    tutStep++;
    if (tutStep >= TUT.length) { stopTutorial(); onDone(); return; }
    const k = TUT[tutStep];
    $('tutText').textContent = t('tut.' + k);
    $('tutCount').textContent = `${tutStep + 1}/${TUT.length}`;
    drawTut(k);
    el.dataset.step = k;
    tutTimer = setTimeout(next, 3750);
  };
  next();
}
export function stopTutorial() { clearTimeout(tutTimer); $('tutorial').classList.add('hidden'); }

function drawTut(k) {
  const cv = $('tutCv'), c = pctx(cv), W = cv.width, Hh = cv.height;
  c.fillStyle = P(26); c.fillRect(0, 0, W, Hh);
  const mage = H.assets.sprites.mage, slime = H.assets.sprites.mob_slime;
  if (k === 'move') {
    disc(c, 20, 22, 11, P(16)); disc(c, 20, 22, 9, P(15)); disc(c, 27, 17, 5, P(14));
    for (let i = 0; i < 12; i++) dot(c, 33 + i, 22, P(31));
    dot(c, 43, 21, P(31)); dot(c, 43, 23, P(31)); dot(c, 42, 20, P(31)); dot(c, 42, 24, P(31));
    c.drawImage(mage, 48, 10);
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

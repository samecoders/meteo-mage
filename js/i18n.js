// 다국어: lang/<코드>.json 의 키-값. 새 언어는 lang/<코드>.json 추가 + lang/languages.json 에 코드 한 줄.
let languages = [];          // [{code, name}]
let dict = {};
let fallback = {};
let lang = 'en';
let nf = new Intl.NumberFormat('en');
let nfc = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const listeners = [];

async function fetchJson(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(url + ' ' + r.status);
  return r.json();
}

export async function initI18n(saved) {
  try { languages = await fetchJson('lang/languages.json'); } catch (e) { languages = [{ code: 'en', name: 'English' }]; }
  try { fallback = await fetchJson('lang/en.json'); } catch (e) { fallback = {}; }
  const code = saved && languages.some((l) => l.code === saved) ? saved : detectLanguage();
  await setLanguage(code);
}

export function getLanguages() { return languages; }
export function getLang() { return lang; }

/** navigator.language 로 자동 선택. 없는 언어면 영어 */
export function detectLanguage() {
  const codes = languages.map((l) => l.code);
  const prefs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en']);
  for (const raw of prefs) {
    const p = String(raw);
    if (codes.includes(p)) return p;
    const low = p.toLowerCase();
    if (low.startsWith('zh')) {
      if (/(tw|hk|mo|hant)/.test(low)) { if (codes.includes('zh-TW')) return 'zh-TW'; }
      else if (codes.includes('zh-CN')) return 'zh-CN';
    }
    if (low.startsWith('pt') && codes.includes('pt-BR')) return 'pt-BR';
    const base = low.split('-')[0];
    const hit = codes.find((c) => c.toLowerCase() === base);
    if (hit) return hit;
  }
  return 'en';
}

export async function setLanguage(code) {
  if (code === 'en') dict = fallback;
  else {
    try { dict = await fetchJson(`lang/${code}.json`); } catch (e) { dict = fallback; code = 'en'; }
  }
  lang = code;
  nf = new Intl.NumberFormat(code);
  try { nfc = new Intl.NumberFormat(code, { notation: 'compact', maximumFractionDigits: 1 }); }
  catch (e) { nfc = nf; }
  document.documentElement.lang = code;
  applyI18n(document);
  for (let i = 0; i < listeners.length; i++) listeners[i](code);
}

export function onLangChange(cb) { listeners.push(cb); }

/** 키로 문구 가져오기. {n} 같은 자리표시자 치환 */
export function t(key, vars) {
  let s = dict[key];
  if (s === undefined) s = fallback[key];
  if (s === undefined) return key;
  if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
  return s;
}

export function fmt(n) { return nf.format(Math.floor(n)); }
export function fmtCompact(n) { return n < 10000 ? nf.format(Math.floor(n)) : nfc.format(n); }

/** data-i18n 속성이 있는 요소의 글자 교체 후 글자 크기 자동 축소 */
export function applyI18n(root) {
  const els = root.querySelectorAll('[data-i18n]');
  for (let i = 0; i < els.length; i++) els[i].textContent = t(els[i].getAttribute('data-i18n'));
  const ph = root.querySelectorAll('[data-i18n-ph]');
  for (let i = 0; i < ph.length; i++) ph[i].placeholder = t(ph[i].getAttribute('data-i18n-ph'));
  requestAnimationFrame(() => fitAll(root));
}

/** .fit 요소: 넘치면 글자 크기를 줄임 */
export function fitAll(root) {
  const els = (root || document).querySelectorAll('.fit');
  for (let i = 0; i < els.length; i++) fitText(els[i]);
}

export function fitText(el) {
  if (!el.offsetParent || el.clientWidth === 0) return;   // 보이지 않으면 건너뜀
  el.style.fontSize = '';
  let size = parseFloat(getComputedStyle(el).fontSize) || 16;
  const min = 8;
  let guard = 30;
  while (guard-- > 0 && size > min && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) {
    size -= 1;
    el.style.fontSize = size + 'px';
  }
}

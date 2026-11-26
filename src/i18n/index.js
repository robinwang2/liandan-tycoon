import catalogs from '#english-catalogs';

export const english = Object.assign(Object.create(null), ...Object.values(catalogs), catalogs.ui);
let lang = 'zh';
try { lang = (typeof window === 'undefined' ? globalThis.process?.env?.LDT_LANG : window.localStorage.getItem('ldt_lang')) === 'en' ? 'en' : 'zh'; } catch {}
const listeners = [];
export const getLang = () => lang;
export function onLanguage(fn) { listeners.push(fn); fn(); }
export function setLang(next) {
  if (!['zh', 'en'].includes(next) || next === lang) return;
  lang = next;
  try { if (typeof window !== 'undefined') window.localStorage.setItem('ldt_lang', lang); } catch {}
  for (const fn of listeners) fn();
}
export const tr = value => lang === 'en' && typeof value === 'string' ? english[value] ?? value : value;
export const trVar = (key, value) => ['公司', '名字', '模型'].includes(key) ? value : tr(value);
export function compact(value) {
  const rounded = Number(value.toPrecision(3)), abs = Math.abs(rounded);
  const [scale, suffix] = abs >= 1e9 ? [1e9, 'B'] : abs >= 1e6 ? [1e6, 'M'] : abs >= 1e3 ? [1e3, 'K'] : [1, ''];
  return String(+(rounded / scale).toPrecision(3)) + suffix;
}
export const units = value => lang === 'en' && typeof value === 'string' ? value.replace(/(\d+(?:\.\d+)?)\s*([万亿])/g, (_, n, unit) => compact(Number(n) * (unit === '万' ? 1e4 : 1e8))) : value;

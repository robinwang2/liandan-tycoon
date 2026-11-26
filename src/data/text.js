// 引擎、参谋、教学、界面里由代码拼出来的文字。内容在 tables/文本.xlsx 里；改表 → npm run tables → 这里读导出的 JSON。
// 用法：text('news.boom') 或 text('why.cash', { 现金: '$12万' })；第三个参数为真时用「湾区文本」（有的话）。
import { localize } from '../i18n/tables.js';
import T from './tables/text.json' with { type: 'json' };

import params from './tables/params.json' with { type: 'json' };
import { fillRefs } from './refs.js';

import { tr, trVar, units } from '../i18n/index.js';
localize('text', T);
export const TEXT = T.TEXT;                      // 键 → { text, bay? }
export const fill = (s, v) => units(String(tr(s)).replace(/\{([^{}\s]+)\}/g, (match, key) =>
  v && key in v ? trVar(key, v[key]) : key.split(/[:：]/)[0].includes('.') ? fillRefs(match, { P: params.P }) : match));
export const hasText = key => key in TEXT;
export function text(key, vars, bay = false) {
  const e = TEXT[key];
  if (!e) throw new Error(`tables/文本.xlsx 里没有「${key}」`);
  return fill(bay && e.bay != null ? e.bay : e.text, vars);
}

// 文本.xlsx 和代码对一对（validate.mjs 会调用，也可以单独跑：node tools/textcheck.mjs）：
//   ① 代码里用到的键，表里都有；
//   ② 表里每段字（深圳、湾区两种说法）里的 {变量}，代码都会填——不然游戏里会原样露出「{xxx}」；
//   ③ 表里没有任何代码用到的键，提醒一下（多半是拼错了，或者功能删掉了）。
// 做法：在源码里找「取文字」的调用（每个文件用的函数名不一样，见 FILES），读出键和后面那个 { 变量: … } 里的变量名。
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fillRefs } from '../src/data/refs.js';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
// 文件 → 这个文件里哪些函数是从 文本.xlsx 取字（actions.js 里的 T / say 取的是 行动.xlsx，不算）
const FILES = {
  'src/game/engine.js': ['tx', 'text'], 'src/game/ideology.js': ['vt', 'text'], 'src/game/advice.js': ['T', 'text'], 'src/game/actions.js': ['vt'],
  'src/ui/ui.js': ['ut', 'uh', 'ivh', 'lines', 'text', 'vt'], 'src/ui/tutorial.js': ['text'],
};
// 键是拼出来的（代码里看不到完整的键）：这些前缀下的键都算有人用；后面是这些键允许出现的 {变量}
const DYNAMIC = { 'chip.': [], 'fx.staff.': [], 'ideo.end.': [], 'ui.end.': ['月数'], 'ui.rtab.': [], 'ideo.page.result.': [], 'tut.': ['流血线', '监管线'] };

function skipString(s, i) {
  const q = s[i]; i++;
  while (i < s.length) {
    if (s[i] === '\\') { i += 2; continue; }
    if (q === '`' && s[i] === '$' && s[i + 1] === '{') { i = skipBalanced(s, i + 1); continue; }
    if (s[i] === q) return i + 1;
    i++;
  }
  return i;
}
function skipBalanced(s, i) {
  let depth = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "'" || c === '"' || c === '`') { i = skipString(s, i); continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { depth--; if (!depth) return i + 1; }
    i++;
  }
  return i;
}
// 对象字面量 { 名字: …, …rest } 的键；spread = 里面有 ...xxx（变量不全知道）
function objKeys(s, i) {
  const end = skipBalanced(s, i), keys = [];
  let spread = false, j = i + 1, start = true;
  while (j < end - 1) {
    const c = s[j];
    if (c === "'" || c === '"' || c === '`') { j = skipString(s, j); start = false; continue; }
    if (c === '(' || c === '[' || c === '{') { j = skipBalanced(s, j); start = false; continue; }
    if (c === ',') { start = true; j++; continue; }
    if (start && /\s/.test(c)) { j++; continue; }
    if (start) { if (s.startsWith('...', j)) spread = true; else { const m = /^([\p{L}\p{N}_$]+)\s*:/u.exec(s.slice(j, j + 40)); if (m) keys.push(m[1]); } start = false; }
    j++;
  }
  return { keys, spread };
}
const lineOf = (s, i) => s.slice(0, i).split('\n').length;

export function checkTexts(root = ROOT) {
  const T = JSON.parse(readFileSync(path.join(root, 'src/data/tables/text.json'), 'utf8'));
  const { P } = JSON.parse(readFileSync(path.join(root, 'src/data/tables/params.json'), 'utf8'));
  const param = token => token.split(/[:：]/)[0].includes('.');
  const where = key => `文本.xlsx › ${T.SHEET[key] || '?'} › ${key}`;
  const errors = [], warnings = [], used = new Set(), literal = new Set();
  const phs = e => [...new Set([e.text, e.bay].filter(x => x != null).flatMap(s => [...s.matchAll(/\{([^{}\s]+)\}/g)].map(m => m[1])))];
  let calls = 0;
  for (const [file, fns] of Object.entries(FILES)) {
    const src = readFileSync(path.join(root, file), 'utf8');
    for (const m of src.matchAll(/'([\w]+(?:\.[\w]+)+|date)'/g)) if (m[1] in T.TEXT) used.add(m[1]);    // 出现过的字符串字面量都算「有人用」（三元表达式里的键也算上）
    const re = new RegExp(`(?<![\\w$])(?:IDEO\\.)?(${fns.join('|')})\\s*\\(\\s*(?:S2?\\s*,\\s*)?(['"])([\\w.]+)\\2`, 'g');
    for (const m of src.matchAll(re)) {
      const key = m[3], at = `${file}:${lineOf(src, m.index)}`;
      if (/^\s*\+/.test(src.slice(m.index + m[0].length, m.index + m[0].length + 4))) continue;   // 'chip.' + k 这种拼出来的键：按 DYNAMIC 处理
      calls++; literal.add(key);
      if (!(key in T.TEXT)) { errors.push(`${at}：用了 文本.xlsx 里没有的键「${key}」`); continue; }
      used.add(key);
      let j = m.index + m[0].length;
      while (/\s/.test(src[j])) j++;
      let vars = [], known = true;
      if (src[j] === ',') {
        j++; while (/\s/.test(src[j])) j++;
        if (src[j] === '{') { const o = objKeys(src, j); vars = o.keys; known = !o.spread; }
        else if (!src.startsWith('null', j) && src[j] !== ')') known = false;               // 变量是另外拼好的对象，看不出来
      }
      if (!known) continue;
      for (const p of phs(T.TEXT[key])) if (!param(p) && !vars.includes(p)) errors.push(`${where(key)}：「{${p}}」代码不会填（${at} 只给了 ${vars.length ? vars.map(v => `{${v}}`).join(' ') : '没有变量'}）`);
    }
  }
  for (const [key, e] of Object.entries(T.TEXT)) {
    for (const token of phs(e).filter(param)) {
      const ref = `{${token}}`;
      if (fillRefs(ref, { P }) === ref) errors.push(`${where(key)}：${ref} 找不到平衡参数或格式不正确`);
    }
    const pre = Object.keys(DYNAMIC).find(p => key.startsWith(p));
    if (pre && !literal.has(key)) { used.add(key); for (const p of phs(e)) if (!param(p) && !DYNAMIC[pre].includes(p)) errors.push(`${where(key)}：「{${p}}」代码不会填（这一类键只认 ${DYNAMIC[pre].map(v => `{${v}}`).join(' ') || '没有变量'}）`); }
    if (!used.has(key)) warnings.push(`${where(key)}：代码里没有用到这个键`);
  }
  return { errors, warnings, calls, keys: Object.keys(T.TEXT).length };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = checkTexts();
  for (const w of r.warnings) console.log('⚠ ' + w);
  for (const e of r.errors) console.log('✗ ' + e);
  console.log(`${r.errors.length ? '✗' : '✓'} 文本.xlsx：${r.keys} 个键、代码里 ${r.calls} 处取字${r.errors.length ? `，${r.errors.length} 处问题` : '，都对得上'}${r.warnings.length ? `；${r.warnings.length} 个键没人用` : ''}`);
  process.exit(r.errors.length ? 1 : 0);
}

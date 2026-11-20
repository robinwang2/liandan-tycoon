// 列类型：表头第 3 行写的名字 → 怎么把格子读成数据（dec）、怎么把数据写回格子（enc）。
// 读的时候出错就抛异常，外面会补上「哪本表、哪张、第几行、哪一列」。
import { DslError, numText, pctToNum, numToPct } from './dsl.mjs';
import { ATTR_ZH, ATTR_ID } from './vocab.mjs';

const fail = msg => { throw new DslError(msg); };
const isNumText = s => /^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(s);
const toNum = v => {
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (!isNumText(s)) fail(`这里要填数字，现在是「${s}」`);
  return Number(s);
};
const toText = v => (v instanceof Date ? fail('这一格被表格软件当成了日期，请把格子设成「文本」格式再填') : typeof v === 'boolean' ? fail('这里要填文字') : String(v));
const YES = new Set(['是', '√', '✓', '✔', 'true', 'TRUE', 'True', '1', 'yes', 'Y', 'y']), NO = new Set(['否', '×', '✗', 'false', 'FALSE', 'False', '0', 'no', 'N', 'n']);

export function makeTypes(V) {
  const T = new Map();
  const def = (names, t) => { t.name = names[0]; for (const n of names) T.set(n, t); };

  def(['文本', 'text', 'string'], { dec: toText, enc: v => (typeof v === 'string' ? v : fail(`要的是文字，拿到的是 ${JSON.stringify(v)}`)) });
  def(['标识', 'id'], {
    dec: v => { const s = toText(v).trim(); if (!/^[\w.\-]+$/.test(s)) fail(`标识只能用英文字母、数字、下划线、点和连字符，现在是「${s}」`); return s; },
    enc: v => (typeof v === 'string' && /^[\w.\-]+$/.test(v) ? v : fail(`不像一个标识：${JSON.stringify(v)}`)),
  });
  def(['整数', 'int'], { dec: v => { const n = toNum(v); if (!Number.isInteger(n)) fail(`这里要填整数，现在是 ${n}`); return n; }, enc: v => (Number.isInteger(v) ? v : fail(`要的是整数：${JSON.stringify(v)}`)) });
  def(['小数', 'num', 'number', 'float'], { dec: toNum, enc: v => (typeof v === 'number' && Number.isFinite(v) ? v : fail(`要的是数字：${JSON.stringify(v)}`)) });
  def(['是否', 'bool'], {
    dec: v => { if (typeof v === 'boolean') return v; const s = String(v).trim(); if (YES.has(s)) return true; if (NO.has(s)) return false; fail(`这里只能填「是」或「否」，现在是「${s}」`); },
    enc: v => (v === true ? '是' : v === false ? '否' : fail(`要的是 true / false：${JSON.stringify(v)}`)),
  });
  def(['列表', 'list'], {                                           // 逗号隔开的一串标识或短词
    dec: v => toText(v).split(/[,，]/).map(s => s.trim()).filter(Boolean),
    enc: v => (Array.isArray(v) && v.every(x => typeof x === 'string' && x && !/[,，\n]/.test(x)) ? v.join(', ') : fail(`要的是一串短词：${JSON.stringify(v)}`)),
  });
  def(['多行', 'lines'], {                                           // 每行一项
    dec: v => toText(v).split('\n').map(s => s.trim()).filter(Boolean),
    enc: v => (Array.isArray(v) && v.every(x => typeof x === 'string' && x && !x.includes('\n')) ? v.join('\n') : fail(`要的是若干行文字：${JSON.stringify(v)}`)),
  });
  def(['数或数列', 'nums'], {                                        // 一个数，或者逗号隔开的一串数（比如按名次排的系数）
    dec: v => { if (typeof v === 'number') return v; const parts = toText(v).split(/[,，]/).map(s => s.trim()); if (parts.length > 1) { if (parts.some(s => !s)) fail('一串数中间不能有空项'); return parts.map(toNum); } return toNum(parts[0]); },
    enc: v => (Array.isArray(v) && v.length > 1 && v.every(x => typeof x === 'number' && Number.isFinite(x)) ? v.map(numText).join(', ') : typeof v === 'number' && Number.isFinite(v) ? v : fail(`要的是一个数或一串数：${JSON.stringify(v)}`)),
  });
  def(['JSON', 'json'], { dec: v => { try { return JSON.parse(toText(v)); } catch (e) { fail('JSON 格式不对：' + e.message); } }, enc: v => JSON.stringify(v) });

  // 格子写法（效果、条件……）。写的时候先按格子写法来，写不了或者读回来对不上，就退回成 JSON（并记一笔）
  const dsl = (names, d) => def(names, {
    dsl: d,
    dec: (v, ctx) => d.parse(toText(v), ctx),
    enc: (v, ctx) => {
      if (v == null || typeof v !== 'object' || Array.isArray(v)) fail(`要的是一组「键: 值」：${JSON.stringify(v)}`);
      if (!Object.keys(v).length) return undefined;                 // 空的就留空格子
      let err = null;
      try {
        const c2 = { ...ctx }, s = d.format(v, c2), back = d.parse(s, { ...c2, project: id => c2.projectOf?.(id) });
        if (JSON.stringify(back) === JSON.stringify(v)) { if (ctx) Object.assign(ctx, c2); return s; }
        err = `读回来对不上：${s}`;
      } catch (e) { if (!(e instanceof DslError)) throw e; err = e.message; }
      ctx?.fallback?.(d.name, v, err);
      return JSON.stringify(v);
    },
  });
  dsl(['效果', 'fx'], V.fx); dsl(['条件', 'when'], V.when); dsl(['修正', 'mods'], V.mods);
  dsl(['属性', 'attr'], V.attr); dsl(['开局', 'start'], V.start); dsl(['进度条', 'bars'], V.bars);

  // 参数：给脚本用的几个数，「名字=数」用空格隔开，比如 到账=5 期限=6；一串数用逗号隔开，比如 名次热度=30,20,13
  def(['参数', 'params'], {
    dec: v => {
      const o = {};
      for (const tok of toText(v).trim().split(/[\s　]+/)) {
        const m = /^([^=＝\s]+)[=＝](\S+)$/.exec(tok);
        if (!m) fail(`参数要写成「名字=数」，几个参数之间用空格隔开；这里是「${tok}」`);
        if (m[1] in o) fail(`参数「${m[1]}」重复了`);
        const parts = m[2].split(/[,，]/);
        if (!parts.every(isNumText)) fail(`参数「${m[1]}」的值要是数字（一串数用逗号隔开）：「${m[2]}」`);
        o[m[1]] = parts.length > 1 ? parts.map(Number) : Number(parts[0]);
      }
      return o;
    },
    enc: v => {
      if (!v || typeof v !== 'object' || Array.isArray(v)) fail(`要的是一组参数：${JSON.stringify(v)}`);
      if (!Object.keys(v).length) return undefined;
      return Object.entries(v).map(([k, n]) => {
        if (/[\s=＝]/.test(k)) fail(`参数名「${k}」里不能有空格和等号`);
        if (Array.isArray(n) && n.length > 1 && n.every(x => typeof x === 'number')) return `${k}=${n.map(numText).join(',')}`;
        if (typeof n !== 'number') fail(`参数「${k}」得是数字或一串数字：${JSON.stringify(n)}`);
        return `${k}=${numText(n)}`;
      }).join(' ');
    },
  });

  // 检定：「口才 14」= 属性检定，「55%」= 看运气
  def(['检定', 'check'], {
    dec: v => {
      if (typeof v === 'number') { if (v > 0 && v <= 1) return { odds: v }; fail(`概率要写成百分数，比如 55%（现在是 ${v}）`); }
      const s = toText(v).trim(); let m;
      if ((m = /^(?:概率\s*)?(\d+(?:\.\d+)?)\s*%$/.exec(s))) return { odds: pctToNum(m[1]) };
      if ((m = /^(\S+?)\s*(\d+(?:\.\d+)?)$/.exec(s)) && ATTR_ID[m[1]]) return { check: { attr: ATTR_ID[m[1]], dc: Number(m[2]) } };
      fail(`检定写得不对：「${s}」。属性检定写「口才 14」，看运气写「55%」`);
    },
    enc: v => {
      if (v.odds != null) return numToPct(v.odds) + '%';
      const c = v.check;
      if (!c || !ATTR_ZH[c.attr] || typeof c.dc !== 'number' || Object.keys(c).join() !== 'attr,dc') fail(`检定的结构不认识：${JSON.stringify(v)}`);
      return `${ATTR_ZH[c.attr]} ${numText(c.dc)}`;
    },
  });
  return T;
}

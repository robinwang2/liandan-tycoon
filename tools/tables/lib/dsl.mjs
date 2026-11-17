// 格子里的「效果 / 条件 / 修正」写法。
// 一个格子 = 若干用空格或换行隔开的小项，每个小项对应数据里的一个键，例如：
//     现金+8 股权-7 热度+15 标记:agi_claim 临时:收入×1.12/6月
// 小项只有四种样子：
//     名字+数 / 名字-数      增减（有的带 %）          现金+8   用户+12%
//     名字×数 / 名字≥数 / 名字≤数                      收入×1.12   月份≥4   士气≤45
//     名字:内容              指向某个 id 或带结构的内容   标记:agi_claim   后续:gala_meme/2月
//     名字                   开关                        自研模型   抽董事会卡
// 中文关键字和英文字段名都认（cash+8 也行）。小项的先后顺序会原样保留：效果是按顺序执行的。
//
// 词表（vocab）是一组条目，每个条目说明「数据里的哪个键 ↔ 格子里怎么写」：
//   { key, zh, alias?, kind: 'delta' }              名字±数
//   { key, zh, kind: 'delta', pct: true }           名字±数%
//   { key, zh, kind: 'mult' }                       名字×数
//   { key, zh, kind: 'min' | 'max' }                名字≥数 / 名字≤数
//   { key, zh, kind: 'id' }                         名字:值（字符串）
//   { key, zh, kind: 'ids' }                        名字:a,b（一个时是字符串，多个时是数组）
//   { key, kind: 'bool', on, off }                  两个开关词，分别表示 true / false
//   { key, zh, kind: 'const', value }               一个开关词，表示固定的值
//   { key, kind: 'sub', vocab: [...] }              子词表：里面的小项收进 数据[key] 这个对象里（比如 人脉+1 → attr.net）
//   { key, zh, kind: 'custom', parse, format, many? }   名字:内容，自己解析；many = 同一个键可以写多项（多项时是数组）

export class DslError extends Error {}

const NUM = String.raw`(?:\d+(?:\.\d+)?|\.\d+)`;
const RE_CMP = new RegExp(`^(.+?)(≥|>=|≤|<=|×|\\*)(-?${NUM})(%?)$`);
const RE_DELTA = new RegExp(`^(.+?)([+\\-＋－])(${NUM})(%?)$`);
const RE_COLON = /^([^:：]+)[:：]([\s\S]*)$/;

// 数字 → 文本：不要科学计数法
export function numText(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new DslError(`不是数字：${JSON.stringify(n)}`);
  const s = String(n);
  if (/e/i.test(s)) throw new DslError(`数字太大或太小，没法写进格子：${s}`);
  return s;
}
const signed = n => (n < 0 || Object.is(n, -0) ? '-' + numText(-n) : '+' + numText(n));
const opClass = op => (op === '≥' || op === '>=' ? 'min' : op === '≤' || op === '<=' ? 'max' : 'mult');
const OP_ZH = { min: '≥', max: '≤', mult: '×' };

export function makeDsl(name, vocab) {
  // 查找表：写法类别 + 名字 → 怎么放进数据
  const byForm = new Map(), byKey = new Map();
  const reg = (form, word, h) => {
    const id = form + '|' + word;
    if (byForm.has(id)) throw new Error(`词表「${name}」里「${word}」（${form}）重复了`);
    byForm.set(id, h);
  };
  const formOf = e => (e.kind === 'delta' ? (e.pct ? 'delta%' : 'delta') : e.kind === 'mult' || e.kind === 'min' || e.kind === 'max' ? e.kind : e.kind === 'id' || e.kind === 'ids' || e.kind === 'custom' ? 'colon' : 'bare');
  const add = (e, parent) => {
    if (e.kind === 'sub') { byKey.set(e.key, e); e.byKey = new Map(e.vocab.map(x => [x.key, x])); for (const x of e.vocab) add(x, e); return; }
    if (!parent) byKey.set(e.key, e);
    const h = { e, parent };
    if (e.kind === 'bool') { reg('bare', e.on, { ...h, value: true }); reg('bare', e.off, { ...h, value: false }); return; }
    const words = [e.zh, ...(e.alias || [])];
    if (!e.noKey && !(parent && parent.noKey)) words.push(parent ? `${parent.key}.${e.key}` : e.key);
    for (const w of new Set(words.filter(Boolean))) reg(formOf(e), w, h);
  };
  for (const e of vocab) add(e, null);
  const words = [...new Set([...byForm.keys()].map(k => k.split('|')[1]))];

  const unknown = tok => {
    const near = words.filter(w => tok.includes(w) || w.includes(tok.replace(/[+\-×≥≤:：].*$/, ''))).slice(0, 6);
    return new DslError(`不认识的写法「${tok}」${near.length ? `（相近的关键字：${near.join('、')}）` : ''}`);
  };

  function put(obj, h, value, tok) {
    const { e, parent } = h;
    const target = parent ? (obj[parent.key] ??= {}) : obj;
    if (e.kind === 'custom' && e.many) { target[e.key] = e.key in target ? [].concat(target[e.key], [value]) : value; return; }
    if (e.kind === 'custom' && e.merge) {                             // 多个小项合成一个对象（政策:work=996 政策:safety=loose）
      const cur = (target[e.key] ??= {});
      for (const k in value) { if (k in cur) throw new DslError(`「${tok}」重复了`); cur[k] = value[k]; }
      return;
    }
    if (e.key in target) throw new DslError(`「${tok}」重复了：同一个格子里「${e.zh || e.key}」只能写一次`);
    target[e.key] = value;
  }

  function parse(text, ctx = {}) {
    const obj = {};
    if (text == null) return obj;
    const src = String(text).trim();
    if (!src) return obj;
    if (src.startsWith('{')) { try { return JSON.parse(src); } catch (err) { throw new DslError(`以 { 开头的格子按 JSON 读，但格式不对：${err.message}`); } }
    for (const tok of src.split(/[\s　]+/)) {
      if (!tok) continue;
      let m, h;
      if ((m = RE_COLON.exec(tok)) && (h = byForm.get('colon|' + m[1]))) {
        const e = h.e, body = m[2];
        if (body === '') throw new DslError(`「${tok}」冒号后面缺内容`);
        let v;
        if (e.kind === 'id') v = body;
        else if (e.kind === 'ids') { const list = body.split(/[,，]/).map(s => s.trim()).filter(Boolean); v = list.length === 1 ? list[0] : list; }
        else v = e.parse(body, ctx, tok);
        put(obj, h, v, tok);
      } else if ((m = RE_CMP.exec(tok)) && (h = byForm.get(opClass(m[2]) + '|' + m[1]))) {
        if (m[4]) throw new DslError(`「${tok}」不该带 %`);
        put(obj, h, Number(m[3]), tok);
      } else if ((m = RE_DELTA.exec(tok)) && (h = byForm.get((m[4] ? 'delta%|' : 'delta|') + m[1]))) {
        const n = Number(m[3]);
        put(obj, h, m[2] === '-' || m[2] === '－' ? -n : n, tok);
      } else if ((h = byForm.get('bare|' + tok))) {
        put(obj, h, 'value' in h ? h.value : h.e.value, tok);
      } else {
        // 给出更有用的提示：写法对但少了 % 或多了 %
        if ((m = RE_DELTA.exec(tok)) && byForm.get((m[4] ? 'delta|' : 'delta%|') + m[1])) throw new DslError(`「${tok}」${m[4] ? '不该带 %' : '要带 %，写成 ' + tok + '%'}`);
        throw unknown(tok);
      }
    }
    return obj;
  }

  function fmtEntry(e, v, ctx, parent) {
    const word = e.zh || (parent ? `${parent.key}.${e.key}` : e.key);
    switch (e.kind) {
      case 'delta': return [word + signed(v) + (e.pct ? '%' : '')];
      case 'mult': case 'min': case 'max': return [word + OP_ZH[e.kind] + numText(v)];
      case 'id': if (typeof v !== 'string' || !v || /\s/.test(v)) throw new DslError(`「${word}」的值得是不带空格的文字：${JSON.stringify(v)}`); return [word + ':' + v];
      case 'ids': {
        const list = [].concat(v);
        if (Array.isArray(v) && v.length < 2) throw new DslError(`「${word}」只有一个值时不该是数组`);
        if (list.some(x => typeof x !== 'string' || !x || /[\s,，]/.test(x))) throw new DslError(`「${word}」的值不对：${JSON.stringify(v)}`);
        return [word + ':' + list.join(',')];
      }
      case 'bool': if (typeof v !== 'boolean') throw new DslError(`「${e.key}」得是 true / false`); return [v ? e.on : e.off];
      case 'const': if (v !== e.value) throw new DslError(`「${e.key}」只能是 ${JSON.stringify(e.value)}`); return [word];
      case 'custom': return (e.many ? [].concat(v) : [v]).flatMap(x => [].concat(e.format(x, ctx))).map(s => { if (typeof s !== 'string' || !s || /\s/.test(s)) throw new DslError(`「${word}」的内容不能为空、也不能有空格：${JSON.stringify(s)}`); return word + ':' + s; });
      default: throw new Error('未知的词表类型 ' + e.kind);
    }
  }
  function format(obj, ctx = {}) {
    const out = [];
    for (const [k, v] of Object.entries(obj)) {
      // 同一个键可能有几种写法（比如 perk: 'draft' → 抽董事会卡，其他值 → 董事会卡:xxx）：挑第一个接得住这个值的
      const cands = vocab.filter(e => e.key === k);
      if (!cands.length) throw new DslError(`词表「${name}」里没有「${k}」这个键`);
      let done = false, lastErr;
      for (const e of cands) {
        try {
          if (e.kind === 'sub') {
            if (!v || typeof v !== 'object' || Array.isArray(v)) throw new DslError(`「${k}」得是一个对象`);
            for (const [sk, sv] of Object.entries(v)) { const se = e.byKey.get(sk); if (!se) throw new DslError(`「${k}」里没有「${sk}」这个键`); out.push(...fmtEntry(se, sv, ctx, e)); }
            if (!Object.keys(v).length) throw new DslError(`「${k}」是空的，没法写进格子`);
          } else out.push(...fmtEntry(e, v, ctx, null));
          done = true; break;
        } catch (err) { if (!(err instanceof DslError)) throw err; lastErr = err; }
      }
      if (!done) throw lastErr;
    }
    return out.join(' ');
  }
  // 说明文档用：这个词表里所有的写法
  const doc = () => {
    const rows = [];
    const one = (e, parent) => {
      const word = e.zh || e.key, key = parent ? `${parent.key}.${e.key}` : e.key;
      const form = e.kind === 'delta' ? `${word}+数${e.pct ? '%' : ''}` : e.kind === 'mult' ? `${word}×数` : e.kind === 'min' ? `${word}≥数` : e.kind === 'max' ? `${word}≤数` : e.kind === 'id' ? `${word}:值` : e.kind === 'ids' ? `${word}:值,值` : e.kind === 'bool' ? `${e.on} / ${e.off}` : e.kind === 'const' ? word : `${word}:${e.usage || '…'}`;
      rows.push({ form, key, note: e.note || '' });
    };
    for (const e of vocab) { if (e.kind === 'sub') for (const x of e.vocab) one(x, e); else one(e, null); }
    return rows;
  };
  return { name, parse, format, doc };
}

// 百分数文本 ⇄ 小数，按十进制挪小数点（不做乘除，免得 0.55 变成 0.5500000000000001）
export function pctToNum(s) {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new DslError(`百分数写得不对：${s}%`);
  const int = m[1].padStart(3, '0'), frac = m[2] || '';
  return Number(int.slice(0, -2) + '.' + int.slice(-2) + frac);
}
export function numToPct(n) {
  const s = numText(n), m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new DslError(`概率得是 0~1 之间的数：${s}`);
  const frac = (m[2] || '').padEnd(2, '0');
  const out = (m[1] + frac.slice(0, 2)).replace(/^0+(?=\d)/, '') + (frac.length > 2 ? '.' + frac.slice(2) : '');
  return out;
}

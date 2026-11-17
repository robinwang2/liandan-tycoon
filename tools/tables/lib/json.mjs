// 导出的 JSON 要进 git、要能看 diff：短的对象写在一行，长的才展开；键的顺序原样保留。
const WIDTH = 150;

export function pretty(v, ind = '') {
  const flat = JSON.stringify(v);
  if (flat === undefined) return 'null';
  if (v === null || typeof v !== 'object' || flat.length + ind.length <= WIDTH) return flat;
  const ind2 = ind + ' ';
  if (Array.isArray(v)) return '[\n' + v.map(x => ind2 + pretty(x, ind2)).join(',\n') + '\n' + ind + ']';
  const ent = Object.entries(v).filter(([, x]) => x !== undefined);
  return '{\n' + ent.map(([k, x]) => ind2 + JSON.stringify(k) + ':' + pretty(x, ind2)).join(',\n') + '\n' + ind + '}';
}

// 比较两份数据。strict = 连对象里键的先后顺序也要一样
export function sameData(a, b, strict = true) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => sameData(x, b[i], strict));
  const ka = Object.keys(a).filter(k => a[k] !== undefined), kb = Object.keys(b).filter(k => b[k] !== undefined);
  if (ka.length !== kb.length) return false;
  if (strict) return ka.every((k, i) => k === kb[i] && sameData(a[k], b[k], strict));
  return ka.every(k => k in b && sameData(a[k], b[k], strict));
}
// 找出第一处不一样的地方（给人看的路径）
export function firstDiff(a, b, strict = true, at = '') {
  if (a === b) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object' || Array.isArray(a) !== Array.isArray(b)) return `${at || '(根)'}：${short(a)} ≠ ${short(b)}`;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return `${at}：长度 ${a.length} ≠ ${b.length}`;
    for (let i = 0; i < a.length; i++) { const d = firstDiff(a[i], b[i], strict, `${at}[${i}]`); if (d) return d; }
    return null;
  }
  const ka = Object.keys(a).filter(k => a[k] !== undefined), kb = Object.keys(b).filter(k => b[k] !== undefined);
  for (const k of ka) if (!(k in b) || b[k] === undefined) return `${at}.${k}：只有前者有（${short(a[k])}）`;
  for (const k of kb) if (!(k in a) || a[k] === undefined) return `${at}.${k}：只有后者有（${short(b[k])}）`;
  if (strict && ka.join() !== kb.join()) return `${at}：键的顺序不同 [${ka.join(',')}] ≠ [${kb.join(',')}]`;
  for (const k of ka) { const d = firstDiff(a[k], b[k], strict, `${at}.${k}`); if (d) return d; }
  return null;
}
const short = v => { let s = typeof v === 'function' ? 'function' : JSON.stringify(v); s = String(s); return s.length > 90 ? s.slice(0, 90) + '…' : s; };

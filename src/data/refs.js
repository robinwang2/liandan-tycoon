// 表格文字里引用「数」的 {变量}：说明里的数直接读这一条记录自己的数、或者平衡参数，改了数，字跟着变。
//
// 写法：{名字} 或者 {名字:格式}（冒号写全角的也行，几个格式可以连着写：{抬价倍数:增:去号}）
// 名字按这个顺序找：
//   1. 代码填的变量（比如行动说明里的 {成功率}、「参数」列里的数）
//   2. 平衡参数的键（比如 {ach.m100}、{meta.cash}）
//   3. 这一条记录自己的数，写成 列名.名字：
//        {修正.显卡价格}  {效果.热度}  {失败效果.士气}  {临时.总成本}（效果里的限时修正）  {开局.现金}  {属性.技术}
//      设定.xlsx 里的说明可以省掉列名，直接写 {显卡价格} {技术} {现金}；这条记录自己的数字列也能直接引用（比如员工怪癖的 {产出}）
// 格式（不写的话：倍数写成增减百分比 ×1.2 → +20%，月流失写成带正负号的百分比，其他记录里的数带正负号；代码填的变量原样写）：
//   增   倍数 → 增减百分比：1.5 → +50%          %    小数 → 百分比：0.05 → 5%
//   ±    正数前面加 +                           去号  去掉正负号：-12 → 12、-25% → 25%
//   ×    写成 ×1.5                              万    金额或用户（单位万）：100 → 100 万、20000 → 2 亿
//   月   限时修正持续几个月（只对 {临时.名字} 有用）
// 找不到的 {名字} 原样留着（可能是之后才填的变量）；tools/validate.mjs 会检查设定.xlsx 里的说明有没有落空的。

// 「效果」「开局」两列的中文名（和 tools/tables/lib/vocab.mjs 的格子写法一致）
export const FX_ZH = { 现金: 'cash', 现金额: 'cashAbs', 热度: 'hype', 口碑: 'rep', 士气: 'morale', 泡沫: 'bubble', 监管: 'reg', 监管压力: 'reg', 用户: 'usersPct', 模型能力: 'tech', 跑分: 'bench', 体验: 'quality', 产品体验: 'quality', 配额: 'quota', 显卡配额: 'quota', 股权: 'equity', 行动点: 'ap', 下月行动点: 'ap' };
export const START_ZH = { 现金: 'cash', 现金倍数: 'cashMult', 口碑: 'rep', 热度: 'hype', 用户: 'users', 模型能力: 'tech', 股权: 'equity', 监管: 'reg', 欠债: 'debt' };
const PCT_POINT = new Set(['churnAdd']);                          // 「修正」里本身是小数的加成（0.02 = 2%）

const num = n => String(+n.toFixed(6));                          // 去掉浮点尾巴：0.30000000000000004 → 0.3
// 按格式写一个数。kind：'mult' 倍数 / 'pct' 小数百分比 / 'delta' 记录里的增减量 / 'raw' 代码给的值
export function fmtNum(v, fmts, kind = 'raw') {
  if (typeof v !== 'number') return String(v);
  const list = fmts.length ? fmts : kind === 'mult' ? ['增'] : kind === 'pct' ? ['%', '±'] : kind === 'delta' ? ['±'] : [];
  let n = v, sign = false, pct = false, pre = '';
  for (const f of list) {
    if (f === '增') { n = (n - 1) * 100; pct = true; sign = true; }
    else if (f === '%') { n *= 100; pct = true; }
    else if (f === '±') sign = true;
    else if (f === '去号') { n = Math.abs(n); sign = false; }
    else if (f === '×') pre = '×';
    else if (f === '万') return Math.abs(n) >= 10000 ? `${num(n / 10000)} 亿` : `${num(n)} 万`;
    else if (f === '数') { /* 原样 */ }
    else return null;                                              // 不认识的格式
  }
  return pre + (sign && n > 0 ? '+' : '') + num(n) + (pct ? '%' : '');
}

// 在一条记录里找名字对应的数：返回 { v, kind, months } 或 null；有歧义（两列里都有）返回 { ambiguous: [...] }
// ctx：{ rec, mods: { 中文名 → 修正id }, attrs: { 中文名 → 属性id }, fields: { 中文名 → 字段 }, bare: 是否允许省掉列名 }
export function findRef(name, ctx) {
  const { rec, mods = {}, attrs = {}, fields = {} } = ctx, dot = name.indexOf('.');
  const col = dot > 0 ? name.slice(0, dot) : null, key = dot > 0 ? name.slice(dot + 1) : name;
  const hits = [];
  const add = (where, v, kind, months) => { if (typeof v === 'number') hits.push({ where, v, kind, months }); };
  const tempOf = list => [].concat(list || []).find(t => t.key === mods[key]);
  if (!rec) return null;
  if (!col || col === '修正') { const id = mods[key]; if (id && rec.mods && id in rec.mods) add('修正', rec.mods[id], id.endsWith('Mult') ? 'mult' : PCT_POINT.has(id) ? 'pct' : 'delta'); }
  if (!col || col === '效果') { const id = FX_ZH[key]; if (id && rec.fx && id in rec.fx) add('效果', rec.fx[id], 'delta'); if (attrs[key] && rec.fx?.attr && attrs[key] in rec.fx.attr) add('效果', rec.fx.attr[attrs[key]], 'delta'); }
  if (col === '失败效果') { const id = FX_ZH[key], f = rec.failFx || rec.fail?.fx; if (id && f && id in f) add('失败效果', f[id], 'delta'); }
  if (col === '临时') { const t = tempOf(rec.fx?.temp) || tempOf(rec.ok?.fx?.temp); if (t) add('临时', t.mult ?? t.add, t.mult != null ? 'mult' : PCT_POINT.has(t.key) ? 'pct' : 'delta', t.months); }
  if (!col || col === '开局') { const id = START_ZH[key]; if (id && rec.start && id in rec.start) add('开局', rec.start[id], id === 'cashMult' ? 'mult' : 'delta'); }
  if (!col || col === '属性') { const id = attrs[key]; if (id && rec.attr && id in rec.attr) add('属性', rec.attr[id], 'delta'); }
  if (!col && fields[key] && typeof rec[fields[key][0]] === 'number') add('字段', rec[fields[key][0]], fields[key][1] || 'raw');
  if (!hits.length) return null;
  if (!col && !ctx.bare) return null;                               // 行动、事件里省掉列名的名字，留给代码填的变量
  if (hits.length > 1) return { ambiguous: hits.map(h => h.where) };
  return hits[0];
}

// 把一段字里的 {变量} 填上。vars = 代码给的变量；P = 平衡参数；ctx 见 findRef。返回填好的字
export function fillRefs(text, { vars, P, ...ctx } = {}) {
  if (text == null) return text;
  return String(text).replace(/\{([^{}\s:：]+)((?:[:：][^{}\s:：]+)*)\}/g, (m, name, f) => {
    const fmts = f ? f.split(/[:：]/).filter(Boolean) : [];
    if (vars && name in vars) { const v = vars[name]; return fmts.length ? fmtNum(v, fmts) ?? m : v; }
    if (P && name in P) return fmtNum(P[name], fmts) ?? m;
    const r = findRef(name, ctx);
    if (!r || r.ambiguous) return m;
    if (fmts[0] === '月') return r.months != null ? fmtNum(r.months, fmts.slice(1)) ?? m : m;
    return fmtNum(r.v, fmts, r.kind) ?? m;
  });
}
// 一段字里落空的 {变量}（给校验用）：known = 代码会填的变量名
export function missingRefs(text, { known = [], P, ...ctx } = {}) {
  const out = [];
  for (const m of String(text ?? '').matchAll(/\{([^{}\s:：]+)((?:[:：][^{}\s:：]+)*)\}/g)) {
    const [, name, f] = m, fmts = f ? f.split(/[:：]/).filter(Boolean) : [];
    if (fmts.some(x => fmtNum(1, [x]) == null && x !== '月')) { out.push(`{${name}${f}}：不认识的格式`); continue; }
    if (known.includes(name) || (P && name in P)) continue;
    const r = findRef(name, ctx);
    if (r?.ambiguous) out.push(`{${name}}：${r.ambiguous.join('、')}里都有，写成 {列名.${name}}`);
    else if (!r) out.push(`{${name}}：找不到这个数`);
  }
  return out;
}

// 设定.xlsx 里引用了数的说明：哪张表、哪个字段、这张表自己的数字列叫什么（{产出} = 员工怪癖的 out 列）
export const DEF_FIELDS = {
  PERKS: { field: 'desc' }, FEATURES: { field: 'desc' }, GOALS: { field: 'desc' }, POLICIES: { field: 'desc' }, REGIONS: { field: 'desc' }, TRAITS: { field: 'desc' },
  STAFF_QUIRKS: { field: 'desc', fields: { 产出: ['out'], 工资: ['pay'] } }, DATA_SOURCES: { field: 'desc', fields: { 效率: ['mult', 'mult'] } },
  META_SHOP: { field: 'name' }, ACHIEVEMENTS: { field: 'desc' }, ATTRS: { field: 'desc' },
};
// 设定.xlsx 每一条要填的说明：[表名, id, 记录, 字段（或数组下标）, 宿主对象]
export function defTexts(D) {
  const out = [], rows = (name, list) => list.forEach(([id, rec]) => {
    const host = rec, f = DEF_FIELDS[name].field;
    if (Array.isArray(rec[f])) rec[f].forEach((_, i) => out.push([name, id, rec, i, rec[f]]));
    else if (typeof rec[f] === 'string') out.push([name, id, rec, f, host]);
  });
  rows('PERKS', D.PERKS.map(p => [p.id, p])); rows('FEATURES', D.FEATURES.map(p => [p.id, p])); rows('GOALS', Object.entries(D.GOALS));
  rows('POLICIES', Object.entries(D.POLICIES).flatMap(([k, pol]) => Object.entries(pol.opts).map(([v, o]) => [`${k}.${v}`, o])));
  rows('REGIONS', Object.entries(D.REGIONS)); rows('TRAITS', Object.values(D.TRAITS).flat().map(t => [t.id, t]));
  rows('STAFF_QUIRKS', Object.entries(D.STAFF_QUIRKS)); rows('DATA_SOURCES', Object.entries(D.DATA_SOURCES));
  rows('META_SHOP', D.META_SHOP.map(m => [m.id, m])); rows('ACHIEVEMENTS', Object.entries(D.ACHIEVEMENTS)); rows('ATTRS', D.ATTRS.map(a => [a.id, a]));
  return out;
}
export const refMaps = D => ({ mods: Object.fromEntries(D.MODS.map(m => [m.zh, m.id])), attrs: Object.fromEntries(D.ATTRS.map(a => [a.name, a.id])) });
// 载入设定.xlsx 时调用：把说明里的 {变量} 填好（游戏里拿到的就是填好的字；表格和 JSON 里留着变量）
export function fillDefs(D, P) {
  const maps = refMaps(D);
  for (const [name, , rec, key, host] of defTexts(D)) host[key] = fillRefs(host[key], { P, rec, ...maps, fields: DEF_FIELDS[name].fields, bare: true });
}

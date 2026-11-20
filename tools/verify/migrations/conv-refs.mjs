// 把表格说明里写死的数改成 {变量}：记录自己的数自动认，参数和平衡参数按下面的清单手工指定。
// 每一处改完都用 src/data/refs.js 填回去，必须和原来一字不差，不然这一处不改、列出来。
//   node conv-refs.mjs <项目根目录> [--write]
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const [root, flag] = process.argv.slice(2), WRITE = flag === '--write';
const { fillRefs, fmtNum, FX_ZH, START_ZH } = await import(pathToFileURL(path.join(root, 'src/data/refs.js')));
const { pretty } = await import(pathToFileURL(path.join(root, 'tools/tables/lib/json.mjs')));
const J = f => JSON.parse(readFileSync(path.join(root, 'src/data/tables', f), 'utf8'));
const D = J('defs.json'), A = J('actions.json'), E = J('events.json'), CN = J('ideology_cn.json'), US = J('ideology_us.json'), PJ = J('params.json');
const P = PJ.P;
const MODS = Object.fromEntries(D.MODS.map(m => [m.zh, m.id])), MOD_ZH = Object.fromEntries(D.MODS.map(m => [m.id, m.zh]));
const ATTRS = Object.fromEntries(D.ATTRS.map(a => [a.name, a.id])), ATTR_ZH = Object.fromEntries(D.ATTRS.map(a => [a.id, a.name]));
const FX_NAME = Object.fromEntries(Object.entries(FX_ZH).reverse().map(([z, k]) => [k, z]));           // id → 主名（后面的是别名，倒过来让主名留下）
for (const [z, k] of Object.entries({ 监管: 'reg', 体验: 'quality', 配额: 'quota', 行动点: 'ap' })) FX_NAME[k] = z;
const START_NAME = Object.fromEntries(Object.entries(START_ZH).map(([z, k]) => [k, z]));
const changed = [], kept = [];

// 一条记录的候选：[占位符, 写出来的样子]；bare = 设定.xlsx（可以省掉列名）
function candidates(rec, bare, fields = {}) {
  const out = [], pre = (col, z) => (bare ? z : `${col}.${z}`);
  const push = (ph, v, kind, fmtsList, pct) => { for (const f of fmtsList) { const s = fmtNum(v, f, kind); if (s == null) continue; const p = f.length ? `{${ph}:${f.join(':')}}` : `{${ph}}`; out.push([p, s]); if (pct) out.push([p + '%', s + '%']); } };
  const PCTY = new Set(['equity', 'quota', 'usersPct']);                 // 本身就是百分数的：字里通常紧跟一个 %
  for (const [id, v] of Object.entries(rec.mods || {})) { const kind = id.endsWith('Mult') ? 'mult' : id === 'churnAdd' ? 'pct' : 'delta'; push(pre('修正', MOD_ZH[id]), v, kind, [[], ['×'], ['去号']]); }
  for (const [id, v] of Object.entries(rec.fx || {})) if (typeof v === 'number' && FX_NAME[id]) push(pre('效果', FX_NAME[id]), v, 'delta', [[], ['数'], ['去号']], PCTY.has(id));
  for (const [id, v] of Object.entries(rec.fx?.attr || {})) push(pre('效果', ATTR_ZH[id]), v, 'delta', [[]]);
  for (const t of [].concat(rec.fx?.temp || [])) push(`临时.${MOD_ZH[t.key]}`, t.mult ?? t.add, t.mult != null ? 'mult' : 'delta', [[], ['去号']]);
  for (const [id, v] of Object.entries(rec.failFx || {})) if (typeof v === 'number' && FX_NAME[id]) push(`失败效果.${FX_NAME[id]}`, v, 'delta', [[]]);
  for (const [id, v] of Object.entries(rec.start || {})) if (typeof v === 'number' && START_NAME[id]) push(pre('开局', START_NAME[id]), v, id === 'cashMult' ? 'mult' : 'delta', id === 'cashMult' ? [['×']] : [[], ['去号']], PCTY.has(id));
  for (const [id, v] of Object.entries(rec.attr || {})) push(pre('属性', ATTR_ZH[id]), v, 'delta', [[]]);
  for (const [z, [k, kind, fmts]] of Object.entries(fields)) if (typeof rec[k] === 'number') push(z, rec[k], kind, fmts);
  return out;
}
const boundary = (s, i, len) => !/[\d.]/.test(s[i - 1] || '') && !/[\d.%]/.test(s[i + len] || '') && !(/[+\-×]/.test(s[i - 1] || '') && /^\d/.test(s.slice(i)));
// 自动认：每个候选在字里恰好出现一次（数字边界上），同一个样子有几个候选时看前面 8 个字里有没有它的名字
function auto(text, cands) {
  let t = text;
  const bySeen = new Map();
  const base = ph => ph.replace(/[:%}].*$/, '');
  for (const [ph, s] of cands) { if (!bySeen.has(s)) bySeen.set(s, []); if (!bySeen.get(s).some(x => base(x) === base(ph))) bySeen.get(s).push(ph); }   // 同一个数的几种写法刚好一样：留第一种
  const strs = [...bySeen.keys()].sort((a, b) => b.length - a.length);
  for (const s of strs) {
    const hits = []; let i = -1;
    while ((i = t.indexOf(s, i + 1)) >= 0) if (boundary(t, i, s.length)) hits.push(i);
    if (!hits.length) continue;
    for (const at of hits.reverse()) {
      let phs = bySeen.get(s);
      if (phs.length > 1) { const before = t.slice(Math.max(0, at - 8), at); const named = phs.filter(ph => { const z = ph.replace(/^\{(?:[^.}]+\.)?([^:}]+).*$/, '$1'); return [...z].some((c, j) => before.includes(z.slice(j, j + 2)) && j + 2 <= z.length); }); if (named.length >= 1) phs = named; else continue; }   // 名字都在前面（比如「炼丹与开发 +12%」）：取第一个
      if (hits.length > 1 && bySeen.get(s).length === 1 && !/[+\-×%]/.test(s)) continue;          // 光秃秃的数出现好几次：不认
      t = t.slice(0, at) + phs[0] + t.slice(at + s.length);
    }
  }
  return t;
}
// 改一处：tmpl 填回去必须等于原文
function apply(obj, key, where, ctx, manual = []) {
  const old = obj[key];
  if (typeof old !== 'string' || !/\d/.test(old)) return;
  let t = old;
  for (const [a, b] of manual) { if (!t.includes(a)) throw new Error(`${where}：找不到「${a}」`); t = t.replace(a, b); }
  if (ctx.auto !== false) t = auto(t, candidates(ctx.rec, ctx.bare, ctx.fields));
  if (t === old) { kept.push(`${where}：${old}`); return; }
  const back = fillRefs(t, { vars: ctx.vars, P, rec: ctx.rec, mods: MODS, attrs: ATTRS, fields: ctx.fieldMap, bare: ctx.bare });
  if (back !== old) { kept.push(`${where}：填回去对不上 → ${t} ⇒ ${back}`); return; }
  obj[key] = t;
  changed.push(`${where}：${old}  →  ${t}`);
  if (/\d/.test(t.replace(/\{[^{}]*\}/g, ''))) kept.push(`${where}（还剩）：${t}`);
}
const DEF = { bare: true };
// ── 设定.xlsx ──
for (const p of D.PERKS) apply(p, 'desc', `设定 › 董事会卡 › ${p.id}`, { ...DEF, rec: p });
for (const [g, list] of Object.entries(D.TRAITS)) for (const t of list) apply(t, 'desc', `设定 › 特质 › ${t.id}`, { ...DEF, rec: t });
for (const f of D.FEATURES) apply(f, 'desc', `设定 › 功能 › ${f.id}`, { ...DEF, rec: f });
const QF = { 产出: ['out', 'raw', [['×']]], 工资: ['pay', 'raw', [['×']]] };
for (const [id, q] of Object.entries(D.STAFF_QUIRKS)) apply(q, 'desc', `设定 › 员工怪癖 › ${id}`, { ...DEF, rec: q, fields: QF, fieldMap: { 产出: ['out'], 工资: ['pay'] } }, id === 'dazui' ? [['+25%', '{dirt.bigMouth:%:±}']] : []);
for (const [k, pol] of Object.entries(D.POLICIES)) for (const [v, o] of Object.entries(pol.opts)) apply(o, 'desc', `设定 › 政策 › ${k}.${v}`, { ...DEF, rec: o });
const DF = { 效率: ['mult', 'mult', [[]]] };
for (const [id, d] of Object.entries(D.DATA_SOURCES)) apply(d, 'desc', `设定 › 数据源 › ${id}`, { ...DEF, rec: d, fields: DF, fieldMap: { 效率: ['mult', 'mult'] } }, id === 'buy' ? [['30%', '{furnace.buyMult:增:去号}']] : []);
for (const [id, g] of Object.entries(D.GOALS)) apply(g, 'desc', `设定 › 公司目标 › ${id}`, { ...DEF, rec: g });
for (const [id, r] of Object.entries(D.REGIONS)) r.desc.forEach((_, i) => apply(r.desc, i, `设定 › 地区 › ${id} 第 ${i + 1} 条`, { ...DEF, rec: r }));
const MS = { m_cash: [['+60', '+{meta.cash}']], m_gpu: [['+40%', '{meta.gpu:增}']], m_point: [['+1', '+{meta.attrPoint}']], m_point2: [['+1', '+{meta.attrPoint}']] };
for (const it of D.META_SHOP) apply(it, 'name', `设定 › 局外商店 › ${it.id}`, { ...DEF, rec: it, auto: false }, MS[it.id] || []);
PJ.P['ach.boot'] = 24; PJ.ROWS.find(r => r.key === 'ach.boot').value = 24; PJ.ROWS.find(r => r.key === 'ach.boot').desc = '成就「不拿一分钱」：不融资撑过几个月'; P['ach.boot'] = 24;
const AC = { m100: [['100 万', '{ach.m100:万}']], y1: [['1 亿', '{ach.y1:万}']], x996: [['24', '{ach.x996}']], boot: [['24', '{ach.boot}']], dirty: [['6', '{ach.dirty}']], allend: [['8', '{ach.allend}']], road: [['40%', '{ideo.equity}%']] };
for (const [id, a] of Object.entries(D.ACHIEVEMENTS)) apply(a, 'desc', `设定 › 成就 › ${id}`, { ...DEF, rec: a, auto: false }, AC[id] || []);
for (const a of D.ATTRS) apply(a, 'desc', `设定 › 属性 › ${a.id}`, { ...DEF, rec: a, auto: false }, a.id === 'mgmt' ? [['9 点', '{ap.mgmtLine} 点'], ['多 1 行动点', '多 {ap.mgmtBonus} 行动点']] : []);
// ── 行动.xlsx ──
const AM = {
  mobilize: [['热度 +8', '热度 +{热度}'], ['泡沫 +3', '泡沫 +{泡沫}'], ['士气 +10', '士气 +{士气}']], utopia: [['花 2 亿', '花 {花费:万}']], subbotnik: [['产品体验 +5', '产品体验 +{体验}']],
  digdirt: [['跑分 -5', '跑分 -{对手跑分}']], roadshow: [['估值 +5%', '估值 +{成功加成:%}']], buyback: [['买回 3% 股权', '买回 {比例:%} 股权']],
  plan: [['定一个 12 个月的目标，相关产出 +12~20%', '定一个 {月数} 个月的目标，相关产出 +{最少}~{最多}%']],
};
for (const a of A.ACTIONS) for (const k of ['desc', 'descBay']) apply(a, k, `行动 › 行动 › ${a.id}.${k}`, { rec: a, vars: { ...(a.p || {}), 月数: 12, 最少: 12, 最多: 20 } }, AM[a.id] || []);
for (const o of A.OFFERS) apply(o, 'note', `行动 › 融资报价 › ${o.label}`, { rec: o });
const AT = { 'subbotnik.sprint': [['+35%', '+{进度:%}']], 'bci.use.app': [['-35%', '{bci.apiMult:增}']] };
const actOf = k => A.ACTIONS.find(a => a.id === k.split('.')[0]);
for (const [k, list] of Object.entries(A.TEXT)) list.forEach((e, i) => { if (AT[k]) for (const f of ['text', 'bay']) if (e[f] != null) apply(e, f, `行动 › 行动文本 › ${k}${f === 'bay' ? '（湾区）' : ''}`, { rec: actOf(k) || {}, vars: actOf(k)?.p || {} }, AT[k]); });
// ── 事件.xlsx 系统事件 ──
const EM = {
  'broke.loan': [['到账 5 个月', '到账 {到账} 个月']], 'broke.beg': [['让出 15% 股权，换 4 个月', '让出 {让出股权}% 股权，换 {到账} 个月']], 'broke.layoff': [['回到 1 个月', '回到 {到账} 个月']],
  'acq_offer.raise': [['抬价 50%', '抬价 {抬价倍数:增:去号}']],
};
const YB = { 增长年: '用户增长', 技术年: '炼丹效率', 搞钱年: '收入' };
for (const e of E.EVENTS_CORE) (e.options || []).forEach((o, i) => {
  const vars = { ...(e.p || {}), ...(o.p || {}) }, m = EM[`${e.id}.${o.fn}`] || [];
  if (e.id === 'year_board' && YB[o.label]) m.push(['未来 12 个月', `未来 {临时.${YB[o.label]}:月} 个月`]);
  for (const k of ['label', 'hint']) apply(o, k, `事件 › 系统选项 › ${e.id} 第 ${i + 1} 个.${k}`, { rec: o, vars }, m.filter(([a]) => (o[k] || '').includes(a)));
});
// ── 路线之争：接盘老股窗口的提示 ──
for (const [B, z] of [[CN, '深圳'], [US, '湾区']]) for (const o of B.SYS_EVENTS.find(e => e.id === 'ideo_entry').options) apply(o, 'hint', `路线之争-${z} › 系统选项 › ideo_entry.${o.fn}`, { rec: o });

console.log(`改了 ${changed.length} 处：`); for (const c of changed) console.log('  ✓ ' + c);
console.log(`\n留着的 ${kept.length} 处：`); for (const k of kept) console.log('  · ' + k);
if (WRITE) {
  for (const [f, d] of [['defs.json', D], ['actions.json', A], ['events.json', E], ['ideology_cn.json', CN], ['ideology_us.json', US], ['params.json', PJ]]) writeFileSync(path.join(root, 'src/data/tables', f), pretty(d) + '\n');
  console.log('\n已写回 JSON');
}

// 引擎逐项对照：旧引擎和新引擎（文字读表）在这些地方的输出必须完全一样：
// 金额 / 用户数 / 日期格式、效果预览、员工说明气泡、每种黑料的引爆窗口和每个选项、董事会卡、所有事件在几种局面下弹出来的窗口、开局新闻。
// node snap-engine.mjs <legacyRoot(含 data/ game/)> <projectRoot>
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const [legacy, root] = process.argv.slice(2);
const GL = await import(pathToFileURL(path.join(legacy, 'game/engine.js'))), GN = await import(pathToFileURL(path.join(root, 'src/game/engine.js')));
const DL = await import(pathToFileURL(path.join(legacy, 'data/defs.js')));
const canon = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(kk => [kk, x[kk]])) : x));
const viewDialog = d => (d ? { kind: d.kind, id: d.id, cat: d.cat, icon: d.icon, title: d.title, text: d.text, art: d.art, chain: d.chain, portrait: d.portrait,
  options: d.options.map(o => ({ label: o.label, hint: o.hint, chk: o.chk, disabled: o.disabled, why: o.why, side: o.side, tip: o.tip, card: o.card })) } : null);
function seeded(seed) { let s = seed | 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
let n = 0, bad = 0;
const fails = [];
const same = (where, a, b) => { n++; const ca = canon(a), cb = canon(b); if (ca === cb) return true; bad++; if (fails.length < 12) { let p = 0; while (p < ca.length && ca[p] === cb[p]) p++; fails.push(`✗ ${where}，第 ${p} 个字符起：\n   旧：…${ca.slice(Math.max(0, p - 80), p + 140)}\n   新：…${cb.slice(Math.max(0, p - 80), p + 140)}`); } return false; };
const withSeed = (seed, f) => { const real = Math.random; Math.random = seeded(seed); try { return f(); } finally { Math.random = real; } };

const setup = (region, route, extra = {}) => ({ name: '测试员', coName: '混沌智能', modelName: '混沌', region, route, track: 'chat', attrs: { tech: 7, cha: 6, mgmt: 8, biz: 6, net: 7, luck: 5 }, traits: ['yao', 'bigtech', 'none', ...(region === 'bay' ? ['d_soma'] : ['d_hqb'])], ...extra });
// 开局：新闻、初始状态
for (const region of ['sz', 'bay']) for (const route of ['model', 'app']) for (const [k, ex] of [['名字', {}], ['默认模型名', { modelName: '' }], ['教学', { tutorial: true }]]) {
  const a = withSeed(7, () => GL.newGame(setup(region, route, ex), {})), b = withSeed(7, () => GN.newGame(setup(region, route, ex), {}));
  same(`开局 ${region}/${route}/${k}`, a, b);
}
const base = (region, route) => {
  const S = withSeed(region === 'sz' ? 11 : 29, () => GL.newGame(setup(region, route), {}));
  S.q.length = 0; S.t = 30; S.stage = 3; S.cash = 5000; S.users = 300;
  if (route === 'model') { S.E = 500; S.model = { cap: 40, bench: 40, ver: 1, name: '混沌-1', infl: 0 }; S.gpu = 30; }
  for (const r of ['res', 'eng', 'ops', 'biz', 'legal', 'eng', 'res']) GL.addStaff(S, GL.genStaff(S, r));
  for (const e of S.staff) e.quirk ??= 'juan';
  S.staff[1].quirk = 'genius'; S.staff[2].quirk = 'dazui'; S.staff[3].quirk = 'loyal'; S.staff[4].quirk = 'guanxi'; S.staff[5].quirk = 'moyu';
  GL.refreshCands(S);
  return S;
};
// 金额、用户数、日期
for (const region of ['sz', 'bay']) {
  const S = base(region, 'model');
  for (const x of [0, 0.04, 0.5, 3.3, 99.94, 100, 512.6, 9999.4, 10000, 12345.678, 99999, 100000, 543210, 1e6, 3.2e7, -0.3, -45.6, -23456])
    for (const sign of [false, true]) same(`金额 ${region} ${x} ${sign}`, GL.money(S, x, sign), GN.money(S, x, sign));
}
for (const x of [0, 0.05, 1.234, 50, 99.96, 100, 5000.4, 9999.99, 10000, 25000.5, 123456]) same(`用户数 ${x}`, GL.fmtUsers(x), GN.fmtUsers(x));
for (let t = -2; t <= 80; t++) same(`日期 ${t}`, GL.dateStr(t), GN.dateStr(t));
// 效果预览：所有事件、链、路线之争选项里出现过的效果，在几种局面下逐个翻译
const allFx = [];
const grab = v => { if (!v || typeof v !== 'object') return; if (Array.isArray(v)) { v.forEach(grab); return; } for (const [k, x] of Object.entries(v)) { if ((k === 'fx') && x && typeof x === 'object') allFx.push(x); grab(x); } };
grab(Object.values(GL.EV).map(e => ({ o: Array.isArray(e.options) ? e.options : [] })));
const cn = await import(pathToFileURL(path.join(legacy, 'data/ideology.js'))), us = await import(pathToFileURL(path.join(legacy, 'data/ideology_us.js')));
grab([cn, us].map(m => ({ ...m })));
allFx.push({ staff: 'gainRes' }, { staff: 'gainEng' }, { staff: 'loseCtx' }, { cashAbs: -2 }, { expose: 'random' }, { cleanDirt: 'all' }, { ideo: { red: 5, cap: -3 } }, { heat: -4 }, { temp: [{ key: 'unknownMult', mult: 1.2 }, { key: 'churnAdd', add: -0.02, months: 3 }] }, { dirt: { type: 'mystery', sev: 3 } }, { dirt: 'no_such' });
for (const region of ['sz', 'bay']) for (const ideoV of [null, 'cn', 'us']) {
  const S = base(region, 'model');
  if (ideoV) S.ideo = { v: ideoV, red: 40, cap: 40, heat: 10 };
  allFx.forEach((fx, i) => same(`效果预览 ${region}/${ideoV} #${i}`, GL.fxLines(S, fx), GN.fxLines(S, fx)));
}
// 员工说明气泡
for (const region of ['sz', 'bay']) for (const route of ['model', 'app']) {
  const S = base(region, route);
  for (const e of [...S.staff, ...S.cands]) same(`员工气泡 ${region}/${route} ${e.role}`, GL.staffImpact(JSON.parse(JSON.stringify(S)), e), GN.staffImpact(JSON.parse(JSON.stringify(S)), e));
}
// 推进特殊项目
for (const need of [0.5, 9]) {
  const S = base('sz', 'model'); S.projects.push({ uid: 'p1', id: 'x', name: '解读螺旋', kind: 'res', need, done: 0, t: 20, due: 40 }); S.ap = 3;
  const a = JSON.parse(JSON.stringify(S)), b = JSON.parse(JSON.stringify(S));
  same(`推项目 ${need}`, [GL.pushProject(a, 'p1'), a], [GN.pushProject(b, 'p1'), b]);
}
// 黑料引爆：每种黑料 × 几种局面 × 每个选项 × 几个随机种子
for (const region of ['sz', 'bay']) for (const [vn, mut] of [['普通', () => {}], ['没钱', S => { S.cash = 1; }], ['快进去了', S => { S.exposedCrime = 35; }], ['甩锅卡', S => { S.perks.push('scapegoat'); }]]) {
  for (const type of [...Object.keys(DL.DIRT), 'no_such_type']) {
    const S0 = base(region, 'model'); mut(S0);
    GL.addDirt(S0, type === 'no_such_type' ? { type, sev: 9, name: '怪东西' } : type);
    const snap = JSON.stringify(S0), uid = S0.dirt.at(-1).uid;
    for (let i = -1; i < 4; i++) for (let k = 0; k < (i < 0 ? 1 : 4); k++) {
      const run = G => { const S = JSON.parse(snap); S.rs = (S.rs + k * 7919 + i * 31) | 0; S.q.push({ type: 'scandal', uid }); const d = G.nextDialog(S); const r = i >= 0 && !d.options[i].disabled ? G.choose(S, d, i) : null; return { d: viewDialog(d), r: r && { text: r.text, ok: r.ok, chips: r.chips }, S }; };
      same(`黑料 ${type} ${region}/${vn} 选项 ${i} 随机 ${k}`, run(GL), run(GN));
    }
  }
}
// 董事会卡
for (const region of ['sz', 'bay']) for (const k of [0, 1, 2, 3, 4, 5]) for (const i of [-1, 0, 1, 2]) {
  const S0 = base(region, 'app'); if (k > 2) S0.perks = ['gpu_dinner', 'law_team', 'wolf', 'esop', 'time_lord', 'phoenix'];
  const snap = JSON.stringify(S0);
  const run = G => { const S = JSON.parse(snap); S.rs = (S.rs + k * 104729) | 0; S.q.push({ type: 'draft' }); const d = G.nextDialog(S); const r = i >= 0 ? G.choose(S, d, i) : null; return { d: viewDialog(d), r: r && { text: r.text, chips: r.chips }, S }; };
  same(`董事会卡 ${region} ${k} 选 ${i}`, run(GL), run(GN));
}
// 所有事件：几种局面下弹出来的窗口（检定成功率、点不了的原因、{rival}{boss}{staff} 的默认值、效果预览）
for (const region of ['sz', 'bay']) for (const [vn, mut] of [['普通', () => {}], ['没钱', S => { S.cash = -20; }], ['没员工', S => { S.staff = []; }], ['红色', S => { S.flags.red = 1; S.flags.rose = 1; }], ['属性低', S => { for (const a in S.founder.attrs) S.founder.attrs[a] = 2; }]]) {
  const S0 = base(region, 'model'); mut(S0); S0.vam = { due: 30, target: 500 }; GL.addDirt(S0, 'fake_users');
  const snap = JSON.stringify(S0);
  for (const id of Object.keys(GL.EV)) {
    const run = G => { const S = JSON.parse(snap); try { G.queueEvent(S, id); return { d: viewDialog(G.nextDialog(S)), S }; } catch (e) { return '出错：' + e.message; } };
    same(`事件 ${id} ${region}/${vn}`, run(GL), run(GN));
  }
}
for (const f of fails) console.log(f);
console.log(bad ? `✗ 有 ${bad} 处不一样` : `✓ 引擎逐项对照通过：${n} 项，新旧完全一致`);
process.exitCode = bad ? 1 : 0;

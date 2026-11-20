// 行动逐项对照：同一个状态下，旧行动模块和新的（读表格）在每个行动上的名字、显示、描述、能不能点、执行结果、弹窗里每个选项选下去的结果和最终状态，必须完全一样。
// 覆盖自动试玩很少走到的分支（各档办公室、各种路线之争结局、没钱、冷却、洗黑料、挖对手、上市被否……）。
// node snap-actions.mjs <legacyRoot(含 data/ game/)> <projectRoot> [行动id,…]
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const [legacy, root, onlyArg] = process.argv.slice(2);
const load = async base => ({ G: await import(pathToFileURL(path.join(base, 'engine.js'))), A: await import(pathToFileURL(path.join(base, 'actions.js'))) });
const L = await load(path.join(legacy, 'game')), N = await load(path.join(root, 'src/game'));
const only = onlyArg ? onlyArg.split(',') : null;
const canon = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(kk => [kk, x[kk]])) : x));
const viewDialog = d => (d ? { kind: d.kind, id: d.id, cat: d.cat, icon: d.icon, title: d.title, text: d.text, art: d.art, closable: d.closable,
  options: d.options.map(o => ({ label: o.label, hint: o.hint, chk: o.chk, disabled: o.disabled, why: o.why, side: o.side, free: o.free, tip: o.tip, card: o.card })) } : null);
const viewRes = r => (r ? { text: r.text, ok: r.ok, chips: r.chips, err: r.err, dialog: viewDialog(r.dialog) } : r);
function seeded(seed) { let s = seed | 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const setup = (region, route) => ({ name: '测试员', coName: '混沌智能', modelName: '混沌', region, route, track: 'chat', attrs: { tech: 7, cha: 6, mgmt: 8, biz: 6, net: 7, luck: 5 }, traits: ['yao', 'bigtech', 'none'], style: 'clean' });
function baseState(region, route) {
  const real = Math.random; Math.random = seeded((region === 'sz' ? 11 : 29) + (route === 'app' ? 5 : 0));
  try {
    const S = L.G.newGame(setup(region, route), {});
    S.q.length = 0; S.t = 30; S.stage = 3; S.cash = 5000; S.users = 300; S.ap = 4; S.lastRaiseT = 10;
    if (route === 'model') { S.E = 500; S.model = { cap: 40, bench: 40, ver: 1, name: '混沌-1', infl: 0 }; S.gpu = 30; }
    for (const r of ['res', 'eng', 'ops', 'biz', 'legal', 'eng']) L.G.addStaff(S, L.G.genStaff(S, r));
    L.G.refreshCands(S);
    return S;
  } finally { Math.random = real; }
}
const ideo = (S, result, extra = {}) => { const v = S.co.region === 'bay' ? 'us' : 'cn'; S.ideo = { v, on: 0, n: 15, heat: v === 'us' ? 30 : 0, red: 60, cap: 40, picks: [], used: {}, shown: {}, t0: 10, result, goal: null, full: null, fired: 0, ...extra }; };
const VARIANTS = {
  base: S => {},
  poor: S => { S.cash = 3; },
  noAp: S => { S.ap = 0; },
  ap1: S => { S.ap = 1; },
  cooldowns: S => { for (const id of ['release', 'paper', 'teambuild', 'pie', 'ipo', 'sellcourse', 'subsidy', 'lobby', 'ads', 'goodpr', 'digdirt', 'beg', 'mobilize', 'selfcrit', 'subbotnik', 'buyback', 'costcut']) S.cd[id] = S.t + 2; },
  stage0: S => { S.stage = 0; S.users = 2; },
  stage1: S => { S.stage = 1; S.users = 20; },
  stage4: S => { S.stage = 4; S.users = 3000; S.streak.profit = 4; },
  stage5: S => { S.stage = 5; S.users = 9000; S.streak.profit = 4; },
  stage5np: S => { S.stage = 5; S.users = 9000; S.streak.profit = 1; },
  weak: S => { S.users = 5; },
  winter: S => { S.burstT = S.t - 3; },
  justRaised: S => { S.lastRaiseT = S.t - 2; },
  boostMax: S => { S.raiseBoost = 0.15; },
  dirty: S => { L.G.addDirt(S, 'fake_users'); L.G.addDirt(S, 'scrape'); L.G.addDirt(S, 'bribe'); L.G.addDirt(S, 'overwork'); L.G.addDirt(S, 'tax'); },
  dirtyPoor: S => { L.G.addDirt(S, 'cook_books'); L.G.addDirt(S, 'astroturf'); S.cash = 60; },
  sprint: S => { S.sprint = { id: 'voice', need: 40, done: 13 }; S.feats = ['agent', 'memory']; },
  allFeats: S => { S.feats = ['voice', 'agent', 'memory', 'multimodal', 'community', 'vip', 'enterprise', 'plugin', 'ads', 'checkin', 'filter', 'viral']; },
  office1: S => { S.co.office = 1; }, office4: S => { S.co.office = 4; }, office5: S => { S.co.office = 5; }, office7: S => { S.co.office = 7; }, office8: S => { S.co.office = 8; },
  bigModel: S => { if (S.model) { S.E = 50000; } },
  noModel: S => { S.model = null; S.E = 900; },
  furnaceScrape: S => { S.furnace = { on: true, data: 'scrape', months: 3 }; },
  red: S => { ideo(S, 'red'); S.flags.red = 1; S.flags.rose = S.co.region === 'bay' ? 1 : undefined; if (!S.flags.rose) delete S.flags.rose; },
  redDirty: S => { ideo(S, 'red'); S.flags.red = 1; L.G.addDirt(S, 'bribe'); L.G.addDirt(S, 'overwork'); },
  redSprint: S => { ideo(S, 'red'); S.sprint = { id: 'vip', need: 30, done: 5 }; },
  redPlan: S => { ideo(S, 'red', { plan: { kind: 'users', due: S.t + 7, goal: 500, start: 300 } }); },
  redUtopia: S => { ideo(S, 'red'); S.flags.utopia_on = 1; },
  cap: S => { ideo(S, 'cap'); S.flags.capb = 1; },
  capRich: S => { ideo(S, 'cap'); S.equity = 92; },
  capDone: S => { ideo(S, 'cap'); S.flags.yank = 1; S.flags.bci_on = 1; S.flags.spinoff = 1; },
  capStage2: S => { ideo(S, 'cap'); S.stage = 2; },
  loose: S => { S.policies.safety = 'loose'; S.policies.work = '996'; },
  // 融资：用户多、业绩够，对赌目标由「用户 × 倍数」决定；几种阶段都来一遍
  hot1: S => { S.stage = 1; S.users = 400; S.hype = 80; S.quality = 70; S.lastRaiseT = 0; },
  hot2: S => { S.stage = 2; S.users = 2500; S.hype = 80; S.quality = 70; S.lastRaiseT = 0; },
  hot3: S => { S.stage = 3; S.users = 9000; S.hype = 90; S.quality = 80; S.lastRaiseT = 0; },
  hotRed: S => { S.stage = 2; S.users = 2500; S.hype = 80; S.quality = 70; S.lastRaiseT = 0; ideo(S, 'red'); S.flags.red = 1; if (S.co.region === 'bay') S.flags.rose = 1; },
  lucky: S => { S.founder.attrs.luck = 10; S.founder.attrs.cha = 10; S.founder.attrs.net = 10; },
};
let n = 0, bad = 0, menus = 0, raiseDialogs = 0, vamSeen = 0;
const fails = new Map();
const report = (where, a, b) => {
  bad++;
  const ca = canon(a), cb = canon(b); let p = 0; while (p < ca.length && ca[p] === cb[p]) p++;
  const key = where.replace(/ \[.*\]/, '');
  if (!fails.has(key)) fails.set(key, `✗ ${where} 不一样，第 ${p} 个字符起：\n   旧：…${ca.slice(Math.max(0, p - 100), p + 160)}\n   新：…${cb.slice(Math.max(0, p - 100), p + 160)}`);
};
// 从头跑一条路径：执行行动 id，然后依次选 path 里的选项；返回每一步看到的东西和最终状态
function walk(E, snap, id, path, rs) {
  const S = JSON.parse(snap); S.rs = rs;
  const seen = [];
  try {
    let r = E.A.perform(S, id); seen.push(viewRes(r));
    for (const i of path) { if (!r?.dialog) break; const d = r.dialog; if (!d.options[i] || d.options[i].disabled) { seen.push('选不了'); break; } r = E.G.choose(S, d, i); seen.push(viewRes(r)); }
  } catch (e) { seen.push('出错：' + e.message); }
  return { seen, S };
}
for (const region of ['sz', 'bay']) for (const route of ['model', 'app']) for (const [vn, mut] of Object.entries(VARIANTS)) {
  const S0 = baseState(region, route); mut(S0);
  const snap = JSON.stringify(S0);
  for (const a of L.A.ACTIONS) {
    if (only && !only.includes(a.id)) continue;
    const b = N.A.ACT[a.id], where = `${a.id} [${region}/${route}/${vn}]`;
    if (!b) { report(where, 'exists', 'missing'); continue; }
    const S = JSON.parse(snap);
    const view = (A, x) => { const show = x.show ? !!x.show(S) : true; return { name: A.actName(S, x), nameNoS: A.actName(null, x), show, tab: x.tab, icon: x.icon, ap: x.ap, cd: x.cd, shady: !!x.shady, ...(show ? { desc: x.desc(S), st: A.actionState(S, x) } : {}) }; };
    const va = view(L.A, a), vb = view(N.A, b); menus++;
    if (canon(va) !== canon(vb)) { report(where + ' 菜单', va, vb); continue; }
    if (!va.show || va.st.why) continue;
    // 执行：先看第一层，再对每个选项（以及第二层的每个选项）各跑一遍
    const paths = [[]];
    const first = walk(L, snap, a.id, [], S0.rs);
    const d1 = first.seen[0]?.dialog;
    if (d1) d1.options.forEach((o, i) => paths.push([i]));
    if (a.id === 'release') for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) paths.push([i, j]);
    if (d1 && /Term Sheet/.test(d1.title || '')) { raiseDialogs++; if (d1.options.some(o => /对赌/.test(o.label))) vamSeen++; }
    for (const pth of paths) for (let k = 0; k < (a.id === 'raise' ? 16 : 6); k++) {
      const rs = (S0.rs + k * 7919 + pth.reduce((s, i) => s * 31 + i + 1, 0) * 104729) | 0;
      const x = walk(L, snap, a.id, pth, rs), y = walk(N, snap, a.id, pth, rs); n++;
      if (canon(x) !== canon(y)) report(`${where} 路径 ${JSON.stringify(pth)} 随机 ${k}`, x, y);
    }
  }
  // 招人、裁人、改政策
  if (!only || only.includes('hire')) {
    const S = JSON.parse(snap);
    for (const [label, f] of [
      ['hire', E => { const T = JSON.parse(snap); return [E.A.hire(T, T.cands[0]?.uid), T]; }],
      ['hireNoAp', E => { const T = JSON.parse(snap); T.ap = 0; return [E.A.hire(T, T.cands[0]?.uid), T]; }],
      ['hireFull', E => { const T = JSON.parse(snap); T.co.office = 1; return [E.A.hire(T, T.cands[0]?.uid), T]; }],
      ['hirePoor', E => { const T = JSON.parse(snap); T.cash = 0.1; return [E.A.hire(T, T.cands[0]?.uid), T]; }],
      ['fireTop', E => { const T = JSON.parse(snap); const e = T.staff.slice().sort((x, y) => y.skill - x.skill)[0]; return [E.A.fire(T, e.uid), T]; }],
      ['fireLow', E => { const T = JSON.parse(snap); const e = T.staff.slice().sort((x, y) => x.skill - y.skill)[0]; return [E.A.fire(T, e.uid), T]; }],
      ['996', E => { const T = JSON.parse(snap); E.A.setPolicy(T, 'work', '996'); return [null, T]; }],
      ['965', E => { const T = JSON.parse(snap); T.policies.work = '996'; E.A.setPolicy(T, 'work', 965); return [null, T]; }],
    ]) { const x = f(L), y = f(N); n++; if (canon(x) !== canon(y)) report(`${label} [${region}/${route}/${vn}]`, x, y); }
  }
}
for (const f of [...fails.values()].slice(0, 14)) console.log(f);
console.log(`（融资报价窗口 ${raiseDialogs} 次，其中第一次随机就有对赌报价的 ${vamSeen} 次）`);
console.log(bad ? `✗ 有 ${bad} 处不一样（${fails.size} 类）` : `✓ 行动逐项对照通过：${menus} 次菜单比对、${n} 次执行，新旧完全一致`);
process.exitCode = bad ? 1 : 0;

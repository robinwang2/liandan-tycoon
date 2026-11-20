// 系统事件逐项对照：同一个状态下，旧引擎（旧数据）和新引擎（读表格 + 脚本）弹出的对话框、每个选项选下去的结果和最终状态必须一模一样。
// 覆盖自动试玩走不到的分支（认输、卖公司、出国、各种士气 / 股权 / 政策组合）。
// node snap-core.mjs <legacyRoot(含 data/ game/)> <projectRoot> [事件id,…]
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const [legacy, root, onlyArg] = process.argv.slice(2);
const GL = await import(pathToFileURL(path.join(legacy, 'game/engine.js'))), GN = await import(pathToFileURL(path.join(root, 'src/game/engine.js')));
const coreL = (await import(pathToFileURL(path.join(legacy, 'data/events_core.js')))).EVENTS_CORE;
const only = onlyArg ? onlyArg.split(',') : null;
const canon = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(kk => [kk, x[kk]])) : x));
const viewDialog = d => (d ? { kind: d.kind, id: d.id, cat: d.cat, icon: d.icon, title: d.title, text: d.text, art: d.art, chain: d.chain, portrait: d.portrait, delay: d.delay,
  options: d.options.map(o => ({ label: o.label, hint: o.hint, chk: o.chk, disabled: o.disabled, why: o.why, side: o.side, tip: o.tip })) } : null);
function seeded(seed) { let s = seed | 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const setup = region => ({ name: '测试员', coName: '混沌智能', modelName: '混沌', region, route: 'model', track: 'chat', attrs: { tech: 7, cha: 7, mgmt: 6, biz: 6, net: 7, luck: 5 }, traits: ['yao', 'bigtech', 'none'], style: 'clean' });
function baseState(region) {
  const real = Math.random; Math.random = seeded(region === 'sz' ? 11 : 29);
  try {
    const S = GL.newGame(setup(region), {});
    S.q.length = 0; S.t = 30; S.stage = 3; S.cash = 5000; S.users = 300; S.ownModel = true;
    if (!S.model) { S.E = 500; S.model = { cap: 40, bench: 40, ver: 1, name: 'T-1', infl: 0 }; }
    for (const r of ['res', 'eng', 'ops', 'biz', 'legal', 'eng']) GL.addStaff(S, GL.genStaff(S, r));
    GL.addDirt(S, 'fake_users'); GL.addDirt(S, 'scrape'); S.vam = { due: 30, target: 500 };
    return S;
  } finally { Math.random = real; }
}
const VARIANTS = {
  base: S => {}, loaned: S => { S.flags.loaned = 1; }, begged: S => { S.flags.begged = 1; }, lowEquity: S => { S.equity = 20; }, equity25: S => { S.equity = 25; },
  noStaff: S => { S.staff = []; }, oneStaff: S => { S.staff.length = 1; }, moraleHi: S => { S.morale = 80; }, morale62: S => { S.morale = 62; }, moraleLo: S => { S.morale = 30; },
  strict: S => { S.policies.safety = 'strict'; }, loose: S => { S.policies.safety = 'loose'; }, aligned: S => { S.flags.aligned = 1; },
  vamMet: S => { S.users = 600; }, vamFake: S => { S.fake = 250; }, vamPerk: S => { S.perks.push('cfo'); }, stage0: S => { S.stage = 0; }, tut: S => { S.tut = { on: true }; },
  lowCash: S => { S.cash = 1; }, negCash: S => { S.cash = -50; }, rich: S => { S.cash = 9e5; }, noLegal: S => { S.staff = S.staff.filter(e => e.role !== 'legal'); }, probeFlag: S => { S.flags.probe = 1; S.exposedCrime = 45; },
};
const CTX = { acq_offer: [undefined, { rival: 'openbi' }, { rival: 'deepsleep' }] };
let n = 0, bad = 0, dialogs = 0;
const seenOpt = new Set();
for (const ev of coreL) {
  if (only && !only.includes(ev.id)) continue;
  for (const region of ['sz', 'bay']) for (const [vn, mut] of Object.entries(VARIANTS)) for (const ctx of CTX[ev.id] || [undefined]) {
    const S0 = baseState(region); mut(S0);
    const snap = JSON.stringify(S0);
    const run = (G, i, rs) => {
      const S = JSON.parse(snap); if (rs != null) S.rs = rs;
      let out;
      try {
        G.queueEvent(S, ev.id, ctx && { ...ctx });
        const d = G.nextDialog(S);
        out = { dialog: viewDialog(d) };
        if (i != null && d && d.options[i] && !d.options[i].disabled) { const r = G.choose(S, d, i); out.result = r && { text: r.text, ok: r.ok, chips: r.chips }; }
        out.S = S;
      } catch (e) { out = { error: String(e.message) }; }
      return out;
    };
    const a = run(GL, null), b = run(GN, null); dialogs++;
    const where = `${ev.id} [${region}/${vn}${ctx ? '/' + ctx.rival : ''}]`;
    if (canon(a) !== canon(b)) { bad++; if (bad <= 12) console.log(`✗ ${where} 对话框不一样\n   旧：${canon(a.dialog || a).slice(0, 700)}\n   新：${canon(b.dialog || b).slice(0, 700)}`); continue; }
    const cnt = a.dialog ? a.dialog.options.length : 0;
    for (let i = 0; i < cnt; i++) for (let k = 0; k < 8; k++) {
      const rs = (S0.rs + k * 7919 + i * 104729) | 0, x = run(GL, i, rs), y = run(GN, i, rs); n++;
      if (x.result) seenOpt.add(`${ev.id}#${a.dialog.options[i].label}#${x.result.ok}`);
      if (canon(x) !== canon(y)) {
        bad++;
        if (bad <= 12) {
          const cx = canon(x), cy = canon(y); let p = 0; while (p < cx.length && cx[p] === cy[p]) p++;
          console.log(`✗ ${where} 选项 ${i}「${a.dialog.options[i].label}」(rs ${k}) 不一样，第 ${p} 个字符起：\n   旧：…${cx.slice(Math.max(0, p - 120), p + 200)}\n   新：…${cy.slice(Math.max(0, p - 120), p + 200)}`);
        }
      }
    }
  }
}
console.log(bad ? `✗ 有 ${bad} 处不一样` : `✓ 系统事件逐项对照通过：${dialogs} 个对话框、${n} 次选择，新旧完全一致（覆盖了 ${seenOpt.size} 种「选项 × 成败」）`);
process.exitCode = bad ? 1 : 0;

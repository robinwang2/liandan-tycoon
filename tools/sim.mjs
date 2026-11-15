// 无界面自动试玩：抓运行时错误 + 看数值平衡。用法：node tools/sim.mjs [局数] [--smoke]
import * as G from '../src/game/engine.js';
import * as A from '../src/game/actions.js';
import { ENDINGS, STAGES } from '../src/data/defs.js';

const N = +(process.argv[2] || 150);
const rand = () => Math.random();
const setups = [];
for (const region of ['bay', 'sz']) for (const route of ['model', 'app']) for (const track of ['chat', 'code', 'companion', 'video']) setups.push({ region, route, track });

function mkSetup(s, style) {
  const attrs = { tech: 5, cha: 5, mgmt: 5, biz: 5, net: 5, luck: 5 }, keys = Object.keys(attrs);
  for (let i = 0; i < 10; i++) { let k; do { k = keys[Math.floor(rand() * 6)]; } while (attrs[k] >= 10); attrs[k]++; }
  return { name: '测试员', coName: '混沌智能', modelName: '混沌', ...s, attrs, traits: [['yao', 'dropout', 'phd', 'shuangfei'][Math.floor(rand() * 4)], ['bigtech', 'lab', 'serial', 'hqb', 'influencer'][Math.floor(rand() * 5)], ['none', 'juan', 'huyou', 'geek', 'foxi'][Math.floor(rand() * 5)]], style };
}

// 把对话框一路点到底。shady = 这个机器人爱不爱走黑箱路线
function drain(S, first, shady) {
  let d = first || G.nextDialog(S), guard = 0;
  while (d && guard++ < 60) {
    const ok = d.options.map((o, i) => i).filter(i => !d.options[i].disabled);
    if (!ok.length && d.closable) { d = G.nextDialog(S); continue; }
    if (!ok.length) throw new Error('对话框没有可选项: ' + d.title);
    let pool = ok;
    if (!shady) { const clean = ok.filter(i => !/☠/.test(d.options[i].label + (d.options[i].hint || ''))); if (clean.length) pool = clean; }
    if (pool.some(i => !/接受邀请/.test(d.options[i].label))) pool = pool.filter(i => !/接受邀请/.test(d.options[i].label));
    if (d.id === 'broke' || d.id === 'acq_offer' || d.id === 'probe') pool = pool.filter(i => !/认输|卖了|出国|抬价/.test(d.options[i].label)).length ? pool.filter(i => !/认输|卖了|出国|抬价/.test(d.options[i].label)) : pool;
    const r = G.choose(S, d, pool[Math.floor(rand() * pool.length)]);
    d = r?.dialog || G.nextDialog(S);
  }
}
const act = (S, id, shady) => { const a = A.ACT[id]; if ((a.show && !a.show(S)) || A.actionState(S, a).why) return false; const r = A.perform(S, id); if (r?.dialog) drain(S, r.dialog, shady); else drain(S, null, shady); return true; };

function playMonth(S, style) {
  const shady = style === 'shady';
  // 算力：推理够用 + 拿预算的一部分炼丹
  if (S.ownModel) { const budget = Math.max(0, S.cash) / (14 * G.gpuPrice(S)); A.setGpu(S, Math.max(G.inferNeed(S) * 1.1, Math.min(G.quota(S), budget))); }
  for (const p of S.projects) if (p.kind === 'ap' && S.ap > 0 && rand() < 0.7) G.pushProject(S, p.uid);
  let guard = 0;
  while (S.ap > 0 && !S.over && guard++ < 12) {
    const rw = G.runway(S);
    if ((rw < 9 || S.t - S.lastRaiseT > 10) && act(S, 'raise', shady)) continue;
    if (S.staff.length >= G.teamCap(S) && S.cash > 8 * A.actionState(S, A.ACT.office).cost && act(S, 'office', shady)) continue;
    if (rw > 7 && S.staff.length < G.teamCap(S) && S.cands.length && S.ap >= 1) {
      const c = S.cands.slice().sort((a, b) => b.skill - a.skill)[0];
      const r = A.hire(S, c.uid); if (r && !r.err) continue;
    }
    if (act(S, 'release', shady)) continue;
    if (act(S, 'ipo', shady)) continue;
    if (!S.sprint && act(S, 'sprint', shady)) continue;
    if (!S.ownModel && S.stage >= 3 && rand() < 0.3 && act(S, 'selfdev', shady)) continue;
    const opts = ['hype', 'ads', 'code', 'teambuild', 'roadshow', 'goodpr', 'lobby', 'pie', 'sellcourse', 'subsidy', 'beg', 'paper'].concat(shady ? ['navy', 'fakeusers', 'digdirt', 'furnace'] : ['wash']);
    if (!act(S, opts[Math.floor(rand() * opts.length)], shady)) { if (guard > 8) break; }
  }
  if (S.over) return;
  if (S.streak.profit < 3 && S.stage >= 5 && S.policies.price !== 'premium') A.setPolicy(S, 'price', 'premium');
  G.endMonth(S);
  drain(S, null, shady);
}

function smoke() {
  // 每个事件的每个选项都执行一遍，抓运行时错误
  let n = 0;
  for (const id of Object.keys(G.EV)) {
    for (let rep = 0; rep < 3; rep++) {
      const base = G.newGame(mkSetup(setups[(rep * 5 + n) % setups.length]), {});
      base.q.length = 0; base.t = 30; base.stage = 3; base.cash = 5000; base.users = 300; base.ownModel = true;
      if (!base.model) { base.E = 500; base.model = { cap: 40, bench: 40, ver: 1, name: 'T-1', infl: 0 }; }
      for (const r of ['res', 'eng', 'ops', 'biz', 'legal']) G.addStaff(base, G.genStaff(base, r));
      G.addDirt(base, 'fake_users'); G.addDirt(base, 'scrape'); base.vam = { due: 30, target: 500 };
      const snapshot = JSON.stringify(base);
      const count = (() => { const S = JSON.parse(snapshot); G.queueEvent(S, id); const d = G.nextDialog(S); return d ? d.options.length : 0; })();
      for (let i = 0; i < count; i++) {
        const S = JSON.parse(snapshot); G.queueEvent(S, id);
        const d = G.nextDialog(S);
        if (!d || !d.options[i] || d.options[i].disabled) continue;
        try { const r = G.choose(S, d, i); if (!r) throw new Error('choose 返回空'); if (/\{\w+\}|undefined|NaN/.test(d.text + d.title + (r.text || ''))) console.log(`  ⚠ 文本可疑 [${id}#${i}]`, (d.text + ' → ' + r.text).match(/.{0,20}(\{\w+\}|undefined|NaN).{0,20}/)[0]); if (!S.over) drain(S, null, true); if (Object.values(S).some(v => typeof v === 'number' && Number.isNaN(v))) throw new Error('状态里出现 NaN'); n++; }
        catch (e) { console.log(`  ✗ 事件 ${id} 选项 ${i}: ${e.message}`); process.exitCode = 1; }
      }
    }
  }
  console.log(`smoke: 执行了 ${n} 个事件选项`);
}

function run() {
  const stat = {};
  for (const style of ['clean', 'shady']) {
    for (const s of setups) {
      const key = `${s.region}/${s.route}`, row = (stat[key] ??= { n: 0, ends: {}, t: 0, stage: 0, val: [], users: [], ev: 0, perks: 0 });
      for (let i = 0; i < Math.ceil(N / setups.length / 2); i++) {
        const S = G.newGame(mkSetup(s, style), {});
        try { drain(S, null, style === 'shady'); let g = 0; while (!S.over && g++ < 80) playMonth(S, style); }
        catch (e) { console.log(`✗ ${key}/${s.track} t=${S.t}: ${e.stack.split('\n').slice(0, 3).join(' | ')}`); process.exitCode = 1; continue; }
        if (!S.over) { console.log('✗ 没有结局', key, S.t); continue; }
        row.n++; row.ends[S.over.id] = (row.ends[S.over.id] || 0) + 1; row.t += S.over.t; row.stage += S.stage; row.val.push(S.over.val); row.users.push(S.stats.maxUsers); row.ev += S.stats.events; row.perks += S.perks.length; (S.stats.rounds || []).forEach((t, i) => { (row.rt ??= [])[i] = (row.rt[i] || 0) + t; (row.rn ??= [])[i] = (row.rn[i] || 0) + 1; });
      }
    }
  }
  const med = a => a.sort((x, y) => x - y)[Math.floor(a.length / 2)] || 0;
  for (const [k, r] of Object.entries(stat)) {
    const ends = Object.entries(r.ends).sort((a, b) => b[1] - a[1]).map(([id, c]) => `${ENDINGS[id].name}${Math.round(c / r.n * 100)}%`).join(' ');
    console.log(`${k.padEnd(10)} n=${r.n} 平均存活${(r.t / r.n).toFixed(0)}月 平均轮次${(r.stage / r.n).toFixed(1)} 估值中位${(med(r.val) / 1e4).toFixed(1)}亿 用户峰值中位${med(r.users).toFixed(0)}万 事件${(r.ev / r.n).toFixed(0)} 卡${(r.perks / r.n).toFixed(1)} 各轮月份[${(r.rt || []).map((t, i) => (t / r.rn[i]).toFixed(0) + '(' + Math.round(r.rn[i] / r.n * 100) + '%)').join(' ')}] | ${ends}`);
  }
}

function trace(region, route, track, style = 'clean') {
  const S = G.newGame(mkSetup({ region, route, track }, style), {});
  drain(S, null, false);
  let g = 0;
  while (!S.over && g++ < 80) {
    playMonth(S, style);
    if (S.t % 3 === 1 || S.over) console.log(`t${String(S.t).padStart(2)} 轮${S.stage} 现金${G.money(S, S.cash).padStart(9)} 收${G.money(S, S.last.rev).padStart(8)} 支${G.money(S, S.last.cost).padStart(8)} 用户${G.fmtUsers(S.users).padStart(8)} 估值${G.money(S, G.valuation(S)).padStart(9)} perf${G.perf(S).toFixed(2)} 热${S.hype.toFixed(0).padStart(3)} 体验${S.quality.toFixed(0)} 口碑${S.rep.toFixed(0)} 士气${S.morale.toFixed(0)} 监管${S.reg.toFixed(0)} 人${S.staff.length} 卡${S.gpu}/${G.quota(S)} 能力${S.model ? S.model.cap.toFixed(0) : '-'}/${G.frontier(S.t).toFixed(0)} 榜${G.rank(S)} 黑${S.dirt.length}`);
  }
  console.log('结局:', S.over?.id, '股权', S.equity.toFixed(0) + '%');
}
const ti = process.argv.indexOf('--trace');
if (ti > 0) trace(process.argv[ti + 1] || 'bay', process.argv[ti + 2] || 'model', process.argv[ti + 3] || 'chat', process.argv[ti + 4]);
else if (process.argv.includes('--smoke')) smoke(); else { smoke(); run(); }

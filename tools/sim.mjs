// 无界面自动试玩：抓运行时错误 + 看数值平衡。用法：node tools/sim.mjs [局数] [--smoke]
import * as G from '../src/game/engine.js';
import * as A from '../src/game/actions.js';
import { ENDINGS } from '../src/data/defs.js';
import { setups, mkSetup, drain, playMonth, HINT_N, hintMonths } from './bot.mjs';

const N = +(process.argv[2] || 150);

function smoke() {
  // 显卡没有硬上限：配额以外也能租，但超出的部分越多越贵
  {
    const S = G.newGame(mkSetup(setups[0]), {}); S.stage = 3;
    const q = G.quota(S), p = G.gpuPrice(S);
    A.setGpu(S, q * 2);
    const ok = S.gpu === q * 2 && Math.abs(G.gpuRent(S, q) - q * p) < 1e-6 && G.gpuRent(S) > 3 * q * p && G.gpuRent(S, q * 3) - G.gpuRent(S) > G.gpuRent(S) - G.gpuRent(S, q);
    if (!ok) { console.log(`  ✗ 显卡配额：想租 ${q * 2} 张，实际 ${S.gpu} 张，月租 ${G.gpuRent(S).toFixed(1)}`); process.exitCode = 1; }
  }
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
        try { const r = G.choose(S, d, i); if (!r) throw new Error('choose 返回空'); if (/\{[^{}\s]+\}|undefined|NaN/.test(d.text + d.title + (r.text || ''))) console.log(`  ⚠ 文本可疑 [${id}#${i}]`, (d.text + ' → ' + r.text).match(/.{0,20}(\{[^{}\s]+\}|undefined|NaN).{0,20}/)[0]); if (!S.over) drain(S, null, true); if (Object.values(S).some(v => typeof v === 'number' && Number.isNaN(v))) throw new Error('状态里出现 NaN'); n++; }
        catch (e) { console.log(`  ✗ 事件 ${id} 选项 ${i}: ${e.message}`); process.exitCode = 1; }
      }
    }
  }
  console.log(`smoke: 执行了 ${n} 个事件选项`);
}

function run() {
  const stat = {}, byStyle = {}, ideo = Object.fromEntries(['sz', 'bay'].map(r => [r, { all: 0, n: 0, red: 0, cap: 0, fail: 0, on: 0, road: 0, val: { red: [], cap: [], none: [] }, unlocked: {}, heat: [] }]));
  for (const style of ['clean', 'shady', 'advice']) {
    for (const s of setups) {
      const key = `${s.region}/${s.route}`, row = (stat[key] ??= { n: 0, ends: {}, t: 0, stage: 0, val: [], users: [], ev: 0, perks: 0, office: [] });
      const sr = (byStyle[style] ??= { n: 0, ends: {}, val: [] });
      for (let i = 0; i < Math.ceil(N / setups.length / 2); i++) {
        const S = G.newGame(mkSetup(s, style), {});
        try { drain(S, null, style === 'shady'); let g = 0; while (!S.over && g++ < 80) playMonth(S, style); }
        catch (e) { console.log(`✗ ${key}/${s.track} t=${S.t}: ${e.stack.split('\n').slice(0, 3).join(' | ')}`); process.exitCode = 1; continue; }
        if (!S.over) { console.log('✗ 没有结局', key, S.t); continue; }
        row.office.push(S.co.office); row.n++; row.ends[S.over.id] = (row.ends[S.over.id] || 0) + 1; row.t += S.over.t; row.stage += S.stage; row.val.push(S.over.val); row.users.push(S.stats.maxUsers); row.ev += S.stats.events; row.perks += S.perks.length; (S.stats.rounds || []).forEach((t, i) => { (row.rt ??= [])[i] = (row.rt[i] || 0) + t; (row.rn ??= [])[i] = (row.rn[i] || 0) + 1; });
        sr.n++; sr.ends[S.over.id] = (sr.ends[S.over.id] || 0) + 1; sr.val.push(S.over.val);
        {                                                                     // 路线之争（深圳 + 湾区）：开了几局、各走到哪个结局
          const X = ideo[s.region]; X.all++;
          if (S.ideo) { X.n++; X[S.ideo.result || 'on']++; if (S.ideo.v === 'us') X.heat.push(S.ideo.heat || 0); }
          if (S.ach.includes('road')) X.road++;
          X.val[S.ideo?.result === 'red' ? 'red' : S.ideo?.result === 'cap' ? 'cap' : 'none'].push(S.over.val);
          for (const f of ['utopia_ok', 'utopia_fail', 'bci_ok', 'bci_shut', 'yank', 'spinoff', 'red_cell', 'rose_cell']) if (S.flags[f]) X.unlocked[f] = (X.unlocked[f] || 0) + 1;
        }
      }
    }
  }
  const med = a => a.sort((x, y) => x - y)[Math.floor(a.length / 2)] || 0;
  for (const [k, r] of Object.entries(stat)) {
    const ends = Object.entries(r.ends).sort((a, b) => b[1] - a[1]).map(([id, c]) => `${ENDINGS[id].name}${Math.round(c / r.n * 100)}%`).join(' ');
    console.log(`${k.padEnd(10)} n=${r.n} 平均存活${(r.t / r.n).toFixed(0)}月 平均轮次${(r.stage / r.n).toFixed(1)} 估值中位${(med(r.val) / 1e4).toFixed(1)}亿 用户峰值中位${med(r.users).toFixed(0)}万 事件${(r.ev / r.n).toFixed(0)} 卡${(r.perks / r.n).toFixed(1)} 办公室[${[1,2,3,4,5,6,7,8].map(l => Math.round(r.office.filter(x => x >= l).length / r.n * 100)).slice(3).join("/")}%≥4..8档] 各轮月份[${(r.rt || []).map((t, i) => (t / r.rn[i]).toFixed(0) + '(' + Math.round(r.rn[i] / r.n * 100) + '%)').join(' ')}] | ${ends}`);
  }
  for (const [st, r] of Object.entries(byStyle)) console.log(`${('[' + st + ']').padEnd(10)} n=${r.n} 估值中位${(med(r.val) / 1e4).toFixed(1)}亿 | ${Object.entries(r.ends).sort((a, b) => b[1] - a[1]).map(([id, c]) => `${ENDINGS[id].name}${Math.round(c / r.n * 100)}%`).join(' ')}`);
  for (const [r, X] of Object.entries(ideo)) console.log(`路线之争（${r === 'sz' ? '深圳' : '湾区'}）：${X.all} 局里 ${X.n} 局开了链 → 左翼 ${X.red} · 资本 ${X.cap} · 股权不够 ${X.fail} · 没走完 ${X.on}；成就 ${X.road} 局；估值中位 左${(med(X.val.red) / 1e4).toFixed(0)}亿 资${(med(X.val.cap) / 1e4).toFixed(0)}亿 无${(med(X.val.none) / 1e4).toFixed(0)}亿${X.heat.length ? `；终局反共压力中位 ${med(X.heat).toFixed(0)}` : ''}；${Object.entries(X.unlocked).map(([k, v]) => k + ' ' + v).join(' · ')}`);
  console.log('提示出现频率（占所有月份）：' + Object.entries(HINT_N).sort((a, b) => b[1] - a[1]).map(([k, c]) => `${k} ${Math.round(c / hintMonths.n * 100)}%`).join(' · '));
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

// 给界面对照准备一批局面：机器人打的若干局里抽几个月，再造几个路线之争、教学、多层楼、结局前的局面。
//   node gen-ui-states.mjs <项目根目录> <输出.json>
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const [root, out] = process.argv.slice(2);
const bot = await import(pathToFileURL(path.join(root, 'tools/bot.mjs'))), G = await import(pathToFileURL(path.join(root, 'src/game/engine.js')));
function seeded(seed) { let s = seed | 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clone = x => JSON.parse(JSON.stringify(x));
const states = [];
const pickMonths = [2, 6, 13, 22, 34, 47, 60, 70];
const runs = [['bay', 'model', 'chat', 'clean'], ['sz', 'model', 'code', 'shady'], ['bay', 'app', 'companion', 'advice'], ['sz', 'app', 'video', 'clean'], ['sz', 'model', 'companion', 'advice'], ['bay', 'model', 'video', 'shady']];
for (const [i, [region, route, track, style]] of runs.entries()) {
  const real = Math.random; Math.random = seeded(500 + i);
  try {
    const S = G.newGame({ ...bot.mkSetup({ region, route, track }, style), tutorial: i === 3 }, {});
    bot.drain(S, null, style === 'shady');
    for (let g = 0; g < 80 && !S.over; g++) {
      if (pickMonths.includes(S.t)) states.push({ tag: `${region}/${route}/${track}/${style} 第 ${S.t} 月`, S: clone(S) });
      bot.playMonth(S, style);
    }
    if (S.over) states.push({ tag: `${region}/${route} 结局 ${S.over.id}`, S: clone(S), over: true });
  } finally { Math.random = real; }
}
// 路线之争：拿一个中后期的局面改出几种情况
const base = states.filter(x => !x.over && x.S.t >= 34);
const ideo = (src, v, patch, flags = {}) => { const S = clone(src.S); S.co.region = v === 'us' ? 'bay' : 'sz'; S.ideo = { v, on: 1, n: 6, heat: v === 'us' ? 40 : 0, red: 45, cap: 38, picks: [{ n: 1, side: 'red', label: '甲' }, { n: 2, side: 'cap', label: '乙' }, { n: 3, side: 'red', label: '丙' }], used: {}, shown: {}, t0: S.t - 6, result: null, goal: null, full: null, fired: 1, ...patch }; Object.assign(S.flags, flags); S.chains.ideo = { id: 'ideo', t: S.t - 6, notes: [{ t: S.t - 6, text: '路线之争开始。' }] }; for (const [k, e] of S.staff.entries()) if (k % 3 === 0) e.red = 1; return S; };
for (const [k, v] of ['cn', 'us'].entries()) {
  const src = base[k * 3 % base.length];
  states.push({ tag: `路线之争进行中 ${v}`, S: ideo(src, v, {}, v === 'us' ? { commonsCap: 1, us_chain: 1 } : { stateCap: 1 }) });
  states.push({ tag: `路线之争 ${v} 股权危险`, S: (() => { const S = ideo(src, v, { n: 13, heat: v === 'us' ? 88 : 0 }); S.equity = 38; return S; })() });
  states.push({ tag: `左翼结局 ${v}`, S: (() => { const S = ideo(src, v, { on: 0, n: 15, red: 100, cap: 40, result: 'red', goal: v === 'us' ? 'rose' : 'red', tEnd: S0t(src) - 1, plan: { kind: 'users', goal: 999, due: S0t(src) + 8, t: S0t(src) } }, v === 'us' ? { rose: 1, utopia_on: 1, bci_on: 1, rose_cell: 1 } : { red: 1, utopia_ok: 1, red_cell: 1 }); return S; })() });
  states.push({ tag: `保守结局 ${v}`, S: ideo(src, v, { on: 0, n: 15, red: 30, cap: 100, result: 'cap', goal: v === 'us' ? 'missionco' : 'cap', tEnd: S0t(src) - 2 }, v === 'us' ? { missionco: 1, yank: 1, bci_ok: 1 } : { capb: 1, yank: 1, bci_on: 1 }) });
  states.push({ tag: `没走成 ${v}`, S: ideo(src, v, { on: 0, n: 15, red: 60, cap: 50, result: 'fail', tEnd: S0t(src) - 3 }) });
  states.push({ tag: `接盘老股窗口 ${v}`, S: (() => { const S = clone(src.S); S.co.region = v === 'us' ? 'bay' : 'sz'; S.q = [{ type: 'event', id: 'ideo_entry' }]; return S; })() });
}
function S0t(src) { return src.S.t; }
// 对赌、黑料、特殊项目、多层楼
{ const S = clone(base[0].S); S.vam = { due: S.t + 3, target: S.users * 2 + 10 }; S.dirt.push({ uid: 'dz', type: 'tax', name: '偷税漏税', sev: 30, t: S.t - 4 }); S.exposed = 30; S.exposedCrime = 20; S.projects.push({ uid: 'pz', id: 'z', name: '测试项目', desc: '一个测试用的特殊项目', kind: 'res', need: 6, done: 2, t: S.t, due: S.t + 2, ok: null, fail: null }); S.co.office = Math.min(5, S.co.office + 2); S.temp.push({ key: 'growthMult', mult: 1.2, until: S.t + 3 }); states.push({ tag: '对赌 + 黑料 + 项目 + 多层楼', S }); }
{ const S = clone(base[1 % base.length].S); S.q = [{ type: 'event', id: 'year_board' }]; states.push({ tag: '年度董事会窗口', S }); }
{ const S = clone(base[2 % base.length].S); S.q = [{ type: 'draft' }]; states.push({ tag: '董事会卡三选一', S }); }
writeFileSync(out, JSON.stringify(states));
console.log(states.length, '个局面：', states.map(s => s.tag).join(' | '));

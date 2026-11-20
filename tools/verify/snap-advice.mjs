// 参谋提示逐项对照：旧版（git HEAD）和新版（文字、门槛读表）在同一批局面下给出的提示必须完全一样。
// 局面：机器人打的 32 局里每个月的状态，再在每个状态上改几样东西（缺钱、士气低、口碑差、监管高、黑料多、对赌快到期、路线之争的各种阶段……），保证每条规则都触发过。
//   node snap-advice.mjs <旧版 src 目录> <项目根目录>
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const [oldSrc, root] = process.argv.slice(2);
const OA = await import(pathToFileURL(path.join(oldSrc, 'game/advice.js'))), NA = await import(pathToFileURL(path.join(root, 'src/game/advice.js')));
const bot = await import(pathToFileURL(path.join(root, 'tools/bot.mjs'))), G = await import(pathToFileURL(path.join(root, 'src/game/engine.js')));
const canon = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(kk => [kk, x[kk]])) : x));
function seeded(seed) { let s = seed | 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clone = x => JSON.parse(JSON.stringify(x));
// 收集局面
const states = [];
for (const [i, setup] of bot.setups.entries()) for (const style of ['clean', 'advice']) {
  const real = Math.random; Math.random = seeded(1000 + i * 7 + (style === 'advice' ? 3 : 0));
  try {
    const S = G.newGame(bot.mkSetup(setup, style), {});
    bot.drain(S, null, false);
    for (let g = 0; g < 80 && !S.over; g++) { states.push(clone(S)); bot.playMonth(S, style); }
  } catch (e) { /* 机器人偶尔卡住：用已经收集到的 */ } finally { Math.random = real; }
}
// 每个局面再改出几种变体
const VARIANTS = [
  S => S,
  S => { S.cash = -5; S.policies.price = 'free'; return S; },
  S => { S.cash = 20; S.gpu = Math.max(S.gpu, 30); return S; },
  S => { S.morale = 22; S.policies.work = '996'; S.streak.x996 = 7; S.stage = Math.max(S.stage, 2); S.equity = 40; return S; },
  S => { S.morale = 30; S.rep = 31; S.stage = Math.max(S.stage, 2); S.equity = 44; delete S.cd.coup; return S; },
  S => { S.rep = 25; S.hype = 5; S.t = Math.max(S.t, 8); return S; },
  S => { S.reg = 75; S.policies.safety = 'loose'; return S; },
  S => { S.reg = 92; return S; },
  S => { S.dirt.push({ uid: 'dx', type: 'tax', name: '偷税漏税', sev: 30, t: S.t - 5 }); S.exposedCrime = 30; S.hype = 90; S.users = Math.max(S.users, 5000); return S; },
  S => { S.dirt.push({ uid: 'dy', type: 'overwork', name: '过劳', sev: 18, t: S.t - 5 }); S.hype = 70; return S; },
  S => { S.vam = { due: S.t + 3, target: S.users * 3 + 50 }; return S; },
  S => { S.projects.push({ uid: 'px', id: 'x', name: '测试项目', desc: '', kind: ['res', 'eng', 'ap', 'gpu'][S.t % 4], need: 9, done: 1, t: S.t, due: S.t + 2, ok: null, fail: null }); return S; },
  S => { S.ideo = { v: S.co.region === 'bay' ? 'us' : 'cn', on: 1, n: 9, red: 50, cap: 40, heat: 75, picks: [], used: {}, shown: {} }; S.equity = 41; return S; },
  S => { S.ideo = { v: S.co.region === 'bay' ? 'us' : 'cn', on: 0, n: 15, red: 100, cap: 40, heat: 85, result: 'red', tEnd: S.t - 1, picks: [] }; S.flags.red = 1; S.flags.rose = 1; return S; },
  S => { S.ideo = { v: S.co.region === 'bay' ? 'us' : 'cn', on: 0, n: 15, red: 30, cap: 100, heat: 0, result: 'cap', tEnd: S.t - 2, picks: [] }; S.flags.capb = 1; S.flags.missionco = 1; return S; },
  S => { S.stage = 5; S.streak.profit = 8; S.cash = 1e5; S.dirt = []; return S; },
  S => { S.gpu = G.quota(S) + 12; S.cash = Math.max(S.cash, 5000); S.ap = 3; delete S.cd.beg; return S; },
  S => { S.cash = 1e6; S.lastRaiseT = S.t - 12; S.raiseBoost = 0; S.ideo = { v: 'cn', on: 1, n: 3, red: 20, cap: 30, heat: 0, picks: [] }; S.equity = 46; return S; },
];
let n = 0, bad = 0;
const ids = new Map();
for (const s0 of states) for (const [vi, v] of VARIANTS.entries()) {
  const a = v(clone(s0)), b = clone(a);
  let ha, hb, ea = null, eb = null;
  try { ha = OA.advise(a); } catch (e) { ea = e.message; }
  try { hb = NA.advise(b); } catch (e) { eb = e.message; }
  n++;
  const ca = canon(ea || [ha, ha.map(OA.muteMonths)]), cb = canon(eb || [hb, hb.map(NA.muteMonths)]);
  if (ca !== cb) {
    if (bad++ < 6) { let p = 0; while (p < ca.length && ca[p] === cb[p]) p++; console.log(`✗ 变体 ${vi}（第 ${s0.t} 个月 ${s0.co.region}/${s0.co.route}），第 ${p} 个字符起：\n 旧：…${ca.slice(Math.max(0, p - 100), p + 160)}\n 新：…${cb.slice(Math.max(0, p - 100), p + 160)}`); }
    continue;
  }
  for (const h of ha || []) { const k = h.id.startsWith('proj-') ? 'proj' : h.id; ids.set(k, (ids.get(k) || 0) + 1); }
  if (ha?.length) { const h = ha[0], ma = clone(a), mb = clone(a); OA.muteHint(ma, h); NA.muteHint(mb, h); if (canon(ma.hintMute) !== canon(mb.hintMute)) { bad++; console.log('✗ muteHint 不一样'); } }
}
console.log(`${bad ? '✗' : '✓'} ${states.length} 个局面 × ${VARIANTS.length} 种变体 = ${n} 次${bad ? `，${bad} 次不一样` : '，旧版新版完全一样'}`);
console.log('出现过的提示：', [...ids].sort((x, y) => y[1] - x[1]).map(([k, c]) => `${k}×${c}`).join(' '));
process.exit(bad ? 1 : 0);

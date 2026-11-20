// 新手教学对照：每一步的提示（两种路线、两个地区）、以及机器人开着教学打 16 局时每个月开放了什么，新旧必须一样
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const [oldSrc, root] = process.argv.slice(2);
const OT = await import(pathToFileURL(path.join(oldSrc, 'ui/tutorial.js'))), NT = await import(pathToFileURL(path.join(root, 'src/ui/tutorial.js')));
const bot = await import(pathToFileURL(path.join(root, 'tools/bot.mjs'))), G = await import(pathToFileURL(path.join(root, 'src/game/engine.js')));
const canon = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(kk => [kk, x[kk]])) : x));
function seeded(seed) { let s = seed | 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clone = x => JSON.parse(JSON.stringify(x));
let n = 0, bad = 0;
const same = (where, a, b) => { n++; if (canon(a) !== canon(b)) { bad++; if (bad < 6) console.log(`✗ ${where}\n 旧：${canon(a).slice(0, 300)}\n 新：${canon(b).slice(0, 300)}`); } };
for (const region of ['sz', 'bay']) for (const ownModel of [true, false]) for (const s of OT.STEPS) {
  const S = { t: 5, co: { region }, ownModel, tut: { on: true, open: {}, queue: [s.key] } };
  same(`提示 ${s.key} ${region} ${ownModel}`, OT.currentTip(S), NT.currentTip(S));
}
for (const [i, setup] of bot.setups.entries()) {
  const real = Math.random; Math.random = seeded(77 + i);
  try {
    const S = G.newGame({ ...bot.mkSetup(setup, 'clean'), tutorial: true }, {});
    for (let g = 0; g < 14 && !S.over; g++) {
      const a = clone(S), b = clone(S);
      same(`第 ${S.t} 个月开放`, [OT.advanceTutorial(a), a.tut, OT.currentTip(a)], [NT.advanceTutorial(b), b.tut, NT.currentTip(b)]);
      NT.advanceTutorial(S); while (NT.currentTip(S)) NT.dismissTip(S);
      bot.drain(S, null, false); bot.playMonth(S, 'clean');
    }
  } finally { Math.random = real; }
}
console.log(`${bad ? '✗' : '✓'} 新手教学对照 ${n} 项${bad ? `，${bad} 项不一样` : '，新旧完全一样'}`);
process.exit(bad ? 1 : 0);

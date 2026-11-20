// 游戏载入后拿到的说明（填好变量的）和改之前表里的原文逐条比
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const [sp, root] = process.argv.slice(2);
const old = f => JSON.parse(readFileSync(path.join(sp, f), 'utf8'));
const D0 = old('defs.before-refs.json'), E0 = old('events.before-refs.json'), C0 = old('ideology_cn.before-refs.json'), U0 = old('ideology_us.before-refs.json');
const defs = await import(pathToFileURL(path.join(root, 'src/data/defs.js')));
const { defTexts } = await import(pathToFileURL(path.join(root, 'src/data/refs.js')));
const core = await import(pathToFileURL(path.join(root, 'src/data/tables/events.json'), import.meta.url), { with: { type: 'json' } });
let n = 0, bad = 0, tmpl = 0;
const same = (where, a, b) => { n++; if (a !== b) { bad++; if (bad < 8) console.log(`✗ ${where}\n  原文：${b}\n  现在：${a}`); } };
// 设定：defs.js 导出的对象就是载入时填过的；和原 JSON 按同样的顺序对上
const live = { PERKS: defs.PERKS, FEATURES: defs.FEATURES, GOALS: defs.GOALS, POLICIES: defs.POLICIES, REGIONS: defs.REGIONS, TRAITS: defs.TRAITS, STAFF_QUIRKS: defs.STAFF_QUIRKS, DATA_SOURCES: defs.DATA_SOURCES, META_SHOP: defs.META_SHOP, ACHIEVEMENTS: defs.ACHIEVEMENTS, ATTRS: defs.ATTRS, MODS: D0.MODS };
const a = defTexts(live), b = defTexts(D0), t = defTexts(JSON.parse(readFileSync(path.join(root, 'src/data/tables/defs.json'), 'utf8')));
if (a.length !== b.length) console.log('条数不一样', a.length, b.length);
a.forEach(([name, id, , key, host], i) => { same(`设定 › ${name} › ${id}.${key}`, host[key], b[i][4][b[i][3]]); if (/\{/.test(t[i][4][t[i][3]])) tmpl++; });
// 系统事件：events_core.js 载入时填过选项的 label / hint
const { EVENTS_CORE } = await import(pathToFileURL(path.join(root, 'src/data/events_core.js')));
const raw = Object.fromEntries(E0.EVENTS_CORE.map(e => [e.id, e]));
for (const e of EVENTS_CORE) { const r = raw[e.id]; if (!Array.isArray(e.options)) continue; }
const T1 = JSON.parse(readFileSync(path.join(root, 'src/data/tables/events.json'), 'utf8'));
const evMod = await import(pathToFileURL(path.join(root, 'src/data/events_core.js')));
// bindEvents 包过的事件有的 options 是函数：直接比 events_core.js 里被就地填好的 T.EVENTS_CORE（同一份 JSON 模块对象）
const { default: TE } = await import(pathToFileURL(path.join(root, 'src/data/tables/events.json')), { with: { type: 'json' } });
TE.EVENTS_CORE.forEach((e, i) => (e.options || []).forEach((o, j) => { for (const k of ['label', 'hint']) if (o[k] != null) same(`事件 › ${e.id} 第 ${j + 1} 个.${k}`, o[k], E0.EVENTS_CORE[i].options[j][k]); }));
// 路线之争：接盘老股的提示
for (const [m, O, z] of [['ideology.js', C0, '深圳'], ['ideology_us.js', U0, '湾区']]) {
  const mod = await import(pathToFileURL(path.join(root, 'src/data', m)));
  mod.SYS_EVENTS.forEach((e, i) => e.options.forEach((o, j) => same(`路线之争-${z} › ${e.id}.${o.fn}.hint`, o.hint, O.SYS_EVENTS[i].options[j].hint)));
}
console.log(`${bad ? '✗' : '✓'} 载入后的说明和原文逐条比：${n} 条${bad ? `，${bad} 条不一样` : '，一字不差'}（其中设定.xlsx 里写成变量的 ${tmpl} 条）`);
process.exit(bad ? 1 : 0);

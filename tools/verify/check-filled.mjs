// 游戏载入后拿到的说明（填好变量的）和改之前表里的原文逐条比
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const [sp, root] = process.argv.slice(2);
const old = f => JSON.parse(readFileSync(path.join(sp, f), 'utf8'));
const D0 = old('defs.before-refs.json'), E0 = old('events.before-refs.json'), C0 = old('ideology_cn.before-refs.json'), U0 = old('ideology_us.before-refs.json');
const defs = await import(pathToFileURL(path.join(root, 'src/data/defs.js')));
const { defTexts } = await import(pathToFileURL(path.join(root, 'src/data/refs.js')));
const load = name => import(pathToFileURL(path.join(root, 'src/data', name)));
let n = 0, bad = 0, tmpl = 0;
const same = (where, a, b) => { n++; if (a !== b) { bad++; if (bad < 8) console.log(`✗ ${where}\n  原文：${b}\n  现在：${a}`); } };
// 设定：defs.js 导出的对象就是载入时填过的；和原 JSON 按同样的顺序对上
const live = { ...defs, MODS: D0.MODS };
const a = defTexts(live), b = defTexts(D0), t = defTexts(JSON.parse(readFileSync(path.join(root, 'src/data/tables/defs.json'), 'utf8')));
if (a.length !== b.length) throw new Error(`设定说明条数不一致：现在 ${a.length}，原文 ${b.length}`);
a.forEach(([name, id, , key, host], i) => { same(`设定 › ${name} › ${id}.${key}`, host[key], b[i][4][b[i][3]]); if (/\{/.test(t[i][4][t[i][3]])) tmpl++; });
// 按旧快照遍历，避免当前版本删掉的选项或字段漏比。
const counts = { 设定说明: a.length };
function compareOptions(group, before, after, fields) {
  for (const [index, original] of (before || []).entries()) for (const field of fields) {
    const actual = after?.[index]?.[field];
    if (original[field] == null && actual == null) continue;
    same(group + ' › 第 ' + (index + 1) + ' 个.' + field, actual, original[field]);
    const category = group.split(' › ')[0];
    counts[category] = (counts[category] || 0) + 1;
  }
}
await load('events_core.js');
const { EVENTS_PACK } = await load('events_pack.js');
const { default: loaded } = await import(pathToFileURL(path.join(root, 'src/data/tables/events.json')), { with: { type: 'json' } });
for (const [group, before, after] of [['系统选项', E0.EVENTS_CORE, loaded.EVENTS_CORE], ['随机选项', E0.EVENTS_PACK, EVENTS_PACK]]) {
  for (const event of before) compareOptions(group + ' › ' + event.id, event.options, after.find(row => row.id === event.id)?.options, ['label', 'hint']);
}
for (const [file, before, city] of [['ideology.js', C0, '深圳'], ['ideology_us.js', U0, '湾区']]) {
  const after = await load(file);
  for (const event of before.SYS_EVENTS) compareOptions(city + '系统选项 › ' + event.id, event.options, after.SYS_EVENTS.find(row => row.id === event.id)?.options, ['hint']);
  for (const [id, ending] of Object.entries(before.IDEO_ENDINGS)) compareOptions(city + '结局选项 › ' + id, ending.options, after.IDEO_ENDINGS[id]?.options, ['hint', 'text']);
}
// before-refs 没有文本表；旁置的两条原文摘自迁移前的 Git 版本 6400503，不改旧快照。
const originals = JSON.parse(readFileSync(new URL('./purge-text-baseline.json', import.meta.url), 'utf8'));
const { text } = await load('text.js');
counts.文本 = 0;
for (const [key, original] of Object.entries(originals)) for (const field of ['text', 'bay']) {
  same('文本 › ' + key + '.' + field, text(key, undefined, field === 'bay'), original[field]);
  counts.文本++;
}
console.log(Object.entries(counts).map(([name, count]) => name + ' ' + count + ' 条').join('；'));
console.log(`${bad ? '✗' : '✓'} 载入后的说明和原文逐条比：${n} 条${bad ? `，${bad} 条不一样` : '，一字不差'}（其中设定.xlsx 里写成变量的 ${tmpl} 条）`);
process.exit(bad ? 1 : 0);

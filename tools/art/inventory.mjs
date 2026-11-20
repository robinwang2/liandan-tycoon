// 美术清单（美术.xlsx）：从代码里重新算一遍道具和插画的清单，写进 src/data/tables/art.json，再生成 tables/美术.xlsx。
//   node tools/art/inventory.mjs
// 道具：用 three 在 Node 里把 src/scene3a/props.js 的每个道具搭一遍（四种随机外观），量尺寸、数三角面和材质，面数预算和 tools/props-check.mjs 一样。
// 插画：src/assets/art 下的每一张，数一数表格和代码里引用了几次。
// 手填的列（状态、源文件、来源、授权、备注）按 id 保留：先在表里改、npm run tables 导出，再跑这个脚本也不会丢。
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..', '..');
const { pretty } = await import(pathToFileURL(path.join(ROOT, 'tools/tables/lib/json.mjs')));
const { makeKit } = await import(pathToFileURL(path.join(ROOT, 'src/scene3a/kit.js')));
const { PROPS } = await import(pathToFileURL(path.join(ROOT, 'src/scene3a/props.js')));
const out = path.join(ROOT, 'src/data/tables/art.json');
const old = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { PROPS: [], ART: [] };
const keep = (list, id, keys) => { const o = list.find(x => x.id === id) || {}; return Object.fromEntries(keys.map(k => [k, o[k]])); };

// 面数预算：和 tools/props-check.mjs 里的规则一样（从那里读，免得两处对不上）
const chk = readFileSync(path.join(ROOT, 'tools/props-check.mjs'), 'utf8');
const small = new Set([...(/const small = new Set\('([^']+)'/.exec(chk)[1].split(' ')), ...(/for \(const name of '([^']+)'\.split/.exec(chk)[1].split(' '))]);
const budget = n => ['crane_tower', 'glass_room', 'roof_garden', 'scaffold'].includes(n) ? 40000 : /^(car|robotaxi|van_|bus_city|scooter|food_truck)/.test(n) ? 20000 : /tree|bush|plant_tall/.test(n) ? 14000 : small.has(n) ? 6000 : 15000;
if (!chk.includes("const budget = n => ['crane_tower','glass_room','roof_garden','scaffold'].includes(n) ? 40000")) console.log('⚠ tools/props-check.mjs 的面数预算规则改过了，这里的 budget() 也要跟着改');

const k = makeKit(), props = [];
for (const [id, spec] of Object.entries(PROPS)) {
  let tris = 0, mats = 0, anim = false;
  for (let seed = 0; seed < 4; seed++) {
    const g = spec.build(k, { seed, brand: '#3d968d' }), m = new Set(); let t = 0;
    g.userData.tick?.(0, 0);
    g.traverse(n => { if (n.isMesh) { t += (n.geometry.index?.count ?? n.geometry.attributes.position.count) / 3; (Array.isArray(n.material) ? n.material : [n.material]).forEach(x => m.add(x)); } });
    tris = Math.max(tris, t); mats = Math.max(mats, m.size); anim ||= !!g.userData.tick;
  }
  const [w, d, h] = spec.size, man = keep(old.PROPS, id, ['status', 'src', 'note']);
  props.push({ id, w, d, h, tris, budget: budget(id), mats, anim: anim || undefined, status: man.status ?? '程序生成', src: man.src, note: man.note });
}

const artDir = path.join(ROOT, 'src/assets/art'), files = readdirSync(artDir).filter(f => f.endsWith('.webp')).sort();
const tableText = readdirSync(path.join(ROOT, 'src/data/tables')).filter(f => f.endsWith('.json') && f !== 'art.json').map(f => readFileSync(path.join(ROOT, 'src/data/tables', f), 'utf8')).join('\n');
const codeText = ['src/ui/art.js', 'src/ui/ui.js', 'src/game/engine.js', 'src/game/actions.js', 'src/game/ideology.js', 'src/data/event_art.js'].map(f => readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
const count = (s, re) => (s.match(re) || []).length;
const art = files.map(f => {
  const id = f.replace(/\.webp$/, ''), man = keep(old.ART, id, ['source', 'license', 'note']);
  const uses = count(tableText, new RegExp(`"(?:art|text)":"${id}"`, 'g')) + count(codeText, new RegExp(`'${id}'|\\b${id}:`, 'g'));
  return { id, file: 'src/assets/art/' + f, uses, source: man.source, license: man.license, note: man.note };
});
writeFileSync(out, pretty({ PROPS: props, ART: art }) + '\n');
const over = props.filter(p => p.tris > p.budget), unused = art.filter(a => !a.uses);
console.log(`道具 ${props.length} 个（超预算 ${over.length} 个${over.length ? '：' + over.map(p => p.id).join('、') : ''}），插画 ${art.length} 张（没用到的 ${unused.length} 张${unused.length ? '：' + unused.map(a => a.id).join('、') : ''}）`);
// 重新生成 美术.xlsx（只动这一本）
const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/tables/build-xlsx.mjs'), '--force', '--only', 'art'], { encoding: 'utf8' });
console.log((r.stdout || '').trim().split('\n').filter(l => /美术/.test(l)).join('\n') || r.stderr);

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const [rowsFile, root] = process.argv.slice(2);
const { pretty } = await import(pathToFileURL(path.join(root, 'tools/tables/lib/json.mjs')));
const f = path.join(root, 'src/data/tables/params.json'), d = JSON.parse(readFileSync(f, 'utf8')), rows = JSON.parse(readFileSync(rowsFile, 'utf8'));
const by = {}; for (const r of rows) by[r.use] = (by[r.use] || 0) + 1;
for (const r of rows) { if (r.key in d.P) throw new Error('参数重复：' + r.key); d.ROWS.push(r); d.P[r.key] = r.value; }
writeFileSync(f, pretty(d) + '\n');
console.log('加了', rows.length, '个，共', d.ROWS.length, '个；', Object.entries(by).map(([k, n]) => `${k} ${n}`).join('、'));

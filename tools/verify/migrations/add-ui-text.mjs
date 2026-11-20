// 把 gen-ui-text.mjs 生成的文字和参数加进 text.json / params.json
//   node add-ui-text.mjs <scratchpad> <项目根目录>
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const [sp, root] = process.argv.slice(2);
const { pretty } = await import(pathToFileURL(path.join(root, 'tools/tables/lib/json.mjs')));
const rows = JSON.parse(readFileSync(path.join(sp, 'ui-text.rows.json'), 'utf8')), prs = JSON.parse(readFileSync(path.join(sp, 'ui-params.rows.json'), 'utf8'));
const tf = path.join(root, 'src/data/tables/text.json'), tj = JSON.parse(readFileSync(tf, 'utf8'));
for (const r of rows) {
  if (r.key in tj.TEXT) throw new Error('键重复：' + r.key);
  tj.TEXT[r.key] = r.bay != null ? { text: r.text, bay: r.bay } : { text: r.text }; tj.SHEET[r.key] = r.sheet;
  if (r.note) tj.TEXT_DOC[r.key] = r.note;
}
writeFileSync(tf, pretty(tj) + '\n');
const pf = path.join(root, 'src/data/tables/params.json'), pj = JSON.parse(readFileSync(pf, 'utf8'));
for (const r of prs) { if (r.key in pj.P) throw new Error('参数重复：' + r.key); pj.ROWS.push(r); pj.P[r.key] = r.value; }
writeFileSync(pf, pretty(pj) + '\n');
console.log('text.json：加了', rows.length, '条，共', Object.keys(tj.TEXT).length, '条；params.json：加了', prs.length, '个，共', pj.ROWS.length, '个');

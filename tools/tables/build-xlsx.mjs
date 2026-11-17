// 反过来：从 src/data/tables/*.json 重新生成 tables/*.xlsx。
// 平时用不到。只在两种时候用：第一次把数据搬进表格；以后改了表结构（tools/tables/schema.mjs，比如加一列、调列的顺序）。
//   node tools/tables/build-xlsx.mjs --force [--only defs,events]
// 注意：会整本覆盖。你在表里手工加的备注列、调过的列宽和颜色都会丢，先备份。
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { writeTables, readTables, JSON_DIR, TABLE_DIR } from './lib/convert.mjs';
import { firstDiff } from './lib/json.mjs';
import { BOOKS } from './schema.mjs';

const args = process.argv.slice(2), oi = args.indexOf('--only');
const only = oi >= 0 ? args[oi + 1].split(',') : null;
const targets = BOOKS.filter(b => !only || only.includes(b.out));
if (!args.includes('--force') && targets.some(b => existsSync(path.join(TABLE_DIR, b.file)))) {
  console.log('tables/ 里已经有表了。重新生成会整本覆盖（手工加的备注列、列宽、颜色都会丢）。确定要覆盖就加 --force。');
  process.exit(1);
}
const data = {};
for (const b of BOOKS) data[b.out] = JSON.parse(await readFile(path.join(JSON_DIR, b.out + '.json'), 'utf8'));
const { written, fallbacks } = await writeTables(data, TABLE_DIR, { only });
for (const w of written) console.log('✓ ' + w);
if (fallbacks.length) { console.log(`⚠ 有 ${fallbacks.length} 个格子写不成格子写法，退回成了 JSON：`); for (const f of fallbacks.slice(0, 20)) console.log('  · ' + f); }

// 写完马上读回来核对：读出来的数据必须和 JSON 一模一样（连键的顺序）
const back = await readTables(TABLE_DIR);
if (back.errors.length) { console.log(`✗ 读回来有 ${back.errors.length} 处问题：`); for (const e of back.errors.slice(0, 30)) console.log('  · ' + e); process.exit(1); }
let bad = 0;
for (const b of targets) {
  const loose = firstDiff(data[b.out], back.data[b.out], false), strict = loose ? null : firstDiff(data[b.out], back.data[b.out], true);
  if (loose) { bad++; console.log(`✗ ${b.file} 读回来内容不一样：${loose}`); }
  else if (strict) console.log(`  ${b.file}：内容一致，只是字段顺序不同（${strict}）`);
  else console.log(`  ${b.file}：读回来和 JSON 完全一致`);
}
if (bad) process.exit(1);

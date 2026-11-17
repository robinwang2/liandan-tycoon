// 导出：读 tables/*.xlsx → 检查 → 写成游戏读的 JSON（src/data/tables/*.json）。
//   node tools/tables/export.mjs            导出（npm run tables 会接着跑内容校验）
//   node tools/tables/export.mjs --check    只检查表和 JSON 是否一致，不写文件（表改了忘了导出时会报）
// 只要有一处填错，就一个文件都不写，并报出「哪本表 › 哪张表 › 第几行 › 哪一列」。
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { readTables, JSON_DIR, TABLE_DIR, ROOT } from './lib/convert.mjs';
import { pretty } from './lib/json.mjs';
import { BOOKS } from './schema.mjs';

const check = process.argv.includes('--check');
const t0 = Date.now();
const { data, errors, warnings } = await readTables(TABLE_DIR);
for (const w of warnings) console.log('⚠ ' + w);
if (errors.length) {
  console.log(`✗ 表里有 ${errors.length} 处问题，没有导出：`);
  for (const e of errors.slice(0, 60)) console.log('  · ' + e);
  if (errors.length > 60) console.log(`  …… 还有 ${errors.length - 60} 处`);
  process.exit(1);
}
await mkdir(JSON_DIR, { recursive: true });
let changed = 0;
for (const spec of BOOKS) {
  const file = path.join(JSON_DIR, spec.out + '.json'), text = pretty(data[spec.out]) + '\n';
  let old = null;
  try { old = (await readFile(file, 'utf8')).replace(/\r\n/g, '\n'); } catch { /* 第一次导出 */ }
  const same = old === text;
  if (!same) changed++;
  if (!check && !same) await writeFile(file, text);
  console.log(`${same ? '  ' : check ? '✗ ' : '✓ '}${spec.file.padEnd(16)} → ${path.relative(ROOT, file).replace(/\\/g, '/')}${same ? '（没变）' : check ? '（和表不一致）' : old == null ? '（新建）' : '（已更新）'}`);
}
if (check && changed) { console.log(`✗ 有 ${changed} 本表改过但还没导出。运行 npm run tables。`); process.exit(1); }
console.log(`${check ? '检查' : '导出'}完成，用时 ${((Date.now() - t0) / 1000).toFixed(1)} 秒。`);

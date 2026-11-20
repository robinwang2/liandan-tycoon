import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { endMonth } from '../../src/game/engine.js';
import { restore } from './trace-codec.mjs';

const dir = process.argv[2] ?? path.join(import.meta.dirname, 'trace');
const { games } = JSON.parse(await readFile(path.join(dir, 'index.json'), 'utf8'));
assert.ok(games.length, '索引为空');
let total = 0;
for (const game of games) {
  const data = gunzipSync(await readFile(path.join(dir, game.file))).toString('utf8').trimEnd();
  const lines = data ? data.split('\n') : [];
  assert.equal(lines.length, game.months, game.key);
  for (const line of lines) {
    const { t, before, after } = restore(JSON.parse(line));
    try {
      assert.equal(before.t, t);
      const state = structuredClone(before);
      endMonth(state);
      assert.deepStrictEqual(state, after);
    } catch (error) { throw Error(`${game.key} t=${t}`, { cause: error }); }
    total++;
  }
}
console.log(`快照自检通过：${games.length} 局，${total} 个月逐字段一致。`);

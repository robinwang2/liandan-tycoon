import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { restore } from './trace-codec.mjs';
import { execute, visible, seeded } from './operations.mjs';

const dir = process.argv[2] ?? path.join(import.meta.dirname, 'ops');
const { games } = JSON.parse(await readFile(path.join(dir, 'index.json')));
const counts = {};
for (const game of games) {
  const lines = createInterface({ input: createReadStream(path.join(dir, game.file)).pipe(createGunzip()), crlfDelay: Infinity });
  let step = 0, S = null, pending, source;
  for await (const line of lines) {
    const row = JSON.parse(line), { op, args } = row;
    step++;
    try {
      Math.random = seeded(row.mathRandom);
      const before = restore(row.before);
      assert.deepStrictEqual(S, before);
      if (op === 'choose') {
        assert.equal(source, row.source);
        assert.equal(pending.id ?? null, args[0]);
      } else if (!pending || op === 'nextDialog' || op === 'perform') S = before;
      const r = execute(op, S, args, pending);
      if (op === 'newGame') { S = r; assert.equal(Math.random.lastBits(), row.initialRs); }
      assert.deepStrictEqual(S, restore(row.after));
      assert.deepStrictEqual(JSON.parse(JSON.stringify(visible(op, r))), row.ret);
      if (op === 'nextDialog' || op === 'perform' || op === 'choose') {
        pending = op === 'nextDialog' ? r : r?.dialog;
        source = pending ? step : null;
      }
      counts[op] = (counts[op] || 0) + 1;
    } catch (e) { throw Error(game.key + ' 第 ' + step + ' 步 ' + op, { cause: e }); }
  }
  assert.equal(step, game.steps);
}
console.log('逐操作自检通过', games.length, '局', counts);


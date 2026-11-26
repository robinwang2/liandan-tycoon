import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as G from '../../src/game/engine.js';
import * as A from '../../src/game/actions.js';
import { getLang, setLang, tr, units } from '../../src/i18n/index.js';
import { dialogView } from '../../src/ui/dialog-view.js';
import { seeded } from '../parity/operations.mjs';
import { mkSetup, setups } from '../bot.mjs';

if (!process.argv.includes('--worker')) {
  const run = lang => execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--worker'], { env: { ...process.env, LDT_LANG: lang }, encoding: 'utf8' });
  const baseline = run('zh');
  assert.deepEqual(run('en').trim().split('\n'), baseline.trim().split('\n'));
  setLang('zh');
  const state = G.newGame(mkSetup(setups[0], 'clean'), {}), view = dialogView(state, G.nextDialog);
  const title = view.original.title, before = JSON.stringify(state);
  setLang('en'); assert.equal(view.read().dialog.id, view.original.id); assert.notEqual(view.read().dialog.title, title);
  setLang('zh'); assert.equal(view.read().dialog.title, title); assert.equal(JSON.stringify(state), before);
  const index = view.original.options.findIndex(option => !option.disabled);
  const result = G.choose(state, view.original, index); view.selected(index, result);
  const after = JSON.stringify(state); setLang('en'); view.read(); setLang('zh'); view.read(); assert.equal(JSON.stringify(state), after);
  console.log('Live dialog: toggling before and after a choice preserves the complete state and PRNG.');
  console.log(`${setups.length} seeded complete games: every step matches (state, identifiers, RNG and endings).`);
} else {
  assert.equal(getLang(), process.env.LDT_LANG);
  assert.equal(G.money({ co: { region: 'bay' } }, 123.4), getLang() === 'en' ? '$1.23M' : '$123万');
  assert.equal(G.money({ co: { region: 'sz' } }, -100000), getLang() === 'en' ? '-¥1B' : '-¥10.0亿');
  assert.equal(units('123.4万 / 2 亿'), getLang() === 'en' ? '1.23M / 200M' : '123.4万 / 2 亿');
  assert.equal(G.dateStr(27), getLang() === 'en' ? 'Mar 2025' : '2025年3月');
  assert.equal(tr('UNLISTED_TEST_VALUE'), 'UNLISTED_TEST_VALUE');
  const prose = new Set(['name', 'modelName', 'boss', 'model', 'desc', 'text', 'msg', 'note', 'staffName', 'title', 'label']);
  for (const [seed, setup] of setups.entries()) {
    Math.random = seeded(76361 + seed);
    const state = G.newGame(mkSetup(setup, 'clean'), {}), hash = createHash('sha256');
    const record = tag => hash.update(tag + JSON.stringify(state, (key, value) => typeof value === 'string' && prose.has(key) ? '<text>' : value));
    const drain = first => {
      let dialog = first || G.nextDialog(state);
      while (dialog) {
        const enabled = dialog.options.flatMap((option, index) => option.disabled ? [] : [index]);
        const index = enabled[Math.floor(Math.random() * enabled.length)];
        record(JSON.stringify([dialog.id, dialog.kind, enabled, index, dialog.options.map(option => [option.side, option.card?.id])]));
        const result = G.choose(state, dialog, index); record('choose'); dialog = result?.dialog || G.nextDialog(state);
      }
    };
    record('new'); drain();
    while (!state.over && state.t <= 75) {
      for (let count = 0; state.ap && count < 5; count++) {
        const options = A.ACTIONS.filter(action => (!action.show || action.show(state)) && !A.actionState(state, action).why);
        if (!options.length) break;
        const action = options[Math.floor(Math.random() * options.length)], result = A.perform(state, action.id);
        record(action.id); drain(result?.dialog);
      }
      G.endMonth(state); record('month'); drain();
    }
    assert.ok(state.over); console.log(seed, state.over.id, state.t, hash.digest('hex'));
  }
}

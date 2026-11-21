// 对拍：用固定的随机种子让机器人打一批完整的对局，把每个月的状态、看到的每个对话框、每段文字都记成指纹。
// 改表格、改代码之后再跑一遍：指纹一模一样，说明这次改动没有改变游戏里的任何数值和文字。
//
//   node tools/parity.mjs record [文件]     录一份基线（默认 tools/parity/baseline.json）
//   node tools/parity.mjs check  [文件]     和基线比；不一样就报出第一处分歧在哪一局、哪个月
//   node tools/parity.mjs dump   <对局>     把一局的完整过程打印出来（两个版本各打印一份，用 diff 找差别）
//   加 --seeds N 改每种开局打几局（默认 3）
//   node tools/parity.mjs trace [目录] [--seeds N] [--only 对局key]
//   node tools/parity.mjs ops [目录] [--seeds N] [--only 对局key]
//
// 以后 C# 内核也用这份记录：按同样的种子和同样的选择重放，逐月状态必须一致。
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { seeded, viewDialog, viewResult, visible, execute } from './parity/operations.mjs';
import { snapshot } from './parity/trace-codec.mjs';
import * as G from '../src/game/engine.js';
import * as A from '../src/game/actions.js';
import { setups, mkSetup, drain, playMonth, tap, call } from './bot.mjs';

const args = process.argv.slice(2), cmd = args[0] || 'check';
const flag = (name, d) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : d; };
const SEEDS = +flag('--seeds', 3);
const file = args[1] && !args[1].startsWith('--') && cmd !== 'dump' ? args[1] : path.join(import.meta.dirname, 'parity', 'baseline.json');
const STYLES = ['clean', 'shady', 'advice'];

// 记指纹时，对象里的键按字母排序：数据换了个存放的地方（比如从代码搬进表格），字段的先后顺序可能变，那不算差别
const canon = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(kk => [kk, x[kk]])) : x));
const strHash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; };

const gameKey = (setup, style, seed) => `${setup.region}/${setup.route}/${setup.track}/${style}#${seed}`;
function playOne(setup, style, k, log, month = null, operation = null) {
  const key = gameKey(setup, style, k);
  const realRandom = Math.random;
  Math.random = seeded(strHash(key));
  const all = createHash('sha1'), months = [], cover = { ev: new Set(), opt: new Set(), act: new Set() };
  let cur = createHash('sha1');
  const put = (tag, v) => { const s = tag + ' ' + canon(v) + '\n'; all.update(s); cur.update(s); log?.(s); };
  tap.dialog = (S, d) => { put('对话框', viewDialog(d)); if (d.id) cover.ev.add(d.id); };
  tap.choose = (S, d, i, r) => { put('选择', [i, viewResult(r)]); if (d.id) cover.opt.add(d.id + '#' + d.options[i].label); };
  tap.act = (S, id, r) => { put('行动', [id, viewResult(r)]); cover.act.add(id); };
  tap.hints = (S, hs) => put('提示', hs);
  tap.month = month; tap.operation = operation;
  let S, err = null;
  try {
    S = call('newGame', null, [mkSetup(setup, style), {}]);
    put('开局', S);
    drain(S, null, style === 'shady');
    let g = 0;
    while (!S.over && g++ < 80) {
      put('菜单', call('viewMenu', S));
      playMonth(S, style);
      put('月末', S);
      months.push(cur.digest('hex').slice(0, 6)); cur = createHash('sha1');
    }
  } catch (e) { err = String(e.stack || e).split('\n').slice(0, 3).join(' | '); }
  finally { Math.random = realRandom; tap.dialog = tap.choose = tap.act = tap.hints = tap.month = tap.operation = null; }
  return { key, end: S?.over?.id || null, t: S?.t, hash: all.digest('hex').slice(0, 16), months: months.join(''), err, cover };
}

function playAll() {
  const out = [], cover = { ev: new Set(), opt: new Set(), act: new Set() };
  for (const style of STYLES) for (const s of setups) for (let k = 0; k < SEEDS; k++) {
    const r = playOne(s, style, k);
    for (const c of ['ev', 'opt', 'act']) for (const x of r.cover[c]) cover[c].add(x);
    delete r.cover; if (!r.err) delete r.err;
    out.push(r);
  }
  return { out, cover };
}
const coverLine = c => `覆盖：事件 ${c.ev.size}/${Object.keys(G.EV).length} 个，选项 ${c.opt.size} 个，行动 ${c.act.size}/${A.ACTIONS.length} 个`;

if (cmd === 'record') {
  const { out, cover } = playAll();
  const bad = out.filter(r => r.err);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ seeds: SEEDS, games: out }, null, 1) + '\n');
  console.log(`录了 ${out.length} 局 → ${path.relative(process.cwd(), file)}`);
  console.log(coverLine(cover));
  const noEv = Object.keys(G.EV).filter(id => !cover.ev.has(id)), noAct = A.ACTIONS.map(a => a.id).filter(id => !cover.act.has(id));
  if (noEv.length) console.log(`没碰到的事件（${noEv.length}）：${noEv.join(' ')}`);
  if (noAct.length) console.log(`没用到的行动（${noAct.length}）：${noAct.join(' ')}`);
  if (bad.length) { console.log(`✗ ${bad.length} 局出错：`); for (const r of bad.slice(0, 5)) console.log('  ', r.key, r.err); process.exitCode = 1; }
} else if (cmd === 'check') {
  const base = JSON.parse(await readFile(file, 'utf8'));
  if (base.seeds !== SEEDS && !args.includes('--seeds')) { /* 基线里记着每种开局打了几局，照它来 */ }
  const want = new Map(base.games.map(g => [g.key, g]));
  let diff = 0, n = 0;
  for (const style of STYLES) for (const s of setups) for (let k = 0; k < base.seeds; k++) {
    const r = playOne(s, style, k), w = want.get(r.key); n++;
    if (!w) { console.log(`✗ 基线里没有 ${r.key}`); diff++; continue; }
    if (r.hash === w.hash && !r.err) continue;
    diff++;
    let m = 0; while (m * 6 < Math.min(r.months.length, w.months.length) && r.months.slice(m * 6, m * 6 + 6) === w.months.slice(m * 6, m * 6 + 6)) m++;
    if (diff <= 12) console.log(`✗ ${r.key}：第 ${m + 1} 个月开始不一样（基线 ${w.end || '无结局'} t=${w.t}，现在 ${r.end || '无结局'} t=${r.t}）${r.err ? ' 出错：' + r.err : ''}`);
  }
  if (diff) { console.log(`对拍失败：${n} 局里有 ${diff} 局和基线不一样。用 node tools/parity.mjs dump <对局> 看细节。`); process.exitCode = 1; }
  else console.log(`对拍通过：${n} 局的每个月、每个对话框、每段文字都和基线一模一样。`);
} else if (cmd === 'ops') {
  const dir = args[1] && !args[1].startsWith('--') ? args[1] : path.join(import.meta.dirname, 'parity', 'ops');
  const games = [], only = flag('--only', null);
  if (!Number.isSafeInteger(SEEDS) || SEEDS < 1 || only === undefined) throw Error('请检查 --seeds N / --only 对局key');
  const baseline = JSON.parse(await readFile(path.join(import.meta.dirname, 'parity/baseline.json'), 'utf8'));
  await mkdir(dir, { recursive: true });
  for (const style of STYLES) for (const setup of setups) for (let seed = 0; seed < SEEDS; seed++) {
    const key = gameKey(setup, style, seed);
    if (only !== null && only !== key) continue;
    let step = 0, chunk = '';
    const compressed = [], origins = new WeakMap();
    function flush() {
      if (chunk) compressed.push(gzipSync(chunk, { level: 1 }));
      chunk = '';
    }
    const result = playOne(setup, style, seed, null, null, (op, S, args, dialog) => {
      const before = snapshot(S), mathRandom = Math.random.state();
      const r = execute(op, S, args, dialog);
      const after = snapshot(op === 'newGame' ? r : S);
      const meta = { op, args, ret: visible(op, r), mathRandom };
      if (op === 'newGame') meta.initialRs = Math.random.lastBits();
      if (op === 'choose') {
        meta.source = origins.get(dialog);
        if (!meta.source) throw Error('找不到对话框来源');
      }
      step++;
      const produced = op === 'nextDialog' ? r : r?.dialog;
      if (produced) origins.set(produced, step);
      chunk += JSON.stringify(meta).slice(0, -1) + ',"before":' + before + ',"after":' + after + '}\n';
      if (chunk.length >= 512 * 1024) flush();
      return r;
    });
    const target = baseline.games.find(g => g.key === key);
    if (result.err || target && target.hash !== result.hash) throw Error(key + ' ' + (result.err || '整局指纹不同'));
    flush();
    const file = key.replaceAll('/', '_') + '.jsonl.gz';
    await writeFile(path.join(dir, file), Buffer.concat(compressed));
    games.push({ key, file, steps: step, hash: result.hash });
  }
  if (!games.length) throw Error('没有匹配的对局');
  await writeFile(path.join(dir, 'index.json'), JSON.stringify({ games }, null, 2));
  console.log(`逐操作快照：${games.length} 局，${games.reduce((n,g) => n + g.steps, 0)} 步`);
} else if (cmd === 'trace') {
  const dir = args[1] && !args[1].startsWith('--') ? args[1] : path.join(import.meta.dirname, 'parity', 'trace');
  const only = flag('--only', null), games = [];
  if (!Number.isSafeInteger(SEEDS) || SEEDS < 1 || only === undefined) throw Error('请检查 --seeds N / --only 对局key');
  await mkdir(dir, { recursive: true });
  for (const style of STYLES) for (const setup of setups) for (let seed = 0; seed < SEEDS; seed++) {
    const key = gameKey(setup, style, seed);
    if (only !== null && key !== only) continue;
    const lines = [];
    let before, t;
    const result = playOne(setup, style, seed, null, (state, phase) => {
      if (phase === 'before') { t = state.t; before = snapshot(state); }
      else lines.push(`{"t":${t},"before":${before},"after":${snapshot(state)}}\n`);
    });
    if (result.err) throw Error(`${key}: ${result.err}`);
    const file = key.replaceAll('/', '_') + '.jsonl.gz';
    await writeFile(path.join(dir, file), gzipSync(lines.join('')));
    games.push({ key, file, months: lines.length, end: result.end });
  }
  if (!games.length) throw Error(`没有匹配的对局：${only}`);
  await writeFile(path.join(dir, 'index.json'), JSON.stringify({ games }, null, 2) + '\n');
  console.log(`月度快照：${games.length} 局 → ${dir}`);
} else if (cmd === 'dump') {
  const key = args[1], m = /^(\w+)\/(\w+)\/(\w+)\/(\w+)#(\d+)$/.exec(key || '');
  if (!m) { console.log('用法：node tools/parity.mjs dump bay/model/chat/clean#0'); process.exit(1); }
  const s = setups.find(x => x.region === m[1] && x.route === m[2] && x.track === m[3]);
  const r = playOne(s, m[4], +m[5], line => process.stdout.write(line));
  console.error(r.key, r.end, 't=' + r.t, r.hash, r.err || '');
} else { console.log('用法：node tools/parity.mjs record|check|dump|trace|ops'); process.exit(1); }

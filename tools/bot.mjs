// 自动试玩的机器人：三种打法（clean 守规矩 / shady 爱走黑箱 / advice 听参谋的）。
// tools/sim.mjs（平衡统计）和 tools/parity.mjs（对拍）共用。
// 机器人的随机数全部走 Math.random：对拍时把 Math.random 换成固定种子的，整局就能重现。
import { execute } from './parity/operations.mjs';
import * as A from '../src/game/actions.js';
export function call(op, S, args = [], dialog) { return (tap.operation || execute)(op, S, args, dialog); }

const rand = () => Math.random();
export const setups = [];
for (const region of ['bay', 'sz']) for (const route of ['model', 'app']) for (const track of ['chat', 'code', 'companion', 'video']) setups.push({ region, route, track });

// 旁观口：对拍工具用它记下机器人看到的每个对话框、每次选择、每个行动
export const tap = { dialog: null, choose: null, act: null, hints: null, month: null, operation: null };

export function mkSetup(s, style) {
  const attrs = { tech: 5, cha: 5, mgmt: 5, biz: 5, net: 5, luck: 5 }, keys = Object.keys(attrs);
  for (let i = 0; i < 10; i++) { let k; do { k = keys[Math.floor(rand() * 6)]; } while (attrs[k] >= 10); attrs[k]++; }
  return { name: '测试员', coName: '混沌智能', modelName: '混沌', ...s, attrs, traits: [['yao', 'dropout', 'phd', 'shuangfei'][Math.floor(rand() * 4)], ['bigtech', 'lab', 'serial', 'hqb', 'influencer'][Math.floor(rand() * 5)], ['none', 'juan', 'huyou', 'geek', 'foxi'][Math.floor(rand() * 5)]], style };
}

// 把对话框一路点到底。shady = 这个机器人爱不爱走黑箱路线
export function drain(S, first, shady) {
  let d = first || call('nextDialog', S), guard = 0;
  while (d && guard++ < 60) {
    tap.dialog?.(S, d);
    const ok = d.options.map((o, i) => i).filter(i => !d.options[i].disabled);
    if (!ok.length && d.closable) { d = call('nextDialog', S); continue; }
    if (!ok.length) throw new Error('对话框没有可选项: ' + d.title);
    let pool = ok;
    if (!shady) { const clean = ok.filter(i => !/☠/.test(d.options[i].label + (d.options[i].hint || ''))); if (clean.length) pool = clean; }
    if (pool.some(i => !/接受邀请/.test(d.options[i].label))) pool = pool.filter(i => !/接受邀请/.test(d.options[i].label));
    if (d.id === 'broke' || d.id === 'acq_offer' || d.id === 'probe') pool = pool.filter(i => !/认输|卖了|出国|抬价/.test(d.options[i].label)).length ? pool.filter(i => !/认输|卖了|出国|抬价/.test(d.options[i].label)) : pool;
    const pickI = pool[Math.floor(rand() * pool.length)];
    const r = call('choose', S, [d.id ?? null, pickI], d);
    tap.choose?.(S, d, pickI, r);
    d = r?.dialog || call('nextDialog', S);
  }
}
export const act = (S, id, shady) => {
  const a = A.ACT[id];
  if ((a.show && !call('show', S, [id])) || call('actionState', S, [id]).why) return false;
  const r = call('perform', S, [id]);
  tap.act?.(S, id, r);
  if (r?.dialog) drain(S, r.dialog, shady); else drain(S, null, shady);
  return true;
};

// 行动提示自检：格式、文本、指向的行动都得对；顺便统计每条提示出现得多频繁
export const HINT_N = {};
export const hintMonths = { n: 0 };
export function checkHints(S) {
  const hs = call('advise', S), ids = new Set();
  hintMonths.n++;
  tap.hints?.(S, hs);
  for (const h of hs) {
    if (!h.id || !h.title || !h.text || !['bad', 'gold', 'warn'].includes(h.lv)) throw new Error('提示格式不对: ' + JSON.stringify(h));
    if (ids.has(h.id)) throw new Error('提示 id 重复: ' + h.id);
    if (/undefined|NaN|null|\[object/.test(h.title + h.text)) throw new Error(`提示文本可疑 [${h.id}] ${h.title}：${h.text}`);
    if (h.act && !A.ACT[h.act]) throw new Error('提示指向不存在的行动: ' + h.act);
    ids.add(h.id);
    const k = h.id.startsWith('proj-') ? 'proj' : h.id;
    HINT_N[k] = (HINT_N[k] || 0) + 1;
  }
  return hs;
}

export function playMonth(S, style) {
  const shady = style === 'shady', hs = checkHints(S);
  // 「听参谋的」机器人：先按提示做事，剩下的行动点再走通用逻辑
  if (style === 'advice') for (const h of hs) {
    if (S.ap <= 0 || S.over) break;
    if (h.act && !h.later) act(S, h.act, false);
    else if (h.id === 'hire') call('hire', S, [h.hl.slice(4)]);
    else if (h.id.startsWith('proj-')) call('pushProject', S, [h.hl.slice(5)]);
  }
  // 算力：推理够用 + 拿预算的一部分炼丹
  if (S.ownModel) { const budget = Math.max(0, S.cash) / (14 * call('gpuPrice', S)); call('setGpu', S, [Math.max(call('inferNeed', S) * 1.1, Math.min(call('quota', S), budget))]); }
  for (const p of S.projects) if (p.kind === 'ap' && S.ap > 0 && rand() < 0.7) call('pushProject', S, [p.uid]);
  let guard = 0;
  while (S.ap > 0 && !S.over && guard++ < 12) {
    const rw = call('runway', S);
    if ((rw < 9 || S.t - S.lastRaiseT > 10) && act(S, 'raise', shady)) continue;
    if (S.staff.length >= call('teamCap', S) && S.cash > 8 * call('actionState', S, ['office']).cost && act(S, 'office', shady)) continue;
    if (rw > 7 && S.staff.length < call('teamCap', S) && S.cands.length && S.ap >= 1) {
      const c = S.cands.slice().sort((a, b) => b.skill - a.skill)[0];
      const r = call('hire', S, [c.uid]); if (r && !r.err) continue;
    }
    if (act(S, 'release', shady)) continue;
    if (act(S, 'ipo', shady)) continue;
    if (!S.sprint && act(S, 'sprint', shady)) continue;
    if (!S.ownModel && S.stage >= 3 && rand() < 0.3 && act(S, 'selfdev', shady)) continue;
    const opts = ['hype', 'ads', 'code', 'teambuild', 'roadshow', 'goodpr', 'lobby', 'pie', 'sellcourse', 'subsidy', 'beg', 'paper'].concat(shady ? ['navy', 'fakeusers', 'digdirt', 'furnace'] : ['wash'], ['mobilize', 'utopia', 'selfcrit', 'subbotnik', 'plan', 'yank', 'bci', 'buyback', 'costcut', 'spinoff']);
    if (!act(S, opts[Math.floor(rand() * opts.length)], shady)) { if (guard > 8) break; }
  }
  if (S.over) return;
  if (S.streak.profit < 3 && S.stage >= 5 && S.policies.price !== 'premium') call('setPolicy', S, ['price', 'premium']);
  tap.month?.(S, 'before');
  call('endMonth', S);
  tap.month?.(S, 'after');
  drain(S, null, shady);
}

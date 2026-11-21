import * as G from '../../src/game/engine.js';
import * as A from '../../src/game/actions.js';
import { advise } from '../../src/game/advice.js';

// 外层 mulberry32：state 给逐操作重放，lastBits 保留开局实际抽到的有符号种子。
export function seeded(seed) {
  let state = seed | 0, lastBits;
  const next = () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    lastBits = t ^ (t >>> 14);
    return (lastBits >>> 0) / 4294967296;
  };
  next.state = () => state;
  next.lastBits = () => lastBits;
  return next;
}

export const viewDialog = d => ({
  kind: d.kind, id: d.id, cat: d.cat, icon: d.icon, title: d.title, text: d.text, art: d.art, chain: d.chain, portrait: d.portrait, delay: d.delay, closable: d.closable,
  options: d.options.map(o => ({ label: o.label, hint: o.hint, chk: o.chk, disabled: o.disabled, why: o.why, side: o.side, free: o.free, tip: o.tip, card: o.card, key: o.key })),
});
export const viewResult = r => (r ? { text: r.text, ok: r.ok, chips: r.chips, err: r.err, dialog: r.dialog ? viewDialog(r.dialog) : undefined } : null);
export const viewMenu = S => A.ACTIONS.map(a => {
  const show = a.show ? !!a.show(S) : true;
  return show ? { id: a.id, name: A.actName(S, a), desc: a.desc(S), ...A.actionState(S, a) } : { id: a.id, show };
});

// 机器人与引擎之间的调用边界；菜单的一次全量读取合为一个操作。
export function execute(op, S, args, dialog) {
  switch (op) {
    case 'newGame': return G.newGame(...args);
    case 'choose': return G.choose(S, dialog, args[1]);
    case 'viewMenu': return viewMenu(S);
    case 'show': return A.ACT[args[0]].show(S);
    case 'actionState': return A.actionState(S, A.ACT[args[0]]);
    case 'advise': return advise(S);
    case 'perform': case 'setGpu': case 'setPolicy': case 'hire': return A[op](S, ...args);
    default: return G[op](S, ...args);
  }
}

export function visible(op, r) {
  if (op === 'newGame') return null; // 完整开局在 after
  if (op === 'nextDialog') return r && viewDialog(r);
  if (['choose', 'perform', 'hire', 'pushProject'].includes(op)) return viewResult(r);
  return r ?? null;
}


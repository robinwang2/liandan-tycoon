// 新手教学：系统逐个开放，每开放一样就由「学长老周」讲两句。
// 状态存在 S.tut = { on, open: { key: 1 }, queue: [key...], dirt0 }；S.tut 为空表示老手模式，全部开放。
// 老周说的话在 文本.xlsx「教学」里（tut.<步骤>.title / .text）；每一步第几个月开放在 平衡参数.xlsx 里（tut. 开头）。
import { runway } from '../game/engine.js';
import { ACT } from '../game/actions.js';
import { P } from '../data/defs.js';
import { text } from '../data/text.js';

// 按顺序检查；when 满足就开放。hl 是要高亮的按钮（data-a 的值），go 是顺手切过去的页签；tip 返回这一步用「教学」表里的哪一段（默认 tut.<key>）
export const STEPS = [
  { key: 'start', when: () => true, hl: 'act:code' },
  { key: 'team', when: S => S.t >= P['tut.team'], hl: 'ltab:team', go: { ltab: 'team', rtab: 'team' } },
  { key: 'product', when: S => S.t >= P['tut.product'], hl: 'act:sprint', go: { ltab: 'rd', rtab: 'fin' } },
  { key: 'pr', when: S => S.t >= P['tut.pr'], hl: 'ltab:pr' },
  { key: 'model', when: S => S.t >= P['tut.model'], tip: S => (S.ownModel ? 'tut.model' : 'tut.model.app'), hl: 'ltab:ops', go: { ltab: 'ops', rtab: 'board' } },
  { key: 'cap', when: S => S.t >= P['tut.cap'] || runway(S) < P['tut.capRunway'], hl: 'ltab:cap', go: { ltab: 'cap' } },
  { key: 'dirt', when: S => S.t >= P['tut.dirt'] || S.exposed > 0 || S.dirt.length > (S.tut.dirt0 || 0), go: { rtab: 'safe' } },
  { key: 'policy', when: S => S.t >= P['tut.policy'], hl: 'ltab:ops', go: { ltab: 'ops' } },
  { key: 'chain', when: S => S.projects.length > 0 || Object.keys(S.chains).length > 0, go: { rtab: 'chain' } },
  { key: 'perks', when: S => S.perks.length > 0, go: { rtab: 'perks' } },
  { key: 'done', when: S => S.t >= P['tut.done'] && S.tut.open.policy },
];
const STEP = Object.fromEntries(STEPS.map(s => [s.key, s]));

// 每个行动、页签、仪表属于哪一步
const ACT_KEY = { code: 'start', sprint: 'product', release: 'model', furnace: 'model', paper: 'model', beg: 'model', sweep: 'model', headhunt: 'team', teambuild: 'team', pie: 'team', office: 'team', raise: 'cap', roadshow: 'cap', ipo: 'cap', selfdev: 'cap', subsidy: 'cap', lobby: 'policy', hype: 'pr', ads: 'pr', goodpr: 'pr', sellcourse: 'pr', navy: 'dirt', fakeusers: 'dirt', wash: 'dirt', digdirt: 'dirt' };
const LTAB_KEY = { rd: 'start', team: 'team', cap: 'cap', pr: 'pr', ops: 'model', ideo: 'cap' };
const RTAB_KEY = { board: 'model', chain: 'chain', team: 'team', safe: 'dirt', perks: 'perks', fin: 'product', log: 'team' };
const GAUGE_KEY = { hype: 'pr', rep: 'pr', morale: 'team', reg: 'policy', bubble: 'cap', dirt: 'dirt' };
const CHIP_KEY = { cash: 'start', val: 'cap', users: 'product', rank: 'model', equity: 'cap' };

export const isOpen = (S, key) => !S.tut?.on || !!S.tut.open[key];
export const actOpen = (S, id) => isOpen(S, ACT_KEY[id] || 'start');
export const ltabOpen = (S, id) => isOpen(S, LTAB_KEY[id]);
export const rtabOpen = (S, id) => isOpen(S, RTAB_KEY[id]);
export const gaugeOpen = (S, id) => isOpen(S, GAUGE_KEY[id]);
export const chipOpen = (S, id) => isOpen(S, CHIP_KEY[id]);
export const rightOpen = S => isOpen(S, 'team');

// 检查有没有新开放的系统；有就排进教学队列。返回是否有变化
export function advanceTutorial(S) {
  const T = S.tut;
  if (!T?.on) return false;
  let changed = false;
  for (const s of STEPS) if (!T.open[s.key] && s.when(S)) { T.open[s.key] = 1; T.queue.push(s.key); changed = true; }
  if (T.open.done && !T.queue.length) T.on = false;            // 教学结束：之后全部开放
  return changed;
}
export function currentTip(S) {
  const key = S.tut?.queue?.[0];
  if (!key) return null;
  const s = STEP[key], k = s.tip ? s.tip(S) : 'tut.' + key, bay = S.co?.region === 'bay';
  const vars = { 流血线: ACT.raise.p.流血线, 监管线: P['reg.high'] };            // 正文里提到的线，和规则读同一个数
  return { key, title: text(k + '.title', vars, bay), text: text(k + '.text', vars, bay), ...(s.hl ? { hl: s.hl } : {}), ...(s.go ? { go: s.go } : {}) };
}
export function dismissTip(S) { S.tut?.queue?.shift(); if (S.tut && S.tut.open.done && !S.tut.queue.length) S.tut.on = false; }

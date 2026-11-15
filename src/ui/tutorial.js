// 新手教学：系统逐个开放，每开放一样就由「学长老周」讲两句。
// 状态存在 S.tut = { on, open: { key: 1 }, queue: [key...], dirt0 }；S.tut 为空表示老手模式，全部开放。
import { runway } from '../game/engine.js';

// 按顺序检查；when 满足就开放。tip.hl 是要高亮的按钮（data-a 的值），tip.go 是顺手切过去的页签
export const STEPS = [
  { key: 'start', when: () => true, tip: { title: '先干一个月', text: '我是老周，创业三次、倒闭三次，所以特别懂。右上角那几个圆点是你这个月的「行动点」，做一件事花一个。先点左边的「亲自写代码」，再点右上角「下个月」。别的以后再说。', hl: 'act:code' } },
  { key: 'team', when: S => S.t >= 2, tip: { title: '你一个人干不完', text: '去「团队」招第一个人。点一下候选人的名字，能看到他具体能给公司带来什么——别光看头像招人，我第二次就是这么倒闭的。右边的面板现在能看到团队和日志了。', hl: 'ltab:team', go: { ltab: 'team', rtab: 'team' } } },
  { key: 'product', when: S => S.t >= 3, tip: { title: '产品与用户', text: '顶上多了「用户」。用户看产品体验吃饭：工程师每月自动打磨，你也可以在「研发」里开一个「功能冲刺」。右边「账本」能看清每个月钱是怎么没的。', hl: 'act:sprint', go: { ltab: 'rd', rtab: 'fin' } } },
  { key: 'pr', when: S => S.t >= 3, tip: { title: '酒香也怕巷子深', text: '「公关」开放了。热度拉新、抬估值，口碑管留存和付费——两个都会自己慢慢掉，得时不时添把柴。', hl: 'ltab:pr' } },
  { key: 'model', when: S => S.t >= 4, tip: S => (S.ownModel
    ? { title: '丹炉与榜单', text: '重头戏：去「经营」租显卡。显卡先保证用户能用（推理），剩下的才进丹炉攒「火候」；火候比现役模型高出一截，就能在「研发」里「出炉发布」去冲榜。右边「榜单」看你和六家对手的差距。', hl: 'ltab:ops', go: { ltab: 'ops', rtab: 'board' } }
    : { title: '上游与榜单', text: '你的产品跑在别人的模型上，「经营」里能看到每月的 API 账单。右边「榜单」是六家模型厂的排名——上游越强，你的产品天花板越高。融到 A 轮以后可以立项自研。', hl: 'ltab:ops', go: { ltab: 'ops', rtab: 'board' } }) },
  { key: 'cap', when: S => S.t >= 5 || runway(S) < 4, tip: { title: '钱要烧完了', text: '「资本」开放了。顶上的「业绩系数」到 0.9 以上再去融资，才有三份正经报价可挑；不到的话只有一份趁火打劫的。每融一轮你的股权都会变少，低到一定程度董事会就敢动你。', hl: 'ltab:cap', go: { ltab: 'cap' } } },
  { key: 'dirt', when: S => S.t >= 7 || S.exposed > 0 || S.dirt.length > (S.tut.dirt0 || 0), tip: { title: '捷径和保险柜', text: '标着 ☠ 的是捷径：刷量、水军、跑分注水……见效快，但每走一次，保险柜里就多一张「黑料」，每个月都可能被人翻出来。右边「黑料」页能看到你攒了多少。我第三次就是这么进去的——哦不，是倒闭的。', go: { rtab: 'safe' } } },
  { key: 'policy', when: S => S.t >= 9, tip: { title: '公司制度', text: '「经营」里现在能定工作制、定价和安全审核，各有各的代价。另外留意「监管」那一条：到 70 增长受限，到 100 会被重锤，「资本」里可以花钱疏通。', hl: 'ltab:ops', go: { ltab: 'ops' } } },
  { key: 'chain', when: S => S.projects.length > 0 || Object.keys(S.chains).length > 0, tip: { title: '事件链与特殊项目', text: '你开启了一条事件链。右边「项目」页会显示需要投入人手或显卡去推进的特殊项目，注意期限；也可以花行动点亲自攻关。', go: { rtab: 'chain' } } },
  { key: 'perks', when: S => S.perks.length > 0, tip: { title: '董事会卡', text: '你拿到了第一张董事会卡，在右边「卡牌」页。每轮融资、每年年初都能三选一，慢慢攒成自己的流派。', go: { rtab: 'perks' } } },
  { key: 'done', when: S => S.t >= 10 && S.tut.open.policy, tip: { title: '出师了', text: '能教的就这些。六年后见分晓：上市、卖身、炼出 AGI——或者至少别进去。对了，如果有同事喊你吃 Chepole，去吧。' } },
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
  const tip = STEP[key].tip;
  return { key, ...(typeof tip === 'function' ? tip(S) : tip) };
}
export function dismissTip(S) { S.tut?.queue?.shift(); if (S.tut && S.tut.open.done && !S.tut.queue.length) S.tut.on = false; }

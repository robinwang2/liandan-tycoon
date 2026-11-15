// 行动提示（参谋）：看一眼局面，列出「现在最该做的几件事」。纯逻辑，不碰界面；自动试玩也用它。
// 每条提示：{ id, lv, icon, title, text, act?, later?, go?, hl? }
//   lv    bad 要紧（红）/ gold 机会或闲置（金）/ warn 留意（蓝）
//   act   点一下就执行的行动（actions.js 里的 id）；later = 这个月行动点不够，下个月才能做
//   go    要切过去的页签 { ltab, rtab }；hl = 要闪一下的按钮（data-a 的值）
import * as G from './engine.js';
import { ACT } from './actions.js';
import { FEATURES, FEAT, OFFICES, officeName, STAGES, ROLES, STAFF_QUIRKS, DIRT, KIND_NAME } from '../data/defs.js';

const num = x => Math.round(x);
// 这个行动除了行动点以外还能不能做：null = 做不了；{ later } = 只差行动点
function avail(S, id) {
  const a = ACT[id];
  if (!a || (a.show && !a.show(S))) return null;
  if (S.cd[id] || (a.cost ? a.cost(S) : 0) > S.cash || a.block?.(S)) return null;
  return { later: S.ap < a.ap };
}
// 给提示挂上第一个能做的行动；一个都做不了就原样返回
function withAct(h, S, ...ids) {
  for (const id of ids) { const r = avail(S, id); if (r) return { ...h, act: id, later: r.later }; }
  return h;
}
const onlyIfAct = h => (h.act ? h : null);
const worstCrime = S => S.dirt.filter(d => DIRT[d.type]?.crime).sort((a, b) => b.sev - a.sev)[0];
const netOf = S => G.revenue(S).total - G.costs(S).total;

const RULES = [
  // ── 要紧 ──
  function cash(S) {
    const net = netOf(S), rw = G.runway(S);
    if (net >= 0 || rw >= 4) return null;
    const pf = G.perf(S), raise = avail(S, 'raise'), tips = [];
    // 和 raiseDialog 的门槛一致：≥0.9 三份报价；0.75~0.9 只有一份流血报价；<0.75 投资人只会说「保持联系」
    if (raise) tips.push(pf >= 0.9 ? `业绩系数 ${pf.toFixed(2)}，现在融资能拿到三份报价。` : pf >= 0.75 ? `业绩系数 ${pf.toFixed(2)}，不到 0.9，融资只有一份「趁火打劫」的报价。` : `业绩系数才 ${pf.toFixed(2)}，不到 0.75，现在去融资只会听到「保持联系」。`);
    if (S.policies.price === 'free') tips.push('定价还是「免费冲量」，订阅收入只有三成。');
    const free = S.ownModel ? Math.max(0, S.gpu - G.inferNeed(S)) : 0;
    if (free >= 4) tips.push(`丹炉占着 ${free} 张卡（每月约 ${G.money(S, free * G.gpuPrice(S))}），少租几张能多撑一阵。`);
    const quick = ['sellcourse', 'subsidy'].filter(id => avail(S, id));
    if ((!raise || pf < 0.9) && quick.length) tips.push(`${quick.map(id => `「${ACT[id].name}」`).join('、')}能先回点血。`);
    const h = { id: 'cash', lv: 'bad', icon: 'cash', title: rw < 1 ? '下个月发不出工资' : `钱只够撑 ${Math.floor(rw)} 个月`, text: `每月净流出 ${G.money(S, -net)}。${tips.join('')}`, go: { ltab: 'cap' } };
    return pf >= 0.9 ? withAct(h, S, 'raise', 'sellcourse', 'subsidy') : pf >= 0.75 ? withAct(h, S, 'sellcourse', 'subsidy', 'raise') : withAct(h, S, 'sellcourse', 'subsidy');
  },
  function outage(S) {
    const need = G.inferNeed(S);
    if (!need || S.gpu >= need) return null;
    const q = G.quota(S), gap = num((1 - S.gpu / need) * 100);
    if (q >= need) return { id: 'outage', lv: 'bad', icon: 'gpu', title: '显卡不够推理', text: `用户要 ${need} 张卡做推理，你只租了 ${S.gpu} 张，${gap}% 的请求在报「服务器繁忙」，口碑和用户都在流失。去「经营」把显卡加上。`, go: { ltab: 'ops' }, hl: 'gpu:+' };
    return withAct({ id: 'outage', lv: 'bad', icon: 'gpu', title: '显卡配额不够', text: `推理要 ${need} 张卡，配额只有 ${q} 张，${gap}% 的请求在报「服务器繁忙」。${S.gpu < q ? '先把配额租满，再' : ''}找皮衣教主要配额，或者高价扫货。`, go: { ltab: 'ops' }, hl: S.gpu < q ? 'gpu:max' : null }, S, 'beg', 'sweep');
  },
  function crime(S) {
    const d = S.exposedCrime >= 25 && worstCrime(S);
    if (!d) return null;
    return withAct({ id: 'crime', lv: 'bad', icon: 'shield', title: '经侦在盯着你', text: `涉嫌违法的黑料已经曝光了 ${num(S.exposedCrime)}（到 40 经侦上门），保险柜里还躺着「${d.name}」。趁它还没爆，花钱洗掉。`, go: { rtab: 'safe' } }, S, 'wash');
  },
  function projects(S) {
    return S.projects.map(p => {
      const left = p.need - p.done, n = p.due - S.t, rate = G.projectRate(S, p);
      if (left <= 0 || rate * n >= left) return null;
      const stalled = p.kind !== 'ap' && rate < 0.01;
      if (!stalled && n > 3) return null;
      const reach = Math.min(99, num((p.done + rate * n) / p.need * 100));
      const how = p.kind === 'ap' ? '这个项目只能靠你亲自花行动点攻关。' : stalled ? `现在没有${KIND_NAME[p.kind]}在推进它，加派人手或者亲自攻关。` : `可以加派${KIND_NAME[p.kind]}，或者花行动点亲自攻关。`;
      return { id: `proj-${p.uid}`, lv: n <= 2 ? 'bad' : 'warn', icon: 'pin', title: stalled ? '特殊项目停滞了' : '项目要超期了', text: `「${p.name}」还剩 ${n} 个月到期，照现在的速度只能做完 ${reach}%。${how}`, go: { rtab: 'chain' }, hl: `push:${p.uid}`, later: S.ap < 1 };
    });
  },
  function vam(S) {
    if (!S.vam) return null;
    const n = S.vam.due - S.t, cur = S.users + S.fake;
    if (n > 4 || cur >= S.vam.target) return null;
    return withAct({ id: 'vam', lv: 'bad', icon: 'handshake', title: '对赌快到期了', text: `${G.dateStr(S.vam.due)}前用户要到 ${G.fmtUsers(S.vam.target)}，现在只有 ${G.fmtUsers(cur)}。投放买量、炒作造势都能拉人——刷量也算数，就是会留下黑料。`, go: { ltab: 'pr' } }, S, 'ads', 'hype');
  },
  function morale(S) {
    if (S.morale >= 35 || S.staff.length < 2) return null;
    const board = S.stage >= 2 && S.equity < 45 && !S.cd.coup, x996 = String(S.policies.work) === '996';
    const text = `士气 ${num(S.morale)}，团队产出在打折${S.morale < 25 ? '，每个月都可能有人提离职' : '，低于 25 就会有人跑路'}。${x996 ? '「996」每个月还在磨士气。' : ''}${board ? `你只剩 ${num(S.equity)}% 的股权，士气再低，董事会也要动你了。` : ''}`;
    return withAct({ id: 'morale', lv: S.morale < 25 || (board && S.morale < 28) ? 'bad' : 'warn', icon: 'smile', title: S.morale < 25 ? '有人要跑路了' : '士气低落', text, go: { ltab: 'team' } }, S, 'teambuild', 'pie');
  },
  function coup(S) {
    if (S.stage < 2 || S.equity >= 45 || S.cd.coup || S.rep >= 34) return null;
    return withAct({ id: 'coup', lv: S.rep < 30 ? 'bad' : 'warn', icon: 'pie', title: '董事会在嘀咕', text: `你只剩 ${num(S.equity)}% 的股权，口碑又跌到 ${num(S.rep)}，董事会随时可能换掉你。先把口碑拉回来。`, go: { ltab: 'pr' } }, S, 'goodpr');
  },
  // ── 机会与闲置 ──
  function sprint(S) {
    const r = !S.sprint && avail(S, 'sprint');
    if (!r) return null;
    const left = FEATURES.filter(f => !S.feats.includes(f.id)).length, just = S.featDone?.t === S.t - 1 ? FEAT[S.featDone.id] : null;
    return { id: 'sprint', lv: 'gold', icon: 'puzzle', title: just ? '功能上线了，开下一个' : '研发组闲着', text: `${just ? `「${just.name}」已经上线。` : '现在没有在开发的功能。'}工程师闲着也是闲着——开一个功能冲刺，从三份需求里挑一个（还有 ${left} 个功能没做）。`, act: 'sprint', later: r.later };
  },
  function release(S) {
    const r = avail(S, 'release');
    if (!r) return null;
    const cap = G.myCap(S), cur = S.model?.cap, top = Math.max(...S.rivals.map(x => x.bench));
    return { id: 'release', lv: 'gold', icon: 'rocket', title: '丹炉可以出炉了', text: `火候 ${cap.toFixed(1)}，${cur != null ? `比现役模型的 ${cur.toFixed(1)} 高出 ${(cap - cur).toFixed(1)}` : '还没有发布过模型'}。榜首跑分 ${top.toFixed(1)}，发布新模型能冲一波榜单和热度。`, act: 'release', later: r.later };
  },
  function ipo(S) {
    const r = avail(S, 'ipo');
    if (!r) return null;
    const d = worstCrime(S);
    if (d) return withAct({ id: 'ipo', lv: 'gold', icon: 'bell', title: '上市前先洗白', text: `上市条件齐了，但保险柜里还有涉嫌违法的「${d.name}」。审计师翻出来就会被否，材料还会被移交有关部门。先洗白，再去敲钟。`, go: { rtab: 'safe' } }, S, 'wash');
    return { id: 'ipo', lv: 'gold', icon: 'bell', title: '可以申请上市了', text: `D 轮融完、连续盈利 ${S.streak.profit} 个月、业绩系数 ${G.perf(S).toFixed(2)}，上市条件齐了。审计师会把保险柜翻个底朝天${S.dirt.length ? `，里面还有 ${S.dirt.length} 张黑料` : ''}。`, act: 'ipo', later: r.later };
  },
  // 融资不是越多越好：每轮都稀释股权。只在「钱快不够了」或者「业绩达标、离上一轮够久、股权还宽裕」时提醒
  function raise(S) {
    const r = S.stage < 5 && avail(S, 'raise'), pf = G.perf(S), rw = G.runway(S);
    if (!r || pf < 0.9 || rw < 4) return null;                                         // 缺钱的时候由 cash 那条提醒
    const short = rw < 12, ripe = pf >= 1 && S.t - S.lastRaiseT >= 10 && S.equity >= 40;
    if (!short && !ripe) return null;
    const name = STAGES[S.stage + 1].name, eq = num(S.equity);
    const why = short ? `账上的钱还能撑 ${Math.floor(rw)} 个月，趁业绩系数 ${pf.toFixed(2)} 还过得去，把下一轮融了。` : `业绩系数 ${pf.toFixed(2)}，已经达标，现在估值最好看。`;
    return { id: 'raise', lv: 'gold', icon: 'handshake', title: `能融${/^[A-Z]/.test(name) ? ' ' : ''}${name}了`, text: `${why}路演能拿到三份报价，估值基准约 ${G.money(S, G.valuation(S))}。每轮要让出 12%–25% 的股权（你现在 ${eq}%${eq < 55 ? '，低于 45% 董事会就敢动你' : ''}）。${S.raiseBoost < 0.15 && avail(S, 'roadshow') ? '想把估值再抬一点，可以先做几次「路演预热」。' : ''}`, act: 'raise', later: r.later };
  },
  function office(S) {
    const cap = G.teamCap(S);
    if (S.staff.length < cap) return null;
    const r = avail(S, 'office');
    if (!r || G.runway(S) < 6 || S.cash < 2 * ACT.office.cost(S)) return null;
    const nx = S.co.office + 1, O = OFFICES[nx], extra = cap - OFFICES[S.co.office].cap;
    return { id: 'office', lv: 'gold', icon: 'building', title: '工位坐满了', text: `团队 ${S.staff.length}/${cap} 人，再招人得先换地方：搬进「${officeName(S, nx)}」能坐 ${O.cap + extra} 人，月租 ${G.money(S, O.rent * G.mod(S, 'rentMult'))}。`, act: 'office', later: r.later };
  },
  function hire(S) {
    const cap = G.teamCap(S), n = S.staff.length;
    if (n >= cap || !S.cands.length || (netOf(S) < 0 && G.runway(S) < 8)) return null;
    const has = role => S.staff.some(e => e.role === role), best = list => list.slice().sort((a, b) => b.skill - a.skill)[0];
    const need = S.ownModel && !has('res') ? 'res' : !has('eng') ? 'eng' : null;
    const forNeed = need && best(S.cands.filter(c => c.role === need));
    const star = best(S.cands.filter(c => c.quirk === 'genius' || (c.skill >= 8 && c.quirk !== 'guanxi' && c.quirk !== 'moyu')));
    const c = forNeed || star || (n < 3 ? best(S.cands) : null);
    if (!c || S.cash < 3 * c.salary * G.mod(S, 'salaryMult')) return null;
    const why = forNeed ? (need === 'res' ? '丹炉要靠研究员才炼得快。' : '产品体验和功能开发都靠工程师。') : '';
    return { id: 'hire', lv: 'gold', icon: 'search_user', title: forNeed ? `还缺${ROLES[need].name}` : star ? '有个难得的人才' : '还有空工位', text: `团队 ${n}/${cap} 人。${why}候选人里有 ${c.name}（${ROLES[c.role].name}，能力 ${c.skill}${c.quirk ? `，${STAFF_QUIRKS[c.quirk].name}` : ''}），点名字能看到具体能带来什么。`, go: { ltab: 'team' }, hl: `who:${c.uid}`, later: S.ap < 1 };
  },
  function furnace(S) {
    if (!S.ownModel || !S.furnace?.on) return null;
    const need = G.inferNeed(S), q = G.quota(S), rw = G.runway(S);
    if (need > S.gpu || S.gpu >= q) return null;                                // 不够推理由 outage 那条提醒；配额用满了就没什么可说的
    if (S.gpu === need && rw >= 6) return { id: 'furnace', lv: 'gold', icon: 'furnace', title: '丹炉是凉的', text: S.gpu ? `显卡全用在推理上了，丹炉没在炼，火候不会涨。去「经营」多租几张卡（配额还空着 ${q - S.gpu} 张）。` : `一张显卡都没租，丹炉没在炼，火候不会涨。去「经营」租几张卡（配额 ${q} 张）。`, go: { ltab: 'ops' }, hl: 'gpu:+' };
    if (S.gpu < q * 0.5 && rw >= 18 && S.cash >= (q - S.gpu) * G.gpuPrice(S) * 6) return { id: 'furnace', lv: 'gold', icon: 'furnace', title: '显卡还能多租', text: `配额 ${q} 张只租了 ${S.gpu} 张，账上的钱撑得住。多租点卡，火候涨得更快，下次发布更有底气。`, go: { ltab: 'ops' }, hl: 'gpu:+' };
    return null;
  },
  function selfdev(S) {
    const r = avail(S, 'selfdev');
    if (!r || G.runway(S) < 10 || S.cash < 3 * ACT.selfdev.cost(S)) return null;
    return { id: 'selfdev', lv: 'gold', icon: 'target', title: '可以自研模型了', text: `已经融到 ${STAGES[S.stage].name}，可以组建炼丹团队，摆脱上游 ${G.rivalOf(S, S.upstream)?.name || ''}。之后要自己租显卡、招研究员，每月成本会涨一截，但产品的天花板不再受制于人。`, act: 'selfdev', later: r.later };
  },
  // ── 留意 ──
  function reg(S) {
    if (S.reg < 70) return null;
    return withAct({ id: 'reg', lv: S.reg >= 88 ? 'bad' : 'warn', icon: 'bank', title: S.reg >= 88 ? '监管要动手了' : '监管压力大', text: `监管压力 ${num(S.reg)}：增长受限、合规成本上升，到 100 会吃一记重锤。${S.policies.safety === 'loose' ? '安全审核还是「放飞自我」，压力每月都在猛涨。' : ''}`, go: { ltab: 'cap' } }, S, 'lobby', 'goodpr');
  },
  function x996(S) {
    if (String(S.policies.work) !== '996' || S.streak.x996 % 8 !== 7) return null;
    return { id: 'x996', lv: 'warn', icon: 'clock', title: '996 要出事了', text: `已经连续 996 ${S.streak.x996} 个月。再熬一个月，保险柜里就会多一张「${DIRT.overwork.name}」。`, go: { ltab: 'ops' }, hl: 'pol:work:965' };
  },
  function dirt(S) {
    if (!S.dirt.length || (S.exposedCrime >= 25 && worstCrime(S))) return null;           // 经侦那条更急
    const risk = 1 - S.dirt.filter(d => d.t <= S.t - 1).reduce((k, d) => k * (1 - G.exposeP(S, d)), 1);   // 月底至少爆一张的概率
    if (risk < 0.08) return null;
    const d = S.dirt.slice().sort((a, b) => b.sev - a.sev)[0];
    return withAct({ id: 'dirt', lv: risk >= 0.2 ? 'bad' : 'warn', icon: 'safe', title: '黑料随时会爆', text: `保险柜里 ${S.dirt.length} 张黑料，按现在的热度和用户量，每个月约有 ${num(risk * 100)}% 的概率被扒出一张。最重的是「${d.name}」（严重度 ${num(d.sev)}）。洗掉它，或者招个法务公关压一压。`, go: { rtab: 'safe' } }, S, 'wash');
  },
  S => (S.hype < 10 && S.t > 6 ? onlyIfAct(withAct({ id: 'hype', lv: 'warn', icon: 'flame', title: '没人记得你了', text: `热度只剩 ${num(S.hype)}，拉新和估值都在往下掉。` }, S, 'hype')) : null),
  S => (S.rep < 30 ? onlyIfAct(withAct({ id: 'rep', lv: 'warn', icon: 'star', title: '口碑太差', text: `口碑 ${num(S.rep)}：用户留存和付费都在变差。做公益、发白皮书能补一点，☠ 捷径就先别走了。` }, S, 'goodpr')) : null),
];

const ORDER = { bad: 0, gold: 1, warn: 2 };
// 现在该提醒的事：急事在前，同一级里能马上做的在前
export function advise(S) {
  if (!S || S.over) return [];
  const mute = S.hintMute || {}, out = [];
  for (const rule of RULES) for (const h of [].concat(rule(S) || [])) if (h && !(mute[h.id] > S.t)) out.push(h);
  return out.sort((a, b) => ORDER[a.lv] - ORDER[b.lv] || (a.later ? 1 : 0) - (b.later ? 1 : 0));
}
// 「先别提醒」：急事只静音到下个月，其他的静音 3 个月
export function muteHint(S, h) {
  const m = (S.hintMute ??= {});
  for (const k in m) if (m[k] <= S.t) delete m[k];
  m[h.id] = S.t + (h.lv === 'bad' ? 1 : 3);
}
export const muteMonths = h => (h.lv === 'bad' ? 1 : 3);

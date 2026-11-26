// 行动提示（参谋）：看一眼局面，列出「现在最该做的几件事」。纯逻辑，不碰界面；自动试玩也用它。
// 每条提示：{ id, lv, icon, title, text, act?, later?, go?, hl? }
//   lv    bad 要紧（红）/ gold 机会或闲置（金）/ warn 留意（蓝）
//   act   点一下就执行的行动（actions.js 里的 id）；later = 这个月行动点不够，下个月才能做
//   go    要切过去的页签 { ltab, rtab }；hl = 要闪一下的按钮（data-a 的值）
// 文字（连同图标）在 文本.xlsx「参谋」里，参谋自己的门槛在 平衡参数.xlsx 里（advice. 开头）；
// 和引擎规则对应的线（离职线、逼宫线、经侦线……）直接读引擎的参数，两边不会对不上。
import * as G from './engine.js';
import { ACT } from './actions.js';
import { IDEO_LEN, hasHeat } from './ideology.js';
import { FEATURES, FEAT, OFFICES, officeName, STAGES, ROLES, STAFF_QUIRKS, DIRT, KIND_NAME, P } from '../data/defs.js';
import { RAISE_OFFERS } from '../data/actions.js';
import { text } from '../data/text.js';

const num = x => Math.round(x);
const T = (S, key, vars) => text(key, vars, S.co.region === 'bay');
const LAST_ROUND = STAGES.length - 2;                                   // 最后一轮融资（再往后就是上市）
const SHARE = [Math.min, Math.max].map(f => Math.round(f(...RAISE_OFFERS.map(o => o.share)) * 100));   // 每轮让出的股权：最少、最多（%）
const acts = (S, ids) => ids.map(id => T(S, 'advice.act', { 行动: ACT[id].name })).join(T(S, 'advice.sep'));
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
    if (net >= 0 || rw >= P['advice.cash.runway']) return null;
    const pf = G.perf(S), raise = avail(S, 'raise'), tips = [], R = ACT.raise.p, pfs = pf.toFixed(2);
    // 和融资窗口的门槛一致（行动.xlsx「启动融资」的参数）：≥流血线 三份报价；失败线~流血线 只有一份流血报价；<失败线 投资人只会说「保持联系」
    if (raise) tips.push(pf >= R.流血线 ? T(S, 'advice.cash.raise3', { 业绩: pfs }) : pf >= R.失败线 ? T(S, 'advice.cash.raise1', { 业绩: pfs, 流血线: R.流血线 }) : T(S, 'advice.cash.raise0', { 业绩: pfs, 失败线: R.失败线 }));
    if (S.policies.price === 'free') tips.push(T(S, 'advice.cash.free'));
    const free = S.ownModel ? Math.max(0, S.gpu - G.inferNeed(S)) : 0;
    if (free >= P['advice.cash.freeGpu']) tips.push(T(S, 'advice.cash.furnace', { 张数: free, 月租: G.money(S, G.gpuRent(S) - G.gpuRent(S, S.gpu - free)) }));
    const quick = ['sellcourse', 'subsidy'].filter(id => avail(S, id));
    if ((!raise || pf < R.流血线) && quick.length) tips.push(T(S, 'advice.cash.quick', { 行动: acts(S, quick) }));
    const h = { id: 'cash', lv: 'bad', icon: T(S, 'advice.cash.icon'), title: rw < 1 ? T(S, 'advice.cash.title.broke') : T(S, 'advice.cash.title', { 月数: Math.floor(rw) }), text: T(S, 'advice.cash.text', { 净流出: G.money(S, -net), 建议: tips.join('') }), go: { ltab: 'cap' } };
    return pf >= R.流血线 ? withAct(h, S, 'raise', 'sellcourse', 'subsidy') : pf >= R.失败线 ? withAct(h, S, 'sellcourse', 'subsidy', 'raise') : withAct(h, S, 'sellcourse', 'subsidy');
  },
  function outage(S) {
    const need = G.inferNeed(S);
    if (!need || S.gpu >= need) return null;
    const q = G.quota(S), gap = num((1 - S.gpu / need) * 100);
    const how = need <= q ? T(S, 'advice.outage.add') : T(S, 'advice.outage.quota', { 配额: q, 倍数: P['gpu.over0'] });
    return { id: 'outage', lv: 'bad', icon: T(S, 'advice.outage.icon'), title: T(S, 'advice.outage.title'), text: T(S, 'advice.outage.text', { 需要: need, 租了: S.gpu, 缺口: gap, 办法: how }), go: { ltab: 'ops' }, hl: 'gpu:+' };
  },
  function crime(S) {
    const d = S.exposedCrime >= P['advice.crime.from'] && worstCrime(S);
    if (!d) return null;
    return withAct({ id: 'crime', lv: 'bad', icon: T(S, 'advice.crime.icon'), title: T(S, 'advice.crime.title'), text: T(S, 'advice.crime.text', { 曝光: num(S.exposedCrime), 经侦线: P['scandal.probeLine'], 黑料: d.name }), go: { rtab: 'safe' } }, S, 'wash');
  },
  function projects(S) {
    return S.projects.map(p => {
      const left = p.need - p.done, n = p.due - S.t, rate = G.projectRate(S, p);
      if (left <= 0 || rate * n >= left) return null;
      const stalled = p.kind !== 'ap' && rate < 0.01;
      if (!stalled && n > P['advice.proj.months']) return null;
      const reach = Math.min(99, num((p.done + rate * n) / p.need * 100));
      const how = p.kind === 'ap' ? T(S, 'advice.proj.ap') : T(S, stalled ? 'advice.proj.stalled' : 'advice.proj.slow', { 人手: KIND_NAME[p.kind] });
      return { id: `proj-${p.uid}`, lv: n <= P['advice.proj.urgent'] ? 'bad' : 'warn', icon: T(S, 'advice.proj.icon'), title: T(S, stalled ? 'advice.proj.title.stalled' : 'advice.proj.title.late'), text: T(S, 'advice.proj.text', { 项目: p.name, 月数: n, 完成: reach, 办法: how }), go: { rtab: 'chain' }, hl: `push:${p.uid}`, later: S.ap < 1 };
    });
  },
  function vam(S) {
    if (!S.vam) return null;
    const n = S.vam.due - S.t, cur = S.users + S.fake;
    if (n > P['advice.vam.months'] || cur >= S.vam.target) return null;
    return withAct({ id: 'vam', lv: 'bad', icon: T(S, 'advice.vam.icon'), title: T(S, 'advice.vam.title'), text: T(S, 'advice.vam.text', { 日期: G.dateStr(S.vam.due), 目标: G.fmtUsers(S.vam.target), 现在: G.fmtUsers(cur) }), go: { ltab: 'pr' } }, S, 'ads', 'hype');
  },
  function morale(S) {
    if (S.morale >= P['advice.morale.line'] || S.staff.length < P['advice.morale.staff']) return null;
    const board = S.stage >= P['coup.stage'] && S.equity < P['coup.equity'] && !S.cd.coup, x996 = String(S.policies.work) === '996', quit = S.morale < P['morale.quitLine'];
    const body = T(S, 'advice.morale.text', {
      士气: num(S.morale), 离职: quit ? T(S, 'advice.morale.quitting') : T(S, 'advice.morale.quitLine', { 离职线: P['morale.quitLine'] }),
      加班: x996 ? T(S, 'advice.morale.x996') : '', 董事会: board ? T(S, 'advice.morale.board', { 股权: num(S.equity) }) : '',
    });
    return withAct({ id: 'morale', lv: quit || (board && S.morale < P['coup.morale']) ? 'bad' : 'warn', icon: T(S, 'advice.morale.icon'), title: T(S, quit ? 'advice.morale.title.quit' : 'advice.morale.title'), text: body, go: { ltab: 'team' } }, S, 'teambuild', 'pie');
  },
  function coup(S) {
    if (S.stage < P['coup.stage'] || S.equity >= P['coup.equity'] || S.cd.coup || S.rep >= P['advice.coup.rep']) return null;
    return withAct({ id: 'coup', lv: S.rep < P['coup.rep'] ? 'bad' : 'warn', icon: T(S, 'advice.coup.icon'), title: T(S, 'advice.coup.title'), text: T(S, 'advice.coup.text', { 股权: num(S.equity), 口碑: num(S.rep) }), go: { ltab: 'pr' } }, S, 'goodpr');
  },
  // ── 机会与闲置 ──
  function sprint(S) {
    const r = !S.sprint && avail(S, 'sprint');
    if (!r) return null;
    const left = FEATURES.filter(f => !S.feats.includes(f.id)).length, just = S.featDone?.t === S.t - 1 ? FEAT[S.featDone.id] : null;
    return { id: 'sprint', lv: 'gold', icon: T(S, 'advice.sprint.icon'), title: T(S, just ? 'advice.sprint.title.done' : 'advice.sprint.title'), text: T(S, 'advice.sprint.text', { 开头: just ? T(S, 'advice.sprint.done', { 功能: just.name }) : T(S, 'advice.sprint.none'), 剩下: left }), act: 'sprint', later: r.later };
  },
  function release(S) {
    const r = avail(S, 'release');
    if (!r) return null;
    const cap = G.myCap(S), cur = S.model?.cap, top = Math.max(...S.rivals.map(x => x.bench));
    const vs = cur != null ? T(S, 'advice.release.vs', { 现役: cur.toFixed(1), 高出: (cap - cur).toFixed(1) }) : T(S, 'advice.release.first');
    return { id: 'release', lv: 'gold', icon: T(S, 'advice.release.icon'), title: T(S, 'advice.release.title'), text: T(S, 'advice.release.text', { 火候: cap.toFixed(1), 对比: vs, 榜首: top.toFixed(1) }), act: 'release', later: r.later };
  },
  function ipo(S) {
    const r = avail(S, 'ipo');
    if (!r) return null;
    const d = worstCrime(S);
    if (d) return withAct({ id: 'ipo', lv: 'gold', icon: T(S, 'advice.ipo.icon'), title: T(S, 'advice.ipo.title.wash'), text: T(S, 'advice.ipo.text.wash', { 黑料: d.name }), go: { rtab: 'safe' } }, S, 'wash');
    return { id: 'ipo', lv: 'gold', icon: T(S, 'advice.ipo.icon'), title: T(S, 'advice.ipo.title'), text: T(S, 'advice.ipo.text', { 轮次: STAGES[LAST_ROUND].name, 月数: S.streak.profit, 业绩: G.perf(S).toFixed(2), 黑料: S.dirt.length ? T(S, 'advice.ipo.dirt', { 张数: S.dirt.length }) : '' }), act: 'ipo', later: r.later };
  },
  // 融资不是越多越好：每轮都稀释股权。只在「钱快不够了」或者「业绩达标、离上一轮够久、股权还宽裕」时提醒
  function raise(S) {
    const r = S.stage < LAST_ROUND && avail(S, 'raise'), pf = G.perf(S), rw = G.runway(S);
    if (!r || pf < P['advice.raise.perf'] || rw < P['advice.cash.runway']) return null;                  // 缺钱的时候由 cash 那条提醒
    const short = rw < P['advice.raise.short'], ripe = pf >= P['advice.raise.ripePerf'] && S.t - S.lastRaiseT >= P['advice.raise.gap'] && S.equity >= P['advice.raise.equity'];
    if (!short && !ripe) return null;
    const chain = S.ideo?.on, after = S.equity * P['advice.raise.dilute'];                              // 路线之争终局要握住四成股权
    if (chain && after < P['ideo.equity'] && !short) return null;                                       // 钱又不急，就别劝他融这一轮
    const name = STAGES[S.stage + 1].name, eq = num(S.equity), pfs = pf.toFixed(2);
    const why = short ? T(S, 'advice.raise.why.short', { 月数: Math.floor(rw), 业绩: pfs }) : T(S, 'advice.raise.why.ripe', { 业绩: pfs });
    const body = T(S, 'advice.raise.text', {
      理由: why, 估值: G.money(S, G.valuation(S)), 最少: SHARE[0], 最多: SHARE[1], 股权: eq,
      董事会: eq < P['advice.raise.boardWarn'] ? T(S, 'advice.raise.board', { 逼宫线: P['coup.equity'] }) : '',
      路线之争: chain ? T(S, 'advice.raise.ideo', { 剩下: num(after) }) : '',
      预热: S.raiseBoost < P['advice.raise.boost'] && avail(S, 'roadshow') ? T(S, 'advice.raise.roadshow') : '',
    });
    return { id: 'raise', lv: 'gold', icon: T(S, 'advice.raise.icon'), title: T(S, 'advice.raise.title', { 轮次: (/^[A-Z]/.test(name) ? ' ' : '') + name }), text: body, act: 'raise', later: r.later };
  },
  function office(S) {
    const cap = G.teamCap(S);
    if (S.staff.length < cap) return null;
    const r = avail(S, 'office');
    if (!r || G.runway(S) < P['advice.office.runway'] || S.cash < P['advice.office.cash'] * ACT.office.cost(S)) return null;
    const nx = S.co.office + 1, O = OFFICES[nx], extra = cap - OFFICES[S.co.office].cap;
    return { id: 'office', lv: 'gold', icon: T(S, 'advice.office.icon'), title: T(S, 'advice.office.title'), text: T(S, 'advice.office.text', { 人数: S.staff.length, 上限: cap, 办公室: officeName(S, nx), 新上限: O.cap + extra, 月租: G.money(S, O.rent * G.mod(S, 'rentMult')) }), act: 'office', later: r.later };
  },
  function hire(S) {
    const cap = G.teamCap(S), n = S.staff.length;
    if (n >= cap || !S.cands.length || (netOf(S) < 0 && G.runway(S) < P['advice.hire.runway'])) return null;
    const has = role => S.staff.some(e => e.role === role), best = list => list.slice().sort((a, b) => b.skill - a.skill)[0];
    const need = S.ownModel && !has('res') ? 'res' : !has('eng') ? 'eng' : null;
    const forNeed = need && best(S.cands.filter(c => c.role === need));
    const star = best(S.cands.filter(c => c.quirk === 'genius' || (c.skill >= P['advice.hire.star'] && c.quirk !== 'guanxi' && c.quirk !== 'moyu')));
    const c = forNeed || star || (n < P['advice.hire.small'] ? best(S.cands) : null);
    if (!c || S.cash < P['advice.hire.cash'] * c.salary * G.mod(S, 'salaryMult')) return null;
    const why = forNeed ? T(S, need === 'res' ? 'advice.hire.why.res' : 'advice.hire.why.eng') : '';
    const title = forNeed ? T(S, 'advice.hire.title.need', { 岗位: ROLES[need].name }) : star ? T(S, 'advice.hire.title.star') : T(S, 'advice.hire.title');
    const body = T(S, 'advice.hire.text', { 人数: n, 上限: cap, 理由: why, 名字: c.name, 岗位: ROLES[c.role].name, 能力: c.skill, 怪癖: c.quirk ? T(S, 'advice.hire.quirk', { 怪癖: STAFF_QUIRKS[c.quirk].name }) : '' });
    return { id: 'hire', lv: 'gold', icon: T(S, 'advice.hire.icon'), title, text: body, go: { ltab: 'team' }, hl: `who:${c.uid}`, later: S.ap < 1 };
  },
  function furnace(S) {
    if (!S.ownModel || !S.furnace?.on) return null;
    const need = G.inferNeed(S), q = G.quota(S), rw = G.runway(S), icon = T(S, 'advice.furnace.icon');
    if (need > S.gpu || S.gpu >= q) return null;                                // 不够推理由 outage 那条提醒；配额用满了就没什么可说的
    if (S.gpu === need && rw >= P['advice.furnace.runway']) return { id: 'furnace', lv: 'gold', icon, title: T(S, 'advice.furnace.title.cold'), text: S.gpu ? T(S, 'advice.furnace.text.cold', { 空着: q - S.gpu }) : T(S, 'advice.furnace.text.none', { 配额: q }), go: { ltab: 'ops' }, hl: 'gpu:+' };
    if (S.gpu < q * P['advice.furnace.half'] && rw >= P['advice.furnace.rich'] && S.cash >= (q - S.gpu) * G.gpuPrice(S) * P['advice.furnace.months']) return { id: 'furnace', lv: 'gold', icon, title: T(S, 'advice.furnace.title.more'), text: T(S, 'advice.furnace.text.more', { 配额: q, 租了: S.gpu }), go: { ltab: 'ops' }, hl: 'gpu:+' };
    return null;
  },
  function selfdev(S) {
    const r = avail(S, 'selfdev');
    if (!r || G.runway(S) < P['advice.selfdev.runway'] || S.cash < P['advice.selfdev.cash'] * ACT.selfdev.cost(S)) return null;
    return { id: 'selfdev', lv: 'gold', icon: T(S, 'advice.selfdev.icon'), title: T(S, 'advice.selfdev.title'), text: T(S, 'advice.selfdev.text', { 轮次: STAGES[S.stage].name, 上游: G.rivalName(G.rivalOf(S, S.upstream)) }), act: 'selfdev', later: r.later };
  },
  // ── 留意 ──
  function premium(S) {                                                         // 超出配额的卡在按现货价烧钱：提醒去要配额
    const over = S.gpu - G.quota(S);
    if (over <= 0) return null;
    const extra = G.gpuRent(S) - S.gpu * G.gpuPrice(S);
    return onlyIfAct(withAct({ id: 'premium', lv: 'warn', icon: T(S, 'advice.premium.icon'), title: T(S, 'advice.premium.title'), text: T(S, 'advice.premium.text', { 张数: over, 多花: G.money(S, extra) }), go: { ltab: 'ops' } }, S, 'beg'));
  },
  function reg(S) {
    if (S.reg < P['reg.high']) return null;
    const bad = S.reg >= P['advice.reg.bad'];
    return withAct({ id: 'reg', lv: bad ? 'bad' : 'warn', icon: T(S, 'advice.reg.icon'), title: T(S, bad ? 'advice.reg.title.bad' : 'advice.reg.title'), text: T(S, 'advice.reg.text', { 压力: num(S.reg), 审核: S.policies.safety === 'loose' ? T(S, 'advice.reg.loose') : '' }), go: { ltab: 'cap' } }, S, 'lobby', 'goodpr');
  },
  function x996(S) {
    if (String(S.policies.work) !== '996' || S.streak.x996 % P['work.dirtMonths'] !== P['work.dirtMonths'] - 1) return null;     // 再熬一个月就留黑料
    return { id: 'x996', lv: 'warn', icon: T(S, 'advice.x996.icon'), title: T(S, 'advice.x996.title'), text: T(S, 'advice.x996.text', { 月数: S.streak.x996, 黑料: DIRT.overwork.name }), go: { ltab: 'ops' }, hl: 'pol:work:965' };
  },
  function dirt(S) {
    if (!S.dirt.length || (S.exposedCrime >= P['advice.crime.from'] && worstCrime(S))) return null;   // 经侦那条更急
    const risk = G.leakRisk(S);                                                          // 月底至少爆一张的概率
    if (risk < P['advice.dirt.risk']) return null;
    const d = S.dirt.slice().sort((a, b) => b.sev - a.sev)[0];
    return withAct({ id: 'dirt', lv: risk >= P['advice.dirt.bad'] ? 'bad' : 'warn', icon: T(S, 'advice.dirt.icon'), title: T(S, 'advice.dirt.title'), text: T(S, 'advice.dirt.text', { 张数: S.dirt.length, 概率: num(risk * 100), 黑料: d.name, 严重度: num(d.sev) }), go: { rtab: 'safe' } }, S, 'wash');
  },
  S => (S.hype < P['advice.hype.line'] && S.t > P['advice.hype.from'] ? onlyIfAct(withAct({ id: 'hype', lv: 'warn', icon: T(S, 'advice.hype.icon'), title: T(S, 'advice.hype.title'), text: T(S, 'advice.hype.text', { 热度: num(S.hype) }) }, S, 'hype')) : null),
  S => (S.rep < P['advice.rep.line'] ? onlyIfAct(withAct({ id: 'rep', lv: 'warn', icon: T(S, 'advice.rep.icon'), title: T(S, 'advice.rep.title'), text: T(S, 'advice.rep.text', { 口碑: num(S.rep) }) }, S, 'goodpr')) : null),
  // ── 路线之争 ──
  function ideoEquity(S) {                                                      // 终局时股权要 ≥ ideo.equity
    const I = S.ideo;
    if (!I?.on || S.equity >= P['advice.ideo.equity']) return null;
    const low = S.equity < P['ideo.equity'];
    return { id: 'ideo-equity', lv: low ? 'bad' : 'warn', icon: T(S, 'advice.ideoEquity.icon'), title: T(S, low ? 'advice.ideoEquity.title.low' : 'advice.ideoEquity.title'), text: T(S, 'advice.ideoEquity.text', { 级数: IDEO_LEN - I.n, 底线: P['ideo.equity'], 股权: S.equity.toFixed(0), 回购线: P['ideo.equityWarn'] }), go: { ltab: 'ideo' } };
  },
  function ideoNew(S) {                                                         // 刚走完：告诉玩家意识形态页有东西了
    const I = S.ideo;
    if (!I?.result || I.result === 'fail' || S.t - I.tEnd > P['advice.ideo.newMonths']) return null;
    const red = I.result === 'red';
    const body = text(red ? 'advice.ideoNew.red' : 'advice.ideoNew.cap', null, I.v === 'us');    // 两个版本解锁的行动不一样：「湾区文本」是湾区版
    return onlyIfAct(withAct({ id: 'ideo-new', lv: 'gold', icon: T(S, 'advice.ideoNew.icon'), title: T(S, 'advice.ideoNew.title'), text: body, go: { ltab: 'ideo' } }, S, red ? 'mobilize' : 'yank', red ? 'plan' : 'buyback'));
  },
  function ideoHeat(S) {                                                        // 湾区：反共压力太大
    const I = S.ideo;
    if (!hasHeat(I?.v) || !(I.on || I.result === 'red') || (I.heat || 0) < P['advice.ideo.heat']) return null;
    const r = Math.round(I.heat / (P['ideo.heat.raiseDiv'] / 100)), b = Math.round(I.heat / (P['ideo.heat.b2bDiv'] / 100));    // 和引擎里的拖累一致
    return { id: 'ideo-heat', lv: I.heat >= P['advice.ideo.heatBad'] ? 'bad' : 'warn', icon: T(S, 'advice.ideoHeat.icon'), title: T(S, 'advice.ideoHeat.title'), text: T(S, 'advice.ideoHeat.text', { 压力: Math.round(I.heat), 估值: r, 订单: b, 磨掉: I.on ? T(S, 'advice.ideoHeat.grind') : '' }), go: { ltab: 'ideo' } };
  },
];

const ORDER = { bad: 0, gold: 1, warn: 2 };
// 现在该提醒的事：急事在前，同一级里能马上做的在前
export function advise(S) {
  if (!S || S.over) return [];
  const mute = S.hintMute || {}, out = [];
  for (const rule of RULES) for (const h of [].concat(rule(S) || [])) if (h && !(mute[h.id] > S.t)) out.push(h);
  return out.sort((a, b) => ORDER[a.lv] - ORDER[b.lv] || (a.later ? 1 : 0) - (b.later ? 1 : 0));
}
// 「先别提醒」：急事只静音到下个月，其他的静音久一点
export const muteMonths = h => (h.lv === 'bad' ? P['advice.mute.bad'] : P['advice.mute.other']);
export function muteHint(S, h) {
  const m = (S.hintMute ??= {});
  for (const k in m) if (m[k] <= S.t) delete m[k];
  m[h.id] = S.t + muteMonths(h);
}

// 「路线之争」：中后期「接盘老股」事件引进立场鲜明的股东之后的 15 级事件链，以及走完以后「意识形态」页上的东西。
// 两个版本，玩法一样、剧情各一套：
//   深圳 cn：深创头的国资基金接盘天使的老股 → 国资董事进场；进度条叫 共产 / 资本
//   湾区 us：公地资本（工会养老金）接盘种子轮的老股 → 养老金的董事观察员进场；进度条叫 社会主义 / 资本主义，
//           另有一条「反共压力」：社会主义条越高涨得越快，压力过半会磨掉社会主义条、拖累融资和企业订单，还会弹出红色恐慌事件。
//           公司嘴上始终不承认自己是社会主义。
// - 揣摩玩家意图：最近的选择权重大，再参考平时的经营作风；从第 3 级起，玩家想走哪边就多给哪边的选项
// - 终局：左边的条满或更多 → 左翼结局；资本条满或更多 → 保守结局 + 处置左倾员工；股权不到四成 → 没走成
// 内容都在表里：两本「路线之争」工作簿（每个版本的阶段、卡池、结局、窗口、版本设定）、文本.xlsx「路线之争」（两地对照的说法）、
// 平衡参数.xlsx 里 ideo. 开头的系数。这里只管规则。
// 这里不 import 引擎（避免循环依赖）：用到的引擎函数由调用方以参数 G 传进来——事件里就是引擎的 API，行动里是引擎模块本身。
import { ROLES, STAFF_QUIRKS, GOALS, TRAIT, officeName, P } from '../data/defs.js';
import { text, fill } from '../data/text.js';
import * as CN from '../data/ideology.js';
import * as US from '../data/ideology_us.js';

const BOOK = { cn: CN, us: US };
export const IDEO_LEN = CN.IDEO_STAGES.length;          // 级数 = 「阶段」表的行数（两个版本一样多，validate.mjs 会查）
export const IDEO_EQUITY = P['ideo.equity'];            // 终局时创始人股权的底线（%）
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const byId = list => Object.fromEntries(list.map(e => [e.id, e]));
const WIN = { cn: byId(CN.SYS_EVENTS), us: byId(US.SYS_EVENTS) };   // 「系统事件」表：代码弹的几个窗口
const optOf = (w, fn) => w.options.find(o => o.fn === fn);

// 哪个版本：开了链就看链；没开就看地区（意识形态页的空状态、融资窗的报价都要用）
export const verOf = S => S.ideo?.v || (S.co.region === 'bay' ? 'us' : 'cn');
const D = S => BOOK[verOf(S)];
const ver = S => D(S).VER;                              // 「版本设定」表
const win = (S, id) => WIN[verOf(S)][id];
export const hasHeat = v => !!BOOK[v]?.VER.heat?.on;    // 这个版本有没有反共压力
// 文本.xlsx「路线之争」：湾区版用「湾区文本」
export const vt = (S, key, vars) => text(key, vars, verOf(S) === 'us');
export const sideName = S => ({ red: vt(S, 'ideo.side.red'), cap: vt(S, 'ideo.side.cap'), mid: vt(S, 'ideo.side.mid') });
export const sideTag = S => ({ red: vt(S, 'ideo.tag.red'), cap: vt(S, 'ideo.tag.cap'), mid: vt(S, 'ideo.tag.mid') });
export const castOf = S => D(S).IDEO_CAST;
export const chainStart = (S, k) => ver(S).chain[k];

export const isRed = S => S.ideo?.result === 'red';
export const isCap = S => S.ideo?.result === 'cap';
export const ideoOn = S => !!S.ideo?.on;
// 公司目标：平时就是建角时选的「公司使命」；走完路线之争，新目标会取代它（旧使命的效果随之失效）
const missionOf = S => S.founder.traits.find(id => TRAIT[id] && id.startsWith('v_'));
export function goalOf(S) {
  if (S.ideo?.goal) return { id: S.ideo.goal, ...GOALS[S.ideo.goal] };
  const m = missionOf(S);
  if (m) return { id: m, name: TRAIT[m].name.replace(/[「」]/g, ''), desc: TRAIT[m].desc };
  const id = S.co.route === 'model' ? 'model' : 'app';
  return { id, ...GOALS[id] };
}
function replaceMission(S, I) {
  const m = missionOf(S);
  if (!m) return;
  I.mission0 = m; S.founder.traits = S.founder.traits.filter(x => x !== m);
}
export const actText = (S, key, G) => { const T = D(S).ACT_TEXT[key]; return T?.length ? G.pick(S, T) : ''; };

// ───────── 开链 ─────────
function fresh(S, v) {
  return { v, on: 1, n: 0, heat: 0, ...BOOK[v].VER.start, picks: [], used: {}, shown: {}, t0: S.t, result: null, goal: null, full: null, fired: 0 };
}
// 接受新股东（或者拖延失败）之后调用：建状态，给一部分老员工打上左倾标记，第一级马上弹出
export function startIdeo(S, G) {
  if (S.ideo) return false;
  const v = S.co.region === 'bay' ? 'us' : 'cn', X = BOOK[v].VER;
  S.ideo = fresh(S, v);
  for (const e of S.staff) { e.rc = 1; if (G.rnd(S) < P['ideo.redStart']) e.red = 1; }
  S.flags[X.flag.on] = 1;
  if (X.flag.chain) S.flags[X.flag.chain] = 1;
  const R = castOf(S).rep.name;
  note(S, vt(S, 'ideo.start.note', { 代表: R })); G.news(S, vt(S, 'ideo.start.news', { 代表: R, 公司: S.co.name }));
  G.queueEvent(S, 'ideo_1');
  return true;
}
// ───────── 中后期入口：早期投资人退出，国资（深圳）/ 公地资本（湾区）来接盘他的老股 ─────────
// 开局随机定在第 ideo.entry.from~to 个月；到时候还没融完 A 轮就往后推；过了 ideo.entry.last 就不来了（剩下的时间走不完 15 级）。
// 三个选择都有代价：接受 → 15 个月的路线之争；行使优先购买权 → 花一大笔钱自己吃下这块老股；拖着不签 → 检定，砸了照样开链、开局更难
function entryMonth(S, G) {
  if (S.ideo || S.flags.ideoBlocked || !S.ideoAt || S.t < S.ideoAt) return;
  if (S.t > P['ideo.entry.last']) { S.ideoAt = 0; return; }
  if (S.stage < P['ideo.entry.stage']) { S.ideoAt = S.t + P['ideo.entry.delay']; return; }
  S.ideoAt = 0;
  G.queueEvent(S, 'ideo_entry');
}
const entryEvent = {
  id: 'ideo_entry', cat: 'money', weight: 0, once: false,
  title: S => win(S, 'ideo_entry').title, icon: S => win(S, 'ideo_entry').icon, art: S => win(S, 'ideo_entry').art,
  text: S => `${win(S, 'ideo_entry').text}\n\n${vt(S, 'ideo.entry.note', { 级数: IDEO_LEN, 底线: IDEO_EQUITY, 股权: S.equity.toFixed(0), 提醒: S.equity < P['ideo.entry.warn'] ? vt(S, 'ideo.entry.note.low') : '' })}`,
  options: (S, ctx, G) => {
    const W = win(S, 'ideo_entry'), A = optOf(W, 'accept'), R = optOf(W, 'rofr'), T = optOf(W, 'stall');
    const share = R.p.份额, price = G.valuation(S) * share / 100 * R.p.溢价, block = S2 => { S2.flags.ideoBlocked = 1; };
    const begin = heat => (S2, c, G2) => { startIdeo(S2, G2); if (heat && S2.ideo) S2.ideo.heat += heat; };
    return [
      { label: A.label, hint: A.hint, text: A.text, fx: A.fx, fn: begin(0) },
      { label: R.label, hint: fill(R.hint, { 价格: G.money(S, price), 份额: share }), req: { cash: price / G.unit(S) }, text: R.text, fx: { cashAbs: -price, equity: share, ...R.fx }, fn: block },
      { label: T.label, hint: T.hint, check: T.check, ok: { text: T.ok.text, fx: T.ok.fx, fn: block }, fail: { text: T.fail.text, fx: T.fail.fx, fn: begin(T.p?.压力 || 0) } },
    ];
  },
};

// 自检和老存档兜底：没有状态时补一个
const ensure = S => (S.ideo ??= fresh(S, verOf(S)));
function note(S, text) {
  const c = (S.chains.ideo ??= { id: 'ideo', t: S.t, notes: [] });
  c.notes.push({ t: S.t, text });
}
const barsLine = S => {
  const I = S.ideo, N = sideName(S);
  return vt(S, hasHeat(I.v) ? 'ideo.bars.heat' : 'ideo.bars', { 左翼名: N.red, 左翼: Math.round(I.red), 资本名: N.cap, 资本: Math.round(I.cap), 压力: Math.round(I.heat) });
};

// ───────── 揣摩玩家意图 ─────────
// 返回 v ∈ [-1, 1]（正 = 想往左走，负 = 想走资本）和把握 conf ∈ [0, 1]
export function ideoLean(S) {
  const I = S.ideo;
  if (!I) return { v: 0, conf: 0, choice: 0, style: 0 };
  let w = 0, s = 0;
  I.picks.forEach((p, i) => { const k = P['ideo.lean.decay'] ** (I.picks.length - 1 - i); w += k; s += k * (p.side === 'red' ? 1 : p.side === 'cap' ? -1 : 0); });
  const choice = w ? s / w : 0;
  // 平时的作风也算数：免费 vs 高价收割、965 vs 996、严防死守 vs 放飞自我、这段时间裁了多少人
  const Q = S.policies;
  const style = clamp((Q.price === 'free' ? P['ideo.lean.free'] : Q.price === 'premium' ? P['ideo.lean.premium'] : 0) + (String(Q.work) === '996' ? P['ideo.lean.x996'] : P['ideo.lean.x965'])
    + (Q.safety === 'strict' ? P['ideo.lean.strict'] : Q.safety === 'loose' ? P['ideo.lean.loose'] : 0) - Math.min(P['ideo.lean.fireMax'], (I.fired || 0) * P['ideo.lean.fire']), -1, 1);
  const v = clamp(P['ideo.lean.wChoice'] * choice + P['ideo.lean.wStyle'] * style + P['ideo.lean.wBars'] * (I.red - I.cap) / 100, -1, 1);
  return { v, conf: clamp(I.picks.length / P['ideo.lean.confPicks'], 0, 1) * Math.min(1, Math.abs(v) / P['ideo.lean.confV']), choice, style };
}
const prefOf = v => (v > P['ideo.lean.pref'] ? 'red' : v < -P['ideo.lean.pref'] ? 'cap' : null);
export function leanText(S) {
  const I = S.ideo;
  if (!I || !I.picks.length) return vt(S, 'ideo.lean.none');
  const { v, conf } = ideoLean(S), p = prefOf(v), sure = Math.round(P['ideo.lean.pct0'] + conf * P['ideo.lean.pctK']), from = P['ideo.lean.from'];
  if (!p) return vt(S, 'ideo.lean.mixed');
  return vt(S, 'ideo.lean.side', { 立场: sideName(S)[p], 把握: sure, 后话: I.n >= from - 1 ? vt(S, 'ideo.lean.more') : vt(S, 'ideo.lean.later', { 起始级: from }) });
}

// ───────── 每一级给哪些选项 ─────────
// 前两级：左、资本、务实各一。第 3 级起看意图：有倾向 → 两张对路的 + 一张反方向；认准了 → 三张对路的 + 一条回头路
function slotsFor(S, n) {
  if (n < P['ideo.lean.from']) return ['red', 'cap', 'mid'];
  const { v } = ideoLean(S), p = prefOf(v);
  if (!p) return ['red', 'cap', 'mid'];
  const opp = p === 'red' ? 'cap' : 'red';
  return Math.abs(v) >= P['ideo.lean.firm'] ? [p, p, p, opp] : [p, p, opp];
}
const stageOf = (S, n) => { const L = D(S).IDEO_STAGES; return L[n - 1] || L[L.length - 1]; };
function stageOptions(S, n, G) {
  const I = ensure(S), st = stageOf(S, n);
  const own = (st.opts || []).map((o, j) => ({ ...o, key: `s${n}.${j}` }));
  // 卡池：在本级范围内、局势条件满足、没选过、上一级没刚露过面
  const pool = D(S).IDEO_POOL.filter(c => c.from <= n && n <= c.to && !I.used[c.id] && I.shown[c.id] !== n - 1 && G.cond(S, c.when)).map(c => ({ ...c, key: c.id }));
  const taken = new Set(), out = [];
  const take = side => {
    const mine = own.find(o => o.side === side && !taken.has(o.key));
    if (mine) return mine;
    const list = pool.filter(c => c.side === side && !taken.has(c.key));
    if (!list.length) return null;
    const sharp = list.filter(c => c.when), from = sharp.length && G.rnd(S) < P['ideo.deck.sharp'] ? sharp : list;   // 看局势的卡优先
    return from[Math.floor(G.rnd(S) * from.length)];
  };
  const slots = slotsFor(S, n);
  for (const side of slots) {
    const c = take(side) || take('mid') || take(side === 'red' ? 'cap' : 'red');
    if (c) { taken.add(c.key); out.push(c); }
  }
  // 眼前的急事：股权快守不住四成了，加一张回购；没有务实卡位时，偶尔塞一张「看局势」的务实卡
  const extra = n >= P['ideo.deck.buybackFrom'] && n < IDEO_LEN && S.equity < P['ideo.equityWarn'] ? buybackCard(S, G)
    : !slots.includes('mid') && G.rnd(S) < P['ideo.deck.mid'] ? pool.find(c => c.side === 'mid' && c.when && !taken.has(c.key)) : null;
  if (extra) { if (out.length < 4) out.push(extra); else out.splice(out.length - 2, 1, extra); }
  for (const c of out) if (c.id) I.shown[c.id] = n;
  return out.map(c => toOpt(c, n));
}
function buybackCard(S, G) {
  const share = P['ideo.buyback.share'], price = G.valuation(S) * (share / 100) * P['ideo.buyback.premium'], C = castOf(S);
  return {
    key: 'buyback', side: 'mid', label: vt(S, 'ideo.buyback.label', { 比例: share }), hint: vt(S, 'ideo.buyback.hint', { 价格: G.money(S, price) }),
    text: vt(S, 'ideo.buyback.text', { 代表: C.rep.name, 资本派: C.cap.name }), fx: { cashAbs: -price, equity: share }, req: { cash: price / G.unit(S) },
  };
}
// 链上卡片 → 引擎认识的选项。bars 变成 fx.ideo；选完以后由 afterPick 记账、排下一级
function toOpt(c, n) {
  const fn = (S, ctx, G) => afterPick(S, n, c, G);
  const res = r => ({ text: r?.text || '', fx: { ...(r?.fx || {}), ideo: { red: (c.bars?.red || 0) + (r?.bars?.red || 0), cap: (c.bars?.cap || 0) + (r?.bars?.cap || 0) } }, fn });
  const o = { label: c.label, hint: c.hint, side: c.side };
  if (c.req) o.req = c.req;
  if (c.check) Object.assign(o, { check: c.check, ok: res(c.ok), fail: res(c.fail) });
  else if (c.odds != null) Object.assign(o, { odds: c.odds, ok: res(c.ok), fail: res(c.fail) });
  else { const r = res({ ...c, bars: null }); Object.assign(o, r); }
  return o;
}
function afterPick(S, n, c, G) {
  const I = ensure(S);
  I.picks.push({ n, side: c.side, label: c.label });
  if (c.id) I.used[c.id] = 1;
  I.n = Math.max(I.n, n);
  // 员工跟着风向走：往左选，有人加入读书会；往资本选，有人退出
  if (c.side === 'red') { const pool = S.staff.filter(e => !e.red); if (pool.length && G.rnd(S) < P['ideo.follow.red']) G.pick(S, pool).red = 1; }
  if (c.side === 'cap') { const pool = S.staff.filter(e => e.red); if (pool.length && G.rnd(S) < P['ideo.follow.cap']) delete G.pick(S, pool).red; }
  note(S, vt(S, 'ideo.pick.note', { 级: n, 标题: stageOf(S, n).title || '', 选项: c.label, 进度: barsLine(S) }));
  if (n < IDEO_LEN) S.sched.push({ id: `ideo_${n + 1}`, at: S.t + 1 });
  else resolve(S, G);
}

// ───────── 终局结算 ─────────
export function verdict(S) {
  const I = S.ideo;
  if (!I) return null;
  const { red, cap } = I;
  // 左边的条满或更多 → red；资本条满或更多 → cap；两条都满看谁先满；完全打平按意图（再不行默认保守）
  return red >= 100 && cap >= 100 ? I.full || 'red' : red >= 100 ? 'red' : cap >= 100 ? 'cap' : red > cap ? 'red' : cap > red ? 'cap' : ideoLean(S).v > 0 ? 'red' : 'cap';
}
function resolve(S, G) {
  const I = ensure(S), X = ver(S), want = verdict(S), r = S.equity < IDEO_EQUITY ? 'fail' : want, co = { 公司: S.co.name };
  Object.assign(I, { on: 0, result: r, want, tEnd: S.t });
  S.chains.ideo && (S.chains.ideo.done = true);
  if (X.flag.chain) delete S.flags[X.flag.chain];
  if (r === 'red') {
    replaceMission(S, I); I.goal = X.goal.red; S.flags[X.flag.red] = 1;
    I.brand0 = S.co.brand; S.co.brand = X.brand;                     // 招牌、Logo 一起换颜色（湾区的说法叫「品牌焕新」）
    G.award(S, 'road');
    G.news(S, vt(S, 'ideo.news.red', co));
  } else if (r === 'cap') {
    replaceMission(S, I); I.goal = X.goal.cap; S.flags[X.flag.cap] = 1;
    I.heat = 0;                                                       // 湾区：风头过去了
    G.award(S, 'road');
    G.news(S, vt(S, 'ideo.news.cap', co));
  } else G.news(S, vt(S, 'ideo.news.fail', co));
  note(S, r === 'fail' ? vt(S, 'ideo.end.note.fail', { 股权: S.equity.toFixed(0) }) : vt(S, 'ideo.end.note', { 结局: vt(S, 'ideo.end.' + r), 进度: barsLine(S) }));
  // 结局窗紧接着弹（插队到最前面）；保守结局后面再跟一个「左倾员工的去留」
  const next = [{ type: 'event', id: `ideo_end_${r}` }];
  if (r === 'cap' && S.staff.some(e => e.red)) next.push({ type: 'event', id: 'ideo_purge' });
  S.q.unshift(...next);
}

// ───────── 左倾员工的去留（深圳：共产倾向；湾区：签名档里挂 🌹 的）─────────
const loyalBit = (S, key, l, more) => (l ? vt(S, key, { 死忠人数: l, ...more }) : '');
function purge(S, act, G) {
  const reds = S.staff.filter(e => e.red), loyal = reds.filter(e => e.quirk === 'loyal'), sal = e => e.salary * G.mod(S, 'salaryMult');
  if (act === 'fire_all') {                                           // 死忠也不例外
    for (const e of reds) G.removeStaff(S, e.uid);
    if (reds.length) G.addDirt(S, { type: 'unfair_fire', sev: Math.min(P['ideo.purge.fireSevMax'], P['ideo.purge.fireSev'] + reds.length * P['ideo.purge.fireSevPer']), name: vt(S, 'ideo.purge.dirt') });
    G.applyFx(S, { morale: -(P['ideo.purge.fireMorale'] + reds.length * P['ideo.purge.fireMoralePer']), rep: P['ideo.purge.fireRep'] });
    return vt(S, 'ideo.purge.fireAll', { 人数: reds.length, 死忠: loyalBit(S, 'ideo.purge.fireAll.loyal', loyal.length, { 办公室: officeName(S, 1) }) });
  }
  if (act === 'reeducate') {
    for (const e of reds) { delete e.red; S.cash -= P['ideo.purge.eduMonths'] * sal(e); }   // 培训费：每人几个月工资
    G.applyFx(S, { morale: P['ideo.purge.eduMorale'] });
    return vt(S, 'ideo.purge.reeducate', { 人数: reds.length });
  }
  if (act === 'release') {
    const go = reds.filter(e => e.quirk !== 'loyal');
    for (const e of go) { S.cash -= P['ideo.purge.relMonths'] * sal(e); G.removeStaff(S, e.uid); }   // 赔几个月工资
    for (const e of reds) delete e.red;
    G.applyFx(S, { rep: P['ideo.purge.relRep'], morale: P['ideo.purge.relMorale'] });
    return vt(S, 'ideo.purge.release', { 人数: go.length, 死忠: loyalBit(S, 'ideo.purge.release.loyal', loyal.length) });
  }
  S.flags[ver(S).flag.cell] = 1;
  G.applyFx(S, { morale: P['ideo.purge.tolMorale'] });
  return vt(S, 'ideo.purge.tolerate', { 人数: reds.length });
}
function purgeHint(S, act, n, l) {
  if (act === 'fire_all') return vt(S, 'ideo.purge.hint.fire_all', { 人数: n, 死忠: loyalBit(S, 'ideo.purge.hint.fire_all.loyal', l) });
  if (act === 'reeducate') return vt(S, 'ideo.purge.hint.reeducate', { 人数: n });
  if (act === 'release') return vt(S, 'ideo.purge.hint.release', { 走的人数: n - l, 死忠: loyalBit(S, 'ideo.purge.hint.release.loyal', l) });
  if (act === 'tolerate') return vt(S, 'ideo.purge.hint.tolerate');
  return null;
}

// ───────── 五年计划 / 登月计划 ─────────
// 「系统事件」表的 ideo_plan：每个选项是一种目标（脚本列 users / model / rev），参数列定目标怎么算，效果列是立项时的限时加成
const PLAN = {
  users: { show: () => true, now: S => S.users, goal: (S, G, p) => Math.max(S.users * p.倍数, S.users + p.至少), fmt: (S, G, v) => vt(S, 'ideo.plan.goal.users', { 用户: G.fmtUsers(v) }) },
  model: { show: S => S.ownModel, now: (S, G) => G.myCap(S), goal: (S, G, p) => G.myCap(S) + p.提升, fmt: (S, G, v) => vt(S, 'ideo.plan.goal.model', { 火候: v.toFixed(1) }) },
  rev: { show: () => true, now: (S, G) => G.revenue(S).total, goal: (S, G, p) => Math.max(G.revenue(S).total * p.倍数, G.revenue(S).total + p.至少), fmt: (S, G, v) => vt(S, 'ideo.plan.goal.rev', { 收入: G.money(S, v) }) },
};
export function planDialog(S, G) {
  const W = win(S, 'ideo_plan'), months = W.p.月数;
  return {
    dialog: {
      kind: 'event', cat: 'ideo', icon: W.icon, art: W.art, title: W.title, text: W.text,
      options: W.options.filter(o => PLAN[o.fn].show(S)).map(o => {
        const K = PLAN[o.fn], goal = K.goal(S, G, o.p);
        return {
          label: o.label, hint: fill(o.hint, { 目标: K.fmt(S, G, goal) }),
          go: () => {
            ensure(S).plan = { kind: o.fn, goal, due: S.t + months, t: S.t };
            G.applyFx(S, o.fx);
            S.sched.push({ id: 'ideo_plan_due', at: S.t + months });
            G.news(S, vt(S, 'ideo.plan.news', { 公司: S.co.name, 日期: G.dateStr(S.t + months), 目标: K.fmt(S, G, goal) }));
            return { text: actText(S, 'plan', G) };
          },
        };
      }),
    },
  };
}
// 「五年计划」按钮说明里的数：几个月、各个目标的加成最少和最多是多少（%）
export function planRange(S) {
  const W = win(S, 'ideo_plan'), ups = W.options.map(o => +(([].concat(o.fx?.temp || [])[0]?.mult ?? 1) * 100 - 100).toFixed(6));
  return { 月数: W.p.月数, 最少: Math.min(...ups), 最多: Math.max(...ups) };
}
const planNow = (S, G) => { const p = S.ideo?.plan; return p && PLAN[p.kind] ? PLAN[p.kind].now(S, G) : 0; };

// ───────── 末位淘汰 / 强制排名 ─────────
export function yankDialog(S, G) {
  const W = win(S, 'ideo_yank'), go = optOf(W, 'go'), no = optOf(W, 'no');
  return {
    dialog: {
      kind: 'event', cat: 'ideo', icon: W.icon, art: W.art, title: W.title, text: W.text,
      options: [
        { label: go.label, hint: go.hint, go: () => { S.flags.yank = 1; G.news(S, vt(S, 'ideo.yank.start')); return { text: go.text }; } },
        { label: no.label, free: true, go: () => ({ text: '' }) },
      ],
    },
  };
}
// 每个部门（至少 2 人）淘汰产出最低的一个；HR 立刻从人才市场补一个，不花行动点、不付签字费、不影响士气
function yankMonth(S, G) {
  const out = e => e.skill * (STAFF_QUIRKS[e.quirk]?.out ?? 1);
  let n = 0;
  for (const role of Object.keys(ROLES)) {
    const team = S.staff.filter(e => e.role === role);
    if (team.length < 2) continue;
    const worst = team.slice().sort((a, b) => out(a) - out(b) || a.skill - b.skill)[0];
    G.removeStaff(S, worst.uid);
    const e = G.genStaff(S, role, 1); e.rc = 1;
    G.addStaff(S, e); n++;
  }
  if (n) G.news(S, vt(S, 'ideo.yank.month', { 人数: n }));
}

// ───────── 反共压力（湾区）─────────
// 路线之争期间：社会主义条越高涨得越快，资本主义条高能压一压；压力过半时社会主义条每月被磨掉一点，也有人悄悄摘掉签名档里的 🌹。
// 「共享繁荣」之后：压力一直挂在半空，偶尔还会弹红色恐慌事件。压力越大，融资估值和企业订单越受影响（见引擎 mod）
function heatMonth(S, G) {
  const I = S.ideo;
  if (!hasHeat(I.v)) return;
  if (I.result === 'fail') { I.heat = Math.max(0, I.heat - P['ideo.heat.failDecay']); return; }
  if (!I.on && I.result !== 'red') return;
  const rise = I.on ? P['ideo.heat.rise'] + Math.max(0, I.red - P['ideo.heat.redFrom']) * P['ideo.heat.redK'] - Math.max(0, I.cap - P['ideo.heat.capFrom']) * P['ideo.heat.capK']
    : I.heat < P['ideo.heat.afterCap'] ? P['ideo.heat.after'] : 0;
  I.heat = clamp(I.heat + rise, 0, 100);
  if (I.on && I.heat >= P['ideo.heat.half'] && I.red > I.cap) {
    I.red = Math.max(0, I.red - P['ideo.heat.grind']);
    const reds = S.staff.filter(e => e.red);
    if (reds.length && G.rnd(S) < P['ideo.heat.unrose']) { delete G.pick(S, reds).red; G.news(S, vt(S, 'ideo.heat.news')); }
  }
  // 红色恐慌事件：每月最多一件，同一件 ideo.heat.scareCd 个月内不重复
  if (G.rnd(S) < (I.on ? P['ideo.heat.scare'] + I.heat / P['ideo.heat.scareDiv'] : I.heat / P['ideo.heat.scareAfterDiv'])) {
    const list = (D(S).SCARE_EVENTS || []).filter(ev => G.cond(S, ev.when) && S.t - (S.seen[ev.id] ?? -99) >= P['ideo.heat.scareCd']);
    if (list.length) G.queueEvent(S, G.pick(S, list).id);
  }
}
// 压力对融资估值和企业订单的拖累（给引擎的 mod 用）
export const heatDrag = (S, key) => {
  const I = S.ideo;
  if (!hasHeat(I?.v) || !I.heat) return 1;
  return key === 'raiseMult' ? 1 - I.heat / P['ideo.heat.raiseDiv'] : key === 'b2bMult' ? 1 - I.heat / P['ideo.heat.b2bDiv'] : 1;
};

// 每月结算时调用（引擎 endMonth）
export function ideoMonth(S, G) {
  entryMonth(S, G);
  if (!S.ideo) return;
  // 新来的人：路线之争期间按左边那条的高低，有一定概率加入读书会；左翼结局的公司里一半人是
  for (const e of S.staff) if (!e.rc) { e.rc = 1; const p = isRed(S) ? P['ideo.newRed.red'] : ideoOn(S) ? S.ideo.red / P['ideo.newRed.div'] : 0; if (p && G.rnd(S) < p) e.red = 1; }
  if (S.flags.yank) yankMonth(S, G);
  heatMonth(S, G);
}
// 玩家手动裁人：算进「作风」
export function noteFire(S) { if (S.ideo?.on) S.ideo.fired = (S.ideo.fired || 0) + 1; }

// ───────── 事件（由引擎并进事件表，weight 0 只能被排进来）─────────
const situation = (S, n, G) => {
  const bits = [];
  if (S.equity < P['ideo.equityWarn'] && n < IDEO_LEN) bits.push(vt(S, 'ideo.situation.equity', { 股权: S.equity.toFixed(0) }));
  if (G.runway(S) < P['ideo.warn.runway']) bits.push(vt(S, 'ideo.situation.cash', { 月数: Math.max(0, Math.floor(G.runway(S))) }));
  if (S.ideo && hasHeat(S.ideo.v) && S.ideo.heat >= P['ideo.heat.half']) bits.push(vt(S, 'ideo.situation.heat', { 压力: Math.round(S.ideo.heat) }));
  if (n === IDEO_LEN) bits.push(vt(S, 'ideo.situation.last'));
  return bits.length ? '\n\n' + vt(S, 'ideo.situation', { 局势: bits.join(vt(S, 'ideo.situation.sep')) }) : '';
};
const stageEvent = n => ({
  id: `ideo_${n}`, chain: 'ideo', cat: 'ideo', weight: 0, once: false,
  title: S => stageOf(S, n).title, icon: S => stageOf(S, n).icon, art: S => stageOf(S, n).art, portrait: S => stageOf(S, n).portrait,
  text: (S, ctx, G) => stageOf(S, n).text + situation(S, n, G),
  options: (S, ctx, G) => stageOptions(S, n, G),
});
const endLine = (S, r) => {
  ensure(S);
  if (r === 'fail') return '\n\n' + vt(S, 'ideo.endLine.fail', { 进度: barsLine(S), 股权: S.equity.toFixed(0), 底线: IDEO_EQUITY });
  return '\n\n' + vt(S, 'ideo.endLine', { 进度: barsLine(S), 目标: GOALS[ver(S).goal[r]].name });
};
const endOf = (S, r) => D(S).IDEO_ENDINGS[r];
const endEvent = r => ({
  id: `ideo_end_${r}`, chain: 'ideo', cat: 'ideo', weight: 0, once: false,
  title: S => endOf(S, r).title, icon: S => endOf(S, r).icon, art: S => endOf(S, r).art, portrait: S => endOf(S, r).portrait,
  text: S => endOf(S, r).text + endLine(S, r),
  options: S => endOf(S, r).options.map(({ act, ...o }) => o),
});
const purgeEvent = {
  id: 'ideo_purge', chain: 'ideo', cat: 'ideo', weight: 0, once: false,
  title: S => endOf(S, 'purge').title, icon: S => endOf(S, 'purge').icon, art: S => endOf(S, 'purge').art,
  text: S => { const reds = S.staff.filter(e => e.red), l = reds.filter(e => e.quirk === 'loyal').length; return `${endOf(S, 'purge').text}\n\n${vt(S, 'ideo.purge.list', { 人数: reds.length, 死忠: loyalBit(S, 'ideo.purge.list.loyal', l) })}`; },
  options: S => {
    const reds = S.staff.filter(e => e.red), l = reds.filter(e => e.quirk === 'loyal').length;
    return endOf(S, 'purge').options.map(({ act, ...o }) => ({
      ...o, hint: purgeHint(S, act, reds.length, l) || o.hint, fx: o.fx || {},
      fn: (S2, ctx, G) => ({ text: `${o.text}\n\n${purge(S2, act, G)}` }),
    }));
  },
};
// 计划到期：完成了用「系统事件」表的 ideo_plan_ok，没完成用 ideo_plan_fail
const dueWin = (S, ctx) => win(S, ctx.ok ? 'ideo_plan_ok' : 'ideo_plan_fail');
const planDueEvent = {
  id: 'ideo_plan_due', cat: 'ideo', weight: 0, once: false,
  enter: (S, ctx, G) => { const p = S.ideo?.plan; ctx.ok = !!p && planNow(S, G) >= p.goal; },
  title: (S, ctx) => dueWin(S, ctx).title, icon: (S, ctx) => dueWin(S, ctx).icon, art: (S, ctx) => dueWin(S, ctx).art,
  text: (S, ctx, G) => {
    const p = S.ideo?.plan, K = p && PLAN[p.kind];
    return dueWin(S, ctx).text + (K ? '\n\n' + vt(S, 'ideo.plan.result', { 目标: K.fmt(S, G, p.goal), 实际: K.fmt(S, G, planNow(S, G)) }) : '');
  },
  options: (S, ctx) => {
    const done = () => { if (S.ideo) { S.ideo.plan = null; S.ideo.plans = (S.ideo.plans || 0) + 1; } };
    return dueWin(S, ctx).options.map(o => ({ label: o.label, hint: o.hint, text: o.text, fx: o.fx, fn: done }));
  },
};
export const IDEO_DYN = [
  ...Array.from({ length: IDEO_LEN }, (_, i) => stageEvent(i + 1)),
  endEvent('red'), endEvent('cap'), endEvent('fail'), purgeEvent, planDueEvent, entryEvent,
];
// 两个版本的固定内容事件（链、结局后的随机事件、红色恐慌），给引擎并进事件表
export const IDEO_STATIC = [
  ...CN.IDEO_EVENTS, ...CN.UTOPIA_EVENTS, ...CN.BCI_EVENTS,
  ...US.IDEO_EVENTS, ...US.UTOPIA_EVENTS, ...US.BCI_EVENTS, ...US.SCARE_EVENTS,
];
export const IDEO_CHAIN_INFO = { ...CN.IDEO_CHAINS, ...US.IDEO_CHAINS };

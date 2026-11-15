// 「路线之争」：深圳国资入股之后的 15 级事件链，以及走完以后「意识形态」页上的东西。
// - 两条进度条：共产 / 资本（0~100）。每级的选项推动它们
// - 揣摩玩家意图：最近的选择权重大，再参考平时的经营作风；从第 3 级起，玩家想走哪边就多给哪边的选项
// - 终局：共产条满或更多 → 红色结局；资本条满或更多 → 保守结局 + 处置共产倾向员工；股权不到四成 → 没走成
// 这里不 import 引擎（避免循环依赖）：用到的引擎函数由调用方以参数 G 传进来——事件里就是引擎的 API，行动里是引擎模块本身。
import { ROLES, STAFF_QUIRKS, GOALS, TRAIT } from '../data/defs.js';
import { IDEO_STAGES, IDEO_POOL, IDEO_ENDINGS, IDEO_CAST, PLAN_TEXT, ACT_TEXT, YANK_TEXT } from '../data/ideology.js';

export const IDEO_LEN = 15;
export const IDEO_EQUITY = 40;                 // 终局时创始人股权的底线（%）
export const IDEO_START = { red: 12, cap: 28 };  // 一家创业公司，天生偏资本一点
export const SIDE_NAME = { red: '共产', cap: '资本', mid: '务实' };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export const isRed = S => S.ideo?.result === 'red';
export const isCap = S => S.ideo?.result === 'cap';
export const ideoOn = S => !!S.ideo?.on;
export const cast = IDEO_CAST;
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
export const actText = (S, key, G) => (ACT_TEXT[key]?.length ? G.pick(S, ACT_TEXT[key]) : '');

// ───────── 开链 ─────────
function fresh(S) {
  return { on: 1, n: 0, ...IDEO_START, picks: [], used: {}, shown: {}, t0: S.t, result: null, goal: null, full: null, fired: 0 };
}
// 选了「深创头：国资入股」之后调用：建状态，给一部分老员工打上「共产倾向」，第一级马上弹出
export function startIdeo(S, G) {
  if (S.ideo) return false;
  S.ideo = fresh(S);
  for (const e of S.staff) { e.rc = 1; if (G.rnd(S) < 0.2) e.red = 1; }
  S.flags.stateCap = 1;
  note(S, `国资董事${IDEO_CAST.rep.name}进场，路线之争开始。`);
  G.news(S, `🏛️ 深创头派驻董事${IDEO_CAST.rep.name}进场，${S.co.name} 内部的路线之争开始了。`);
  G.queueEvent(S, 'ideo_1');
  return true;
}
// 自检和老存档兜底：没有状态时补一个
const ensure = S => (S.ideo ??= fresh(S));
function note(S, text) {
  const c = (S.chains.ideo ??= { id: 'ideo', t: S.t, notes: [] });
  c.notes.push({ t: S.t, text });
}

// ───────── 揣摩玩家意图 ─────────
// 返回 v ∈ [-1, 1]（正 = 想走共产，负 = 想走资本）和把握 conf ∈ [0, 1]
export function ideoLean(S) {
  const I = S.ideo;
  if (!I) return { v: 0, conf: 0, choice: 0, style: 0 };
  let w = 0, s = 0;
  I.picks.forEach((p, i) => { const k = 0.72 ** (I.picks.length - 1 - i); w += k; s += k * (p.side === 'red' ? 1 : p.side === 'cap' ? -1 : 0); });
  const choice = w ? s / w : 0;
  // 平时的作风也算数：免费 vs 高价收割、965 vs 996、严防死守 vs 放飞自我、这段时间裁了多少人
  const P = S.policies;
  const style = clamp((P.price === 'free' ? 0.35 : P.price === 'premium' ? -0.35 : 0) + (String(P.work) === '996' ? -0.45 : 0.1)
    + (P.safety === 'strict' ? 0.15 : P.safety === 'loose' ? -0.15 : 0) - Math.min(0.3, (I.fired || 0) * 0.1), -1, 1);
  const v = clamp(0.65 * choice + 0.2 * style + 0.15 * (I.red - I.cap) / 100, -1, 1);
  return { v, conf: clamp(I.picks.length / 4, 0, 1) * Math.min(1, Math.abs(v) / 0.6), choice, style };
}
const prefOf = v => (v > 0.18 ? 'red' : v < -0.18 ? 'cap' : null);
export function leanText(S) {
  const I = S.ideo;
  if (!I || !I.picks.length) return '参谋还看不出你想把公司往哪边带。';
  const { v, conf } = ideoLean(S), p = prefOf(v), sure = Math.round(40 + conf * 55);
  if (!p) return '参谋判断：你在两条路之间摇摆，所以每级两边各给一条路。';
  return `参谋判断：你想把公司带向「${SIDE_NAME[p]}」（把握 ${sure}%）${I.n >= 2 ? '，会多给你这类选项' : '，从第 3 级起会多给你这类选项'}。`;
}

// ───────── 每一级给哪些选项 ─────────
// 前两级：共产、资本、务实各一。第 3 级起看意图：有倾向 → 两张对路的 + 一张反方向；认准了 → 三张对路的 + 一条回头路
function slotsFor(S, n) {
  if (n < 3) return ['red', 'cap', 'mid'];
  const { v } = ideoLean(S), p = prefOf(v);
  if (!p) return ['red', 'cap', 'mid'];
  const opp = p === 'red' ? 'cap' : 'red';
  return Math.abs(v) >= 0.5 ? [p, p, p, opp] : [p, p, opp];
}
function stageOptions(S, n, G) {
  const I = ensure(S), st = IDEO_STAGES[n - 1] || IDEO_STAGES[IDEO_STAGES.length - 1];
  const own = (st.opts || []).map((o, j) => ({ ...o, key: `s${n}.${j}` }));
  // 卡池：在本级范围内、局势条件满足、没选过、上一级没刚露过面
  const pool = IDEO_POOL.filter(c => c.from <= n && n <= c.to && !I.used[c.id] && I.shown[c.id] !== n - 1 && G.cond(S, c.when)).map(c => ({ ...c, key: c.id }));
  const taken = new Set(), out = [];
  const take = side => {
    const mine = own.find(o => o.side === side && !taken.has(o.key));
    if (mine) return mine;
    const list = pool.filter(c => c.side === side && !taken.has(c.key));
    if (!list.length) return null;
    const sharp = list.filter(c => c.when), from = sharp.length && G.rnd(S) < 0.65 ? sharp : list;   // 看局势的卡优先
    return from[Math.floor(G.rnd(S) * from.length)];
  };
  const slots = slotsFor(S, n);
  for (const side of slots) {
    const c = take(side) || take('mid') || take(side === 'red' ? 'cap' : 'red');
    if (c) { taken.add(c.key); out.push(c); }
  }
  // 眼前的急事：股权快守不住四成了，加一张回购；没有务实卡位时，偶尔塞一张「看局势」的务实卡
  const extra = n >= 4 && n < IDEO_LEN && S.equity < 45 ? buybackCard(S, G)
    : !slots.includes('mid') && G.rnd(S) < 0.4 ? pool.find(c => c.side === 'mid' && c.when && !taken.has(c.key)) : null;
  if (extra) { if (out.length < 4) out.push(extra); else out.splice(out.length - 2, 1, extra); }
  for (const c of out) if (c.id) I.shown[c.id] = n;
  return out.map(c => toOpt(c, n));
}
function buybackCard(S, G) {
  const price = G.valuation(S) * 0.03 * 1.15;
  return {
    key: 'buyback', side: 'mid', label: '回购 3% 股权', hint: `花 ${G.money(S, price)}，按估值溢价一成半`,
    text: `${IDEO_CAST.rep.name}看了看报价，往搪瓷缸里续了点水：「可以，按规矩来。」${IDEO_CAST.cap.name}在旁边小声说，这是今年最贵的一杯茶。`,
    fx: { cashAbs: -price, equity: 3 }, req: { cash: price / G.unit(S) },
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
  // 员工跟着风向走：选共产，有人加入读书会；选资本，有人退出
  if (c.side === 'red') { const pool = S.staff.filter(e => !e.red); if (pool.length && G.rnd(S) < 0.8) G.pick(S, pool).red = 1; }
  if (c.side === 'cap') { const pool = S.staff.filter(e => e.red); if (pool.length && G.rnd(S) < 0.5) delete G.pick(S, pool).red; }
  note(S, `第 ${n} 级「${(IDEO_STAGES[n - 1] || {}).title || ''}」：${c.label}（共产 ${Math.round(I.red)} · 资本 ${Math.round(I.cap)}）`);
  if (n < IDEO_LEN) S.sched.push({ id: `ideo_${n + 1}`, at: S.t + 1 });
  else resolve(S, G);
}

// ───────── 终局结算 ─────────
export function verdict(S) {
  const I = S.ideo;
  if (!I) return null;
  const { red, cap } = I;
  // 共产条满或更多 → red；资本条满或更多 → cap；两条都满看谁先满；完全打平按意图（再不行默认保守）
  return red >= 100 && cap >= 100 ? I.full || 'red' : red >= 100 ? 'red' : cap >= 100 ? 'cap' : red > cap ? 'red' : cap > red ? 'cap' : ideoLean(S).v > 0 ? 'red' : 'cap';
}
function resolve(S, G) {
  const I = ensure(S), want = verdict(S), r = S.equity < IDEO_EQUITY ? 'fail' : want;
  Object.assign(I, { on: 0, result: r, want, tEnd: S.t });
  S.chains.ideo && (S.chains.ideo.done = true);
  if (r === 'red') {
    replaceMission(S, I); I.goal = 'red'; S.flags.red = 1;
    I.brand0 = S.co.brand; S.co.brand = '#d42a2a';                 // 招牌、Logo 一起换成红色
    G.award(S, 'road');
    G.news(S, `☭ ${S.co.name} 通过新章程：为了共产主义乌托邦而制造 AGI。美元基金发来了告别信。`);
  } else if (r === 'cap') {
    replaceMission(S, I); I.goal = 'cap'; S.flags.capb = 1;
    G.award(S, 'road');
    G.news(S, `🧯 ${S.co.name} 发布《关于警惕不现实的乌托邦主义的通知》，公司目标转向稳健经营。`);
  } else G.news(S, `🗳️ 路线之争收场：${S.co.name} 的创始人股权不到四成，方向由董事会代为决定。`);
  note(S, r === 'fail' ? `终局：股权 ${S.equity.toFixed(0)}%，不到四成，你说了不算。` : `终局：${r === 'red' ? '红色路线' : '警惕不现实的乌托邦主义'}（共产 ${Math.round(I.red)} · 资本 ${Math.round(I.cap)}）。`);
  // 结局窗紧接着弹（插队到最前面）；保守结局后面再跟一个「共产倾向员工的去留」
  const next = [{ type: 'event', id: `ideo_end_${r}` }];
  if (r === 'cap' && S.staff.some(e => e.red)) next.push({ type: 'event', id: 'ideo_purge' });
  S.q.unshift(...next);
}

// ───────── 共产倾向员工的去留 ─────────
const PURGE_HINT = {
  fire_all: (n, l) => `${n} 人${l ? `，含死忠 ${l} 人` : ''}；不给补偿`,
  reeducate: n => `${n} 人留下，读书会解散`,
  release: (n, l) => `${n - l} 人拿 N+3 离开${l ? `，死忠 ${l} 人留下` : ''}`,
  tolerate: () => '读书会转入地下',
};
function purge(S, act, G) {
  const reds = S.staff.filter(e => e.red), loyal = reds.filter(e => e.quirk === 'loyal'), sal = e => e.salary * G.mod(S, 'salaryMult');
  if (act === 'fire_all') {                                           // 死忠也不例外
    for (const e of reds) G.removeStaff(S, e.uid);
    if (reds.length) G.addDirt(S, { type: 'unfair_fire', sev: Math.min(18, 5 + reds.length * 1.2) });
    G.applyFx(S, { morale: -(3 + reds.length * 0.6), rep: -4 });
    return `${reds.length} 人当天收到了邮件${loyal.length ? `，其中 ${loyal.length} 位是跟你从出租屋一路走过来的死忠` : ''}。`;
  }
  if (act === 'reeducate') {
    for (const e of reds) { delete e.red; S.cash -= sal(e); }          // 培训费：每人一个月工资
    G.applyFx(S, { morale: -5 });
    return `${reds.length} 人转岗培训，读书会的群改名为「技术交流群」。`;
  }
  if (act === 'release') {
    const go = reds.filter(e => e.quirk !== 'loyal');
    for (const e of go) { S.cash -= 3 * sal(e); G.removeStaff(S, e.uid); }
    for (const e of reds) delete e.red;
    G.applyFx(S, { rep: 5, morale: 2 });
    return `${go.length} 人拿着 N+3 离开${loyal.length ? `，${loyal.length} 位死忠说什么也不走，留了下来` : ''}。`;
  }
  S.flags.red_cell = 1;
  G.applyFx(S, { morale: 3 });
  return `${reds.length} 人留在原岗位。每周五晚上，地下车库会多亮一盏灯。`;
}

// ───────── 五年计划（压缩成 12 个月）─────────
const PLAN = {
  users: { show: () => true, now: S => S.users, goal: S => Math.max(S.users * 2, S.users + 30), temp: { key: 'growthMult', mult: 1.15, months: 12 }, fmt: (S, G, v) => `用户 ${G.fmtUsers(v)}` },
  model: { show: S => S.ownModel, now: (S, G) => G.myCap(S), goal: (S, G) => G.myCap(S) + 6, temp: { key: 'researchMult', mult: 1.2, months: 12 }, fmt: (S, G, v) => `丹炉火候 ${v.toFixed(1)}` },
  rev: { show: () => true, now: (S, G) => G.revenue(S).total, goal: (S, G) => Math.max(G.revenue(S).total * 2, G.revenue(S).total + 20), temp: { key: 'revMult', mult: 1.12, months: 12 }, fmt: (S, G, v) => `月收入 ${G.money(S, v)}` },
};
export function planDialog(S, G) {
  const T = PLAN_TEXT.targets || {};
  return {
    dialog: {
      kind: 'event', cat: 'ideo', icon: '📜', art: 'redhall', title: PLAN_TEXT.title || '五年计划', text: PLAN_TEXT.text || '定一个十二个月的目标。',
      options: Object.entries(PLAN).filter(([, K]) => K.show(S)).map(([k, K]) => {
        const goal = K.goal(S, G);
        return {
          label: T[k]?.label || k, hint: `目标：${K.fmt(S, G, goal)}`,
          go: () => {
            ensure(S).plan = { kind: k, goal, due: S.t + 12, t: S.t };
            G.applyFx(S, { temp: K.temp });
            S.sched.push({ id: 'ideo_plan_due', at: S.t + 12 });
            G.news(S, `📜 ${S.co.name} 的「五年计划」立项：${G.dateStr(S.t + 12)}前达到${K.fmt(S, G, goal)}。`);
            return { text: actText(S, 'plan', G) };
          },
        };
      }),
    },
  };
}
const planNow = (S, G) => { const p = S.ideo?.plan; return p && PLAN[p.kind] ? PLAN[p.kind].now(S, G) : 0; };

// ───────── 末位淘汰 ─────────
export function yankDialog(S, G) {
  const Y = YANK_TEXT;
  return {
    dialog: {
      kind: 'event', cat: 'ideo', icon: '📉', art: 'boardroom', title: Y.title || '末位淘汰', text: Y.text || '',
      options: [
        { label: Y.go?.label || '推行', hint: Y.go?.hint, go: () => { S.flags.yank = 1; G.news(S, '📉 末位淘汰正式施行：每个部门每月淘汰一个能力最低的人。'); return { text: Y.go?.text || '' }; } },
        { label: Y.no?.label || '再想想', free: true, go: () => ({ text: '' }) },
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
  if (n) G.news(S, `📉 末位淘汰：本月每个部门「毕业」一人，HR 补进 ${n} 张新面孔。`);
}

// 每月结算时调用（引擎 endMonth）
export function ideoMonth(S, G) {
  if (!S.ideo) return;
  // 新来的人：路线之争期间按共产条高低，有一定概率加入读书会；红色公司里一半人是
  for (const e of S.staff) if (!e.rc) { e.rc = 1; const p = isRed(S) ? 0.5 : ideoOn(S) ? S.ideo.red / 260 : 0; if (p && G.rnd(S) < p) e.red = 1; }
  if (S.flags.yank) yankMonth(S, G);
}
// 玩家手动裁人：算进「作风」
export function noteFire(S) { if (S.ideo?.on) S.ideo.fired = (S.ideo.fired || 0) + 1; }

// ───────── 事件（由引擎并进事件表，weight 0 只能被排进来）─────────
const situation = (S, n, G) => {
  const bits = [];
  if (S.equity < 45 && n < IDEO_LEN) bits.push(`你现在握有 ${S.equity.toFixed(0)}% 股权，终局时不到四成，这条路就不归你定了`);
  if (G.runway(S) < 4) bits.push(`账上的钱只够撑 ${Math.max(0, Math.floor(G.runway(S)))} 个月`);
  if (n === IDEO_LEN) bits.push('这是最后一次表态');
  return bits.length ? `\n\n（${bits.join('；')}。）` : '';
};
const stageEvent = n => {
  const st = () => IDEO_STAGES[n - 1] || IDEO_STAGES[IDEO_STAGES.length - 1];
  return {
    id: `ideo_${n}`, chain: 'ideo', cat: 'ideo', weight: 0, once: false,
    title: () => st().title, icon: () => st().icon, art: () => st().art,
    text: (S, ctx, G) => st().text + situation(S, n, G),
    options: (S, ctx, G) => stageOptions(S, n, G),
  };
};
const endLine = (S, r) => {
  const I = ensure(S), bars = `共产 ${Math.round(I.red)} · 资本 ${Math.round(I.cap)}`;
  if (r === 'fail') return `\n\n（${bars}；你的股权 ${S.equity.toFixed(0)}%，不到 ${IDEO_EQUITY}%。）`;
  return `\n\n（${bars}。新的公司目标：「${GOALS[r].name}」。「意识形态」页解锁了新的行动。）`;
};
const endEvent = r => ({
  id: `ideo_end_${r}`, chain: 'ideo', cat: 'ideo', weight: 0, once: false,
  title: () => IDEO_ENDINGS[r].title, icon: () => IDEO_ENDINGS[r].icon, art: () => IDEO_ENDINGS[r].art,
  text: S => IDEO_ENDINGS[r].text + endLine(S, r),
  options: () => IDEO_ENDINGS[r].options.map(({ act, ...o }) => o),
});
const purgeEvent = {
  id: 'ideo_purge', chain: 'ideo', cat: 'ideo', weight: 0, once: false,
  title: () => IDEO_ENDINGS.purge.title, icon: () => IDEO_ENDINGS.purge.icon, art: () => IDEO_ENDINGS.purge.art,
  text: S => { const reds = S.staff.filter(e => e.red), l = reds.filter(e => e.quirk === 'loyal').length; return `${IDEO_ENDINGS.purge.text}\n\n名单上一共 ${reds.length} 人${l ? `，其中 ${l} 人是死忠` : ''}。`; },
  options: S => {
    const reds = S.staff.filter(e => e.red), l = reds.filter(e => e.quirk === 'loyal').length;
    return IDEO_ENDINGS.purge.options.map(({ act, ...o }) => ({
      ...o, hint: PURGE_HINT[act]?.(reds.length, l) || o.hint, fx: o.fx || {},
      fn: (S2, ctx, G) => ({ text: `${o.text}\n\n${purge(S2, act, G)}` }),
    }));
  },
};
const planDueEvent = {
  id: 'ideo_plan_due', cat: 'ideo', weight: 0, once: false,
  enter: (S, ctx, G) => { const p = S.ideo?.plan; ctx.ok = !!p && planNow(S, G) >= p.goal; },
  title: (S, ctx) => (ctx.ok ? PLAN_TEXT.okTitle : PLAN_TEXT.failTitle) || '计划到期', icon: '📜', art: (S, ctx) => (ctx.ok ? 'redhall' : 'office_night'),
  text: (S, ctx, G) => {
    const p = S.ideo?.plan, K = p && PLAN[p.kind];
    return ((ctx.ok ? PLAN_TEXT.okText : PLAN_TEXT.failText) || '') + (K ? `\n\n（目标：${K.fmt(S, G, p.goal)}；实际：${K.fmt(S, G, planNow(S, G))}。）` : '');
  },
  options: (S, ctx) => {
    const done = () => { if (S.ideo) { S.ideo.plan = null; S.ideo.plans = (S.ideo.plans || 0) + 1; } };
    const F = PLAN_TEXT.failOpts || {};
    if (ctx.ok) return [{ label: '开表彰大会', hint: '士气、口碑、热度都涨', text: '奖状是 AI 设计的，锦旗是 AI 绣的，台下的掌声是真的。', fx: { morale: 10, rep: 6, hype: 8 }, fn: done }];
    return [
      { label: F.honest?.label || '如实上报', hint: F.honest?.hint, text: F.honest?.text || '', fx: { morale: -8, rep: -3 }, fn: done },
      { label: F.fake?.label || '超额完成', hint: F.fake?.hint, text: F.fake?.text || '', fx: { rep: 3, hype: 5, dirt: 'fake_plan' }, fn: done },
    ];
  },
};
export const IDEO_DYN = [
  ...Array.from({ length: IDEO_LEN }, (_, i) => stageEvent(i + 1)),
  endEvent('red'), endEvent('cap'), endEvent('fail'), purgeEvent, planDueEvent,
];

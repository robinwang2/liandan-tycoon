// CEO 行动：每个行动花行动点（和钱），要么直接生效，要么弹出子选项。
// 名字、图标、行动点、冷却、检定、效果、描述、参数和全部文字都在 tables/行动.xlsx 里（「行动」「融资报价」「行动文本」）；
// 这里只有表格写不出来的部分：什么时候能点、花多少钱、具体怎么算。按行动 id 对上（HOOKS）。
//
// 一个行动的脚本（都可以不写）：
//   vars(x)          描述模板里 {名字} 的值（「参数」里的数自动可用；有检定的行动自动有 {成功率}）
//   desc(x)          整段描述换一种说法；返回 undefined 就用表里的描述模板
//   show(x)          返回 false 就不显示（「地区」列填了的话，也只在那个地区显示）
//   block(x)         返回一句话 = 现在点不了的原因
//   cost(x)          要花多少钱
//   run(x)           执行：返回结果文字，或 { ok, text }，或 { dialog }。
//                    不写的话：有「检定」就掷检定，成功生效「效果」、失败生效「失败效果」，文字是「行动文本」里的 <id>.ok / <id>.fail；
//                    没有检定就直接生效「效果」，文字是 <id>.done
//   ok(x) / fail(x)  有检定、成功或失败时要多做点事。写了它，对应的效果列就不会自动生效（要的话在里面调 x.fx() / x.failFx()）
// 脚本拿到的 x：{ S 状态, p 参数, a 表里这一行, T(键, 变量) 取「行动文本」里的一段话, fx(额外效果?) / failFx(额外效果?) 让效果列生效 }
import * as G from './engine.js';
import { DATA_SOURCES, FEATURES, FEAT, OFFICES, MAX_OFFICE, officeName, floorsOf, STAGES, INVESTORS, INVESTORS_EAST, INVESTORS_PROGRESSIVE, EAST_RIVALS, INVEST_RIVALS, ROSE_RIVALS, ROLES, DIRT, AGI_CAP, P } from '../data/defs.js';
import { TAB_ROWS, ACTION_ROWS, RAISE_OFFERS, ACT_TEXT } from '../data/actions.js';
import * as IDEO from './ideology.js';

const { rnd, rf, pick, money, fmtUsers, mod, power, unit, applyFx, addDirt, news, optCheck, clamp, pCheck, rollCheck, cond } = G;
const pct = (S, attr, dc) => Math.round(pCheck(S, attr, dc) * 100);
const LAST_ROUND = STAGES.length - 2;                                  // 最后一轮融资（再往后就是上市）
const bay = S => S.co.region === 'bay';
const fill = (s, v) => String(s).replace(/\{([^{}\s]+)\}/g, (m, k) => (v && k in v ? v[k] : m));
// 取「行动文本」里的一段话。同一个键有几句的，执行行动时随机挑一句；按钮上的说明、点不了的原因这类每帧都在画的，固定用第一句（不能动随机数）
function say(S, key, vars, random = false) {
  const list = ACT_TEXT[key];
  if (!list) throw new Error(`「行动文本」表里没有「${key}」`);
  const e = random && list.length > 1 ? pick(S, list) : list[0];
  return fill(bay(S) && e.bay != null ? e.bay : e.text, vars);
}
export const TABS = TAB_ROWS;

// ───────── 研发 ─────────
const codeGain = (S, p) => (p.基础 + S.founder.attrs.tech * p.每点技术) * Math.max(p.最低比例, 1 - S.quality / G.qCeil(S));     // 越接近模型天花板越难再提升

// 发布模型：先定跑分怎么报，再定怎么发
function launch(x, cap, infl, dirt, vol, costK, repK) {
  const { S, p, T } = x;
  S.cash -= costK * unit(S);
  const ver = (S.model?.ver || 0) + 1, bonus = mod(S, 'benchAdd');
  S.model = { cap, bench: cap + infl + bonus, ver, name: `${S.co.modelName}-${ver}`, infl };
  if (dirt) addDirt(S, dirt);
  S.lastReleaseT = S.t;
  const rk = G.rank(S);
  applyFx(S, { hype: p.名次热度[rk - 1] * vol, usersPct: (p.名次用户基数 - rk) * p.每名次用户 * vol, rep: (infl === 0 && rk <= p.前排 ? p.老实加口碑 : 0) + repK });
  S.fxq.push(['release']);                                              // 丹炉开盖、金光出炉（经典版场景没有这个特效，会直接忽略）
  if (rk <= p.撒花名次) S.fxq.push(['confetti']);
  news(S, T('release.news', { 公司: S.co.name, 模型: S.model.name, 跑分: S.model.bench.toFixed(1), 名次: rk }));
  if (cap >= AGI_CAP) S.q.push({ type: 'event', id: 'agi' });
  const tail = T(infl > p.多注水线 ? 'release.tail.heavy' : infl > 0 ? 'release.tail.light' : 'release.tail.honest');
  return { text: T(rk === 1 ? 'release.done.top1' : rk <= p.前排 ? 'release.done.top3' : 'release.done.other', { 模型: S.model.name, 名次: rk }) + tail };
}
function releaseDialog(x) {
  const { S, p, T } = x;
  const cap = G.myCap(S) + rf(S, p.能力波动下限, p.能力波动上限) + (S.founder.attrs.luck - 5) * p.每点运气, top = Math.max(...S.rivals.map(r => r.bench)), bonus = mod(S, 'benchAdd');
  const step2 = (infl, dirt) => ({
    dialog: {
      kind: 'event', cat: 'tech', icon: T('release.launch.icon'), art: T('release.launch.art'), title: T('release.launch.title'),
      text: T('release.launch.text', { 跑分: (cap + infl + bonus).toFixed(1), 榜首: top.toFixed(1) }),
      options: [
        { label: T('release.quiet'), hint: T('release.quiet.hint', { 声量: p.低调声量 }), go: () => launch(x, cap, infl, dirt, p.低调声量, 0, 0) },
        { label: T('release.event'), hint: T('release.event.hint', { 花费: money(S, p.发布会花费 * unit(S)), 声量: p.发布会声量 }), disabled: S.cash < p.发布会花费 * unit(S), why: T('common.noCash'), go: () => launch(x, cap, infl, dirt, p.发布会声量, p.发布会花费, 0) },
        { label: T('release.hungry'), hint: T('release.hungry.hint', { 声量: p.饥饿声量, 口碑: p.饥饿口碑 }), go: () => launch(x, cap, infl, dirt, p.饥饿声量, 0, p.饥饿口碑) },
      ],
    },
  });
  return {
    dialog: {
      kind: 'event', cat: 'tech', icon: T('release.bench.icon'), art: T('release.bench.art'), title: T('release.bench.title'),
      text: T('release.bench.text', { 能力: cap.toFixed(1), 现役: S.model ? S.model.cap.toFixed(1) : T('release.none'), 榜首: top.toFixed(1) }),
      options: [
        { label: T('release.honest'), hint: T('release.honest.hint'), go: () => step2(0, null) },
        { label: T('release.tune'), hint: T('release.tune.hint'), go: () => step2(rf(S, p.小注水下限, p.小注水上限), 'bench_overfit') },
        { label: T('release.leak'), hint: T('release.leak.hint'), go: () => step2(rf(S, p.大注水下限, p.大注水上限), 'bench_fake') },
      ],
    },
  };
}

// ───────── 资本：三份 term sheet ─────────
function closeRound(x, val, share, who) {
  const { S, T } = x;
  const cash = val * share;
  (S.stats.rounds ??= []).push(S.t);
  S.cash += cash; S.equity *= 1 - share; S.stage++; S.lastRaiseT = S.t; S.raiseBoost = 0; S.stats.raised += cash;
  x.fx();
  S.q.push({ type: 'draft' }); S.fxq.push(['money']);
  news(S, T('raise.news', { 公司: S.co.name, 轮次: STAGES[S.stage].name, 机构: who, 金额: money(S, cash), 估值: money(S, val) }));
  return T('raise.done', { 轮次: STAGES[S.stage].name, 金额: money(S, cash) });
}
function raiseDialog(x) {
  const { S, p, T } = x;
  const k = S.stage + 1, val0 = G.valuation(S), pf = G.perf(S), winter = S.burstT && S.t - S.burstT < p.寒冬月数, red = !!S.flags.red;
  if (pf < p.失败线 || (winter && rnd(S) < p.寒冬失败率)) {
    S.lastRaiseT = S.t - (p.间隔 - p.失败后再等);
    return { ok: false, text: T(winter ? 'raise.fail.winter' : 'raise.fail.weak') };
  }
  // 红色公司：美元基金不再和你谈，只剩人民币基金和国家队；「共享繁荣」：主流 VC 也不接电话了
  const rose = !!S.flags.rose, vcs = red ? INVESTORS_EAST : rose ? INVESTORS_PROGRESSIVE : INVESTORS;
  const now = S.users + S.fake, target = Math.max(now * p.对赌倍数, STAGES[Math.min(STAGES.length - 1, k + 1)].users * p.对赌下限);
  const rv = pick(S, S.rivals.filter(r => (red ? EAST_RIVALS : rose ? ROSE_RIVALS : INVEST_RIVALS).includes(r.id)));
  const offer = o => {
    const v = { 对手: rv.name };
    if (o.label.includes('{机构}')) v.机构 = pick(S, vcs);
    const name = fill(o.label, v), note = o.note != null ? fill(o.note, { 目标: fmtUsers(target) }) : '';
    const hv = { 估值: money(S, val0 * o.vk), 出让: Math.round(o.share * 100), 到账: money(S, val0 * o.vk * o.share), 备注: note };
    return {
      label: name, hint: T(note ? 'raise.hint.note' : 'raise.hint', hv),
      go: () => {
        if (o.fn === 'vam') S.vam = { due: S.t + o.p.期限, target };
        applyFx(S, o.fx, { rival: rv.id });
        return { text: closeRound(x, val0 * o.vk, o.share, name.split('：')[0]) };
      },
    };
  };
  const rows = RAISE_OFFERS.filter(o => cond(S, o.when));
  if (pf < p.流血线) return { dialog: { kind: 'event', cat: 'money', icon: T('raise.weak.icon'), art: T('raise.weak.art'), title: T('raise.weak.title', { 轮次: STAGES[k].name }), text: T('raise.weak.text', { 业绩: pf.toFixed(2) }), options: [offer(rows.find(o => o.kind === '流血'))] } };
  const offers = [offer(rows.find(o => o.kind === '固定'))], pool = rows.filter(o => o.kind === '随机');
  while (offers.length < p.报价份数 && pool.length) offers.push(offer(pool.splice(Math.floor(rnd(S) * pool.length), 1)[0]));
  return { dialog: { kind: 'event', cat: 'money', icon: T('raise.offers.icon'), art: T('raise.offers.art'), title: T('raise.offers.title', { 轮次: STAGES[k].name }), text: T('raise.offers.text', { 估值: money(S, val0), 业绩: pf.toFixed(2) }), options: offers } };
}
const courseIncome = (S, p) => (p.基础 + S.users * p.每万用户 + S.hype) * (1 + p.每点商业 * (S.founder.attrs.biz - 5));
const adsGain = (S, p) => Math.max(p.用户最少, S.users * p.用户比例) * mod(S, 'growthMult') ** 0.5 * (p.体验基础 + S.quality / p.体验除数);
const worstDirt = S => S.dirt.slice().sort((a, b) => b.sev - a.sev)[0];

// ───────── 每个行动的脚本 ─────────
const HOOKS = {
  // ── 研发 ──
  code: {
    vars: ({ S, p, T }) => ({ 体验: codeGain(S, p).toFixed(1), 天花板: G.qCeil(S).toFixed(0), 丹炉: S.ownModel ? T('code.furnace') : '' }),
    run: x => {
      const { S, p } = x;
      S.quality = clamp(S.quality + codeGain(S, p), 0, 100);
      if (S.ownModel && S.furnace?.on) S.E += Math.max(p.丹炉最少, Math.max(0, S.gpu - G.inferNeed(S)) * G.researchEff(S) * DATA_SOURCES[S.furnace.data].mult * p.丹炉月份);
      return x.T('code.done');
    },
  },
  release: {
    show: ({ S }) => S.ownModel,
    vars: ({ S, T }) => ({ 火候: G.myCap(S).toFixed(1), 现役: S.model ? S.model.cap.toFixed(1) : T('release.none') }),
    block: ({ S, p, T }) => (G.myCap(S) - (S.model?.cap ?? 0) < p.火候门槛 ? T('release.block', { 门槛: p.火候门槛 }) : null),
    run: releaseDialog,
  },
  furnace: {
    show: ({ S }) => S.ownModel,
    vars: ({ S }) => ({ 数据: DATA_SOURCES[S.furnace?.data || 'open'].name }),
    run: ({ S, T }) => ({
      dialog: {
        kind: 'event', cat: 'tech', icon: T('furnace.icon'), art: T('furnace.art'), title: T('furnace.title'), text: T('furnace.text'),
        options: Object.entries(DATA_SOURCES).map(([k, d]) => ({
          label: d.dirt ? T('furnace.dirty', { 名称: d.name }) : d.name, hint: d.desc, disabled: S.furnace?.data === k, why: T('furnace.inUse'),
          go: () => { S.furnace = { on: true, data: k, months: 0 }; if (d.dirt) addDirt(S, d.dirt); return { text: T('furnace.done.' + k) }; },
        })),
      },
    }),
  },
  selfdev: {
    show: ({ S }) => !S.ownModel,
    cost: ({ S, p }) => Math.max(p.最少, p.月数 * unit(S)),
    block: ({ S, p, T }) => (S.stage < p.轮次 ? T('selfdev.block', { 轮次: STAGES[p.轮次].name }) : null),
    run: ({ S, T }) => { S.ownModel = true; S.E = 0; S.furnace = { on: true, data: 'open', months: 0 }; news(S, T('selfdev.news')); return T('selfdev.done'); },
  },
  sprint: {
    desc: ({ S, T }) => (S.sprint ? T('sprint.busy', { 功能: FEAT[S.sprint.id].name, 进度: Math.round(S.sprint.done / S.sprint.need * 100) }) : undefined),
    block: ({ S, T }) => (S.sprint ? T('sprint.blockBusy') : FEATURES.every(f => S.feats.includes(f.id)) ? T('sprint.allDone') : null),
    run: ({ S, p, T }) => {
      const pool = FEATURES.filter(f => !S.feats.includes(f.id)), picks = [];
      while (picks.length < p.选几个 && pool.length) picks.push(pool.splice(Math.floor(rnd(S) * pool.length), 1)[0]);
      const k = 1 + p.每个已有功能加难 * S.feats.length, E = Math.max(1, power(S, 'eng') * mod(S, 'devMult'));
      return {
        dialog: {
          kind: 'cards', cat: 'tech', icon: T('sprint.icon'), title: T('sprint.title'), text: T('sprint.text'),
          options: picks.map(f => ({ label: f.name, card: { icon: f.icon, name: f.name, desc: T('sprint.card', { 说明: f.desc, 月: Math.max(1, Math.ceil(f.need * k / E)) }), r: 1 }, go: () => { S.sprint = { id: f.id, need: f.need * k, done: 0 }; return { text: T('sprint.done', { 功能: f.name }) }; } })),
        },
      };
    },
  },
  paper: {
    show: ({ S }) => S.ownModel,
    run: x => { x.fx(); for (const r of x.S.rivals) r.drift += x.p.对手进步; return x.T('paper.done'); },
  },
  // ── 团队 ──
  headhunt: {
    cost: ({ S, p }) => Math.max(p.最少, p.月数 * unit(S)),
    run: ({ S, p, T }) => { G.refreshCands(S, p.候选人加成); return T('headhunt.done'); },
  },
  teambuild: {
    cost: ({ S, p }) => Math.max(p.最少, p.月数 * unit(S)),
    vars: ({ S, p }) => ({ 士气: p.士气 + Math.round(S.founder.attrs.mgmt / p.每几点管理加一) }),
    run: x => { x.fx({ morale: x.p.士气 + Math.round(x.S.founder.attrs.mgmt / x.p.每几点管理加一) }); return x.T('teambuild.done'); },
  },
  office: {
    cost: ({ S }) => (S.co.office < MAX_OFFICE ? OFFICES[S.co.office + 1].up * mod(S, 'rentMult') : 0),
    desc: ({ S, T }) => (S.co.office >= MAX_OFFICE ? T('office.top', { 办公室: officeName(S, MAX_OFFICE) }) : undefined),
    vars: ({ S, T }) => {
      const nx = S.co.office + 1, fl = floorsOf(nx);
      return { 办公室: officeName(S, nx), 楼层: fl ? T('office.floors', { 层数: fl.length, 分法: T(nx === MAX_OFFICE ? 'office.floors.top' : 'office.floors.split') }) : '', 人数: OFFICES[nx].cap, 月租: money(S, OFFICES[nx].rent * mod(S, 'rentMult')) };
    },
    block: ({ S, T }) => (S.co.office >= MAX_OFFICE ? T('office.block') : null),
    run: x => {
      const { S, T } = x;
      S.co.office++; x.fx(); S.fxq.push(['levelup']); news(S, T('office.news', { 公司: S.co.name, 办公室: officeName(S) }));
      return floorsOf(S.co.office) ? T('office.done.tower', { 分法: T(S.co.office === MAX_OFFICE ? 'office.done.top' : 'office.done.split') }) : T('office.done', { 办公室: officeName(S) });
    },
  },
  // ── 资本 ──
  raise: {
    desc: ({ S, T }) => (S.stage >= LAST_ROUND ? T('raise.top', { 轮次: STAGES[LAST_ROUND].name }) : undefined),
    vars: ({ S }) => ({ 轮次: STAGES[S.stage + 1].name, 估值: money(S, G.valuation(S)) }),
    block: ({ S, p, T }) => (S.stage >= LAST_ROUND ? T('raise.ipo') : S.t - S.lastRaiseT < p.间隔 ? T('raise.wait', { 月: p.间隔 - (S.t - S.lastRaiseT) }) : null),
    run: raiseDialog,
  },
  roadshow: {
    vars: ({ S }) => ({ 累计: Math.round(S.raiseBoost * 100) }),
    block: ({ S, p, T }) => (S.stage >= LAST_ROUND ? T('roadshow.noRound') : S.raiseBoost >= p.上限 ? T('roadshow.max') : null),
    ok: ({ S, p }) => { S.raiseBoost += p.成功加成; },
    fail: ({ S, p }) => { S.raiseBoost += p.失败加成; },
  },
  ipo: {
    show: ({ S, p }) => S.stage >= p.显示轮次,
    vars: ({ S, p }) => ({ 轮次: STAGES[LAST_ROUND].name, 盈利: S.streak.profit, 门槛: p.业绩线.toFixed(1), 业绩: G.perf(S).toFixed(2) }),
    block: ({ S, p, T }) => (S.stage < LAST_ROUND ? T('ipo.needRound', { 轮次: STAGES[LAST_ROUND].name }) : S.streak.profit < p.盈利月数 ? T('ipo.needProfit', { 月: p.盈利月数 }) : G.perf(S) < p.业绩线 ? T('ipo.needPerf', { 业绩: G.perf(S).toFixed(2), 门槛: p.业绩线.toFixed(1) }) : null),
    run: x => {
      const { S, p, T } = x;
      const L = power(S, 'legal'), found = S.dirt.filter(d => rnd(S) < Math.min(p.最高查出率, d.sev * p.每点严重度 / (1 + L / p.法务除数))), crime = found.filter(d => DIRT[d.type]?.crime);
      if (crime.length) {
        for (const d of crime.slice(0, p.最多引爆)) S.q.push({ type: 'scandal', uid: d.uid });
        x.failFx();
        return { ok: false, text: T('ipo.fail', { 黑料: crime.map(d => d.name).join('」「') }) };
      }
      G.endGame(S, 'ipo');
      return { ok: true, text: found.length ? T('ipo.found', { 黑料: found[0].name }) : T('ipo.clean') };
    },
  },
  sellcourse: {
    vars: ({ S, p }) => ({ 进账: money(S, courseIncome(S, p)) }),
    run: x => { x.S.cash += courseIncome(x.S, x.p); x.fx(); return x.T('sellcourse.done'); },
  },
  subsidy: {
    vars: ({ S, p }) => ({ 补贴: money(S, Math.max(p.最少, p.月数 * unit(S))) }),
    ok: ({ S, p }) => { S.cash += Math.max(p.最少, p.月数 * unit(S)); },
  },
  lobby: {
    cost: ({ S, p }) => p.月数 * unit(S),
    vars: ({ S, p }) => ({ 监管: Math.round(p.基础 + S.founder.attrs.net * p.每点人脉) }),
    run: x => { x.fx({ reg: -(x.p.基础 + x.S.founder.attrs.net * x.p.每点人脉) }); return x.T('lobby.done'); },
  },
  // ── 公关 ──
  hype: {
    vars: ({ S, p }) => ({ 热度: Math.round((p.基础 + S.founder.attrs.cha * p.每点口才) * mod(S, 'hypeGainMult')) }),
    run: x => { x.fx({ hype: x.p.基础 + x.S.founder.attrs.cha * x.p.每点口才 }); return x.T('hype.done'); },
  },
  ads: {
    cost: ({ S, p }) => Math.max(p.花费最少, p.月数 * unit(S)),
    vars: ({ S, p }) => ({ 用户: fmtUsers(adsGain(S, p)) }),
    run: ({ S, p, T }) => { S.users += adsGain(S, p); return T('ads.done'); },
  },
  goodpr: { cost: ({ S, p }) => p.月数 * unit(S) },
  navy: { cost: ({ S, p }) => p.月数 * unit(S) },
  fakeusers: {
    cost: ({ S, p }) => p.月数 * unit(S),
    vars: ({ S, p }) => ({ 用户: fmtUsers(Math.max(p.最少, S.users * p.比例)) }),
    run: x => { x.S.fake += Math.max(x.p.最少, x.S.users * x.p.比例); x.fx(); return x.T('fakeusers.done'); },
  },
  wash: {
    block: ({ S, T }) => (S.dirt.length ? null : T('wash.empty')),
    run: ({ S, p, a, T }) => ({
      dialog: {
        kind: 'event', cat: 'dirt', icon: T('wash.icon'), art: T('wash.art'), title: T('wash.title'), text: T('wash.text'),
        options: S.dirt.slice().sort((x, y) => y.sev - x.sev).slice(0, p.最多几张).map(d => {
          const fee = unit(S) * d.sev / p.费用除数;
          const o = optCheck(S, d.name, T('wash.hint', { 严重度: Math.round(d.sev), 花费: money(S, fee) }), a.check.attr, a.check.dc + d.sev / p.难度除数,
            () => { G.removeDirt(S, d.uid); return T('wash.ok', { 黑料: d.name }); },
            () => { d.sev += p.失败加重; return T('wash.fail', { 黑料: d.name }); },
            () => { S.cash -= fee; });
          if (S.cash < fee) { o.disabled = true; o.why = T('common.noCash'); }
          return o;
        }),
      },
    }),
  },
  digdirt: {
    cost: ({ S, p }) => p.月数 * unit(S),
    run: ({ S, p, a, T }) => ({
      dialog: {
        kind: 'event', cat: 'rival', icon: T('digdirt.icon'), art: T('digdirt.art'), title: T('digdirt.title'), text: T('digdirt.text'),
        options: S.rivals.slice().sort((x, y) => y.bench - x.bench).slice(0, p.最多几家).map(r => optCheck(S, r.name, T('digdirt.hint', { 老板: r.boss, 跑分: r.bench.toFixed(1) }), a.check.attr, r.cheat >= p.注水线 ? p.注水难度 : a.check.dc,
          () => { r.bench -= p.对手跑分; applyFx(S, a.fx, { rival: r.id }); return T('digdirt.ok', { 对手: r.name, 模型: r.model, 老板: r.boss }); },
          () => { applyFx(S, a.failFx, { rival: r.id }); return T('digdirt.fail', { 对手: r.name, 老板: r.boss }); })),
      },
    }),
  },
  // ── 经营 ──
  beg: { show: ({ S }) => S.ownModel },
  sweep: { show: ({ S }) => S.ownModel, cost: ({ S, p }) => G.quota(S) * G.gpuPrice(S) * p.倍数 },
  // ── 意识形态：开局什么都没有；国资（深圳）或公地资本（湾区）入股后走完「路线之争」才会解锁 ──
  // 两地玩法一样；「湾区名称」「湾区描述」「湾区文本」是湾区的叫法
  // 左翼路线（深圳：红色路线；湾区：共享繁荣）
  mobilize: {
    show: ({ S }) => IDEO.isRed(S),
    run: ({ S, p }) => { S.hype = clamp(S.hype + p.热度, 0, 100); S.bubble = clamp(S.bubble + p.泡沫, 0, 100); S.morale = clamp(S.morale + p.士气, 0, 100); return IDEO.actText(S, 'mobilize', G); },
  },
  utopia: {
    show: ({ S }) => IDEO.isRed(S) && !S.flags.utopia_on,
    cost: ({ p }) => p.花费,
    run: ({ S }) => { S.flags.utopia_on = 1; G.queueEvent(S, IDEO.chainStart(S, 'utopia')); news(S, IDEO.vtext(S).utopia.replace('{co}', S.co.name)); return IDEO.actText(S, 'utopia', G); },
  },
  selfcrit: {
    show: ({ S }) => IDEO.isRed(S),
    block: ({ S, T }) => (S.dirt.length ? null : T('selfcrit.empty')),
    desc: ({ S, T }) => (worstDirt(S) ? undefined : T('selfcrit.noDirt')),
    vars: ({ S, p }) => { const d = worstDirt(S); return { 黑料: d.name, 士气: Math.round(p.士气基础 + d.sev / p.每几点严重度) }; },
    run: x => {
      const { S, p, T } = x, d = worstDirt(S);
      G.removeDirt(S, d.uid); x.fx({ morale: -(p.士气基础 + d.sev / p.每几点严重度) });
      return T('selfcrit.done', { 黑料: d.name, 文案: IDEO.actText(S, 'selfcrit', G) });
    },
  },
  subbotnik: {
    show: ({ S }) => IDEO.isRed(S),
    desc: ({ S, T }) => (S.sprint ? T('subbotnik.sprint', { 功能: FEAT[S.sprint.id].name }) : undefined),
    run: x => {
      const { S, p } = x;
      if (S.sprint) S.sprint.done = Math.min(S.sprint.need, S.sprint.done + S.sprint.need * p.进度); else S.quality = clamp(S.quality + p.体验, 0, 100);
      x.fx(); return IDEO.actText(S, 'subbotnik', G);
    },
  },
  plan: {
    show: ({ S }) => IDEO.isRed(S),
    block: ({ S, T }) => (S.ideo?.plan ? T('plan.busy', { 日期: G.dateStr(S.ideo.plan.due) }) : null),
    run: ({ S }) => IDEO.planDialog(S, G),
  },
  // 资本路线（深圳：警惕乌托邦；湾区：我们是一家公司）
  yank: { show: ({ S }) => IDEO.isCap(S) && !S.flags.yank, run: ({ S }) => IDEO.yankDialog(S, G) },
  bci: {
    show: ({ S }) => IDEO.isCap(S) && !S.flags.bci_on,
    cost: ({ S, p }) => Math.max(p.最少, p.月数 * unit(S)),
    vars: ({ S, T }) => ({ 用途: T(S.ownModel ? 'bci.use.model' : 'bci.use.app') }),
    run: x => { const { S } = x; S.flags.bci_on = 1; x.fx(); G.queueEvent(S, IDEO.chainStart(S, 'bci')); news(S, IDEO.vtext(S).bci); return IDEO.actText(S, 'bci', G); },
  },
  buyback: {
    show: ({ S }) => IDEO.isCap(S),
    cost: ({ S, p }) => G.valuation(S) * p.比例,
    block: ({ S, p, T }) => (S.equity >= p.上限 ? T('buyback.full') : null),
    run: x => { x.fx(); return IDEO.actText(x.S, 'buyback', G); },
  },
  costcut: { show: ({ S }) => IDEO.isCap(S), run: x => { x.fx(); return IDEO.actText(x.S, 'costcut', G); } },
  spinoff: {
    show: ({ S }) => IDEO.isCap(S) && !S.flags.spinoff,
    block: ({ S, p, T }) => (S.stage < p.轮次 ? T('spinoff.block', { 轮次: STAGES[p.轮次].name }) : null),
    vars: ({ S, p }) => ({ 到账: money(S, G.valuation(S) * p.比例) }),
    run: x => { const { S, p } = x; S.flags.spinoff = 1; S.cash += G.valuation(S) * p.比例; x.fx(); S.fxq.push(['money']); return IDEO.actText(S, 'spinoff', G); },
  },
};

// 表里的一行 + 脚本 → 界面和引擎认识的行动
function build(row) {
  const H = HOOKS[row.id] || {}, p = row.p || {};
  const ctx = (S, random) => ({
    S, p, a: row,
    T: (key, vars) => say(S, key, vars, random),
    fx: extra => applyFx(S, extra ? { ...extra, ...row.fx } : row.fx),
    failFx: extra => applyFx(S, extra ? { ...extra, ...row.failFx } : row.failFx),
  });
  const a = { id: row.id, tab: row.tab, name: row.name, icon: row.icon, ap: row.ap, p };
  if (row.us != null) a.us = row.us;
  if (row.cd) a.cd = row.cd;
  if (row.shady) a.shady = true;
  if (row.region || H.show) a.show = S => (!row.region || S.co.region === row.region) && (!H.show || !!H.show(ctx(S)));
  if (H.cost) a.cost = S => H.cost(ctx(S));
  if (H.block) a.block = S => H.block(ctx(S)) || null;
  a.desc = S => {
    const x = ctx(S), own = H.desc?.(x);
    if (own != null) return own;
    const v = { ...p };
    if (row.check) v.成功率 = pct(S, row.check.attr, row.check.dc);
    return fill((bay(S) && row.descBay != null ? row.descBay : row.desc) ?? '', H.vars ? { ...v, ...H.vars(x) } : v);
  };
  a.run = S => {
    const x = ctx(S, true);
    if (H.run) return H.run(x);
    if (row.check) {
      const ok = rollCheck(S, row.check.attr, row.check.dc);
      if (ok) { if (H.ok) H.ok(x); else x.fx(); } else if (H.fail) H.fail(x); else x.failFx();
      return { ok, text: x.T(`${row.id}.${ok ? 'ok' : 'fail'}`) };
    }
    x.fx();
    return x.T(`${row.id}.done`);
  };
  return a;
}
for (const id in HOOKS) if (!ACTION_ROWS.some(r => r.id === id)) throw new Error(`代码里有行动「${id}」的脚本，但 tables/行动.xlsx 的「行动」表里没有这一行`);
export const ACTIONS = ACTION_ROWS.map(build);
// 行动的名字：湾区版有些行动换了叫法（玩法一样）
export const actName = (S, a) => (a.us && S && bay(S) ? a.us : a.name);
export const ACT = Object.fromEntries(ACTIONS.map(a => [a.id, a]));

// 某个行动现在能不能点、要花多少钱
export function actionState(S, a) {
  const cost = a.cost ? a.cost(S) : 0;
  const why = S.ap < a.ap ? say(S, 'common.noAp') : S.cd[a.id] ? say(S, 'common.cooldown', { 月: S.cd[a.id] - S.t }) : cost > S.cash ? say(S, 'common.noCash') : a.block?.(S) || null;
  return { cost, why };
}
// 执行行动：返回 { text, chips } 或 { dialog }。弹出的子对话框在真正选定之后才扣行动点
export function perform(S, id) {
  const a = ACT[id], st = actionState(S, a);
  if (st.why) return null;
  let paid = false;
  const commit = () => { if (paid) return; paid = true; S.ap -= a.ap; S.cash -= st.cost; if (a.cd) S.cd[a.id] = S.t + a.cd; };
  return G.measure(S, () => {
    const r = a.run(S);
    if (r?.dialog) {
      r.dialog.closable = true;
      r.dialog.options = r.dialog.options.map(o => ({ ...o, go: () => { if (!o.free) commit(); return o.go(); } }));   // free：「算了」这类选项不扣行动点
      return r;
    }
    commit();
    return typeof r === 'string' ? { text: r } : r;
  });
}

export function hire(S, uid) {
  const i = S.cands.findIndex(c => c.uid === uid);
  if (i < 0) return null;
  const c = S.cands[i], fee = c.salary * mod(S, 'salaryMult');
  if (S.ap < 1) return { err: say(S, 'common.noAp') };
  if (S.staff.length >= G.teamCap(S)) return { err: say(S, 'hire.full') };
  if (S.cash < fee) return { err: say(S, 'hire.noFee') };
  return G.measure(S, () => { S.ap--; S.cash -= fee; S.cands.splice(i, 1); c.since = S.t; G.addStaff(S, c); return { text: say(S, 'hire.done', { 名字: c.name, 岗位: ROLES[c.role].name, 能力: c.skill }, true) }; });
}
export function fire(S, uid) {
  const e = S.staff.find(x => x.uid === uid);
  if (!e) return null;
  IDEO.noteFire(S);
  return G.measure(S, () => {
    S.cash -= P['fire.payMonths'] * e.salary * mod(S, 'salaryMult'); G.removeStaff(S, uid); applyFx(S, { morale: e.skill >= P['fire.starSkill'] ? P['fire.starMorale'] : P['fire.morale'] });
    return { text: say(S, 'fire.done', { 名字: e.name }, true) };
  });
}
export function setGpu(S, n) { S.gpu = Math.max(0, Math.round(n) || 0); }          // 没有硬上限：超出配额的按现货价租（见 G.gpuRent）
export function setPolicy(S, k, v) {
  if (String(S.policies[k]) === String(v)) return;
  S.policies[k] = v;
  if (k === 'work') applyFx(S, { morale: String(v) === '996' ? P['policy.work996Morale'] : P['policy.work965Morale'] });
}

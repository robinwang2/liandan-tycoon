// 核心事件：由引擎按规则触发（weight 0 = 不进随机池）。
// 文字和数字都在 tables/事件.xlsx 里：「系统事件」（标题、正文、参数）、「系统选项」（选项、提示、检定、结果、效果、参数）、
// 「系统文本」（正文里按局势换着用的几段话）。这里只有表格写不出来的逻辑，按事件 id 和选项的「脚本」名对上。
// 写法见 src/game/scripted.js。
import { localize } from '../i18n/tables.js';
import T from './tables/events.json' with { type: 'json' };
import { officeName, fillRec } from './defs.js';
import { bindEvents } from '../game/scripted.js';

// ── Chepole 连环：拒绝一次，接下来连问三个回合；全拒 → 长发眼镜男 ──
const chepoleAsk = { vars: ({ S, T }) => ({ 同事们: T(S.staff.length ? 'chepole.who.staff' : 'chepole.who.alone') }) };

// 账上没钱了：把现金补到「至少 n 个月支出」。「一个月支出」按弹窗那一刻算（裁完人再算就少了）
const fill = (x, n) => { x.S.cash = Math.max(0, x.S.cash) + n * x.v.月支出; };
// 董事会突袭：员工挺不挺你，看士气
const rally = (x, reward) => {
  const { S, G, ep, T } = x;
  if (S.morale >= ep.士气线) { G.award(S, 'comeback'); reward(); return T('coup.rally.ok'); }
  G.endGame(S, 'ousted'); return T('coup.rally.fail');
};
// 收购：按报价的 k 倍成交
const sell = (x, k) => { const { S, c, G } = x; G.endGame(S, 'acquired', { pay: c.offer * k * S.equity / 100 }); };

const HOOKS = {
  intro: { vars: ({ S, T }) => ({ 办公室: officeName(S), 开场白: T(S.tut?.on ? 'intro.tut' : 'intro.plain') }) },
  chepole_1: chepoleAsk, chepole_2: chepoleAsk, chepole_3: chepoleAsk,
  chepole_4: { ...chepoleAsk, opts: { never: { after: ({ S, G }) => { S.q.unshift({ type: 'event', id: 'chepole_never' }); G.award(S, 'chepole'); } } } },

  // ── 皮衣教主「出轨」传闻（纯属恶搞：他背叛的是那件皮衣）──
  leather_rumor: { opts: { support: { after: ({ S, G }) => { G.award(S, 'leather'); } } } },

  // ── 系统事件 ──
  year_board: { vars: ({ S, T }) => ({ 与会者: T(S.stage ? 'year_board.board' : 'year_board.alone') }) },
  broke: {
    vars: ({ S, G, T }) => ({ 现金: G.money(S, S.cash), 旧账: S.flags.loaned ? T('broke.loaned') : '', 月支出: G.unit(S) }),
    opts: {
      loan: { run: x => { const { S, p } = x; fill(x, p.到账); S.flags.loaned = 1; S.sched.push({ id: 'debt_due', at: S.t + p.期限 }); } },
      beg: { show: ({ S, p }) => S.equity > p.股权高于 && !S.flags.begged, run: x => { const { S, p } = x; fill(x, p.到账); S.equity -= p.让出股权; S.flags.begged = 1; } },
      layoff: { run: x => { const { S, G, p } = x, n = Math.ceil(S.staff.length / 2); for (let i = 0; i < n; i++) G.removeStaff(S, G.pick(S, S.staff).uid); fill(x, p.到账); x.fx(); return { vars: { n } }; } },
    },
  },
  bubble_burst: {
    enter: ({ S, G, p, T }) => {
      if (G.runway(S) < p.裸泳线) S.flags.nakedSwim = 1;
      S.bubble = p.泡沫降到; S.burstT = S.t; S.hype *= p.热度保留; S.flags.winter = 1;
      S.temp.push({ key: 'raiseMult', mult: p.融资估值, until: S.t + p.寒冬月数 });
      for (const r of S.rivals) r.hype *= p.对手热度保留;
      G.news(S, T('bubble_burst.news'));
    },
  },
  crackdown: {
    opts: {
      comply: { run: x => { x.fx(); x.S.reg = x.p.监管设为; } },
      bribe: { ok: x => { x.S.reg = x.p.监管设为; x.fx(); }, fail: x => { x.failFx(); x.S.reg = x.p.失败监管设为; } },
      fight: { ok: x => { x.S.reg = x.p.监管设为; x.fx(); } },
    },
  },
  coup: {
    vars: ({ S, ep, T }) => ({ 员工态度: T(S.morale >= ep.士气线 ? 'coup.hint.hi' : 'coup.hint.lo') }),
    opts: {
      showdown: { fail: x => ({ vars: { 员工的反应: rally(x, () => x.failFx()) } }) },
      rally: { run: x => ({ vars: { 员工的反应: rally(x, () => x.fx()) } }) },
    },
  },
  acq_offer: {
    vars: ({ S, c, G, p }) => {
      c.offer = G.valuation(S) * G.rf(S, p.报价下限, p.报价上限);
      return { 报价: G.money(S, c.offer), 到手: G.money(S, c.offer * S.equity / 100) };
    },
    opts: {
      sell: { run: x => sell(x, 1) },
      raise: { ok: x => sell(x, x.p.抬价倍数) },
    },
  },
  vam_due: {
    vars: ({ S, c, G, p, T }) => {
      c.target = S.vam.target; c.now = S.users + S.fake; c.met = c.now >= c.target;
      return { 目标: G.fmtUsers(c.target), 现在: G.fmtUsers(c.now), 投资人反应: T(c.met ? 'vam_due.met' : 'vam_due.miss'), 惩罚: Math.max(p.最少惩罚, Math.round(p.惩罚股权 * G.mod(S, 'vamMult'))) };
    },
    opts: {
      met: { show: ({ c }) => c.met, run: x => { x.S.vam = null; x.fx(); } },
      pay: { show: ({ c }) => !c.met, run: x => { x.S.vam = null; x.fx({ equity: -x.v.惩罚 }); } },
      fake: { show: ({ c }) => !c.met, run: x => { const { S, c } = x; S.vam = null; S.fake += c.target - c.now; x.fx(); } },
      delay: { show: ({ c }) => !c.met, ok: x => { x.S.vam.due = x.S.t + x.p.延期; }, fail: x => { x.S.vam = null; x.failFx({ equity: -(x.v.惩罚 + x.p.加罚) }); } },
    },
  },
  probe: {
    opts: {
      coop: { dc: ({ S, G, p }, dc) => dc - Math.min(p.最多减, G.power(S, 'legal') / p.每几点法务减一), ok: x => { x.S.exposedCrime = x.p.涉案降到; x.fx(); } },
    },
  },
  agi: {
    opts: {
      safe: { show: ({ S }) => S.policies.safety === 'strict' || S.flags.aligned },
      risky: { show: ({ S }) => !(S.policies.safety === 'strict' || S.flags.aligned), odds: ({ S, p }, odds) => (S.policies.safety === 'loose' ? p.放飞时概率 : odds) },
      sandbox: {
        show: ({ S }) => !(S.policies.safety === 'strict' || S.flags.aligned),
        run: x => { const { S, p } = x; S.flags.aligned = 1; S.policies.safety = 'strict'; S.sched.push({ id: 'agi', at: S.t + p.对齐月数 }); x.fx(); },
      },
    },
  },
};

// 选项和提示里引用数的 {变量}（「参数」列的名字、{效果.xxx}、{临时.xxx}、平衡参数）：载入时填好，剩下的留给脚本填
localize('events', { EVENTS_CORE: T.EVENTS_CORE, TEXT: T.TEXT }, () => {
  for (const e of T.EVENTS_CORE) for (const o of e.options || []) for (const k of ['label', 'hint']) if (o[k]?.includes('{')) o[k] = fillRec(o[k], o, { ...(e.p || {}), ...(o.p || {}) });
});
export const EVENTS_CORE = bindEvents(T.EVENTS_CORE, HOOKS, T.TEXT);

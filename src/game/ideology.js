// 「路线之争」：中后期「接盘老股」事件引进立场鲜明的股东之后的 15 级事件链，以及走完以后「意识形态」页上的东西。
// 两个版本，玩法一样、剧情各一套：
//   深圳 cn：深创头的国资基金接盘天使的老股 → 国资董事进场；进度条叫 共产 / 资本
//   湾区 us：公地资本（工会养老金）接盘种子轮的老股 → 养老金的董事观察员进场；进度条叫 社会主义 / 资本主义，
//           另有一条「反共压力」：社会主义条越高涨得越快，压力过半会磨掉社会主义条、拖累融资和企业订单，还会弹出红色恐慌事件。
//           公司嘴上始终不承认自己是社会主义。
// - 揣摩玩家意图：最近的选择权重大，再参考平时的经营作风；从第 3 级起，玩家想走哪边就多给哪边的选项
// - 终局：左边的条满或更多 → 左翼结局；资本条满或更多 → 保守结局 + 处置左倾员工；股权不到四成 → 没走成
// 这里不 import 引擎（避免循环依赖）：用到的引擎函数由调用方以参数 G 传进来——事件里就是引擎的 API，行动里是引擎模块本身。
import { ROLES, STAFF_QUIRKS, GOALS, TRAIT, officeName } from '../data/defs.js';
import * as CN from '../data/ideology.js';
import * as US from '../data/ideology_us.js';

export const IDEO_LEN = 15;
export const IDEO_EQUITY = 40;                 // 终局时创始人股权的底线（%）
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ───────── 两个版本：内容、名词、引擎自己说的话 ─────────
const VER = {
  cn: {
    D: CN, start: { red: 12, cap: 28 }, side: { red: '共产', cap: '资本', mid: '务实' }, tag: { red: '☭ 共产', cap: '$ 资本', mid: '⚖ 务实' },
    goal: { red: 'red', cap: 'cap' }, flag: { red: 'red', cap: 'capb', cell: 'red_cell', on: 'stateCap' },
    chain: { utopia: 'utopia_1', bci: 'bci_1' }, brand: '#d42a2a',
    end: { red: '红色路线', cap: '警惕不现实的乌托邦主义' },
    t: {
      start: R => [`国资董事${R}进场，路线之争开始。`, `🏛️ 深创头派驻董事${R}进场，{co} 内部的路线之争开始了。`],
      buyback: (R, C) => `${R}看了看报价，往搪瓷缸里续了点水：「可以，按规矩来。」${C}在旁边小声说，这是今年最贵的一杯茶。`,
      newsRed: '☭ {co} 通过新章程：为了共产主义乌托邦而制造 AGI。美元基金发来了告别信。',
      newsCap: '🧯 {co} 发布《关于警惕不现实的乌托邦主义的通知》，公司目标转向稳健经营。',
      reeducate: n => `${n} 人转岗培训，读书会的群改名为「技术交流群」。`,
      release: (n, l) => `${n} 人拿着 N+3 离开${l ? `，${l} 位死忠说什么也不走，留了下来` : ''}。`,
      tolerate: n => `${n} 人留在原岗位。每周五晚上，地下车库会多亮一盏灯。`,
      hint: { fire_all: (n, l) => `${n} 人${l ? `，含死忠 ${l} 人` : ''}；不给补偿`, reeducate: n => `${n} 人留下，读书会解散`, release: (n, l) => `${n - l} 人拿 N+3 离开${l ? `，死忠 ${l} 人留下` : ''}`, tolerate: () => '读书会转入地下' },
      fireDirt: '违法辞退',
      plan: { name: '五年计划', icon: '📜', art: 'redhall', news: '📜 {co} 的「五年计划」立项', ok: ['开表彰大会', '奖状是 AI 设计的，锦旗是 AI 绣的，台下的掌声是真的。'] },
      yank: { name: '末位淘汰', start: '📉 末位淘汰正式施行：每个部门每月淘汰一个能力最低的人。', month: n => `📉 末位淘汰：本月每个部门「毕业」一人，HR 补进 ${n} 张新面孔。` },
      utopia: '🌾 {co} 在城郊买下一片地，「乌托邦社区实验」破土动工。',
      bci: '🧠 平面图上没有的地下二层，亮起了灯。',
    },
  },
  us: {
    D: US, start: { red: 8, cap: 32, heat: 10 }, side: { red: '社会主义', cap: '资本主义', mid: '务实' }, tag: { red: '🌹 社会', cap: '$ 资本', mid: '⚖ 务实' },
    goal: { red: 'rose', cap: 'missionco' }, flag: { red: 'rose', cap: 'missionco', cell: 'rose_cell', on: 'commonsCap' },
    chain: { utopia: 'utopia_us_1', bci: 'bci_us_1' }, brand: '#e0435e',
    end: { red: '共享繁荣', cap: '我们是一家公司' },
    t: {
      start: R => [`公地资本的董事观察员${R}进场，路线之争开始。`, `🌹 公地资本的董事观察员${R}进场，{co} 内部的路线之争开始了。`],
      buyback: (R, C) => `${R}放下毛衣针，看了看报价：「按信托义务，可以，但价格得公允。」${C}说这是他见过最贵的一次回购，然后去冷水桶里冷静了五分钟。`,
      newsRed: '🌹 {co} 通过新章程：为全体利益相关者的共享繁荣而制造 AGI。公关部补充：这不是社会主义。',
      newsCap: '🧭 {co} 发布全员信《我们是一家使命驱动的公司》：工作时间不谈政治，不认同的可以拿遣散包走人。',
      reeducate: n => `${n} 人参加了三天的「使命对齐」培训，读书会的内部频道改名为 #mission-alignment。`,
      release: (n, l) => `${n} 人拿着遣散包离开${l ? `，${l} 位死忠说什么也不走，留了下来` : ''}。`,
      tolerate: n => `${n} 人留在原岗位。签名档里的 🌹 一朵都没摘，读书会搬去了奥克兰的一家咖啡馆。`,
      hint: { fire_all: (n, l) => `${n} 人${l ? `，含死忠 ${l} 人` : ''}；不给补偿，会被投诉`, reeducate: n => `${n} 人留下，参加使命对齐培训`, release: (n, l) => `${n - l} 人拿遣散包离开${l ? `，死忠 ${l} 人留下` : ''}`, tolerate: () => '🌹 留在签名档里' },
      fireDirt: '违法打压工会',
      plan: { name: '登月计划', icon: '🚀', art: 'launch', news: '🚀 {co} 的「登月计划」立项', ok: ['开庆功全员会', '全员会上发了印着登月火箭的连帽衫。珍妮提醒大家，新闻稿里只能写「全员的成就」，不能写「集体」。'] },
      yank: { name: '强制排名', start: '📉 强制排名正式施行：每个部门每月淘汰一个能力最低的人。', month: n => `📉 强制排名：本月每个部门「另谋高就」一人，HR 补进 ${n} 张新面孔。` },
      utopia: '🏘️ {co} 在东湾买下一块地，「合作社住房实验」破土动工。公关稿里管它叫「员工住房福利」。',
      bci: '🧠 园区平面图上没有的地下二层，亮起了灯。',
    },
  },
};
// 哪个版本：开了链就看链；没开就看地区（意识形态页的空状态、融资窗的报价都要用）
export const verOf = S => S.ideo?.v || (S.co.region === 'bay' ? 'us' : 'cn');
const V = S => VER[verOf(S)];
const D = S => V(S).D;
const co = (S, s) => s.replace(/\{co\}/g, S.co.name);
export const sideName = S => V(S).side;
export const sideTag = S => V(S).tag;
export const castOf = S => D(S).IDEO_CAST;
export const chainStart = (S, k) => V(S).chain[k];
export const endName = S => V(S).end;
export const vtext = S => V(S).t;

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
  return { v, on: 1, n: 0, heat: 0, ...VER[v].start, picks: [], used: {}, shown: {}, t0: S.t, result: null, goal: null, full: null, fired: 0 };
}
// 接受新股东（或者拖延失败）之后调用：建状态，给一部分老员工打上左倾标记，第一级马上弹出
export function startIdeo(S, G) {
  if (S.ideo) return false;
  const v = S.co.region === 'bay' ? 'us' : 'cn', X = VER[v];
  S.ideo = fresh(S, v);
  for (const e of S.staff) { e.rc = 1; if (G.rnd(S) < 0.2) e.red = 1; }
  S.flags[X.flag.on] = 1;
  if (v === 'us') S.flags.us_chain = 1;
  const [nt, nw] = X.t.start(X.D.IDEO_CAST.rep.name);
  note(S, nt); G.news(S, co(S, nw));
  G.queueEvent(S, 'ideo_1');
  return true;
}
// ───────── 中后期入口：早期投资人退出，国资（深圳）/ 公地资本（湾区）来接盘他的老股 ─────────
// 开局随机定在第 28~40 个月；到时候还没融完 A 轮就往后推三个月；第 52 个月以后就不来了（剩下的时间走不完 15 级）。
// 三个选择都有代价：接受 → 15 个月的路线之争；行使优先购买权 → 花一大笔钱自己吃下这块老股；拖着不签 → 检定，砸了照样开链、开局更难
const ENTRY_SHARE = 6;                                     // 被接盘的老股占公司的百分比
const ENTRY = {
  cn: {
    title: '国资接盘老股', icon: '🏛️', art: 'handshake',
    text: '你的天使投资人决定退出，下家来得比他的告别邮件还快：深创头的国资基金按估值接下了他手里的全部老股。交割文件只附了一个要求——董事会给国资留一个席位。\n\n天使在电话里很高兴：「国家队接盘，说明咱们这些年没白干。」你翻到交割文件最后一页，上面已经排好了下个月董事会的座次。',
    accept: ['欢迎新股东', '监管压力 -15，两年内收入 +10%', '你在交割文件上签了字。深创头很快发来新董事的简历：吴建设，爱好是开会和养君子兰。', { reg: -15, temp: { key: 'revMult', mult: 1.1, months: 24 } }],
    rofr: ['你掏出半个账户，行使优先购买权，把这块老股自己吃了下来。深创头的人客客气气地说「下次再合作」，客气得让人有点不安。', { reg: 6 }],
    stall: ['拖着不签', '人脉检定：拖到交易过期', '你让法务把交割流程走了三个月。最后一个章盖完的时候交易已经过期，天使只好把老股卖给了一家没人听说过的家族办公室。', { reg: 8 },
      '你拖了三个月，交易还是过了。新董事进门的第一句话是：「听说你不太欢迎我们？」', { reg: 5, morale: -4 }, 0],
  },
  us: {
    title: '公地资本接盘老股', icon: '🌹', art: 'pitch',
    text: '你的种子轮投资人要退出，接盘的是「公地资本」——几家教师、护士工会养老金凑的影响力基金。他们按估值收下了全部老股，交割条件只有两条：公司转为公益公司，对员工组建工会保持中立；外加一个董事观察员席位。\n\n种子轮投资人在电话里说：「养老金接盘，说明你们够稳。」A16Y 的布拉德在群里发了一个冰块表情，没人知道他是在冷静，还是刚洗完冷水浴。',
    accept: ['欢迎新股东', '口碑 +6、士气 +6；转为公益公司', '你在交割文件上签了字。公地资本发来董事观察员的简历：多萝西·陈，管着三个州教师工会的退休金，爱好是织毛衣和读财报附注。', { rep: 6, morale: 6 }],
    rofr: ['你动用公司现金行使优先购买权，自己买下了这块老股。公地资本客气地说保持联系，狐狸新闻在节目里夸你「守住了美国企业的传统」——你不确定这算不算好消息。', { rep: -2 }],
    stall: ['拖着不签', '人脉检定：拖到交易过期', '你让律师把交割文件改了十一稿。改到最后一稿，交易已经过期，种子轮投资人把老股卖给了一家只在开曼群岛有个邮箱的基金。', { rep: -3 },
      '你拖了三个月，交易还是过了，消息还被写成了「AI 公司拒绝工会养老金」。新来的董事观察员第一句话是：「我们可以从信任开始。」', { morale: -4 }, 8],
  },
};
function entryMonth(S, G) {
  if (S.ideo || S.flags.ideoBlocked || !S.ideoAt || S.t < S.ideoAt) return;
  if (S.t > 52) { S.ideoAt = 0; return; }
  if (S.stage < 2) { S.ideoAt = S.t + 3; return; }
  S.ideoAt = 0;
  G.queueEvent(S, 'ideo_entry');
}
const entryEvent = {
  id: 'ideo_entry', cat: 'money', weight: 0, once: false,
  title: S => ENTRY[verOf(S)].title, icon: S => ENTRY[verOf(S)].icon, art: S => ENTRY[verOf(S)].art,
  text: S => `${ENTRY[verOf(S)].text}\n\n（这是老股转让，不稀释你的股权。接下来大约 15 个月，公司里会有一场路线之争；终局时你得握有至少 ${IDEO_EQUITY}% 股权——你现在是 ${S.equity.toFixed(0)}%${S.equity < 50 ? '，再融一轮就悬了' : ''}。）`,
  options: (S, ctx, G) => {
    const E = ENTRY[verOf(S)], price = G.valuation(S) * ENTRY_SHARE / 100 * 1.2, block = S2 => { S2.flags.ideoBlocked = 1; };
    const [aL, aH, aT, aFx] = E.accept, [sL, sH, sOk, sOkFx, sNo, sNoFx, sHeat] = E.stall;
    const begin = heat => (S2, c, G2) => { startIdeo(S2, G2); if (heat && S2.ideo) S2.ideo.heat += heat; };
    return [
      { label: aL, hint: aH, text: aT, fx: aFx, fn: begin(0) },
      { label: '行使优先购买权', hint: `花 ${G.money(S, price)} 自己买下这 ${ENTRY_SHARE}% 老股`, req: { cash: price / G.unit(S) }, text: E.rofr[0], fx: { cashAbs: -price, equity: ENTRY_SHARE, ...E.rofr[1] }, fn: block },
      { label: sL, hint: sH, check: { attr: 'net', dc: 16 }, ok: { text: sOk, fx: sOkFx, fn: block }, fail: { text: sNo, fx: sNoFx, fn: begin(sHeat) } },
    ];
  },
};

// 自检和老存档兜底：没有状态时补一个
const ensure = S => (S.ideo ??= fresh(S, verOf(S)));
function note(S, text) {
  const c = (S.chains.ideo ??= { id: 'ideo', t: S.t, notes: [] });
  c.notes.push({ t: S.t, text });
}
const barsLine = S => { const I = S.ideo, N = sideName(S); return `${N.red} ${Math.round(I.red)} · ${N.cap} ${Math.round(I.cap)}${I.v === 'us' ? ` · 反共压力 ${Math.round(I.heat)}` : ''}`; };

// ───────── 揣摩玩家意图 ─────────
// 返回 v ∈ [-1, 1]（正 = 想往左走，负 = 想走资本）和把握 conf ∈ [0, 1]
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
  return `参谋判断：你想把公司带向「${sideName(S)[p]}」（把握 ${sure}%）${I.n >= 2 ? '，会多给你这类选项' : '，从第 3 级起会多给你这类选项'}。`;
}

// ───────── 每一级给哪些选项 ─────────
// 前两级：左、资本、务实各一。第 3 级起看意图：有倾向 → 两张对路的 + 一张反方向；认准了 → 三张对路的 + 一条回头路
function slotsFor(S, n) {
  if (n < 3) return ['red', 'cap', 'mid'];
  const { v } = ideoLean(S), p = prefOf(v);
  if (!p) return ['red', 'cap', 'mid'];
  const opp = p === 'red' ? 'cap' : 'red';
  return Math.abs(v) >= 0.5 ? [p, p, p, opp] : [p, p, opp];
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
  const price = G.valuation(S) * 0.03 * 1.15, C = castOf(S);
  return {
    key: 'buyback', side: 'mid', label: '回购 3% 股权', hint: `花 ${G.money(S, price)}，按估值溢价一成半`,
    text: V(S).t.buyback(C.rep.name, C.cap.name), fx: { cashAbs: -price, equity: 3 }, req: { cash: price / G.unit(S) },
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
  if (c.side === 'red') { const pool = S.staff.filter(e => !e.red); if (pool.length && G.rnd(S) < 0.8) G.pick(S, pool).red = 1; }
  if (c.side === 'cap') { const pool = S.staff.filter(e => e.red); if (pool.length && G.rnd(S) < 0.5) delete G.pick(S, pool).red; }
  note(S, `第 ${n} 级「${stageOf(S, n).title || ''}」：${c.label}（${barsLine(S)}）`);
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
  const I = ensure(S), X = V(S), want = verdict(S), r = S.equity < IDEO_EQUITY ? 'fail' : want;
  Object.assign(I, { on: 0, result: r, want, tEnd: S.t });
  S.chains.ideo && (S.chains.ideo.done = true);
  delete S.flags.us_chain;
  if (r === 'red') {
    replaceMission(S, I); I.goal = X.goal.red; S.flags[X.flag.red] = 1;
    I.brand0 = S.co.brand; S.co.brand = X.brand;                     // 招牌、Logo 一起换颜色（湾区的说法叫「品牌焕新」）
    G.award(S, 'road');
    G.news(S, co(S, X.t.newsRed));
  } else if (r === 'cap') {
    replaceMission(S, I); I.goal = X.goal.cap; S.flags[X.flag.cap] = 1;
    I.heat = 0;                                                       // 湾区：风头过去了
    G.award(S, 'road');
    G.news(S, co(S, X.t.newsCap));
  } else G.news(S, `🗳️ 路线之争收场：${S.co.name} 的创始人股权不到四成，方向由董事会代为决定。`);
  note(S, r === 'fail' ? `终局：股权 ${S.equity.toFixed(0)}%，不到四成，你说了不算。` : `终局：${X.end[r]}（${barsLine(S)}）。`);
  // 结局窗紧接着弹（插队到最前面）；保守结局后面再跟一个「左倾员工的去留」
  const next = [{ type: 'event', id: `ideo_end_${r}` }];
  if (r === 'cap' && S.staff.some(e => e.red)) next.push({ type: 'event', id: 'ideo_purge' });
  S.q.unshift(...next);
}

// ───────── 左倾员工的去留（深圳：共产倾向；湾区：签名档里挂 🌹 的）─────────
function purge(S, act, G) {
  const T = V(S).t, reds = S.staff.filter(e => e.red), loyal = reds.filter(e => e.quirk === 'loyal'), sal = e => e.salary * G.mod(S, 'salaryMult');
  if (act === 'fire_all') {                                           // 死忠也不例外
    for (const e of reds) G.removeStaff(S, e.uid);
    if (reds.length) G.addDirt(S, { type: 'unfair_fire', sev: Math.min(18, 5 + reds.length * 1.2), name: T.fireDirt });
    G.applyFx(S, { morale: -(3 + reds.length * 0.6), rep: -4 });
    return `${reds.length} 人当天收到了邮件${loyal.length ? `，其中 ${loyal.length} 位是跟你从${officeName(S, 1)}一路走过来的死忠` : ''}。`;
  }
  if (act === 'reeducate') {
    for (const e of reds) { delete e.red; S.cash -= sal(e); }          // 培训费：每人一个月工资
    G.applyFx(S, { morale: -5 });
    return T.reeducate(reds.length);
  }
  if (act === 'release') {
    const go = reds.filter(e => e.quirk !== 'loyal');
    for (const e of go) { S.cash -= 3 * sal(e); G.removeStaff(S, e.uid); }   // 三个月工资
    for (const e of reds) delete e.red;
    G.applyFx(S, { rep: 5, morale: 2 });
    return T.release(go.length, loyal.length);
  }
  S.flags[V(S).flag.cell] = 1;
  G.applyFx(S, { morale: 3 });
  return T.tolerate(reds.length);
}

// ───────── 五年计划 / 登月计划（都只给 12 个月）─────────
const PLAN = {
  users: { show: () => true, now: S => S.users, goal: S => Math.max(S.users * 2, S.users + 30), temp: { key: 'growthMult', mult: 1.15, months: 12 }, fmt: (S, G, v) => `用户 ${G.fmtUsers(v)}` },
  model: { show: S => S.ownModel, now: (S, G) => G.myCap(S), goal: (S, G) => G.myCap(S) + 6, temp: { key: 'researchMult', mult: 1.2, months: 12 }, fmt: (S, G, v) => `丹炉火候 ${v.toFixed(1)}` },
  rev: { show: () => true, now: (S, G) => G.revenue(S).total, goal: (S, G) => Math.max(G.revenue(S).total * 2, G.revenue(S).total + 20), temp: { key: 'revMult', mult: 1.12, months: 12 }, fmt: (S, G, v) => `月收入 ${G.money(S, v)}` },
};
export function planDialog(S, G) {
  const PT = D(S).PLAN_TEXT, T = PT.targets || {}, P = V(S).t.plan;
  return {
    dialog: {
      kind: 'event', cat: 'ideo', icon: P.icon, art: P.art, title: PT.title || P.name, text: PT.text || '定一个十二个月的目标。',
      options: Object.entries(PLAN).filter(([, K]) => K.show(S)).map(([k, K]) => {
        const goal = K.goal(S, G);
        return {
          label: T[k]?.label || k, hint: `目标：${K.fmt(S, G, goal)}`,
          go: () => {
            ensure(S).plan = { kind: k, goal, due: S.t + 12, t: S.t };
            G.applyFx(S, { temp: K.temp });
            S.sched.push({ id: 'ideo_plan_due', at: S.t + 12 });
            G.news(S, `${co(S, P.news)}：${G.dateStr(S.t + 12)}前达到${K.fmt(S, G, goal)}。`);
            return { text: actText(S, 'plan', G) };
          },
        };
      }),
    },
  };
}
const planNow = (S, G) => { const p = S.ideo?.plan; return p && PLAN[p.kind] ? PLAN[p.kind].now(S, G) : 0; };

// ───────── 末位淘汰 / 强制排名 ─────────
export function yankDialog(S, G) {
  const Y = D(S).YANK_TEXT, T = V(S).t.yank;
  return {
    dialog: {
      kind: 'event', cat: 'ideo', icon: '📉', art: 'boardroom', title: Y.title || T.name, text: Y.text || '',
      options: [
        { label: Y.go?.label || '推行', hint: Y.go?.hint, go: () => { S.flags.yank = 1; G.news(S, T.start); return { text: Y.go?.text || '' }; } },
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
  if (n) G.news(S, V(S).t.yank.month(n));
}

// ───────── 湾区：反共压力 ─────────
// 路线之争期间：社会主义条越高涨得越快，资本主义条高能压一压；压力过半时社会主义条每月被磨掉一点，也有人悄悄摘掉签名档里的 🌹。
// 「共享繁荣」之后：压力一直挂在半空，偶尔还会弹红色恐慌事件。压力越大，融资估值和企业订单越受影响（见引擎 mod）
function heatMonth(S, G) {
  const I = S.ideo;
  if (I.v !== 'us') return;
  if (I.result === 'fail') { I.heat = Math.max(0, I.heat - 3); return; }
  if (!I.on && I.result !== 'red') return;
  const rise = I.on ? 1 + Math.max(0, I.red - 25) * 0.1 - Math.max(0, I.cap - 50) * 0.06 : I.heat < 40 ? 1 : 0;
  I.heat = clamp(I.heat + rise, 0, 100);
  if (I.on && I.heat >= 50 && I.red > I.cap) {
    I.red = Math.max(0, I.red - 2);
    const reds = S.staff.filter(e => e.red);
    if (reds.length && G.rnd(S) < 0.35) { delete G.pick(S, reds).red; G.news(S, '🌹 又有人悄悄摘掉了签名档里的玫瑰。'); }
  }
  // 红色恐慌事件：每月最多一件，同一件十个月内不重复
  if (G.rnd(S) < (I.on ? 0.12 + I.heat / 180 : I.heat / 240)) {
    const list = US.SCARE_EVENTS.filter(ev => G.cond(S, ev.when) && S.t - (S.seen[ev.id] ?? -99) >= 10);
    if (list.length) G.queueEvent(S, G.pick(S, list).id);
  }
}
// 压力对融资估值和企业订单的拖累（给引擎的 mod 用）
export const heatDrag = (S, key) => {
  const I = S.ideo;
  if (I?.v !== 'us' || !I.heat) return 1;
  return key === 'raiseMult' ? 1 - I.heat / 600 : key === 'b2bMult' ? 1 - I.heat / 400 : 1;   // 满压力：估值 -17%、企业订单 -25%
};

// 每月结算时调用（引擎 endMonth）
export function ideoMonth(S, G) {
  entryMonth(S, G);
  if (!S.ideo) return;
  // 新来的人：路线之争期间按左边那条的高低，有一定概率加入读书会；左翼结局的公司里一半人是
  for (const e of S.staff) if (!e.rc) { e.rc = 1; const p = isRed(S) ? 0.5 : ideoOn(S) ? S.ideo.red / 260 : 0; if (p && G.rnd(S) < p) e.red = 1; }
  if (S.flags.yank) yankMonth(S, G);
  heatMonth(S, G);
}
// 玩家手动裁人：算进「作风」
export function noteFire(S) { if (S.ideo?.on) S.ideo.fired = (S.ideo.fired || 0) + 1; }

// ───────── 事件（由引擎并进事件表，weight 0 只能被排进来）─────────
const situation = (S, n, G) => {
  const bits = [];
  if (S.equity < 45 && n < IDEO_LEN) bits.push(`你现在握有 ${S.equity.toFixed(0)}% 股权，终局时不到四成，这条路就不归你定了`);
  if (G.runway(S) < 4) bits.push(`账上的钱只够撑 ${Math.max(0, Math.floor(G.runway(S)))} 个月`);
  if (S.ideo?.v === 'us' && S.ideo.heat >= 50) bits.push(`反共压力已经 ${Math.round(S.ideo.heat)}，融资和企业客户都在观望`);
  if (n === IDEO_LEN) bits.push('这是最后一次表态');
  return bits.length ? `\n\n（${bits.join('；')}。）` : '';
};
const stageEvent = n => ({
  id: `ideo_${n}`, chain: 'ideo', cat: 'ideo', weight: 0, once: false,
  title: S => stageOf(S, n).title, icon: S => stageOf(S, n).icon, art: S => stageOf(S, n).art, portrait: S => stageOf(S, n).portrait,
  text: (S, ctx, G) => stageOf(S, n).text + situation(S, n, G),
  options: (S, ctx, G) => stageOptions(S, n, G),
});
const endLine = (S, r) => {
  ensure(S);
  if (r === 'fail') return `\n\n（${barsLine(S)}；你的股权 ${S.equity.toFixed(0)}%，不到 ${IDEO_EQUITY}%。）`;
  return `\n\n（${barsLine(S)}。新的公司目标：「${GOALS[V(S).goal[r]].name}」。「意识形态」页解锁了新的行动。）`;
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
  text: S => { const reds = S.staff.filter(e => e.red), l = reds.filter(e => e.quirk === 'loyal').length; return `${endOf(S, 'purge').text}\n\n名单上一共 ${reds.length} 人${l ? `，其中 ${l} 人是死忠` : ''}。`; },
  options: S => {
    const reds = S.staff.filter(e => e.red), l = reds.filter(e => e.quirk === 'loyal').length, H = V(S).t.hint;
    return endOf(S, 'purge').options.map(({ act, ...o }) => ({
      ...o, hint: H[act]?.(reds.length, l) || o.hint, fx: o.fx || {},
      fn: (S2, ctx, G) => ({ text: `${o.text}\n\n${purge(S2, act, G)}` }),
    }));
  },
};
const planDueEvent = {
  id: 'ideo_plan_due', cat: 'ideo', weight: 0, once: false,
  enter: (S, ctx, G) => { const p = S.ideo?.plan; ctx.ok = !!p && planNow(S, G) >= p.goal; },
  title: (S, ctx) => (ctx.ok ? D(S).PLAN_TEXT.okTitle : D(S).PLAN_TEXT.failTitle) || '计划到期', icon: S => V(S).t.plan.icon,
  art: (S, ctx) => (ctx.ok ? V(S).t.plan.art : 'office_night'),
  text: (S, ctx, G) => {
    const PT = D(S).PLAN_TEXT, p = S.ideo?.plan, K = p && PLAN[p.kind];
    return ((ctx.ok ? PT.okText : PT.failText) || '') + (K ? `\n\n（目标：${K.fmt(S, G, p.goal)}；实际：${K.fmt(S, G, planNow(S, G))}。）` : '');
  },
  options: (S, ctx) => {
    const done = () => { if (S.ideo) { S.ideo.plan = null; S.ideo.plans = (S.ideo.plans || 0) + 1; } };
    const F = D(S).PLAN_TEXT.failOpts || {}, [okLabel, okText] = V(S).t.plan.ok;
    if (ctx.ok) return [{ label: okLabel, hint: '士气、口碑、热度都涨', text: okText, fx: { morale: 10, rep: 6, hype: 8 }, fn: done }];
    return [
      { label: F.honest?.label || '如实上报', hint: F.honest?.hint, text: F.honest?.text || '', fx: { morale: -8, rep: -3 }, fn: done },
      { label: F.fake?.label || '超额完成', hint: F.fake?.hint, text: F.fake?.text || '', fx: { rep: 3, hype: 5, dirt: 'fake_plan' }, fn: done },
    ];
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

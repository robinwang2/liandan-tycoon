// 《炼丹大亨》数值引擎：纯逻辑、无 DOM。状态 S 是可序列化的普通对象。
import {
  MONTHS, START_YEAR, AGI_CAP, REGIONS, TRACKS, TRAIT, OFFICES, officeName, ROLES, STAFF_QUIRKS, POLICIES,
  PERKS, PERK, FEAT, RIVALS, STAGES, DATA_SOURCES, DIRT, ENDINGS, ACHIEVEMENTS, NAMES, ATTR_NAME, META_SHOP, MOD_NAME,
  GOALS, IDEO_FLAG_MODS, OLD_QUOTA_MULT, EAST_RIVALS,
} from '../data/defs.js';
import { EVENTS_CHAINS } from '../data/events_chains.js';
import { EVENT_ART, CAT_ART } from '../data/event_art.js';
import { EVENTS_CORE } from '../data/events_core.js';
import { EVENTS_PACK } from '../data/events_pack.js';
import { NEWS } from '../data/news.js';
import { IDEO_EVENTS, UTOPIA_EVENTS, BCI_EVENTS } from '../data/ideology.js';
import { IDEO_DYN, ideoMonth } from './ideology.js';

// 路线之争：结局后的随机事件进随机池（靠 flag 限定）；链事件和动态事件 weight 0，只能被排进来
const ALL = [...EVENTS_CORE, ...EVENTS_CHAINS, ...EVENTS_PACK, ...IDEO_EVENTS, ...UTOPIA_EVENTS, ...BCI_EVENTS, ...IDEO_DYN];
export const EV = Object.fromEntries(ALL.map(e => [e.id, e]));

// ───────── 工具 ─────────
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function rnd(S) { let t = (S.rs = (S.rs + 0x6D2B79F5) | 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
export const rf = (S, a, b) => a + rnd(S) * (b - a);
export const ri = (S, a, b) => a + Math.floor(rnd(S) * (b - a + 1));
export const pick = (S, arr) => arr[Math.floor(rnd(S) * arr.length)];

export function money(S, x, sign = false) {
  const a = Math.abs(x), s = x < 0 ? '-' : sign ? '+' : '';
  const body = a >= 10000 ? (a / 10000).toFixed(a >= 1e6 ? 0 : a >= 1e5 ? 1 : 2) + '亿' : (a >= 100 ? Math.round(a) : +a.toFixed(1)) + '万';
  return s + REGIONS[S.co.region].cur + body;
}
export const fmtUsers = x => (x >= 10000 ? (x / 10000).toFixed(2) + '亿' : x >= 100 ? Math.round(x) + '万' : +x.toFixed(1) + '万');
export const dateStr = t => `${START_YEAR + Math.floor((t - 1) / 12)}年${((t - 1) % 12) + 1}月`;
export const news = (S, msg) => { S.log.unshift({ t: S.t, msg }); if (S.log.length > 60) S.log.length = 60; };
export const award = (S, id) => { if (ACHIEVEMENTS[id] && !S.ach.includes(id)) { S.ach.push(id); news(S, `🏆 成就达成：${ACHIEVEMENTS[id].name}`); } };

// ───────── 修正值：地区 / 特质 / 卡牌 / 功能 / 政策 / 限时效果 ─────────
export function mod(S, key) {
  const mult = key.endsWith('Mult');
  let v = mult ? 1 : 0;
  const add = m => { if (m && m[key] != null) v = mult ? v * m[key] : v + m[key]; };
  add(REGIONS[S.co.region].mods);
  for (const id of S.founder.traits) add(TRAIT[id]?.mods);
  for (const id of S.perks) add(PERK[id]?.mods);
  for (const id of S.feats) add(FEAT[id]?.mods);
  for (const k in S.policies) add(POLICIES[k].opts[S.policies[k]]?.mods);
  if (S.ideo?.goal) add(GOALS[S.ideo.goal]?.mods);                     // 公司目标（路线之争之后）
  for (const f in IDEO_FLAG_MODS) if (S.flags[f]) add(IDEO_FLAG_MODS[f]);
  for (const tm of S.temp) if (tm.key === key) v = mult ? v * (tm.mult ?? 1) : v + (tm.add ?? 0);
  if (key === 'devMult' && S.co.route === 'app') v *= 1.15;
  return v;
}

// ───────── 派生数值 ─────────
export const capOf = E => 6.16 * Math.log2(1 + E / 20);           // 有效算力 → 模型能力
export const EofCap = c => 20 * (2 ** (c / 6.16) - 1);
export const frontierE = t => 11500 * 2.2 ** ((t - 1) / 12);       // 巨头的有效算力：每年翻 2.2 倍
export const frontier = t => capOf(frontierE(t));                  // 行业前沿能力
export const baseE = t => frontierE(t) / 8;                        // 开源基座：人人都能白嫖的起点
export const myCap = S => capOf(baseE(S.t) + S.E);                 // 丹炉火候 = 开源基座 + 自己炼的
export function power(S, role) {
  let p = 0;
  for (const e of S.staff) if (e.role === role) p += e.skill * (STAFF_QUIRKS[e.quirk]?.out ?? 1);
  const A = S.founder.attrs;
  const base = { res: A.tech * 0.5, eng: A.tech * 0.4, ops: A.cha * 0.35, biz: A.biz * 0.45, legal: A.net * 0.2 }[role];
  return (p * (0.6 + 0.8 * S.morale / 100) + base) * mod(S, 'outputMult');
}
export const researchEff = S => (1 + power(S, 'res') / 35) * (1 + 0.05 * (S.founder.attrs.tech - 5)) * mod(S, 'researchMult') ** 0.7;
export const rivalOf = (S, id) => S.rivals.find(r => r.id === id);
export const upCap = S => (rivalOf(S, S.upstream)?.cap ?? 30) - 1;
export const usesOwn = S => !!S.model && (S.co.route === 'model' || S.model.cap >= upCap(S) - 2);
export const usedCap = S => (usesOwn(S) ? S.model.cap : upCap(S));
export const qCeil = S => 35 + 0.65 * usedCap(S);                 // 产品体验的天花板：取决于背后的模型有多强
export function board(S) {
  const rows = S.rivals.map(r => ({ id: r.id, name: r.name, model: `${r.model}-${r.ver}`, bench: r.bench, me: false }));
  if (S.model) rows.push({ id: 'me', name: S.co.name, model: S.model.name, bench: S.model.bench, me: true });
  return rows.sort((a, b) => b.bench - a.bench);
}
export const rank = S => { const i = board(S).findIndex(r => r.me); return i < 0 ? 99 : i + 1; };
// 显卡配额：供应商愿意按市价卖给你的量。不跟融资轮次绑定，看两样东西：
// ① 行业产能：基础配额每月涨 4.5%（一年约 ×1.7）；② 采购记录：租满配额的老客户每月多给一点，超租的部分有三成半会转成长约（见 endMonth）
export const quotaFloor = S => S.quotaBase * 1.045 ** (Math.max(1, S.t) - 1);
export const quota = S => Math.round((quotaFloor(S) + (S.quotaEarn || 0)) * (1 + S.quotaAdd) * mod(S, 'quotaMult'));
// 脑机实验成功以后：员工睡觉时也在帮丹炉算梯度，每人折合几张卡（固件年年升级，越来越多）
export const brainGpu = S => (S.flags?.bci_ok && S.ownModel ? Math.round(S.staff.reduce((a, e) => a + 2 + e.skill, 0) * (1 + S.t / 36)) : 0);
export const gpuPrice = S => S.gpuBase * mod(S, 'gpuPriceMult');
// 显卡月租。配额只是「按市价拿货」的份额，不是硬上限：超出配额的去黄牛和云厂商那里现租，
// 第 k 张超额卡的单价约为 市价 × (2 + k / 配额)，租得越多越贵
export function gpuRent(S, n = S.gpu) {
  const q = Math.max(1, quota(S)), p = gpuPrice(S), x = Math.max(0, n - q);
  return (n - x) * p + x * p * (2 + x / (2 * q));
}
export const overMult = S => { const q = Math.max(1, quota(S)), x = Math.max(0, S.gpu - q); return x ? 2 + x / (2 * q) : 1; };   // 超额部分的平均溢价倍数
export const inferNeed = S => (usesOwn(S) ? Math.ceil(S.users * TRACKS[S.co.track].infer * mod(S, 'inferMult')) : 0);
export const teamCap = S => OFFICES[S.co.office].cap + Math.max(0, S.founder.attrs.mgmt - 5) + mod(S, 'teamCapAdd');
export const apMax = S => 3 + (S.founder.attrs.mgmt >= 9 ? 1 : 0) + mod(S, 'apAdd');
export const dirtTotal = S => S.dirt.reduce((a, d) => a + d.sev, 0);
// 一张黑料这个月被扒出来的概率：越重、热度越高、用户越多越容易爆；法务公关能压一压，大嘴巴员工会帮倒忙
export function exposeP(S, d) {
  const L = power(S, 'legal'), big = S.staff.filter(e => e.quirk === 'dazui').length;
  return 0.011 * (d.sev / 10) * (1 + S.hype / 120) * (1 + Math.min(1.5, S.users / 3000)) * mod(S, 'exposeMult') * (1 + 0.25 * big) / (1 + L / 12);
}
// 整个赛道当下的用户盘子：AI 普及率逐年上升；一家公司最多吃下六成
export const market = S => TRACKS[S.co.track].cap * Math.min(1, 0.02 * 1.057 ** S.t);
// 你最多能吃下多大份额：看产品体验、模型竞争力和热度
export const shareCap = S => 0.04 + 0.22 * S.quality / 100 + 0.14 * clamp((usedCap(S) - (frontier(S.t) - 18)) / 22, 0, 1.3) + 0.1 * S.hype / 100;

export function costs(S) {
  const salary = S.staff.reduce((a, e) => a + e.salary, 0) * mod(S, 'salaryMult');
  const rent = OFFICES[S.co.office].rent * mod(S, 'rentMult');
  let gpu = gpuRent(S);
  if (S.furnace?.on && S.furnace.data === 'buy') gpu *= 1.3;
  const api = usesOwn(S) ? 0 : S.users * TRACKS[S.co.track].infer * 2.5 * S.apiIdx * mod(S, 'apiCostMult') * (S.flags.bci_ok ? 0.65 : 1);   // 脑机实验：员工大脑帮着跑推理
  const misc = 1 + S.staff.length * 0.25 + S.users * 0.08;
  const k = mod(S, 'costMult') * (S.reg >= 70 ? 1.06 : 1);          // 监管压力过高：合规成本上升
  return { salary: salary * k, rent: rent * k, gpu: gpu * k, api: api * k, misc: misc * k, total: (salary + rent + gpu + api + misc) * k };
}
export function revenue(S) {
  const T = TRACKS[S.co.track], rm = mod(S, 'revMult') ** 0.75 * (1 + 0.03 * (S.founder.attrs.biz - 5));   // 收入加成叠多了会递减
  const payF = (0.5 + S.quality / 200) * (0.75 + S.rep / 400);
  const sub = S.users * T.arpu * payF * mod(S, 'payMult') ** 0.85 * rm;
  const api = S.model && S.ownModel ? 30 * 1.06 ** S.t * ([1, 0.6, 0.36, 0.22, 0.13, 0.08, 0.05][rank(S) - 1] ?? 0.03) * rm : 0;
  const b2b = power(S, 'biz') * 2 * (0.4 + usedCap(S) / 100) * (1 + S.t / 36) * mod(S, 'b2bMult') * rm;
  return { sub, api, b2b, total: sub + api + b2b };
}
export const unit = S => Math.max(10, costs(S).total);            // 「一个月支出」：事件里的金额单位
export function runway(S) { const net = revenue(S).total - costs(S).total; return net >= 0 ? 99 : Math.max(0, S.cash) / -net; }
export function perf(S) {
  const tg = STAGES[Math.min(6, S.stage + 1)];
  const uS = clamp((S.users + S.fake) / tg.users, 0, 1.5), rS = clamp(revenue(S).total / tg.rev, 0, 1.5);
  const tS = S.model ? ([1.4, 1.15, 0.95, 0.75, 0.55, 0.4, 0.3][rank(S) - 1] ?? 0.2) * (S.co.route === 'model' ? 1 : 0.7) : 0;
  const s = [uS, rS, tS].sort((a, b) => b - a);
  return 0.25 + 0.6 * s[0] + 0.25 * s[1] + 0.1 * s[2];
}
export function valuation(S) {
  const tg = STAGES[Math.min(6, S.stage + 1)];
  return tg.base * perf(S) * (0.55 + S.bubble / 100) * (1 + S.hype / 300) * (1 + 0.03 * (S.founder.attrs.cha - 5)) * mod(S, 'raiseMult') * (1 + S.raiseBoost);
}

// ───────── 检定 ─────────
export const pCheck = (S, attr, dc) => clamp((21 + S.founder.attrs[attr] + mod(S, 'checkAdd') - dc) / 20, 0.05, 0.95);
export const pOdds = (S, p) => clamp(p + (S.founder.attrs.luck - 5) * 0.03, 0.03, 0.97);
export const rollCheck = (S, attr, dc) => rnd(S) < pCheck(S, attr, dc);
export function optCheck(S, label, hint, attr, dc, ok, fail, pre) {
  return { label, hint, chk: `${ATTR_NAME[attr]}检定 ${Math.round(pCheck(S, attr, dc) * 100)}%`, go: () => { pre?.(); const win = rollCheck(S, attr, dc); return { ok: win, text: (win ? ok : fail)() }; } };
}
export function optOdds(S, label, hint, p0, ok, fail, pre) {
  const p = pOdds(S, p0);
  return { label, hint, chk: `看运气 ${Math.round(p * 100)}%`, go: () => { pre?.(); const win = rnd(S) < p; return { ok: win, text: (win ? ok : fail)() }; } };
}

// ───────── 员工 ─────────
export function genStaff(S, role, bonus = 0) {
  const A = S.founder.attrs, N = NAMES[S.co.region];
  const skill = clamp(Math.round(rf(S, 2.2, 6.6) + S.stage * 0.55 + mod(S, 'hireSkill') + (A.net - 5) * 0.15 + S.rep / 70 + bonus), 1, 10);
  const quirk = rnd(S) < 0.3 ? pick(S, Object.keys(STAFF_QUIRKS)) : null;
  const name = S.co.region === 'sz' ? pick(S, N.a) + pick(S, N.b) : `${pick(S, N.a)} ${pick(S, N.b)}`;
  return { uid: 'e' + S.uid++, name, role, skill, quirk, salary: +((1.2 + 0.09 * skill * skill) * ROLES[role].pay * (STAFF_QUIRKS[quirk]?.pay ?? 1)).toFixed(1), since: S.t };
}
export const addStaff = (S, e) => { S.staff.push(e); return e; };
export function removeStaff(S, uid) { const i = S.staff.findIndex(e => e.uid === uid); return i >= 0 ? S.staff.splice(i, 1)[0] : null; }
export function refreshCands(S, bonus = 0) {
  const w = S.co.route === 'model' ? ['res', 'res', 'eng', 'eng', 'ops', 'biz', 'legal'] : ['eng', 'eng', 'ops', 'ops', 'biz', 'res', 'legal'];
  S.cands = Array.from({ length: 4 }, () => genStaff(S, pick(S, w), bonus));
}

// ───────── 黑料 ─────────
export function addDirt(S, v) {
  const type = typeof v === 'string' ? v : v.type, D = DIRT[type] || { name: type, sev: 10 };
  const sev = ((typeof v === 'object' && v.sev) || D.sev) * mod(S, 'dirtGainMult');
  S.hadDirt = true;
  const old = S.dirt.find(d => d.type === type);
  if (old) { old.sev = Math.min(45, old.sev + sev * 0.6); return old; }
  const d = { uid: 'd' + S.uid++, type, name: (typeof v === 'object' && v.name) || D.name, sev, t: S.t };
  S.dirt.push(d);
  if (S.dirt.length >= 6) award(S, 'dirty');
  return d;
}
export const removeDirt = (S, uid) => { S.dirt = S.dirt.filter(d => d.uid !== uid); };

// ───────── 效果 DSL ─────────
const soft = (cur, v) => (v > 0 ? v * clamp(1.25 - cur / 100, 0.3, 1) : v);            // 越高越难再涨
const gauge = (k, sat) => (S, v) => { S[k] = clamp(S[k] + (sat ? soft(S[k], v) : v), 0, 100); };
const FX = {
  cash: (S, v) => { S.cash += v * unit(S); },
  cashAbs: (S, v) => { S.cash += v; },
  hype: (S, v) => { S.hype = clamp(S.hype + (v > 0 ? soft(S.hype, v) * mod(S, 'hypeGainMult') : v), 0, 100); },
  rep: gauge('rep', 1), morale: gauge('morale', 1), bubble: gauge('bubble'),
  reg: (S, v) => { S.reg = clamp(S.reg + (v > 0 ? v * mod(S, 'regMult') : v), 0, 100); },
  usersPct: (S, v) => { S.users = Math.max(0, S.users * (1 + v / 100)); },
  tech: (S, v) => { if (S.ownModel) { S.E = Math.max(0, EofCap(myCap(S) + v) - baseE(S.t)); if (S.model) { S.model.cap += v; S.model.bench += v; } } else S.quality = clamp(S.quality + v * 1.5, 0, 100); },
  bench: (S, v) => { if (S.model) { S.model.bench += v; S.model.infl += v; } },
  quality: gauge('quality'),
  quota: (S, v) => { S.quotaAdd = Math.max(-0.6, S.quotaAdd + v / 100); },   // 加法叠加，不封顶；配额变少时已经租的卡照留，只是超出的部分按现货价算
  equity: (S, v) => { S.equity = clamp(S.equity + v, 0, 100); },
  ap: (S, v) => { S.apNext += v; },
  attr: (S, v) => { for (const k in v) S.founder.attrs[k] = clamp(S.founder.attrs[k] + v[k], 1, 15); },
  dirt: (S, v) => { addDirt(S, v); },
  cleanDirt: (S, v) => {
    if (v === 'all') S.dirt = [];
    else if (v === 'random') { if (S.dirt.length) removeDirt(S, pick(S, S.dirt).uid); }
    else S.dirt = S.dirt.filter(d => d.type !== v);
  },
  expose: S => { if (S.dirt.length) S.q.push({ type: 'scandal', uid: pick(S, S.dirt).uid }); },
  flag: (S, v) => { for (const f of [].concat(v)) S.flags[f] = 1; },
  unflag: (S, v) => { for (const f of [].concat(v)) delete S.flags[f]; },
  staff: (S, v, ctx) => {
    if (v === 'loseCtx') { if (ctx.staff) removeStaff(S, ctx.staff); }
    else if (v === 'loseBest') { const b = S.staff.slice().sort((a, b) => b.skill - a.skill)[0]; if (b) { removeStaff(S, b.uid); news(S, `👋 ${b.name}（${ROLES[b.role].name}）离开了公司。`); } }
    else if (v === 'loseRandom') { if (S.staff.length) { const b = pick(S, S.staff); removeStaff(S, b.uid); news(S, `👋 ${b.name}（${ROLES[b.role].name}）离开了公司。`); } }
    else {
      const role = { gainRes: 'res', gainEng: 'eng', gainOps: 'ops', gainBiz: 'biz', gainLegal: 'legal', gainStar: 'res' }[v];
      if (!role) return;
      const e = genStaff(S, role, v === 'gainStar' ? 9 : 2);
      if (v === 'gainStar') { e.skill = ri(S, 9, 10); e.quirk = 'genius'; e.salary = +((1.2 + 0.09 * e.skill ** 2) * 1.25 * 1.35).toFixed(1); }
      addStaff(S, e); news(S, `🙌 ${e.name}（${ROLES[role].name}，能力 ${e.skill}）加入了公司。`);
    }
  },
  rival: (S, v, ctx) => { const r = rivalOf(S, ctx.rival); if (!r) return; if (v.cap) { r.drift += v.cap; r.cap += v.cap; r.bench += v.cap; } if (v.hype) r.hype = clamp(r.hype + v.hype, 0, 100); if (v.rel) r.rel = clamp(r.rel + v.rel, -100, 100); },
  temp: (S, v) => { for (const t of [].concat(v)) S.temp.push({ key: t.key, mult: t.mult, add: t.add, until: S.t + (t.months || 6) }); },
  follow: (S, v, ctx) => { S.sched.push({ id: v.id, at: S.t + (v.in || 1), ctx }); },
  perk: S => { S.q.push({ type: 'draft' }); },
  project: (S, v, ctx) => {
    if (S.projects.some(p => p.id === v.id)) return;
    S.projects.push({ uid: 'p' + S.uid++, id: v.id, chain: v.chain || null, name: v.name, desc: v.desc || '', kind: v.kind || 'res', need: v.need || 3, done: 0, t: S.t, due: S.t + (v.months || 8), ok: v.ok || null, fail: v.fail || null, ctx });
    news(S, `📌 新的特殊项目：${v.name}`);
  },
  chain: (S, v) => {
    const c = (S.chains[v.id] ??= { id: v.id, t: S.t, notes: [] });
    if (v.note) { c.note = v.note; c.notes.push({ t: S.t, text: v.note }); }
    if (v.done) c.done = true;
  },
  end: (S, v) => { endGame(S, v); },
  // 路线之争的两条进度条；记下哪条先满（两条都满时看谁先到）
  ideo: (S, v) => { const I = S.ideo; if (!I) return; for (const k of ['red', 'cap']) if (v[k]) { I[k] = clamp(I[k] + v[k], 0, 100); if (I[k] >= 100 && !I.full) I.full = k; } },
};
export const FX_KEYS = Object.keys(FX);
export function applyFx(S, fx, ctx = {}) { if (fx) for (const k in fx) FX[k]?.(S, fx[k], ctx); }

// ───────── 条件 DSL ─────────
const READ = {
  t: S => S.t, stage: S => S.stage, users: S => S.users + S.fake, hype: S => S.hype, rep: S => S.rep, morale: S => S.morale, reg: S => S.reg, bubble: S => S.bubble,
  dirt: S => dirtTotal(S), staff: S => S.staff.length, rank: S => rank(S), runway: S => runway(S), office: S => S.co.office, equity: S => S.equity, gpu: S => S.gpu,
  red: S => S.ideo?.red ?? 0, cap: S => S.ideo?.cap ?? 0,
};
export function cond(S, w) {
  if (!w) return true;
  for (const k in w) {
    const v = w[k], m = /^(\w+?)(Min|Max)$/.exec(k);
    if (m && READ[m[1]]) { const x = READ[m[1]](S); if (m[2] === 'Min' ? x < v : x > v) return false; continue; }
    if (k === 'region' && S.co.region !== v) return false;
    if (k === 'route' && S.co.route !== v) return false;
    if (k === 'track' && ![].concat(v).includes(S.co.track)) return false;
    if (k === 'ownModel' && !!S.ownModel !== v) return false;
    if (k === 'hasDirt' && !S.dirt.some(d => d.type === v)) return false;
    if (k === 'hasRole' && !S.staff.some(e => e.role === v)) return false;
    if (k === 'flag' && ![].concat(v).every(f => S.flags[f])) return false;
    if (k === 'notFlag' && [].concat(v).some(f => S.flags[f])) return false;
    if (k === 'policy') for (const p in v) if (String(S.policies[p]) !== String(v[p])) return false;
    if (k === 'cash' && S.cash < v * unit(S)) return false;
    if (k === 'attr') for (const a in v) if (S.founder.attrs[a] < v[a]) return false;
  }
  return true;
}
function whyNot(S, req) {
  if (req.notFlag && [].concat(req.notFlag).includes('red') && S.flags.red) return '西方资本已经不和你谈了';
  if (req.cash != null && S.cash < req.cash * unit(S)) return `需要现金 ${money(S, req.cash * unit(S))}`;
  if (req.attr) for (const a in req.attr) if (S.founder.attrs[a] < req.attr[a]) return `需要${ATTR_NAME[a]} ≥ ${req.attr[a]}`;
  return '条件不满足';
}

// ───────── 对话框（事件 / 丑闻 / 抽卡）─────────
export function fmt(S, s, ctx = {}) {
  if (!s) return '';
  const r = ctx.rival && rivalOf(S, ctx.rival);
  const map = { co: S.co.name, me: S.founder.name, model: S.model?.name || S.co.modelName, rival: r?.name || '某巨头', boss: r?.boss || '某大佬', staff: ctx.staffName || '实习生小王', cur: REGIONS[S.co.region].cur };
  return String(s).replace(/\{(\w+)\}/g, (m, k) => map[k] ?? m);
}
function makeCtx(S, ev) {
  const ctx = {}, txt = typeof ev.text === 'string' ? ev.text + JSON.stringify(ev.options) : '';
  if (ev.rival || /\{rival\}|\{boss\}/.test(txt)) {
    const m = ev.rival || 'random';
    ctx.rival = m === 'top' ? board(S).find(r => !r.me).id : m === 'upstream' ? S.upstream : m === 'random' ? pick(S, S.rivals).id : m;
  }
  const pool = ev.when?.hasRole ? S.staff.filter(e => e.role === ev.when.hasRole) : S.staff;
  if (pool.length) { const e = /poach/.test(ev.id) ? pool.slice().sort((a, b) => b.skill - a.skill)[0] : pick(S, pool); ctx.staff = e.uid; ctx.staffName = e.name; }
  return ctx;
}
function instEvent(S, ev, ctx) {
  ev.enter?.(S, ctx, API);
  const text = typeof ev.text === 'function' ? ev.text(S, ctx, API) : ev.text;
  const raw = typeof ev.options === 'function' ? ev.options(S, ctx, API) : ev.options;
  const options = raw.map(o => {
    if (o.go) {                                                   // 核心事件可以直接给闭包
      const go = o.go;
      return { ...o, label: fmt(S, o.label, ctx), hint: fmt(S, o.hint, ctx), go: () => { const r = go() || {}; if (r.text) r.text = fmt(S, r.text, ctx); return r; } };
    }
    const out = { label: fmt(S, o.label, ctx), hint: fmt(S, o.hint, ctx), side: o.side };
    if (o.req && !cond(S, o.req)) { out.disabled = true; out.why = whyNot(S, o.req); }
    if (o.check) out.chk = `${ATTR_NAME[o.check.attr]}检定 ${Math.round(pCheck(S, o.check.attr, o.check.dc) * 100)}%`;
    else if (o.odds != null) out.chk = `看运气 ${Math.round(pOdds(S, o.odds) * 100)}%`;
    out.tip = o.check || o.odds != null ? { ok: fxLines(S, o.ok?.fx), fail: fxLines(S, o.fail?.fx) } : { fx: fxLines(S, o.fx) };
    out.go = () => {
      let r, ok;
      if (o.check) { ok = rollCheck(S, o.check.attr, o.check.dc); r = ok ? o.ok : o.fail; }
      else if (o.odds != null) { ok = rnd(S) < pOdds(S, o.odds); r = ok ? o.ok : o.fail; }
      else r = o;
      applyFx(S, r.fx, ctx);
      const extra = r.fn?.(S, ctx, API);
      return { ok, text: fmt(S, extra?.text || r.text, ctx) };
    };
    return out;
  });
  if (ev.scene) S.fxq.push(ev.scene);
  const val = k => (typeof ev[k] === 'function' ? ev[k](S, ctx, API) : ev[k]);          // 标题、图标、插画也可以按局势变
  return { kind: 'event', id: ev.id, cat: ev.cat, icon: val('icon'), title: fmt(S, val('title'), ctx), text: fmt(S, text, ctx), options, art: val('art') || EVENT_ART[ev.id] || CAT_ART[ev.cat] || 'boardroom', chain: ev.chain, portrait: ev.portrait, delay: ev.delay };
}

function scandalDialog(S, d) {
  const D = DIRT[d.type] || {}, sev = d.sev, sm = mod(S, 'scandalMult'), fee = unit(S) * sev / 8;
  const hit = k => {
    S.exposed += sev * k; if (D.crime) S.exposedCrime += sev * k;
    if ((d.type === 'bench_fake' || d.type === 'bench_overfit') && S.model) { S.model.bench = S.model.cap; S.model.infl = 0; }
    if (d.type === 'fake_users') S.fake = 0;
    if (d.type === 'cook_books') S.temp.push({ key: 'raiseMult', mult: 0.7, until: S.t + 8 });
    removeDirt(S, d.uid);
    if (S.exposedCrime >= 40 && !S.flags.probe) { S.flags.probe = 1; S.q.push({ type: 'event', id: 'probe' }); }
  };
  const lose = (repK, o = {}) => applyFx(S, { rep: -sev * repK * sm, hype: o.hype ?? -sev * 0.25, reg: sev * (o.reg ?? 0.35), morale: o.morale ?? -3 });
  S.fxq.push(['alarm']);
  const pay = optCheck(S, '砸钱公关', `花 ${money(S, fee)} 摆平`, 'net', 11 + sev / 3,
    () => { removeDirt(S, d.uid); applyFx(S, { rep: -1 }); return '稿子撤了，热搜降了，当事人「因个人原因不再回应」。钱能解决的问题，果然都不是问题。'; },
    () => { hit(0.8); lose(0.6); addDirt(S, 'hush'); return '删帖的操作被人截了图，「花钱删帖」本身成了更大的新闻。钱花了，事儿也更大了。'; },
    () => { S.cash -= fee; });
  if (S.cash < fee) { pay.disabled = true; pay.why = '钱不够'; }
  return {
    kind: 'event', cat: 'dirt', icon: '💣', art: 'vault', title: `黑料引爆：${d.name}`,
    text: `${D.blurb || '一件你以为没人知道的事，上了热搜。'}\n\n严重度 ${Math.round(sev)}${D.crime ? ' · 涉嫌违法，处理不好会惊动经侦' : ''}。全网都在等 ${S.co.name} 的回应。`,
    options: [
      optCheck(S, '矢口否认', '赢了就当没发生过', 'cha', 11 + sev / 2.2,
        () => { removeDirt(S, d.uid); applyFx(S, { rep: -2 }); return '你的声明滴水不漏，爆料人反被质疑「蹭热度」。这事就这么过去了——存截图的人换了块硬盘继续存着。'; },
        () => { hit(1); lose(0.9); return '你刚发完「纯属造谣」，对方就放出了第二批证据。嘴硬的截图成了全网新表情包。'; }),
      { label: '道歉整改', hint: '体面认栽，损失可控', go: () => { hit(0.5); lose(0.45, { morale: 2, hype: -sev * 0.12, reg: 0.2 }); S.cash -= fee * 0.6; return { text: '你发了一封「深刻反思」的全员信，并成立整改小组。小组的第一项工作，是给这封信润色。' }; } },
      optOdds(S, '甩锅给实习生', '全靠那位临时工', 0.5,
        () => { hit(0.4); lose(0.2, { morale: -8 }); return '「系个别实习生违规操作，已辞退。」大家将信将疑地接受了。那位实习生其实三个月前就离职了。'; },
        () => { hit(1.1); lose(1.0, { morale: -12 }); return '实习生晒出了你的语音：「就按我说的办，出了事算我的。」这条语音当天被做成了手机铃声。'; }),
      pay,
    ],
  };
}

export function gainPerk(S, id) { const p = PERK[id]; if (!p || S.perks.includes(id)) return; S.perks.push(id); applyFx(S, p.fx); }
function draftDialog(S) {
  const pool = PERKS.filter(p => !S.perks.includes(p.id)), w = p => [0, 6, 3, 1.2][p.r], picks = [];
  while (picks.length < 3 && pool.length) {
    let x = rnd(S) * pool.reduce((a, p) => a + w(p), 0);
    const i = pool.findIndex(p => (x -= w(p)) < 0);
    picks.push(pool.splice(Math.max(0, i), 1)[0]);
  }
  if (!picks.length) return null;
  return { kind: 'cards', cat: 'sys', icon: '🃏', title: '董事会卡 · 三选一', text: '散会之前，你可以从董事会带走一样东西。', options: picks.map(p => ({ label: p.name, card: p, go: () => { gainPerk(S, p.id); return { text: `获得董事会卡「${p.name}」——${p.desc}。` }; } })) };
}

export function nextDialog(S) {
  while (S.q.length && !S.over) {
    const it = S.q.shift();
    if (it.type === 'event') { const ev = EV[it.id]; if (ev) return instEvent(S, ev, it.ctx || {}); }
    else if (it.type === 'scandal') { const d = S.dirt.find(x => x.uid === it.uid); if (d) return scandalDialog(S, d); }
    else if (it.type === 'draft') { const d = draftDialog(S); if (d) return d; }
  }
  if (S.over) S.q.length = 0;
  return null;
}

const SNAP = [
  ['cash', '现金', S => S.cash, 1, 'money'], ['hype', '热度', S => S.hype, 1], ['rep', '口碑', S => S.rep, 1], ['morale', '士气', S => S.morale, 1],
  ['reg', '监管压力', S => S.reg, -1], ['bubble', '泡沫', S => S.bubble, 0], ['users', '用户', S => S.users + S.fake, 1, 'users'], ['quality', '产品体验', S => S.quality, 1],
  ['equity', '股权', S => S.equity, 1, 'pct'], ['quota', '显卡配额', S => quota(S), 1], ['tech', '模型能力', S => (S.ownModel ? myCap(S) : 0), 1, 'f1'], ['bench', '跑分', S => S.model?.bench ?? 0, 1, 'f1'],
  ['dirt', '黑料', S => S.dirt.length, -1], ['proj', '特殊项目', S => S.projects.length, 0], ['staff', '员工', S => S.staff.length, 1], ['ap', '下月行动点', S => S.apNext, 1], ['perks', '董事会卡', S => S.perks.length, 1],
  ['red', '共产', S => S.ideo?.red ?? 0, 0], ['capb', '资本', S => S.ideo?.cap ?? 0, 0],
];
const snap = S => SNAP.map(r => r[2](S));
function diff(S, a, b) {
  const out = [];
  SNAP.forEach(([k, name, , pol, f], i) => {
    const d = b[i] - a[i];
    if (Math.abs(d) < (f === 'money' ? 0.05 : f === 'users' ? 0.05 : 0.5) && !(f === 'f1' && Math.abs(d) >= 0.1)) return;
    const v = f === 'money' ? money(S, d, true) : f === 'users' ? (d > 0 ? '+' : '-') + fmtUsers(Math.abs(d)) : f === 'pct' ? (d > 0 ? '+' : '') + d.toFixed(1) + '%' : (d > 0 ? '+' : '') + (f === 'f1' ? d.toFixed(1) : Math.round(d));
    out.push({ k, name, v, good: pol === 0 ? null : d * pol > 0 });
  });
  return out;
}
// 执行一段会改状态的逻辑，并算出「变化小标签」
export function measure(S, fn) {
  const before = snap(S), res = fn() || {};
  if (res.dialog) return res;
  return { text: res.text || '', ok: res.ok, chips: diff(S, before, snap(S)) };
}
// 玩家在对话框里选了第 i 项
export function choose(S, dlg, i) {
  const o = dlg.options[i];
  if (!o || o.disabled) return null;
  return measure(S, () => o.go(S));
}

// ───────── 开局 ─────────
export function newGame(setup, meta) {
  const R = REGIONS[setup.region];
  const S = {
    v: 1, rs: (Math.random() * 2 ** 32) | 0, t: 1,
    founder: { name: setup.name, attrs: { ...setup.attrs }, traits: setup.traits.filter(id => TRAIT[id]), outfit: setup.outfit || 'turtleneck' },
    co: { name: setup.coName, region: setup.region, route: setup.route, track: setup.track, office: 1, modelName: setup.modelName || '混沌', logo: setup.logo || null, brand: setup.brand || '#ff6b4a' },
    cash: R.cash, equity: 100, stage: 0, lastRaiseT: -9, raiseBoost: 0, ap: 3, apNext: 0,
    hype: 8, rep: 50, morale: 65, reg: 10, bubble: 35, burstT: 0, outage: 0,
    users: setup.route === 'app' ? 2 : 0.3, fake: 0, quality: setup.route === 'app' ? 40 : 28,
    ownModel: setup.route === 'model', model: null, E: 0, furnace: null, lastReleaseT: -9, upstream: null, apiIdx: 1,
    gpu: 0, gpuBase: 1.5, quotaBase: R.quota, quotaAdd: 0, quotaEarn: 0,
    staff: [], cands: [], uid: 1, policies: { work: '965', price: 'std', safety: 'std' },
    dirt: [], exposed: 0, exposedCrime: 0, hadDirt: false,
    perks: [], feats: [], sprint: null, projects: [], chains: {}, flags: {}, temp: [], rivals: [], sched: [], seen: {}, q: [], fxq: [], log: [], cd: {},
    last: { rev: 0, cost: 0, net: 0 }, vam: null, streak: { profit: 0, x996: 0 }, stats: { maxUsers: 0, raised: 0, events: 0 }, hist: [], ach: [], over: null,
  };
  for (const id of S.founder.traits) { const a = TRAIT[id]?.attr; if (a) for (const k in a) S.founder.attrs[k] += a[k]; }
  S.rivals = RIVALS.map(r => {
    const off = r.off + rf(S, -2, 2), cap = frontier(1) + off;
    return { id: r.id, name: r.name, boss: r.boss, model: r.model, color: r.color, off, drift: 0, cheat: r.cheat, ver: ri(S, 3, 4), cap, bench: cap + r.cheat, hype: 40, rel: 0, next: ri(S, 2, 7) };
  });
  S.upstream = pick(S, setup.region === 'sz' ? ['deepsleep', 'bytejump', 'openbi'] : ['openbi', 'misan', 'goggle']);
  if (S.ownModel) { const cap = myCap(S); S.model = { cap, bench: cap, ver: 1, name: `${S.co.modelName}-1`, infl: 0 }; S.gpu = 8; S.furnace = { on: true, data: 'open', months: 0 }; }
  for (const id of S.founder.traits) {
    const st = TRAIT[id]?.start; if (!st) continue;
    if (st.cash) S.cash += st.cash;
    if (st.cashMult) S.cash *= st.cashMult;
    applyFx(S, { rep: st.rep || 0, hype: st.hype || 0, tech: st.tech || 0 });
    if (st.users) S.users += st.users;
    if (st.dirt) addDirt(S, st.dirt);
    if (st.equity) S.equity += st.equity;
    if (st.reg) S.reg = clamp(S.reg + st.reg, 0, 100);
    if (st.debt) { S.flags.loaned = 1; S.sched.push({ id: 'debt_due', at: st.debt }); }
    for (const r of st.staff || []) {
      if (typeof r === 'string') { addStaff(S, genStaff(S, r, 1)); continue; }
      const e = genStaff(S, r.role, r.bonus || 0);            // 合伙人：死忠、只拿半薪
      e.quirk = 'loyal'; e.salary = +(e.salary * 0.5).toFixed(1); addStaff(S, e);
    }
  }
  const own = meta?.own || {};
  if (own.m_cash) S.cash += 60;
  if (own.m_gpu) S.quotaBase *= 1.4;
  if (own.m_revive) S.flags.revive = 1;
  S.q.push({ type: 'event', id: 'intro' });
  if (own.m_perk) S.q.push({ type: 'draft' });
  if (setup.region === 'bay') S.sched.push({ id: 'chepole_1', at: 3 });
  S.sched.push({ id: 'leather_rumor', at: ri(S, 9, 30) });
  refreshCands(S);
  S.ap = apMax(S);
  if (setup.tutorial) S.tut = { on: true, open: {}, queue: [], dirt0: S.dirt.length };
  news(S, `🏠 ${S.co.name} 在${R.name}的${officeName(S)}里成立了。`);
  return S;
}

// ───────── 月结 ─────────
function growUsers(S) {
  const T = TRACKS[S.co.track], O = power(S, 'ops'), gm = T.growth * mod(S, 'growthMult') ** 0.5 * (S.reg >= 70 ? 0.8 : 1);
  const rel = clamp((usedCap(S) - (frontier(S.t) - 18)) / 22, 0, 1.3);     // 模型相对前沿的竞争力
  const attract = 0.005 + 0.025 * S.quality / 100 + 0.03 * S.hype / 100 + 0.025 * rel + Math.min(0.02, O / 1000);
  const room = Math.max(0, 1 - S.users / (shareCap(S) * market(S)));
  const churn = Math.max(0.005, 0.035 + 0.05 * (1 - S.rep / 100) + mod(S, 'churnAdd') + S.outage * 0.2);
  const seed = (0.2 + S.hype / 40 + O / 10 + S.quality / 60) * gm * (0.5 + S.t / 36) * (1 - S.outage);
  S.users = Math.max(0, S.users * (1 + attract * gm * room * (1 - S.outage) - churn) + seed * room);
  S.fake *= 0.97;
}

function pickRandomEvent(S) {
  const pool = ALL.filter(ev => (ev.weight ?? 1) > 0 && cond(S, ev.when) && (ev.once === false ? S.t - (S.seen[ev.id] ?? -99) >= (ev.cd ?? 10) : !S.seen[ev.id]));
  if (!pool.length) return null;
  const w = ev => (ev.weight ?? 1) * (ev.cat === S.lastCat ? 0.35 : 1);
  let x = rnd(S) * pool.reduce((a, e) => a + w(e), 0);
  return pool.find(e => (x -= w(e)) < 0) || pool[0];
}
export function queueEvent(S, id, ctx) { const ev = EV[id]; if (!ev) return; S.seen[id] = S.t; S.stats.events++; S.q.push({ type: 'event', id, ctx: { ...makeCtx(S, ev), ...(ctx || {}) } }); }
// 特殊项目每月推进多少「月工作量」：同一类人手同时干几个项目会被摊薄
export function projectRate(S, p) {
  if (p.kind === 'ap') return 0;
  const share = S.projects.filter(x => x.kind === p.kind).length || 1;
  if (p.kind === 'gpu') return clamp(Math.max(0, S.gpu - inferNeed(S)) / Math.max(8, 0.25 * quota(S)), 0, 2.5) / share;
  return clamp(power(S, p.kind) / (6 + 9 * S.stage), 0.35, 2.5) / share;
}
// 这个人（已雇佣或候选）到底能带来什么：对比「有他」和「没他」时公司的各项产出
const QUIRK_TEXT = { juan: '卷王：产出 ×1.25', moyu: '摸鱼大师：产出只有七成', dazui: '大嘴巴：公司每张黑料的曝光概率 +25%', loyal: '死忠：士气再低也不会主动离职', genius: '天才：产出 ×1.5（工资也贵三成多）', guanxi: '关系户：产出只有三成，但你懂的' };
export function staffImpact(S, e) {
  const real = S.staff, rest = real.filter(x => x.uid !== e.uid);
  const probe = list => { S.staff = list; return { res: researchEff(S), eng: power(S, 'eng'), ops: power(S, 'ops'), b2b: revenue(S).b2b, legal: power(S, 'legal') }; };
  const a = probe(rest), b = probe([...rest, e]);
  S.staff = real;
  const lines = [], dm = mod(S, 'devMult'), gm = TRACKS[S.co.track].growth * mod(S, 'growthMult') ** 0.5;
  if (e.role === 'res') { lines.push(`炼丹效率 +${((b.res / a.res - 1) * 100).toFixed(0)}%`, '研究类特殊项目推进更快'); if (!S.ownModel) lines.push('公司还没有自研模型，暂时用不上'); }
  if (e.role === 'eng') { const d = b.eng - a.eng; lines.push(`产品体验每月多涨约 ${(d * 0.08 * dm * Math.max(0, 1 - S.quality / qCeil(S))).toFixed(1)}`, `功能开发进度 +${(d * dm).toFixed(1)}/月`); if (S.ownModel) lines.push(`炸炉概率 -${(d / 6).toFixed(1)}%`); }
  if (e.role === 'ops') { const d = b.ops - a.ops; lines.push(`每月多带来约 ${fmtUsers(d / 10 * gm * (0.5 + S.t / 36))} 新用户`, `用户增长率 +${((Math.min(0.02, b.ops / 1000) - Math.min(0.02, a.ops / 1000)) * gm * 100).toFixed(2)}%/月`); }
  if (e.role === 'biz') lines.push(`企业订单收入 ${money(S, b.b2b - a.b2b, true)}/月`, '工程类之外的商务特殊项目也靠他');
  if (e.role === 'legal') lines.push(`每张黑料的曝光概率 -${((1 - (1 + a.legal / 12) / (1 + b.legal / 12)) * 100).toFixed(0)}%`, '出事的时候更容易摆平');
  return { lines, quirk: e.quirk ? QUIRK_TEXT[e.quirk] : null, salary: e.salary * mod(S, 'salaryMult') };
}
// 花 1 行动点亲自推进一个特殊项目
export function pushProject(S, uid) {
  const p = S.projects.find(x => x.uid === uid);
  if (!p || S.ap < 1) return null;
  return measure(S, () => {
    const a = S.founder.attrs, k = { res: a.tech, eng: a.tech, gpu: a.tech, ops: a.cha, biz: a.biz, legal: a.net, ap: (a.cha + a.net) / 2 }[p.kind] ?? 5;
    S.ap--; p.done += 1 + (k - 5) * 0.15;
    return { text: `你亲自下场推了一把「${p.name}」${p.done >= p.need ? '——只差月底验收了。' : '。'}` };
  });
}
// 把效果翻译成 P 社式的提示行：[文字, 好(true)/坏(false)/中性(null)]
const TEMP_INV = ['costMult', 'salaryMult', 'gpuPriceMult', 'exposeMult', 'apiCostMult', 'churnAdd'];
export function fxLines(S, fx) {
  const out = [];
  if (!fx) return out;
  const sg = v => (v > 0 ? '+' : '') + Math.round(v * 10) / 10, g = (name, v, pol = 1) => out.push([`${name} ${sg(v)}`, pol === 0 ? null : v * pol > 0]);
  for (const [k, v] of Object.entries(fx)) {
    if (k === 'cash') out.push([`现金 ${money(S, v * unit(S), true)}`, v > 0]);
    else if (k === 'cashAbs') out.push([`现金 ${money(S, v, true)}`, v > 0]);
    else if (k === 'hype') g('热度', v); else if (k === 'rep') g('口碑', v); else if (k === 'morale') g('士气', v);
    else if (k === 'reg') g('监管压力', v, -1); else if (k === 'bubble') g('泡沫', v, 0); else if (k === 'quality') g('产品体验', v);
    else if (k === 'usersPct') out.push([`用户 ${sg(v)}%`, v > 0]);
    else if (k === 'tech') g('模型能力', v);
    else if (k === 'bench') out.push([`跑分 ${sg(v)}（注水）`, null]);
    else if (k === 'quota') out.push([`显卡配额 ${sg(v)}%`, v > 0]);
    else if (k === 'equity') out.push([`股权 ${sg(v)}%`, v > 0]);
    else if (k === 'ap') out.push([`下月行动点 ${sg(v)}`, v > 0]);
    else if (k === 'attr') for (const a in v) out.push([`${ATTR_NAME[a]} ${sg(v[a])}（永久）`, v[a] > 0]);
    else if (k === 'dirt') { const type = typeof v === 'string' ? v : v.type; out.push([`留下黑料「${(typeof v === 'object' && v.name) || DIRT[type]?.name || type}」`, false]); }
    else if (k === 'cleanDirt') out.push(['清除黑料', true]);
    else if (k === 'expose') out.push(['引爆一张黑料', false]);
    else if (k === 'staff') out.push([{ loseBest: '失去最强的员工', loseRandom: '失去一名员工', loseCtx: '失去这名员工', gainStar: '顶级研究员加入' }[v] || '新员工加入', !/^lose/.test(v)]);
    else if (k === 'temp') for (const t of [].concat(v)) { const up = t.mult != null ? t.mult > 1 : t.add > 0; out.push([`${MOD_NAME[t.key] || t.key} ${t.mult != null ? '×' + t.mult : sg(t.add)}（${t.months || 6} 个月）`, TEMP_INV.includes(t.key) ? !up : up]); }
    else if (k === 'perk') out.push(['获得一张董事会卡', true]);
    else if (k === 'project') out.push([`开启特殊项目「${v.name}」`, null]);
    else if (k === 'end') out.push(['本局结束', null]);
    else if (k === 'ideo') { if (v.red) out.push([`共产 ${sg(v.red)}`, null]); if (v.cap) out.push([`资本 ${sg(v.cap)}`, null]); }
  }
  return out;
}

export function endMonth(S) {
  if (S.over) return;
  // 1. 算力：推理优先，剩下的进丹炉
  const need = inferNeed(S), have = S.gpu + brainGpu(S), free = Math.max(0, have - need);
  S.outage = need > have ? 1 - have / need : 0;
  if (S.outage > 0.05) news(S, `🔥 显卡不够用，用户看到的是「服务器繁忙，请稍后再试」（缺口 ${Math.round(S.outage * 100)}%）。`);
  if (S.ownModel && S.furnace?.on) {
    let gain = free * researchEff(S) * DATA_SOURCES[S.furnace.data].mult;
    const pBoom = clamp(0.07 - power(S, 'eng') / 600, 0.015, 0.07) * mod(S, 'boomMult');
    if (free > 0 && S.t > 3 && rnd(S) < pBoom) { gain = -S.E * 0.12; S.fxq.push(['boom']); news(S, '💥 炸炉了！loss 一夜之间变成 NaN，一部分火候灰飞烟灭。'); }
    S.E = Math.max(0, S.E + gain); S.furnace.months++;
    if (S.furnace.data === 'distill') S.E = Math.min(S.E, Math.max(0, EofCap(Math.max(...S.rivals.map(r => r.cap)) - 2) - baseE(S.t)));
  }
  // 2. 产品与功能
  const E = power(S, 'eng'), dm = mod(S, 'devMult');
  S.quality = clamp(S.quality + E * 0.08 * dm * Math.max(0, 1 - S.quality / qCeil(S)) - 0.6, 5, 100);
  if (S.sprint) {
    S.sprint.done += E * dm;
    if (S.sprint.done >= S.sprint.need) { const f = FEAT[S.sprint.id]; S.feats.push(f.id); S.featDone = { id: f.id, t: S.t }; applyFx(S, f.fx); news(S, `🧩 新功能「${f.name}」上线。`); S.fxq.push(['say', { text: `「${f.name}」上线啦！` }]); S.sprint = null; }
  }
  // 2.5 特殊项目（事件链）：按对应的人手 / 显卡推进，完成或超期都会触发后续事件
  const projEvents = [];
  for (const p of S.projects.slice()) {
    p.done += projectRate(S, p);
    const finished = p.done >= p.need;
    if (!finished && S.t + 1 < p.due) continue;
    S.projects = S.projects.filter(x => x !== p);
    news(S, finished ? `✅ 特殊项目「${p.name}」完成。` : `⌛ 特殊项目「${p.name}」超期，不了了之。`);
    const next = finished ? p.ok : p.fail;
    if (next) projEvents.push([next, p.ctx]);
  }
  // 3. 用户与钱
  growUsers(S);
  const rv = revenue(S), cs = costs(S);
  S.cash += rv.total - cs.total;
  S.last = { rev: rv.total, cost: cs.total, net: rv.total - cs.total, rv, cs };
  S.streak.profit = rv.total > cs.total ? S.streak.profit + 1 : 0;
  S.streak.x996 = String(S.policies.work) === '996' ? S.streak.x996 + 1 : 0;
  if (S.streak.x996 && S.streak.x996 % 8 === 0) addDirt(S, 'overwork');
  S.stats.maxUsers = Math.max(S.stats.maxUsers, S.users);
  // 显卡配额跟着采购走：租满配额的老客户，供应商每月多给 7%；超租的部分有三成半转成长约；闲置过半就慢慢收回
  {
    const q = Math.max(1, quota(S)), k = Math.max(0.05, (1 + S.quotaAdd) * mod(S, 'quotaMult'));
    if (S.gpu >= 0.85 * q) S.quotaEarn = (S.quotaEarn || 0) + (0.07 * q + 0.35 * Math.max(0, S.gpu - q)) / k;
    else if (S.gpu < 0.5 * q) S.quotaEarn = (S.quotaEarn || 0) * 0.97;
  }
  // 4. 仪表
  const rw = runway(S);
  S.hype = clamp(S.hype * (1 - (0.11 + Math.max(0, S.hype - 60) * 0.002) * mod(S, 'hypeDecayMult')), 0, 100);
  S.morale = clamp(S.morale + (60 - S.morale) * 0.1 + mod(S, 'moraleAdd') - (rw < 3 ? 2 : 0), 0, 100);
  S.rep = clamp(S.rep + mod(S, 'repAdd') + (S.quality > 70 ? 0.3 : S.quality < 30 ? -0.3 : 0) - S.outage * 4, 0, 100);
  const dr = 0.7 + S.hype / 90 + Math.log10(1 + S.users) / 3.5 + (S.co.track === 'companion' ? 0.3 : 0) + mod(S, 'regAdd');
  S.reg = clamp(S.reg + (dr > 0 ? dr * mod(S, 'regMult') : dr), 0, 100);
  S.bubble = clamp(S.bubble + (S.burstT ? rf(S, 0.1, 0.8) : rf(S, 0.4, 1.5)), 0, 100);
  S.gpuBase = clamp(S.gpuBase + rf(S, -0.06, 0.07), 1.1, 2.1);
  S.apiIdx = clamp(S.apiIdx * rf(S, 0.97, 1.01), 0.4, 1.6);
  // 5. 对手
  for (const r of S.rivals) {
    r.drift = clamp(r.drift + rf(S, -0.3, 0.3), -4, 4);
    r.cap = Math.min(AGI_CAP - 0.5, frontier(S.t + 1) + r.off + r.drift);
    r.hype *= 0.93;
    if (--r.next <= 0) { r.ver++; r.bench = r.cap + r.cheat + rf(S, -1, 1.5); r.next = ri(S, 4, 8); r.hype = clamp(r.hype + 18, 0, 100); news(S, `📣 ${r.name} 发布 ${r.model}-${r.ver}，跑分 ${r.bench.toFixed(1)}。${r.boss}：「感受一下。」`); }
  }
  // 6. 团队
  if (S.morale < 25 && S.staff.length && rnd(S) < 0.3) { const e = pick(S, S.staff.filter(x => x.quirk !== 'loyal').length ? S.staff.filter(x => x.quirk !== 'loyal') : S.staff); removeStaff(S, e.uid); news(S, `👋 士气太低，${e.name}（${ROLES[e.role].name}）提了离职。`); }
  ideoMonth(S, API);                                                  // 路线之争：读书会招新、末位淘汰
  // 7. 时间推进
  S.t++;
  S.temp = S.temp.filter(tm => tm.until > S.t);
  for (const k in S.cd) if (S.cd[k] <= S.t) delete S.cd[k];
  S.hist.push([Math.round(S.cash), +S.users.toFixed(1), Math.round(valuation(S))]);
  if (S.t % 2 === 0 && NEWS.length) news(S, '📰 ' + fmt(S, pick(S, NEWS)));
  refreshCands(S);
  S.ap = clamp(apMax(S) + S.apNext, 1, 7); S.apNext = 0;
  // 成就
  if (S.users >= 100) award(S, 'm100');
  if (S.users >= 10000) award(S, 'y1');
  if (S.streak.x996 >= 24) award(S, 'x996');
  if (S.stage === 0 && S.t >= 25) award(S, 'boot');
  if (rank(S) === 1) { award(S, 'top1'); if (S.model.infl >= 4) award(S, 'fake1'); }

  // 8. 结局与本月事件
  if (S.t > MONTHS) {
    const val = valuation(S);
    return endGame(S, val >= 4e6 ? 'giant' : val >= 1e5 ? 'unicorn' : S.streak.profit >= 3 ? 'small' : 'zombie');
  }
  if (S.cash < 0) {
    if (S.perks.includes('phoenix') && !S.flags.phoenixUsed) { S.flags.phoenixUsed = 1; S.cash = 6 * unit(S); S.fxq.push(['money']); news(S, '🔥 「东山再起」生效：一笔神秘资金在最后一刻到账。'); }
    else if (S.flags.revive) { delete S.flags.revive; S.cash = 4 * unit(S); news(S, '👪 家里人默默把钱打了过来，附言：「最后一次。」'); }
    else S.q.push({ type: 'event', id: 'broke' });
  }
  // 黑料曝光（每月最多一张）
  for (const d of S.dirt) {
    if (S.t - d.t >= 2 && rnd(S) < exposeP(S, d)) { S.q.push({ type: 'scandal', uid: d.uid }); break; }
  }
  // 定时与连锁事件
  for (const s of S.sched.filter(s => s.at <= S.t)) { S.seen[s.id] = S.t; S.q.push({ type: 'event', id: s.id, ctx: s.ctx }); }
  S.sched = S.sched.filter(s => s.at > S.t);
  // 系统事件
  if (S.t % 12 === 1) queueEvent(S, 'year_board');
  if (S.vam && S.t >= S.vam.due) queueEvent(S, 'vam_due');
  if (S.reg >= 100 && !S.cd.crack) { S.cd.crack = S.t + 10; queueEvent(S, 'crackdown'); }
  if (!S.burstT && S.t > 24 && ((S.bubble >= 78 && rnd(S) < 0.14) || (S.t >= 56 && rnd(S) < 0.12))) queueEvent(S, 'bubble_burst');
  if (S.stage >= 2 && !S.cd.coup && ((S.equity < 45 && (S.rep < 30 || S.morale < 28 || S.exposed >= 35) && rnd(S) < 0.35) || (S.equity < 25 && rnd(S) < 0.04))) { S.cd.coup = S.t + 18; queueEvent(S, 'coup'); }
  if (S.stage >= 2 && !S.cd.acq && rnd(S) < 0.04 + (S.hype > 60 ? 0.03 : 0)) { S.cd.acq = S.t + 14; queueEvent(S, 'acq_offer', { rival: pick(S, S.flags.red ? S.rivals.filter(r => EAST_RIVALS.includes(r.id)) : S.rivals.slice(0, 4)).id }); }   // 红色公司：西方巨头不再来收购
  for (const [id, ctx] of projEvents) queueEvent(S, id, ctx);
  // 随机事件
  const n = S.tut?.on && S.t <= 2 ? 0 : (rnd(S) < 0.82 ? 1 : 0) + (S.t > 10 && rnd(S) < 0.18 ? 1 : 0);
  for (let i = 0; i < n; i++) { const ev = pickRandomEvent(S); if (ev) { S.lastCat = ev.cat; queueEvent(S, ev.id); } }
}

// ───────── 结局与局外成长 ─────────
export function endGame(S, id, extra = {}) {
  if (S.over) return;
  S.over = { id, t: S.t, val: valuation(S), users: S.users, ...extra };
  S.q.length = 0;
  if (id === 'jail') award(S, 'sewing');
  if (id === 'ipo') award(S, 'ipo');
  if (id === 'agi_good' || id === 'agi_bad') award(S, 'agi');
  if (ENDINGS[id].good && !S.hadDirt) award(S, 'clean');
  if (S.flags.nakedSwim && !['bankrupt', 'jail'].includes(id)) award(S, 'winter');
}
const META_KEY = 'ldt_meta_v1', SAVE_KEY = 'ldt_save_v1';
const store = { get: k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 隐私模式下存不了就算了 */ } }, del: k => { try { localStorage.removeItem(k); } catch { /* 同上 */ } } };
export const loadMeta = () => ({ points: 0, own: {}, ach: {}, ends: {}, runs: 0, best: 0, ...(store.get(META_KEY) || {}) });
export const saveMeta = m => store.set(META_KEY, m);
export const saveGame = S => store.set(SAVE_KEY, S);
export const loadGame = () => {                                      // 兼容旧存档
  const S = store.get(SAVE_KEY); if (!S || S.v !== 1 || S.over) return null;
  S.projects ??= []; S.chains ??= {}; S.quotaAdd ??= 0; S.co.office = clamp(S.co.office | 0, 1, OFFICES.length - 1);
  if (S.quotaEarn == null) S.quotaEarn = Math.max(0, S.quotaBase * (OLD_QUOTA_MULT[S.stage] ?? 1) - quotaFloor(S));   // 老存档的配额按轮次算：差额记成「长约」，别让玩家一读档就被现货价坑
  return S;
};
export const clearSave = () => store.del(SAVE_KEY);
export const traitLocked = (meta, t) => !!t.cost && !meta.own['t_' + t.id];
export function buyMeta(meta, id) {
  const it = META_SHOP.find(x => x.id === id);
  if (!it || meta.own[id] || meta.points < it.cost || (it.need && !meta.own[it.need])) return false;
  meta.points -= it.cost; meta.own[id] = 1; saveMeta(meta); return true;
}
// 结算：算分、发人脉点、记图鉴。每局只调用一次。
export function finalize(S, meta) {
  const o = S.over, E = ENDINGS[o.id];
  const score = Math.round(E.base + Math.log10(Math.max(10, o.val * S.equity / 100)) * 6 + Math.min(S.t, MONTHS) / 4 + S.perks.length - S.exposed / 6 + (o.id === 'acquired' ? 10 : 0));
  const newAch = S.ach.filter(a => !meta.ach[a]), newEnd = !meta.ends[o.id];
  for (const a of S.ach) meta.ach[a] = 1;
  meta.ends[o.id] = (meta.ends[o.id] || 0) + 1;
  if (Object.keys(meta.ends).length >= 8 && !meta.ach.allend) { meta.ach.allend = 1; newAch.push('allend'); }
  const points = Math.max(1, Math.round(score / 14)) + newAch.length * 2 + (newEnd ? 3 : 0);
  meta.points += points; meta.runs++; meta.best = Math.max(meta.best, score);
  saveMeta(meta); clearSave();
  return { score, points, newAch, newEnd, ending: E, text: fmt(S, E.text).replace('{pay}', money(S, o.pay || 0)) };
}

// 给核心事件里的函数用的工具箱
export const API = { dateStr, refreshCands, cond, fmt, clamp, rnd, rf, ri, pick, money, fmtUsers, mod, power, unit, runway, valuation, perf, rank, board, quota, costs, revenue, applyFx, addDirt, removeDirt, addStaff, genStaff, removeStaff, optCheck, optOdds, pCheck, endGame, award, news, queueEvent, gainPerk, capOf, EofCap, frontier, myCap, baseE, rivalOf, usesOwn, teamCap, STAGES, AGI_CAP, market, measure, projectRate };

// 《炼丹大亨》界面层：DOM 浮层，负责渲染、接收点击、调度引擎和 3D 场景。
import * as G from '../game/engine.js';
import * as A from '../game/actions.js';
import { ATTRS, REGIONS, ROUTES, TRACKS, TRAITS, TRAIT, OUTFITS, officeName, ROLES, STAFF_QUIRKS, POLICIES, PERK, FEAT, STAGES, DATA_SOURCES, DIRT, ENDINGS, ACHIEVEMENTS, META_SHOP, CAT, MONTHS, MOD_NAME, KIND_NAME } from '../data/defs.js';
import { CHAINS } from '../data/events_chains.js';
import { LOGOS, BRAND_COLORS, logoSVG, logoDataURL } from './logos.js';
import { artURL, ENDING_ART } from './art.js';
import { avatarSVG } from './avatar.js';
import { advanceTutorial, currentTip, dismissTip, isOpen, actOpen, ltabOpen, rtabOpen, gaugeOpen, chipOpen, rightOpen } from './tutorial.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nl = s => esc(s).replace(/\n/g, '<br>');
const pct = (a, b) => (b > 0 ? Math.min(100, a / b * 100) : 0);
const rnd = arr => arr[Math.floor(Math.random() * arr.length)];

let S = null, meta = G.loadMeta(), office = null, ui = null, toastTimer = 0, lastEl = null;
const V = { screen: 'title', ltab: 'rd', rtab: 'board', dlg: null, res: null, toast: null, W: null, summary: null, wait: false };

// 极简音效：WebAudio 现场合成，不依赖任何音频文件
let ac = null, muted = false;
try { muted = localStorage.getItem('ldt_mute') === '1'; } catch { /* 读不到就默认开声音 */ }
const SFX = { click: [[660, 0.04]], turn: [[392, 0.06], [523, 0.09]], coin: [[880, 0.07], [1320, 0.14]], good: [[523, 0.09], [659, 0.09], [784, 0.18]], bad: [[220, 0.16], [165, 0.24]] };
function sfx(kind) {
  if (muted) return;
  try {
    ac ??= new (window.AudioContext || window.webkitAudioContext)();
    let t = ac.currentTime;
    for (const [f, d] of SFX[kind] || SFX.click) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = kind === 'bad' ? 'sawtooth' : 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(kind === 'click' ? 0.03 : 0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d); t += d * 0.8;
    }
  } catch { /* 没声音也能玩 */ }
}
const FX_SOUND = { money: 'coin', confetti: 'good', levelup: 'good', alarm: 'bad', boom: 'bad' };

const RAND = {
  bay: { name: ['Kevin Wang', 'Alice Chen', 'Jason Lin', 'Mia Zhou', 'Leo Xu', 'Grace Liu'], co: ['Chaos Labs', '无限进步', 'Gradient', '奇点临近', 'Hallucinate', '第一性原理'] },
  sz: { name: ['王多鱼', '李想想', '陈不卷', '赵天选', '林有钱', '周加班'], co: ['混沌智能', '深度幻觉', '玄学科技', '梯度消失', '大力神科技', '搞钱智能'] },
  model: ['混沌', '悟空', '丹炉', '玄武', '夸父', 'Hallu', '太上', '盘古'],
};
const TITLE_STAFF = ['res', 'eng', 'eng', 'ops', 'biz', 'legal', 'res'].map((role, i) => ({ id: 't' + i, role, mood: 60 + i * 5 }));
const LONGHAIR = `<svg class="art" width="118" height="118" viewBox="0 0 120 120"><path d="M26 60Q22 14 60 12Q98 14 94 60L98 104Q88 96 84 70L36 70Q32 96 22 104Z" fill="#2b2220" stroke="#1e2233" stroke-width="3"/><ellipse cx="60" cy="56" rx="26" ry="29" fill="#f3c9a3" stroke="#1e2233" stroke-width="3"/><path d="M34 46Q40 22 60 24Q80 22 86 46Q72 34 60 38Q48 34 34 46Z" fill="#2b2220"/><rect x="38" y="48" width="18" height="13" rx="3" fill="#fff" stroke="#111" stroke-width="3.5"/><rect x="64" y="48" width="18" height="13" rx="3" fill="#fff" stroke="#111" stroke-width="3.5"/><path d="M56 54h8" stroke="#111" stroke-width="3.5"/><circle cx="47" cy="55" r="2.5"/><circle cx="73" cy="55" r="2.5"/><ellipse cx="60" cy="74" rx="8" ry="6" fill="#7a1f1f" stroke="#1e2233" stroke-width="2.5"/><path d="M30 118Q32 92 60 92Q88 92 90 118Z" fill="#c8402f" stroke="#1e2233" stroke-width="3"/><path d="M44 94v24M60 92v26M76 94v24M32 106h56" stroke="#7a1f1f" stroke-width="2" opacity=".7"/></svg>`;
const brandLogo = (co, size) => (co?.logo ? logoSVG(co.logo, co.brand, size) : '⚗️');

// ───────── 标题 / 建角 / 局外 ─────────
function title() {
  const save = G.loadGame();
  return `<section class="title"><h1>炼丹大亨</h1><p class="sub">AI 创业肉鸽模拟器 · 湾区 / 深圳 · 2023—2028</p>
  <div class="tbtns"><button class="btn big go" data-a="new">开始创业</button>
  ${save ? `<button class="btn big" data-a="continue">继续上一局<small>${esc(save.co.name)} · ${G.dateStr(save.t)}</small></button>` : ''}
  <button class="btn" data-a="meta">局外成长 · 图鉴<small>人脉点 ${meta.points}</small></button></div>
  <p class="fine">本游戏所有人物、公司、事件纯属虚构恶搞；如有雷同，那是现实在抄袭游戏。<br>已创业 ${meta.runs} 次 · 最高分 ${meta.best}</p></section>`;
}
const firstOf = (group, region) => TRAITS[group].find(t => !t.region || t.region === region).id;
function newWizard() {
  const region = 'bay', attrs = Object.fromEntries(ATTRS.map(a => [a.id, 5]));
  return {
    step: 0, name: rnd(RAND[region].name), coName: rnd(RAND[region].co), modelName: rnd(RAND.model), region, attrs, pts: 10 + (meta.own.m_point ? 1 : 0) + (meta.own.m_point2 ? 1 : 0),
    edu: 'yao', bg: 'bigtech', quirk: 'none', motto: 'm_allin', outfit: 'turtleneck', route: 'model', track: 'chat',
    cofounder: 'c_solo', seed: 's_self', district: firstOf('district', region), mission: 'v_agi', logo: LOGOS[region][0].id, brand: BRAND_COLORS[0],
    tutorial: meta.runs === 0,                                               // 第一次玩默认开新手教学
  };
}
const ptsLeft = W => W.pts - ATTRS.reduce((a, x) => a + W.attrs[x.id] - 5, 0);
const wizTraits = W => [W.edu, W.bg, W.quirk, W.motto, W.cofounder, W.seed, W.district, W.mission];
function startPreview(W) {                                            // 和引擎的结算顺序保持一致
  let cash = REGIONS[W.region].cash, eq = 100;
  for (const id of wizTraits(W)) { const st = TRAIT[id]?.start; if (!st) continue; cash += st.cash || 0; cash *= st.cashMult || 1; eq += st.equity || 0; }
  return { cash: cash + (meta.own.m_cash ? 60 : 0), eq };
}
function wizard() {
  const W = V.W, steps = ['你是谁', '属性', '出身', '公司', '品牌'], R = REGIONS[W.region];
  const grp = (k, t, cls = 'cards3') => `<h2>${t}</h2><div class="${cls}">${TRAITS[k].filter(x => !x.region || x.region === W.region).map(x => {
    const lock = G.traitLocked(meta, x);
    return `<button class="pick sm ${W[k] === x.id ? 'on' : ''} ${lock ? 'lock' : ''}" data-a="w:pick:${k}:${x.id}" ${lock ? 'disabled' : ''}><span class="pi">${lock ? '🔒' : x.icon}</span><b>${x.name}</b><small>${lock ? `局外成长解锁（${x.cost} 人脉点）` : x.desc}</small></button>`;
  }).join('')}</div>`;
  let body = '';
  if (W.step === 0) {
    body = `<h2>你叫什么？</h2><div class="form"><label>创始人<input data-f="name" maxlength="12" value="${esc(W.name)}"></label><button class="btn sm" data-a="w:rand">🎲 随机</button></div>
    <h2>在哪儿创业？</h2><div class="cards2">${Object.values(REGIONS).map(r => `<button class="pick ${W.region === r.id ? 'on' : ''}" data-a="w:region:${r.id}"><span class="pi">${r.icon}</span><b>${r.name}</b><em>${r.tagline}</em><ul>${r.desc.map(d => `<li>${d}</li>`).join('')}</ul><small>启动资金 ${r.cur}${r.cash} 万</small></button>`).join('')}</div>
    <h2>平时穿什么？</h2><div class="cards4">${OUTFITS.map(o => `<button class="pick sm ${W.outfit === o.id ? 'on' : ''}" data-a="w:pick:outfit:${o.id}"><span class="pi">${o.icon}</span><b>${o.name}</b><small>${o.desc}</small></button>`).join('')}</div>
    ${grp('motto', '口头禅')}`;
  } else if (W.step === 1) {
    const left = ptsLeft(W);
    body = `<h2>分配属性<small>还剩 <b class="pts">${left}</b> 点 · 所有属性从 5 起步，单项最高 10</small></h2>${ATTRS.map(a => `<div class="attr"><span class="ai">${a.icon}</span><div><b>${a.name}</b><small>${a.desc}</small></div><div class="stepper"><button class="btn sm" data-a="w:attr:${a.id}:-1" ${W.attrs[a.id] <= 5 ? 'disabled' : ''}>−</button><b>${W.attrs[a.id]}</b><button class="btn sm" data-a="w:attr:${a.id}:1" ${left <= 0 || W.attrs[a.id] >= 10 ? 'disabled' : ''}>＋</button></div><div class="pips">${'<i class="on"></i>'.repeat(W.attrs[a.id])}${'<i></i>'.repeat(10 - W.attrs[a.id])}</div></div>`).join('')}`;
  } else if (W.step === 2) {
    body = grp('edu', '学历') + grp('bg', '经历') + grp('quirk', '怪癖');
  } else if (W.step === 3) {
    body = `<h2>走哪条路？</h2><div class="cards2">${Object.values(ROUTES).map(r => `<button class="pick ${W.route === r.id ? 'on' : ''}" data-a="w:pick:route:${r.id}"><span class="pi">${r.icon}</span><b>${r.name}</b><em>${r.sub}</em><ul>${r.desc.map(d => `<li>${d}</li>`).join('')}</ul></button>`).join('')}</div>
    <h2>做什么产品？</h2><div class="cards4">${Object.values(TRACKS).map(t => `<button class="pick sm ${W.track === t.id ? 'on' : ''}" data-a="w:pick:track:${t.id}"><span class="pi">${t.icon}</span><b>${t.name}</b><small>${t.desc}</small></button>`).join('')}</div>
    ${grp('cofounder', '和谁一起干？')}${grp('seed', '第一笔钱哪儿来？')}${grp('district', '在哪儿落脚？')}`;
  } else {
    const pv = startPreview(W), ms = TRAIT[W.mission];
    body = `<h2>给公司起名</h2><div class="form"><label>公司<input data-f="coName" maxlength="10" value="${esc(W.coName)}"></label><label>模型系列<input data-f="modelName" maxlength="8" value="${esc(W.modelName)}"></label><button class="btn sm" data-a="w:randco">🎲 随机</button></div>
    <h2>选一个 Logo<small>${W.region === 'sz' ? '国内互联网公司的传统：挑一只动物' : '湾区 AI 公司的传统：一个圆，稍微变个形（网友统称「菊花」）'}</small></h2>
    <div class="logos">${LOGOS[W.region].map(l => `<button class="lgp ${W.logo === l.id ? 'on' : ''}" data-a="w:pick:logo:${l.id}">${logoSVG(l.id, W.brand, 50)}<b>${l.name}</b><small>${l.desc}</small></button>`).join('')}</div>
    <h2>品牌色</h2><div class="swatches">${BRAND_COLORS.map(c => `<button class="sw ${W.brand === c ? 'on' : ''}" style="--c:${c}" data-a="w:brand:${c}" aria-label="品牌色 ${c}"></button>`).join('')}</div>
    ${grp('mission', '公司使命（写在官网首页的那句）', 'cards2')}
    <div class="brandcard">${logoSVG(W.logo, W.brand, 64)}<div><h3 data-live="co">${esc(W.coName)}</h3><p>${ms.name}</p></div><div class="nums"><small>启动资金</small><b>${R.cur}${Math.round(pv.cash)} 万</b><small>你的股权 ${pv.eq}%</small></div></div>
    <label class="chkline"><input type="checkbox" data-f="tutorial" ${W.tutorial ? 'checked' : ''}> <b>新手教学</b>：学长老周带着你，一样一样开放系统（第一次玩建议开着；老手可以关掉，开局全部开放）</label>`;
  }
  return `<section class="wizard panel"><div class="wsteps">${steps.map((s, i) => `<span class="${i === W.step ? 'on' : i < W.step ? 'done' : ''}">${i + 1}. ${s}</span>`).join('')}</div><div class="wbody scroll" data-sc="w${W.step}">${body}</div>
  <div class="wfoot"><button class="btn ghost" data-a="${W.step ? 'w:step:-1' : 'back'}">← ${W.step ? '上一步' : '返回'}</button>${W.step === 1 && ptsLeft(W) > 0 ? `<small>还有 ${ptsLeft(W)} 点没分配</small>` : ''}${W.step < 4 ? '<button class="btn big" data-a="w:step:1">下一步 →</button>' : '<button class="btn big go" data-a="w:start">开张！🚀</button>'}</div></section>`;
}
function metaScreen() {
  return `<section class="wizard panel"><div class="wsteps"><span class="on">局外成长</span><b class="mp">人脉点 ${meta.points}</b></div><div class="wbody scroll" data-sc="m">
  <h2>人脉商店<small>每局结算都会获得人脉点</small></h2><div class="shop">${META_SHOP.map(it => { const own = meta.own[it.id], lock = it.need && !meta.own[it.need]; return `<button class="pick sm ${own ? 'on' : ''}" data-a="buy:${it.id}" ${own || lock || meta.points < it.cost ? 'disabled' : ''}><b>${it.name}</b><small>${own ? '已拥有' : lock ? '需要先买前一级' : `${it.cost} 人脉点`}</small></button>`; }).join('')}</div>
  <h2>结局图鉴<small>${Object.keys(meta.ends).length}/${Object.keys(ENDINGS).length}</small></h2><div class="gal">${Object.entries(ENDINGS).map(([id, e]) => (meta.ends[id] ? `<span class="got" title="达成 ${meta.ends[id]} 次">${e.icon} ${e.name}</span>` : '<span>❓ ？？？</span>')).join('')}</div>
  <h2>成就<small>${Object.keys(meta.ach).length}/${Object.keys(ACHIEVEMENTS).length}</small></h2><div class="gal">${Object.entries(ACHIEVEMENTS).map(([id, a]) => `<span class="${meta.ach[id] ? 'got' : ''}" title="${esc(a.desc)}">${meta.ach[id] ? a.icon : '🔒'} ${a.name}</span>`).join('')}</div>
  </div><div class="wfoot"><button class="btn ghost" data-a="back">← 返回</button></div></section>`;
}

// ───────── 经营主界面 ─────────
const chip = (ic, label, val, sub, cls = '') => `<div class="chip ${cls}"><span class="ci">${ic}</span><div><b><label>${label}</label>${val}</b><small>${sub}</small></div></div>`;
const skillDots = n => `<span class="dots">${'<i class="on"></i>'.repeat(n)}${'<i></i>'.repeat(10 - n)}</span>`;
function topbar() {
  const net = G.revenue(S).total - G.costs(S).total, rw = G.runway(S), apm = Math.max(G.apMax(S), S.ap);
  return `<header class="top panel"><div class="brand"><span class="logo" data-a="menu" title="菜单">${brandLogo(S.co, 36)}</span><div><b>${esc(S.co.name)}</b><span class="stage">${STAGES[S.stage].name}</span><br><small>${G.dateStr(Math.min(S.t, MONTHS))} · 第 ${Math.min(S.t, MONTHS)}/${MONTHS} 月 · ${REGIONS[S.co.region].name}${officeName(S)}</small></div></div>
  <div class="chips">${chip('💰', '现金', G.money(S, S.cash), `${G.money(S, net, true)}/月 · ${rw >= 99 ? '盈利中' : `还能撑 ${rw < 1 ? '不到 1' : Math.floor(rw)} 个月`}`, net < 0 && rw < 4 ? 'bad' : net >= 0 ? 'good' : '')}
  ${chipOpen(S, 'val') ? chip('📈', '估值', G.money(S, G.valuation(S)), `业绩系数 ${G.perf(S).toFixed(2)}`) : ''}
  ${!chipOpen(S, 'users') ? '' : chip('👥', '用户', G.fmtUsers(S.users + S.fake), S.fake > 0.5 ? `其中 ${G.fmtUsers(S.fake)} 是刷的` : `占市场 ${(S.users / G.market(S) * 100).toFixed(1)}%`)}
  ${!chipOpen(S, 'rank') ? '' : S.model ? chip('🏆', '榜单', `第 ${G.rank(S)} 名`, `${esc(S.model.name)} · ${S.model.bench.toFixed(1)} 分`) : chip('🥚', '模型', '套壳中', `${esc(G.rivalOf(S, S.upstream).name)} 的 API`)}
  ${!chipOpen(S, 'equity') ? '' : chip('🥧', '股权', S.equity.toFixed(0) + '%', S.equity < 45 ? '小心董事会' : '你说了算', S.equity < 30 ? 'bad' : '')}</div>
  <div class="turn"><div class="ap" title="行动点">${'<i class="on"></i>'.repeat(Math.max(0, S.ap))}${'<i></i>'.repeat(Math.max(0, apm - S.ap))}</div><button class="btn big next" data-a="next">下个月 ▶</button></div></header>`;
}
function actCard(a) {
  const st = A.actionState(S, a);
  return `<button class="act ${st.why ? 'off' : ''} ${a.shady ? 'shady' : ''}" data-a="act:${a.id}" ${st.why ? 'disabled' : ''}><span class="ic">${a.icon}</span><span class="bd"><b>${a.shady ? '☠ ' : ''}${a.name}</b><small>${esc(a.desc(S))}</small>${st.why ? `<em>${esc(st.why)}</em>` : ''}</span><span class="cost"><i>${'●'.repeat(a.ap)}</i>${st.cost > 0 ? `<u>${G.money(S, st.cost)}</u>` : ''}</span></button>`;
}
function person(e, btn) {
  return `<div class="cand ${V.pop?.uid === e.uid ? 'on' : ''}" data-a="who:${e.uid}" title="点一下，看看这个人能带来什么">${avatarSVG(e.uid, e.role, 36)}<span class="bd"><b>${esc(e.name)}</b> <small>${ROLES[e.role].name}${e.quirk ? ` · <i class="q">${STAFF_QUIRKS[e.quirk].name}</i>` : ''}</small><br>${skillDots(e.skill)} <small>月薪 ${G.money(S, e.salary * G.mod(S, 'salaryMult'))}</small></span>${btn}</div>`;
}
function candList() {
  const cap = G.teamCap(S);
  return `<h4>候选人<small>团队 ${S.staff.length}/${cap} · 每招一人花 1 行动点 + 一个月工资</small></h4>` + (S.cands.length ? S.cands.map(c => {
    const why = S.ap < 1 ? '行动点不够' : S.staff.length >= cap ? '工位满了' : S.cash < c.salary * G.mod(S, 'salaryMult') ? '钱不够' : '';
    return person(c, `<button class="btn sm" data-a="hire:${c.uid}" ${why ? `disabled title="${why}"` : ''}>招</button>`);
  }).join('') : '<p class="empty">这个月没有合适的人。下个月再看，或者找猎头。</p>');
}
function opsPanel() {
  let h = '';
  if (S.ownModel) {
    const q = G.quota(S), need = G.inferNeed(S), price = G.gpuPrice(S);
    h += `<h4 style="border:0;margin-top:0;padding-top:0">显卡<small>${G.money(S, price)}/张·月 · 配额 ${q} 张</small></h4><div class="gpu"><div class="gpubar"><i class="infer" style="width:${pct(Math.min(need, S.gpu), q)}%"></i><i class="train" style="width:${pct(Math.max(0, S.gpu - need), q)}%"></i></div>
    <div class="gpurow"><button class="btn sm" data-a="gpu:min">0</button><button class="btn sm" data-a="gpu:-">−</button><b>${S.gpu} 张</b><button class="btn sm" data-a="gpu:+">＋</button><button class="btn sm" data-a="gpu:max">拉满</button></div>
    <small><b style="color:var(--sky)">■</b> 推理 ${Math.min(need, S.gpu)}/${need} 张${need > S.gpu ? ' <b class="bad">不够！用户在看「服务器繁忙」</b>' : ''} · <b style="color:var(--coral)">■</b> 炼丹 ${Math.max(0, S.gpu - need)} 张<br>月租 ${G.money(S, S.gpu * price)}。推理优先，剩下的显卡才进丹炉。</small></div>`;
  } else {
    h += `<p class="note">产品跑在 <b>${esc(G.rivalOf(S, S.upstream).name)}</b> 的 API 上（模型能力 ${G.upCap(S).toFixed(0)}），本月 API 账单约 ${G.money(S, G.costs(S).api)}。想摆脱上游，去「研发」里立项自研。</p>`;
  }
  if (isOpen(S, 'policy')) h += Object.entries(POLICIES).map(([k, P]) => `<h4>${P.name}</h4><div class="seg">${Object.entries(P.opts).map(([v, o]) => `<button class="${String(S.policies[k]) === v ? 'on' : ''}" data-a="pol:${k}:${v}" title="${esc(o.desc)}">${o.name}</button>`).join('')}</div><small class="note">${esc(P.opts[S.policies[k]].desc)}</small>`).join('');
  return h + '<h4>行动</h4>';
}
function leftPanel() {
  if (!ltabOpen(S, V.ltab)) V.ltab = 'rd';                                  // 教学期间：没开放的页签不显示
  const acts = A.ACTIONS.filter(a => a.tab === V.ltab && (!a.show || a.show(S)) && actOpen(S, a.id)).map(actCard).join('') || '<p class="empty">这里暂时没有可做的事。</p>';
  return `<aside class="left panel"><nav class="tabs">${A.TABS.filter(t => ltabOpen(S, t.id)).map(t => `<button class="tab ${V.ltab === t.id ? 'on' : ''}" data-a="ltab:${t.id}">${t.icon}<span>${t.name}</span></button>`).join('')}</nav>
  <div class="scroll" data-sc="l-${V.ltab}">${V.ltab === 'ops' ? opsPanel() + acts : acts + (V.ltab === 'team' ? candList() : '')}</div></aside>`;
}
const RTABS = [['board', '🏆', '榜单'], ['chain', '📌', '项目'], ['team', '👥', '团队'], ['safe', '🗄️', '黑料'], ['perks', '🃏', '卡牌'], ['fin', '🧾', '账本'], ['log', '📰', '日志']];
// 情境日志：进行中的特殊项目 + 各条事件链的进展
function chainTab() {
  const proj = S.projects.map(p => {
    const rate = G.projectRate(S, p), left = Math.max(0, p.need - p.done), ch = CHAINS[p.chain];
    const eta = left <= 0 ? '月底验收' : p.kind === 'ap' ? '只能靠你亲自推' : rate > 0.01 ? `约 ${Math.ceil(left / rate)} 个月` : '停滞：没有人手或显卡';
    return `<div class="proj"><b>${ch ? ch.icon : '📌'} ${esc(p.name)}</b><small>${esc(p.desc)}</small><div class="bar"><i style="width:${pct(p.done, p.need)}%"></i></div><small>${KIND_NAME[p.kind]} · ${eta} · 期限 ${G.dateStr(p.due)}${p.due - S.t <= 2 && left > 0 ? ' <b class="bad">快超期了</b>' : ''}</small><button class="btn sm" data-a="push:${p.uid}" ${S.ap < 1 || left <= 0 ? 'disabled' : ''}>亲自攻关 ●</button></div>`;
  }).join('');
  const logs = Object.values(S.chains).sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || b.t - a.t).map(c => {
    const ch = CHAINS[c.id] || { title: c.id, icon: '📜' };
    return `<div class="chainlog ${c.done ? 'done' : ''}"><b>${ch.icon} ${ch.title}</b>${c.done ? '<i>已完结</i>' : ''}${c.notes.slice().reverse().map(n => `<p><small>${G.dateStr(n.t)}</small>${esc(n.text)}</p>`).join('')}</div>`;
  }).join('');
  return (proj || '<p class="empty">目前没有进行中的特殊项目。有些事件会开启一条「事件链」，需要你投入研究员、工程师、显卡或者亲自花行动点去推进，这里会显示进度。</p>') + (logs ? `<h4>情境日志</h4>${logs}` : '');
}
function rightBody() {
  if (V.rtab === 'board') {
    const rows = G.board(S), max = Math.max(...rows.map(r => r.bench)), min = Math.min(...rows.map(r => r.bench)) - 6;
    return `<div class="lb">${rows.map((r, i) => `<div class="row ${r.me ? 'me' : ''}"><span class="rk">${i + 1}</span><span class="nm"><b>${esc(r.name)}</b><small>${esc(r.model)}</small></span><span class="bar"><i style="width:${Math.max(4, (r.bench - min) / (max - min) * 100)}%;background:${r.me ? S.co.brand || '#ff6b4a' : G.rivalOf(S, r.id)?.color || '#888'}"></i></span><span class="sc">${r.bench.toFixed(1)}</span></div>`).join('')}</div>
    <p class="note">行业前沿 ${G.frontier(S.t).toFixed(1)}${S.ownModel ? ` · 你的丹炉火候 ${G.myCap(S).toFixed(1)}` : ''}。榜单排的是对外跑分——谁都可能注了水。</p>`;
  }
  if (V.rtab === 'chain') return chainTab();
  if (V.rtab === 'team') return `<p class="note">团队 ${S.staff.length}/${G.teamCap(S)} 人 · 月薪合计 ${G.money(S, G.costs(S).salary)}</p>` + (S.staff.length ? S.staff.map(e => person(e, `<button class="btn sm ghost" data-a="fire:${e.uid}" title="裁掉（赔 2 个月工资）">✕</button>`)).join('') : '<p class="empty">公司目前只有你一个人。去左边「团队」招人。</p>');
  if (V.rtab === 'safe') return (S.dirt.length ? S.dirt.map(d => `<div class="dirt"><b>${esc(d.name)}</b>${DIRT[d.type]?.crime ? '<i>涉嫌违法</i>' : ''}<div class="bar"><i style="width:${Math.min(100, d.sev * 2.5)}%"></i></div><small>严重度 ${Math.round(d.sev)} · ${G.dateStr(d.t)}留下</small></div>`).join('') : '<p class="empty">保险柜是空的。你是个体面人——暂时。</p>')
    + `<p class="note">每张黑料每个月都可能被扒出来：热度越高、用户越多、严重度越大，越容易爆。法务公关能压一压，「公关」里可以花钱洗白。<br>已曝光累计 ${Math.round(S.exposed)}${S.exposedCrime >= 15 ? `，其中涉嫌违法 ${Math.round(S.exposedCrime)}（到 40 经侦上门）` : ''}。</p>`;
  if (V.rtab === 'perks') {
    const temps = S.temp.filter(t => t.until - S.t < 900).map(t => `<li>${MOD_NAME[t.key] || t.key} ${t.mult != null ? '×' + t.mult : (t.add > 0 ? '+' : '') + t.add}<small> 还剩 ${t.until - S.t} 个月</small></li>`).join('');
    return (S.perks.length ? S.perks.map(id => `<div class="perk r${PERK[id].r}"><span>${PERK[id].icon}</span><div><b>${PERK[id].name}</b><small>${PERK[id].desc}</small></div></div>`).join('') : '<p class="empty">还没有董事会卡。每轮融资和每年的董事会后都能三选一。</p>')
      + (S.feats.length ? `<h4>已上线功能</h4><div class="feats">${S.feats.map(id => `<span title="${esc(FEAT[id].desc)}">${FEAT[id].icon} ${FEAT[id].name}</span>`).join('')}</div>` : '')
      + (temps ? `<h4>限时效果</h4><ul class="temps">${temps}</ul>` : '')
      + `<h4>创始人 ${esc(S.founder.name)}</h4><div class="feats">${ATTRS.map(a => `<span title="${a.desc}">${a.icon} ${a.name} ${S.founder.attrs[a.id]}</span>`).join('')}</div><div class="feats">${S.founder.traits.map(id => `<span title="${esc(TRAIT[id].desc)}">${TRAIT[id].icon} ${TRAIT[id].name}</span>`).join('')}</div>`;
  }
  if (V.rtab === 'fin') {
    const rv = G.revenue(S), cs = G.costs(S), net = rv.total - cs.total, row = (n, v, neg) => (v > 0.05 ? `<div class="fr"><span>${n}</span><b class="${neg ? 'bad' : 'good'}">${G.money(S, neg ? -v : v, true)}</b></div>` : '');
    return `<h4 style="border:0;margin-top:0;padding-top:0">本月预计收入</h4>${row('订阅', rv.sub)}${row('API', rv.api)}${row('企业订单', rv.b2b)}<h4>本月预计支出</h4>${row('工资', cs.salary, 1)}${row('房租', cs.rent, 1)}${row('显卡', cs.gpu, 1)}${row('上游 API', cs.api, 1)}${row('运维杂项', cs.misc, 1)}
    <div class="fr tot"><span>净现金流</span><b class="${net < 0 ? 'bad' : 'good'}">${G.money(S, net, true)}</b></div>
    <p class="note">赛道「${TRACKS[S.co.track].name}」现在的盘子约 ${G.fmtUsers(G.market(S))}，以你的产品力最多能吃下 ${(G.shareCap(S) * 100).toFixed(0)}%。产品体验 ${S.quality.toFixed(0)}。${S.stage < 5 ? `<br>${STAGES[S.stage + 1].name}的达标线：用户 ${G.fmtUsers(STAGES[S.stage + 1].users)} 或月收入 ${G.money(S, STAGES[S.stage + 1].rev)}，或者冲到榜单前列。` : ''}${S.vam ? `<br><b class="bad">对赌</b>：${G.dateStr(S.vam.due)}前用户须达 ${G.fmtUsers(S.vam.target)}。` : ''}</p>`;
  }
  return S.log.map(l => `<div class="lg"><small>${G.dateStr(l.t)}</small>${esc(l.msg)}</div>`).join('');
}
function rightPanel() {
  if (!rightOpen(S)) return '';                                             // 教学第一个月：右边先不出现
  const tabs = RTABS.filter(([id]) => rtabOpen(S, id));
  if (!tabs.some(([id]) => id === V.rtab)) V.rtab = tabs[0]?.[0] || 'team';
  const g = (id, ic, name, v, color, tip) => !gaugeOpen(S, id) ? '' : `<div class="g" title="${tip}"><span>${ic} ${name}</span><div class="bar"><i style="width:${Math.round(v)}%;background:${color}"></i></div><b>${Math.round(v)}</b></div>`;
  const badge = id => (id === 'safe' && S.dirt.length ? ` ${S.dirt.length}` : id === 'chain' && S.projects.length ? ` ${S.projects.length}` : '');
  return `<aside class="right panel"><div class="gauges">${g('hype', '🔥', '热度', S.hype, '#ff6b4a', '热度：拉新更快、估值更高，但黑料也更容易被扒')}${g('rep', '⭐', '口碑', S.rep, '#e0a100', '口碑：影响留存和付费')}${g('morale', '😊', '士气', S.morale, '#2ec4a6', '士气：决定团队产出，太低会有人跑路')}${g('reg', '🏛️', '监管', S.reg, '#3a4460', '监管压力：到 70 增长受限、成本上升；到 100 吃重锤')}${g('bubble', '🫧', '泡沫', S.bubble, '#7b5cff', 'AI 泡沫指数：越高估值越高，也越接近破裂')}${g('dirt', '💣', '黑料', Math.min(100, G.dirtTotal(S)), '#111', '保险柜里所有黑料的严重度之和')}</div>
  <nav class="tabs">${tabs.map(([id, ic, n]) => `<button class="tab ${V.rtab === id ? 'on' : ''}" data-a="rtab:${id}">${ic}<span>${n}${badge(id)}</span></button>`).join('')}</nav><div class="scroll" data-sc="r-${V.rtab}">${rightBody()}</div></aside>`;
}
function bottom() {
  const items = [];
  if (S.ownModel && isOpen(S, 'model')) {
    const free = Math.max(0, S.gpu - G.inferNeed(S)), gain = S.furnace?.on ? free * G.researchEff(S) * DATA_SOURCES[S.furnace.data].mult : 0, cur = G.myCap(S), nxt = G.capOf(G.baseE(S.t) + S.E + gain);
    items.push(`<div class="w furnace ${gain > 0 ? 'on' : ''}"><span class="big">${gain > 0 ? '🔥' : '🪨'}</span><div><b>丹炉火候 ${cur.toFixed(1)}</b> <small>${gain > 0 ? `本月预计 +${(nxt - cur).toFixed(2)}` : '没有空闲显卡，炉子是凉的'}</small><br><small>现役 ${S.model ? S.model.cap.toFixed(1) : '—'} · 榜首 ${Math.max(...S.rivals.map(r => r.bench)).toFixed(1)} · 烧${DATA_SOURCES[S.furnace?.data || 'open'].name}</small></div></div>`);
  }
  if (isOpen(S, 'product')) items.push(`<div class="w"><span class="big">${TRACKS[S.co.track].icon}</span><div><b>${TRACKS[S.co.track].name} · 体验 ${S.quality.toFixed(0)}</b><br><small>${S.sprint ? `开发中：${FEAT[S.sprint.id].name} ${Math.round(S.sprint.done / S.sprint.need * 100)}%` : '没有在开发的功能'}</small></div></div>`);
  if (S.projects.length) { const p = S.projects[0]; items.push(`<div class="w" data-a="rtab:chain" style="cursor:pointer"><span class="big">📌</span><div><b>特殊项目 ×${S.projects.length}</b><br><small>${esc(p.name)} ${Math.round(pct(p.done, p.need))}%</small></div></div>`); }
  return `<footer class="bottom"><div class="widgets">${items.join('')}</div><div class="ticker panel">${S.log.slice(0, 3).map(l => `<span>${esc(l.msg)}</span>`).join('')}</div></footer>`;
}
const chipsHTML = cs => (cs || []).map(c => `<span class="chg ${c.good == null ? '' : c.good ? 'good' : 'bad'}">${c.name} ${c.v}</span>`).join('');
function toastHTML() {
  const t = V.toast;
  return t ? `<div class="toast panel" data-a="toast">${t.ok != null ? `<span class="${t.ok ? 'ok' : 'no'}">${t.ok ? '✔ 成了' : '✘ 砸了'}　</span>` : ''}${nl(t.text)}<div>${chipsHTML(t.chips)}</div></div>` : '';
}
// P 社式事件窗：顶部插画 + 正文 + 选项（悬停看效果）
const tipLines = ls => ls.map(([t, good]) => `<span class="${good == null ? '' : good ? 'good' : 'bad'}">${esc(t)}</span>`).join('');
function tipHTML(tip) {
  if (!tip) return '';
  if (tip.fx) return tip.fx.length ? `<span class="tip"><u>效果</u>${tipLines(tip.fx)}</span>` : '';
  return tip.ok.length || tip.fail.length ? `<span class="tip"><u>成功</u>${tipLines(tip.ok) || '<span>无事发生</span>'}<u>失败</u>${tipLines(tip.fail) || '<span>无事发生</span>'}</span>` : '';
}
function modal() {
  const d = V.dlg;
  if (!d) return '';
  const C = CAT[d.cat] || CAT.sys, ch = d.chain && CHAINS[d.chain], img = d.art ? artURL(d.art) : '';
  const bar = `<div class="pdx-bar"><span class="tag" style="--c:${C.color}">${C.name}</span>${ch ? `<span class="tag chain">${ch.icon} 事件链 · ${ch.title}</span>` : ''}${d.closable && !V.res ? '<button class="x" data-a="dlg:close">✕</button>' : ''}</div>`;
  const ttl = `<h2${img ? '' : ' class="pdx-title"'}><i>${d.icon || ''}</i>${esc(d.title)}</h2>`;
  const head = bar + (img ? `<div class="pdx-art" style="background-image:url('${img}')">${d.portrait === 'longhair' ? LONGHAIR : ''}${ttl}</div>` : ttl);
  if (V.res) {
    const fx = (V.res.chips || []).map(c => `<span class="fxl ${c.good == null ? '' : c.good ? 'good' : 'bad'}">${c.name} ${c.v}</span>`).join('');
    return `<div class="veil"><div class="pdx">${head}<div class="pdx-text">${V.res.ok != null ? `<span class="stamp ${V.res.ok ? 'ok' : 'no'}">${V.res.ok ? '成功' : '失败'}</span>` : ''}${nl(V.res.text)}</div>${fx ? `<div class="pdx-fx">${fx}</div>` : ''}<div class="pdx-opts"><button class="opt go" data-a="res">继续</button></div></div></div>`;
  }
  const opts = d.options.map((o, i) => (d.kind === 'cards'
    ? `<button class="pcard r${o.card.r || 1}" data-a="dlg:${i}"><span class="pi">${o.card.icon}</span><b>${esc(o.card.name)}</b><small>${nl(o.card.desc)}</small></button>`
    : `<button class="opt" data-a="dlg:${i}" ${o.disabled ? 'disabled' : ''}><span class="ol"><b>${esc(o.label)}</b>${o.hint || o.why ? `<small>${esc(o.disabled && o.why ? o.why : o.hint)}</small>` : ''}</span>${o.chk ? `<i class="chk">${o.chk}</i>` : ''}${o.disabled ? '' : tipHTML(o.tip)}</button>`)).join('');
  return `<div class="veil"><div class="pdx ${d.kind === 'cards' ? 'wide' : ''}">${head}<div class="pdx-text">${nl(d.text)}</div><div class="${d.kind === 'cards' ? 'pcards' : 'pdx-opts'}">${opts}</div></div></div>`;
}
function endScreen() {
  const o = S.over, E = ENDINGS[o.id], R = V.summary, t = Math.min(o.t, MONTHS), img = artURL(ENDING_ART[o.id]);
  const stats = [['存活', `${t} 个月`], ['最终估值', G.money(S, o.val)], ['你的股权', S.equity.toFixed(0) + '%'], ['用户峰值', G.fmtUsers(S.stats.maxUsers)], ['融资总额', G.money(S, S.stats.raised)], ['经历事件', S.stats.events], ['董事会卡', S.perks.length], ['曝光黑料', Math.round(S.exposed)]];
  return `<section class="endc panel ${E.good ? 'good' : 'bad'}">${img ? `<div class="endart" style="background-image:url('${img}')"></div>` : ''}<div class="eicon">${E.icon}</div><small>${esc(S.co.name)} · ${G.dateStr(t)} · 结局</small><h1>${E.name}</h1><p class="etext">${nl(R.text)}</p>
  <div class="estats">${stats.map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('')}</div>
  <div class="escore">得分 <b>${R.score}</b>　人脉点 <b>+${R.points}</b>${R.newEnd ? '　<i>新结局！</i>' : ''}</div>
  ${R.newAch.length ? `<div class="each">${R.newAch.map(a => `<span title="${esc(ACHIEVEMENTS[a].desc)}">${ACHIEVEMENTS[a].icon} ${ACHIEVEMENTS[a].name}</span>`).join('')}</div>` : ''}
  <div class="tbtns row"><button class="btn big go" data-a="new">再来一局</button><button class="btn" data-a="meta">局外成长</button><button class="btn ghost" data-a="back">回标题</button></div></section>`;
}

// ───────── 渲染与场景同步 ─────────
// 学长老周的教学卡片：当前这一步讲什么
function tutorHTML() {
  const tip = S && !S.over && !V.dlg && !V.wait ? currentTip(S) : null;
  return tip ? `<div class="tutor panel"><span class="tface">🧓</span><div><b>学长老周 · ${tip.title}</b><p>${esc(tip.text)}</p></div><button class="btn sm" data-a="tip">知道了</button></div>` : '';
}
// 点员工或候选人时冒出来的气泡：头像 + 他能带来什么
function popHTML() {
  const p = V.pop, e = p && (S.staff.find(x => x.uid === p.uid) || S.cands.find(x => x.uid === p.uid));
  if (!e) return '';
  const hired = S.staff.includes(e), im = G.staffImpact(S, e);
  return `<div class="pop panel" style="top:${p.top}px;${p.side}:${p.x}px">
  <div class="poph">${avatarSVG(e.uid, e.role, 76)}<div><b>${esc(e.name)}</b><small>${ROLES[e.role].icon} ${ROLES[e.role].name} · 能力 ${e.skill}/10</small>${skillDots(e.skill)}</div></div>
  <h5>${hired ? '他现在给公司带来' : '招进来能带来'}</h5><ul>${im.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
  ${im.quirk ? `<p class="pq">${esc(im.quirk)}</p>` : ''}<p class="ps">月薪 ${G.money(S, im.salary)}${hired ? ` · ${G.dateStr(e.since)}入职` : ' · 入职时另付一个月工资当签字费'}</p></div>`;
}
function render() {
  const keep = [...ui.querySelectorAll('[data-sc]')].map(e => [e.dataset.sc, e.scrollTop]);
  if (V.screen === 'play' && S && !S.over) {                                // 教学：检查有没有新系统该开放了，并顺手切到相关页签
    advanceTutorial(S);
    const tip = currentTip(S);
    if (tip && tip.key !== V.tipKey) { V.tipKey = tip.key; if (tip.go?.ltab) V.ltab = tip.go.ltab; if (tip.go?.rtab) V.rtab = tip.go.rtab; }
  }
  ui.innerHTML = V.screen === 'title' ? title() : V.screen === 'wizard' ? wizard() : V.screen === 'meta' ? metaScreen()
    : V.screen === 'play' ? topbar() + leftPanel() + rightPanel() + bottom() + tutorHTML() + toastHTML() + popHTML() + modal()
      : topbar() + '<div class="dim"></div>' + endScreen();
  for (const [k, v] of keep) { const e = ui.querySelector(`[data-sc="${k}"]`); if (e) e.scrollTop = v; }
  const hl = V.screen === 'play' && S && !V.dlg ? currentTip(S)?.hl : null;
  if (hl) ui.querySelector(`[data-a="${hl}"]`)?.classList.add('hl');
  syncScene();
}
function syncScene() {
  if (!office) return;
  const rect = s => ui.querySelector(s)?.getBoundingClientRect();
  if (S && (V.screen === 'play' || V.screen === 'end')) {
    const free = Math.max(0, S.gpu - G.inferNeed(S));
    office.sync({
      mode: 'play', region: S.co.region, level: S.co.office, sign: S.co.name,
      logo: S.co.logo ? logoDataURL(S.co.logo, S.co.brand) : undefined, brand: S.co.brand, founder: { outfit: S.founder.outfit || 'turtleneck' },
      staff: S.staff.map(e => ({ id: e.uid, role: e.role, mood: G.clamp(S.morale + (parseInt(e.uid.slice(1), 10) * 7) % 21 - 10, 0, 100) })),
      racks: S.ownModel ? G.clamp(Math.ceil(Math.log2(S.gpu / 8 + 1)), 0, 12) : 0,
      furnace: S.ownModel && S.furnace?.on && free > 0 ? { heat: G.clamp(0.25 + free / Math.max(1, G.quota(S)) * 0.75, 0, 1) } : null,
      night: String(S.policies.work) === '996', alert: !S.over && G.runway(S) < 3,
    });
    const L = rect('.left'), R = rect('.right'), T = rect('.top'), B = rect('.bottom');
    office.setInsets(V.screen === 'play' && L ? { left: L.right + 8, right: R ? innerWidth - R.left + 8 : 16, top: T.bottom + 8, bottom: B ? innerHeight - B.top + 8 : 16 } : { left: 0, right: 0, top: 0, bottom: 0 });
  } else {
    const W = V.screen === 'wizard' ? V.W : null, box = rect('.wizard') || rect('.title');
    office.sync({
      mode: 'title', region: W?.region || 'bay', level: W ? 1 : 3, sign: W?.coName || '炼丹大亨',
      logo: W ? logoDataURL(W.logo, W.brand) : undefined, brand: W?.brand, founder: { outfit: W?.outfit || 'turtleneck' },
      staff: W ? [] : TITLE_STAFF, racks: W ? 1 : 4, furnace: { heat: 0.7 }, night: false, alert: false,
    });
    office.setInsets({ left: box ? box.right + 8 : 0, right: 0, top: 0, bottom: 0 });
  }
}
const playFx = () => { if (S && office) for (const [n, d] of S.fxq.splice(0)) { office.play(n, d); if (FX_SOUND[n]) sfx(FX_SOUND[n]); } };
function toast(t) {
  if (!t || (!t.text && !(t.chips || []).length)) return;
  V.toast = t; clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { V.toast = null; ui.querySelector('.toast')?.remove(); }, 5200);
}

// ───────── 流程 ─────────
function openDialog(d) {
  V.res = null;
  if (d.delay) { V.dlg = null; V.wait = true; render(); setTimeout(() => { V.wait = false; V.dlg = d; render(); }, d.delay); }
  else { V.dlg = d; render(); }
}
// 把引擎里排队的对话框一个个放出来；放完就存档
function pump() {
  const d = G.nextDialog(S);
  playFx();
  if (d) return openDialog(d);
  V.dlg = null; V.res = null;
  if (S.over) {
    if (!V.summary) { V.summary = G.finalize(S, meta); office?.play(ENDINGS[S.over.id].good ? 'confetti' : 'alarm'); sfx(ENDINGS[S.over.id].good ? 'good' : 'bad'); }
    V.screen = 'end'; V.toast = null;
  } else G.saveGame(S);
  render();
}
function localDialog(title, text, icon, options) { V.res = null; V.dlg = { kind: 'event', cat: 'sys', icon, title, text, options, closable: true, local: true }; render(); }
function nextMonth() {
  sfx('turn');
  G.endMonth(S);
  if (!S.over) toast({ text: `${G.dateStr(S.t - 1)}结算：收入 ${G.money(S, S.last.rev)}，支出 ${G.money(S, S.last.cost)}，净 ${G.money(S, S.last.net, true)}` });
  pump();
}
function startGame(setup) { S = G.newGame(setup, meta); V.screen = 'play'; V.summary = null; V.ltab = 'rd'; V.rtab = 'board'; V.toast = null; V.pop = null; V.tipKey = null; pump(); }

const CMD = {
  new() { V.W = newWizard(); V.screen = 'wizard'; V.dlg = null; render(); },
  continue() { const s = G.loadGame(); if (!s) return render(); S = s; V.screen = 'play'; V.summary = null; pump(); },
  meta() { V.screen = 'meta'; render(); },
  back() { V.screen = 'title'; V.dlg = null; render(); },
  buy(id) { G.buyMeta(meta, id); render(); },
  w(k, a, b) {
    const W = V.W, isRand = (pool, v) => RAND.bay[pool].includes(v) || RAND.sz[pool].includes(v);
    if (k === 'step') W.step = G.clamp(W.step + +a, 0, 4);
    else if (k === 'region') {
      W.region = a; W.logo = LOGOS[a][0].id;
      if (isRand('name', W.name)) W.name = rnd(RAND[a].name);
      if (isRand('co', W.coName)) W.coName = rnd(RAND[a].co);
      for (const g of ['seed', 'district']) if (TRAIT[W[g]]?.region && TRAIT[W[g]].region !== a) W[g] = firstOf(g, a);
    }
    else if (k === 'rand') W.name = rnd(RAND[W.region].name);
    else if (k === 'randco') { W.coName = rnd(RAND[W.region].co); W.modelName = rnd(RAND.model); }
    else if (k === 'attr') { const v = W.attrs[a] + +b; if (v >= 5 && v <= 10 && (+b < 0 || ptsLeft(W) > 0)) W.attrs[a] = v; }
    else if (k === 'pick') W[a] = b;
    else if (k === 'brand') W.brand = a;
    else if (k === 'start') return startGame({ name: W.name.trim() || '无名氏', coName: W.coName.trim() || '无名公司', modelName: W.modelName.trim() || '混沌', region: W.region, attrs: W.attrs, traits: wizTraits(W), route: W.route, track: W.track, logo: W.logo, brand: W.brand, outfit: W.outfit, tutorial: W.tutorial });
    render();
  },
  // 点员工 / 候选人：在面板旁边冒出气泡，沙盘里对应的小人也会应一声
  who(uid) {
    if (V.dlg || V.wait) return;
    if (V.pop?.uid === uid) { V.pop = null; return render(); }
    const row = lastEl?.closest('.cand'), r = row?.getBoundingClientRect(), z = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--z')) || 1;
    if (!r) return;
    const inLeft = !!row.closest('.left'), panel = row.closest('.left, .right').getBoundingClientRect();
    V.pop = { uid, side: inLeft ? 'left' : 'right', x: Math.round((inLeft ? panel.right + 12 : innerWidth - panel.left + 12) / z), top: Math.round(G.clamp(r.top / z - 30, 92, innerHeight / z - 300)) };
    if (S.staff.some(e => e.uid === uid)) office?.play('say', { who: uid, text: rnd(['到！', '老板好！', '在写了在写了', '这个需求真做不了', '我没在摸鱼', '下班前给你']) });
    render();
  },
  tip() { dismissTip(S); render(); },
  ltab(t) { V.ltab = t; render(); },
  rtab(t) { V.rtab = t; render(); },
  toast() { V.toast = null; ui.querySelector('.toast')?.remove(); },
  menu() {
    localDialog('暂停', '进度会在每个月初自动保存，随时可以回来接着干。', '⏸️', [
      { label: '继续经营', fn() { render(); } },
      { label: muted ? '🔊 打开音效' : '🔇 关掉音效', fn() { muted = !muted; try { localStorage.setItem('ldt_mute', muted ? '1' : '0'); } catch { /* 存不了就算了 */ } render(); } },
      { label: '保存并回到标题', fn() { G.saveGame(S); V.screen = 'title'; render(); } },
    ]);
  },
  act(id) {
    if (V.dlg || V.wait) return;
    const r = A.perform(S, id);
    if (!r) return;
    playFx();
    if (r.dialog) return openDialog(r.dialog);
    if (r.ok != null) sfx(r.ok ? 'good' : 'bad');
    toast(r); pump();
  },
  push(uid) { if (V.dlg || V.wait) return; const r = G.pushProject(S, uid); if (r) { toast(r); render(); } },
  hire(uid) { if (V.dlg || V.wait) return; const r = A.hire(S, uid); if (!r) return; toast(r.err ? { text: r.err } : r); render(); },
  fire(uid) {
    if (V.dlg || V.wait) return;
    const e = S.staff.find(x => x.uid === uid);
    if (e) localDialog(`让 ${e.name} 「毕业」？`, `赔偿 2 个月工资（${G.money(S, 2 * e.salary * G.mod(S, 'salaryMult'))}），团队士气会受影响。`, '📦', [{ label: '发毕业证', fn() { toast(A.fire(S, uid)); render(); } }, { label: '算了', fn() { render(); } }]);
  },
  gpu(k) { const q = G.quota(S), step = Math.max(5, Math.round(q * 0.1)); A.setGpu(S, k === 'max' ? q : k === 'min' ? 0 : S.gpu + (k === '+' ? step : -step)); render(); },
  pol(k, v) { A.setPolicy(S, k, v); render(); },
  next() {
    if (V.dlg || V.wait || S.over) return;
    if (S.ap > 0 && S.t > 1) return localDialog('还有行动点没用', `这个月还剩 ${S.ap} 个行动点，不用就浪费了。`, '⏭️', [{ label: '就这样，进入下个月', fn: nextMonth }, { label: '我再想想', fn() { render(); } }]);
    nextMonth();
  },
  dlg(i) {
    const d = V.dlg;
    if (!d || V.res) return;
    if (i === 'close') { if (d.closable) { V.dlg = null; render(); } return; }
    if (d.local) { V.dlg = null; return d.options[+i]?.fn(); }
    const r = G.choose(S, d, +i);
    if (!r) return;
    playFx();
    if (r.dialog) return openDialog(r.dialog);
    if (!r.text && !r.chips.length) return pump();
    if (r.ok != null) sfx(r.ok ? 'good' : 'bad');
    V.res = r; render();
  },
  res() { if (V.res) pump(); },
};

export function boot(root, scene) {
  ui = root; office = scene;
  const fit = () => { document.documentElement.style.setProperty('--z', G.clamp(Math.min(innerWidth / 1280, innerHeight / 720), 0.5, 1.3).toFixed(3)); syncScene(); };
  addEventListener('resize', fit);
  ui.addEventListener('click', e => {
    const el = e.target.closest('[data-a]');
    if (!el || el.disabled) return;
    const [cmd, ...args] = el.dataset.a.split(':');
    if (V.pop && cmd !== 'who') V.pop = null;
    lastEl = el; sfx('click'); CMD[cmd]?.(...args);
  });
  // 点别处时收起员工气泡（只摘掉元素，不重绘，免得吃掉这次点击）
  document.addEventListener('pointerdown', e => { if (V.pop && !e.target.closest?.('.pop, .cand')) { V.pop = null; ui.querySelector('.pop')?.remove(); } });
  ui.addEventListener('input', e => {
    const f = e.target.dataset?.f;
    if (!f || !V.W) return;
    V.W[f] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (f === 'coName') { const live = ui.querySelector('[data-live="co"]'); if (live) live.textContent = e.target.value; syncScene(); }
  });
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || V.screen !== 'play') return;
    if (V.dlg) { if (V.res && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); CMD.res(); } else if (!V.res && /^[1-4]$/.test(e.key)) CMD.dlg(String(+e.key - 1)); else if (e.key === 'Escape') CMD.dlg('close'); }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); CMD.next(); }
  });
  if (import.meta.env?.DEV) window.__game = { get S() { return S; }, G, A, pump, render };   // 仅开发模式：调试用
  fit(); render();
}

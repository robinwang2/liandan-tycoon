import { getLang, setLang, onLanguage, tr } from '../i18n/index.js';
import { dialogView } from './dialog-view.js';
// 《炼丹大亨》界面层：DOM 浮层，负责渲染、接收点击、调度引擎和 3D 场景。
import * as G from '../game/engine.js';
import * as A from '../game/actions.js';
import { advise, muteHint, muteMonths } from '../game/advice.js';
import { ATTRS, REGIONS, ROUTES, TRACKS, TRAITS, TRAIT, OUTFITS, officeName, ROLES, STAFF_QUIRKS, POLICIES, PERK, FEAT, STAGES, DATA_SOURCES, DIRT, ENDINGS, ACHIEVEMENTS, META_SHOP, CAT, MONTHS, START_YEAR, MOD_NAME, KIND_NAME, floorsOf, DEPTS, IDEO_FLAG_MODS, P } from '../data/defs.js';
import { CHAINS } from '../data/events_chains.js';
import * as IDEO from '../game/ideology.js';
import { LOGOS, BRAND_COLORS, logoSVG, logoDataURL } from './logos.js';
import { artURL, ENDING_ART } from './art.js';
import { avatarSVG } from './avatar.js';
import { advanceTutorial, currentTip, dismissTip, isOpen, actOpen, ltabOpen, rtabOpen, gaugeOpen, chipOpen, rightOpen } from './tutorial.js';
import { icon } from './icons.js';
import { playThemeFx, stopThemeFx } from './themefx.js';
import { createAudio } from '../audio/audio.js';
import { text, fill, TEXT } from '../data/text.js';
import { nameBits, namePool, defaultName, displayName, playerName, playerModel } from '../data/player-names.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nl = s => esc(s).replace(/\n/g, '<br>');
// 界面上的字在 文本.xlsx「界面」里（意识形态页的两地说法在「路线之争」里）。
// ut = 纯文字（后面还会再转义的地方用）；uh = 直接拼进 HTML 的：表里的字先转义，{变量} 原样放进去（变量可能是代码拼好的 HTML）
const bayUI = () => (S ? S.co.region === 'bay' : V.W?.region === 'bay');
const pickText = (key, bay) => { const e = TEXT[key]; if (!e) throw new Error(`tables/文本.xlsx 里没有「${key}」`); return bay && e.bay != null ? e.bay : e.text; };
const ut = (key, vars) => text(key, vars, bayUI());
const uh = (key, vars, bay = bayUI()) => fill(esc(pickText(key, bay)), vars);
const ivh = (key, vars, us = IDEO.verOf(S) === 'us') => fill(esc(pickText(key, us)), vars);   // 路线之争：按版本挑说法
const lines = (key, bay) => pickText(key, bay).split('\n').map(s => s.trim()).filter(Boolean);
const pct = (a, b) => (b > 0 ? Math.min(100, a / b * 100) : 0);
const rnd = arr => arr[Math.floor(Math.random() * arr.length)];

let S = null, meta = G.loadMeta(), office = null, ui = null, toastTimer = 0, flashTimer = 0, scaleTimer = 0, lastEl = null;
const V = { screen: 'title', ltab: 'rd', rtab: 'board', dlg: null, res: null, toast: null, W: null, summary: null, wait: false, hints: [], recActs: new Set(), hintSeen: {} };

// 音频：WebAudio 现场合成的音效 + 环境声 + 生成式配乐（src/audio/audio.js），不依赖任何音频文件
const audio = createAudio();
let muted = false;
try { muted = localStorage.getItem('ldt_mute') === '1'; const v = JSON.parse(localStorage.getItem('ldt_audio_v1') || 'null'); if (v) audio.setVolume(v); } catch { /* 读不到就用默认 */ }
audio.setMuted(muted);
const sfx = (kind, o) => audio.sfx(kind, o);
function setMuted(m) { muted = m; audio.setMuted(m); try { localStorage.setItem('ldt_mute', m ? '1' : '0'); } catch { /* 存不了就算了 */ } }
const FX_SOUND = { money: 'coin', confetti: 'confetti', levelup: 'levelup', alarm: 'alarm', boom: 'boom', cameo: 'cameo', release: 'release' };
const CLICK_SND = { ltab: 'tab', rtab: 'tab', dlg: 'choose', next: null, floor: null };
// 界面框架里的图标（事件、卡牌等内容里的 emoji 保留）
const TAB_IC = { rd: 'flask', team: 'people', cap: 'coins', pr: 'megaphone', ops: 'gear', ideo: 'flag' };
// 事件链登记表：普通链 + 路线之争和它解锁的两条链
const CHAIN_INFO = { ...CHAINS, ...IDEO.IDEO_CHAIN_INFO };
const chainInfo = id => (id === 'ideo' ? { title: text('ideo.page.chain'), icon: text('ideo.page.chainIcon', null, !!S && IDEO.verOf(S) === 'us') } : CHAIN_INFO[id]);
const ACT_IC = { code: 'code', release: 'rocket', furnace: 'swap', selfdev: 'target', sprint: 'puzzle', paper: 'paper', headhunt: 'search_user', teambuild: 'party', pie: 'cake', office: 'building', raise: 'handshake', roadshow: 'mic', ipo: 'bell', sellcourse: 'book', subsidy: 'gift', lobby: 'capitol', hype: 'megaphone_loud', ads: 'ad', goodpr: 'heart', navy: 'ghost', fakeusers: 'mask', wash: 'washer', digdirt: 'shovel', beg: 'hand', sweep: 'broom', agi: 'sparkles', mobilize: 'megaphone_loud', utopia: 'sun', selfcrit: 'eye', subbotnik: 'broom', plan: 'calendar', yank: 'target', bci: 'bolt', buyback: 'swap', costcut: 'minus', spinoff: 'rocket' };

// 建角向导里「🎲 随机」用的名字（一行一个）
const wizardName = (wizard, field) => displayName(field, wizard[field], wizard.region, wizard.autoNames);
function rollName(wizard, field) {
  wizard[field] = rnd(namePool(field, wizard.region));
  wizard.autoNames |= nameBits[field];
}
const TITLE_STAFF = ['res', 'eng', 'eng', 'ops', 'biz', 'legal', 'res'].map((role, i) => ({ id: 't' + i, role, mood: 60 + i * 5 }));
const LONGHAIR = `<svg class="art" width="118" height="118" viewBox="0 0 120 120"><path d="M26 60Q22 14 60 12Q98 14 94 60L98 104Q88 96 84 70L36 70Q32 96 22 104Z" fill="#2b2220" stroke="#1e2233" stroke-width="3"/><ellipse cx="60" cy="56" rx="26" ry="29" fill="#f3c9a3" stroke="#1e2233" stroke-width="3"/><path d="M34 46Q40 22 60 24Q80 22 86 46Q72 34 60 38Q48 34 34 46Z" fill="#2b2220"/><rect x="38" y="48" width="18" height="13" rx="3" fill="#fff" stroke="#111" stroke-width="3.5"/><rect x="64" y="48" width="18" height="13" rx="3" fill="#fff" stroke="#111" stroke-width="3.5"/><path d="M56 54h8" stroke="#111" stroke-width="3.5"/><circle cx="47" cy="55" r="2.5"/><circle cx="73" cy="55" r="2.5"/><ellipse cx="60" cy="74" rx="8" ry="6" fill="#7a1f1f" stroke="#1e2233" stroke-width="2.5"/><path d="M30 118Q32 92 60 92Q88 92 90 118Z" fill="#c8402f" stroke="#1e2233" stroke-width="3"/><path d="M44 94v24M60 92v26M76 94v24M32 106h56" stroke="#7a1f1f" stroke-width="2" opacity=".7"/></svg>`;
const brandLogo = (co, size) => (co?.logo ? logoSVG(co.logo, co.brand, size) : '⚗️');

// ───────── 标题 / 建角 / 局外 ─────────
const langButton = () => `<button class="btn lang-toggle" data-a="lang" aria-label="${getLang() === 'en' ? '切换到中文' : 'Switch to English'}">${getLang() === 'en' ? '中' : 'EN'}</button>`;
function title() {
  const save = G.loadGame();
  return `<section class="title"><h1>${uh('ui.title.name')}</h1><p class="sub">${uh('ui.title.sub', { 起: START_YEAR, 止: START_YEAR + MONTHS / 12 - 1 })}</p>
  <div class="tbtns"><button class="btn big go" data-a="new">${uh('ui.title.new')}</button>
  ${save ? `<button class="btn big" data-a="continue">${uh('ui.title.continue')}<small>${esc(playerName(save, 'coName'))} · ${G.dateStr(save.t)}</small></button>` : ''}
  ${langButton()}<button class="btn" data-a="meta">${uh('ui.title.meta')}<small>${uh('ui.points', { 点数: meta.points })}</small></button><button class="btn" data-a="settings">${icon('settings', 18)}${uh('ui.title.settings')}</button></div>
  ${office?.quality?.()?.igpu ? `<p class="gpu-tip">${uh('ui.title.igpu', { 显卡: esc(office.quality().gpu), 建议: uh('ui.gpuTip') })}</p>` : ''}
  <p class="fine">${uh('ui.title.fine')}<br>${uh('ui.title.record', { 次数: meta.runs, 最高分: meta.best })}</p></section>`;
}
const firstOf = (group, region) => TRAITS[group].find(t => !t.region || t.region === region).id;
function newWizard() {
  const region = 'bay', attrs = Object.fromEntries(ATTRS.map(a => [a.id, P['start.attrBase']]));
  const wizard = {
    step: 0, autoNames: 0, region, attrs, pts: P['start.attrPoints'] + (meta.own.m_point ? P['meta.attrPoint'] : 0) + (meta.own.m_point2 ? P['meta.attrPoint'] : 0),
    edu: 'yao', bg: 'bigtech', quirk: 'none', motto: 'm_allin', outfit: 'turtleneck', route: 'model', track: 'chat',
    cofounder: 'c_solo', seed: 's_self', district: firstOf('district', region), mission: 'v_agi', logo: LOGOS[region][0].id, brand: BRAND_COLORS[0],
    tutorial: meta.runs === 0,                                               // 第一次玩默认开新手教学
  };
  for (const field of Object.keys(nameBits)) rollName(wizard, field);
  return wizard;
}
const ptsLeft = W => W.pts - ATTRS.reduce((a, x) => a + W.attrs[x.id] - P['start.attrBase'], 0);
const wizTraits = W => [W.edu, W.bg, W.quirk, W.motto, W.cofounder, W.seed, W.district, W.mission];
function startPreview(W) {                                            // 和引擎的结算顺序保持一致
  let cash = REGIONS[W.region].cash, eq = 100;
  for (const id of wizTraits(W)) { const st = TRAIT[id]?.start; if (!st) continue; cash += st.cash || 0; cash *= st.cashMult || 1; eq += st.equity || 0; }
  return { cash: cash + (meta.own.m_cash ? P['meta.cash'] : 0), eq };
}
function wizard() {
  const W = V.W, steps = lines('ui.wiz.steps'), R = REGIONS[W.region];
  const grp = (k, t, cls = 'cards3') => `<h2>${t}</h2><div class="${cls}">${TRAITS[k].filter(x => !x.region || x.region === W.region).map(x => {
    const lock = G.traitLocked(meta, x);
    return `<button class="pick sm ${W[k] === x.id ? 'on' : ''} ${lock ? 'lock' : ''}" data-a="w:pick:${k}:${x.id}" ${lock ? 'disabled' : ''}><span class="pi">${lock ? '🔒' : x.icon}</span><b>${x.name}</b><small>${lock ? uh('ui.wiz.locked', { 点数: x.cost }) : x.desc}</small></button>`;
  }).join('')}</div>`;
  let body = '';
  if (W.step === 0) {
    body = `<h2>${uh('ui.wiz.name.h')}</h2><div class="form"><label>${uh('ui.wiz.name.label')}<input data-f="name" maxlength="12" value="${esc(wizardName(W, 'name'))}"></label><button class="btn sm" data-a="w:rand">${uh('ui.wiz.rand')}</button></div>
    <h2>${uh('ui.wiz.region.h')}</h2><div class="cards2">${Object.values(REGIONS).map(r => `<button class="pick ${W.region === r.id ? 'on' : ''}" data-a="w:region:${r.id}"><span class="pi">${r.icon}</span><b>${r.name}</b><em>${r.tagline}</em><ul>${r.desc.map(d => `<li>${d}</li>`).join('')}</ul><small>${uh('ui.wiz.region.cash', { 币: r.cur, 金额: r.cash })}</small></button>`).join('')}</div>
    <h2>${uh('ui.wiz.outfit.h')}</h2><div class="cards4">${OUTFITS.map(o => `<button class="pick sm ${W.outfit === o.id ? 'on' : ''}" data-a="w:pick:outfit:${o.id}"><span class="pi">${o.icon}</span><b>${o.name}</b><small>${o.desc}</small></button>`).join('')}</div>
    ${grp('motto', uh('ui.wiz.motto.h'))}`;
  } else if (W.step === 1) {
    const left = ptsLeft(W);
    body = `<h2>${uh('ui.wiz.attr.h')}<small>${uh('ui.wiz.attr.left', { 点数: `<b class="pts">${left}</b>`, 起步: P['start.attrBase'], 最高: P['start.attrMax'] })}</small></h2>${ATTRS.map(a => `<div class="attr"><span class="ai">${a.icon}</span><div><b>${a.name}</b><small>${a.desc}</small></div><div class="stepper"><button class="btn sm" data-a="w:attr:${a.id}:-1" ${W.attrs[a.id] <= P['start.attrBase'] ? 'disabled' : ''}>−</button><b>${W.attrs[a.id]}</b><button class="btn sm" data-a="w:attr:${a.id}:1" ${left <= 0 || W.attrs[a.id] >= P['start.attrMax'] ? 'disabled' : ''}>＋</button></div><div class="pips">${'<i class="on"></i>'.repeat(W.attrs[a.id])}${'<i></i>'.repeat(P['start.attrMax'] - W.attrs[a.id])}</div></div>`).join('')}`;
  } else if (W.step === 2) {
    body = grp('edu', uh('ui.wiz.edu.h')) + grp('bg', uh('ui.wiz.bg.h')) + grp('quirk', uh('ui.wiz.quirk.h'));
  } else if (W.step === 3) {
    body = `<h2>${uh('ui.wiz.route.h')}</h2><div class="cards2">${Object.values(ROUTES).map(r => `<button class="pick ${W.route === r.id ? 'on' : ''}" data-a="w:pick:route:${r.id}"><span class="pi">${r.icon}</span><b>${r.name}</b><em>${r.sub}</em><ul>${r.desc.map(d => `<li>${d}</li>`).join('')}</ul></button>`).join('')}</div>
    <h2>${uh('ui.wiz.track.h')}</h2><div class="cards4">${Object.values(TRACKS).map(t => `<button class="pick sm ${W.track === t.id ? 'on' : ''}" data-a="w:pick:track:${t.id}"><span class="pi">${t.icon}</span><b>${t.name}</b><small>${t.desc}</small></button>`).join('')}</div>
    ${grp('cofounder', uh('ui.wiz.cofounder.h'))}${grp('seed', uh('ui.wiz.seed.h'))}${grp('district', uh('ui.wiz.district.h'))}`;
  } else {
    const pv = startPreview(W), ms = TRAIT[W.mission];
    body = `<h2>${uh('ui.wiz.co.h')}</h2><div class="form"><label>${uh('ui.wiz.co.label')}<input data-f="coName" maxlength="10" value="${esc(wizardName(W, 'coName'))}"></label><label>${uh('ui.wiz.model.label')}<input data-f="modelName" maxlength="8" value="${esc(wizardName(W, 'modelName'))}"></label><button class="btn sm" data-a="w:randco">${uh('ui.wiz.rand')}</button></div>
    <h2>${uh('ui.wiz.logo.h')}<small>${uh('ui.wiz.logo.tip', null, W.region === 'bay')}</small></h2>
    <div class="logos">${LOGOS[W.region].map(l => `<button class="lgp ${W.logo === l.id ? 'on' : ''}" data-a="w:pick:logo:${l.id}">${logoSVG(l.id, W.brand, 50)}<b>${l.name}</b><small>${l.desc}</small></button>`).join('')}</div>
    <h2>${uh('ui.wiz.brand.h')}</h2><div class="swatches">${BRAND_COLORS.map(c => `<button class="sw ${W.brand === c ? 'on' : ''}" style="--c:${c}" data-a="w:brand:${c}" aria-label="${uh('ui.wiz.brand.aria', { 颜色: c })}"></button>`).join('')}</div>
    ${grp('mission', uh('ui.wiz.mission.h'), 'cards2')}
    <div class="brandcard">${logoSVG(W.logo, W.brand, 64)}<div><h3 data-live="co">${esc(wizardName(W, 'coName'))}</h3><p>${ms.name}</p></div><div class="nums"><small>${uh('ui.wiz.card.cash')}</small><b>${uh('ui.wiz.card.cashValue', { 币: R.cur, 金额: Math.round(pv.cash) })}</b><small>${uh('ui.wiz.card.equity', { 股权: pv.eq })}</small></div></div>
    <label class="chkline"><input type="checkbox" data-f="tutorial" ${W.tutorial ? 'checked' : ''}> <b>${uh('ui.wiz.tutorial')}</b>${uh('ui.wiz.tutorial.desc')}</label>`;
  }
  return `<section class="wizard panel"><div class="wsteps">${steps.map((s, i) => `<span class="${i === W.step ? 'on' : i < W.step ? 'done' : ''}">${i + 1}. ${s}</span>`).join('')}</div><div class="wbody scroll" data-sc="w${W.step}">${body}</div>
  <div class="wfoot">${langButton()}<button class="btn ghost" data-a="${W.step ? 'w:step:-1' : 'back'}">${W.step ? uh('ui.wiz.prev') : uh('ui.back')}</button>${W.step === 1 && ptsLeft(W) > 0 ? `<small>${uh('ui.wiz.unspent', { 点数: ptsLeft(W) })}</small>` : ''}${W.step < 4 ? `<button class="btn big" data-a="w:step:1">${uh('ui.wiz.next')}</button>` : `<button class="btn big go" data-a="w:start">${uh('ui.wiz.start')}</button>`}</div></section>`;
}
function metaScreen() {
  return `<section class="wizard panel"><div class="wsteps"><span class="on">${uh('ui.meta.h')}</span><b class="mp">${uh('ui.points', { 点数: meta.points })}</b></div><div class="wbody scroll" data-sc="m">
  <h2>${uh('ui.meta.shop')}<small>${uh('ui.meta.shop.tip')}</small></h2><div class="shop">${META_SHOP.map(it => { const own = meta.own[it.id], lock = it.need && !meta.own[it.need]; return `<button class="pick sm ${own ? 'on' : ''}" data-a="buy:${it.id}" ${own || lock || meta.points < it.cost ? 'disabled' : ''}><b>${it.name}</b><small>${own ? uh('ui.meta.owned') : lock ? uh('ui.meta.needPrev') : uh('ui.meta.cost', { 点数: it.cost })}</small></button>`; }).join('')}</div>
  <h2>${uh('ui.meta.ends')}<small>${Object.keys(meta.ends).length}/${Object.keys(ENDINGS).length}</small></h2><div class="gal">${Object.entries(ENDINGS).map(([id, e]) => (meta.ends[id] ? `<span class="got" title="${uh('ui.meta.endCount', { 次数: meta.ends[id] })}">${e.icon} ${e.name}</span>` : `<span>${uh('ui.meta.unknown')}</span>`)).join('')}</div>
  <h2>${uh('ui.meta.ach')}<small>${Object.keys(meta.ach).length}/${Object.keys(ACHIEVEMENTS).length}</small></h2><div class="gal">${Object.entries(ACHIEVEMENTS).map(([id, a]) => `<span class="${meta.ach[id] ? 'got' : ''}" title="${esc(a.desc)}">${meta.ach[id] ? a.icon : '🔒'} ${a.name}</span>`).join('')}</div>
  </div><div class="wfoot">${langButton()}<button class="btn ghost" data-a="back">${uh('ui.back')}</button></div></section>`;
}

// ───────── 经营主界面 ─────────
const chip = (ic, label, val, sub, cls = '') => `<div class="chip ${cls}"><span class="ci">${ic}</span><div><b><label>${label}</label>${val}</b><small>${sub}</small></div></div>`;
const skillDots = n => `<span class="dots">${'<i class="on"></i>'.repeat(n)}${'<i></i>'.repeat(10 - n)}</span>`;
function topbar() {
  const net = G.revenue(S).total - G.costs(S).total, rw = G.runway(S), apm = Math.max(G.apMax(S), S.ap);
  return `<header class="top panel"><div class="brand"><span class="logo" data-a="menu" title="${uh('ui.top.menu')}">${brandLogo(S.co, 36)}</span><div><b>${esc(playerName(S, 'coName'))}</b><span class="stage">${STAGES[S.stage].name}</span><br><small>${uh('ui.top.when', { 日期: G.dateStr(Math.min(S.t, MONTHS)), 月: Math.min(S.t, MONTHS), 总: MONTHS, 地区: REGIONS[S.co.region].name, 办公室: (getLang() === 'en' ? ' · ' : '') + officeName(S) })}</small></div></div>
  <div class="chips">${chip(icon('cash', 20), uh('ui.top.cash'), G.money(S, S.cash), uh('ui.top.net', { 净: G.money(S, net, true), 续航: rw >= 99 ? uh('ui.top.profit') : uh('ui.top.runway', { 月数: rw < 1 ? uh('ui.top.runway.lt1') : Math.floor(rw) }) }), net < 0 && rw < P['advice.cash.runway'] ? 'bad' : net >= 0 ? 'good' : '')}
  ${chipOpen(S, 'val') ? chip(icon('valuation', 20), uh('ui.top.val'), G.money(S, G.valuation(S)), uh('ui.top.perf', { 业绩: G.perf(S).toFixed(2) })) : ''}
  ${!chipOpen(S, 'users') ? '' : chip(icon('users', 20), uh('ui.top.users'), G.fmtUsers(S.users + S.fake), S.fake > 0.5 ? uh('ui.top.fake', { 假用户: G.fmtUsers(S.fake) }) : uh('ui.top.share', { 份额: (S.users / G.market(S) * 100).toFixed(1) }))}
  ${!chipOpen(S, 'rank') ? '' : S.model ? chip(icon('trophy', 20), uh('ui.top.rank'), uh('ui.top.rankN', { 名次: G.rank(S) }), uh('ui.top.bench', { 模型: esc(playerModel(S)), 跑分: S.model.bench.toFixed(1) })) : chip(icon('flask', 20), uh('ui.top.model'), uh('ui.top.wrapper'), uh('ui.top.api', { 上游: esc(G.rivalName(G.rivalOf(S, S.upstream))) }))}
  ${!chipOpen(S, 'equity') ? '' : chip(icon('pie', 20), uh('ui.top.equity'), S.equity.toFixed(0) + '%', S.equity < P['coup.equity'] ? uh('ui.top.equity.warn') : uh('ui.top.equity.ok'), S.equity < P['ui.equityBad'] ? 'bad' : '')}</div>
  <div class="turn">${langButton()}<div class="ap" title="${uh('ui.top.ap')}">${'<i class="on"></i>'.repeat(Math.max(0, S.ap))}${'<i></i>'.repeat(Math.max(0, apm - S.ap))}</div><button class="btn icon" data-a="settings" title="${uh('ui.title.settings')}">${icon('settings', 18)}</button><button class="btn big next" data-a="next">${uh('ui.top.next')} ${icon('next', 18)}</button></div></header>`;
}
function actCard(a) {
  const st = A.actionState(S, a), rec = !st.why && V.recActs.has(a.id);                     // rec：顶部提示里建议现在做的
  return `<button class="act ${st.why ? 'off' : ''} ${a.shady ? 'shady' : ''} ${rec ? 'rec' : ''}" data-a="act:${a.id}" ${st.why ? 'disabled' : ''}><span class="ic">${ACT_IC[a.id] ? icon(ACT_IC[a.id], 22) : a.icon}</span><span class="bd"><b>${a.shady ? '☠ ' : ''}${A.actName(S, a)}${rec ? `<i class="rtag">${uh('ui.act.rec')}</i>` : ''}</b><small>${esc(a.desc(S))}</small>${st.why ? `<em>${esc(st.why)}</em>` : ''}</span><span class="cost"><i>${'●'.repeat(a.ap)}</i>${st.cost > 0 ? `<u>${G.money(S, st.cost)}</u>` : ''}</span></button>`;
}
function person(e, btn) {
  return `<div class="cand ${V.pop?.uid === e.uid ? 'on' : ''}" data-a="who:${e.uid}" title="${uh('ui.person.tip')}">${avatarSVG(e.uid, e.role, 36)}<span class="bd"><b>${esc(e.name)}</b> <small>${ROLES[e.role].name}${e.quirk ? ` · <i class="q">${STAFF_QUIRKS[e.quirk].name}</i>` : ''}${e.red && S?.ideo ? ` · <i class="q red" title="${ivh('ideo.page.redTip')}">${ivh('ideo.page.redTag')}</i>` : ''}</small><br>${skillDots(e.skill)} <small>${uh('ui.person.pay', { 月薪: G.money(S, e.salary * G.mod(S, 'salaryMult')) })}</small></span>${btn}</div>`;
}
function candList() {
  const cap = G.teamCap(S);
  return `<h4>${uh('ui.cand.h')}<small>${uh('ui.cand.tip', { 人数: S.staff.length, 上限: cap })}</small></h4>` + (S.cands.length ? S.cands.map(c => {
    const why = S.ap < 1 ? uh('ui.cand.noAp') : S.staff.length >= cap ? uh('ui.cand.full') : S.cash < c.salary * G.mod(S, 'salaryMult') ? uh('ui.cand.noCash') : '';
    return person(c, `<button class="btn sm" data-a="hire:${c.uid}" ${why ? `disabled title="${why}"` : ''}>${uh('ui.cand.hire')}</button>`);
  }).join('') : `<p class="empty">${uh('ui.cand.none')}</p>`);
}
function opsPanel() {
  let h = '';
  if (S.ownModel) {
    // 配额不是硬上限：超出的部分按现货价租。条子按「配额和已租数量里大的那个」画，超出时标一条配额线
    const q = G.quota(S), need = G.inferNeed(S), price = G.gpuPrice(S), over = Math.max(0, S.gpu - q), scale = Math.max(q, S.gpu);
    const note = over ? `<br><b class="over">${uh('ui.gpu.over', { 张数: over })}</b>${uh('ui.gpu.over.text', { 倍数: G.overMult(S).toFixed(1) })}`
      : S.gpu >= q ? `<br>${uh('ui.gpu.full', { 倍数: P['gpu.over0'] })}` : '';
    const brain = G.brainGpu(S);
    h += `<h4 style="border:0;margin-top:0;padding-top:0">${uh('ui.gpu.h')}<small>${uh('ui.gpu.price', { 单价: G.money(S, price), 配额: q })}</small></h4><div class="gpu"><div class="gpubar"><i class="infer" style="width:${pct(Math.min(need, S.gpu), scale)}%"></i><i class="train" style="width:${pct(Math.max(0, S.gpu - need), scale)}%"></i>${over ? `<b class="qline" style="left:${pct(q, scale)}%"></b>` : ''}</div>
    <div class="gpurow"><button class="btn sm" data-a="gpu:min">0</button><button class="btn sm" data-a="gpu:-">−</button><b>${uh('ui.gpu.count', { 张数: S.gpu })}</b><button class="btn sm" data-a="gpu:+">＋</button><button class="btn sm" data-a="gpu:max" title="${uh('ui.gpu.max.tip')}">${uh('ui.gpu.max')}</button></div>
    <small><b style="color:var(--sky)">■</b> ${uh('ui.gpu.infer', { 用了: Math.min(need, S.gpu), 需要: need })}${need > S.gpu ? ` <b class="bad">${uh('ui.gpu.short')}</b>` : ''} · <b style="color:var(--coral)">■</b> ${uh('ui.gpu.train', { 张数: Math.max(0, S.gpu - need) })}<br>${uh('ui.gpu.rent', { 月租: G.money(S, G.gpuRent(S)) })}${note}${brain ? `<br>${uh('ui.gpu.brain', { 卡: `<b>${uh('ui.gpu.brain.n', { 张数: brain })}</b>` })}` : ''}</small></div>`;
  } else {
    h += `<p class="note">${uh('ui.ops.wrapper', { 上游: `<b>${esc(G.rivalName(G.rivalOf(S, S.upstream)))}</b>`, 能力: G.upCap(S).toFixed(0), 账单: G.money(S, G.costs(S).api) })}</p>`;
  }
  if (isOpen(S, 'policy')) h += Object.entries(POLICIES).map(([k, P]) => `<h4>${P.name}</h4><div class="seg">${Object.entries(P.opts).map(([v, o]) => `<button class="${String(S.policies[k]) === v ? 'on' : ''}" data-a="pol:${k}:${v}" title="${esc(o.desc)}">${o.name}</button>`).join('')}</div><small class="note">${esc(P.opts[S.policies[k]].desc)}</small>`).join('');
  return h + `<h4>${uh('ui.acts.h')}</h4>`;
}
function leftPanel() {
  if (!ltabOpen(S, V.ltab)) V.ltab = 'rd';                                  // 教学期间：没开放的页签不显示
  const acts = A.ACTIONS.filter(a => a.tab === V.ltab && (!a.show || a.show(S)) && actOpen(S, a.id)).map(actCard).join('') || (V.ltab === 'ideo' ? '' : `<p class="empty">${uh('ui.acts.none')}</p>`);
  const recTabs = new Set([...V.recActs].map(id => A.ACT[id].tab));                          // 别的页签里有建议做的事：标个小金点
  return `<aside class="left panel"><nav class="tabs">${A.TABS.filter(t => ltabOpen(S, t.id)).map(t => `<button class="tab ${V.ltab === t.id ? 'on' : ''}" data-a="ltab:${t.id}">${TAB_IC[t.id] ? icon(TAB_IC[t.id], 18) : t.icon}<span>${t.name}</span>${recTabs.has(t.id) && V.ltab !== t.id ? '<i class="tdot"></i>' : ''}</button>`).join('')}</nav>
  <div class="scroll" data-sc="l-${V.ltab}">${V.ltab === 'ops' ? opsPanel() + acts : V.ltab === 'ideo' ? ideoPanel() + (acts ? `<h4>${uh('ui.acts.h')}</h4>` + acts : '') : acts + (V.ltab === 'team' ? candList() : '')}</div></aside>`;
}
// ───────── 意识形态页（深圳版 / 湾区版）─────────
const ibars = I => {
  const N = IDEO.sideName(S), us = I.v === 'us';
  const row = (cls, ic, name, v) => `<div class="ib ${cls}"><span>${ic} ${name}</span><div class="bar"><i style="width:${Math.round(v)}%"></i></div><b>${Math.round(v)}</b></div>`;
  return `<div class="ibars${us ? ' us' : ''}">${row('red', ivh('ideo.page.redIcon', null, us), N.red, I.red)}${row('cap', ivh('ideo.page.capIcon', null, us), N.cap, I.cap)}${us ? row('heat', ivh('ideo.page.heatIcon', null, us), uh('chip.heat'), I.heat || 0) : ''}</div>`;
};
const leanShort = () => { const { v } = IDEO.ideoLean(S), N = IDEO.sideName(S), k = P['ideo.lean.pref']; return v > k ? IDEO.vt(S, 'ideo.page.lean', { 立场: N.red }) : v < -k ? IDEO.vt(S, 'ideo.page.lean', { 立场: N.cap }) : IDEO.vt(S, 'ideo.page.lean.mixed'); };
// 结局：图标、名字、一句话（文本.xlsx「路线之争」的 ideo.page.result.*）
const RESULT_OF = r => (r ? ['icon', 'title', 'desc'].map(k => ivh(`ideo.page.result.${r}.${k}`)) : ['', '', '']);

const heatLine = () => { const I = S.ideo; if (!IDEO.hasHeat(I?.v) || !I.heat) return ''; const r = Math.round((1 - IDEO.heatDrag(S, 'raiseMult')) * 100), b = Math.round((1 - IDEO.heatDrag(S, 'b2bMult')) * 100); return ivh('ideo.page.heatLine', { 压力: `<b class="${I.heat >= P['ideo.heat.half'] ? 'bad' : 'warn'}">${Math.round(I.heat)}</b>`, 估值: r, 订单: b }); };
// 开局这里没有任何按钮：只有公司目标。入股之后是路线之争的进度；走完以后是结局和解锁的行动
function ideoPanel() {
  const I = S.ideo, v = IDEO.verOf(S), g = IDEO.goalOf(S), C = IDEO.castOf(S), reds = S.staff.filter(e => e.red).length;
  let h = `<div class="goal ${I?.result || ''} ${v}"><small>${ivh('ideo.page.goal')}</small><b>${esc(g.name)}</b>${g.desc ? `<small>${esc(g.desc)}</small>` : ''}</div>`;
  if (!I) return h + `<p class="empty">${ivh('ideo.page.empty')}</p>`;
  if (I.on) {
    h += `<h4>${ivh('ideo.page.chain')}<small>${ivh('ideo.page.stage', { 级: Math.min(IDEO.IDEO_LEN, I.n + 1), 总: IDEO.IDEO_LEN })}</small></h4>${ibars(I)}
    <p class="note">${esc(IDEO.leanText(S))}</p>
    <p class="note">${ivh('ideo.page.rule')}<br>${ivh('ideo.page.equity', { 股权: `<b class="${S.equity < IDEO.IDEO_EQUITY ? 'bad' : S.equity < P['ideo.equityWarn'] ? 'warn' : 'good'}">${S.equity.toFixed(0)}%</b>`, 底线: IDEO.IDEO_EQUITY })}${heatLine() ? `<br>${heatLine()}` : ''}${reds ? `<br>${ivh('ideo.page.reds', { 人数: reds })}` : ''}</p>
    <h4>${ivh('ideo.page.cast')}</h4><div class="cast">${['rep', 'red', 'cap'].map(k => `<div class="${k}"><b>${esc(C[k].name)}</b><small>${esc(C[k].role)}</small><p>${esc(C[k].desc)}</p></div>`).join('')}</div>`;
    if (I.picks.length) h += `<h4>${ivh('ideo.page.picks')}</h4><ul class="ipicks">${I.picks.slice(-6).reverse().map(p => `<li class="${p.side}"><small>${ivh('ideo.page.pickN', { 级: p.n })}</small>${esc(tr(p.label))}</li>`).join('')}</ul>`;
    return h;
  }
  const R = RESULT_OF(I.result), st = [];
  h += `<div class="iresult ${I.result} ${v}"><span>${R[0]}</span><div><b>${R[1]}</b><small>${R[2]}</small></div></div>${ibars(I)}`;
  if (heatLine()) h += `<p class="note">${heatLine()}</p>`;
  if (I.plan) st.push(IDEO.vt(S, 'ideo.page.plan', { 日期: G.dateStr(I.plan.due) }));
  if (S.flags.yank) st.push(IDEO.vt(S, 'ideo.page.yank'));
  if (S.flags.bci_ok) st.push(S.ownModel ? IDEO.vt(S, 'ideo.page.bci.model', { 张数: G.brainGpu(S) }) : IDEO.vt(S, 'ideo.page.bci.app', { 降幅: Math.round((1 - P['bci.apiMult']) * 100) }));
  else if (S.flags.bci_on && !S.flags.bci_shut) st.push(IDEO.vt(S, 'ideo.page.bci.on'));
  if (S.flags.utopia_ok) st.push(IDEO.vt(S, 'ideo.page.utopia.ok', { 增长: Math.round((IDEO_FLAG_MODS.utopia_ok.growthMult - 1) * 100) }));
  else if (S.flags.utopia_on && !S.flags.utopia_fail) st.push(IDEO.vt(S, 'ideo.page.utopia.on'));
  if (S.flags.red_cell || S.flags.rose_cell) st.push(IDEO.vt(S, 'ideo.page.cell'));
  if (reds && I.result === 'red') st.push(IDEO.vt(S, 'ideo.page.mark', { 人数: reds }));
  if (st.length) h += `<ul class="istat">${st.map(s => `<li>${esc(s)}</li>`).join('')}</ul>`;
  return h;
}
// 事件窗里的进度条（路线之争的每一级和结局窗）
function ideoStrip(d) {
  if (d.chain !== 'ideo' || !S?.ideo) return '';
  const n = +(/^ideo_(\d+)$/.exec(d.id || '')?.[1] || 0);
  const vars = { 级: n, 总: IDEO.IDEO_LEN, 股权: S.equity.toFixed(0), 底线: IDEO.IDEO_EQUITY };
  const line = n ? (n >= P['ideo.lean.from'] && !V.res ? IDEO.vt(S, 'ideo.page.strip.lean', { ...vars, 倾向: leanShort() }) : IDEO.vt(S, 'ideo.page.strip', vars)) : '';
  return `<div class="pdx-ideo">${ibars(S.ideo)}${line ? `<small>${esc(line)}</small>` : ''}</div>`;
}
// 左翼结局：顶部正中挂一枚徽章（都是原创线稿），下面是新的公司目标。深圳是镰刀锤子；湾区是一朵玫瑰，外加一行小字否认
const EMBLEM_SVG = '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M41.7 76.2A30 30 0 1 0 41.7 19.8A28.3 28.3 0 1 1 41.7 76.2Z"/><path class="h" d="M44.5 73L27 90"/><path class="h" d="M35 41L79 85"/><rect x="-15" y="-6.5" width="30" height="13" rx="2" transform="translate(30 36) rotate(-45)"/></svg>';
const ROSE_SVG = '<svg viewBox="0 0 100 100" aria-hidden="true"><path class="st" d="M50 57C47 67 53 78 50 92"/><path class="lf" d="M50 73C43 63 31 63 26 70C32 78 43 79 50 73Z"/><path class="lf" d="M51 81C57 72 69 71 74 77C69 85 58 86 51 81Z"/><path class="p1" d="M29 37C28 25 36 17 43 20C46 13 55 13 58 20C65 17 73 25 71 37C69 50 60 59 50 59C40 59 31 50 29 37Z"/><path class="p2" d="M36 36C36 28 42 23 48 25C53 21 59 24 62 30C66 36 63 46 56 50C49 53 40 50 37 44"/><path class="p2" d="M44 35C44 30 49 28 53 30C57 32 57 38 53 41C49 43 46 40 47 36"/></svg>';
function emblemHTML() {
  if (!S || (V.theme !== 'soviet' && V.theme !== 'rose')) return '';
  const g = IDEO.goalOf(S).name, us = V.theme === 'rose';
  return `<div class="emblem${us ? ' rose' : ''}" title="${esc(g)}"><i class="medal">${us ? ROSE_SVG : EMBLEM_SVG}</i><span>${esc(g)}</span>${us ? `<small>${ivh('ideo.page.emblem', null, true)}</small>` : ''}</div>`;
}
// 湾区的哈桑·拍客彩蛋：插画上叠一个卡通主播（原创形象，不是任何真人的肖像）
const STREAMER = '<svg class="art" width="118" height="118" viewBox="0 0 120 120"><circle cx="60" cy="56" r="47" fill="none" stroke="#fff3d6" stroke-width="7" opacity=".55"/><path d="M14 120Q16 92 42 88L78 88Q104 92 106 120Z" fill="#c98a62" stroke="#1e2233" stroke-width="3"/><path d="M38 120L41 92Q60 101 79 92L82 120Z" fill="#2e3442" stroke="#1e2233" stroke-width="3"/><rect x="50" y="74" width="20" height="16" fill="#c98a62" stroke="#1e2233" stroke-width="3"/><ellipse cx="60" cy="54" rx="24" ry="27" fill="#d49a72" stroke="#1e2233" stroke-width="3"/><path d="M36 50Q36 26 60 26Q84 26 84 50Q80 38 70 36Q60 40 50 36Q40 40 36 50Z" fill="#2b2220" stroke="#1e2233" stroke-width="3"/><path d="M37 58Q38 82 60 84Q82 82 83 58Q78 70 72 68Q60 74 48 68Q42 70 37 58Z" fill="#2b2220" stroke="#1e2233" stroke-width="2.5"/><path d="M46 47h9M65 47h9" stroke="#1e2233" stroke-width="3.5" stroke-linecap="round"/><circle cx="51" cy="54" r="2.6" fill="#1e2233"/><circle cx="69" cy="54" r="2.6" fill="#1e2233"/><path d="M53 71Q60 75 67 71" fill="none" stroke="#f3e6d8" stroke-width="2.5" stroke-linecap="round"/><path d="M33 52Q33 20 60 20Q87 20 87 52" fill="none" stroke="#22252d" stroke-width="5"/><rect x="27" y="46" width="11" height="18" rx="5" fill="#3a3f4c" stroke="#1e2233" stroke-width="2.5"/><rect x="82" y="46" width="11" height="18" rx="5" fill="#3a3f4c" stroke="#1e2233" stroke-width="2.5"/><path d="M33 62Q36 76 49 76" fill="none" stroke="#22252d" stroke-width="3"/><rect x="47" y="72" width="9" height="7" rx="3.5" fill="#e5484d" stroke="#1e2233" stroke-width="2"/><circle cx="46" cy="104" r="4.5" fill="#e0435e" stroke="#1e2233" stroke-width="2"/></svg>';
const rightTabs = () => [['board', 'board'], ['chain', 'pin'], ['team', 'team'], ['safe', 'safe'], ['perks', 'cards'], ['fin', 'ledger'], ['log', 'news']].map(([id, ic]) => [id, icon(ic, 18), text('ui.rtab.' + id)]);
// 情境日志：进行中的特殊项目 + 各条事件链的进展
function chainTab() {
  const proj = S.projects.map(p => {
    const rate = G.projectRate(S, p), left = Math.max(0, p.need - p.done), ch = chainInfo(p.chain);
    const eta = left <= 0 ? uh('ui.proj.check') : p.kind === 'ap' ? uh('ui.proj.apOnly') : rate > 0.01 ? uh('ui.proj.eta', { 月数: Math.ceil(left / rate) }) : uh('ui.proj.stalled');
    return `<div class="proj"><b>${ch ? ch.icon : '📌'} ${esc(tr(p.name))}</b><small>${esc(tr(p.desc))}</small><div class="bar"><i style="width:${pct(p.done, p.need)}%"></i></div><small>${uh('ui.proj.line', { 类型: KIND_NAME[p.kind], 进度: eta, 日期: G.dateStr(p.due) })}${p.due - S.t <= P['advice.proj.urgent'] && left > 0 ? ` <b class="bad">${uh('ui.proj.late')}</b>` : ''}</small><button class="btn sm" data-a="push:${p.uid}" ${S.ap < 1 || left <= 0 ? 'disabled' : ''}>${uh('ui.proj.push')}</button></div>`;
  }).join('');
  const logs = Object.values(S.chains).sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || b.t - a.t).map(c => {
    const ch = chainInfo(c.id) || { title: c.id, icon: '📜' };
    return `<div class="chainlog ${c.done ? 'done' : ''}"><b>${ch.icon} ${ch.title}</b>${c.done ? `<i>${uh('ui.chain.done')}</i>` : ''}${c.notes.slice().reverse().map(n => `<p><small>${G.dateStr(n.t)}</small>${esc(n.text)}</p>`).join('')}</div>`;
  }).join('');
  return (proj || `<p class="empty">${uh('ui.proj.none')}</p>`) + (logs ? `<h4>${uh('ui.chain.log')}</h4>${logs}` : '');
}
function rightBody() {
  if (V.rtab === 'board') {
    const rows = G.board(S), max = Math.max(...rows.map(r => r.bench)), min = Math.min(...rows.map(r => r.bench)) - 6;
    return `<div class="lb">${rows.map((r, i) => `<div class="row ${r.me ? 'me' : ''}"><span class="rk">${i + 1}</span><span class="nm"><b>${esc(r.name)}</b><small>${esc(r.model)}</small></span><span class="bar"><i style="width:${Math.max(4, (r.bench - min) / (max - min) * 100)}%;background:${r.me ? S.co.brand || '#ff6b4a' : G.rivalOf(S, r.id)?.color || '#888'}"></i></span><span class="sc">${r.bench.toFixed(1)}</span></div>`).join('')}</div>
    <p class="note">${S.ownModel ? uh('ui.board.note.own', { 前沿: G.frontier(S.t).toFixed(1), 火候: G.myCap(S).toFixed(1) }) : uh('ui.board.note', { 前沿: G.frontier(S.t).toFixed(1) })}</p>`;
  }
  if (V.rtab === 'chain') return chainTab();
  if (V.rtab === 'team') return `<p class="note">${uh('ui.team.note', { 人数: S.staff.length, 上限: G.teamCap(S), 月薪: G.money(S, G.costs(S).salary) })}</p>` + (S.staff.length ? S.staff.map(e => person(e, `<button class="btn sm ghost" data-a="fire:${e.uid}" title="${uh('ui.team.fire', { 月数: P['fire.payMonths'] })}">✕</button>`)).join('') : `<p class="empty">${uh('ui.team.none')}</p>`);
  if (V.rtab === 'safe') return (S.dirt.length ? S.dirt.map(d => `<div class="dirt"><b>${esc(tr(d.name))}</b>${DIRT[d.type]?.crime ? `<i>${uh('ui.dirt.crime')}</i>` : ''}<div class="bar"><i style="width:${Math.min(100, d.sev * 2.5)}%"></i></div><small>${uh('ui.dirt.line', { 严重度: Math.round(d.sev), 日期: G.dateStr(d.t) })}</small></div>`).join('') : `<p class="empty">${uh('ui.dirt.none')}</p>`)
    + `<p class="note">${uh('ui.dirt.note')}<br>${uh('ui.dirt.exposed', { 累计: Math.round(S.exposed), 违法: S.exposedCrime >= P['ui.crimeShow'] ? uh('ui.dirt.exposedCrime', { 违法: Math.round(S.exposedCrime), 经侦线: P['scandal.probeLine'] }) : '' })}</p>`;
  if (V.rtab === 'perks') {
    const temps = S.temp.filter(t => t.until - S.t < 900).map(t => `<li>${MOD_NAME[t.key] || t.key} ${t.mult != null ? '×' + t.mult : (t.add > 0 ? '+' : '') + t.add}<small> ${uh('ui.perks.left', { 月数: t.until - S.t })}</small></li>`).join('');
    return (S.perks.length ? S.perks.map(id => `<div class="perk r${PERK[id].r}"><span>${PERK[id].icon}</span><div><b>${PERK[id].name}</b><small>${PERK[id].desc}</small></div></div>`).join('') : `<p class="empty">${uh('ui.perks.none')}</p>`)
      + (S.feats.length ? `<h4>${uh('ui.perks.feats')}</h4><div class="feats">${S.feats.map(id => `<span title="${esc(FEAT[id].desc)}">${FEAT[id].icon} ${FEAT[id].name}</span>`).join('')}</div>` : '')
      + (temps ? `<h4>${uh('ui.perks.temps')}</h4><ul class="temps">${temps}</ul>` : '')
      + `<h4>${uh('ui.perks.founder', { 名字: esc(playerName(S, 'name')) })}</h4><div class="feats">${ATTRS.map(a => `<span title="${a.desc}">${a.icon} ${a.name} ${S.founder.attrs[a.id]}</span>`).join('')}</div><div class="feats">${S.founder.traits.map(id => `<span title="${esc(TRAIT[id].desc)}">${TRAIT[id].icon} ${TRAIT[id].name}</span>`).join('')}</div>`;
  }
  if (V.rtab === 'fin') {
    const rv = G.revenue(S), cs = G.costs(S), net = rv.total - cs.total, row = (n, v, neg) => (v > 0.05 ? `<div class="fr"><span>${n}</span><b class="${neg ? 'bad' : 'good'}">${G.money(S, neg ? -v : v, true)}</b></div>` : '');
    return `<h4 style="border:0;margin-top:0;padding-top:0">${uh('ui.fin.rev')}</h4>${row(uh('ui.fin.sub'), rv.sub)}${row(uh('ui.fin.api'), rv.api)}${row(uh('ui.fin.b2b'), rv.b2b)}<h4>${uh('ui.fin.cost')}</h4>${row(uh('ui.fin.salary'), cs.salary, 1)}${row(uh('ui.fin.rent'), cs.rent, 1)}${row(uh('ui.fin.gpu'), cs.gpu, 1)}${row(uh('ui.fin.upstream'), cs.api, 1)}${row(uh('ui.fin.misc'), cs.misc, 1)}
    <div class="fr tot"><span>${uh('ui.fin.net')}</span><b class="${net < 0 ? 'bad' : 'good'}">${G.money(S, net, true)}</b></div>
    <p class="note">${uh('ui.fin.market', { 赛道: TRACKS[S.co.track].name, 盘子: G.fmtUsers(G.market(S)), 份额: (G.shareCap(S) * 100).toFixed(0), 体验: S.quality.toFixed(0) })}${S.stage < STAGES.length - 2 ? `<br>${uh('ui.fin.next', { 轮次: STAGES[S.stage + 1].name, 用户: G.fmtUsers(STAGES[S.stage + 1].users), 收入: G.money(S, STAGES[S.stage + 1].rev) })}` : ''}${S.vam ? `<br><b class="bad">${uh('ui.fin.vam')}</b>${uh('ui.fin.vam.text', { 日期: G.dateStr(S.vam.due), 目标: G.fmtUsers(S.vam.target) })}` : ''}</p>`;
  }
  return S.log.map(l => `<div class="lg"><small>${G.dateStr(l.t)}</small>${esc(l.msg)}</div>`).join('');
}
function rightPanel() {
  if (!rightOpen(S)) return '';                                             // 教学第一个月：右边先不出现
  const tabs = rightTabs().filter(([id]) => rtabOpen(S, id));
  if (!tabs.some(([id]) => id === V.rtab)) V.rtab = tabs[0]?.[0] || 'team';
  const g = (id, ic, name, v, color, tip) => !gaugeOpen(S, id) ? '' : `<div class="g" title="${tip}"><span>${ic} ${name}</span><div class="bar"><i style="width:${Math.round(v)}%;background:${color}"></i></div><b>${Math.round(v)}</b></div>`;
  const badge = id => (id === 'safe' && S.dirt.length ? ` ${S.dirt.length}` : id === 'chain' && S.projects.length ? ` ${S.projects.length}` : '');
  return `<aside class="right panel"><div class="gauges">${g('hype', icon('flame', 14), uh('ui.gauge.hype'), S.hype, '#ff6b4a', uh('ui.gauge.hype.tip'))}${g('rep', icon('star', 14), uh('ui.gauge.rep'), S.rep, '#e0a100', uh('ui.gauge.rep.tip'))}${g('morale', icon('smile', 14), uh('ui.gauge.morale'), S.morale, '#2ec4a6', uh('ui.gauge.morale.tip'))}${g('reg', icon('bank', 14), uh('ui.gauge.reg'), S.reg, '#3a4460', uh('ui.gauge.reg.tip', { 过高: P['reg.high'] }))}${g('bubble', icon('bubble', 14), uh('ui.gauge.bubble'), S.bubble, '#7b5cff', uh('ui.gauge.bubble.tip'))}${g('dirt', icon('bomb', 14), uh('ui.gauge.dirt'), Math.min(100, G.dirtTotal(S)), '#111', uh('ui.gauge.dirt.tip'))}</div>
  <nav class="tabs">${tabs.map(([id, ic, n]) => `<button class="tab ${V.rtab === id ? 'on' : ''}" data-a="rtab:${id}">${ic}<span>${n}${badge(id)}</span></button>`).join('')}</nav><div class="scroll" data-sc="r-${V.rtab}">${rightBody()}</div></aside>`;
}
function bottom() {
  const items = [];
  if (S.ownModel && isOpen(S, 'model')) {
    const free = Math.max(0, S.gpu - G.inferNeed(S)), gain = S.furnace?.on ? free * G.researchEff(S) * DATA_SOURCES[S.furnace.data].mult : 0, cur = G.myCap(S), nxt = G.capOf(G.baseE(S.t) + S.E + gain);
    // 火候够了就能直接点出炉；炉子凉了点一下去租卡
    const rel = actOpen(S, 'release') && !A.actionState(S, A.ACT.release).why, cold = gain <= 0 && ltabOpen(S, 'ops');
    const link = rel ? ` data-a="act:release" title="${uh('ui.w.release.tip')}"` : cold ? ` data-a="ltab:ops" title="${uh('ui.w.cold.tip')}"` : '';
    items.push(`<div class="w furnace ${gain > 0 ? 'on' : ''}${rel ? ' ready' : ''}"${link}><span class="big">${gain > 0 ? '🔥' : '🪨'}</span><div><b>${uh('ui.w.furnace', { 火候: cur.toFixed(1) })}</b> <small>${rel ? uh('ui.w.ready') : gain > 0 ? uh('ui.w.gain', { 涨: (nxt - cur).toFixed(2) }) : uh('ui.w.cold')}</small><br><small>${uh('ui.w.stats', { 现役: S.model ? S.model.cap.toFixed(1) : '—', 榜首: Math.max(...S.rivals.map(r => r.bench)).toFixed(1), 数据: DATA_SOURCES[S.furnace?.data || 'open'].name })}</small></div></div>`);
  }
  if (isOpen(S, 'product')) {                                                // 研发空着：点一下直接开下一个功能冲刺
    const idle = !S.sprint && actOpen(S, 'sprint') && !A.ACT.sprint.block(S), now = idle && S.ap >= A.ACT.sprint.ap;
    const link = idle ? ` data-a="${now ? 'act:sprint' : 'ltab:rd'}" title="${now ? uh('ui.w.sprint.tip') : uh('ui.w.noAp.tip')}"` : '';
    items.push(`<div class="w${idle ? ' ready' : ''}"${link}><span class="big">${TRACKS[S.co.track].icon}</span><div><b>${uh('ui.w.product', { 赛道: TRACKS[S.co.track].name, 体验: S.quality.toFixed(0) })}</b><br><small>${S.sprint ? uh('ui.w.dev', { 功能: FEAT[S.sprint.id].name, 进度: Math.round(S.sprint.done / S.sprint.need * 100) }) : idle ? (now ? uh('ui.w.idle') : uh('ui.w.idleLater')) : uh('ui.w.allDone')}</small></div></div>`);
  }
  if (S.projects.length) { const p = S.projects[0]; items.push(`<div class="w" data-a="rtab:chain" style="cursor:pointer"><span class="big">📌</span><div><b>${uh('ui.w.proj', { 个数: S.projects.length })}</b><br><small>${esc(tr(p.name))} ${Math.round(pct(p.done, p.need))}%</small></div></div>`); }
  return `<footer class="bottom"><div class="widgets">${items.join('')}</div><div class="ticker panel">${S.log.slice(0, 3).map(l => `<span>${esc(l.msg)}</span>`).join('')}</div></footer>`;
}
const chipsHTML = cs => (cs || []).map(c => `<span class="chg ${c.good == null ? '' : c.good ? 'good' : 'bad'}">${c.name} ${c.v}</span>`).join('');
function toastHTML() {
  const t = V.toast;
  return t ? `<div class="toast panel" data-a="toast">${t.ok != null ? `<span class="${t.ok ? 'ok' : 'no'}">${t.ok ? uh('ui.toast.ok') : uh('ui.toast.fail')}　</span>` : ''}${nl(t.text)}<div>${chipsHTML(t.chips)}</div></div>` : '';
}
// P 社式事件窗：顶部插画 + 正文 + 选项（悬停看效果）
const tipLines = ls => ls.map(([t, good]) => `<span class="${good == null ? '' : good ? 'good' : 'bad'}">${esc(t)}</span>`).join('');
function tipHTML(tip) {
  if (!tip) return '';
  if (tip.fx) return tip.fx.length ? `<span class="tip"><u>${uh('ui.tip.fx')}</u>${tipLines(tip.fx)}</span>` : '';
  const none = `<span>${uh('ui.tip.nothing')}</span>`;
  return tip.ok.length || tip.fail.length ? `<span class="tip"><u>${uh('ui.ok')}</u>${tipLines(tip.ok) || none}<u>${uh('ui.fail')}</u>${tipLines(tip.fail) || none}</span>` : '';
}
function modal() {
  if (!V.dlg) return '';
  const view = V.dlg.local ? null : V.dialogView?.read(), d = view?.dialog || V.dlg, result = view?.result || V.res;
  const C = CAT[d.cat] || CAT.sys, ch = d.chain && chainInfo(d.chain), img = d.art ? artURL(d.art) : '';
  const bar = `<div class="pdx-bar">${langButton()}<span class="tag" style="--c:${C.color}">${C.name}</span>${ch ? `<span class="tag chain">${uh('ui.dlg.chain', { 图标: ch.icon, 链: ch.title })}</span>` : ''}${d.closable && !V.res ? '<button class="x" data-a="dlg:close">✕</button>' : ''}</div>`;
  const ttl = `<h2${img ? '' : ' class="pdx-title"'}><i>${d.icon || ''}</i>${esc(d.title)}</h2>`;
  const head = bar + (img ? `<div class="pdx-art" style="background-image:url('${img}')">${d.portrait === 'longhair' ? LONGHAIR : d.portrait === 'streamer' ? STREAMER : ''}${ttl}</div>` : ttl) + ideoStrip(d);
  if (V.res) {
    const fx = (result.chips || []).map(c => `<span class="fxl ${c.good == null ? '' : c.good ? 'good' : 'bad'}">${c.name} ${c.v}</span>`).join('');
    return `<div class="veil"><div class="pdx">${head}<div class="pdx-text">${V.res.ok != null ? `<span class="stamp ${V.res.ok ? 'ok' : 'no'}">${V.res.ok ? uh('ui.ok') : uh('ui.fail')}</span>` : ''}${nl(result.text)}</div>${fx ? `<div class="pdx-fx">${fx}</div>` : ''}<div class="pdx-opts"><button class="opt go" data-a="res">${uh('ui.dlg.continue')}</button></div></div></div>`;
  }
  const opts = d.options.map((o, i) => (d.kind === 'cards'
    ? `<button class="pcard r${o.card.r || 1}" data-a="dlg:${i}"><span class="pi">${o.card.icon}</span><b>${esc(o.card.name)}</b><small>${nl(o.card.desc)}</small></button>`
    : `<button class="opt" data-a="dlg:${i}" ${o.disabled ? 'disabled' : ''}><span class="ol"><b>${o.side ? `<i class="side ${o.side}">${IDEO.sideTag(S)[o.side]}</i>` : ''}${esc(o.label)}</b>${o.hint || o.why ? `<small>${esc(o.disabled && o.why ? o.why : o.hint)}</small>` : ''}</span>${o.chk ? `<i class="chk">${o.chk}</i>` : ''}${o.disabled ? '' : tipHTML(o.tip)}</button>`)).join('');
  return `<div class="veil"><div class="pdx ${d.kind === 'cards' ? 'wide' : ''}">${head}<div class="pdx-text">${nl(d.text)}</div><div class="${d.kind === 'cards' ? 'pcards' : 'pdx-opts'}">${opts}</div></div></div>`;
}
function endScreen() {
  const o = S.over, E = ENDINGS[o.id], R = V.summary, t = Math.min(o.t, MONTHS), img = artURL(ENDING_ART[o.id]);
  const stats = [['alive', uh('ui.end.months', { 月数: t })], ['val', G.money(S, o.val)], ['equity', S.equity.toFixed(0) + '%'], ['users', G.fmtUsers(S.stats.maxUsers)], ['raised', G.money(S, S.stats.raised)], ['events', S.stats.events], ['perks', S.perks.length], ['exposed', Math.round(S.exposed)]].map(([k, v]) => [uh('ui.end.' + k), v]);
  return `<section class="endc panel ${E.good ? 'good' : 'bad'}">${img ? `<div class="endart" style="background-image:url('${img}')"></div>` : ''}<div class="eicon">${E.icon}</div><small>${uh('ui.end.sub', { 公司: esc(playerName(S, 'coName')), 日期: G.dateStr(t) })}</small><h1>${E.name}</h1><p class="etext">${nl(G.fmt(S, E.text).replace('{pay}', G.money(S, o.pay || 0)))}</p>
  <div class="estats">${stats.map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('')}</div>
  <div class="escore">${uh('ui.end.score', { 得分: `<b>${R.score}</b>`, 人脉点: `<b>+${R.points}</b>` })}${R.newEnd ? `　<i>${uh('ui.end.new')}</i>` : ''}</div>
  ${R.newAch.length ? `<div class="each">${R.newAch.map(a => `<span title="${esc(ACHIEVEMENTS[a].desc)}">${ACHIEVEMENTS[a].icon} ${ACHIEVEMENTS[a].name}</span>`).join('')}</div>` : ''}
  <div class="tbtns row">${langButton()}<button class="btn big go" data-a="new">${uh('ui.end.again')}</button><button class="btn" data-a="meta">${uh('ui.meta.h')}</button><button class="btn ghost" data-a="back">${uh('ui.end.title')}</button></div></section>`;
}

// ───────── 设置、配乐、环境声 ─────────

const fpsText = () => { const s = office?.stats; return s ? `${Math.round(s.fps)} FPS · ${s.gpu ? s.gpu.toFixed(1) : '—'} ms` : ''; };
const perfText = () => { const s = office?.stats; return s ? ut('ui.set.perf', { 帧: Math.round(s.fps), 毫秒: s.gpu ? s.gpu.toFixed(1) : '—', 绘制: s.calls }) : ''; };
function settingsHTML() {
  const q = office?.quality?.(), vol = audio.getState().volume, p = x => Math.round((x ?? 0) * 100);
  // 画质：七档从「手机」到「极致」，下面写着这一档开了什么、内部按多大分辨率渲染；再往下是渲染精度和帧率上限
  const lv = q?.levels.find(l => l.id === q.q), fpsOn = q && (q.fps == null ? 'auto' : String(q.fps));
  const gfx = q ? `<h4>${uh('ui.set.gfx')}</h4><div class="seg tiers">${q.levels.map(l => `<button class="${q.q === l.id ? 'on' : ''}" data-a="gfx:${l.id}" title="${esc(l.desc || '')}">${l.name}</button>`).join('')}</div>
  <p class="note tierdesc"><b>${esc(lv?.name || '')}</b>　${esc(lv?.desc || '')}${q.res ? `<br>${uh('ui.set.res', { 宽: q.res[0], 高: q.res[1] })}` : ''}</p>
  <div class="set-row scalerow"><span>${uh('ui.set.scale')}</span><input type="range" min="50" max="150" step="10" value="${Math.round((q.scale || 1) * 100)}" data-s="scale"><b>${Math.round((q.scale || 1) * 100)}%</b></div>
  <div class="set-row fpsrow"><span>${uh('ui.set.fps')}</span><div class="seg">${[['auto', uh('ui.set.fps.auto')], ['30', '30'], ['60', '60'], ['0', uh('ui.set.fps.none')]].map(([v, n]) => `<button class="${fpsOn === v ? 'on' : ''}" data-a="fpscap:${v}">${n}</button>`).join('')}</div></div>
  <label class="chk"><input type="checkbox" data-s="auto" ${q.auto ? 'checked' : ''}> ${uh('ui.set.auto')}</label><p class="note" data-live="perf">${perfText()}</p>
  <p class="note">${uh('ui.set.gpu', { 显卡: `<b>${esc(q.gpu || ut('ui.set.gpu.unknown'))}</b>`, 类型: q.phone ? uh('ui.set.gpu.phone') : q.tablet ? uh('ui.set.gpu.tablet') : q.igpu ? uh('ui.set.gpu.igpu') : '' })}</p>${q.igpu ? `<p class="note warn">${uh('ui.set.igpu', { 建议: uh('ui.gpuTip') })}</p>` : ''}${q.phone ? `<p class="note">${uh('ui.set.phone')}</p>` : ''}${q.q === 'max' ? `<p class="note">${uh('ui.set.max')}</p>` : ''}` : `<p class="note">${uh('ui.set.no3d')}</p>`;
  const row = (k, n) => `<div class="set-row"><span>${n}</span><input type="range" min="0" max="100" value="${p(vol[k])}" data-s="vol:${k}"><b>${p(vol[k])}</b></div>`;
  return `<div class="veil"><section class="settings panel"><h2>${icon('settings', 20)} ${uh('ui.set.h')}</h2><div class="set-row"><span>${tr('语言')}</span>${langButton()}</div>${gfx}
  <h4>${uh('ui.set.sound')}</h4>${row('master', uh('ui.set.vol.master'))}${row('music', uh('ui.set.vol.music'))}${row('sfx', uh('ui.set.vol.sfx'))}${row('amb', uh('ui.set.vol.amb'))}
  <label class="chk"><input type="checkbox" data-s="mute" ${muted ? 'checked' : ''}> ${uh('ui.set.mute')}</label>
  <h4>${uh('ui.set.display')}</h4><label class="chk"><input type="checkbox" data-s="hints" ${V.hintsOff ? '' : 'checked'}> ${uh('ui.set.hints')}</label><label class="chk"><input type="checkbox" data-s="fps" ${V.fps ? 'checked' : ''}> ${uh('ui.set.showFps')}</label>
  <label class="chk"><input type="checkbox" data-s="themefx" ${V.themeFxOff ? '' : 'checked'}> ${uh('ui.set.themefx')}</label>
  <div class="row"><button class="btn go" data-a="settings:close">${uh('ui.set.done')}</button></div></section></div>`;
}
function setting(s, el) {
  if (s === 'auto') { const q = office?.quality?.(); if (q) office.setQuality(q.q, el.checked); }
  else if (s === 'mute') setMuted(el.checked);
  else if (s === 'scale') {                                                   // 渲染精度：拖的时候只改数字，停手 0.3 秒再真正换分辨率
    if (el.nextElementSibling) el.nextElementSibling.textContent = el.value + '%';
    clearTimeout(scaleTimer); scaleTimer = setTimeout(() => { office?.setScale?.(+el.value / 100); render(); }, 300);
  }
  else if (s === 'hints') { V.hintsOff = !el.checked; try { localStorage.setItem('ldt_hints', V.hintsOff ? '0' : '1'); } catch { /* 存不了就算了 */ } render(); }
  else if (s === 'fps') { V.fps = el.checked; try { localStorage.setItem('ldt_fps', V.fps ? '1' : '0'); } catch { /* 存不了就算了 */ } render(); }
  else if (s === 'themefx') { V.themeFxOff = !el.checked; if (V.themeFxOff) stopThemeFx(); try { localStorage.setItem('ldt_themefx', el.checked ? '1' : '0'); } catch { /* 存不了就算了 */ } }
  else if (s.startsWith('vol:')) {
    audio.setVolume({ [s.slice(4)]: +el.value / 100 }); if (el.nextElementSibling) el.nextElementSibling.textContent = el.value;
    try { localStorage.setItem('ldt_audio_v1', JSON.stringify(audio.getState().volume)); } catch { /* 存不了就算了 */ }
  }
}
// 配乐跟着局势走：开局平静，缺钱紧张，快破产或者黑料要爆了就是危机；结局分胜负
// ───────── 意识形态主题、危机时刻 ─────────
const THEME_FX = { soviet: ['burn', 'burn'], rose: ['bloom', 'bloom'], cold: ['frost', 'freeze'] };   // 主题 → [过场动画, 音效]
function themeWanted() {
  if (!S || !(V.screen === 'play' || V.screen === 'end')) return '';
  const r = S.ideo?.result;
  return r === 'red' ? (IDEO.verOf(S) === 'us' ? 'rose' : 'soviet') : r === 'cap' ? 'cold' : '';
}
let crisisEl = null;
// 危机等级：0 平安；1 紧张；2 危急。快没钱、经侦要上门、监管要动手、董事会要政变、路线之争的股权守不住、反共压力爆表……
function crisisNow() {
  if (!S || S.over || V.screen !== 'play') return 0;
  const rw = G.runway(S), I = S.ideo;
  // 经侦只上门一次：已经上过门，或者保险柜里没有涉嫌违法的黑料了，曝光量再高也不算危险（它只增不减）。
  // 离 40 很近只算紧张；这个月真有不小的概率爆出违法黑料（≥ 8%）才算危急，不然爱走黑箱的玩家会被红光闪上好几年
  const isCrime = d => DIRT[d.type]?.crime, crime = !S.flags.probe && S.dirt.some(isCrime) ? S.exposedCrime : 0;
  // 监管：重锤砸下来以后冷却 10 个月，这期间压力再高也不会再砸
  const reg = S.cd.crack ? 0 : S.reg;
  let lv = 0;
  const at = (l, hit) => { if (hit && l > lv) lv = l; };
  at(2, rw < P['crisis.runwayBad']); at(1, rw < P['crisis.runway']);
  at(2, crime >= P['crisis.crimeBad'] && G.leakRisk(S, isCrime) >= P['advice.dirt.risk']); at(1, crime >= P['advice.crime.from']);
  at(2, reg >= P['crisis.regBad']); at(1, reg >= P['crisis.reg']);
  at(2, S.stage >= P['coup.stage'] && !S.cd.coup && S.equity < P['coup.equity'] && (S.rep < P['coup.rep'] || S.morale < P['coup.morale'] || S.exposed >= P['coup.exposed']));   // 这个月董事会可能政变
  at(1, S.morale < P['crisis.morale']); at(1, G.leakRisk(S) >= P['advice.dirt.bad']); at(1, S.outage > P['crisis.outage']);                                // 黑料：月底爆料概率 ≥ 20%（和行动提示变红同一条线）
  at(2, !!I?.on && I.n >= P['crisis.ideoLate'] && S.equity < IDEO.IDEO_EQUITY); at(1, !!I?.on && S.equity < IDEO.IDEO_EQUITY + P['crisis.ideoMargin']);   // 路线之争：股权守不住，最后三级转危急
  at(1, IDEO.hasHeat(I?.v) && (I.on || I.result === 'red') && I.heat >= P['crisis.heat']);
  return lv;
}
function moodOf() {
  if (V.screen === 'title' || V.screen === 'wizard' || V.screen === 'meta' || !S) return 'title';
  if (V.screen === 'end' && S.over) return ENDINGS[S.over.id].good ? 'triumph' : 'defeat';
  const rw = G.runway(S);
  const lv = crisisNow();                                                  // 危急 → 危机配乐；紧张 → 紧张配乐
  if (lv >= 2) return 'crisis';
  if (lv === 1 || rw < P['crisis.tenseRunway'] || S.reg >= P['reg.high']) return 'tense';
  const hot = S.sprint || (S.ownModel && S.furnace?.on && S.gpu > G.inferNeed(S));
  return hot && S.t % 4 < 2 ? 'focus' : 'calm';
}
// 环境声：城市底噪、办公室人声、炉火、机房风扇、雨……跟着画面里的昼夜和天气走
function sceneAudio() {
  const env = office?.env || {}, night = env.night ?? 0, rain = env.rain ?? 0;
  if (S && (V.screen === 'play' || V.screen === 'end')) {
    const free = Math.max(0, S.gpu - G.inferNeed(S));
    return { mode: V.screen, region: S.co.region, night, rain, staff: S.staff.length, month: ((S.t - 1) % 12 + 12) % 12, alert: crisisNow() >= 2,
      heat: S.ownModel && S.furnace?.on && free > 0 ? G.clamp(0.25 + free / Math.max(1, G.quota(S)) * 0.75, 0, 1) : 0, racks: S.ownModel ? G.clamp(Math.ceil(Math.log2(S.gpu / 8 + 1)), 0, 12) : 0 };
  }
  return { mode: 'title', region: V.W?.region || 'bay', night, rain, staff: V.screen === 'wizard' ? 0 : 7, month: 9, alert: false, heat: 0.7, racks: 4 };
}

// ───────── 渲染与场景同步 ─────────
// 学长老周的教学卡片：当前这一步讲什么
function tutorHTML() {
  const tip = S && !S.over && !V.dlg && !V.wait ? currentTip(S) : null;
  return tip ? `<div class="tutor panel"><span class="tface">${uh('ui.tutor.face')}</span><div><b>${uh('ui.tutor.h', { 标题: tip.title })}</b><p>${esc(tip.text)}</p></div><button class="btn sm" data-a="tip">${uh('ui.tutor.ok')}</button></div>` : '';
}
// 行动提示：顶部居中的一排待办（P 社式提醒栏）。红 = 要紧，金 = 机会或闲置，蓝 = 留意；点一下直接去做
// 老周在讲话的时候先不出来；教学还没开放的行动不推荐（提示本身留着），要去的页签还没开放就整条不提
function hintsNow() {
  if (!S || S.over || V.hintsOff || currentTip(S)) return [];
  const tabOK = h => (!h.go?.ltab || ltabOpen(S, h.go.ltab)) && (!h.go?.rtab || (rightOpen(S) && rtabOpen(S, h.go.rtab)));
  return advise(S).map(h => (h.act && !actOpen(S, h.act) ? { ...h, act: null, later: false } : h)).filter(h => (h.act || h.go) && tabOK(h));
}
const HINT_MAX = P['ui.hintMax'];
function hintCTA(h) {
  if (h.later) return ut('ui.hint.later', { 事: h.act ? ut('ui.hint.later.act', { 行动: A.actName(S, A.ACT[h.act]) }) : ut('ui.hint.later.other') });
  if (h.act) return ut('ui.hint.do', { 行动: A.actName(S, A.ACT[h.act]) });
  const tab = h.go?.ltab ? A.TABS.find(t => t.id === h.go.ltab)?.name : h.go?.rtab ? rightTabs().find(r => r[0] === h.go.rtab)?.[2] : null;
  return tab ? ut('ui.hint.go', { 页签: tab }) : '';
}
function alertsHTML() {
  const hs = V.hints;
  if (!hs.length || V.dlg || V.wait) return '';
  const now = performance.now(), list = V.hintsAll ? hs : hs.slice(0, HINT_MAX);
  const fresh = h => { const age = now - (V.hintSeen[h.id] ?? -1e9); return age < 2200 ? ` new" style="animation-delay:-${Math.round(age)}ms` : ''; };   // 重绘时接着闪，不从头再来
  return `<div class="alerts">${list.map(h => `<div class="alert ${h.lv}${h.later ? ' later' : ''}${fresh(h)}">
    <button class="al" data-a="hint:${h.id}">${icon(h.icon, 15)}<span>${esc(h.title)}</span></button><button class="ax" data-a="hintx:${h.id}" aria-label="${uh('ui.hint.mute.aria')}">${icon('x', 11)}</button>
    <div class="atip"><b>${esc(h.title)}</b><p>${esc(h.text)}</p><small>${esc(hintCTA(h))}<br>${uh('ui.hint.mute', { 多久: muteMonths(h) === 1 ? uh('ui.hint.mute.month') : uh('ui.hint.mute.months', { 月数: muteMonths(h) }) })}</small></div></div>`).join('')}${hs.length > HINT_MAX ? `<button class="alert more" data-a="hintall">${V.hintsAll ? uh('ui.hint.less') : uh('ui.hint.more', { 条数: hs.length - HINT_MAX })}</button>` : ''}</div>`;
}
// 记下每条提示第一次露面的时间：新冒出来的闪一下，并轻轻响一声（刚进游戏那一批不响）
function trackHints() {
  const now = performance.now(), seen = V.hintSeen, ids = new Set(V.hints.map(h => h.id));
  let fresh = false;
  for (const id of ids) if (!(id in seen)) { seen[id] = now; fresh = true; }
  for (const id in seen) if (!ids.has(id)) delete seen[id];
  if (fresh && V.hintsReady) sfx('notify');
  V.hintsReady = true;
}
// 切到对应页签，把要点的那个按钮闪几下
function flash(sel) {
  V.flash = sel ? { sel, until: performance.now() + 2600, scroll: true } : null;
  render();
  clearTimeout(flashTimer);
  if (sel) flashTimer = setTimeout(() => { V.flash = null; ui.querySelector(`[data-a="${sel}"]`)?.classList.remove('hl'); }, 2600);
}
// 点员工或候选人时冒出来的气泡：头像 + 他能带来什么
function popHTML() {
  const p = V.pop, e = p && (S.staff.find(x => x.uid === p.uid) || S.cands.find(x => x.uid === p.uid));
  if (!e) return '';
  const hired = S.staff.includes(e), im = G.staffImpact(S, e);
  return `<div class="pop panel" style="top:${p.top}px;${p.side}:${p.x}px">
  <div class="poph">${avatarSVG(e.uid, e.role, 76)}<div><b>${esc(e.name)}</b><small>${uh('ui.pop.role', { 图标: ROLES[e.role].icon, 岗位: ROLES[e.role].name, 能力: e.skill })}</small>${skillDots(e.skill)}</div></div>
  <h5>${hired ? uh('ui.pop.now') : uh('ui.pop.would')}</h5><ul>${im.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
  ${im.quirk ? `<p class="pq">${esc(im.quirk)}</p>` : ''}<p class="ps">${hired ? uh('ui.pop.pay.hired', { 月薪: G.money(S, im.salary), 日期: G.dateStr(e.since) }) : uh('ui.pop.pay.cand', { 月薪: G.money(S, im.salary) })}</p></div>`;
}
function render() {
  const keep = [...ui.querySelectorAll('[data-sc]')].map(e => [e.dataset.sc, e.scrollTop]);
  if (V.screen === 'play' && S && !S.over) {                                // 教学：检查有没有新系统该开放了，并顺手切到相关页签
    advanceTutorial(S);
    const tip = currentTip(S);
    if (tip && tip.key !== V.tipKey) { V.tipKey = tip.key; if (tip.go?.ltab) V.ltab = tip.go.ltab; if (tip.go?.rtab) V.rtab = tip.go.rtab; }
  }
  V.hints = V.screen === 'play' ? hintsNow() : [];
  V.recActs = new Set(V.hints.filter(h => h.act && !h.later).map(h => h.act));
  if (V.screen === 'play' && !V.dlg && !V.wait) trackHints();
  // 走完路线之争整套界面换装：深圳红色 → 苏联风（烧开），湾区共享繁荣 → 社区合作社风（长出来），两地的资本结局 → 冷色科技风（扫过去）。
  // 刚走完的时候等结局窗弹出来再换，放一段过场；读档、开新局、回标题直接换
  const want = themeWanted();
  if (want !== V.theme && (V.theme === undefined || !V.res)) {
    if (V.theme !== undefined && want && V.screen === 'play' && (V.themeFxOff || playThemeFx(THEME_FX[want][0], ui))) sfx(THEME_FX[want][1]);
    V.theme = want;
  }
  for (const th of Object.keys(THEME_FX)) ui.classList.toggle(th, V.theme === th);
  audio.setFlavor(V.theme);
  // 危机时刻：屏幕边缘的光跟着跳；刚进入危急状态时拉一声警报
  const lv = crisisNow();
  if (crisisEl) crisisEl.className = `crisis-edge${lv ? ' lv' + lv : ''}${V.theme ? ' ' + V.theme : ''}`;
  if (lv >= 2 && (V.crisis || 0) < 2) sfx('alarm');
  V.crisis = lv;
  ui.innerHTML = V.screen === 'title' ? title() : V.screen === 'wizard' ? wizard() : V.screen === 'meta' ? metaScreen()
    : V.screen === 'play' ? topbar() + emblemHTML() + leftPanel() + rightPanel() + bottom() + liftHTML() + alertsHTML() + tutorHTML() + toastHTML() + popHTML() + modal()
      : topbar() + '<div class="dim"></div>' + endScreen();
  if (V.settings) ui.insertAdjacentHTML('beforeend', settingsHTML());
  if (V.fps && V.screen === 'play') ui.insertAdjacentHTML('beforeend', `<div class="fps">${fpsText()}</div>`);
  audio.setMusic(moodOf());
  for (const [k, v] of keep) { const e = ui.querySelector(`[data-sc="${k}"]`); if (e) e.scrollTop = v; }
  const hl = V.screen === 'play' && S && !V.dlg ? currentTip(S)?.hl : null;
  if (hl) ui.querySelector(`[data-a="${hl}"]`)?.classList.add('hl');
  if (V.flash && V.screen === 'play' && performance.now() < V.flash.until) {     // 行动提示点过来的：闪几下，必要时滚到看得见
    const el = ui.querySelector(`[data-a="${V.flash.sel}"]`);
    if (el) { el.classList.add('hl'); if (V.flash.scroll) { V.flash.scroll = false; el.scrollIntoView({ block: 'nearest' }); } }
  }
  syncScene();
}
function syncScene() {
  if (!office) return;
  const rect = s => ui.querySelector(s)?.getBoundingClientRect();
  if (S && (V.screen === 'play' || V.screen === 'end')) {
    const free = Math.max(0, S.gpu - G.inferNeed(S));
    office.sync({
      mode: V.screen === 'end' ? 'end' : 'play', t: S.t, region: S.co.region, level: S.co.office, sign: playerName(S, 'coName'),
      logo: S.co.logo ? logoDataURL(S.co.logo, S.co.brand) : undefined, brand: S.co.brand, founder: { outfit: S.founder.outfit || 'turtleneck' },
      staff: S.staff.map(e => ({ id: e.uid, role: e.role, mood: G.clamp(S.morale + (parseInt(e.uid.slice(1), 10) * 7) % 21 - 10, 0, 100) })),
      racks: S.ownModel ? G.clamp(Math.ceil(Math.log2(S.gpu / 8 + 1)), 0, 12) : 0,
      furnace: S.ownModel && S.furnace?.on && free > 0 ? { heat: G.clamp(0.25 + free / Math.max(1, G.quota(S)) * 0.75, 0, 1) } : null,
      night: String(S.policies.work) === '996', alert: crisisNow() >= 2, floor: floorNow(), bci: !!S.flags.bci_ok,
      district: S.founder.traits.find(id => id.startsWith('d_')), own: !!S.ownModel, track: S.co.track,   // 开局的差异：落脚点决定起步的房子和街区，套壳派没有丹炉，产品赛道有各自的摆设
    });
    const L = rect('.left'), R = rect('.right'), T = rect('.top'), B = rect('.bottom');
    office.setInsets(V.screen === 'play' && L ? { left: L.right + 8, right: R ? innerWidth - R.left + 8 : 16, top: T.bottom + 8, bottom: B ? innerHeight - B.top + 8 : 16 } : { left: 0, right: 0, top: 0, bottom: 0 });
  } else {
    const W = V.screen === 'wizard' ? V.W : null, box = rect('.wizard') || rect('.title');
    office.sync({
      mode: 'title', wizard: V.screen === 'wizard', region: W?.region || 'bay', level: W ? 1 : 3, sign: W && wizardName(W, 'coName') || ut('ui.title.name'),
      logo: W ? logoDataURL(W.logo, W.brand) : undefined, brand: W?.brand, founder: { outfit: W?.outfit || 'turtleneck' },
      staff: W ? [] : TITLE_STAFF, racks: W ? (W.route === 'model' ? 1 : 0) : 4, furnace: { heat: 0.7 }, night: false, alert: false,
      district: W?.district, own: !W || W.route === 'model', track: W?.track,                                  // 建角时选什么，背景里的房子就跟着换
    });
    office.setInsets({ left: box ? box.right + 8 : 0, right: 0, top: 0, bottom: 0 });
  }
}
// 特效：多层楼里出炉、炸炉时电梯自动去研究院；总览时彩蛋人物出场，先去老板那层
const playFx = () => {
  if (!S || !office) return;
  for (const [n, d] of S.fxq.splice(0)) {
    const p = plan(); let delay = 0;
    if (p && V.screen === 'play') {
      const want = n === 'release' || n === 'boom' ? floorRole(p, 'res') : n === 'cameo' && floorNow() < 0 ? bossFloor(p) : null;
      if (want != null && want !== V.floor) { goto(want); delay = (office.lift?.().eta || 0) * 1000; }
    }
    office.play(n, d);
    if (FX_SOUND[n]) { if (delay) setTimeout(() => sfx(FX_SOUND[n]), delay); else sfx(FX_SOUND[n]); }
  }
};
// ───────── 多层办公楼：右侧的电梯面板 ─────────
const plan = () => (S ? floorsOf(S.co.office) : null);
const floorRole = (p, role) => { const i = p.findIndex(f => f.includes(role)); return i >= 0 ? i : 0; };
const bossFloor = p => { const i = p.findIndex(f => f.includes('ceo')); return i >= 0 ? i : p.length - 1; };
const lcdText = (f, n) => (f < 0 || f >= n ? ut('ui.lift.lcd') : `${f + 1}F`);
// 现在看哪一层（-1 = 全楼）。刚搬进新楼先看全楼，之后记住上次看的
function floorNow() {
  if (!plan()) return 0;
  if (V.floorLv !== S.co.office) { V.floorLv = S.co.office; V.floor = -1; }
  return V.floor;
}
function liftHTML() {
  const p = plan();
  if (!p || V.screen !== 'play' || !office?.lift) return '';
  const cur = floorNow(), s = office.lift(), cnt = p.map(() => 0), boss = bossFloor(p);
  for (const e of S.staff) cnt[floorRole(p, e.role)]++;
  const arr = s.moving ? (s.dir > 0 ? 'up' : 'dn') : '', lcd = s.moving ? Math.round(s.pos) : cur;
  return `<div class="lift panel"><div class="lcd"><i class="arr ${arr}">${s.moving ? (s.dir > 0 ? '▲' : '▼') : '●'}</i><b data-live="lcd">${lcdText(lcd, p.length)}</b></div>
  <button class="lb all ${cur < 0 ? 'on' : ''}" data-a="floor:all" title="${uh('ui.lift.all.tip')}">${icon('building', 15)}<span>${uh('ui.lift.all')}</span></button>
  ${p.map((f, i) => `<button class="lb ${cur === i ? 'on' : ''}" data-a="floor:${i}" title="${uh('ui.lift.floor.tip', { 部门: f.map(d => DEPTS[d].name).join(ut('ui.sep')) })}"><b>${i + 1}F</b><span>${f.map(d => DEPTS[d].short).join('·')}</span><em>${i === boss ? '👑' : ''}${cnt[i] || ''}</em></button>`).reverse().join('')}</div>`;
}
// 坐电梯：显示屏跟着数楼层，到站「叮」一声
let liftRaf = 0;
function goto(n) {
  V.floor = n; syncScene();
  const s = office?.lift?.();
  if (s?.moving) { sfx('lift', { pitch: s.dir > 0 ? 2 : -3 }); liftLoop(); }
  render();
}
function liftLoop() {
  cancelAnimationFrame(liftRaf);
  const tick = () => {
    const s = office?.lift?.(); if (!s) return;
    const el = ui.querySelector('.lift [data-live="lcd"]'), ar = ui.querySelector('.lift .arr');
    if (el) el.textContent = lcdText(s.moving ? Math.round(s.pos) : s.open, s.N);
    if (ar) { ar.className = 'arr ' + (s.moving ? (s.dir > 0 ? 'up' : 'dn') : ''); ar.textContent = s.moving ? (s.dir > 0 ? '▲' : '▼') : '●'; }
    if (s.moving) { liftRaf = requestAnimationFrame(tick); return; }
    sfx('ding'); ui.querySelector('.lift')?.classList.add('arrived'); setTimeout(() => ui.querySelector('.lift')?.classList.remove('arrived'), 700);
  };
  liftRaf = requestAnimationFrame(tick);
}
function toast(t) {
  if (!t || (!t.text && !(t.chips || []).length)) return;
  V.toast = t; clearTimeout(toastTimer); if (t.ok == null) sfx('toast');
  toastTimer = setTimeout(() => { V.toast = null; ui.querySelector('.toast')?.remove(); }, 5200);
}

// ───────── 流程 ─────────
function openDialog(d) {
  V.res = null;
  const snd = d.kind === 'cards' ? 'card' : 'open';
  if (d.delay) { V.dlg = null; V.wait = true; render(); setTimeout(() => { V.wait = false; V.dlg = d; sfx(snd); render(); }, d.delay); }
  else { V.dlg = d; sfx(snd); render(); }
}
// 把引擎里排队的对话框一个个放出来；放完就存档
function pump() {
  V.dialogView = S.q.length && !S.over ? dialogView(S, G.nextDialog) : null;
  const d = V.dialogView ? V.dialogView.original : G.nextDialog(S);
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
  const feat = S.featDone?.t === S.t - 1 ? FEAT[S.featDone.id] : null;
  if (!S.over) toast({ text: ut('ui.month.toast', { 日期: G.dateStr(S.t - 1), 收入: G.money(S, S.last.rev), 支出: G.money(S, S.last.cost), 净: G.money(S, S.last.net, true) }) + (feat ? '\n' + ut('ui.month.feat', { 图标: feat.icon, 功能: feat.name }) : '') });
  pump();
}
const resetView = () => { V.theme = undefined; V.crisis = 0; V.summary = null; V.toast = null; V.pop = null; V.tipKey = null; V.hintSeen = {}; V.floorLv = null; V.hintsReady = false; V.hintsAll = false; V.flash = null; };
function startGame(setup) { S = G.newGame(setup, meta); V.screen = 'play'; V.ltab = 'rd'; V.rtab = 'board'; resetView(); pump(); }

const CMD = {
  lang() { setLang(getLang() === 'zh' ? 'en' : 'zh'); if (V.dlg?.local) { const reopen = V.reopen; V.dlg = null; reopen(); } else render(); },
  new() { V.W = newWizard(); V.screen = 'wizard'; V.dlg = null; render(); },
  continue() { const s = G.loadGame(); if (!s) return render(); S = s; V.screen = 'play'; resetView(); pump(); },
  meta() { V.screen = 'meta'; render(); },
  back() { V.screen = 'title'; V.dlg = null; render(); },
  buy(id) { G.buyMeta(meta, id); render(); },
  w(k, a, b) {
    const W = V.W;
    if (k === 'step') W.step = G.clamp(W.step + +a, 0, 4);
    else if (k === 'region') {
      W.region = a; W.logo = LOGOS[a][0].id;
      for (const field of ['name', 'coName']) if (W.autoNames & nameBits[field]) rollName(W, field);
      for (const g of ['seed', 'district']) if (TRAIT[W[g]]?.region && TRAIT[W[g]].region !== a) W[g] = firstOf(g, a);
    }
    else if (k === 'rand') rollName(W, 'name');
    else if (k === 'randco') { rollName(W, 'coName'); rollName(W, 'modelName'); }
    else if (k === 'attr') { const v = W.attrs[a] + +b; if (v >= 5 && v <= 10 && (+b < 0 || ptsLeft(W) > 0)) W.attrs[a] = v; }
    else if (k === 'pick') W[a] = b;
    else if (k === 'brand') W.brand = a;
    else if (k === 'start') {
      for (const field of Object.keys(nameBits)) {
        W[field] = W[field].trim();
        if (!W[field]) { W[field] = defaultName(field); W.autoNames |= nameBits[field]; }
      }
      return startGame({ ...W, traits: wizTraits(W) });
    }
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
    if (S.staff.some(e => e.uid === uid)) office?.play('say', { who: uid, text: rnd(lines('ui.say.staff')) });
    render();
  },
  tip() { dismissTip(S); render(); },
  // 顶部的行动提示：能直接做的就直接做，做不了的切过去把按钮闪给你看
  hint(id) {
    if (V.dlg || V.wait) return;
    const h = V.hints.find(x => x.id === id);
    if (!h) return;
    if (h.act && !h.later && !A.actionState(S, A.ACT[h.act]).why) return CMD.act(h.act);
    if (h.go?.ltab) V.ltab = h.go.ltab;
    if (h.go?.rtab) V.rtab = h.go.rtab;
    if (h.act) { V.ltab = A.ACT[h.act].tab; return flash(`act:${h.act}`); }
    flash(h.hl);
  },
  hintx(id) { const h = V.hints.find(x => x.id === id); if (!h) return; muteHint(S, h); G.saveGame(S); render(); },
  hintall() { V.hintsAll = !V.hintsAll; render(); },
  // 楼层面板：点哪层去哪层
  floor(x) {
    const p = plan();
    if (V.dlg || V.wait || !p) return;
    const n = x === 'all' ? -1 : G.clamp(+x | 0, 0, p.length - 1);
    if (n === V.floor && !office?.lift?.().moving) return;
    goto(n);
  },
  ltab(t) { V.ltab = t; render(); },
  rtab(t) { V.rtab = t; render(); },
  toast() { V.toast = null; ui.querySelector('.toast')?.remove(); },
  menu() {
    V.reopen = CMD.menu;
    localDialog(ut('ui.menu.title'), ut('ui.menu.text'), ut('ui.menu.icon'), [
      { label: ut('ui.menu.resume'), fn() { render(); } },
      { label: ut('ui.menu.settings'), fn() { V.settings = true; render(); } },
      { label: muted ? ut('ui.menu.unmute') : ut('ui.menu.mute'), fn() { setMuted(!muted); render(); } },
      { label: ut('ui.menu.quit'), fn() { G.saveGame(S); V.screen = 'title'; render(); } },
    ]);
  },
  settings(a) { V.settings = a !== 'close'; render(); },
  gfx(q) { office?.setQuality?.(q, false); render(); },
  fpscap(v) { office?.setFpsCap?.(v === 'auto' ? null : +v); render(); },
  act(id) {
    if (V.dlg || V.wait) return;
    let r;
    const view = dialogView(S, state => { const action = A.perform(state, id); if (state === S) r = action; return action?.dialog; });
    if (r?.dialog) V.dialogView = view;
    if (!r) return;
    if (id === 'code') sfx('type');
    playFx();
    if (r.dialog) return openDialog(r.dialog);
    if (r.ok != null) sfx(r.ok ? 'good' : 'bad');
    toast(r); pump();
  },
  push(uid) { if (V.dlg || V.wait) return; const r = G.pushProject(S, uid); if (r) { toast(r); render(); } },
  hire(uid) { if (V.dlg || V.wait) return; const r = A.hire(S, uid); if (!r) return; sfx(r.err ? 'error' : 'hire'); toast(r.err ? { text: r.err } : r); render(); },
  fire(uid) {
    if (V.dlg || V.wait) return;
    const e = S.staff.find(x => x.uid === uid);
    V.reopen = () => CMD.fire(uid);
    if (e) localDialog(ut('ui.fire.title', { 名字: e.name }), ut('ui.fire.text', { 月数: P['fire.payMonths'], 金额: G.money(S, P['fire.payMonths'] * e.salary * G.mod(S, 'salaryMult')) }), ut('ui.fire.icon'), [{ label: ut('ui.fire.ok'), fn() { sfx('fire'); toast(A.fire(S, uid)); render(); } }, { label: ut('ui.fire.no'), fn() { render(); } }]);
  },
  gpu(k) { const q = G.quota(S), step = Math.max(P['ui.gpuStepMin'], Math.round(q * P['ui.gpuStep'])); A.setGpu(S, k === 'max' ? q : k === 'min' ? 0 : S.gpu + (k === '+' ? step : -step)); render(); },
  pol(k, v) { A.setPolicy(S, k, v); render(); },
  next() {
    if (V.dlg || V.wait || S.over) return;
    if (S.ap > 0 && S.t > 1) {                                               // 还有行动点：把参谋建议的事情直接摆成选项
      const sug = hintsNow().filter(h => h.act && !h.later && !A.actionState(S, A.ACT[h.act]).why).slice(0, P['ui.nextSug']);
      V.reopen = CMD.next;
      return localDialog(ut('ui.next.title'), ut('ui.next.text', { 行动点: S.ap }) + (sug.length ? ut('ui.next.sug') : ''), ut('ui.next.icon'), [
        ...sug.map(h => ({ label: ut('ui.next.go', { 行动: A.actName(S, A.ACT[h.act]) }), hint: h.title, fn() { CMD.act(h.act); } })),
        { label: ut('ui.next.ok'), fn: nextMonth }, { label: ut('ui.next.no'), fn() { render(); } },
      ]);
    }
    nextMonth();
  },
  dlg(i) {
    const d = V.dlg;
    if (!d || V.res) return;
    if (i === 'close') { if (d.closable) { V.dlg = null; render(); } return; }
    if (d.local) { V.dlg = null; return d.options[+i]?.fn(); }
    const r = G.choose(S, d, +i);
    if (!r) return;
    V.dialogView?.selected(+i, r);
    playFx();
    if (r.dialog) return openDialog(r.dialog);
    if (!r.text && !r.chips.length) return pump();
    if (r.ok != null) { sfx('stamp'); sfx(r.ok ? 'good' : 'bad'); }
    V.res = r; render();
  },
  res() { if (V.res) pump(); },
};

export function boot(root, scene) {
  ui = root; office = scene;
  // 手机竖屏放不下这套界面：盖一层「请横过来」（只在竖屏窄屏时由 CSS 显示）
  crisisEl = document.querySelector('.crisis-edge') || document.body.appendChild(Object.assign(document.createElement('div'), { className: 'crisis-edge' }));
  onLanguage(() => {
    document.documentElement.lang = getLang() === 'en' ? 'en' : 'zh-CN';
    document.body.classList.toggle('lang-en', getLang() === 'en');
    document.title = tr('炼丹大亨 · AI 创业肉鸽模拟器');
    document.querySelector('.rotate-hint')?.remove();
    document.body.insertAdjacentHTML('beforeend', `<div class="rotate-hint"><b>↻</b><span>${uh('ui.rotate.h')}</span><small>${uh('ui.rotate.tip')}</small></div>`);
  });
  const fit = () => { document.documentElement.style.setProperty('--z', G.clamp(Math.min(innerWidth / 1280, innerHeight / 720), 0.5, 1.3).toFixed(3)); syncScene(); };
  addEventListener('resize', fit);
  ui.addEventListener('click', e => {
    const el = e.target.closest('[data-a]');
    if (!el || el.disabled) return;
    const [cmd, ...args] = el.dataset.a.split(':');
    if (V.pop && cmd !== 'who') V.pop = null;
    lastEl = el; const snd = CLICK_SND[cmd]; if (snd !== null) sfx(snd || 'click'); CMD[cmd]?.(...args);
  });
  // 点别处时收起员工气泡（只摘掉元素，不重绘，免得吃掉这次点击）
  document.addEventListener('pointerdown', e => { if (V.pop && !e.target.closest?.('.pop, .cand')) { V.pop = null; ui.querySelector('.pop')?.remove(); } });
  ui.addEventListener('input', e => {
    if (e.target.dataset?.s) return setting(e.target.dataset.s, e.target);
    const f = e.target.dataset?.f;
    if (!f || !V.W) return;
    V.W[f] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (f in nameBits) V.W.autoNames &= ~nameBits[f];
    if (f === 'coName') { const live = ui.querySelector('[data-live="co"]'); if (live) live.textContent = e.target.value; syncScene(); }
  });
  addEventListener('keydown', e => {
    if (V.settings) { if (e.key === 'Escape') CMD.settings('close'); return; }
    if (e.target.tagName === 'INPUT' || V.screen !== 'play') return;
    if (V.dlg) { if (V.res && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); CMD.res(); } else if (!V.res && /^[1-4]$/.test(e.key)) CMD.dlg(String(+e.key - 1)); else if (e.key === 'Escape') CMD.dlg('close'); }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); CMD.next(); }
    else if (plan() && ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home'].includes(e.key)) {     // ↑↓ 换楼层，Home 看全楼
      e.preventDefault();
      const p = plan(), cur = floorNow() < 0 ? p.length : V.floor, n = e.key === 'Home' ? p.length : G.clamp(cur + (e.key === 'ArrowUp' || e.key === 'PageUp' ? 1 : -1), 0, p.length);
      if (n !== cur) goto(n >= p.length ? -1 : n);
    }
  });
  // 声音要等玩家第一次点击或按键才能开（浏览器的规定）
  const unlock = () => audio.unlock();
  addEventListener('pointerdown', unlock, true); addEventListener('keydown', unlock, true);
  let hoverEl = null;
  ui.addEventListener('pointerover', e => { const el = e.target.closest?.('.opt, .act, .tab, .pcard'); if (el !== hoverEl) { hoverEl = el; if (el && !el.disabled) sfx('hover'); } });
  try { V.fps = localStorage.getItem('ldt_fps') === '1'; V.hintsOff = localStorage.getItem('ldt_hints') === '0'; V.themeFxOff = localStorage.getItem('ldt_themefx') === '0'; } catch { /* 读不到就用默认 */ }
  setInterval(() => {
    audio.setScene(sceneAudio());
    const f = ui.querySelector('.fps'); if (f) f.textContent = fpsText();
    const p = ui.querySelector('[data-live="perf"]'); if (p) p.textContent = perfText();
  }, 500);
  if (import.meta.env?.DEV) window.__game = { get S() { return S; }, G, A, pump, render, office, audio };   // 仅开发模式：调试用
  fit(); render();
}

// CEO 行动：每个行动花行动点（和钱），要么直接生效，要么弹出子选项。
import * as G from './engine.js';
import { DATA_SOURCES, FEATURES, FEAT, OFFICES, MAX_OFFICE, officeName, floorsOf, STAGES, INVESTORS, INVESTORS_EAST, EAST_RIVALS, ROLES, DIRT, AGI_CAP } from '../data/defs.js';
import * as IDEO from './ideology.js';

const { rnd, rf, pick, money, fmtUsers, mod, power, unit, applyFx, addDirt, news, optCheck, clamp, pCheck, rollCheck } = G;
const pct = (S, attr, dc) => Math.round(pCheck(S, attr, dc) * 100);

export const TABS = [
  { id: 'rd', name: '研发', icon: '⚗️' }, { id: 'team', name: '团队', icon: '👥' }, { id: 'cap', name: '资本', icon: '💰' },
  { id: 'pr', name: '公关', icon: '📣' }, { id: 'ops', name: '经营', icon: '🧭' }, { id: 'ideo', name: '意识形态', icon: '☭' },
];

const FURNACE_TEXT = {
  open: '你们换回了开源数据集。干净、合规，也和全世界用的一模一样。',
  buy: '法务签了一摞数据授权合同。每一份都很贵，每一份都能让人睡得着觉。',
  scrape: '爬虫在凌晨三点出发，把半个互联网搬进了机房。没人问过那些网站愿不愿意。',
  distill: '你们注册了两百个账号，日夜不停地向对手的模型「请教」。学费很便宜，就是不能让老师知道。',
};
const courseIncome = S => (12 + S.users * 0.06 + S.hype) * (1 + 0.05 * (S.founder.attrs.biz - 5));
const codeGain = S => (1.5 + S.founder.attrs.tech * 0.35) * Math.max(0.15, 1 - S.quality / G.qCeil(S));     // 越接近模型天花板越难再提升
const adsGain = S => Math.max(2, S.users * 0.1) * mod(S, 'growthMult') ** 0.5 * (0.7 + S.quality / 150);

// ── 发布模型：先定跑分怎么报，再定怎么发 ──
function launch(S, cap, infl, dirt, vol, costK, hungry) {
  S.cash -= costK * unit(S);
  const ver = (S.model?.ver || 0) + 1, bonus = mod(S, 'benchAdd');
  S.model = { cap, bench: cap + infl + bonus, ver, name: `${S.co.modelName}-${ver}`, infl };
  if (dirt) addDirt(S, dirt);
  S.lastReleaseT = S.t;
  const rk = G.rank(S);
  applyFx(S, { hype: [30, 20, 13, 9, 6, 4, 3][rk - 1] * vol, usersPct: (8 - rk) * 1.5 * vol, rep: (infl === 0 && rk <= 3 ? 4 : 0) + (hungry ? -3 : 0) });
  S.fxq.push(['release']);                                              // 丹炉开盖、金光出炉（经典版场景没有这个特效，会直接忽略）
  if (rk <= 2) S.fxq.push(['confetti']);
  news(S, `🚀 ${S.co.name} 发布 ${S.model.name}，跑分 ${S.model.bench.toFixed(1)}，榜单第 ${rk}。`);
  if (cap >= AGI_CAP) S.q.push({ type: 'event', id: 'agi' });
  const tail = infl > 8 ? '只有你和研究员知道，那个分数是怎么来的。' : infl > 0 ? '榜单很好看，实测嘛……别问。' : '这是一个经得起实测的分数。';
  return { text: (rk === 1 ? `${S.model.name} 登顶榜单！全网刷屏，对手连夜开会。` : rk <= 3 ? `${S.model.name} 杀进前三，科技媒体的标题里第一次出现了你的名字。` : `${S.model.name} 发布了，榜单第 ${rk}。评论区最高赞是：「又一个。」`) + tail };
}
function releaseDialog(S) {
  const cap = G.myCap(S) + rf(S, -1, 1.2) + (S.founder.attrs.luck - 5) * 0.15, top = Math.max(...S.rivals.map(r => r.bench)), bonus = mod(S, 'benchAdd');
  const step2 = (infl, dirt) => ({
    dialog: {
      kind: 'event', cat: 'tech', icon: '🎤', art: 'launch', title: '怎么发布？',
      text: `对外跑分将是 ${(cap + infl + bonus).toFixed(1)}（榜首现在 ${top.toFixed(1)}）。发布方式决定声量。`,
      options: [
        { label: '低调上线', hint: '不花钱，声量打六折', go: () => launch(S, cap, infl, dirt, 0.6, 0) },
        { label: '开发布会', hint: `花 ${money(S, 0.5 * unit(S))}，声量 ×1.3`, disabled: S.cash < 0.5 * unit(S), why: '钱不够', go: () => launch(S, cap, infl, dirt, 1.3, 0.5) },
        { label: '邀请码饥饿营销', hint: '声量 ×1.7，口碑 -3', go: () => launch(S, cap, infl, dirt, 1.7, 0, true) },
      ],
    },
  });
  return {
    dialog: {
      kind: 'event', cat: 'tech', icon: '⚗️', art: 'leaderboard', title: '丹成：跑分怎么报？',
      text: `内部评测显示，新模型的真实能力约 ${cap.toFixed(1)}（现役 ${S.model ? S.model.cap.toFixed(1) : '无'}，榜首跑分 ${top.toFixed(1)}）。\n\n市场部探头进来：「榜单成绩……要不要『优化』一下？」`,
      options: [
        { label: '老实报', hint: '跑分 = 真实能力', go: () => step2(0, null) },
        { label: '针对榜单调一调', hint: '☠ 跑分 +5 左右；留下黑料「刷榜过拟合」', go: () => step2(rf(S, 4, 6), 'bench_overfit') },
        { label: '把测试题塞进训练集', hint: '☠ 跑分 +13 左右；留下黑料「跑分造假」', go: () => step2(rf(S, 11, 15), 'bench_fake') },
      ],
    },
  };
}

// ── 融资：三份 term sheet ──
function closeRound(S, val, p, who) {
  const cash = val * p;
  (S.stats.rounds ??= []).push(S.t);
  S.cash += cash; S.equity *= 1 - p; S.stage++; S.lastRaiseT = S.t; S.raiseBoost = 0; S.stats.raised += cash;
  applyFx(S, { hype: 6, morale: 6, bubble: 1 });
  S.q.push({ type: 'draft' }); S.fxq.push(['money']);
  news(S, `💰 ${S.co.name} 完成${STAGES[S.stage].name}：${who}领投，融资 ${money(S, cash)}，投后估值 ${money(S, val)}。`);
  return `${STAGES[S.stage].name}到账 ${money(S, cash)}。你发了一条朋友圈：「感谢信任，继续赶路。」配图是凌晨四点的办公室。`;
}
function raiseDialog(S) {
  const k = S.stage + 1, val0 = G.valuation(S), pf = G.perf(S), winter = S.burstT && S.t - S.burstT < 14, red = !!S.flags.red;
  if (pf < 0.75 || (winter && rnd(S) < 0.45)) {
    S.lastRaiseT = S.t - 3;
    return { ok: false, text: winter ? '你见了二十家机构。每一家都说「我们长期看好 AI」，然后没有一家回消息。寒冬里没人掏钱。' : '你见了二十家机构，收获了二十句「数据再跑一跑，我们保持联系」。指标还撑不起这一轮。' };
  }
  const vcs = red ? INVESTORS_EAST : INVESTORS;                         // 红色公司：美元基金不再和你谈，只剩人民币基金和国家队
  const now = S.users + S.fake, target = Math.max(now * 2.5, STAGES[Math.min(6, k + 1)].users * 0.35), rv = pick(S, red ? S.rivals.filter(r => EAST_RIVALS.includes(r.id)) : S.rivals.slice(0, 3));
  const mk = (name, vk, p, note, extra, after) => ({ label: name, hint: `估值 ${money(S, val0 * vk)} · 出让 ${Math.round(p * 100)}% · 到账 ${money(S, val0 * vk * p)}${note ? ' · ' + note : ''}`, go: () => { extra?.(); const text = closeRound(S, val0 * vk, p, name.split('：')[0]); after?.(); return { text }; } });
  // 深圳的国资：选了它就开启「路线之争」事件链（还没开过的话，每轮正经融资它都会在桌上）
  const state = () => mk('深创头：国资入股', 0.95, 0.14, `监管压力 -15，两年内收入 +10%${S.ideo ? '' : '；国资会派驻一名董事'}`, () => applyFx(S, { reg: -15, temp: { key: 'revMult', mult: 1.1, months: 24 } }), () => IDEO.startIdeo(S, G));
  const pool = [
    () => mk(`${pick(S, vcs)}：高估值 + 对赌`, 1.3, 0.15, `一年内用户须达 ${fmtUsers(target)}，否则赔股权`, () => { S.vam = { due: S.t + 12, target }; }),
    () => (red ? mk('昇天算力：以卡换股', 1.0, 0.12, '显卡配额 +40%（国产卡）', () => applyFx(S, { quota: 40 })) : mk('英伟大战投：以卡换股', 1.0, 0.12, '显卡配额 +40%', () => applyFx(S, { quota: 40 }))),
    () => mk('土豪主权基金：大钱大稀释', 1.15, 0.22, '钱多事少'),
    ...(S.co.region === 'sz' ? (S.ideo ? [state] : []) : [() => mk('硬银：孙正意的直觉', 1.5, 0.25, '「想得再疯狂一点」热度 +10', () => applyFx(S, { hype: 10, bubble: 2 }))]),
    () => mk(`${rv.name}：战略投资`, 1.05, 0.14, '三年内上游与推理成本 -30%', () => { applyFx(S, { temp: [{ key: 'apiCostMult', mult: 0.7, months: 36 }], rival: { rel: 30 } }, { rival: rv.id }); }),
  ];
  if (pf < 0.9) return { dialog: { kind: 'event', cat: 'money', icon: '🩸', art: 'pitch', title: `${STAGES[k].name} · 只有一份 Term Sheet`, text: `业绩离这一轮的达标线还差一截（业绩系数 ${pf.toFixed(2)}，1.0 为达标）。聊了一圈，只有一家愿意给钱，条件很不客气。要么签，要么回去把数据做上来再说。`, options: [mk(`${pick(S, vcs)}：流血融资`, 0.55, 0.25, '趁你病，要你命')] } };
  const offers = [mk(`${pick(S, vcs)}：干净的钱`, 0.85, 0.15, '没有附加条款')];
  if (S.co.region === 'sz' && !S.ideo) offers.push(state());
  while (offers.length < 3 && pool.length) offers.push(pool.splice(Math.floor(rnd(S) * pool.length), 1)[0]());
  return { dialog: { kind: 'event', cat: 'money', icon: '💰', art: 'pitch', title: `${STAGES[k].name} · 三份 Term Sheet`, text: `路演了一圈，三份投资意向书摆在桌上。当前估值基准 ${money(S, val0)}（业绩系数 ${pf.toFixed(2)}，1.0 为达标）。签哪一份？`, options: offers } };
}

function ipo(S) {
  const L = power(S, 'legal'), found = S.dirt.filter(d => rnd(S) < Math.min(0.9, d.sev * 0.035 / (1 + L / 15))), crime = found.filter(d => DIRT[d.type]?.crime);
  if (crime.length) {
    for (const d of crime.slice(0, 2)) S.q.push({ type: 'scandal', uid: d.uid });
    applyFx(S, { rep: -8, hype: -10, morale: -8 });
    return { ok: false, text: `审计师在保险柜里翻出了「${crime.map(d => d.name).join('」「')}」。上市申请被否，材料还被移交给了有关部门。` };
  }
  G.endGame(S, 'ipo');
  return { ok: true, text: found.length ? `审计师翻出了「${found[0].name}」，皱了皱眉，最后在「风险提示」里加了一段话。过会了。` : '审计师把公司翻了个底朝天，什么都没找到。过会了。' };
}
function washDialog(S) {
  const list = S.dirt.slice().sort((a, b) => b.sev - a.sev).slice(0, 4);
  return {
    dialog: {
      kind: 'event', cat: 'dirt', icon: '🧼', art: 'vault', title: '洗哪一张？', text: '「专业人士」开价不低，而且不保证成功。洗不干净的话，痕迹只会更重。',
      options: list.map(d => {
        const fee = unit(S) * d.sev / 10;
        const o = optCheck(S, d.name, `严重度 ${Math.round(d.sev)} · 花 ${money(S, fee)}`, 'net', 10 + d.sev / 3,
          () => { G.removeDirt(S, d.uid); return `「${d.name}」的所有痕迹都消失了：聊天记录、转账凭证，连当事人的记忆好像都模糊了。`; },
          () => { d.sev += 4; return `钱花了，事没办成。中间人还多知道了一个秘密——「${d.name}」变得更危险了。`; },
          () => { S.cash -= fee; });
        if (S.cash < fee) { o.disabled = true; o.why = '钱不够'; }
        return o;
      }),
    },
  };
}
function digDialog(S) {
  const list = S.rivals.slice().sort((a, b) => b.bench - a.bench).slice(0, 4);
  return {
    dialog: {
      kind: 'event', cat: 'rival', icon: '🕵️', art: 'mystery', title: '查谁？', text: '你认识一个「做行业调研」的朋友。他说每家公司的保险柜里都有东西，区别只是锁的好坏。',
      options: list.map(r => optCheck(S, r.name, `${r.boss} · 跑分 ${r.bench.toFixed(1)}`, 'net', r.cheat >= 2 ? 13 : 17,
        () => { r.bench -= 5; applyFx(S, { hype: 5, rival: { hype: -18, rel: -30 } }, { rival: r.id }); return `你把 ${r.name} 的料匿名递给了记者。三天后热搜第一：「${r.model} 跑分注水实锤」。${r.boss} 发了一条只有三个字的帖子：「等着瞧。」`; },
        () => { applyFx(S, { rep: -3, rival: { rel: -20 } }, { rival: r.id }); return `「调研」的朋友被 ${r.name} 的法务逮了个正着，还把你供了出来。${r.boss} 公开 @ 了你。`; })),
    },
  };
}

export const ACTIONS = [
  // ── 研发 ──
  {
    id: 'code', tab: 'rd', name: '亲自写代码', icon: '⌨️', ap: 1,
    desc: S => `产品体验 +${codeGain(S).toFixed(1)}（天花板 ${G.qCeil(S).toFixed(0)}，看模型能力）${S.ownModel ? '，丹炉多烧小半个月' : ''}`,
    run: S => {
      S.quality = clamp(S.quality + codeGain(S), 0, 100);
      if (S.ownModel && S.furnace?.on) S.E += Math.max(6, Math.max(0, S.gpu - G.inferNeed(S)) * G.researchEff(S) * DATA_SOURCES[S.furnace.data].mult * 0.35);
      return pick(S, ['你戴上降噪耳机写了一整夜。第二天大家发现，你顺手把所有人的缩进都改了。', '你亲手修了一个陈年 bug，并在提交信息里写了三百字的感想。', '老板亲自下场写代码，全组压力山大——主要是没人敢 review。']);
    },
  },
  {
    id: 'release', tab: 'rd', name: '出炉发布', icon: '🚀', ap: 1, cd: 2, show: S => S.ownModel,
    desc: S => `把丹炉里的新模型发布出去（火候 ${G.myCap(S).toFixed(1)}，现役 ${S.model ? S.model.cap.toFixed(1) : '无'}）`,
    block: S => (G.myCap(S) - (S.model?.cap ?? 0) < 1.5 ? '火候不够：至少要比现役模型强 1.5' : null),
    run: S => releaseDialog(S),
  },
  {
    id: 'furnace', tab: 'rd', name: '丹炉换料', icon: '🔥', ap: 1, show: S => S.ownModel,
    desc: S => `换一种训练数据。现在烧的是「${DATA_SOURCES[S.furnace?.data || 'open'].name}」`,
    run: S => ({
      dialog: {
        kind: 'event', cat: 'tech', icon: '🔥', art: 'furnace', title: '给丹炉换什么料？', text: '训练数据决定了火候涨得多快。路子越野越快，也越容易留下把柄。',
        options: Object.entries(DATA_SOURCES).map(([k, d]) => ({
          label: (d.dirt ? '☠ ' : '') + d.name, hint: d.desc, disabled: S.furnace?.data === k, why: '正在用',
          go: () => { S.furnace = { on: true, data: k, months: 0 }; if (d.dirt) addDirt(S, d.dirt); return { text: FURNACE_TEXT[k] }; },
        })),
      },
    }),
  },
  {
    id: 'selfdev', tab: 'rd', name: '自研模型立项', icon: '🧬', ap: 2, show: S => !S.ownModel, cost: S => Math.max(150, 3 * unit(S)),
    desc: () => '组建炼丹团队，摆脱上游。之后要自己租显卡、招研究员',
    block: S => (S.stage < 2 ? '融到 A 轮再说' : null),
    run: S => { S.ownModel = true; S.E = 0; S.furnace = { on: true, data: 'open', months: 0 }; news(S, '🧬 自研模型立项，丹炉点火。'); return '你在全员会上宣布：「我们要有自己的模型。」研究员鼓掌，财务捂住了胸口。记得去「经营」里租显卡。'; },
  },
  {
    id: 'sprint', tab: 'rd', name: '功能冲刺', icon: '🧩', ap: 1,
    desc: S => (S.sprint ? `正在开发「${FEAT[S.sprint.id].name}」（${Math.round(S.sprint.done / S.sprint.need * 100)}%）` : '三选一，开发一个新功能'),
    block: S => (S.sprint ? '已经有功能在开发了' : FEATURES.every(f => S.feats.includes(f.id)) ? '功能都做完了' : null),
    run: S => {
      const pool = FEATURES.filter(f => !S.feats.includes(f.id)), picks = [];
      while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(rnd(S) * pool.length), 1)[0]);
      const k = 1 + 0.35 * S.feats.length, E = Math.max(1, power(S, 'eng') * mod(S, 'devMult'));
      return {
        dialog: {
          kind: 'cards', cat: 'tech', icon: '🧩', title: '功能冲刺 · 三选一', text: '产品经理拿来三份需求文档，每一份都标着「P0」。',
          options: picks.map(f => ({ label: f.name, card: { icon: f.icon, name: f.name, desc: `${f.desc}\n预计 ${Math.max(1, Math.ceil(f.need * k / E))} 个月`, r: 1 }, go: () => { S.sprint = { id: f.id, need: f.need * k, done: 0 }; return { text: `「${f.name}」立项。工程师们在白板上画了一张谁也看不懂的架构图。` }; } })),
        },
      };
    },
  },
  {
    id: 'paper', tab: 'rd', name: '发论文 / 开源', icon: '📄', ap: 1, cd: 4, show: S => S.ownModel,
    desc: () => '口碑 +5，热度 +4，半年内更好招人；对手也会学到东西',
    run: S => { applyFx(S, { rep: 5, hype: 4, temp: { key: 'hireSkill', add: 1, months: 6 } }); for (const r of S.rivals) r.drift += 0.3; return '论文挂上了 arXiv，三天内被引用四十次，其中三十九次是对手拿去当对比实验的基线。'; },
  },
  // ── 团队 ──
  { id: 'headhunt', tab: 'team', name: '找猎头', icon: '🎣', ap: 1, cost: S => Math.max(8, 0.3 * unit(S)), desc: () => '立刻换一批更强的候选人', run: S => { G.refreshCands(S, 2.5); return '猎头发来四份简历，每一份的自我评价都是「具有创始人心态」。'; } },
  { id: 'teambuild', tab: 'team', name: '团建', icon: '🍻', ap: 1, cd: 2, cost: S => Math.max(2, 0.15 * unit(S)), desc: S => `士气 +${12 + Math.round(S.founder.attrs.mgmt / 2)}`, run: S => { applyFx(S, { morale: 12 + Math.round(S.founder.attrs.mgmt / 2) }); return S.co.region === 'sz' ? '海底捞、KTV、凌晨的潮汕牛肉火锅。第二天全员迟到，但没有人不开心。' : '徒步、烧烤、精酿啤酒。有人喝多了，抱着你说这是他待过最好的公司——他上周刚入职。'; } },
  {
    id: 'pie', tab: 'team', name: '画饼大会', icon: '🥧', ap: 1, cd: 3, desc: S => `口才检定 ${pct(S, 'cha', 14)}%：成了士气 +16，砸了 -6`,
    run: S => { const ok = rollCheck(S, 'cha', 14); applyFx(S, { morale: ok ? 16 : -6 }); return { ok, text: ok ? '你讲了使命、愿景和财富自由。散会时有人眼里有光，有人打开计算器算期权。' : '饼画得太大，把大家噎着了。会后茶水间的共识是：「先把上个月的报销批了。」' }; },
  },
  {
    id: 'office', tab: 'team', name: '升级办公室', icon: '🏢', ap: 1, cost: S => (S.co.office < MAX_OFFICE ? OFFICES[S.co.office + 1].up * mod(S, 'rentMult') : 0),
    desc: S => {
      if (S.co.office >= MAX_OFFICE) return '已经是总部大楼了';
      const nx = S.co.office + 1, fl = floorsOf(nx);
      return `搬进「${officeName(S, nx)}」${fl ? `（${fl.length} 层，${nx === MAX_OFFICE ? '一层一个部门' : '部门分楼层'}）` : ''}：能坐 ${OFFICES[nx].cap} 人，月租 ${money(S, OFFICES[nx].rent * mod(S, 'rentMult'))}`;
    },
    block: S => (S.co.office >= MAX_OFFICE ? '已经到顶了' : null),
    run: S => {
      S.co.office++; applyFx(S, { morale: 8, rep: 3, hype: 3 }); S.fxq.push(['levelup']); news(S, `🏢 ${S.co.name} 搬进了${officeName(S)}。`);
      const fl = floorsOf(S.co.office);
      return fl ? `搬家那天，电梯从早到晚没停过。${S.co.office === MAX_OFFICE ? '每个部门终于有了自己的楼层，' : '各部门按楼层分好了地盘，'}行政第一件事，是在每层电梯口都贴上公司 logo。` : `搬家那天，大家抱着显示器走进了${officeName(S)}。行政第一件事，是把公司 logo 贴满了每一面墙。`;
    },
  },
  // ── 资本 ──
  {
    id: 'raise', tab: 'cap', name: '启动融资', icon: '💰', ap: 2,
    desc: S => (S.stage >= 5 ? '已经融到 D 轮，下一步是上市' : `启动${STAGES[S.stage + 1].name}。当前估值约 ${money(S, G.valuation(S))}`),
    block: S => (S.stage >= 5 ? '该去敲钟了' : S.t - S.lastRaiseT < 6 ? `刚融完，投资人让你先干活（还要 ${6 - (S.t - S.lastRaiseT)} 个月）` : null),
    run: S => raiseDialog(S),
  },
  {
    id: 'roadshow', tab: 'cap', name: '路演预热', icon: '🎤', ap: 1, desc: S => `口才检定 ${pct(S, 'cha', 13)}%：下一轮估值 +5%（已累计 +${Math.round(S.raiseBoost * 100)}%）`,
    block: S => (S.stage >= 5 ? '已经没有下一轮了' : S.raiseBoost >= 0.15 ? '饼已经画到头了' : null),
    run: S => { const ok = rollCheck(S, 'cha', 13); S.raiseBoost += ok ? 0.05 : 0.01; return { ok, text: ok ? '你在台上只讲了一句「我们不是在做产品，是在定义下一个时代」，台下响起了手机拍照的声音。' : 'PPT 翻到第三页投影仪坏了。你硬讲了二十分钟，投资人礼貌地要了一份「材料」。' }; },
  },
  {
    id: 'ipo', tab: 'cap', name: '申请上市', icon: '🔔', ap: 2, cd: 8, show: S => S.stage >= 4,
    desc: S => `需要完成 D 轮、连续盈利 3 个月（现在 ${S.streak.profit} 个月）、业绩系数 ≥ 1.0（现在 ${G.perf(S).toFixed(2)}）。审计师会把保险柜翻个底朝天`,
    block: S => (S.stage < 5 ? '先完成 D 轮' : S.streak.profit < 3 ? '还没连续盈利 3 个月' : G.perf(S) < 1 ? `业绩系数 ${G.perf(S).toFixed(2)}，没到上市门槛 1.0` : null),
    run: S => ipo(S),
  },
  { id: 'sellcourse', tab: 'cap', name: '卖课', icon: '🎓', ap: 1, cd: 5, desc: S => `《AI 时代财富自由课》：进账约 ${money(S, courseIncome(S))}，口碑 -5`, run: S => { S.cash += courseIncome(S); applyFx(S, { rep: -5 }); return '199 元的课卖爆了。第一课的内容是「如何注册账号」，最后一课是「如何把这门课卖给别人」。'; } },
  {
    id: 'subsidy', tab: 'cap', name: '跑补贴', icon: '🏛️', ap: 1, cd: 6, show: S => S.co.region === 'sz', desc: S => `人脉检定 ${pct(S, 'net', 13)}%：拿到约 ${money(S, Math.max(20, 1.5 * unit(S)))} 的政策补贴`,
    run: S => { const ok = rollCheck(S, 'net', 13); if (ok) S.cash += Math.max(20, 1.5 * unit(S)); return { ok, text: ok ? '申报材料写了八十页，盖了十一个章。钱到账那天，你给街道办送了一面锦旗。' : '材料被退回三次，理由分别是「格式不对」「章盖歪了」和「今年额度用完了」。' }; },
  },
  { id: 'lobby', tab: 'cap', name: '游说疏通', icon: '🤵', ap: 1, cd: 6, cost: S => 0.5 * unit(S), desc: S => `监管压力 -${Math.round(6 + S.founder.attrs.net * 0.8)}`, run: S => { applyFx(S, { reg: -(6 + S.founder.attrs.net * 0.8) }); return S.co.region === 'bay' ? '你雇的说客带议员打了一场高尔夫。议员没搞懂 AI 是什么，但搞懂了你是朋友。' : '你陪着跑了三个部门、喝了四场茶，带回来一句宝贵的口头指示：「再看看。」'; } },
  // ── 公关 ──
  { id: 'hype', tab: 'pr', name: '炒作造势', icon: '📢', ap: 1, desc: S => `热度 +${Math.round((6 + S.founder.attrs.cha * 0.6) * mod(S, 'hypeGainMult'))} 左右（热度越高越难再涨）`, run: S => { applyFx(S, { hype: 6 + S.founder.attrs.cha * 0.6, bubble: 0.5 }); return pick(S, ['你凌晨发了一条帖子：「有些事情正在发生。」没有配图，没有解释。三万转发。', '你接受了播客专访，两小时里说了十一次「范式转移」。剪辑师很头疼，标题党很开心。', '通稿标题：《他只用了三个月，就让硅谷睡不着觉》。你确实没让他们睡——是你自己没睡。']); } },
  { id: 'ads', tab: 'pr', name: '投放买量', icon: '🛒', ap: 1, cd: 2, cost: S => Math.max(5, 0.8 * unit(S)), desc: S => `立刻拉来约 ${fmtUsers(adsGain(S))} 用户`, run: S => { S.users += adsGain(S); return '信息流里铺满了你的广告，文案是「再不用就晚了」。用户确实来了，问的第一句话是「怎么取消自动续费」。'; } },
  { id: 'goodpr', tab: 'pr', name: '做公益发白皮书', icon: '🕊️', ap: 1, cd: 3, cost: S => 0.4 * unit(S), desc: () => '口碑 +7，监管压力 -3', run: S => { applyFx(S, { rep: 7, reg: -3 }); return '你发布了《负责任的 AI 白皮书》，一共 80 页，其中 60 页是图片。媒体评价：「态度很端正。」'; } },
  { id: 'navy', tab: 'pr', name: '买热搜雇水军', icon: '🌊', ap: 1, shady: true, cost: S => 0.3 * unit(S), desc: () => '热度 +18；留下黑料「水军黑公关」', run: S => { applyFx(S, { hype: 18, dirt: { type: 'astroturf', sev: 6 } }); return '一夜之间，三千个账号用同一句话夸了你，连标点都一样。热搜是上去了。'; } },
  { id: 'fakeusers', tab: 'pr', name: '刷量', icon: '🧟', ap: 1, shady: true, cost: S => 0.2 * unit(S), desc: S => `账面用户 +${fmtUsers(Math.max(3, S.users * 0.4))}（估值更好看）；留下黑料「刷量注水」`, run: S => { S.fake += Math.max(3, S.users * 0.4); addDirt(S, 'fake_users'); return '机房里多了两千台手机，屏幕整齐划一地亮着。日活曲线终于有了投资人喜欢的那种弧度。'; } },
  { id: 'wash', tab: 'pr', name: '洗白黑料', icon: '🧼', ap: 1, desc: () => '花钱找人，让保险柜里的一张黑料永远消失', block: S => (S.dirt.length ? null : '保险柜是空的'), run: S => washDialog(S) },
  { id: 'digdirt', tab: 'pr', name: '挖对手黑料', icon: '🕵️', ap: 1, shady: true, cd: 3, cost: S => 0.4 * unit(S), desc: () => '人脉检定：成了能让一家对手跑分 -5、热度大跌', run: S => digDialog(S) },
  // ── 经营 ──
  {
    id: 'beg', tab: 'ops', name: '找皮衣教主要配额', icon: '🧥', ap: 1, cd: 6, show: S => S.ownModel, desc: S => `人脉检定 ${pct(S, 'net', 15)}%：显卡配额 +30%`,
    run: S => { const ok = rollCheck(S, 'net', 15); if (ok) applyFx(S, { quota: 30 }); return { ok, text: ok ? '你在一场行业晚宴上堵到了皮衣教主。他看了看你的名片，又看了看你的眼神，说：「给他批。」' : '教主的助理礼貌地告诉你，你的订单已经排上了——在 2031 年第三季度。' }; },
  },
  { id: 'sweep', tab: 'ops', name: '高价扫货', icon: '📦', ap: 1, show: S => S.ownModel, cost: S => G.quota(S) * G.gpuPrice(S) * 3, desc: () => '从黄牛手里收现货：显卡配额 +25%', run: S => { applyFx(S, { quota: 25 }); return '黄牛开着一辆面包车来了，后备箱里全是显卡，还送了你两箱矿泉水。'; } },
  // ── 意识形态：开局什么都没有；国资入股后走完「路线之争」才会解锁 ──
  // 红色路线
  {
    id: 'mobilize', tab: 'ideo', name: '公开动员', icon: '📢', ap: 1, cd: 3, show: IDEO.isRed, desc: () => '热度 +8，泡沫 +3，士气 +10',
    run: S => { S.hype = clamp(S.hype + 8, 0, 100); S.bubble = clamp(S.bubble + 3, 0, 100); S.morale = clamp(S.morale + 10, 0, 100); return IDEO.actText(S, 'mobilize', G); },
  },
  {
    id: 'utopia', tab: 'ideo', name: '乌托邦社区实验', icon: '🌾', ap: 1, cost: () => 20000, show: S => IDEO.isRed(S) && !S.flags.utopia_on,
    desc: () => '花 2 亿在城郊建一座让 AI 做计划的公社。一次性事件链，成了有长期加成',
    run: S => { S.flags.utopia_on = 1; G.queueEvent(S, 'utopia_1'); news(S, `🌾 ${S.co.name} 在城郊买下一片地，「乌托邦社区实验」破土动工。`); return IDEO.actText(S, 'utopia', G); },
  },
  {
    id: 'selfcrit', tab: 'ideo', name: '自我批评会', icon: '🪞', ap: 1, cd: 6, show: IDEO.isRed, block: S => (S.dirt.length ? null : '保险柜是空的，没什么可检讨的'),
    desc: S => { const d = worstDirt(S); return d ? `当众检讨「${d.name}」，这张黑料就此翻篇；士气 -${Math.round(4 + d.sev / 3)}，口碑 +2，监管压力 -3` : '当众检讨一张黑料，让它就此翻篇'; },
    run: S => { const d = worstDirt(S); G.removeDirt(S, d.uid); applyFx(S, { morale: -(4 + d.sev / 3), rep: 2, reg: -3 }); return `「${d.name}」翻篇了。${IDEO.actText(S, 'selfcrit', G)}`; },
  },
  {
    id: 'subbotnik', tab: 'ideo', name: '星期六义务劳动', icon: '🧹', ap: 1, cd: 4, show: IDEO.isRed,
    desc: S => (S.sprint ? `「${FEAT[S.sprint.id].name}」开发进度 +35%（不发加班费）；士气 -4` : '产品体验 +5（不发加班费）；士气 -4'),
    run: S => { if (S.sprint) S.sprint.done = Math.min(S.sprint.need, S.sprint.done + S.sprint.need * 0.35); else S.quality = clamp(S.quality + 5, 0, 100); applyFx(S, { morale: -4 }); return IDEO.actText(S, 'subbotnik', G); },
  },
  {
    id: 'plan', tab: 'ideo', name: '五年计划', icon: '📜', ap: 2, show: IDEO.isRed, block: S => (S.ideo?.plan ? `上一个计划${G.dateStr(S.ideo.plan.due)}才到期` : null),
    desc: () => '定一个 12 个月的目标，相关产出 +12~20%；到期没完成，要么认账，要么改报表', run: S => IDEO.planDialog(S, G),
  },
  // 资本路线
  {
    id: 'yank', tab: 'ideo', name: '末位淘汰', icon: '📉', ap: 1, show: S => IDEO.isCap(S) && !S.flags.yank,
    desc: () => '一次性决定：从这个月起，每个部门（2 人以上）每月淘汰能力最低的一人，HR 自动补一个新人。不影响士气', run: S => IDEO.yankDialog(S, G),
  },
  {
    id: 'bci', tab: 'ideo', name: '脑机实验', icon: '🧠', ap: 1, cost: S => Math.max(40, 2 * unit(S)), show: S => IDEO.isCap(S) && !S.flags.bci_on,
    desc: S => `在地下二层成立「秘密实验部」，留下一张黑料；事件链走完，员工睡觉时也能给${S.ownModel ? '丹炉提供算力' : '产品跑推理（API 成本 -35%）'}`,
    run: S => { S.flags.bci_on = 1; addDirt(S, 'bci_lab'); G.queueEvent(S, 'bci_1'); news(S, '🧠 平面图上没有的地下二层，亮起了灯。'); return IDEO.actText(S, 'bci', G); },
  },
  {
    id: 'buyback', tab: 'ideo', name: '股票回购', icon: '🔁', ap: 1, cd: 6, show: IDEO.isCap, cost: S => G.valuation(S) * 0.03, block: S => (S.equity >= 90 ? '股权已经够多了' : null),
    desc: () => '按估值买回 3% 股权，董事会里你的票更稳', run: S => { applyFx(S, { equity: 3 }); return IDEO.actText(S, 'buyback', G); },
  },
  {
    id: 'costcut', tab: 'ideo', name: '降本增效', icon: '✂️', ap: 1, cd: 8, show: IDEO.isCap, desc: () => '半年内总成本 -12%；士气 -6',
    run: S => { applyFx(S, { temp: { key: 'costMult', mult: 0.88, months: 6 }, morale: -6 }); return IDEO.actText(S, 'costcut', G); },
  },
  {
    id: 'spinoff', tab: 'ideo', name: '分拆上市', icon: '🪓', ap: 2, show: S => IDEO.isCap(S) && !S.flags.spinoff, block: S => (S.stage < 3 ? '至少融到 B 轮再说' : null),
    desc: S => `把一块业务拆出去单独上市（一次性）：到账约 ${money(S, G.valuation(S) * 0.06)}，热度 +6、泡沫 +4、监管压力 +4`,
    run: S => { S.flags.spinoff = 1; S.cash += G.valuation(S) * 0.06; applyFx(S, { hype: 6, bubble: 4, reg: 4 }); S.fxq.push(['money']); return IDEO.actText(S, 'spinoff', G); },
  },
];
const worstDirt = S => S.dirt.slice().sort((a, b) => b.sev - a.sev)[0];
export const ACT = Object.fromEntries(ACTIONS.map(a => [a.id, a]));

// 某个行动现在能不能点、要花多少钱
export function actionState(S, a) {
  const cost = a.cost ? a.cost(S) : 0;
  const why = S.ap < a.ap ? '行动点不够' : S.cd[a.id] ? `冷却中（还要 ${S.cd[a.id] - S.t} 个月）` : cost > S.cash ? '钱不够' : a.block?.(S) || null;
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
  if (S.ap < 1) return { err: '行动点不够' };
  if (S.staff.length >= G.teamCap(S)) return { err: '工位满了，先去升级办公室' };
  if (S.cash < fee) return { err: '签字费都付不起' };
  return G.measure(S, () => { S.ap--; S.cash -= fee; S.cands.splice(i, 1); c.since = S.t; G.addStaff(S, c); return { text: `${c.name} 入职了（${ROLES[c.role].name}，能力 ${c.skill}）。` }; });
}
export function fire(S, uid) {
  const e = S.staff.find(x => x.uid === uid);
  if (!e) return null;
  IDEO.noteFire(S);
  return G.measure(S, () => { S.cash -= 2 * e.salary * mod(S, 'salaryMult'); G.removeStaff(S, uid); applyFx(S, { morale: e.skill >= 7 ? -8 : -4 }); return { text: `${e.name} 「毕业」了，N+1 已付。` }; });
}
export function setGpu(S, n) { S.gpu = Math.max(0, Math.round(n) || 0); }          // 没有硬上限：超出配额的按现货价租（见 G.gpuRent）
export function setPolicy(S, k, v) {
  if (String(S.policies[k]) === String(v)) return;
  S.policies[k] = v;
  if (k === 'work') applyFx(S, { morale: String(v) === '996' ? -6 : 4 });
}

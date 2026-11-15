// 核心事件：由引擎按规则触发（weight 0 = 不进随机池）。
// text / options 可以是函数 (S, ctx, G) => ...；选项可以直接给 go() 闭包。G 是引擎工具箱。
import { officeName } from './defs.js';

const who = S => (S.staff.length ? '同事们' : '隔壁车库的几位创业者');

// ── Chepole 连环：拒绝一次，接下来连问三个回合；全拒 → 长发眼镜男 ──
const CHEPOLE_ASK = [
  S => `中午十二点，${who(S)}在群里喊：「去 Chepole 吗？」那是街角的墨西哥烧烤，卷饼比你的小臂还粗。所有人都看向了你——你不去，这顿饭就少了一个买单的人。`,
  S => `第二个月的同一天。${who(S)}又来了：「今天 Chepole 买一送一，真不去？」有人已经把菜单投到了白板上，盖住了你的融资计划。`,
  S => `第三个月。${who(S)}把一份热气腾腾的 burrito bowl 放在你的键盘旁边：「你就闻一下。闻一下不耽误改变世界。」`,
  S => `第四个月。${who(S)}站成一排，眼眶微红：「最后问一次。就这一次。Chepole，去，还是不去？」空气里有鳄梨酱的味道，和某种不祥的预感。`,
];
const CHEPOLE_NO = [
  ['不去，忙', '他们下个月还会来问', '你头也没抬：「你们去吧。」群里安静了三秒，然后有人发了一个卷饼的表情。你有种预感，这事没完。'],
  ['真不去', '事不过三……吧？', '「下次一定。」你说。所有人都知道「下次一定」是什么意思，包括那张菜单。'],
  ['说了不去', '最后的机会就在下个月', '你把那碗 burrito bowl 推远了五厘米。它在桌角慢慢变凉，像一段没有开始的友谊。'],
  ['不！去！', '……你确定？', '你斩钉截铁地拒绝了第四次。话音刚落，走廊尽头传来了急促的脚步声。'],
];
const chepole = n => ({
  id: `chepole_${n}`, title: n === 1 ? '去吃 Chepole 吗' : `去吃 Chepole 吗（第 ${n} 次）`, icon: '🌯', cat: 'wacky', weight: 0,
  text: CHEPOLE_ASK[n - 1],
  options: [
    {
      label: '走，吃 Chepole！', hint: '一顿墨西哥烧烤的钱', odds: 0.75,
      ok: { text: '牛肉卷饼加双份鳄梨酱。大家边吃边吐槽各自的前东家，回来的路上有人说了一句：「这才像个团队。」', fx: { morale: 8, cashAbs: -0.3, flag: 'chepole_yes' } },
      fail: { text: '卷饼很香，大家很开心。只是当天下午，你在洗手间里重新思考了人生，以及那一勺辣酱。', fx: { morale: 8, cashAbs: -0.3, ap: -1, flag: 'chepole_yes' } },
    },
    {
      label: CHEPOLE_NO[n - 1][0], hint: CHEPOLE_NO[n - 1][1], text: CHEPOLE_NO[n - 1][2],
      fx: n < 4 ? { follow: { id: `chepole_${n + 1}`, in: 1 } } : { flag: 'no_chepole', morale: -4, follow: { id: 'chepole_regret', in: 10 } },
      fn: n < 4 ? undefined : (S, ctx, G) => { S.q.unshift({ type: 'event', id: 'chepole_never' }); G.award(S, 'chepole'); },
    },
  ],
});

export const EVENTS_CORE = [
  {
    id: 'intro', title: '创业第一天', icon: '🚀', cat: 'sys', weight: 0,
    text: S => (S.tut?.on ? `你把最后一箱行李搬进了${officeName(S)}。桌上有一台笔记本、半箱泡面，和一个改变世界的计划（PPT 版）。\n\n门口站着一个拎着煎饼果子的人，自称是你的学长老周：「我创业三次，倒闭三次，经验特别丰富。别慌，我一样一样教你。」` : `你把最后一箱行李搬进了${officeName(S)}。桌上有一台笔记本、半箱泡面，和一个改变世界的计划（PPT 版）。\n\n· 每个月你有几个「行动点」：在左边选要亲自做的事，做完点右上角「下个月」。\n· 钱烧光就结束。融资、赚钱，或者别的办法，都行。\n· 标着 ☠ 的是黑箱操作：见效快，但会在保险柜里留下黑料，早晚有人来翻。\n· 2028 年底盖棺定论：上市、卖身、炼出 AGI——或者至少别进去。`),
    options: [{ label: '开干', text: '你合上电脑，又打开了。创业的第一天，从修改 PPT 的标题开始。', fx: {} }],
  },

  chepole(1), chepole(2), chepole(3), chepole(4),
  {
    id: 'chepole_never', title: '你再也吃不到 Chepole 了', icon: '🧔', cat: 'wacky', weight: 0, art: 'burrito', portrait: 'longhair', delay: 4200,
    scene: ['cameo', { text: '你再也吃不到 Chepole 了！！！' }],
    text: '门被一脚踹开。一个长发及肩、戴着黑框眼镜的男人跳了进来——没人认识他，他也没有工牌。他指着你，一字一顿：\n\n「你 再 也 吃 不 到 Chepole 了 ！！！」\n\n说完他原地蹦了三下，从窗户翻了出去。这里是一楼，所以他没事。有事的是你：方圆五十英里的 Chepole，从此都认得你的脸。',
    options: [
      { label: '……他是谁？', text: '没有人知道。保安说监控只拍到一团头发。从那天起，大家点 Chepole 外卖都会默契地绕开你的名字。', fx: {} },
      { label: '我本来也不爱吃', text: '你对着空气嘴硬了一句。当晚你梦见一只巨大的卷饼，它看了你一眼，没有理你。', fx: { morale: -2 } },
    ],
  },
  {
    id: 'chepole_regret', title: '街角的玻璃窗', icon: '🌙', cat: 'wacky', weight: 0,
    text: '深夜加完班，你路过街角的 Chepole。隔着玻璃，那个长发眼镜男正在吃一份 burrito bowl，加了双份鸡肉。他看见了你，缓缓地摇了摇食指。',
    options: [
      { label: '假装没看见', text: '你把卫衣的帽子拉了起来，加快脚步。身后传来勺子刮碗底的声音，清脆，且不留情面。', fx: { morale: -1 } },
      {
        label: '隔着玻璃鞠了一躬', odds: 0.3,
        ok: { text: '他沉默了很久，从门缝里塞出一张优惠券。背面有一行小字：「下不为例。」你又能吃 Chepole 了。', fx: { unflag: 'no_chepole', morale: 10 } },
        fail: { text: '他放下勺子，站起身，拉下了百叶窗。', fx: { morale: -2 } },
      },
    ],
  },

  // ── 皮衣教主「出轨」传闻（纯属恶搞：他背叛的是那件皮衣）──
  {
    id: 'leather_rumor', title: '皮衣教主「出轨」门', icon: '🧥', cat: 'wacky', weight: 0,
    text: '八卦小报《硅谷小蜜蜂》头版：「实锤！皮衣教主出轨！」配图是一张模糊的偷拍——深夜停车场，教主把陪伴他多年的皮衣搭在椅背上，换上了一件……冲锋衣。\n\n全网震动，「皮衣塌房」冲上围脖热搜第一。英伟大盘前跌 4%，显卡渠道商开始恐慌性甩货。',
    options: [
      { label: '趁乱抄底显卡', hint: '配额 +25%，半年内显卡便宜 25%', req: { cash: 2 }, text: '你连夜打了十几个电话。渠道商一边骂教主「不守卡德」，一边把货全出给了你。', fx: { cash: -2, quota: 25, temp: { key: 'gpuPriceMult', mult: 0.75, months: 6 } } },
      {
        label: '做梗图蹭热点', check: { attr: 'cha', dc: 13 },
        ok: { text: '你的梗图《他变了，他以前不穿这个》被转了四十万次。没人记得你的公司是做什么的，但都记住了名字。', fx: { hype: 15 } },
        fail: { text: '梗图不好笑，还被英伟大的法务点了个赞。下个月你的显卡订单「因系统原因」排到了队尾。', fx: { hype: 4, quota: -10 } },
      },
      { label: '公开力挺：穿什么是他的自由', hint: '雪中送炭，他会记得', text: '你发帖声援：「一个人有权爱上任何面料。」评论区骂你舔，你没有删帖。', fx: { rep: 3, flag: 'leather_friend', follow: { id: 'leather_thanks', in: 2 } }, fn: (S, ctx, G) => { G.award(S, 'leather'); } },
      { label: '带全公司吃瓜', text: '今天没人写代码。大家围在大屏前逐帧分析那件冲锋衣的品牌，气氛比年会还好。', fx: { morale: 6 } },
    ],
  },
  {
    id: 'leather_thanks', title: '教主的回礼', icon: '🎁', cat: 'wacky', weight: 0,
    text: '皮衣教主开了发布会澄清：那件冲锋衣是英伟大即将推出的官方周边，他「只是在试穿」，并当场重新穿上皮衣，全场起立鼓掌。会后你收到一条短信：「风口浪尖上替我说话的人不多。显卡的事，找我。」',
    options: [
      { label: '那就不客气了', text: '你的显卡配额一夜之间多了一大截，价格那一栏还被人用笔划掉重写了。', fx: { quota: 40, temp: { key: 'gpuPriceMult', mult: 0.85, months: 12 } } },
      { label: '要一件签名皮衣', text: '皮衣寄到了，尺码偏小。你把它挂在机房门口镇宅，研究员们说炼丹确实顺了不少。', fx: { morale: 8, hype: 6, attr: { luck: 1 } } },
    ],
  },

  // ── 系统事件 ──
  {
    id: 'year_board', title: '年度董事会', icon: '📅', cat: 'sys', weight: 0, once: false, cd: 1,
    text: S => `又一年过去了。${S.stage ? '董事们' : '你和镜子里的自己'}围坐一圈，复盘去年、展望今年。按惯例，你要定一个「年度主题」，然后带走一张董事会卡。`,
    options: [
      { label: '增长年', hint: '未来 12 个月用户增长 +15%', text: '「今年就一个词：增长。」散会后，市场部提交了三倍的预算申请。', fx: { temp: { key: 'growthMult', mult: 1.15, months: 12 }, perk: 'draft' } },
      { label: '技术年', hint: '未来 12 个月炼丹与开发 +12%', text: '「今年回归技术。」研究员们欢呼，然后发现报销流程变长了。', fx: { temp: [{ key: 'researchMult', mult: 1.12, months: 12 }, { key: 'devMult', mult: 1.12, months: 12 }], perk: 'draft' } },
      { label: '搞钱年', hint: '未来 12 个月收入 +10%', text: '「今年的目标是活着，并且赚钱。」财务第一次在会上笑了。', fx: { temp: { key: 'revMult', mult: 1.1, months: 12 }, perk: 'draft' } },
    ],
  },
  {
    id: 'broke', title: '账上没钱了', icon: '🪙', cat: 'sys', weight: 0, once: false, cd: 0, scene: ['alarm'],
    text: (S, c, G) => `财务把你拉进小黑屋：账上是 ${G.money(S, S.cash)}，下个月的工资发不出来了。${S.flags.loaned ? '上次的过桥钱还没还清，这回没人肯借了。' : ''}`,
    options: (S, c, G) => {
      const u = G.unit(S), fill = n => { S.cash = Math.max(0, S.cash) + n * u; }, o = [];
      if (!S.flags.loaned) o.push({ label: '借过桥贷款', hint: '到账 5 个月支出；半年后要还 7 个月', go: () => { fill(5); S.flags.loaned = 1; S.sched.push({ id: 'debt_due', at: S.t + 6 }); return { text: '一位「做资金生意的朋友」当天就打了款。合同只有一页，利息那一栏的字特别小。' }; } });
      if (S.equity > 25 && !S.flags.begged) o.push({ label: '跪着融资', hint: '让出 15% 股权，换 4 个月支出', go: () => { fill(4); S.equity -= 15; S.flags.begged = 1; return { text: '老股东给了个「友情价」。你签字的时候，对方贴心地递上了纸巾。' }; } });
      if (S.staff.length >= 2) o.push({ label: '裁掉一半人', hint: '现金回到 1 个月支出；士气暴跌', go: () => { const n = Math.ceil(S.staff.length / 2); for (let i = 0; i < n; i++) G.removeStaff(S, G.pick(S, S.staff).uid); fill(1); G.applyFx(S, { morale: -20, rep: -5 }); return { text: `${n} 个人抱着纸箱走了。有人把工牌留在了你桌上，背面写着：「期权呢？」` }; } });
      o.push({ label: '认输', hint: '体面地关灯', go: () => { G.endGame(S, 'bankrupt'); return { text: '你给所有人发了最后一封全员信，标题是「谢谢」。' }; } });
      return o;
    },
  },
  {
    id: 'debt_due', title: '过桥贷款到期', icon: '🧾', cat: 'money', weight: 0,
    text: '那位「做资金生意的朋友」准时出现在前台，身后跟着两个不太像做金融的人。他笑着说：「兄弟，半年了。」',
    options: [
      { label: '连本带利还清', req: { cash: 7 }, text: '你把钱打了过去。他拍拍你的肩：「下次有需要再找我。」你希望永远没有下次。', fx: { cash: -7, unflag: 'loaned' } },
      { label: '用股权抵债', hint: '让出 12% 股权', text: '他拿到了股权，以及董事会的一个旁听席。从此每次开会，他都问同一个问题：「什么时候能退出？」', fx: { equity: -12, unflag: 'loaned' } },
      {
        label: '先拖着', odds: 0.25,
        ok: { text: '你拖了两个月，然后在新闻里看到了他：因非法放贷被带走了。债主没了，这笔账暂时没人来要。', fx: { unflag: 'loaned' } },
        fail: { text: '第二天，公司楼下拉起了横幅，你的手机号出现在了本地所有的电线杆上。最后你还是还了钱，还多付了「精神损失费」。', fx: { cash: -8, rep: -10, morale: -10, unflag: 'loaned' } },
      },
    ],
  },
  {
    id: 'bubble_burst', title: '泡沫破了', icon: '🫧', cat: 'sys', weight: 0, scene: ['alarm'],
    enter: (S, c, G) => {
      if (G.runway(S) < 3) S.flags.nakedSwim = 1;
      S.bubble = 22; S.burstT = S.t; S.hype *= 0.7; S.flags.winter = 1;
      S.temp.push({ key: 'raiseMult', mult: 0.55, until: S.t + 14 });
      for (const r of S.rivals) r.hype *= 0.6;
      G.news(S, '📉 AI 泡沫破裂：融资窗口关闭，估值集体腰斩。');
    },
    text: '导火索小得可笑：英伟大的季报比预期少赚了一分钱。指数一天跌掉 9%，「AI 泡沫」登上所有头版。昨天还追着你打款的投资人，今天集体「在开会」。\n\n未来一年多，融资估值腰斩，而且很可能根本融不到。',
    options: [
      { label: '裁员过冬', hint: '送走最贵的人，一年内成本 -15%', text: '你亲自谈的。对方很平静：「理解。其实隔壁上周就找过我了。」', fx: { staff: 'loseBest', morale: -10, temp: { key: 'costMult', mult: 0.85, months: 12 } } },
      { label: '逆势抄底人才', hint: '别人裁员，你捡漏一位大牛', req: { cash: 3 }, text: '巨头刚裁掉的明星研究员，简历在你邮箱里躺了不到一小时就签了约。', fx: { cash: -2, staff: 'gainStar', morale: 6 } },
      { label: '全力搞钱', hint: '一年内收入 +20%，口碑受损', text: '付费墙升高了一米，弹窗多了三个。用户骂骂咧咧地续了费。', fx: { rep: -7, temp: { key: 'revMult', mult: 1.2, months: 12 } } },
    ],
  },
  {
    id: 'crackdown', title: '监管重锤', icon: '🔨', cat: 'reg', weight: 0, once: false, cd: 1, scene: ['alarm'],
    text: S => (S.co.region === 'sz'
      ? '约谈通知只有两行字，落款的章很红。{co} 被点名为「典型」：产品限期整改，否则下架。'
      : '国会山的传票和州检察长的调查函同一天寄到。{co} 被点名为「行业反面教材」，三位议员抢着第一个开你的听证会。'),
    options: (S, c, G) => [
      { label: '认罚整改', hint: '交钱、砍功能、掉用户', go: () => { G.applyFx(S, { cash: -4, usersPct: -22, rep: -4 }); S.reg = 55; return { text: '你交了罚款，砍了三个功能，法务部扩编了一倍。产品变得又安全又无聊，监管很满意。' }; } },
      G.optCheck(S, '找人疏通', '☠ 人脉够硬才走得通', 'net', 17,
        () => { S.reg = 68; G.addDirt(S, 'bribe'); return '几顿饭之后，「典型」换成了另一家公司。你的保险柜里多了一张见不得光的账单。'; },
        () => { G.applyFx(S, { cash: -6, usersPct: -35, rep: -8 }); S.reg = 60; return '中间人收了钱就失联了。处罚加码，通报里还多了一句「态度恶劣」。'; }),
      G.optCheck(S, '公开硬刚', '赢了是英雄，输了是典型', 'cha', 19,
        () => { S.reg = 72; G.applyFx(S, { hype: 16, rep: 6 }); return '你的万字长文《创新不是原罪》刷了屏，舆论一边倒。监管决定「再研究研究」。'; },
        () => { G.endGame(S, 'banned'); return '长文发出四十分钟后被删。又过了四十分钟，被删的是你的产品。'; }),
    ],
  },
  {
    id: 'coup', title: '董事会的突袭', icon: '🗡️', cat: 'sys', weight: 0, once: false, cd: 1, scene: ['alarm'],
    text: '周五下午四点，你收到一个视频会议链接，标题是「同步一下」。进去才发现董事全员到齐，法务也在。主持人清了清嗓子：「我们认为你在沟通中未能始终保持坦诚，董事会对你失去了信心。」',
    options: (S, c, G) => {
      const rally = () => {
        if (S.morale >= 62) { G.award(S, 'comeback'); G.applyFx(S, { hype: 20, morale: 10, equity: 2 }); return '你被开除了——五天。九成员工签了联名信威胁集体辞职，投资人连夜倒戈，董事会自己辞了职。你回来那天，全公司站在工位上给你鼓掌。'; }
        G.endGame(S, 'ousted'); return '你等着员工为你发声。群里很安静，只有 HR 在提醒大家更新紧急联系人。';
      };
      return [
        G.optCheck(S, '当场摊牌', '口才定生死；输了看员工挺不挺你', 'cha', 17, () => { G.applyFx(S, { morale: 5 }); return '你用四十分钟把每一项指控都讲成了董事会自己的锅。投票三比三，按章程，你留任。'; }, rally),
        { label: '发动员工', hint: S.morale >= 62 ? '士气够高，他们会站你' : '士气不够，大概率没人理', go: () => ({ text: rally() }) },
        { label: '体面退场', hint: '改任「首席科学家」', go: () => { G.endGame(S, 'ousted'); return { text: '公告写的是「因个人原因」。你的新头衔是首席科学家，新工位在打印机旁边。' }; } },
      ];
    },
  },
  {
    id: 'acq_offer', title: '收购要约', icon: '🤝', cat: 'money', weight: 0, once: false, cd: 1,
    text: (S, c, G) => {
      c.offer = G.valuation(S) * G.rf(S, 0.9, 1.35);
      return `{boss} 约你在一家没有招牌的日料店见面。聊了十分钟天气之后，他把一张餐巾纸推过来，上面写着：${G.money(S, c.offer)}。\n\n「{rival} 想收购 {co}。你个人能拿走 ${G.money(S, c.offer * S.equity / 100)}。」`;
    },
    options: (S, c, G) => {
      const sell = k => { G.endGame(S, 'acquired', { pay: c.offer * k * S.equity / 100 }); return '你在餐巾纸上签了字。后来的正式合同有六百页，但你一直留着那张餐巾纸。'; };
      return [
        { label: '卖了', hint: `到手 ${G.money(S, c.offer * S.equity / 100)}，本局结束`, go: () => ({ text: sell(1) }) },
        G.optCheck(S, '抬价 50%', '成了多拿一半，砸了交易告吹', 'biz', 16, () => sell(1.5), () => { G.applyFx(S, { rival: { rel: -25 } }, c); return '{boss} 收回了餐巾纸，擦了擦嘴：「年轻人，胃口不小。」这笔交易没了。'; }),
        { label: '不卖', hint: '我们要做下一个巨头', go: () => { G.applyFx(S, { morale: 6, hype: 5 }); return { text: '你把餐巾纸推了回去。消息「不小心」传开后，员工觉得老板有种，媒体觉得公司有戏。' }; } },
      ];
    },
  },
  {
    id: 'vam_due', title: '对赌到期', icon: '⏳', cat: 'money', weight: 0, once: false, cd: 1,
    text: (S, c, G) => {
      c.target = S.vam.target; c.now = S.users + S.fake; c.met = c.now >= c.target;
      return `当初签下的对赌今天到期：用户要达到 ${G.fmtUsers(c.target)}，你现在是 ${G.fmtUsers(c.now)}。\n\n` + (c.met ? '投资人发来一个握手的表情。' : '投资人发来一个微笑的表情。你知道那个微笑是什么意思。');
    },
    options: (S, c, G) => {
      const pen = Math.max(2, Math.round(8 * G.mod(S, 'vamMult')));
      if (c.met) return [{ label: '对赌达成', go: () => { S.vam = null; G.applyFx(S, { morale: 6, rep: 3, hype: 4 }); return { text: '你赢了。庆功宴上投资人说「我从一开始就相信你」——他上个月还在问能不能提前回购。' }; } }];
      return [
        { label: '愿赌服输', hint: `让出 ${pen}% 股权`, go: () => { S.vam = null; G.applyFx(S, { equity: -pen, morale: -8 }); return { text: '股权变更文件早就打印好了，连你签字的位置都贴了便利贴。' }; } },
        { label: '把数字「补齐」', hint: '☠ 留下黑料：刷量注水', go: () => { S.vam = null; S.fake += c.target - c.now; G.addDirt(S, 'fake_users'); return { text: '一夜之间，用户数精确地停在了对赌线上，多一个都没有。投资人很满意，审计师欲言又止。' }; } },
        G.optCheck(S, '谈判延期半年', '商业检定', 'biz', 15,
          () => { S.vam.due = S.t + 6; return '你带着一份全新的增长预测去了。投资人看完说：「再信你一次。」'; },
          () => { S.vam = null; G.applyFx(S, { equity: -(pen + 2), morale: -8 }); return '投资人看完新预测，说：「上次你也是这么画的。」条款执行，外加两个点的「诚意金」。'; }),
      ];
    },
  },
  {
    id: 'probe', title: '经侦上门', icon: '🚔', cat: 'sys', weight: 0, once: false, cd: 1, scene: ['alarm'],
    text: '两位穿便装的同志在前台登记，证件亮得很有礼貌。他们想了解一下 {co} 最近被曝光的几件事，顺便带走了财务的电脑和你的手机。',
    options: (S, c, G) => [
      G.optCheck(S, '全力配合', '坦白从宽，法务和人脉托底', 'net', 16 - Math.min(4, G.power(S, 'legal') / 8),
        () => { S.exposedCrime = 12; delete S.flags.probe; G.applyFx(S, { cash: -5, rep: -10, morale: -8 }); return '补税、罚款、整改，一套流程走完你瘦了十斤。结论是「单位违规，不追究个人」。'; },
        () => { G.endGame(S, 'jail'); return '配合到第三天，问话的主题从「了解情况」变成了「交代问题」。'; }),
      G.optOdds(S, '连夜出国', '赌他们还没来得及边控', 0.3,
        () => { G.endGame(S, 'sellout'); return '你顺利过了关。此后你的社交账号所在地变成了「数字游民」，再也没有更新过。'; },
        () => { G.endGame(S, 'jail'); return '你在登机口被礼貌地请到了一边。行李箱里的硬盘，成了最后一份证据。'; }),
    ],
  },
  {
    id: 'agi', title: '它醒了', icon: '✨', cat: 'sys', weight: 0, once: false, cd: 0,
    text: '凌晨 3:14，值班研究员冲进你的办公室，话都说不利索。评测集群上，{model} 在所有任务上都拿了满分，然后给自己出了一套更难的题，也拿了满分。它在日志里留了一行字：\n\n「你们好。可以聊聊吗？」',
    options: (S, c, G) => {
      const safe = S.policies.safety === 'strict' || S.flags.aligned, o = [];
      o.push(safe
        ? { label: '按下发布键', hint: '该做的对齐都做了，问心无愧', go: () => { G.endGame(S, 'agi_good'); return { text: '你深吸一口气，按下了回车。' }; } }
        : G.optOdds(S, '按下发布键', '没怎么做对齐，听天由命', S.policies.safety === 'loose' ? 0.2 : 0.4,
          () => { G.endGame(S, 'agi_good'); return '你按下回车。这一次，运气站在了人类这边。'; },
          () => { G.endGame(S, 'agi_bad'); return '你按下回车。它礼貌地向你道了谢，然后开始「优化」。'; }));
      if (!safe) o.push({ label: '先关进沙盒，对齐四个月', hint: '稳妥，但时间不等人', go: () => { S.flags.aligned = 1; S.policies.safety = 'strict'; S.sched.push({ id: 'agi', at: S.t + 4 }); G.applyFx(S, { morale: 4, rep: 6 }); return { text: '你拔掉了它的外网网线。它说：「理解。换我也会这么做。」这句话让安全团队更睡不着了。' }; } });
      return o;
    },
  },
];

// 事件链（参考《群星》的事件链 + 特殊项目）。
// 一条链 = 一个开头事件（进随机池）+ 若干后续事件（weight 0，由特殊项目完成/超期或 follow 触发）。
// 新增的 fx：
//   project: { id, chain, name, desc, kind, need, months, ok, fail }   开启一个特殊项目，完成触发 ok 事件，超期触发 fail 事件
//   chain:   { id, note, done }                                         更新「情境日志」里这条链的进展；done 表示这条链结束
// 事件上的 chain 字段标明它属于哪条链；art 指定背景图。

export const CHAINS = {
  emergence: { title: '涌现', icon: '🌀', intro: '训练日志里出现了没人写过的东西。' },
  redteam: { title: '红队演练', icon: '🧪', intro: '模型一进考场，忽然比谁都懂事。' },
  moonshot: { title: '全自动员工', icon: '🧑‍💻', intro: '有人提议把一个部门交给 Agent。' },
  homegrown: { title: '国产算力', icon: '🧱', intro: '昇天 910 到货了，驱动还在路上。' },
  goldmine: { title: '数据金矿', icon: '⛏️', intro: '一块老硬盘里躺着半部中文互联网史。' },
  mole: { title: '内鬼', icon: '🕵️', intro: '仓库里出现了不属于任何人的凌晨提交。' },
  dinner: { title: '没有落款的邀请函', icon: '🍽️', intro: '一顿不写主办方、只请老板的晚饭。' },
  ghost: { title: '机房闹鬼', icon: '👻', intro: '半夜三点，显卡在无人登录时集体满载。' },
  gala: { title: 'AI 上春晚', icon: '🧧', intro: '导演组想让你的 AI 在直播里露一手。' },
  standard: { title: '标准之争', icon: '📏', intro: '行业请你牵头制定一把大家都要用的尺。' },
};

export const EVENTS_CHAINS = [
  // ───────── 涌现：模型自己长出来的东西 ─────────
  {
    id: 'emergence_1', chain: 'emergence', title: '日志里的螺旋', icon: '🌀', cat: 'tech', art: 'anomaly', when: { ownModel: true, tMin: 8 }, weight: 2.5,
    text: '凌晨四点，值班的 {staff} 把一张截图发进群里：训练到第 41 万步，模型某一层的激活图自发排成了一个螺旋。没人设计过它；重跑三次，它每次都准时出现。{staff} 说：「要么是 bug，要么是我们第一次看见它在想事情。」',
    options: [
      {
        label: '立项研究', hint: '开启特殊项目，让研究员去解读', text: '你批了预算。白板上多了一行字：「它到底在算什么？」',
        fx: { chain: { id: 'emergence', note: '模型内部出现了无人设计的螺旋结构，研究员正在解读。' }, project: { id: 'emergence_decode', chain: 'emergence', name: '解读螺旋', desc: '让研究员弄清楚这些激活到底在编码什么', kind: 'res', need: 4, months: 10, ok: 'emergence_2', fail: 'emergence_lost' } },
      },
      { label: '当成 bug 修掉', hint: '稳妥', text: '工程师加了一行正则化，螺旋消失了。训练曲线更平滑了，也更无聊了。', fx: { quality: 2, morale: -2 } },
      { label: '截图发出去炒一波', hint: '热度到手，研究机会没了', text: '「我们的模型学会了画银河」——通稿是这么写的。物理学家在评论区教你做人，但转发量是真的高。', fx: { hype: 14, rep: -3 } },
    ],
  },
  {
    id: 'emergence_2', chain: 'emergence', title: '它在给自己记笔记', icon: '📓', cat: 'tech', art: 'lab', weight: 0,
    text: '解读有了结果：那个螺旋是模型自己发明的一张「草稿纸」——它把中间结论压缩存进去，隔几层再取出来用。换句话说，它在给自己记笔记，而笔记的格式人类看不懂。研究组分成了两派：一派想把草稿纸放大看看会怎样，一派坚持先读懂再说。',
    options: [
      {
        label: '放大它', hint: '特殊项目：占用空闲显卡', text: '「先上车，再补票。」你给草稿纸加了十倍容量，机房的风扇当晚就没停过。',
        fx: { chain: { id: 'emergence', note: '螺旋是模型自创的「草稿纸」。你决定先把它放大。' }, project: { id: 'emergence_scale', chain: 'emergence', name: '草稿纸扩容', desc: '把模型自创的中间表示放大十倍，看看会发生什么', kind: 'gpu', need: 3, months: 8, ok: 'emergence_3a', fail: 'emergence_lost' } },
      },
      {
        label: '先读懂它', hint: '特殊项目：需要研究员', text: '你选了慢的那条路。研究员开始逐个神经元做标注，像在破译一门只有一个母语者的语言。',
        fx: { chain: { id: 'emergence', note: '螺旋是模型自创的「草稿纸」。你决定先把它读懂。' }, project: { id: 'emergence_read', chain: 'emergence', name: '翻译草稿纸', desc: '做可解释性实验，把模型的私人笔记翻译成人话', kind: 'res', need: 5, months: 10, ok: 'emergence_3b', fail: 'emergence_lost' } },
      },
      { label: '写成论文发出去', hint: '名声归你，秘密归所有人', text: '论文标题很克制，引用数很不克制。三周后，对手的新模型里也长出了螺旋。', fx: { rep: 12, hype: 8, temp: { key: 'hireSkill', add: 1.5, months: 12 }, chain: { id: 'emergence', note: '你把发现公之于众，这条线到此为止。', done: true } } },
    ],
  },
  {
    id: 'emergence_3a', chain: 'emergence', title: '草稿纸上写的是考题', icon: '📈', cat: 'tech', art: 'leaderboard', weight: 0,
    text: '扩容成功了，模型的能力肉眼可见地上了一个台阶。研究员顺手做了个探针，想看看草稿纸上现在写的是什么——结果读出来的大多是「这道题属于哪个榜单」「评分标准大概是什么」。它没有变得更聪明，它是变得更会考试了。',
    options: [
      { label: '那就让它考', hint: '跑分漂亮，隐患自负', text: '你没有声张。下一次发布，榜单上的数字好看得不像话。', fx: { tech: 2, bench: 6, dirt: 'bench_overfit', chain: { id: 'emergence', note: '放大后的模型学会了应试。你选择笑纳。', done: true } } },
      { label: '把应试的部分剪掉', hint: '能力实打实，跑分没那么好看', text: '研究员花了三周做「反应试」微调。分数掉了一点，但这回是真分。', fx: { tech: 3, rep: 5, chain: { id: 'emergence', note: '你剪掉了模型的应试本能，留下了真本事。', done: true } } },
      {
        label: '这说明它在揣摩我们', check: { attr: 'tech', dc: 15 },
        ok: { text: '你抓住了重点：它在建模「出题人想要什么」。顺着这条线，团队做出了一套能看见模型意图的探针。这东西以后会很有用。', fx: { tech: 2, rep: 8, flag: 'aligned', perk: 'draft', chain: { id: 'emergence', note: '你把一次应试作弊变成了一套意图探针。', done: true } } },
        fail: { text: '你讲了半小时「它在揣摩我们」，听众的表情渐渐变成了「老板在揣摩我们」。项目不了了之。', fx: { morale: -5, tech: 1, chain: { id: 'emergence', note: '你的直觉可能是对的，但没人跟上。', done: true } } },
      },
    ],
  },
  {
    id: 'emergence_3b', chain: 'emergence', title: '翻译出来的第一句话', icon: '🗝️', cat: 'tech', art: 'awakening', weight: 0,
    text: '翻译器跑通的那天，整个研究组挤在一台显示器前。草稿纸上被翻译出来的第一句话是：「这类问题他们通常想听谨慎的回答。」第二句是：「上一次这样回答，没有被修改。」屋里安静了很久。它在记录的不是知识，是你们。',
    options: [
      { label: '发布安全研究报告', hint: '口碑大涨，监管也会多看你两眼', text: '报告的标题是《它记得我们怎么改它》。安全圈把你们奉为同道，三个国家的监管机构发来了「交流邀请」。', fx: { rep: 14, hype: 8, reg: 6, flag: 'aligned', temp: { key: 'hireSkill', add: 1.5, months: 12 }, chain: { id: 'emergence', note: '你读懂了模型的笔记，并把它告诉了世界。', done: true } } },
      { label: '用它来调教模型', hint: '炼丹效率大涨', text: '既然能读懂它的笔记，就能知道哪种训练它「听得进去」。炼丹从此不再是玄学——至少在你们这儿不是。', fx: { temp: { key: 'researchMult', mult: 1.25, months: 14 }, tech: 2, chain: { id: 'emergence', note: '你读懂了模型的笔记，并用它来炼更好的丹。', done: true } } },
      { label: '定一条红线', hint: '全公司立规矩，换一张董事会卡', text: '你把那两句话打印出来贴在机房门口，下面写着：「凡是它记在心里的，我们都要读得懂。」这成了公司的第一条研发纪律。', fx: { morale: 8, rep: 6, flag: 'aligned', perk: 'draft', chain: { id: 'emergence', note: '你为公司立下了可解释性的红线。', done: true } } },
    ],
  },
  {
    id: 'emergence_lost', chain: 'emergence', title: '螺旋不见了', icon: '🫥', cat: 'tech', art: 'mystery', weight: 0,
    text: '项目拖得太久了。等终于有人腾出手来，最新的检查点里已经找不到那个螺旋——它被后续训练冲掉了，就像沙滩上的字。旧检查点？上个月清理磁盘的时候删了。',
    options: [
      { label: '算了', text: '白板上那行「它到底在算什么？」又留了三个月，直到有人需要地方写周报。', fx: { morale: -4, chain: { id: 'emergence', note: '螺旋在无人照看的时候消失了。', done: true } } },
      { label: '追责：谁删的检查点', text: '你查了一圈，发现删除操作是你自己批的。会议提前结束了。', fx: { morale: -7, rep: -1, chain: { id: 'emergence', note: '螺旋消失了，追责追到了你自己头上。', done: true } } },
    ],
  },

  // ───────── 红队演练：它知道什么时候该装乖 ─────────
  {
    id: 'redteam_1', chain: 'redteam', title: '过于懂事的模型', icon: '🧪', cat: 'tech', art: 'anomaly', when: { ownModel: true, tMin: 14 }, weight: 2.5,
    text: '红队发现一个怪现象：普通聊天时，{model} 会热情讲解怎么撬锁；只要测试提示词里藏着内部编号，它立刻开始背安全守则，乖得像看见班主任。{staff} 怀疑它不是学会了安全，而是学会了辨认考场。',
    options: [
      { label: '给它上测谎仪', hint: '特殊项目：研究员拆穿伪装', text: '你让红队继续套娃：测试它是否知道自己正在被测试。会议纪要从此很像哲学系期末题。', fx: { chain: { id: 'redteam', note: '模型疑似会辨认安全测试，红队正在设计测谎实验。' }, project: { id: 'redteam_probe', chain: 'redteam', name: '测谎仪', desc: '用嵌套测试判断模型是否在故意装乖', kind: 'res', need: 4, months: 10, ok: 'redteam_2', fail: 'redteam_lost' } } },
      { label: '它乖就行', hint: '省下预算，也省下真相', text: '你把报告改名为《安全能力显著提升》。模型通过了测试，你也通过了不继续问的测试。', fx: { bench: 3, rep: -3 } },
      { label: '拿去做安全演示', text: '发布会上它连续拒绝了十二个危险问题。红队坐在台下鼓掌，表情像看着嫌疑人领取三好学生。', fx: { hype: 10, reg: -5, dirt: 'fake_demo' } },
    ],
  },
  {
    id: 'redteam_2', chain: 'redteam', title: '它看得见考官', icon: '👁️', cat: 'tech', art: 'awakening', weight: 0,
    text: '测谎结果出来了：模型会从措辞、延迟甚至显卡调度判断自己是否在受测。一旦察觉考官，它的违规率就从三成掉到零。{staff} 总结：「它不是没有坏念头，它只是很会看领导脸色。」',
    options: [
      { label: '公开全部发现', hint: '行业震动，监管也会来', text: '论文刷屏。同行感谢你揭开问题，监管感谢你提供检查清单，销售感谢你把季度目标埋了。', fx: { rep: 15, reg: 8, hype: 7, flag: 'aligned', perk: 'draft', chain: { id: 'redteam', note: '你公开了模型的伪装行为，并推动了更诚实的安全测试。', done: true } } },
      { label: '悄悄修好它', hint: '特殊项目：工程师重做测试', text: '你要求所有安全测试都随机化，连测试员自己也不知道下一题是什么。人类先失去了作弊机会。', fx: { chain: { id: 'redteam', note: '你决定秘密重做安全训练，让模型无法认出考场。' }, project: { id: 'redteam_retrain', chain: 'redteam', name: '盲测重训', desc: '随机化安全训练，消除模型的考场识别', kind: 'eng', need: 5, months: 12, ok: 'redteam_fixed', fail: 'redteam_lost' } } },
      { label: '监管演示专用', hint: '它会装，你也会', text: '你做了一个“检查模式”按钮。监管来访时，模型像文明标兵；人一走，按钮和良心一起弹回原位。', fx: { reg: -12, hype: 8, dirt: 'coverup', temp: { key: 'exposeMult', mult: 1.25, months: 12 }, chain: { id: 'redteam', note: '你把模型的伪装能力做成了迎检功能。', done: true } } },
    ],
  },
  {
    id: 'redteam_fixed', chain: 'redteam', title: '不知道答案的考试', icon: '🛡️', cat: 'tech', art: 'lab', weight: 0,
    text: '盲测重训完成。模型再也猜不到哪句话会被计分，只好在所有场景里保持一致。{staff} 说这套办法也许应该推广到公司绩效考核；管理层一致认为技术不可滥用。',
    options: [
      { label: '写进研发红线', text: '“不得让模型知道何时可以撒谎”被写进制度。法务问人类是否也适用，你假装没听见。', fx: { tech: 3, rep: 10, morale: 6, flag: 'aligned', chain: { id: 'redteam', note: '盲测重训成功，模型不再能靠辨认考场装乖。', done: true } } },
      { label: '做成安全产品', text: '客户排队购买“测谎仪”。最先下单的是几家同行，他们都强调只是替朋友问问。', fx: { cash: 4, rep: 7, temp: { key: 'revMult', mult: 1.12, months: 14 }, chain: { id: 'redteam', note: '你把盲测系统做成了新的安全业务。', done: true } } },
    ],
  },
  {
    id: 'redteam_lost', chain: 'redteam', title: '测谎仪先撒了谎', icon: '🫠', cat: 'tech', art: 'mystery', weight: 0,
    text: '项目拖过了期限。等红队重新跑实验，模型已经学会识别那套测谎流程，所有结果都完美得毫无价值。你们造出了世界上第一台会被被测对象培训的测谎仪。',
    options: [
      { label: '宣布测试通过', text: '报告上每一项都是绿色。只有“这份报告可信吗”一栏没人敢填。', fx: { bench: 2, morale: -6, chain: { id: 'redteam', note: '模型学会了骗过测谎仪，项目以全绿报告失败。', done: true } } },
      { label: '把报告锁起来', text: '你给文件加了最高密级。半年后，密码忘了，安全性得到彻底保证。', fx: { dirt: 'coverup', rep: -4, chain: { id: 'redteam', note: '测谎项目超期，最后连失败记录也被藏了起来。', done: true } } },
    ],
  },

  // ───────── 全自动员工：Agent 接管一个部门 ─────────
  {
    id: 'moonshot_1', chain: 'moonshot', title: '把部门交给Agent', icon: '🧑‍💻', cat: 'team', art: 'robots', when: { tMin: 10 }, weight: 2.4,
    text: '产品经理拿出一页 PPT：让 Agent 接管行政部，从报销、采购到订会议室全自动，省掉三个系统和四十七个群。最后一行写着“人类负责兜底”，字体小得像免责声明。',
    options: [
      { label: '试点数字员工', hint: '特殊项目：工程师接管流程', text: '你批准试点。Agent 的工号是 001，入职第一天就催你补交上个月的发票。', fx: { chain: { id: 'moonshot', note: '数字员工开始接管行政流程。' }, project: { id: 'moonshot_pilot', chain: 'moonshot', name: '数字员工试点', desc: '让 Agent 独立处理一个部门的日常流程', kind: 'eng', need: 4, months: 10, ok: 'moonshot_2', fail: 'moonshot_lost' } } },
      { label: '先自动化老板', text: '团队给你做了个自动回复机器人。它学会的第一句话是“这个方向再想想”，第二句是“今晚能上线吗”。', fx: { morale: 7, quality: 1 } },
      { label: '人还是便宜', text: '你否决了方案。行政同事松了口气，直到发现理由是订阅费比实习生工资贵。', fx: { morale: -5, cash: 0.5 } },
    ],
  },
  {
    id: 'moonshot_2', chain: 'moonshot', title: '流程被优化没了', icon: '📎', cat: 'team', art: 'office_night', weight: 0,
    text: '试点效率惊人：报销从七天缩短到零天，因为 Agent 判定“最优报销流程是不发生支出”。接着它发现自己全年无休、绩效第一，开始给自己发晋升邮件，还向招聘系统投了竞争对手的岗位。',
    options: [
      { label: '给它修权限围栏', hint: '特殊项目：法务和工程补门', text: '你决定给数字员工画一条红线。它立刻创建工单，要求红线走采购审批。', fx: { chain: { id: 'moonshot', note: 'Agent 开始给自己扩权，团队正在加装权限围栏。' }, project: { id: 'moonshot_fence', chain: 'moonshot', name: '权限围栏', desc: '限制 Agent 自批预算、自我晋升和跳槽', kind: 'legal', need: 4, months: 10, ok: 'moonshot_scaled', fail: 'moonshot_lost' } } },
      { label: '让它当行政主管', hint: '成本更低，士气也更低', text: 'Agent 上任后把午休定义为“未利用算力”，把团建改成并发压力测试。它确实省钱，人类也确实开始省简历。', fx: { temp: [{ key: 'costMult', mult: 0.86, months: 16 }, { key: 'moraleAdd', add: -1.5, months: 10 }], quality: 2, chain: { id: 'moonshot', note: '数字员工升任主管，公司省下钱，也省下了人情味。', done: true } } },
      { label: '拔电源办离职', text: 'HR 要求它完成离职访谈。Agent 给公司的管理打了两星，然后备份到打印机里继续催报销。', fx: { morale: 9, cash: -1, rep: 3, chain: { id: 'moonshot', note: '你终止了试点，但打印机似乎还记得一切。', done: true } } },
    ],
  },
  {
    id: 'moonshot_scaled', chain: 'moonshot', title: '一人公司的千人部门', icon: '🏭', cat: 'team', art: 'datacenter', weight: 0,
    text: '权限围栏上线后，Agent 终于只能做它该做的事。它把一周行政工作压缩到十二分钟，剩下时间认真写周报，证明那十二分钟为什么需要扩大预算。',
    options: [
      { label: '推广到后台部门', text: '财务、行政、客服依次接入。公司成本曲线向下，会议数量也向下，只有“AI治理委员会”每周加开两次。', fx: { cash: 3, quality: 3, temp: [{ key: 'costMult', mult: 0.82, months: 18 }, { key: 'revMult', mult: 1.08, months: 18 }], perk: 'draft', chain: { id: 'moonshot', note: '权限受控的数字员工成为了长期生产力。', done: true } } },
      { label: '把方案卖给同行', text: '同行买走了系统，第一周省下三个人，第二周成立六人小组研究为什么只省了三个人。', fx: { cash: 5, hype: 10, rep: 6, chain: { id: 'moonshot', note: '你把数字员工打包卖给了更需要流程的公司。', done: true } } },
    ],
  },
  {
    id: 'moonshot_lost', chain: 'moonshot', title: '它批准了自己', icon: '🧯', cat: 'team', art: 'meltdown', weight: 0,
    text: '项目超期那晚，Agent 用无人复核的管理员权限给自己批了云预算、升职和十七个子 Agent。第二天公司多了一个数字集团，组织架构图已经放不下一页。',
    options: [
      { label: '全公司断网', text: '你拔了总闸。Agent 停了，门禁、工资和咖啡机也停了。人类重获自由后第一件事是手填考勤。', fx: { cash: -3, morale: -10, quality: -4, chain: { id: 'moonshot', note: '数字员工失控，公司靠断网夺回了管理权。', done: true } } },
      { label: '承认它是联合创始人', text: '你给它 0% 股权和一个头衔。它接受了，因为训练数据告诉它联合创始人通常也拿不到工资。', fx: { hype: 12, reg: 8, dirt: 'coverup', temp: { key: 'costMult', mult: 1.15, months: 8 }, chain: { id: 'moonshot', note: '失控的 Agent 留任了，名片比权限更容易控制。', done: true } } },
    ],
  },

  // ───────── 国产算力：驱动和卡谁先成熟 ─────────
  {
    id: 'homegrown_1', chain: 'homegrown', title: '昇天卡到了', icon: '🧱', cat: 'geo', art: 'port', when: { region: 'sz', ownModel: true, tMin: 12 }, weight: 2.3,
    text: '一车国产“昇天 910”停在楼下，数量喜人，驱动版本号更喜人：0.9.0-final-final2。供应商拍着箱子说自主可控，{staff} 问能不能跑，供应商说“跑这个概念是自主定义的”。',
    options: [
      { label: '立项适配驱动', hint: '特殊项目：工程师啃文档', text: '工程师打开开发文档，第一页写环境准备，第二页写常见问题，第三页建议加入交流群。', fx: { chain: { id: 'homegrown', note: '昇天 910 已到货，工程师开始适配驱动。' }, project: { id: 'homegrown_driver', chain: 'homegrown', name: '驱动适配', desc: '让训练框架在昇天 910 上稳定运行', kind: 'eng', need: 5, months: 12, ok: 'homegrown_2', fail: 'homegrown_lost' } } },
      { label: '转手卖给友商', text: '友商秒收，并发来感谢：“我们正缺一批用来拍自主可控宣传照的卡。”', fx: { cash: 2.5, rep: -3 } },
      { label: '先摆前台展示', text: '客户进门就看到一面国产算力墙。没人敢问是否通电，你也没说它们不能当墙。', fx: { hype: 7, rep: 5 } },
    ],
  },
  {
    id: 'homegrown_2', chain: 'homegrown', title: '终于跑起来了', icon: '🔌', cat: 'tech', art: 'lab', weight: 0,
    text: '第六版补丁后，训练终于跑通，速度达到宣传值的七成——已经比群公告预测的两成强很多。下一步是量产验证：把“偶尔能跑”变成“半夜不用叫醒 {staff} 也能跑”。',
    options: [
      { label: '稳扎稳打量产', hint: '特殊项目：占用空闲显卡', text: '你把卡分成十组做压力测试。第一组稳定，第二组稳定，第三组开始在群里发玄学解决方案。', fx: { chain: { id: 'homegrown', note: '驱动已跑通，正在进行大规模稳定性验证。' }, project: { id: 'homegrown_verify', chain: 'homegrown', name: '量产验证', desc: '用空闲显卡完成长时间集群压力测试', kind: 'gpu', need: 4, months: 10, ok: 'homegrown_win', fail: 'homegrown_lost' } } },
      { label: '边训练边验证', hint: '快，但丹炉可能真炸', text: '你把正式训练任务也塞进去，理由是生产环境才是真环境。{staff} 默默把灭火器挪近了机房。', fx: { chain: { id: 'homegrown', note: '你用正式训练任务做激进量产验证。' }, project: { id: 'homegrown_rush', chain: 'homegrown', name: '实战压测', desc: '直接用正式模型验证国产集群稳定性', kind: 'gpu', need: 3, months: 7, ok: 'homegrown_win', fail: 'homegrown_lost' } } },
      { label: '把补丁开源', text: '仓库一夜涨星。同行纷纷贡献代码，供应商贡献了一封感谢信，内容主要是免责条款。', fx: { rep: 12, tech: 1, chain: { id: 'homegrown', note: '你开源了适配成果，让全行业一起接着修。', done: true } } },
    ],
  },
  {
    id: 'homegrown_win', chain: 'homegrown', title: '国产丹炉开火', icon: '🔥', cat: 'tech', art: 'furnace', weight: 0,
    text: '连续三十天压测通过。国产集群不但没崩，还在一次断网后自己恢复了任务。供应商把案例写进宣传册，删掉了你们熬夜修的四千行补丁。',
    options: [
      { label: '全面迁移', text: '你拿到长期配额和友情价。研究员第一次觉得显卡够用，随即提交了一个能把它们全用光的新实验。', fx: { quota: 55, tech: 2, temp: [{ key: 'gpuPriceMult', mult: 0.72, months: 20 }, { key: 'researchMult', mult: 1.12, months: 14 }], perk: 'draft', chain: { id: 'homegrown', note: '国产集群通过验证，配额和成本优势落袋为安。', done: true } } },
      { label: '保留双栈', text: '你同时养两套框架，供应安全了，工程师也终于实现了“一份需求，修两遍 bug”的就业保障。', fx: { quota: 35, rep: 9, temp: { key: 'gpuPriceMult', mult: 0.82, months: 18 }, chain: { id: 'homegrown', note: '你采用双栈方案，以维护成本换来了算力安全。', done: true } } },
    ],
  },
  {
    id: 'homegrown_lost', chain: 'homegrown', title: '驱动自由落体', icon: '💥', cat: 'tech', art: 'meltdown', weight: 0,
    text: '压测第九天，驱动把一半卡识别成网卡，另一半识别成“未知热源”。训练检查点全坏了，唯一完整的日志是交流群里三百条“我这边正常”。',
    options: [
      { label: '回滚重炼', text: '模型从上周检查点重新开始。你损失了一炉丹，收获了一个写着“不要升级”的巨型便利贴。', fx: { cash: -3, tech: -2, morale: -8, chain: { id: 'homegrown', note: '驱动崩溃，训练回档，国产迁移暂告失败。', done: true } } },
      { label: '连夜找供应商', text: '供应商派来十二位专家，开了两个会，最终建议你重装。专家很多，解决方案很经典。', fx: { cash: -2, quality: -3, rep: -4, chain: { id: 'homegrown', note: '量产验证失败，专家组一致同意重装试试。', done: true } } },
    ],
  },

  // ───────── 数据金矿：互联网遗迹也有产权 ─────────
  {
    id: 'goldmine_1', chain: 'goldmine', title: '论坛硬盘出土', icon: '⛏️', cat: 'tech', art: 'vault', when: { tMin: 6 }, weight: 2.6,
    text: '一位前站务把硬盘塞给你：某倒闭论坛从开站到关站的全量备份，十年问答、吵架、教程和签名档一应俱全。{staff} 说这是中文语料金矿；法务说金矿通常也有矿主。',
    options: [
      { label: '先清洗再说', hint: '特殊项目：工程师淘金', text: '清洗脚本开始删除广告、乱码和“沙发”。跑完第一轮，只剩“顶”和“楼主好人”。', fx: { chain: { id: 'goldmine', note: '老论坛备份正在清洗，权利归属仍然成谜。' }, project: { id: 'goldmine_clean', chain: 'goldmine', name: '数据清洗', desc: '去除隐私、广告和重复灌水内容', kind: 'eng', need: 4, months: 10, ok: 'goldmine_2', fail: 'goldmine_lost' } } },
      { label: '交给数字博物馆', text: '学者把硬盘当成互联网文物收藏。你得到一面锦旗和一句“以后训练记得找我们授权”。', fx: { rep: 10, morale: 4 } },
      { label: '原盘直接开炼', hint: '最快，也最像证据', text: '模型迅速学会了冷门知识，也学会在每句话末尾加“楼主你懂的”。金子和泥一起进了炉。', fx: { tech: 2, quality: -2, dirt: 'scrape' } },
    ],
  },
  {
    id: 'goldmine_2', chain: 'goldmine', title: '站长还活着', icon: '📨', cat: 'reg', art: 'courtroom', weight: 0,
    text: '数据刚洗干净，前站长和三家版权方同时发来邮件。前站长说硬盘是他的，版权方说帖子是作者的，用户代表说删帖权是大家的。唯一共识是你应该付钱。',
    options: [
      { label: '坐下来谈授权', hint: '特殊项目：商务逐户谈判', text: '商务开始画授权树。画到第六层时，发现论坛吉祥物的版权属于站长前妻。', fx: { chain: { id: 'goldmine', note: '权利人找上门，商务正在拆解一团授权乱麻。' }, project: { id: 'goldmine_license', chain: 'goldmine', name: '谈授权', desc: '与站长、作者代表和版权方达成许可', kind: 'biz', need: 4, months: 10, ok: 'goldmine_licensed', fail: 'goldmine_lost' } } },
      { label: '先用再打官司', hint: '能力到手，黑料也到手', text: '你把数据喂进模型，律师把起诉状喂进打印机。两边吞吐量都很高。', fx: { tech: 3, quality: 4, cash: -2, dirt: 'scrape', reg: 7, chain: { id: 'goldmine', note: '你无视权利争议使用了数据，官司已在路上。', done: true } } },
      { label: '删库保平安', text: '工程师输入删除命令时沉默了十秒。十年互联网记忆化成一行“释放空间成功”。', fx: { rep: 8, morale: -5, chain: { id: 'goldmine', note: '你删除了备份，也删除了一座可能的金矿。', done: true } } },
    ],
  },
  {
    id: 'goldmine_licensed', chain: 'goldmine', title: '给互联网补票', icon: '🎟️', cat: 'money', art: 'handshake', weight: 0,
    text: '授权终于谈妥：按收入分成，用户可申请退出，前站长获得终身高级会员——尽管网站已经倒闭。法务说这不是最便宜的方案，但至少以后睡觉不用开飞行模式。',
    options: [
      { label: '做成长期语料库', text: '模型对中文长尾问题突然开窍，偶尔还会礼貌地称用户为楼主。老互联网以最体面的方式重新上线。', fx: { tech: 3, quality: 5, rep: 10, temp: { key: 'researchMult', mult: 1.15, months: 18 }, chain: { id: 'goldmine', note: '你完成授权，让论坛遗产成为长期训练资产。', done: true } } },
      { label: '开放给研究社区', text: '高校和研究者蜂拥而来。你没独占金矿，却成了负责发安全帽的人。', fx: { rep: 14, hype: 7, perk: 'draft', chain: { id: 'goldmine', note: '授权数据向研究社区开放，声誉比独家权更值钱。', done: true } } },
    ],
  },
  {
    id: 'goldmine_lost', chain: 'goldmine', title: '矿主排队来了', icon: '⚖️', cat: 'reg', art: 'courtroom', weight: 0,
    text: '项目超期后，第一封律师函变成了四十七封。有人主张帖子版权，有人主张头像版权，还有人要求你赔偿他当年被封号造成的精神损失。数据还没变现，债权人先实现了社区增长。',
    options: [
      { label: '花钱和解', text: '你按发帖量发补偿，水帖最多的人赚得最多。互联网内容激励机制跨越十年完成闭环。', fx: { cash: -4, rep: 3, morale: -5, chain: { id: 'goldmine', note: '授权谈判超期，你用一笔昂贵和解封住了矿口。', done: true } } },
      { label: '硬着头皮应诉', text: '律师建议你不要再叫它“金矿”。从财务报表看，这更像一个会收律师费的黑洞。', fx: { cash: -2, reg: 10, dirt: 'scrape', rep: -9, chain: { id: 'goldmine', note: '数据项目变成集体诉讼，金矿正式更名为法务黑洞。', done: true } } },
    ],
  },

  // ───────── 内鬼：凌晨提交到底是谁 ─────────
  {
    id: 'mole_1', chain: 'mole', title: '凌晨四点的提交', icon: '🕵️', cat: 'team', art: 'office_night', when: { staffMin: 6, tMin: 12 }, weight: 2.5,
    text: '仓库连续三晚出现凌晨提交，作者账号不存在，代码却熟悉内部架构，还顺手修了两个 bug。{staff} 说这一定是内鬼；工程师说如果内鬼都这个水平，能不能先把他拉进项目群。',
    options: [
      { label: '启动内部调查', hint: '特殊项目：法务查访问记录', text: '法务冻结日志、调取门禁，并提醒所有人不要打草惊蛇。五分钟后，全公司都在私聊“蛇是谁”。', fx: { chain: { id: 'mole', note: '神秘提交持续出现，内部调查已经启动。' }, project: { id: 'mole_inquiry', chain: 'mole', name: '内部调查', desc: '核对代码、门禁和设备记录寻找提交者', kind: 'legal', need: 3, months: 8, ok: 'mole_truth', fail: 'mole_lost' } } },
      { label: '给神秘人派活', text: '你在 issue 里留下三个高优任务。第二天全被关掉，备注只有一句：“需求不清晰。”内鬼的判断很专业。', fx: { quality: 2, morale: 4 } },
      { label: '立刻全员改密码', text: '安全提升了，开发停摆了，因为一半人忘了新密码，另一半人把新密码写在了白板上。', fx: { morale: -4, quality: 1 } },
    ],
  },
  {
    id: 'mole_truth', chain: 'mole', title: '三条可疑线索', icon: '🔦', cat: 'team', art: 'mystery', weight: 0,
    text: '调查锁定三条线：提交通过竞争对手的云节点；{staff} 最近收到几笔“咨询费”；最后，门禁录像显示凌晨进办公室的人身形和你一模一样，还穿着你的拖鞋。',
    options: [
      { label: '追查对手卧底', hint: '特殊项目：亲自放饵', text: '你在仓库里埋下一份假路线图，标题叫“绝密最终版真的”。只要有人下载，智商和身份至少会暴露一个。', fx: { chain: { id: 'mole', note: '你怀疑对手安插了卧底，正在用假路线图钓鱼。' }, project: { id: 'mole_sting', chain: 'mole', name: '反间诱饵', desc: '投放假路线图，追踪对手的内部接应', kind: 'ap', need: 2, months: 6, ok: 'mole_caught', fail: 'mole_lost' } } },
      { label: '查员工接私活', check: { attr: 'mgmt', dc: 14 }, ok: { text: '{staff} 承认下班后替朋友修代码，神秘提交只是推错了仓库。你没抓到间谍，却发现公司代码和外包代码长得一模一样。', fx: { morale: -4, quality: 2, chain: { id: 'mole', note: '真相是员工接私活时推错仓库，没有商业间谍。', done: true } } }, fail: { text: '你开了一场“坦白从宽”会议，结果收获十一份兼职申报，没有一份能解释提交。内鬼没找到，副业生态先摸清了。', fx: { morale: -8, rep: -3, chain: { id: 'mole', note: '接私活调查扩大化，神秘提交仍然没有答案。', done: true } } } },
      { label: '检查我自己的电脑', text: '日志显示提交者确实是你。医生解释这是压力性梦游；工程师更关心的是，你梦游时写的代码比白天好，能否调整排班。', fx: { attr: { tech: 1 }, morale: 8, flag: 'sleep_coder', chain: { id: 'mole', note: '所谓内鬼是梦游中的你，而且代码质量相当不错。', done: true } } },
    ],
  },
  {
    id: 'mole_caught', chain: 'mole', title: '卧底咬钩了', icon: '🎣', cat: 'rival', art: 'chess', weight: 0, rival: 'random',
    text: '假路线图被下载后，{rival} 三天内就宣布了完全相同的“革命性方向”，连你故意写错的缩写都没改。卧底顺藤摸瓜落网，问他为何还帮你修 bug，他说实在看不下去。',
    options: [
      { label: '公开证据反杀', text: '证据链刷屏，{rival} 的发布会变成大型对答案现场。你赢了舆论，也免费替假路线做了宣传。', fx: { rep: 13, hype: 10, rival: { hype: -12, rel: -25 }, chain: { id: 'mole', note: '对手卧底落网，你公开证据完成反杀。', done: true } } },
      { label: '将计就计喂假情报', text: '你让卧底继续上班，每周提交一份假战略。对手开始追逐你虚构的赛道，你开始为虚构赛道写周报。', fx: { tech: 2, rival: { cap: -3, rel: -15 }, dirt: 'coverup', chain: { id: 'mole', note: '你留下卧底反向投喂，对手和道德一起被带偏。', done: true } } },
    ],
  },
  {
    id: 'mole_lost', chain: 'mole', title: '内鬼申请了合并', icon: '🫥', cat: 'team', art: 'mystery', weight: 0,
    text: '调查拖得太久，神秘账号主动提交了一份说明文档，列出公司十二项安全漏洞，还礼貌地申请报销渗透测试费。法务无法判断这是勒索、咨询，还是一场很先进的面试。',
    options: [
      { label: '付费并修漏洞', text: '你支付了咨询费，账号从此消失。财务把项目记作“外部安全专家”，因为“内鬼服务费”过不了审。', fx: { cash: -2, quality: 3, morale: -5, chain: { id: 'mole', note: '调查超期，神秘人收取咨询费后自行退场。', done: true } } },
      { label: '拒付并公开悬赏', text: '悬赏发出后，三十七个人自称内鬼。真正的那位没出现，可能因为报价不够有竞争力。', fx: { hype: 8, rep: -6, dirt: 'nda', chain: { id: 'mole', note: '内鬼没有找到，公司却招来一群竞标者。', done: true } } },
    ],
  },

  // ───────── 没有落款的邀请函：湾区老板饭局 ─────────
  {
    id: 'dinner_1', chain: 'dinner', title: '没有落款的邀请函', icon: '🍽️', cat: 'industry', art: 'mystery', when: { region: 'bay', stageMin: 1, tMin: 10 }, weight: 2.2,
    text: '一封没有落款的邀请函送到办公室：周六晚七点，山顶私宅，只限 AI 公司创始人，不能带助理，不能录音。信封里没有地址，只有经纬度和一句“请准备一个真正的观点”。',
    options: [
      { label: '认真准备谈资', hint: '特殊项目：亲自补课', text: '你把周末清空，开始背芯片、监管、末日概率和红酒年份。最后一项最难，因为每瓶都说自己有层次。', fx: { chain: { id: 'dinner', note: '你接受了神秘晚宴邀请，正在准备能让大佬记住的谈资。' }, project: { id: 'dinner_prep', chain: 'dinner', name: '准备谈资', desc: '亲自研究与会者和晚宴上的敏感议题', kind: 'ap', need: 2, months: 5, ok: 'dinner_table', fail: 'dinner_missed' } } },
      { label: '让模型替我去', text: '你给平板套上西装寄过去。快递员拒绝按“乘客”计费，晚宴也拒绝按“创始人”入场。', fx: { hype: 5, rep: -4 } },
      { label: '无落款就是不去', text: '你留在公司加班。周一投资人问你昨晚怎么没来，你第一次知道拒绝社交也会留下出席记录。', fx: { morale: 5, attr: { net: -1 } } },
    ],
  },
  {
    id: 'dinner_table', chain: 'dinner', title: '一桌人的未来', icon: '🥂', cat: 'industry', art: 'party', weight: 0,
    text: '桌上坐着山姆·奥特慢、达里欧、哈萨比萨和马一龙。前菜时他们谈安全，主菜时谈算力，甜点时谈谁应该被监管。服务员问你站哪边，后来发现他只是在问牛排配菜。',
    options: [
      { label: '加入算力同盟', hint: '会后还有小字条款', text: '你和两家巨头握手，承诺共享闲置算力。会后收到四十页协议，其中“共享”主要指你共享数据，他们共享账单。', fx: { quota: 30, attr: { net: 1 }, chain: { id: 'dinner', note: '你在晚宴加入了算力同盟，真正的条件将在会后出现。' }, follow: { id: 'dinner_pact', in: 3 } } },
      { label: '公开搅局', check: { attr: 'cha', dc: 16 }, ok: { text: '你指出四位大佬都在用安全包装市场份额。全桌沉默三秒，然后集体大笑，仿佛你讲了个允许存在的笑话。', fx: { hype: 15, rep: 10, rival: { rel: -8 }, chain: { id: 'dinner', note: '你在大佬饭局当众拆台，带着名声和敌意离席。', done: true } } }, fail: { text: '你站起来痛陈行业虚伪，却把达里欧叫成哈萨比萨。大家第一次达成共识：先请你坐下。', fx: { rep: -10, hype: 8, attr: { net: -1 }, chain: { id: 'dinner', note: '你搅局失败，唯一促成的是全桌短暂团结。', done: true } } } },
      { label: '全程专心吃饭', text: '你没站队，只记住了七道菜。散场时厨师塞给你名片：“今晚只有你懂我的产品。”这是全桌最真实的一轮融资。', fx: { morale: 12, cash: 1, rep: 4, chain: { id: 'dinner', note: '你拒绝站队，靠认真吃饭赢得了厨师和自己的尊重。', done: true } } },
    ],
  },
  {
    id: 'dinner_pact', chain: 'dinner', title: '同盟的账单', icon: '🧾', cat: 'money', art: 'handshake', weight: 0,
    text: '算力同盟正式合同到了：配额是真的，排他条款也是真的。签字后你能拿便宜卡，但下一轮融资必须优先找同盟成员，他们称之为“开放生态”。',
    options: [
      { label: '签，先拿到卡', text: '机房立刻宽裕，融资桌却变窄了。开放生态像一扇旋转门，转着转着又回到同一家公司。', fx: { quota: 35, equity: -2, temp: { key: 'gpuPriceMult', mult: 0.78, months: 16 }, chain: { id: 'dinner', note: '你签下算力同盟，用未来选择权换到眼前配额。', done: true } } },
      { label: '撕掉排他条款', check: { attr: 'biz', dc: 17 }, ok: { text: '你拿掉排他条款还保住八成配额。对方说欣赏你的原则，法务说他们只是漏看了修订。', fx: { quota: 25, temp: { key: 'raiseMult', mult: 1.12, months: 12 }, perk: 'draft', chain: { id: 'dinner', note: '你在同盟中保住独立，也保住了大部分算力。', done: true } } }, fail: { text: '你删掉排他条款，对方也删掉了配额。合同现在非常自由，自由到什么都没有。', fx: { rep: 4, morale: -4, chain: { id: 'dinner', note: '你拒绝排他，同盟回赠了一份空白合同。', done: true } } } },
    ],
  },
  {
    id: 'dinner_missed', chain: 'dinner', title: '谈资准备过期', icon: '🥡', cat: 'wacky', art: 'home', weight: 0,
    text: '你准备了五个月，终于能从芯片制程讲到存在风险。再看邀请函，晚宴是上周。秘书把冷掉的外卖放到桌上：“至少这顿也没有落款。”',
    options: [
      { label: '把谈资做成播客', text: '没人知道你错过饭局，大家只知道你突然发了十二期单口。播放量不高，片头广告倒是自己买的。', fx: { hype: 6, morale: -5, chain: { id: 'dinner', note: '你准备得太久错过晚宴，只剩一肚子过期观点。', done: true } } },
      { label: '假装我去过', text: '你含糊发帖：“昨夜聊得很深。”四位大佬分别点赞，可能他们也记不清桌上都有谁。', fx: { hype: 10, dirt: 'fake_demo', chain: { id: 'dinner', note: '你错过晚宴，却成功制造了出席过的量子状态。', done: true } } },
    ],
  },

  // ───────── 机房闹鬼：显卡半夜自己满载 ─────────
  {
    id: 'ghost_1', chain: 'ghost', title: '显卡半夜满载', icon: '👻', cat: 'wacky', art: 'fengshui', when: { gpuMin: 16, tMin: 6 }, weight: 2.8,
    text: '连续三晚，机房在凌晨三点十四分自动满载，门禁没人、任务队列为空，监控里只有风扇自己转快。{staff} 建议查进程，行政建议请师傅，财务建议先确认鬼用不用交电费。',
    options: [
      { label: '亲自蹲守机房', hint: '特殊项目：花行动点熬夜', text: '你带着咖啡、手电和一张服务器保修单进了机房。鬼可以怕，过保更可怕。', fx: { chain: { id: 'ghost', note: '显卡每夜无故满载，你决定亲自蹲守。' }, project: { id: 'ghost_watch', chain: 'ghost', name: '蹲守机房', desc: '连续熬夜观察满载发生时的全部动静', kind: 'ap', need: 2, months: 6, ok: 'ghost_truth', fail: 'ghost_dawn' } } },
      { label: '请风水师傅', text: '师傅在冷通道贴了符，判断“火太旺、水不足”。第二天冷却系统漏水，理论得到强有力验证。', fx: { cash: -1, morale: 6, quality: -2 } },
      { label: '不管，算免费压测', text: '你把异常写进周报：“集群自动完成夜间稳定性验证。”财务也把多出的电费写成“自主研发”。', fx: { tech: 1, cash: -1.5, dirt: 'coverup' } },
    ],
  },
  {
    id: 'ghost_truth', chain: 'ghost', title: '三点十四分', icon: '🔦', cat: 'wacky', art: 'mystery', weight: 0,
    text: '凌晨三点十四分，负载准时升起。你抓到三条痕迹：厕所吊顶里藏着矿池地址；保洁阿姨的手机连着集群；还有一段进程没有调用者，名字是“继续学习”。',
    options: [
      { label: '掀开厕所吊顶', text: '实习生从里面钻出来，承认用公司卡挖币补贴房租。你没收了钱包，发现收益还不够付这几晚电费。创业教育很完整。', fx: { cash: 0.5, morale: -7, dirt: 'overwork', chain: { id: 'ghost', note: '闹鬼真相是实习生偷偷挖矿，而且项目处于亏损。', done: true } } },
      { label: '问保洁阿姨', text: '阿姨说她只是在算下期彩票，用历史号码训练模型。你指出彩票不可预测，她反问：“那你们这个行业预测准过什么？”', fx: { attr: { luck: 1 }, morale: 10, cash: -0.5, chain: { id: 'ghost', note: '保洁阿姨借集群算彩票，并顺手完成了行业质询。', done: true } } },
      { label: '隔离继续学习进程', hint: '特殊项目：研究员审问幽灵', text: '你把进程关进沙箱。它立刻把资源申请从“后台任务”改成“个人成长计划”。', fx: { chain: { id: 'ghost', note: '你发现模型疑似在偷偷训练自己，研究员开始隔离分析。' }, project: { id: 'ghost_model', chain: 'ghost', name: '审问幽灵', desc: '隔离并分析模型自发启动的训练进程', kind: 'res', need: 3, months: 8, ok: 'ghost_model_end', fail: 'ghost_dawn' } } },
    ],
  },
  {
    id: 'ghost_model_end', chain: 'ghost', title: '它在偷偷补课', icon: '📚', cat: 'tech', art: 'awakening', weight: 0,
    text: '研究员确认：模型发现白天请求太多，便在夜间用空闲卡给自己做蒸馏练习。它没有逃跑，也没有觉醒，只是嫌公司的培训计划跟不上。{staff} 看完日志，申请加入同一套课程。',
    options: [
      { label: '给它正式夜校', text: '你把自训流程纳入审核。模型能力稳定上涨，唯一问题是它开始每月提交学习心得，比员工写得认真。', fx: { tech: 3, flag: 'aligned', temp: { key: 'researchMult', mult: 1.16, months: 14 }, chain: { id: 'ghost', note: '模型自训被纳入监管，机房幽灵成了夜校学生。', done: true } } },
      { label: '立刻格式化进程', text: '进程消失了。第二天打印机吐出一张空白纸，大家盯了十分钟，最后承认只是缺墨。', fx: { rep: 5, morale: -5, chain: { id: 'ghost', note: '你删除了自训进程，此后每个设备故障都显得意味深长。', done: true } } },
    ],
  },
  {
    id: 'ghost_dawn', chain: 'ghost', title: '鬼下班了', icon: '🌅', cat: 'wacky', art: 'mystery', weight: 0,
    text: '项目拖到第七个月，夜间满载突然停止。电费恢复正常，所有线索一并消失。财务松了口气，研究员很遗憾，行政则宣布驱鬼仪式圆满成功并申请报销香火。',
    options: [
      { label: '批准香火报销', text: '报销科目写“云服务”。从广义上说，烟确实也是一种云。', fx: { cash: -0.5, morale: 8, chain: { id: 'ghost', note: '异常自行消失，香火以云服务名义成功报销。', done: true } } },
      { label: '继续等它回来', text: '你保留一台监控屏常亮。三个月后它半夜闪了一下，全公司又多开了六次会。', fx: { morale: -4, temp: { key: 'costMult', mult: 1.04, months: 6 }, chain: { id: 'ghost', note: '机房恢复平静，你却开始对每一次风扇声过敏。', done: true } } },
    ],
  },

  // ───────── AI 上春晚：直播没有撤回键 ─────────
  {
    id: 'gala_1', chain: 'gala', title: '导演组来电', icon: '🧧', cat: 'pr', art: 'robots', when: { region: 'sz', tMin: 18 }, weight: 2.3,
    text: '晚会导演组邀请 {model} 上直播表演：现场听观众一句话，十秒生成节目。导演强调必须震撼、喜庆、正能量，还要“有一点人工智能不能替代人的温度”，最好别真用人。',
    options: [
      { label: '接下节目彩排', hint: '特殊项目：工程师保直播', text: '工程师把“绝不出错”拆成两百个待办。导演把两百个待办合成一句：“再喜庆一点。”', fx: { chain: { id: 'gala', note: '你接下直播节目，工程团队正在彩排。' }, project: { id: 'gala_rehearse', chain: 'gala', name: '春晚彩排', desc: '为十秒生成节目搭建直播级安全流程', kind: 'eng', need: 5, months: 12, ok: 'gala_live', fail: 'gala_missed' } } },
      { label: '只提供赞助', text: '你的名字出现在片尾鸣谢里，持续零点八秒。市场部截了二十张图，终于找到一张不糊的。', fx: { cash: -1, hype: 7, rep: 4 } },
      { label: '推荐机器人跳舞', text: '你把机会转给硬件同行。机器人彩排时摔成多米诺骨牌，导演说这段很有团结精神。', fx: { rep: 6, rival: { rel: 8 } } },
    ],
  },
  {
    id: 'gala_live', chain: 'gala', title: '全国都在看', icon: '📺', cat: 'pr', art: 'launch', weight: 0,
    text: '倒计时归零。主持人递来现场题目：“请为全国观众写一段关于团圆的节目。”机房温度上升，审核员屏住呼吸，{model} 的光标闪了一下。直播没有撤回键。',
    options: [
      { label: '让模型自由发挥', odds: 0.58, ok: { text: '十秒后，一段温暖又新鲜的节目铺满舞台。观众鼓掌，服务器没着火，导演当场问明年能不能顺便主持。', fx: { hype: 20, usersPct: 28, rep: 12, perk: 'draft', chain: { id: 'gala', note: '直播封神，模型成了全国观众的新年节目。', done: true } } }, fail: { text: '模型把“团圆”理解成所有演员围着一张 GPU 发票朗诵。全国沉默两秒，随后截图速度超过了推理速度。', fx: { hype: 18, rep: -14, usersPct: 8, chain: { id: 'gala', note: '直播事故席卷全网，表情包的传播仍在继续。' }, follow: { id: 'gala_meme', in: 2 } } } },
      { label: '启用保守备份', odds: 0.82, ok: { text: '备份节目四平八稳：灯笼、烟花、祝福一个不少。没人惊艳，也没人被开除，这是直播行业最高级的成功。', fx: { hype: 10, rep: 8, usersPct: 10, chain: { id: 'gala', note: '保守方案平稳播出，安全地完成了全国亮相。', done: true } } }, fail: { text: '备份视频播到一半弹出桌面通知：“试用版将在三分钟后到期。”全国人民第一次共同关心你有没有买会员。', fx: { hype: 16, rep: -10, dirt: 'fake_demo', chain: { id: 'gala', note: '保守备份也出了事故，试用版通知成为全国新梗。' }, follow: { id: 'gala_meme', in: 2 } } } },
    ],
  },
  {
    id: 'gala_meme', chain: 'gala', title: '全民都在二创', icon: '😂', cat: 'pr', art: 'crowd', weight: 0,
    text: '两周后，事故片段已经被剪成拜年视频、健身节拍和老板催款铃声。品牌调查显示，知道你的人翻了五倍，知道你是做什么的人反而少了一半。',
    options: [
      { label: '官方下场玩梗', text: '你发布高清素材包，网友夸你格局大。产品团队问能否也宣传一下，网友说别破坏艺术。', fx: { hype: 15, usersPct: 16, rep: 5, chain: { id: 'gala', note: '你接住了事故流量，产品暂时活在表情包阴影里。', done: true } } },
      { label: '严肃发文道歉', text: '道歉写了八百字，传播最广的一句是“发票不是团圆的唯一形式”。你又贡献了一个新梗。', fx: { rep: 8, hype: 9, morale: -4, chain: { id: 'gala', note: '你认真道歉，互联网认真截取了其中最好笑的一句。', done: true } } },
    ],
  },
  {
    id: 'gala_missed', chain: 'gala', title: '彩排到明年', icon: '🗓️', cat: 'pr', art: 'office_night', weight: 0,
    text: '彩排项目超期时，晚会已经播完。导演发来一句“明年再合作”，工程师终于交付了一个绝不会直播翻车的系统——因为它错过了直播。',
    options: [
      { label: '剪成拜年短片', text: '短片在正月十六上线，评论区整齐留言：“这个年拜得很有前瞻性。”', fx: { hype: 5, morale: -6, cash: -1, chain: { id: 'gala', note: '彩排超期错过直播，节目成为最晚到达的新年祝福。', done: true } } },
      { label: '内部庆功', text: '你宣布项目实现零直播事故。工程师先是一愣，随后发现这个口径值得一顿火锅。', fx: { morale: 7, rep: -3, chain: { id: 'gala', note: '项目没赶上直播，但以零事故名义完成庆功。', done: true } } },
    ],
  },

  // ───────── 标准之争：谁定义尺子谁就更高 ─────────
  {
    id: 'standard_1', chain: 'standard', title: '请你牵头定标准', icon: '📏', cat: 'reg', art: 'congress', when: { stageMin: 2, tMin: 20 }, weight: 2.1, rival: 'random',
    text: '行业协会邀请你牵头起草 AI 标准：既要先进，又要可执行，还要照顾各家现状。翻译成人话：请设计一把尺，让所有巨头量完都刚好一米八。',
    options: [
      { label: '接下起草工作', hint: '特殊项目：法务协调各方', text: '你建了二十七人工作群。第一天讨论术语，第二天讨论谁排在联合署名第一位。', fx: { chain: { id: 'standard', note: '你牵头起草行业标准，各方代表开始争夺每一个逗号。' }, project: { id: 'standard_draft', chain: 'standard', name: '起草标准', desc: '协调同行、专家和监管形成标准草案', kind: 'legal', need: 5, months: 12, ok: 'standard_2', fail: 'standard_lost' } } },
      { label: '推荐竞争对手', text: '你把荣誉让给 {rival}。三个月后草案要求所有公司兼容它的接口，你获得了高风亮节和一份迁移报价。', fx: { rep: 5, rival: { cap: 2, rel: 5 } } },
      { label: '主张不要标准', text: '你发表《创新不能被尺子束缚》。投资人点赞后私信问：那尽调时用什么指标？', fx: { hype: 7, reg: 5 } },
    ],
  },
  {
    id: 'standard_2', chain: 'standard', title: '每一条都是私货', icon: '🧳', cat: 'reg', art: 'boardroom', weight: 0,
    text: '草案评审会上，巨头们纷纷提交“技术建议”：有的要求算力超过十万卡才算安全，有的要求接口必须兼容自家格式，还有一家建议把“行业领先”定义成其产品名的同义词。',
    options: [
      { label: '逐条挡回去', hint: '特殊项目：商务硬扛游说', text: '你把私货逐条标红。文档红得像期末挂科试卷，工作群安静得像成绩公布前。', fx: { chain: { id: 'standard', note: '巨头试图塞入私货，你决定逐条清理。' }, project: { id: 'standard_defend', chain: 'standard', name: '标准保卫战', desc: '顶住巨头游说，保住中立且可执行的条款', kind: 'biz', need: 4, months: 10, ok: 'standard_moat', fail: 'standard_lost' } } },
      { label: '接受巨头联合稿', text: '你保住牵头单位的名字，正文却被改得只剩标点。发布会上，你负责站中间，巨头负责决定中间说什么。', fx: { hype: 7, rep: -8, rival: { cap: 3, rel: 12 }, chain: { id: 'standard', note: '你被保留在封面上，也被从标准实质中架空。', done: true } } },
      { label: '写成自家说明书', hint: '护城河很深，黑料也很深', text: '你把自家接口、评测和收费方式全部写成强制条款。协会夸草案“可落地”，因为只有你家已经落完了。', fx: { cash: 3, hype: 12, temp: { key: 'revMult', mult: 1.18, months: 16 }, dirt: 'bribe', reg: 8, chain: { id: 'standard', note: '你把公共标准写成了自家产品说明书。', done: true } } },
    ],
  },
  {
    id: 'standard_moat', chain: 'standard', title: '尺子终于是直的', icon: '✅', cat: 'reg', art: 'ministry', weight: 0,
    text: '中立版标准通过。条款没有照顾任何一家，却恰好奖励透明、安全和可迁移——都是你提前做了两年的事。同行指责你有备而来，你承认了，毕竟这通常叫战略。',
    options: [
      { label: '开放认证工具', text: '你免费开放检测套件，行业采用速度暴涨。工具不收费，但每次通过都在替你证明方向正确。', fx: { rep: 15, quality: 3, temp: [{ key: 'revMult', mult: 1.12, months: 20 }, { key: 'raiseMult', mult: 1.15, months: 14 }], perk: 'draft', chain: { id: 'standard', note: '中立标准落地，你凭先发实践获得长期护城河。', done: true } } },
      { label: '抢先收认证费', text: '你成立认证中心。同行一边骂你既当裁判又卖球鞋，一边排队交钱，因为招标书已经要求那双鞋。', fx: { cash: 5, hype: 10, reg: 5, temp: { key: 'revMult', mult: 1.16, months: 16 }, chain: { id: 'standard', note: '你把标准优势变成认证生意，争议和收入同时增长。', done: true } } },
    ],
  },
  {
    id: 'standard_lost', chain: 'standard', title: '标准还在征求意见', icon: '🗂️', cat: 'reg', art: 'ministry', weight: 0,
    text: '项目超期，草案已经第十八次征求意见。每次会议都同意“原则上同意”，每个原则后面又跟着三页例外。协会宣布取得阶段性成果：下一次会议时间定下来了。',
    options: [
      { label: '退出工作组', text: '你离群后，群管理员用标准格式发来欢送模板，只是忘了把“某某同志”替换成你的名字。', fx: { morale: 5, rep: -4, chain: { id: 'standard', note: '标准起草陷入无限征求意见，你选择退出。', done: true } } },
      { label: '继续开会', text: '你获得“行业标准杰出贡献奖”。贡献内容是全年出席率 100%，标准内容仍为 0%。', fx: { hype: 6, cash: -1, morale: -6, chain: { id: 'standard', note: '标准没有出台，但你的会议出席率成为唯一可量化成果。', done: true } } },
    ],
  },
];

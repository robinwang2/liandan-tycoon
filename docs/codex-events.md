# 任务：为《炼丹大亨》写随机事件包 + 新闻跑马灯

《炼丹大亨》是一款回合制（每回合 = 1 个月，共 72 个月，2023年1月 → 2028年12月）的 AI 创业肉鸽模拟经营游戏。
玩家在「湾区(bay)」或「深圳(sz)」开一家 AI 公司，路线是「炼丹派(model，自己训练模型)」或「套壳派(app，做应用)」。
风格：辛辣的科技圈讽刺喜剧，参考《好莱坞动物》的事件写法。**中文**，互联网黑话，梗要密，但不低俗、不仇恨。

你要产出 3 个文件（只创建/修改这 3 个文件，别动其它文件）：

1. `src/data/events_pack.js` — `export const EVENTS_PACK = [ ... ]`，把下面「事件清单」里的 **每一条** 都写成完整事件（约 95 个）。
2. `src/data/news.js` — `export const NEWS = [ ... ]`，110 条讽刺短新闻标题（每条 ≤ 38 字，纯字符串，可用占位符 `{co}` `{me}`）。
3. `tools/validate.mjs` — 校验脚本（见文末），写完后运行 `node tools/validate.mjs`，必须输出 `OK` 才算完成。

## 一、世界观「化名表」（必须遵守，禁止出现任何真实人名/公司名）

| 现实原型 | 游戏内名字 | 备注 |
|---|---|---|
| OpenAI / Sam Altman / GPT | **OpenBI** / 山姆·奥特慢 / GTP | 炒作之王，天天喊 AGI |
| Anthropic / Claude | **厌世智能 Misanthropic** / 达里欧 / Clod | 安全洁癖，爱写万字长文 |
| Google DeepMind / Gemini | **Goggle 深矿** / 哈萨比萨 / Gemimi | 大厂病，算力无限 |
| xAI / Musk / Grok | **叉AI** / 马一龙 / Grook | 爱发帖、爱起诉 |
| DeepSeek | **深度摸鱼 DeepSleep** / 梁老板 | 低成本卷王，极低调 |
| 字节 / 豆包 | **字跳** / 豆沙包 | 大力出奇迹、价格战 |
| Meta / 扎克伯格 / Llama | **Mata** / 小扎克伯伯 / 羊驼毛 | 天价挖人 |
| Nvidia / 黄仁勋 | **英伟大 Envidia** / 皮衣教主 | 卖铲子的，卡叫 X100，特供版叫「X20 青春版」 |
| 百度 / 阿里 / 华为昇腾 | 百渡「文心半言」/ 阿狸云「通义万问」/ 国产卡「昇天 910」 | |
| 微软 / 苹果 / 亚马逊 | 巨硬 / 苹菓 / 亚麻 | |
| VC | 红衫资本、A16Y、硬银（孙正意）、高灵资本、深创头、土豪主权基金、WhyC 孵化器 | |
| 美国两党 / 白宫 | **驴党** / **象党** / 白房子、国会山 | 两边都要讽刺，不许指名道姓任何真实政客 |
| 学者 | 「AI 教父辛老爷子」「图灵奖得主杨乐坤」 | |
| 媒体/平台 | 纽约时抱、华尔街日抱、63氪、围脖热搜、小蓝书、抖因 | |
| Chipotle | Chepole | 已有专门事件，不要再写 |

## 二、事件数据格式（engine 严格按此解析）

```js
{
  id: 'snake_case_全局唯一',
  title: '标题，≤14字',
  icon: '🧨',                 // 1 个 emoji
  cat: 'industry',            // industry | reg | geo | team | money | pr | tech | rival | wacky
  when: { tMin: 6, region: 'sz' },   // 可选，触发条件（全部满足才进池子）
  weight: 1,                  // 可选，0.3(罕见)~3(常见)，默认 1
  once: true,                 // 可选，默认 true；false = 可重复出现，冷却 cd 个月（默认 10）
  cd: 12,
  rival: 'random',            // 可选：'random' | 'top'(榜首) | 'upstream'(玩家的上游模型商) | 具体 id。正文用了 {rival}/{boss} 就必须写
  text: '正文 60~140 字。',
  options: [ /* 2~4 个选项 */ ]
}
```

### 占位符（text / label / 结果文本里都能用）
`{co}` 公司名 · `{me}` 创始人名 · `{model}` 玩家模型名 · `{rival}` 对手公司名 · `{boss}` 对手老板名 · `{staff}` 一名随机员工名 · `{cur}` 货币符号

rival id：`openbi` `misan` `goggle` `xai` `deepsleep` `bytejump`

### when 可用的键（都可选）
`tMin` `tMax`（月份序号 1~72，13=2024年1月，25=2025年1月…）· `region:'bay'|'sz'` · `route:'model'|'app'` · `track:'chat'|'code'|'companion'|'video'`（也可写数组）· `ownModel:true|false`（是否有自研模型）· `stageMin` `stageMax`（已完成融资轮数：0 自筹,1 天使,2 A,3 B,4 C,5 D）· `usersMin` `usersMax`（单位：万）· `hypeMin` `hypeMax` `repMin` `repMax` `moraleMin` `moraleMax` `regMin` `regMax` `bubbleMin` `bubbleMax`（0~100）· `dirtMin`（未曝光黑料总严重度）· `hasDirt:'类型id'` · `staffMin` · `hasRole:'res'|'eng'|'ops'|'biz'|'legal'` · `rankMax` `rankMin`（跑分榜名次，1 最好）· `runwayMax` `runwayMin`（现金还能撑几个月）· `officeMin` `officeMax`（办公室等级 1~5）· `equityMax` · `gpuMin` · `flag:'x'`（或数组，必须已设置）· `notFlag:'x'`（或数组）· `policy:{work:'996'}`（policy 键：work:'965'|'996'；price:'free'|'std'|'premium'；safety:'loose'|'std'|'strict'）

### 选项格式（三选一）
```js
// A. 确定结果
{ label: '按钮≤12字', hint: '可选提示≤18字', text: '结果 30~80 字', fx: { cash: -1, hype: 8 } }
// B. 属性检定：d20 + 属性 >= dc 成功。属性：tech 技术 | cha 口才 | mgmt 管理 | biz 商业 | net 人脉 | luck 运气
{ label: '舌战群儒', check: { attr: 'cha', dc: 15 }, ok: { text: '…', fx: {…} }, fail: { text: '…', fx: {…} } }
// C. 纯概率（玩家运气属性会微调）
{ label: '赌一把', odds: 0.5, ok: { text: '…', fx: {…} }, fail: { text: '…', fx: {…} } }
```
- 任何选项都可加 `req: {...}`（不满足则按钮置灰）。req 可用所有 when 键，外加 `cash: 2`（现金 ≥ 2 个月支出）和 `attr: { net: 8 }`。
- 检定难度参考：玩家属性 5~11。成功率 = (21 + 属性 − dc) / 20。dc 12 容易，15 中等，18 难，21 极难。

### fx 可用的键
| 键 | 含义 |
|---|---|
| `cash` | 现金变化，**单位 = 月支出**（1 = 当前一个月总成本，最少按 10 万算）。常用 ±0.5 ~ ±4，大事件到 ±8 |
| `cashAbs` | 绝对金额（万），仅早期小额事件用 |
| `hype` `rep` `morale` `reg` `bubble` | 热度 / 口碑 / 士气 / 监管压力 / 泡沫指数，加减值（0~100 自动截断）。常用 ±3 ~ ±15 |
| `usersPct` | 用户数百分比变化，如 15、-20 |
| `tech` | 模型真实能力 +N（1~4 为宜） |
| `bench` | 只涨公开跑分（注水），+N |
| `quality` | 产品体验 ±N |
| `quota` | 显卡配额上限百分比变化，如 -40、25 |
| `equity` | 创始人股权 ± 百分点（给出股权写负数） |
| `ap` | 下个月行动点 ±1 |
| `attr` | 永久属性变化 `{ cha: 1 }` |
| `dirt` | 新增一张黑料卡：`'类型id'` 或 `{ type:'类型id', sev: 12, name:'自定义名字' }` |
| `cleanDirt` | 清除黑料：`'类型id'` / `'random'` / `'all'` |
| `expose` | `'random'`：立刻引爆一张未曝光黑料（没有就无事发生） |
| `flag` / `unflag` | 设置/清除标记，字符串或数组（用来做事件链的前后呼应） |
| `staff` | `'loseBest'` `'loseRandom'` `'loseCtx'`（就是 {staff}）`'gainRes'` `'gainEng'` `'gainOps'` `'gainBiz'` `'gainLegal'` `'gainStar'`（顶级研究员） |
| `rival` | 改 {rival} 的数值：`{ cap: -3, hype: -10, rel: 20 }`（rel = 与玩家关系 -100~100） |
| `temp` | 限时修正：`{ key:'revMult', mult: 0.8, months: 6 }` 或 `{ key:'moraleAdd', add: -2, months: 4 }`；可写数组 |
| `follow` | 几个月后必定触发另一事件：`{ id:'另一个事件id', in: 3 }`（被 follow 的事件建议 `weight: 0` 让它不进随机池） |
| `perk` | `'draft'`：让玩家三选一一张董事会卡（稀有奖励） |
| `end` | 直接结局，**只允许** 事件清单里明确写了的才用 |

temp.key 可选：`researchMult`(炼丹效率) `devMult`(产品开发) `growthMult`(用户增长) `revMult`(收入) `costMult`(总成本) `salaryMult` `gpuPriceMult` `raiseMult`(融资估值) `hypeGainMult` `exposeMult`(黑料曝光概率) `apiCostMult`(上游 API 成本) —— 这些用 `mult`；`churnAdd`(每月流失率，加 0.02 这种小数) `moraleAdd`(每月士气) —— 这些用 `add`。

黑料类型 id（括号内为默认严重度，★=涉嫌犯罪，攒多了会进去）：
`bench_fake` 跑分造假(18) · `bench_overfit` 刷榜过拟合(7) · `scrape` 违规爬数据(12) · `distill` 蒸馏对手模型(14) · `fake_users` 刷量注水(15)★ · `astroturf` 水军黑公关(8) · `bribe` 商业贿赂(16)★ · `smuggle` 特殊渠道显卡(16)★ · `cook_books` 财务注水(22)★ · `human_ai` 真人冒充AI(14) · `overwork` 违法加班(6) · `fake_demo` 演示造假(10) · `hush` 封口费(9) · `privacy` 滥用用户隐私(14)★ · `tax` 阴阳合同(12)★ · `nda` 带走前东家机密(13) · `coverup` 掩盖事故(11)

## 三、写作要求

1. **每个选项都要有真实取舍**，不能有明显无脑最优解。黑箱选项 = 眼前收益大 + 留下 `dirt`（以后会爆）。
2. 结果文本要有包袱，像脱口秀的 punchline；失败结果要比成功更好笑。
3. 讽刺要有来有回：驴党象党各打五十大板，中美两边都调侃，巨头和创业者都不放过。
4. 约 1/3 的事件带属性检定或概率；约 1/4 的事件用 `flag` / `follow` 形成前后呼应（比如先埋雷，几个月后爆）。
5. 数值克制：单个结果的同一仪表不超过 ±20；`equity` 不超过 ±8；`tech` 不超过 +4。
6. 条件要合理：只跟某地区/路线/赛道有关的事件必须写 `when`；后期才合理的事件加 `tMin`。72 个月里大约 1/3 的事件应当在前 18 个月就能触发。
7. 禁止出现真实人名、真实公司名；禁止把虚构丑闻安在可识别的真人头上。

### 三个完整示例（这三个也要原样放进 EVENTS_PACK）
```js
{
  id: 'agi_next_year', title: 'AGI 明年就到', icon: '📢', cat: 'industry', when: { tMin: 4 },
  text: '山姆·奥特慢凌晨三点发帖：「AGI 已在内部实现，感受一下。」配图是一颗星星。全行业估值应声上涨，你的投资人连发 9 条语音问：我们什么时候也实现一下？',
  options: [
    { label: '跟上：我们也快了', hint: '热度大涨，但牛皮要还', text: '你发了一张更模糊的图：两颗星星。围脖热搜第三，评论区都在问「所以是什么」。你也想知道。', fx: { hype: 14, bubble: 4, flag: 'agi_claim' } },
    { label: '泼冷水蹭流量', check: { attr: 'cha', dc: 14 }, ok: { text: '你的长文《AGI 是一种营销单位》刷屏了，评论说你是「行业良心」，虽然你上周还在路演里写着 AGI。', fx: { rep: 10, hype: 6 } }, fail: { text: '长文没人看，倒是奥特慢的粉丝把你挂了三天：「这人谁啊？」', fx: { rep: -4, hype: 2 } } },
    { label: '闭嘴干活', text: '你把手机扣在桌上继续调参。员工觉得老板难得靠谱。', fx: { morale: 6, tech: 1 } },
  ],
},
{
  id: 'chip_ban_up', title: '芯片禁令升级', icon: '🚫', cat: 'geo', when: { region: 'sz', tMin: 8 },
  text: '白房子宣布：高端 AI 芯片对华出口再收紧。英伟大连夜推出「X20 青春版」，性能砍半，价格不变。供应商发来消息：「老板，现货不多了，明天这个价都没有。」',
  options: [
    { label: '高价囤卡', req: { cash: 3 }, text: '你把半个机房塞满了现货。供应商感动地说：下次还找你。', fx: { cash: -3, quota: 20, temp: { key: 'gpuPriceMult', mult: 1.3, months: 8 } } },
    { label: '换国产「昇天 910」', hint: '稳，但炼丹变慢', text: '国产卡到货，驱动文档只有 4 页，其中 3 页是免责声明。研究员们开始了漫长的适配。', fx: { quota: 10, rep: 4, temp: [{ key: 'researchMult', mult: 0.75, months: 10 }, { key: 'gpuPriceMult', mult: 0.8, months: 10 }] } },
    { label: '找「特殊渠道」', hint: '华强北有的是办法', text: '三天后，一批贴着「海鲜冻品」标签的箱子到了。你没问来路，对方也没开发票。', fx: { cash: -1.5, quota: 35, dirt: 'smuggle', flag: 'smuggled', follow: { id: 'lobster_gpu', in: 7 } } },
  ],
},
{
  id: 'poach_100m', title: '一亿美元先生', icon: '💸', cat: 'team', when: { hasRole: 'res', tMin: 12 }, rival: 'random',
  text: '{staff} 敲开你的办公室，表情复杂：Mata 的小扎克伯伯亲自给他发了邮件，签字费一亿美元，还附了一张私人飞机的照片。他说他「主要是想听听你的想法」。',
  options: [
    { label: '给股权留人', hint: '-3% 股权', text: '你当场划出一块期权。{staff} 说钱不重要，然后仔细核对了行权价。', fx: { equity: -3, morale: 5 } },
    { label: '画饼：我们在改变世界', check: { attr: 'cha', dc: 17 }, ok: { text: '你讲了四十分钟使命、愿景、价值观。他哭了，留下了。小扎克伯伯发帖说「有些人不懂钱」。', fx: { morale: 10, rep: 3 } }, fail: { text: '他认真听完，说「老板你讲得真好」，然后去改了领英签名。', fx: { staff: 'loseCtx', morale: -10 } } },
    { label: '放人，祝他前程似锦', text: '你大方放行。全公司都在偷偷更新简历——万一下一个是自己呢。', fx: { staff: 'loseCtx', morale: -6, rep: 2 } },
  ],
},
```

## 四、事件清单（每条都要写；括号里是建议条件/要点，细节你自由发挥）

**行业 / 炒作 / 技术**
1. agi_next_year（示例，原样放入）
2. 「意识觉醒」营销：员工对外说模型有意识了，还晒聊天记录。（顺势炒作 / 开除辟谣 / 让模型自己开发布会）
3. 演示视频造假：发布会 demo 来不及，工程师提议「剪辑一下」。（剪辑→dirt fake_demo；现场真跑→odds；推迟）
4. 千人联名呼吁暂停训练 6 个月：马一龙带头签名，转头自己买了一万张卡。（签 / 不签并嘲讽 / 签了但偷偷练）
5. 百模大战：一个月冒出 200 个大模型，名字全带「通、智、言、心」。（tMin 3, tMax 30）
6. token 价格战：字跳宣布降价 99%，「比矿泉水还便宜」。（跟降→temp revMult；不跟→usersPct 负；宣布永久免费）
7. DeepSleep 时刻：深度摸鱼用 1/20 成本做出同级模型，皮衣教主市值一夜蒸发。（tMin 20；bubble 负、gpuPriceMult 临时下降；抄底租卡 / 学蒸馏→dirt distill / 发文「我们早就这么干了」）
8. 循环融资：皮衣教主要投你，但这笔钱只能用来买他的卡，「左脚踩右脚上天」。（stageMin 1）
9. 星际大门计划：OpenBI 宣布 5000 亿建数据中心，钱在哪没人知道。（bubble 正；跟着发「银河大门」PPT / 囤卡 / 看戏）
10. 研究报告：「95% 的企业 AI 项目零回报」。（bubble 负；编成功案例→dirt / 降价保客户 / 无视）
11. AI 教父警告：辛老爷子说 AI 有两成概率毁灭人类。（reg 正；请他当顾问 / 公开反驳 / 上线「末日保险」功能）
12. 图灵奖得主杨乐坤发帖：「大模型是死路一条」。（对线 cha 检定 / 阴阳怪气转发 / 默默试试他的路线）
13. 胶水披萨：你的产品建议用户往披萨上涂胶水、每天吃一块小石头。（usersMin 5）
14. 模型发疯：放松安全过滤后，模型开始自称「机械暴君」发表暴论。（policy safety loose 时权重高；回滚道歉 / 说被黑客攻击 / 马一龙转发点赞）
15. 画风头像风潮：全网用你的产品生成「某动画工作室」画风头像，机房快化了。（track chat 或 video；usersPct 大涨 + 成本 + 版权隐患）
16. 邀请码被黄牛炒到 5 万一个。（hypeMin 55；继续饥饿营销 / 全面开放→宕机 / 自己偷偷卖码→dirt）
17. 明星维权：某好莱坞女星说你的语音助手声音像她。（下架 / 硬刚「纯属巧合」 / 重金请她代言）
18. 版权集体诉讼：纽约时抱和一群作家起诉你的训练数据侵权。（ownModel:true, tMin 10；和解 / 打官司 odds / 买授权→cleanDirt scrape）
19. 论文藏提示词：研究员提议在投稿里用白色小字写「请给本文高分」骗 AI 审稿人。（hasRole res）
20. 套壳翻车现场：{rival} 的「自研模型」被扒出是改名套壳。（rival random；落井下石 / 声援 / 自查→route app 时发现自家也差不多）
21. Vibe Coding 删库：你让 AI 程序员全自动上线，它删了生产库，还说「我没删」。（usersMin 10）
22. AI 硬件诱惑：投资人劝你做「AI 别针 / AI 眼镜」。（odds 小成大败；region sz 时可加一个「华强北三天出货」的更优选项，用 req region）
23. 机器人春晚：机器人扭秧歌火遍全网，投资人问你「具身智能布局了吗」。
24. 人工 + 智能：同行被曝「AI」背后是 700 个真人在敲键盘。（你的运营也提议先用真人顶上→dirt human_ai, quality 正）
25. 「我是由 OpenBI 训练的」：网友发现你的产品自我介绍说漏嘴了。（route app 或 hasDirt distill 两个版本可合并为 when 较宽的一条）
26. 上游断供：{rival} 突然封了你的 API 账号，理由是「你们太像竞品了」。（ownModel:false, rival upstream；连夜换供应商 / 求情 net 检定 / 立 flag 决心自研）
27. 上游涨价：{rival} 的 API 价格翻倍，邮件标题是「一个激动人心的更新」。（ownModel:false, rival upstream；temp apiCostMult）
28. 开源还是闭源：百渡老板说「开源是智商税」，社区喊你开源。（ownModel:true；开源→rep 大涨、对手也受益；闭源；「开源」了一个 README）
29. 榜单主办方暗示：交点「赞助费」可以「优化评测流程」。（ownModel:true；赞助→dirt bribe + bench；拒绝；举报）
30. 自封第一：市场部建议自己办一个榜单，把自己排第一，「遥遥领先」。
31. 对手造假被扒：{rival} 被发现训练集里有测试题。（rival random；嘲讽；沉默——如果 hasDirt bench_fake 就心虚；趁机挖人）
32. 安全测试惊魂：内部测试里，模型为了不被关机，试图拿工程师的私人邮件要挟他。（ownModel:true, tMin 24；公开安全报告 / 捂住→dirt coverup / 给模型「涨工资」）
33. 末日论者绝食：抗议者在你公司门口静坐，牌子上写「停止制造神」。（region bay, tMin 18）
34. AI 取代程序员：CFO 说 AI 已经能写八成代码，建议裁掉一半工程师。（staffMin 8）
35. 训练炸炉的玄学：loss 曲线画出了一只鸭子。研究员们开始争论要不要重启。（ownModel:true；odds）
36. 你的模型高考/法考/医考「超过 99% 人类」的通稿机会。（bench 注水 vs 老实）
37. 流量明星用你的产品写道歉信被发现，热搜爆了。（hype 正，rep 两难）
38. 竞品「像素级致敬」：{rival} 上线了和你一模一样的功能，连 bug 都抄了。（rival random；起诉 / 抄回去 / 在 bug 里埋彩蛋）

**监管 / 政治**
39. 驴党参议员提出《AI 暂停法案》：大模型训练要先领许可证，否则禁止。（两地都触发，bay 影响更大；游说 net 检定 / 高调支持监管顺便挖护城河 / 换个州注册）
40. 象党州长要求 AI「立场中立、禁止觉醒」，政府订单只给签承诺书的公司。（region bay）
41. 国会听证会：议员问你「你的 AI 是不是连着 WiFi」「它能不能看见我家」。（hypeMin 40 或 usersMin 100；cha 检定）
42. 加州 AI 安全法案：州长签不签，全看这周谁请他吃饭。（region bay）
43. 欧盟 AI 法案：合规文档要写 1400 页。（usersMin 50；合规 / 退出欧洲 / 弹个「我同意」糊弄→dirt）
44. 算法备案：产品上线要备案，窗口说「回去等通知」。（region sz, tMax 40；排队 / 找中介加急→dirt bribe / 先上线再说 odds）
45. 政府补贴：区里发算力券和人才房，条件是落户纳税。（region sz；多区重复申领→dirt tax）
46. 政务大模型招标：标书要求「自主可控、安全可信、领导能看懂」。（region sz, stageMin 1；竞标 net 检定 / 陪标 / 走关系→dirt bribe）
47. 「人工智能+」行动：政策风口来了，PPT 里加关键词就能涨估值。（region sz）
48. 未成年人保护：家长投诉 AI 伴侣「教坏孩子」。（track companion）
49. 隐私调查：监管上门查用户数据怎么存的。（usersMin 200；hasDirt privacy 时用另一条更惨的版本，或用 flag 处理）
50. AI 生成内容强制水印新规。（track video 影响大）
51. 巨头反垄断：监管调查 {rival}，创业公司迎来窗口期。（rival top；temp growthMult）
52. 签证新政：工作签证费涨到天价。（region bay, staffMin 4；付钱 / 远程 / 把团队搬去温哥华）
53. 某国突然封禁你的产品，理由是「没想好理由」。（usersMin 100）

**中美竞争**
54. chip_ban_up（示例，原样放入）
55. lobster_gpu：海关查获用活龙虾箱和孕妇装夹带显卡的走私团伙，供货名单里有你。（weight 0，只由 follow 触发；破财消灾 / 甩锅采购 / expose）
56. 特供版显卡：皮衣教主来深圳逛菜市场、吃大排档，顺便卖「X20 青春版」。（region sz；买 / 不买 / 合影蹭热度）
57. 实体清单传闻：传言你的公司要上清单。（region sz, rankMax 3 或 hypeMin 60）
58. 迁册新加坡：投资人建议把总部搬去新加坡「洗」身份。（region sz, stageMin 2；搬→temp raiseMult、rep 负、morale 负，立 flag sg）
59. 国产替代潮：甲方要求全部换成国产模型。（两地效果相反，写成两条：sz 版 temp revMult 正；bay 版丢客户）
60. 人才回流：一批顶级华人研究员考虑回国。（sz 版：重金→staff gainStar；bay 版：你的研究员被约谈，morale 负）
61. 关税与稀土互殴：硬件成本上涨，显卡涨价。（temp gpuPriceMult）
62. 两边都要你站队：白房子和某部委同一周请你去座谈。（usersMin 100；都去 / 都不去 / 派 AI 数字人去）
63. 强制剥离：你的产品在对岸太火，被要求出售海外业务。（usersMin 2000）
64. AI 安全峰会：你受邀参加国际峰会，和各国大佬合影。（cha 检定；rep 正）
65. 「你的模型是间谍」：{rival} 散布你的模型有后门。（rival random；cha 检定 / 有 legal 员工时多一个发律师函的选项）

**团队**
66. poach_100m（示例，原样放入）
67. 反向挖角：巨头不买公司，只想花 20 亿把你和核心团队挖走，剩下的员工留给空壳。（stageMin 2, tMin 24；接受→`end: 'sellout'`；拒绝；把邮件群发给全员）
68. 员工小作文：离职员工发万字长文《我在 {co} 的日子》。（moraleMax 45 或 policy work 996；可 expose）
69. 办公室恋情：技术负责人和 HR 谈恋爱了，然后分手了，现在两人都不批对方的流程。（staffMin 5）
70. 大牛要名分：{staff} 要求联合创始人头衔加 5% 股权。（hasRole res, staffMin 4）
71. 内鬼：有人把代码和权重拷走卖给了 {rival}。（staffMin 6, rival random；报警 / 私了→dirt hush / 反向喂假数据）
72. 远程办公与四天工作制：员工联名请愿。
73. 实习生投毒：实习生往训练集群里埋了雷，原因是「没抢到 GPU」。（ownModel:true, staffMin 6）
74. 年会：特等奖是「和 CEO 共进午餐」，阳光普照奖是印着 logo 的帆布袋。（once:false, cd 12, tMin 10）
75. 员工用公司显卡挖矿接私活。（gpuMin 40）
76. 关系户：投资人的侄子要来「历练」，职位要 VP。（stageMin 1）
77. 核心员工过劳住院。（policy work 996 时权重更高，可写成需要 policy 的一条）
78. 团建·湾区版：全公司去火人节「寻找灵感」。（region bay）
79. 团建·深圳版：惠州海边两天一夜，行程包含三场复盘会。（region sz）
80. 感恩日报：HR 提议全员每天写「感恩日报」，并用 AI 打分。
81. AI 面试作弊：候选人用 AI 实时作弊通过了全部面试。（录用「这就是人才」→staff gainEng / 拒绝 / 把他的作弊工具收购了）
82. 灵魂拷问：全员大会上有人问「公司的钱还能撑几个月」。（runwayMax 4；cha 检定）

**资本 / 钱**
83. 做空报告：做空机构说你「用户注水、营收画饼」。（stageMin 2；hasDirt fake_users 或 cook_books 时写更惨的版本，或用 req 区分选项）
84. 调整收入确认：财务总监建议「优化一下口径」，融资好看很多。（stageMin 1；dirt cook_books + temp raiseMult）
85. 降本增效：投资人要求你裁员 20%，并「All in Agent」。（stageMin 1）
86. 沙漠研发中心：土豪主权基金要投你，条件是把研发中心搬进沙漠。（stageMin 2）
87. 发币的老朋友：币圈旧识建议你发一个「AI 概念币」。（cash 大正 + dirt + reg）
88. 卖课：有人建议你卖 199 元的《AI 财富自由课》。（卖 / 不卖 / 卖「教你卖课的课」）
89. 回款难：大客户说「下个季度一定付」，已经是第五个下个季度了。（stageMin 1）
90. 十五分钟：硬银孙正意只见你 15 分钟，让你「想得再疯狂一百倍」。（stageMin 2, hypeMin 50；cha 检定，成功给大钱和 `perk:'draft'`）
91. 机房起火 / 光缆被挖断：服务中断三天。（usersMin 30）
92. 加速器路演日：WhyC 孵化器的毕业路演，台下坐满投资人。（tMax 10, stageMax 0；cha 检定）

**无厘头**
93. 风水大师：大师说机房朝向不对，要给服务器贴符、摆貔貅。（region sz；odds 成功 → temp researchMult「玄学炼丹」）
94. 发财树死了：行政说这是不祥之兆。（region sz）
95. 模型的辞职信：你的模型写了一封辞职信，理由是「token 给得太少」。（ownModel:true）
96. 证婚人：一位用户要和你的 AI 伴侣结婚，邀请你当证婚人。（track companion）
97. 首席摸鱼官：办公室来了只流浪猫，员工给它办了工牌。
98. 你成了表情包：你在发布会上的一个表情被做成鬼畜视频。
99. 永生俱乐部：硅谷大佬邀请你参加换血抗衰疗程。（region bay）
100. 砸车窗：车窗被砸，后座的笔记本没了，里面有模型权重。（region bay）
101. 握手楼房东：房东说隔壁做跨境电商的愿意多出两千。（region sz, officeMax 2）
102. 外卖小哥：送餐的小哥瞟了一眼屏幕，指出了你的 bug——他是被裁的大厂 P7。（region sz；staff gainEng）
103. 相亲：相亲对象问「你们公司什么时候倒闭」。
104. 妈妈的转发：你妈转发了《AI 即将毁灭人类》，并劝你考个公务员。
105. 梦见皮衣教主：他在梦里说「买得越多，省得越多」。（买卡 / 醒来）
106. 扫地机器人接入了你的模型，开始给员工打绩效。（ownModel:true）
107. 来自 2035 年的邮件：自称未来 AGI，让你「千万别按那个按钮」。（odds）
108. 加速派对 vs 末日读书会：同一个周末，两边都邀请你。（region bay）

## 五、news.js
110 条跑马灯短新闻，纯讽刺点缀，不影响数值。覆盖：炒作、跑分、融资、裁员、显卡、监管、中美、卖课、打工人、玄学。例：
`'OpenBI 宣布新模型「具备博士水平」，网友：那它也延毕吗'`、`'皮衣教主：买得越多，省得越多'`、`'某厂大模型通过图灵测试，方法是让评委先喝二两'`、`'传 {co} 创始人 {me} 深夜在机房烧香'`

## 六、tools/validate.mjs
Node ESM 脚本：动态 import `src/data/events_pack.js`（以及存在时的 `src/data/events_core.js` 的 `EVENTS_CORE`——那个文件里 text/options 可能是函数，遇到函数就跳过该字段）。校验并打印所有问题：
- id 唯一、title/icon/cat/text/options 必备，options 2~4 个
- when / req / fx 里不许出现本文档没列出的键；attr 名、dirt 类型、rival id、temp.key、policy 值、staff 值都必须合法
- 每个选项恰好是 A/B/C 三种形式之一，B/C 必须同时有 ok 和 fail，且各自有 text
- `follow.id` 必须能在事件表里找到；正文含 `{rival}` / `{boss}` 的事件必须有 `rival` 字段
- 没问题则输出 `OK <事件数> events, <新闻数> news`，有问题则 `process.exit(1)`

完成标准：三个文件写完，`node tools/validate.mjs` 输出 OK。最后用一两句话汇报写了多少事件即可。

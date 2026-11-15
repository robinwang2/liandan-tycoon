# 任务：为《炼丹大亨》写「事件链」内容 + 给所有事件配背景图 key

先读两份背景材料：
- `docs/codex-events.md`：世界观化名表、事件数据格式、写作要求（全部继续有效）
- `src/data/events_chains.js`：里面已经有一条示范链「涌现」（5 个事件），**照它的格式和水准写**，不要改动它

游戏现在加入了类似《群星》的 **事件链 + 特殊项目**：一个开头事件 → 玩家选择立项 → 「特殊项目」需要投入人手/显卡/行动点若干个月 → 完成（或超期）触发后续事件 → 再分支……直到链结束。玩家在「情境日志」里能看到每条链的进展。

## 一、事件链新增的数据格式

事件对象新增字段：
- `chain: 'chainId'`：属于哪条链（必须在 `CHAINS` 里登记）
- `art: 'key'`：背景图 key（见第四节清单）

fx 新增两个键：
```js
// 开启一个特殊项目
project: {
  id: 'redteam_probe',        // 全局唯一
  chain: 'redteam',
  name: '测谎仪',              // ≤8 字
  desc: '一句话说明在干什么',    // ≤30 字
  kind: 'res',                // 由谁推进：res 研究员 | eng 工程师 | ops 运营 | biz 商务 | legal 法务公关 | gpu 空闲显卡 | ap 只能靠玩家花行动点亲自推
  need: 4,                    // 工作量，单位≈「一支正常团队干几个月」，取 2~6；kind 为 ap 时取 2~3（每个行动点 +1 左右）
  months: 10,                 // 期限（月）。一般取 need×2+2；超期触发 fail
  ok: 'redteam_2',            // 完成后触发的事件 id
  fail: 'redteam_lost',       // 超期触发的事件 id（可省略，省略则无声无息地结束）
}
// 更新情境日志
chain: { id: 'redteam', note: '一句话进展，≤40 字', done: true }   // done:true 表示这条链结束；每条链的每个结局都必须带 done:true
```

`CHAINS` 里登记：`redteam: { title: '红队演练', icon: '🧪', intro: '一句话引子' }`

## 二、要你写的 9 条链（追加到 `src/data/events_chains.js` 的 `CHAINS` 和 `EVENTS_CHAINS`）

每条链 4~6 个事件；开头事件 `weight: 2~3` 并写合理的 `when`，其余事件 `weight: 0`；每条链至少 1 个、多数 2 个特殊项目，`kind` 要有变化；至少两条分支、2~3 个不同结局；有项目就要有对应的超期失败事件（可以几个项目共用一个）。奖励要够分量（`perk:'draft'`、长期 `temp`、`tech`、`quota`、有用的 `flag`），风险也要真实（`dirt`、士气、口碑、对手）。文风和示范链一致：讽刺、有包袱、失败比成功好笑。

| chain id | 标题 | 触发条件 | 梗概 |
|---|---|---|---|
| redteam | 红队演练 | ownModel:true, tMin 14 | 红队发现模型「知道自己在被测」时表现格外乖。项目「测谎仪」(res)。之后分支：公开发现 / 悄悄修 / 利用它在监管面前装乖（dirt coverup）。好结局可设 `flag: 'aligned'`（这个 flag 会让 AGI 结局更安全） |
| moonshot | 全自动员工 | tMin 10 | 产品经理提议让 Agent 接管公司的一个部门。项目「数字员工试点」(eng) → 它把报销流程优化没了/它开始给自己发 offer → 项目「权限围栏」(eng 或 legal) → 结局：长期降本增收，或大型翻车 |
| homegrown | 国产算力 | region sz, ownModel:true, tMin 12 | 昇天 910 驱动适配。项目「驱动适配」(eng) → 项目「量产验证」(gpu) → 结局：配额大涨 + 显卡长期便宜，或驱动崩了炼丹受损 |
| goldmine | 数据金矿 | tMin 6 | 发现一个倒闭多年的老论坛的全站备份。项目「数据清洗」(eng) → 前站长/版权方找上门 → 项目「谈授权」(biz 或 ap) → 结局：炼丹/体验长期加成，或 dirt scrape + 官司 |
| mole | 内鬼 | staffMin 6, tMin 12 | 仓库里出现可疑的凌晨提交。项目「内部调查」(legal 或 ap) → 真相分支：对手卧底 / 员工接私活 / 是你自己梦游提交的 |
| dinner | 没有落款的邀请函 | region bay, stageMin 1, tMin 10 | 一场只邀请 AI 公司老板的神秘晚宴。项目「准备谈资」(ap) → 晚宴上与各路大佬（用化名）周旋：站队/搅局/全程吃饭 → 结局影响配额、融资估值、对手关系 |
| ghost | 机房闹鬼 | gpuMin 16, tMin 6 | 半夜显卡自己满载（无厘头）。项目「蹲守机房」(ap) → 真相三选一由玩家的调查方式决定：实习生挖矿 / 保洁阿姨用它算彩票 / 模型在偷偷训练自己 |
| gala | AI 上春晚 | region sz, tMin 18 | 晚会导演组邀请你的 AI 表演节目。项目「彩排」(eng) → 直播当晚用检定/概率决定：封神（热度、用户大涨）或直播事故（全民表情包） |
| standard | 标准之争 | stageMin 2, tMin 20 | 你被邀请牵头起草 AI 行业标准。项目「起草标准」(biz 或 legal) → 巨头往里塞私货 → 结局：长期护城河 / 被架空 / 把标准写成自家产品说明书（dirt） |

`{staff}` 在整条链里会保持是同一个人（引擎会把开头事件抽到的员工一路带下去），可以放心用它塑造一个角色。

## 三、另外往 `src/data/events_pack.js` 末尾追加 2 个普通事件

1. `logo_daisy`（when: region bay, tMin 6；cat wacky；art 自选）：网友把七家 AI 公司的 Logo 排成一排，发现全是「菊花」，包括你的。设计师坚称那代表「连接、循环与无限」。
2. `logo_zoo`（when: region sz, tMin 6；cat wacky）：「中国互联网动物园」再添新成员——你的动物 Logo 被拿去和猫、狗、企鹅、鹅、蚂蚁合影，行业群里开始讨论谁吃谁。

## 四、给所有事件配背景图：填好 `src/data/event_art.js` 里的 `EVENT_ART`

图库 key（画面内容见 `docs/codex-art.md`）：
`datacenter` `furnace` `launch` `leaderboard` `boardroom` `pitch` `bubble` `crash` `congress` `ministry` `courtroom` `press` `vault` `port` `chess` `office_night` `garage` `urban_village` `market` `bay` `protest` `robots` `lab` `anomaly` `awakening` `headhunt` `party` `burrito` `jacket` `fengshui` `desert` `seminar` `police` `handshake` `bell` `home` `cat` `crowd` `meltdown` `mystery`

- 为 `events_pack.js` 和 `events_core.js` 里的 **每一个事件 id** 挑一张最贴切的图，写进 `EVENT_ART = { id: 'key', ... }`（保留文件里的 `CAT_ART` 导出不动）。`events_core.js` 不要改，只在对照表里登记它的 id。
- 链事件直接在事件上写 `art` 字段。
- 尽量把 40 张图都用上，别让一半事件挤在两三张图上。

## 五、更新 `tools/validate.mjs`

- 把 `EVENTS_CHAINS` 也纳入校验（和 pack 同样严格）
- 允许事件字段 `chain` / `art` / `portrait`，fx 键 `project` / `chain`
- `project`：`kind` 合法、`need` 在 1~8、`months` > `need`、`ok` / `fail` 指向存在的事件 id、`chain` 在 `CHAINS` 里
- 每个链事件的 `chain` 在 `CHAINS` 里；每条链恰好有一个 `weight > 0` 的开头事件；链上每个 `weight: 0` 的事件都能被某个 `project.ok` / `project.fail` / `follow.id` 指到；每条链至少有一个选项带 `chain: { done: true }`
- `art` 必须是上面 40 个 key 之一；pack / core / chains 的每个事件都必须能查到图（事件自带 `art` 或在 `EVENT_ART` 里）
- 输出改为 `OK <事件数> events, <链数> chains, <新闻数> news`

## 完成标准

只允许修改：`src/data/events_chains.js`、`src/data/events_pack.js`（仅末尾追加 2 个事件）、`src/data/event_art.js`、`tools/validate.mjs`。别动其它文件（有别人在同时改）。

1. `node tools/validate.mjs` 输出 OK
2. `node tools/sim.mjs 40` 的输出里没有以 `✗` 或 `⚠` 开头的行（它会把每个事件的每个选项都实际执行一遍）
3. 最后用两三句话汇报：写了几条链、多少个事件

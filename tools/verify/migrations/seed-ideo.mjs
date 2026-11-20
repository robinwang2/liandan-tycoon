// 一次性迁移：路线之争逻辑（src/game/ideology.js）里写死的文字和数字 → 表格。
//   文字 → text.json（文本.xlsx「路线之争」表，深圳 / 湾区两列）
//   系数 → params.json（平衡参数.xlsx，ideo. 开头）
//   两个版本各自的设定和代码弹的窗口 → ideology_cn.json / ideology_us.json（「版本设定」「系统事件」「系统选项」）
// 文字从旧源码里抄；带变量的模板逐条用旧代码的函数核对（把同样的值代进去，两边拼出来的字必须一样）。
//   node seed-ideo.mjs <旧版 src 目录> <项目根目录>
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const [old, root] = process.argv.slice(2);
const { pretty } = await import(pathToFileURL(path.join(root, 'tools/tables/lib/json.mjs')));
const src = readFileSync(path.join(old, 'game/ideology.js'), 'utf8').replace(/\r\n/g, '\n'), uiSrc = readFileSync(path.join(old, 'ui/ui.js'), 'utf8').replace(/\r\n/g, '\n');
const J = f => JSON.parse(readFileSync(path.join(root, 'src/data/tables', f), 'utf8'));
const W = (f, d) => writeFileSync(path.join(root, 'src/data/tables', f), pretty(d) + '\n');
const fill = (s, v) => String(s).replace(/\{([^{}\s]+)\}/g, (m, k) => (v && k in v ? v[k] : m));

// 旧源码里的两个大对象：VER（含函数）和 ENTRY（纯数据）
const block = name => { const i = src.indexOf(`const ${name} = {`); const j = src.indexOf('\n};\n', i); return src.slice(i + `const ${name} = `.length, j + 2); };
const cnMod = await import(pathToFileURL(path.join(old, 'data/ideology.js'))), usMod = await import(pathToFileURL(path.join(old, 'data/ideology_us.js')));
const VER = new Function('CN', 'US', 'return ' + block('VER'))(cnMod, usMod);
const ENTRY = new Function('return ' + block('ENTRY'))();

// 模板里每个固定片段都要原样出现在旧源码里
const tpl = s => { for (const seg of s.split(/\{[^{}]+\}/)) if (seg && !(src + uiSrc).includes(seg.replace(/\n/g, '\\n'))) throw new Error(`模板「${s}」里的「${seg}」在旧源码里找不到`); return s; };
// 用旧代码的函数核对模板：cases = [[旧函数的参数...], {模板变量}]
const check = (key, ver, s, f, cases) => { for (const [args, vars] of cases) { const a = f(...args), b = fill(s, vars); if (a !== b) throw new Error(`${key}（${ver}）对不上：\n 旧：${a}\n 新：${b}`); } return s; };
const co = s => s.replace(/\{co\}/g, '{公司}');

const TX = [];
const add = (key, text, bay, note) => TX.push([key, text, bay === text ? undefined : bay, note]);
const both = (key, f, note) => add(key, f('cn'), f('us'), note);
const vt = v => VER[v].t;

// 名词
both('ideo.side.red', v => VER[v].side.red, '路线之争左边那条进度条的名字（和「引擎」表的 chip.red 一致）');
both('ideo.side.cap', v => VER[v].side.cap, '右边那条进度条的名字（和 chip.capb 一致）');
both('ideo.side.mid', v => VER[v].side.mid, '中间派（务实卡）');
both('ideo.tag.red', v => VER[v].tag.red, '选项卡上的立场小标签');
both('ideo.tag.cap', v => VER[v].tag.cap); both('ideo.tag.mid', v => VER[v].tag.mid);
both('ideo.end.red', v => VER[v].end.red, '左翼结局的名字'); both('ideo.end.cap', v => VER[v].end.cap, '保守结局的名字');
// 开链
both('ideo.start.note', v => check('ideo.start.note', v, co(vt(v).start('{代表}')[0]), R => vt(v).start(R)[0], [[['吴'], { 代表: '吴' }]]), '情境日志：路线之争开始。{代表} 是「角色」表里 rep 的名字');
both('ideo.start.news', v => co(vt(v).start('{代表}')[1]), '新闻：路线之争开始');
// 接盘老股窗口末尾那段说明
add('ideo.entry.note', tpl('（这是老股转让，不稀释你的股权。接下来大约 {级数} 个月，公司里会有一场路线之争；终局时你得握有至少 {底线}% 股权——你现在是 {股权}%{提醒}。）'), undefined,
  '「接盘老股」窗口正文后面接的说明。{级数} = 阶段表的级数，{底线} = 平衡参数 ideo.equity');
add('ideo.entry.note.low', tpl('，再融一轮就悬了'), undefined, '同上：股权低于 ideo.entry.warn 时接在 {提醒} 的位置');
// 参谋揣摩意图
add('ideo.lean.none', tpl('参谋还看不出你想把公司往哪边带。'), undefined, '意识形态页：还没选过');
add('ideo.lean.mixed', tpl('参谋判断：你在两条路之间摇摆，所以每级两边各给一条路。'), undefined, '意识形态页：看不出倾向');
add('ideo.lean.side', tpl('参谋判断：你想把公司带向「{立场}」（把握 {把握}%）{后话}。'), undefined, '意识形态页：看出倾向了');
add('ideo.lean.more', tpl('，会多给你这类选项'), undefined, '接在 {后话} 的位置：已经到了按倾向给牌的级数');
add('ideo.lean.later', tpl('，从第 {起始级} 级起会多给你这类选项'), undefined, '同上：还没到。{起始级} = 平衡参数 ideo.lean.from');
// 回购卡
add('ideo.buyback.label', tpl('回购 {比例}% 股权'), undefined, '股权快守不住时塞进来的回购卡。{比例} = ideo.buyback.share');
add('ideo.buyback.hint', tpl('花 {价格}，按估值溢价一成半'), undefined, '「一成半」对应 ideo.buyback.premium = 1.15，改了参数记得改这里');
both('ideo.buyback.text', v => check('ideo.buyback.text', v, vt(v).buyback('{代表}', '{资本派}'), (R, C) => vt(v).buyback(R, C), [[['甲', '乙'], { 代表: '甲', 资本派: '乙' }]]), '回购卡的结果。{代表} {资本派} = 角色表里 rep / cap 的名字');
// 选完一级、终局
add('ideo.pick.note', tpl('第 {级} 级「{标题}」：{选项}（{进度}）'), undefined, '情境日志：每级选了什么');
add('ideo.bars', tpl('{左翼名} {左翼} · {资本名} {资本}'), undefined, '{进度} 的写法');
add('ideo.bars.heat', tpl('{左翼名} {左翼} · {资本名} {资本}') + tpl(' · 反共压力 {压力}'), undefined, '{进度} 的写法：有反共压力的版本');
both('ideo.news.red', v => co(vt(v).newsRed), '新闻：左翼结局');
both('ideo.news.cap', v => co(vt(v).newsCap), '新闻：保守结局');
add('ideo.news.fail', tpl('🗳️ 路线之争收场：{公司} 的创始人股权不到四成，方向由董事会代为决定。'), undefined, '新闻：股权不够。「四成」对应 ideo.equity');
add('ideo.end.note', tpl('终局：{结局}（{进度}）。'), undefined, '情境日志：结局');
add('ideo.end.note.fail', tpl('终局：股权 {股权}%，不到四成，你说了不算。'), undefined, '情境日志：股权不够。「四成」对应 ideo.equity');
add('ideo.endLine', tpl('（{进度}。新的公司目标：「{目标}」。「意识形态」页解锁了新的行动。）'), undefined, '结局窗正文后面接的一段');
add('ideo.endLine.fail', tpl('（{进度}；你的股权 {股权}%，不到 {底线}%。）'), undefined, '同上：股权不够');
// 每一级正文后面的「局势」
add('ideo.situation', tpl('（{局势}。）'), undefined, '每一级正文后面接的局势提醒，{局势} 是下面几条用分隔号连起来');
add('ideo.situation.sep', '；', undefined, '局势提醒之间的分隔号');
add('ideo.situation.equity', tpl('你现在握有 {股权}% 股权，终局时不到四成，这条路就不归你定了'), undefined, '股权低于 ideo.equityWarn。「四成」对应 ideo.equity');
add('ideo.situation.cash', tpl('账上的钱只够撑 {月数} 个月'), undefined, '现金撑不过 ideo.warn.runway 个月');
add('ideo.situation.heat', tpl('反共压力已经 {压力}，融资和企业客户都在观望'), undefined, '反共压力过半（ideo.heat.half）');
add('ideo.situation.last', tpl('这是最后一次表态'), undefined, '最后一级');
// 处置左倾员工
both('ideo.purge.list', () => tpl('名单上一共 {人数} 人{死忠}。'), '「处置左倾员工」窗口正文后面接的一句');
add('ideo.purge.list.loyal', tpl('，其中 {死忠人数} 人是死忠'), undefined, '同上：名单里有死忠时接在 {死忠} 的位置');
add('ideo.purge.fireAll', tpl('{人数} 人当天收到了邮件{死忠}。'), undefined, '全部开除的结果');
add('ideo.purge.fireAll.loyal', tpl('，其中 {死忠人数} 位是跟你从{办公室}一路走过来的死忠'), undefined, '同上：有死忠时。{办公室} = 第一间办公室的名字');
both('ideo.purge.reeducate', v => check('ideo.purge.reeducate', v, vt(v).reeducate('{人数}'), n => vt(v).reeducate(n), [[[4], { 人数: 4 }]]), '转岗培训 / 使命对齐的结果');
const relCases = v => [[[5, 0], { 人数: 5, 死忠: '' }], [[5, 2], { 人数: 5, 死忠: fill('，{死忠人数} 位死忠说什么也不走，留了下来', { 死忠人数: 2 }) }]];
both('ideo.purge.release', v => check('ideo.purge.release', v, vt(v).release('{人数}', 0).replace(/。$/, '{死忠}。'), (n, l) => vt(v).release(n, l), relCases(v)), '拿补偿走人的结果');
add('ideo.purge.release.loyal', tpl('，{死忠人数} 位死忠说什么也不走，留了下来'), undefined, '同上：有死忠留下时接在 {死忠} 的位置');
both('ideo.purge.tolerate', v => check('ideo.purge.tolerate', v, vt(v).tolerate('{人数}'), n => vt(v).tolerate(n), [[[3], { 人数: 3 }]]), '睁一只眼闭一只眼的结果');
both('ideo.purge.dirt', v => vt(v).fireDirt, '全部开除留下的黑料叫什么');
const H = v => vt(v).hint;
both('ideo.purge.hint.fire_all', v => check('hint.fire_all', v, H(v).fire_all('{人数}', 0).replace('人；', '人{死忠}；'), (n, l) => H(v).fire_all(n, l), [[[6, 0], { 人数: 6, 死忠: '' }], [[6, 2], { 人数: 6, 死忠: '，含死忠 2 人' }]]), '「全部开除」选项的提示');
add('ideo.purge.hint.fire_all.loyal', tpl('，含死忠 {死忠人数} 人'), undefined, '同上：有死忠时');
both('ideo.purge.hint.reeducate', v => check('hint.reeducate', v, H(v).reeducate('{人数}'), n => H(v).reeducate(n), [[[6], { 人数: 6 }]]));
both('ideo.purge.hint.release', v => check('hint.release', v, H(v).release('{走的人数}', 0).replace(/NaN|\{走的人数\}/, '{走的人数}') + '{死忠}', (n, l) => H(v).release(n, l), [[[6, 0], { 走的人数: 6, 死忠: '' }], [[6, 2], { 走的人数: 4, 死忠: '，死忠 2 人留下' }]]));
add('ideo.purge.hint.release.loyal', tpl('，死忠 {死忠人数} 人留下'), undefined, '同上：有死忠时');
both('ideo.purge.hint.tolerate', v => H(v).tolerate());
// 五年计划 / 登月计划、末位淘汰 / 强制排名
both('ideo.plan.news', v => co(vt(v).plan.news) + tpl('：{日期}前达到{目标}。'), '新闻：计划立项');
add('ideo.plan.goal.users', tpl('用户 {用户}'), undefined, '计划目标的写法：用户');
add('ideo.plan.goal.model', tpl('丹炉火候 {火候}'), undefined, '计划目标的写法：模型能力');
add('ideo.plan.goal.rev', tpl('月收入 {收入}'), undefined, '计划目标的写法：营收');
add('ideo.plan.result', tpl('（目标：{目标}；实际：{实际}。）'), undefined, '计划到期窗口正文后面接的一句');
both('ideo.page.plan', v => `${vt(v).plan.icon} ${vt(v).plan.name}` + tpl('进行中，{日期}到期'), '意识形态页：计划进行中');
both('ideo.page.yank', v => `📉 ${vt(v).yank.name}` + tpl('施行中：每个部门每月淘汰一人'), '意识形态页：末位淘汰施行中');
both('ideo.yank.start', v => vt(v).yank.start, '新闻：末位淘汰开始施行');
both('ideo.yank.month', v => check('ideo.yank.month', v, vt(v).yank.month('{人数}'), n => vt(v).yank.month(n), [[[3], { 人数: 3 }]]), '新闻：每月淘汰');
both('ideo.utopia.news', v => co(vt(v).utopia), '新闻：公社 / 合作社实验开工');
both('ideo.bci.news', v => vt(v).bci, '新闻：脑机实验开工');
add('ideo.heat.news', tpl('🌹 又有人悄悄摘掉了签名档里的玫瑰。'), undefined, '新闻：反共压力磨掉一名玫瑰员工');

const tj = J('text.json');
for (const [key, text, bay, note] of TX) {
  if (key in tj.TEXT) throw new Error('键重复：' + key);
  if (text !== text.trim() || (bay != null && bay !== bay.trim())) { if (key !== 'ideo.situation.sep') throw new Error(`键 ${key} 首尾有空白`); }
  tj.TEXT[key] = bay != null ? { text, bay } : { text }; tj.SHEET[key] = '路线之争';
  if (note) tj.TEXT_DOC[key] = note;
}
W('text.json', tj);
console.log('text.json：路线之争', TX.length, '条，共', Object.keys(tj.TEXT).length, '条');

// ───────── 平衡参数 ─────────
const R = (key, value, desc, unit) => ({ key, value, ...(unit ? { unit } : {}), desc, use: '路线之争' });
const PR = [
  R('ideo.equity', 40, '终局时创始人股权的底线：不到这个数，路线之争「你说了不算」', '%'),
  R('ideo.equityWarn', 45, '股权低于这个数：每级正文提醒「快守不住了」，从第 ideo.deck.buybackFrom 级起塞回购卡', '%'),
  R('ideo.redStart', 0.2, '开链那一刻，每个老员工加入读书会（深圳）/ 挂上玫瑰（湾区）的概率'),
  R('ideo.entry.from', 28, '「接盘老股」最早在第几个月', '月'), R('ideo.entry.to', 40, '最晚在第几个月（开局时在两者之间随机定一个月）', '月'),
  R('ideo.entry.last', 52, '过了第几个月就不再来（剩下的时间走不完 15 级）', '月'),
  R('ideo.entry.stage', 2, '至少融完第几轮才来（2 = A 轮）'), R('ideo.entry.delay', 3, '到时候还没融完，就往后推几个月', '月'),
  R('ideo.entry.warn', 50, '股权低于这个数，入口窗口提醒「再融一轮就悬了」', '%'),
  R('ideo.lean.decay', 0.72, '揣摩意图：越早的选择权重越小，每往前一级乘一次这个数'),
  R('ideo.lean.free', 0.35, '作风：免费定价算往左多少（-1~1）'), R('ideo.lean.premium', -0.35, '作风：高价收割算往左多少'),
  R('ideo.lean.x996', -0.45, '作风：996 算往左多少'), R('ideo.lean.x965', 0.1, '作风：不是 996 算往左多少'),
  R('ideo.lean.strict', 0.15, '作风：严防死守的安全策略算往左多少'), R('ideo.lean.loose', -0.15, '作风：放飞自我算往左多少'),
  R('ideo.lean.fire', 0.1, '作风：路线之争期间每裁一个人，往右多少'), R('ideo.lean.fireMax', 0.3, '同上，最多算多少'),
  R('ideo.lean.wChoice', 0.65, '意图 = 选择 × 这个数 + 作风 × 下一个数 + 两条进度条之差 ÷ 100 × 再下一个数'),
  R('ideo.lean.wStyle', 0.2, '同上：作风的权重'), R('ideo.lean.wBars', 0.15, '同上：进度条之差的权重'),
  R('ideo.lean.confPicks', 4, '把握：选满几级才算看得准'), R('ideo.lean.confV', 0.6, '把握：意图到多少才算完全确定'),
  R('ideo.lean.pref', 0.18, '意图超过这个数（往右是负的这个数）才算「有倾向」'),
  R('ideo.lean.firm', 0.5, '意图超过这个数算「认准了」：三张对路的卡 + 一条回头路；否则两张对路 + 一张反方向'),
  R('ideo.lean.from', 3, '从第几级起按意图给牌（之前每级左、右、务实各一张）'),
  R('ideo.lean.pct0', 40, '意识形态页显示的「把握」= 这个数 + 把握 × 下一个数', '%'), R('ideo.lean.pctK', 55, '同上', '%'),
  R('ideo.deck.sharp', 0.65, '从卡池抽卡时，优先抽「看局势」的卡（有出现条件的）的概率'),
  R('ideo.deck.mid', 0.4, '这一级没有务实卡位时，额外塞一张「看局势」务实卡的概率'),
  R('ideo.deck.buybackFrom', 4, '从第几级起，股权低于 ideo.equityWarn 时塞一张回购卡'),
  R('ideo.buyback.share', 3, '回购卡买回多少股权', '%'), R('ideo.buyback.premium', 1.15, '回购卡的价格 = 估值 × 比例 × 这个数'),
  R('ideo.follow.red', 0.8, '选了左翼卡：一名员工加入读书会的概率'), R('ideo.follow.cap', 0.5, '选了资本卡：一名员工退出读书会的概率'),
  R('ideo.newRed.red', 0.5, '左翼结局以后，新来的员工加入读书会的概率'), R('ideo.newRed.div', 260, '路线之争期间，新员工加入读书会的概率 = 左边那条 ÷ 这个数'),
  R('ideo.purge.fireSev', 5, '全部开除：黑料严重度 = 这个数 + 人数 × 下一个数，最多 ideo.purge.fireSevMax'), R('ideo.purge.fireSevPer', 1.2, '同上'), R('ideo.purge.fireSevMax', 18, '同上'),
  R('ideo.purge.fireMorale', 3, '全部开除：士气掉 这个数 + 人数 × 下一个数'), R('ideo.purge.fireMoralePer', 0.6, '同上'), R('ideo.purge.fireRep', -4, '全部开除：口碑的变化'),
  R('ideo.purge.eduMonths', 1, '转岗培训：每人花几个月工资', '月'), R('ideo.purge.eduMorale', -5, '转岗培训：士气的变化'),
  R('ideo.purge.relMonths', 3, '拿补偿走人：每人赔几个月工资（深圳的提示里写的是 N+3）', '月'), R('ideo.purge.relRep', 5, '拿补偿走人：口碑的变化'), R('ideo.purge.relMorale', 2, '拿补偿走人：士气的变化'),
  R('ideo.purge.tolMorale', 3, '睁一只眼闭一只眼：士气的变化'),
  R('ideo.warn.runway', 4, '现金撑不过几个月时，每级正文提醒一句', '月'),
  R('ideo.heat.failDecay', 3, '反共压力（湾区）：没走成以后每月降多少'),
  R('ideo.heat.rise', 1, '路线之争期间每月基础上涨'), R('ideo.heat.redFrom', 25, '社会主义条超过这个数的部分 × 下一个数，加进每月上涨'), R('ideo.heat.redK', 0.1, '同上'),
  R('ideo.heat.capFrom', 50, '资本主义条超过这个数的部分 × 下一个数，从每月上涨里减掉'), R('ideo.heat.capK', 0.06, '同上'),
  R('ideo.heat.after', 1, '「共享繁荣」以后，压力低于 ideo.heat.afterCap 时每月涨多少'), R('ideo.heat.afterCap', 40, '同上：涨到多少为止'),
  R('ideo.heat.half', 50, '压力过半的线：过了以后社会主义条每月被磨掉一点、有人摘玫瑰；每级正文和意识形态页也会提醒'),
  R('ideo.heat.grind', 2, '压力过半且社会主义条领先时，社会主义条每月被磨掉多少'), R('ideo.heat.unrose', 0.35, '同时有一名员工悄悄摘掉玫瑰的概率'),
  R('ideo.heat.scare', 0.12, '路线之争期间每月弹红色恐慌事件的概率 = 这个数 + 压力 ÷ 下一个数'), R('ideo.heat.scareDiv', 180, '同上'),
  R('ideo.heat.scareAfterDiv', 240, '「共享繁荣」以后：概率 = 压力 ÷ 这个数'), R('ideo.heat.scareCd', 10, '同一件红色恐慌事件至少隔几个月', '月'),
  R('ideo.heat.raiseDiv', 600, '压力对融资估值的拖累：估值 × (1 - 压力 ÷ 这个数)'), R('ideo.heat.b2bDiv', 400, '压力对企业订单的拖累：收入 × (1 - 压力 ÷ 这个数)'),
];
const pj = J('params.json');
for (const r of PR) { if (pj.P[r.key] !== undefined) throw new Error('参数重复：' + r.key); pj.ROWS.push(r); pj.P[r.key] = r.value; }
W('params.json', pj);
console.log('params.json：路线之争', PR.length, '个，共', pj.ROWS.length, '个');

// 核对数字确实出现在旧源码里（防手误）
const nums = { 'ideo.equity': 'IDEO_EQUITY = 40', 'ideo.redStart': '< 0.2) e.red', 'ideo.entry.last': 'S.t > 52', 'ideo.entry.stage': 'S.stage < 2', 'ideo.entry.delay': 'S.t + 3', 'ideo.entry.warn': 'S.equity < 50', 'ideo.lean.decay': '0.72 **',
  'ideo.lean.free': "'free' ? 0.35", 'ideo.lean.premium': "'premium' ? -0.35", 'ideo.lean.x996': "'996' ? -0.45 : 0.1", 'ideo.lean.strict': "'strict' ? 0.15", 'ideo.lean.loose': "'loose' ? -0.15", 'ideo.lean.fire': '(I.fired || 0) * 0.1', 'ideo.lean.fireMax': 'Math.min(0.3,',
  'ideo.lean.wChoice': '0.65 * choice + 0.2 * style + 0.15 *', 'ideo.lean.confPicks': 'I.picks.length / 4', 'ideo.lean.confV': 'Math.abs(v) / 0.6', 'ideo.lean.pref': 'v > 0.18', 'ideo.lean.firm': 'Math.abs(v) >= 0.5', 'ideo.lean.from': 'if (n < 3)', 'ideo.lean.pct0': '40 + conf * 55',
  'ideo.deck.sharp': 'G.rnd(S) < 0.65', 'ideo.deck.mid': 'G.rnd(S) < 0.4', 'ideo.deck.buybackFrom': 'n >= 4 &&', 'ideo.equityWarn': 'S.equity < 45', 'ideo.buyback.share': '* 0.03 * 1.15', 'ideo.follow.red': 'G.rnd(S) < 0.8', 'ideo.follow.cap': 'G.rnd(S) < 0.5',
  'ideo.newRed.red': '? 0.5 :', 'ideo.newRed.div': 'S.ideo.red / 260', 'ideo.purge.fireSev': 'Math.min(18, 5 + reds.length * 1.2)', 'ideo.purge.fireMorale': '-(3 + reds.length * 0.6), rep: -4', 'ideo.purge.eduMorale': 'morale: -5', 'ideo.purge.relMonths': 'S.cash -= 3 * sal(e)',
  'ideo.purge.relRep': 'rep: 5, morale: 2', 'ideo.purge.tolMorale': 'morale: 3', 'ideo.warn.runway': 'G.runway(S) < 4', 'ideo.heat.failDecay': 'I.heat - 3', 'ideo.heat.rise': '? 1 + Math.max(0, I.red - 25) * 0.1 - Math.max(0, I.cap - 50) * 0.06 : I.heat < 40 ? 1 : 0',
  'ideo.heat.half': 'I.heat >= 50 && I.red > I.cap', 'ideo.heat.grind': 'I.red - 2', 'ideo.heat.unrose': 'G.rnd(S) < 0.35', 'ideo.heat.scare': '0.12 + I.heat / 180 : I.heat / 240', 'ideo.heat.scareCd': '>= 10', 'ideo.heat.raiseDiv': '1 - I.heat / 600', 'ideo.heat.b2bDiv': '1 - I.heat / 400' };
for (const [k, s] of Object.entries(nums)) if (!src.includes(s)) throw new Error(`参数 ${k}：旧源码里找不到「${s}」`);
const eng = readFileSync(path.join(old, 'game/engine.js'), 'utf8');
if (!eng.includes('S.ideoAt = ri(S, 28, 40)')) throw new Error('ideo.entry.from/to 对不上');

// ───────── 两个版本：版本设定 + 系统事件 ─────────
for (const v of ['cn', 'us']) {
  const file = `ideology_${v}.json`, d = J(file), X = VER[v], E = ENTRY[v], PT = d.PLAN_TEXT, YT = d.YANK_TEXT, T = X.t;
  d.VER = {
    start: { red: X.start.red, cap: X.start.cap, heat: X.start.heat ?? 0 },
    heat: { on: v === 'us' ? 1 : 0 },
    brand: X.brand, goal: { ...X.goal }, flag: { ...X.flag, ...(v === 'us' ? { chain: 'us_chain' } : {}) }, chain: { ...X.chain },
  };
  const [aL, aH, aT, aFx] = E.accept, [sL, sH, sOk, sOkFx, sNo, sNoFx, sHeat] = E.stall;
  const ev = (id, o, options) => ({ id, ...o, options });
  d.SYS_EVENTS = [
    ev('ideo_entry', { title: E.title, icon: E.icon, art: E.art, text: E.text }, [
      { label: aL, hint: aH, fn: 'accept', text: aT, fx: aFx },
      { label: '行使优先购买权', hint: '花 {价格} 自己买下这 {份额}% 老股', fn: 'rofr', p: { 份额: 6, 溢价: 1.2 }, text: E.rofr[0], fx: E.rofr[1] },
      { label: sL, hint: sH, fn: 'stall', p: { 压力: sHeat }, check: { attr: 'net', dc: 16 }, ok: { text: sOk, fx: sOkFx }, fail: { text: sNo, fx: sNoFx } },
    ]),
    ev('ideo_plan', { title: PT.title, icon: T.plan.icon, art: T.plan.art, text: PT.text, p: { 月数: 12 } }, [
      { label: PT.targets.users.label, hint: '目标：{目标}', fn: 'users', p: { 倍数: 2, 至少: 30 }, text: '', fx: { temp: { key: 'growthMult', mult: 1.15, months: 12 } } },
      { label: PT.targets.model.label, hint: '目标：{目标}', fn: 'model', p: { 提升: 6 }, text: '', fx: { temp: { key: 'researchMult', mult: 1.2, months: 12 } } },
      { label: PT.targets.rev.label, hint: '目标：{目标}', fn: 'rev', p: { 倍数: 2, 至少: 20 }, text: '', fx: { temp: { key: 'revMult', mult: 1.12, months: 12 } } },
    ]),
    ev('ideo_plan_ok', { title: PT.okTitle, icon: T.plan.icon, art: T.plan.art, text: PT.okText }, [
      { label: T.plan.ok[0], hint: '士气、口碑、热度都涨', fn: 'ok', text: T.plan.ok[1], fx: { morale: 10, rep: 6, hype: 8 } },
    ]),
    ev('ideo_plan_fail', { title: PT.failTitle, icon: T.plan.icon, art: 'office_night', text: PT.failText }, [
      { label: PT.failOpts.honest.label, hint: PT.failOpts.honest.hint, fn: 'honest', text: PT.failOpts.honest.text, fx: { morale: -8, rep: -3 } },
      { label: PT.failOpts.fake.label, hint: PT.failOpts.fake.hint, fn: 'fake', text: PT.failOpts.fake.text, fx: { rep: 3, hype: 5, dirt: 'fake_plan' } },
    ]),
    ev('ideo_yank', { title: YT.title, icon: '📉', art: 'boardroom', text: YT.text }, [
      { label: YT.go.label, hint: YT.go.hint, fn: 'go', text: YT.go.text, fx: {} },
      { label: YT.no.label, fn: 'no', text: '', fx: {} },
    ]),
  ];
  for (const s of ['ENTRY_SHARE = 6', '* 1.2', "dc: 16", "growthMult', mult: 1.15, months: 12", "researchMult', mult: 1.2, months: 12", "revMult', mult: 1.12, months: 12", 'S.users * 2, S.users + 30', 'G.myCap(S) + 6', 'G.revenue(S).total * 2, G.revenue(S).total + 20',
    'S.t + 12', "fx: { morale: 10, rep: 6, hype: 8 }", "fx: { morale: -8, rep: -3 }", "fx: { rep: 3, hype: 5, dirt: 'fake_plan' }", "'office_night'", "icon: '📉', art: 'boardroom'", "'士气、口碑、热度都涨'", "label: '行使优先购买权'"])
    if (!src.includes(s)) throw new Error('旧源码里找不到：' + s);
  delete d.PLAN_TEXT; delete d.YANK_TEXT;
  W(file, d);
  console.log(file, '：版本设定', JSON.stringify(d.VER), '；系统事件', d.SYS_EVENTS.map(e => e.id).join(' '));
}

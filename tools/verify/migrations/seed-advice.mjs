// 一次性迁移：参谋提示（src/game/advice.js）里的文字 → 文本.xlsx「参谋」；参谋自己的门槛 → 平衡参数.xlsx（advice. 开头）。
// 文字从旧源码里抄：整句的用 lit() 按开头几个字抄，带变量的用 tpl()（每个固定片段都必须原样出现在旧源码里）。
//   node seed-advice.mjs <旧版 src 目录> <项目根目录>
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const [old, root] = process.argv.slice(2);
const { pretty } = await import(pathToFileURL(path.join(root, 'tools/tables/lib/json.mjs')));
const src = readFileSync(path.join(old, 'game/advice.js'), 'utf8').replace(/\r\n/g, '\n');
function lit(prefix) {
  const hits = []; let i = -1;
  while ((i = src.indexOf(prefix, i + 1)) >= 0) if (src[i - 1] === "'" || src[i - 1] === '`') hits.push(i);
  if (hits.length !== 1) throw new Error(`以「${prefix}」开头的字符串有 ${hits.length} 个`);
  i = hits[0]; const q = src[i - 1]; let j = i; while (src[j] !== q) j++;
  const s = src.slice(i, j);
  if (s.includes('${')) throw new Error(`「${prefix}」是带变量的模板`);
  return s;
}
const tpl = s => { for (const seg of s.split(/\{[^{}]+\}/)) if (seg && !src.includes(seg)) throw new Error(`模板「${s}」里的「${seg}」在旧源码里找不到`); return s; };
const icon = (rule, name) => { if (!src.includes(`icon: '${name}'`)) throw new Error('图标 ' + name); return name; };
const TX = [];
const add = (key, text, note, bay) => TX.push([key, text, bay, note]);

add('advice.act', tpl('「{行动}」'), '提示里提到一个行动时的写法');
add('advice.sep', '、', '提示里列几个行动时的分隔号');
// 要紧
add('advice.cash.icon', icon('cash', 'cash'), '「缺钱」提示的图标（界面图标的名字）');
add('advice.cash.title', tpl('钱只够撑 {月数} 个月'), '缺钱：标题');
add('advice.cash.title.broke', lit('下个月发不出工资'), '缺钱：撑不过一个月时的标题');
add('advice.cash.text', tpl('每月净流出 {净流出}。{建议}'), '缺钱：正文，{建议} 是下面几句里用得上的');
add('advice.cash.raise3', tpl('业绩系数 {业绩}，现在融资能拿到三份报价。'), '建议：业绩达到「启动融资」的流血线（行动.xlsx 里的参数）');
add('advice.cash.raise1', tpl('业绩系数 {业绩}，不到 {流血线}，融资只有一份「趁火打劫」的报价。'), '建议：在失败线和流血线之间');
add('advice.cash.raise0', tpl('业绩系数才 {业绩}，不到 {失败线}，现在去融资只会听到「保持联系」。'), '建议：不到失败线');
add('advice.cash.free', lit('定价还是「免费冲量」'), '建议：定价是免费（「三成」是设定.xlsx「政策」里免费定价的付费系数）');
add('advice.cash.furnace', tpl('丹炉占着 {张数} 张卡（每月约 {月租}），少租几张能多撑一阵。'), '建议：丹炉占着不少卡');
add('advice.cash.quick', tpl('{行动}能先回点血。'), '建议：卖课、申请补贴这类回血的行动');
add('advice.outage.icon', icon('outage', 'gpu'));
add('advice.outage.title', lit('显卡不够推理'));
add('advice.outage.text', tpl('用户要 {需要} 张卡做推理，你只租了 {租了} 张，{缺口}% 的请求在报「服务器繁忙」，口碑和用户都在流失。{办法}'));
add('advice.outage.add', lit('去「经营」把显卡加上。'), '配额还够');
add('advice.outage.quota', tpl('配额只有 {配额} 张，超出的部分得按现货价租（市价 {倍数} 倍起），找皮衣教主要点配额能便宜不少。'), '配额不够。{倍数} = 平衡参数 gpu.over0');
add('advice.crime.icon', icon('crime', 'shield'));
add('advice.crime.title', lit('经侦在盯着你'));
add('advice.crime.text', tpl('涉嫌违法的黑料已经曝光了 {曝光}（到 {经侦线} 经侦上门），保险柜里还躺着「{黑料}」。趁它还没爆，花钱洗掉。'), '{经侦线} = 平衡参数 scandal.probeLine');
add('advice.proj.icon', icon('projects', 'pin'));
add('advice.proj.title.stalled', lit('特殊项目停滞了'));
add('advice.proj.title.late', lit('项目要超期了'));
add('advice.proj.text', tpl('「{项目}」还剩 {月数} 个月到期，照现在的速度只能做完 {完成}%。{办法}'));
add('advice.proj.ap', lit('这个项目只能靠你亲自花行动点攻关。'), '只能靠行动点推的项目');
add('advice.proj.stalled', tpl('现在没有{人手}在推进它，加派人手或者亲自攻关。'), '停滞了。{人手} = 设定.xlsx「项目类型」的名字');
add('advice.proj.slow', tpl('可以加派{人手}，或者花行动点亲自攻关。'), '进度慢');
add('advice.vam.icon', icon('vam', 'handshake'));
add('advice.vam.title', lit('对赌快到期了'));
add('advice.vam.text', tpl('{日期}前用户要到 {目标}，现在只有 {现在}。投放买量、炒作造势都能拉人——刷量也算数，就是会留下黑料。'));
add('advice.morale.icon', icon('morale', 'smile'));
add('advice.morale.title', lit('士气低落'));
add('advice.morale.title.quit', lit('有人要跑路了'), '士气低于离职线（平衡参数 morale.quitLine）');
add('advice.morale.text', tpl('士气 {士气}，团队产出在打折{离职}。{加班}{董事会}'));
add('advice.morale.quitting', lit('，每个月都可能有人提离职'), '接在 {离职}：已经低于离职线');
add('advice.morale.quitLine', tpl('，低于 {离职线} 就会有人跑路'), '接在 {离职}：还没到');
add('advice.morale.x996', lit('「996」每个月还在磨士气。'), '接在 {加班}');
add('advice.morale.board', tpl('你只剩 {股权}% 的股权，士气再低，董事会也要动你了。'), '接在 {董事会}：股权低于逼宫线（coup.equity）');
add('advice.coup.icon', icon('coup', 'pie'));
add('advice.coup.title', lit('董事会在嘀咕'));
add('advice.coup.text', tpl('你只剩 {股权}% 的股权，口碑又跌到 {口碑}，董事会随时可能换掉你。先把口碑拉回来。'));
// 机会与闲置
add('advice.sprint.icon', icon('sprint', 'puzzle'));
add('advice.sprint.title', lit('研发组闲着'));
add('advice.sprint.title.done', lit('功能上线了，开下一个'));
add('advice.sprint.text', tpl('{开头}工程师闲着也是闲着——开一个功能冲刺，从三份需求里挑一个（还有 {剩下} 个功能没做）。'));
add('advice.sprint.done', tpl('「{功能}」已经上线。'), '接在 {开头}：上个月刚上线一个');
add('advice.sprint.none', lit('现在没有在开发的功能。'), '接在 {开头}');
add('advice.release.icon', icon('release', 'rocket'));
add('advice.release.title', lit('丹炉可以出炉了'));
add('advice.release.text', tpl('火候 {火候}，{对比}。榜首跑分 {榜首}，发布新模型能冲一波榜单和热度。'));
add('advice.release.vs', tpl('比现役模型的 {现役} 高出 {高出}'), '接在 {对比}');
add('advice.release.first', lit('还没有发布过模型'), '接在 {对比}');
add('advice.ipo.icon', icon('ipo', 'bell'));
add('advice.ipo.title.wash', lit('上市前先洗白'));
add('advice.ipo.text.wash', tpl('上市条件齐了，但保险柜里还有涉嫌违法的「{黑料}」。审计师翻出来就会被否，材料还会被移交有关部门。先洗白，再去敲钟。'));
add('advice.ipo.title', lit('可以申请上市了'));
add('advice.ipo.text', tpl('{轮次}融完、连续盈利 {月数} 个月、业绩系数 {业绩}，上市条件齐了。审计师会把保险柜翻个底朝天{黑料}。').replace('{轮次}融完', '{轮次}融完'), '{轮次} = 最后一轮融资的名字');
add('advice.ipo.dirt', tpl('，里面还有 {张数} 张黑料'), '接在 {黑料}');
add('advice.raise.icon', icon('raise', 'handshake'));
add('advice.raise.title', '能融{轮次}了', '{轮次} 是下一轮的名字（英文字母开头的前面空一格）');
add('advice.raise.why.short', tpl('账上的钱还能撑 {月数} 个月，趁业绩系数 {业绩} 还过得去，把下一轮融了。'));
add('advice.raise.why.ripe', tpl('业绩系数 {业绩}，已经达标，现在估值最好看。'));
add('advice.raise.text', tpl('{理由}路演能拿到三份报价，估值基准约 {估值}。每轮要让出 {最少}%–{最多}% 的股权（你现在 {股权}%{董事会}）。{路线之争}{预热}'), '{最少} {最多} = 行动.xlsx「融资报价」里出让比例的最小和最大');
add('advice.raise.board', tpl('，低于 {逼宫线}% 董事会就敢动你'), '{逼宫线} = coup.equity');
add('advice.raise.ideo', tpl('路线之争终局时你得握有四成股权，融完这一轮大约只剩 {剩下}%。'), '「四成」对应 ideo.equity');
add('advice.raise.roadshow', lit('想把估值再抬一点'));
add('advice.office.icon', icon('office', 'building'));
add('advice.office.title', lit('工位坐满了'));
add('advice.office.text', tpl('团队 {人数}/{上限} 人，再招人得先换地方：搬进「{办公室}」能坐 {新上限} 人，月租 {月租}。'));
add('advice.hire.icon', icon('hire', 'search_user'));
add('advice.hire.title', lit('还有空工位'));
add('advice.hire.title.need', tpl('还缺{岗位}'));
add('advice.hire.title.star', lit('有个难得的人才'));
add('advice.hire.why.res', lit('丹炉要靠研究员才炼得快。'));
add('advice.hire.why.eng', lit('产品体验和功能开发都靠工程师。'));
add('advice.hire.text', tpl('团队 {人数}/{上限} 人。{理由}候选人里有 {名字}（{岗位}，能力 {能力}{怪癖}），点名字能看到具体能带来什么。'));
add('advice.hire.quirk', tpl('，{怪癖}'), '接在 {怪癖}');
add('advice.furnace.icon', icon('furnace', 'furnace'));
add('advice.furnace.title.cold', lit('丹炉是凉的'));
add('advice.furnace.text.cold', tpl('显卡全用在推理上了，丹炉没在炼，火候不会涨。去「经营」多租几张卡（配额还空着 {空着} 张）。'));
add('advice.furnace.text.none', tpl('一张显卡都没租，丹炉没在炼，火候不会涨。去「经营」租几张卡（配额 {配额} 张）。'));
add('advice.furnace.title.more', lit('显卡还能多租'));
add('advice.furnace.text.more', tpl('配额 {配额} 张只租了 {租了} 张，账上的钱撑得住。多租点卡，火候涨得更快，下次发布更有底气。'));
add('advice.selfdev.icon', icon('selfdev', 'target'));
add('advice.selfdev.title', lit('可以自研模型了'));
add('advice.selfdev.text', tpl('已经融到 {轮次}，可以组建炼丹团队，摆脱上游 {上游}。之后要自己租显卡、招研究员，每月成本会涨一截，但产品的天花板不再受制于人。'));
// 留意
add('advice.premium.icon', icon('premium', 'gpu'));
add('advice.premium.title', lit('显卡在吃溢价'));
add('advice.premium.text', tpl('有 {张数} 张卡超出配额、按现货价在租，每月比按市价多花 {多花}。找皮衣教主要点配额，这笔钱就能省下来。'));
add('advice.reg.icon', icon('reg', 'bank'));
add('advice.reg.title', lit('监管压力大'));
add('advice.reg.title.bad', lit('监管要动手了'));
add('advice.reg.text', tpl('监管压力 {压力}：增长受限、合规成本上升，到 100 会吃一记重锤。{审核}'));
add('advice.reg.loose', lit('安全审核还是「放飞自我」'), '接在 {审核}');
add('advice.x996.icon', icon('x996', 'clock'));
add('advice.x996.title', lit('996 要出事了'));
add('advice.x996.text', tpl('已经连续 996 {月数} 个月。再熬一个月，保险柜里就会多一张「{黑料}」。'));
add('advice.dirt.icon', icon('dirt', 'safe'));
add('advice.dirt.title', lit('黑料随时会爆'));
add('advice.dirt.text', tpl('保险柜里 {张数} 张黑料，按现在的热度和用户量，每个月约有 {概率}% 的概率被扒出一张。最重的是「{黑料}」（严重度 {严重度}）。洗掉它，或者招个法务公关压一压。'));
add('advice.hype.icon', icon('hype', 'flame'));
add('advice.hype.title', lit('没人记得你了'));
add('advice.hype.text', tpl('热度只剩 {热度}，拉新和估值都在往下掉。'));
add('advice.rep.icon', icon('rep', 'star'));
add('advice.rep.title', lit('口碑太差'));
add('advice.rep.text', tpl('口碑 {口碑}：用户留存和付费都在变差。做公益、发白皮书能补一点，☠ 捷径就先别走了。'));
// 路线之争
add('advice.ideoEquity.icon', icon('ideoEquity', 'pie'));
add('advice.ideoEquity.title', lit('股权快守不住四成'), '「四成」对应 ideo.equity');
add('advice.ideoEquity.title.low', lit('股权不到四成了'));
add('advice.ideoEquity.text', tpl('路线之争还剩 {级数} 级。终局时你得握有至少 {底线}% 股权，否则方向由董事会替你定，成就也拿不到。现在 {股权}%：这段时间少融资；链里股权低于 {回购线}% 时会出现「回购」选项。'), '{底线} = ideo.equity，{回购线} = ideo.equityWarn');
add('advice.ideoNew.icon', icon('ideoNew', 'flag'));
add('advice.ideoNew.title', lit('意识形态页有新行动'));
add('advice.ideoNew.red', lit('公司走上了红色路线'), '走完路线之争（左翼结局）：「意识形态」页解锁了哪些行动', lit('公司走上了「共享繁荣」'));
add('advice.ideoNew.cap', lit('公司决定警惕乌托邦'), '走完路线之争（保守结局）', lit('公司宣布「我们是一家公司」'));
add('advice.ideoHeat.icon', icon('ideoHeat', 'warning'));
add('advice.ideoHeat.title', lit('反共压力很大'));
add('advice.ideoHeat.text', tpl('反共压力 {压力}：融资估值 -{估值}%、企业订单 -{订单}%{磨掉}。资本主义的选项，和红色恐慌事件里那句「我们不是社会主义」，都能压一压。'));
add('advice.ideoHeat.grind', lit('，社会主义条每月还会被磨掉一点'), '接在 {磨掉}：路线之争还在进行');

const tf = path.join(root, 'src/data/tables/text.json'), tj = JSON.parse(readFileSync(tf, 'utf8'));
for (const [key, text, bay, note] of TX) {
  if (key in tj.TEXT) throw new Error('键重复：' + key);
  if (text !== text.trim() && key !== 'advice.sep') throw new Error(`键 ${key} 首尾有空白`);
  tj.TEXT[key] = bay != null ? { text, bay } : { text }; tj.SHEET[key] = '参谋';
  if (note) tj.TEXT_DOC[key] = note;
}
writeFileSync(tf, pretty(tj) + '\n');
console.log('text.json：参谋', TX.length, '条，共', Object.keys(tj.TEXT).length, '条');

const R = (key, value, desc, unit) => ({ key, value, ...(unit ? { unit } : {}), desc, use: '参谋提示' });
const PR = [
  R('advice.cash.runway', 4, '现金撑不过几个月才提醒「缺钱」（也是「能融下一轮了」这条提醒的下限，再低就由缺钱那条管）', '月'),
  R('advice.cash.freeGpu', 4, '缺钱时，丹炉至少占着几张卡才建议少租', '张'),
  R('advice.proj.months', 3, '特殊项目离到期还剩几个月开始提醒', '月'), R('advice.proj.urgent', 2, '还剩几个月算要紧（红色）', '月'),
  R('advice.vam.months', 4, '对赌离到期还剩几个月开始提醒', '月'),
  R('advice.morale.line', 35, '士气低于这个数开始提醒'), R('advice.morale.staff', 2, '团队至少几个人才提醒士气', '人'),
  R('advice.coup.rep', 34, '股权低于 coup.equity 时，口碑低于这个数就提醒「董事会在嘀咕」（比真正的逼宫线 coup.rep 早一点）'),
  R('advice.raise.perf', 0.9, '业绩系数到这个数才提醒融资'), R('advice.raise.short', 12, '现金撑不过几个月就劝融下一轮', '月'),
  R('advice.raise.ripePerf', 1, '钱不急的时候：业绩系数到这个数、'), R('advice.raise.gap', 10, '离上一轮至少几个月、', '月'), R('advice.raise.equity', 40, '股权至少还有这么多，才劝融', '%'),
  R('advice.raise.dilute', 0.85, '估算融完一轮还剩多少股权：现在的 × 这个数（路线之争期间钱不急、融完会跌破 ideo.equity 的就不劝）'),
  R('advice.raise.boardWarn', 55, '股权低于这个数时，顺带提醒逼宫线', '%'), R('advice.raise.boost', 0.15, '路演预热的估值加成还不到这个数，就建议先做几次'),
  R('advice.office.runway', 6, '现金至少撑几个月才建议搬办公室', '月'), R('advice.office.cash', 2, '账上至少要有几倍的搬家费'),
  R('advice.hire.runway', 8, '在亏钱的时候：现金至少撑几个月才建议招人', '月'), R('advice.hire.star', 8, '候选人能力到这个数算「难得的人才」（关系户和摸鱼的不算）'),
  R('advice.hire.small', 3, '团队不到几个人时，有空位就建议招人', '人'), R('advice.hire.cash', 3, '账上至少要有这个人几个月的工资', '月'),
  R('advice.furnace.runway', 6, '显卡全用在推理上、现金撑得过几个月时，提醒「丹炉是凉的」', '月'),
  R('advice.furnace.half', 0.5, '租的卡不到配额的这么多、'), R('advice.furnace.rich', 18, '现金撑得过几个月、', '月'), R('advice.furnace.months', 6, '账上的钱够把配额租满几个月，才建议多租', '月'),
  R('advice.selfdev.runway', 10, '现金至少撑几个月才建议自研模型', '月'), R('advice.selfdev.cash', 3, '账上至少要有几倍的组队费用'),
  R('advice.reg.bad', 88, '监管压力到这个数算要紧（红色）；开始提醒的线是 reg.high'),
  R('advice.crime.from', 25, '涉嫌违法的黑料累计曝光到多少，开始提醒「经侦在盯着你」（经侦上门的线是 scandal.probeLine）'),
  R('advice.dirt.risk', 0.08, '月底爆出黑料的概率到这个数开始提醒'), R('advice.dirt.bad', 0.2, '到这个数算要紧（红色）'),
  R('advice.hype.line', 10, '热度低于这个数、'), R('advice.hype.from', 6, '而且过了第几个月，提醒「没人记得你了」', '月'),
  R('advice.rep.line', 30, '口碑低于这个数提醒「口碑太差」'),
  R('advice.ideo.equity', 44, '路线之争期间，股权低于这个数开始提醒', '%'), R('advice.ideo.newMonths', 3, '路线之争走完以后几个月内，提醒「意识形态页有新行动」', '月'),
  R('advice.ideo.heat', 60, '反共压力到这个数开始提醒'), R('advice.ideo.heatBad', 80, '到这个数算要紧（红色）'),
  R('advice.mute.bad', 1, '「先别提醒」：要紧的提醒静音几个月', '月'), R('advice.mute.other', 3, '其他提醒静音几个月', '月'),
];
const lits = { 'advice.cash.runway': 'rw >= 4', 'advice.cash.freeGpu': 'free >= 4', 'advice.proj.months': 'n > 3', 'advice.proj.urgent': 'n <= 2', 'advice.vam.months': 'n > 4', 'advice.morale.line': 'S.morale >= 35', 'advice.morale.staff': 'S.staff.length < 2',
  'advice.coup.rep': 'S.rep >= 34', 'advice.raise.perf': 'pf < 0.9', 'advice.raise.short': 'rw < 12', 'advice.raise.ripePerf': 'pf >= 1 &&', 'advice.raise.gap': '>= 10 && S.equity >= 40', 'advice.raise.dilute': 'S.equity * 0.85', 'advice.raise.boardWarn': 'eq < 55',
  'advice.raise.boost': 'S.raiseBoost < 0.15', 'advice.office.runway': 'G.runway(S) < 6 || S.cash < 2 *', 'advice.hire.runway': 'G.runway(S) < 8', 'advice.hire.star': 'c.skill >= 8', 'advice.hire.small': 'n < 3', 'advice.hire.cash': 'S.cash < 3 * c.salary',
  'advice.furnace.runway': 'rw >= 6)', 'advice.furnace.half': 'q * 0.5 && rw >= 18', 'advice.furnace.months': 'G.gpuPrice(S) * 6', 'advice.selfdev.runway': 'G.runway(S) < 10 || S.cash < 3 *', 'advice.reg.bad': 'S.reg >= 88', 'advice.crime.from': 'S.exposedCrime >= 25',
  'advice.dirt.risk': 'risk < 0.08', 'advice.dirt.bad': 'risk >= 0.2', 'advice.hype.line': 'S.hype < 10 && S.t > 6', 'advice.rep.line': 'S.rep < 30', 'advice.ideo.equity': 'S.equity >= 44', 'advice.ideo.newMonths': 'S.t - I.tEnd > 3', 'advice.ideo.heat': '< 60', 'advice.ideo.heatBad': 'I.heat >= 80',
  'advice.mute.bad': "h.lv === 'bad' ? 1 : 3" };
for (const [k, s] of Object.entries(lits)) if (!src.includes(s)) throw new Error(`参数 ${k}：旧源码里找不到「${s}」`);
const pf = path.join(root, 'src/data/tables/params.json'), pj = JSON.parse(readFileSync(pf, 'utf8'));
for (const r of PR) { if (r.key in pj.P) throw new Error('参数重复：' + r.key); pj.ROWS.push(r); pj.P[r.key] = r.value; }
writeFileSync(pf, pretty(pj) + '\n');
console.log('params.json：参谋', PR.length, '个，共', pj.ROWS.length, '个');

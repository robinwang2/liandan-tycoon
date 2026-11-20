// 引擎里的系数 → 平衡参数.xlsx。生成两样东西：
//   p-engine-params.json  给 rep.mjs 用的替换（原文必须恰好出现一次）
//   engine-params.rows.json  要加进 params.json 的参数行
// 每个参数的值必须原样出现在它替换掉的那段原文里（防手误）。
//   node gen-engine-params.mjs <输出目录>
import { writeFileSync } from 'node:fs';
import path from 'node:path';
const out = process.argv[2];
const pairs = [], rows = [], seen = new Map();
let use = '';
const lit = v => (Array.isArray(v) ? v.join(', ') : String(v));
// R(原文, 新文, [键, 值, 说明, 单位?]...)
function R(a, b, ...ps) {
  for (const [key, value, desc, unit] of ps) {
    if (seen.has(key)) { if (JSON.stringify(seen.get(key)) !== JSON.stringify(value)) throw new Error(`${key} 前后两个值不一样`); }
    else { seen.set(key, value); rows.push({ key, value, ...(unit ? { unit } : {}), desc, use }); }
    const lits = Array.isArray(value) ? (a.includes(`[${lit(value)}]`) ? [`[${lit(value)}]`] : value.map(String)) : [String(value).replace(/^4000000$/, '4e6').replace(/^100000$/, '1e5')];
    for (const plain of lits.map(x => x.replace(/^-/, ''))) if (!a.includes(plain)) throw new Error(`${key} = ${value}：原文里找不到「${plain}」\n${a}`);
    if (!b.includes(`P['${key}']`)) throw new Error(`${key}：新文里没用到`);
  }
  pairs.push([a, b]);
}
const reuse = (a, b) => pairs.push([a, b]);

use = '模型和算力';
R("if (key === 'devMult' && S.co.route === 'app') v *= 1.15;", "if (key === 'devMult' && S.co.route === 'app') v *= P['dev.appMult'];",
  ['dev.appMult', 1.15, '做应用的公司（不背自研模型的包袱）功能开发速度的倍数']);
R('export const capOf = E => 6.16 * Math.log2(1 + E / 20);', "export const capOf = E => P['model.capK'] * Math.log2(1 + E / P['model.capE0']);",
  ['model.capK', 6.16, '模型能力 = 这个数 × log2(1 + 有效算力 ÷ 下一个数)：有效算力每翻一倍，能力涨这么多'], ['model.capE0', 20, '同上']);
reuse('export const EofCap = c => 20 * (2 ** (c / 6.16) - 1);', "export const EofCap = c => P['model.capE0'] * (2 ** (c / P['model.capK']) - 1);");
R('export const frontierE = t => 11500 * 2.2 ** ((t - 1) / 12);       // 巨头的有效算力：每年翻 2.2 倍', "export const frontierE = t => P['rival.frontierE0'] * P['rival.frontierGrowth'] ** ((t - 1) / 12);   // 巨头的有效算力：每年翻几倍",
  ['rival.frontierE0', 11500, '第 1 个月巨头的有效算力（决定行业前沿能力）'], ['rival.frontierGrowth', 2.2, '巨头的有效算力每年翻几倍']);
R('export const baseE = t => frontierE(t) / 8;                        // 开源基座：人人都能白嫖的起点', "export const baseE = t => frontierE(t) / P['model.baseDiv'];        // 开源基座：人人都能白嫖的起点",
  ['model.baseDiv', 8, '开源基座的有效算力 = 巨头的 ÷ 这个数（人人都能白嫖的起点）']);
use = '员工';
R("const base = { res: A.tech * 0.5, eng: A.tech * 0.4, ops: A.cha * 0.35, biz: A.biz * 0.45, legal: A.net * 0.2 }[role];",
  "const base = { res: A.tech * P['staff.selfRes'], eng: A.tech * P['staff.selfEng'], ops: A.cha * P['staff.selfOps'], biz: A.biz * P['staff.selfBiz'], legal: A.net * P['staff.selfLegal'] }[role];",
  ['staff.selfRes', 0.5, '创始人自己也顶一份产出：研究 = 技术 × 这个数'], ['staff.selfEng', 0.4, '工程 = 技术 × 这个数'], ['staff.selfOps', 0.35, '运营 = 口才 × 这个数'],
  ['staff.selfBiz', 0.45, '商务 = 商业 × 这个数'], ['staff.selfLegal', 0.2, '法务公关 = 人脉 × 这个数']);
R("return (p * (0.6 + 0.8 * S.morale / 100) + base) * mod(S, 'outputMult');", "return (p * (P['staff.morale0'] + P['staff.moraleK'] * S.morale / 100) + base) * mod(S, 'outputMult');",
  ['staff.morale0', 0.6, '员工产出 × (这个数 + 下一个数 × 士气 ÷ 100)：士气为 0 时只剩六成'], ['staff.moraleK', 0.8, '同上']);
use = '模型和算力';
R("export const researchEff = S => (1 + power(S, 'res') / 35) * (1 + 0.05 * (S.founder.attrs.tech - 5)) * mod(S, 'researchMult') ** 0.7;",
  "export const researchEff = S => (1 + power(S, 'res') / P['model.resDiv']) * (1 + P['model.techK'] * (S.founder.attrs.tech - 5)) * mod(S, 'researchMult') ** P['model.resModExp'];",
  ['model.resDiv', 35, '炼丹效率 × (1 + 研究产出 ÷ 这个数)'], ['model.techK', 0.05, '创始人技术每比 5 高 1 点，炼丹效率 +这么多'], ['model.resModExp', 0.7, '炼丹加成叠多了会递减：取加成的这个次方']);
R('export const upCap = S => (rivalOf(S, S.upstream)?.cap ?? 30) - 1;', "export const upCap = S => (rivalOf(S, S.upstream)?.cap ?? 30) - P['app.upLag'];",
  ['app.upLag', 1, '接上游模型做应用：用到的能力比上游自己的模型低多少']);
R("export const usesOwn = S => !!S.model && (S.co.route === 'model' || S.model.cap >= upCap(S) - 2);", "export const usesOwn = S => !!S.model && (S.co.route === 'model' || S.model.cap >= upCap(S) - P['app.ownGap']);",
  ['app.ownGap', 2, '做应用的公司自研了模型：追到离上游差这么多以内，就改用自己的']);
R('export const qCeil = S => 35 + 0.65 * usedCap(S);', "export const qCeil = S => P['quality.ceil0'] + P['quality.ceilK'] * usedCap(S);",
  ['quality.ceil0', 35, '产品体验的天花板 = 这个数 + 下一个数 × 背后模型的能力'], ['quality.ceilK', 0.65, '同上']);
use = '显卡';
R('export const quotaFloor = S => S.quotaBase * 1.045 ** (Math.max(1, S.t) - 1);', "export const quotaFloor = S => S.quotaBase * P['gpu.quotaGrowth'] ** (Math.max(1, S.t) - 1);",
  ['gpu.quotaGrowth', 1.045, '行业产能：基础显卡配额每月乘这个数']);
R('S.staff.reduce((a, e) => a + 2 + e.skill, 0) * (1 + S.t / 36)', "S.staff.reduce((a, e) => a + P['bci.gpuBase'] + e.skill, 0) * (1 + S.t / P['bci.growMonths'])",
  ['bci.gpuBase', 2, '脑机实验成功以后：每个员工折合 这个数 + 能力 张卡'], ['bci.growMonths', 36, '再乘 (1 + 月份 ÷ 这个数)：固件年年升级', '月']);
R('return (n - x) * p + x * p * (2 + x / (2 * q));', "return (n - x) * p + x * p * (P['gpu.over0'] + x / (P['gpu.overDiv'] * q));",
  ['gpu.over0', 2, '超出配额的卡去现货市场租：第 k 张的单价约为 市价 × (这个数 + k ÷ (下一个数 × 配额))'], ['gpu.overDiv', 2, '同上']);
reuse('return x ? 2 + x / (2 * q) : 1; };', "return x ? P['gpu.over0'] + x / (P['gpu.overDiv'] * q) : 1; };");
use = '行动点';
R("export const apMax = S => 3 + (S.founder.attrs.mgmt >= 9 ? 1 : 0) + mod(S, 'apAdd');", "export const apMax = S => P['ap.base'] + (S.founder.attrs.mgmt >= P['ap.mgmtLine'] ? P['ap.mgmtBonus'] : 0) + mod(S, 'apAdd');",
  ['ap.base', 3, '每月的行动点'], ['ap.mgmtLine', 9, '创始人管理到这个数，每月多给行动点'], ['ap.mgmtBonus', 1, '多给几点']);
use = '黑料';
R("return 0.011 * (d.sev / 10) * (1 + S.hype / 120) * (1 + Math.min(1.5, S.users / 3000)) * mod(S, 'exposeMult') * (1 + 0.25 * big) / (1 + L / 12);",
  "return P['dirt.expose'] * (d.sev / P['dirt.sevDiv']) * (1 + S.hype / P['dirt.hypeDiv']) * (1 + Math.min(P['dirt.usersMax'], S.users / P['dirt.usersDiv'])) * mod(S, 'exposeMult') * (1 + P['dirt.bigMouth'] * big) / (1 + L / P['dirt.legalDiv']);",
  ['dirt.expose', 0.011, '一张黑料每月被扒出来的基础概率（严重度 10、热度 0、没有用户、没有法务时）'], ['dirt.sevDiv', 10, '概率 × 严重度 ÷ 这个数'],
  ['dirt.hypeDiv', 120, '× (1 + 热度 ÷ 这个数)'], ['dirt.usersMax', 1.5, '× (1 + min(这个数, 用户 ÷ 下一个数))'], ['dirt.usersDiv', 3000, '同上', '万'],
  ['dirt.bigMouth', 0.25, '每有一个大嘴巴员工 × (1 + 这个数)'], ['dirt.legalDiv', 12, '最后 ÷ (1 + 法务产出 ÷ 这个数)']);
reuse('const leakRisk = (S, f) => 1 - S.dirt.filter(d => d.t <= S.t - 1 && (!f || f(d)))', "const leakRisk = (S, f) => 1 - S.dirt.filter(d => d.t <= S.t + 1 - P['dirt.hideMonths'] && (!f || f(d)))");
use = '用户';
R('export const market = S => TRACKS[S.co.track].cap * Math.min(1, 0.02 * 1.057 ** S.t);', "export const market = S => TRACKS[S.co.track].cap * Math.min(1, P['market.start'] * P['market.growth'] ** S.t);",
  ['market.start', 0.02, '赛道的 AI 普及率：第 0 个月是盘子上限的这么多'], ['market.growth', 1.057, '每月乘这个数（到 1 为止）']);
R('export const shareCap = S => 0.04 + 0.22 * S.quality / 100 + 0.14 * clamp((usedCap(S) - (frontier(S.t) - 18)) / 22, 0, 1.3) + 0.1 * S.hype / 100;',
  "// 模型相对行业前沿的竞争力（0 ~ model.relMax）\nconst relCap = S => clamp((usedCap(S) - (frontier(S.t) - P['model.relGap'])) / P['model.relSpan'], 0, P['model.relMax']);\nexport const shareCap = S => P['share.base'] + P['share.quality'] * S.quality / 100 + P['share.model'] * relCap(S) + P['share.hype'] * S.hype / 100;",
  ['share.base', 0.04, '一家公司最多吃下赛道盘子的份额 = 这个数 + 下面三项'], ['share.quality', 0.22, '+ 这个数 × 产品体验 ÷ 100'], ['share.model', 0.14, '+ 这个数 × 模型竞争力'], ['share.hype', 0.1, '+ 这个数 × 热度 ÷ 100'],
  ['model.relGap', 18, '模型竞争力 = (用的模型能力 - (行业前沿 - 这个数)) ÷ 下一个数，限制在 0 ~ model.relMax'], ['model.relSpan', 22, '同上'], ['model.relMax', 1.3, '同上']);
use = '支出';
R("if (S.furnace?.on && S.furnace.data === 'buy') gpu *= 1.3;", "if (S.furnace?.on && S.furnace.data === 'buy') gpu *= P['furnace.buyMult'];",
  ['furnace.buyMult', 1.3, '训练数据用「合规采购」时，显卡账单乘这个数（设定.xlsx「数据源」里写的是多花 30%）']);
R("const api = usesOwn(S) ? 0 : S.users * TRACKS[S.co.track].infer * 2.5 * S.apiIdx * mod(S, 'apiCostMult') * (S.flags.bci_ok ? 0.65 : 1);",
  "const api = usesOwn(S) ? 0 : S.users * TRACKS[S.co.track].infer * P['cost.apiPerUser'] * S.apiIdx * mod(S, 'apiCostMult') * (S.flags.bci_ok ? P['bci.apiMult'] : 1);",
  ['cost.apiPerUser', 2.5, '调别人的模型：每月 API 费 = 用户 × 赛道的推理量 × 这个数 × API 价格指数'], ['bci.apiMult', 0.65, '脑机实验成功以后（员工大脑帮着跑推理），API 费的倍数']);
R('const misc = 1 + S.staff.length * 0.25 + S.users * 0.08;', "const misc = P['cost.misc'] + S.staff.length * P['cost.miscStaff'] + S.users * P['cost.miscUser'];",
  ['cost.misc', 1, '杂费：每月固定这么多', '万'], ['cost.miscStaff', 0.25, '每个员工再加这么多', '万'], ['cost.miscUser', 0.08, '每万用户再加这么多', '万']);
R("const k = mod(S, 'costMult') * (S.reg >= 70 ? 1.06 : 1);", "const k = mod(S, 'costMult') * (S.reg >= P['reg.high'] ? P['reg.costMult'] : 1);",
  ['reg.high', 70, '监管压力到这个数算「过高」：合规成本上升、用户增长变慢'], ['reg.costMult', 1.06, '监管压力过高时，所有支出的倍数']);
use = '收入';
R("rm = mod(S, 'revMult') ** 0.75 * (1 + 0.03 * (S.founder.attrs.biz - 5));", "rm = mod(S, 'revMult') ** P['rev.modExp'] * (1 + P['rev.bizK'] * (S.founder.attrs.biz - 5));",
  ['rev.modExp', 0.75, '收入加成叠多了会递减：取加成的这个次方'], ['rev.bizK', 0.03, '创始人商业每比 5 高 1 点，收入 +这么多']);
R('const payF = (0.5 + S.quality / 200) * (0.75 + S.rep / 400);', "const payF = (P['rev.pay0'] + S.quality / P['rev.payQDiv']) * (P['rev.payRep0'] + S.rep / P['rev.payRepDiv']);",
  ['rev.pay0', 0.5, '付费意愿 = (这个数 + 产品体验 ÷ 下一个数) × (rev.payRep0 + 口碑 ÷ rev.payRepDiv)'], ['rev.payQDiv', 200, '同上'], ['rev.payRep0', 0.75, '同上'], ['rev.payRepDiv', 400, '同上']);
R("const sub = S.users * T.arpu * payF * mod(S, 'payMult') ** 0.85 * rm;", "const sub = S.users * T.arpu * payF * mod(S, 'payMult') ** P['rev.payModExp'] * rm;",
  ['rev.payModExp', 0.85, '付费加成的这个次方（叠多了递减）']);
R('const api = S.model && S.ownModel ? 30 * 1.06 ** S.t * ([1, 0.6, 0.36, 0.22, 0.13, 0.08, 0.05][rank(S) - 1] ?? 0.03) * rm : 0;',
  "const api = S.model && S.ownModel ? P['rev.api0'] * P['rev.apiGrowth'] ** S.t * (P['rev.apiByRank'][rank(S) - 1] ?? P['rev.apiRankElse']) * rm : 0;",
  ['rev.api0', 30, '自研模型卖 API：第 0 个月榜首每月的收入', '万'], ['rev.apiGrowth', 1.06, '每月乘这个数'],
  ['rev.apiByRank', [1, 0.6, 0.36, 0.22, 0.13, 0.08, 0.05], '按跑分榜名次打折：第 1 名、第 2 名……'], ['rev.apiRankElse', 0.03, '排在更后面的']);
R("const b2b = power(S, 'biz') * 2 * (0.4 + usedCap(S) / 100) * (1 + S.t / 36) * mod(S, 'b2bMult') * rm;", "const b2b = power(S, 'biz') * P['rev.b2bK'] * (P['rev.b2bCap0'] + usedCap(S) / 100) * (1 + S.t / P['rev.b2bGrowMonths']) * mod(S, 'b2bMult') * rm;",
  ['rev.b2bK', 2, '企业订单 = 商务产出 × 这个数 × (下一个数 + 模型能力 ÷ 100) × (1 + 月份 ÷ rev.b2bGrowMonths)', '万'], ['rev.b2bCap0', 0.4, '同上'], ['rev.b2bGrowMonths', 36, '同上', '月']);
R('export const unit = S => Math.max(10, costs(S).total);', "export const unit = S => Math.max(P['money.unitMin'], costs(S).total);",
  ['money.unitMin', 10, '「一个月支出」（事件里的金额单位）最少按这么多算', '万']);
use = '估值和融资';
R('const uS = clamp((S.users + S.fake) / tg.users, 0, 1.5), rS = clamp(revenue(S).total / tg.rev, 0, 1.5);', "const uS = clamp((S.users + S.fake) / tg.users, 0, P['perf.max']), rS = clamp(revenue(S).total / tg.rev, 0, P['perf.max']);",
  ['perf.max', 1.5, '业绩打分：用户、收入各自和下一轮的门槛比，最多算这么多倍']);
R("const tS = S.model ? ([1.4, 1.15, 0.95, 0.75, 0.55, 0.4, 0.3][rank(S) - 1] ?? 0.2) * (S.co.route === 'model' ? 1 : 0.7) : 0;",
  "const tS = S.model ? (P['perf.techByRank'][rank(S) - 1] ?? P['perf.techElse']) * (S.co.route === 'model' ? 1 : P['perf.appTech']) : 0;",
  ['perf.techByRank', [1.4, 1.15, 0.95, 0.75, 0.55, 0.4, 0.3], '技术分：按跑分榜名次，第 1 名、第 2 名……'], ['perf.techElse', 0.2, '排在更后面的'], ['perf.appTech', 0.7, '做应用的公司，技术分打几折']);
R('return 0.25 + 0.6 * s[0] + 0.25 * s[1] + 0.1 * s[2];', "return P['perf.base'] + P['perf.w'][0] * s[0] + P['perf.w'][1] * s[1] + P['perf.w'][2] * s[2];",
  ['perf.base', 0.25, '业绩 = 这个数 + 用户、收入、技术三项分数从高到低分别乘下面三个权重'], ['perf.w', [0.6, 0.25, 0.1], '同上：最高的一项、第二、第三的权重']);
R("return tg.base * perf(S) * (0.55 + S.bubble / 100) * (1 + S.hype / 300) * (1 + 0.03 * (S.founder.attrs.cha - 5)) * mod(S, 'raiseMult') * (1 + S.raiseBoost);",
  "return tg.base * perf(S) * (P['val.bubble0'] + S.bubble / 100) * (1 + S.hype / P['val.hypeDiv']) * (1 + P['val.chaK'] * (S.founder.attrs.cha - 5)) * mod(S, 'raiseMult') * (1 + S.raiseBoost);",
  ['val.bubble0', 0.55, '估值 = 下一轮的基准估值 × 业绩 × (这个数 + 泡沫 ÷ 100) × (1 + 热度 ÷ val.hypeDiv) × ……'], ['val.hypeDiv', 300, '同上'], ['val.chaK', 0.03, '创始人口才每比 5 高 1 点，估值 +这么多']);
use = '检定';
R("export const pCheck = (S, attr, dc) => clamp((21 + S.founder.attrs[attr] + mod(S, 'checkAdd') - dc) / 20, 0.05, 0.95);",
  "export const pCheck = (S, attr, dc) => clamp((P['check.base'] + S.founder.attrs[attr] + mod(S, 'checkAdd') - dc) / P['check.span'], P['check.min'], P['check.max']);",
  ['check.base', 21, '属性检定的成功率 = (这个数 + 属性 - 难度) ÷ 下一个数（像掷一个 20 面骰）'], ['check.span', 20, '同上'], ['check.min', 0.05, '成功率最低'], ['check.max', 0.95, '成功率最高']);
R('export const pOdds = (S, p) => clamp(p + (S.founder.attrs.luck - 5) * 0.03, 0.03, 0.97);', "export const pOdds = (S, p) => clamp(p + (S.founder.attrs.luck - 5) * P['odds.luckK'], P['odds.min'], P['odds.max']);",
  ['odds.luckK', 0.03, '看运气的选项：运气每比 5 高 1 点，成功率 +这么多'], ['odds.min', 0.03, '最低'], ['odds.max', 0.97, '最高']);
use = '员工';
R("const skill = clamp(Math.round(rf(S, 2.2, 6.6) + S.stage * 0.55 + mod(S, 'hireSkill') + (A.net - 5) * 0.15 + S.rep / 70 + bonus), 1, 10);",
  "const skill = clamp(Math.round(rf(S, P['staff.skillMin'], P['staff.skillMax']) + S.stage * P['staff.skillStage'] + mod(S, 'hireSkill') + (A.net - 5) * P['staff.skillNet'] + S.rep / P['staff.skillRepDiv'] + bonus), 1, 10);",
  ['staff.skillMin', 2.2, '人才市场上候选人的能力：这个数到下一个数之间随机，再加下面几项，四舍五入到 1~10'], ['staff.skillMax', 6.6, '同上'], ['staff.skillStage', 0.55, '每融完一轮 +这么多'],
  ['staff.skillNet', 0.15, '创始人人脉每比 5 高 1 点 +这么多'], ['staff.skillRepDiv', 70, '+ 口碑 ÷ 这个数']);
R('const quirk = rnd(S) < 0.3 ? pick(S, Object.keys(STAFF_QUIRKS)) : null;', "const quirk = rnd(S) < P['staff.quirkOdds'] ? pick(S, Object.keys(STAFF_QUIRKS)) : null;",
  ['staff.quirkOdds', 0.3, '候选人带怪癖的概率']);
R('salary: +((1.2 + 0.09 * skill * skill) * ROLES[role].pay', "salary: +((P['staff.pay0'] + P['staff.paySkill'] * skill * skill) * ROLES[role].pay",
  ['staff.pay0', 1.2, '月薪 = (这个数 + 下一个数 × 能力²) × 岗位系数 × 怪癖系数', '万'], ['staff.paySkill', 0.09, '同上', '万']);
R('S.cands = Array.from({ length: 4 }, () => genStaff(S, pick(S, w), bonus));', "S.cands = Array.from({ length: P['staff.cands'] }, () => genStaff(S, pick(S, w), bonus));",
  ['staff.cands', 4, '人才市场每月刷出几个候选人']);
use = '黑料';
R('if (old) { old.sev = Math.min(45, old.sev + sev * 0.6); return old; }', "if (old) { old.sev = Math.min(P['dirt.stackMax'], old.sev + sev * P['dirt.stackK']); return old; }",
  ['dirt.stackMax', 45, '同一种黑料再犯一次：严重度叠上去，最多到这个数'], ['dirt.stackK', 0.6, '叠的时候按新黑料严重度的几成算']);
use = '成就';
R("if (S.dirt.length >= 6) award(S, 'dirty');", "if (S.dirt.length >= P['ach.dirty']) award(S, 'dirty');", ['ach.dirty', 6, '成就「黑料收藏家」：保险柜里同时躺着几张黑料（设定.xlsx「成就」里的说明要一起改）']);
use = '仪表';
R('const soft = (cur, v) => (v > 0 ? v * clamp(1.25 - cur / 100, 0.3, 1) : v);', "const soft = (cur, v) => (v > 0 ? v * clamp(P['gauge.soft0'] - cur / 100, P['gauge.softMin'], 1) : v);",
  ['gauge.soft0', 1.25, '热度、口碑、士气越高越难再涨：涨的量 × (这个数 - 当前值 ÷ 100)，限制在 下一个数 ~ 1'], ['gauge.softMin', 0.3, '同上']);
use = '效果';
R('else S.quality = clamp(S.quality + v * 1.5, 0, 100); },', "else S.quality = clamp(S.quality + v * P['fx.techQuality'], 0, 100); },",
  ['fx.techQuality', 1.5, '没有自研模型的公司：效果里的「模型能力 +1」换成产品体验 +这么多']);
R('quota: (S, v) => { S.quotaAdd = Math.max(-0.6, S.quotaAdd + v / 100); },', "quota: (S, v) => { S.quotaAdd = Math.max(P['gpu.quotaAddMin'], S.quotaAdd + v / 100); },",
  ['gpu.quotaAddMin', -0.6, '事件对显卡配额的增减（按比例叠加）最低到这个数']);
R("const e = genStaff(S, role, v === 'gainStar' ? 9 : 2);", "const e = genStaff(S, role, v === 'gainStar' ? P['staff.starBonus'] : P['staff.gainBonus']);",
  ['staff.gainBonus', 2, '事件送来的新员工：能力额外 +这么多'], ['staff.starBonus', 9, '事件送来的顶级研究员：先按 +这么多生成，再把能力定在下面的范围']);
R("if (v === 'gainStar') { e.skill = ri(S, 9, 10); e.quirk = 'genius'; e.salary = +((1.2 + 0.09 * e.skill ** 2) * 1.25 * 1.35).toFixed(1); }",
  "if (v === 'gainStar') { e.skill = ri(S, P['staff.starMin'], P['staff.starMax']); e.quirk = 'genius'; e.salary = +((P['staff.pay0'] + P['staff.paySkill'] * e.skill ** 2) * ROLES.res.pay * STAFF_QUIRKS.genius.pay).toFixed(1); }",
  ['staff.starMin', 9, '顶级研究员的能力范围'], ['staff.starMax', 10, '同上']);
R('temp: (S, v) => { for (const t of [].concat(v)) S.temp.push({ key: t.key, mult: t.mult, add: t.add, until: S.t + (t.months || 6) }); },', "temp: (S, v) => { for (const t of [].concat(v)) S.temp.push({ key: t.key, mult: t.mult, add: t.add, until: S.t + (t.months || P['fx.tempMonths']) }); },",
  ['fx.tempMonths', 6, '限时修正没写几个月时，默认几个月', '月']);
reuse("值: t.mult != null ? '×' + t.mult : sg(t.add), 月: t.months || 6 }", "值: t.mult != null ? '×' + t.mult : sg(t.add), 月: t.months || P['fx.tempMonths'] }");
use = '特殊项目';
R("kind: v.kind || 'res', need: v.need || 3, done: 0, t: S.t, due: S.t + (v.months || 8),", "kind: v.kind || 'res', need: v.need || P['proj.need'], done: 0, t: S.t, due: S.t + (v.months || P['proj.months']),",
  ['proj.need', 3, '特殊项目没写工作量时，默认几个月的工作量'], ['proj.months', 8, '没写期限时，默认几个月', '月']);
use = '随机事件';
R('S.t - (S.seen[ev.id] ?? -99) >= (ev.cd ?? 10)', "S.t - (S.seen[ev.id] ?? -99) >= (ev.cd ?? P['event.cd'])", ['event.cd', 10, '可重复的随机事件没写冷却时，默认隔几个月', '月']);
R("const w = ev => (ev.weight ?? 1) * (ev.cat === S.lastCat ? 0.35 : 1);", "const w = ev => (ev.weight ?? 1) * (ev.cat === S.lastCat ? P['event.sameCat'] : 1);",
  ['event.sameCat', 0.35, '和上一个随机事件同一类的，权重乘这个数（免得连着来同一类）']);
use = '特殊项目';
R("if (p.kind === 'gpu') return clamp(Math.max(0, S.gpu - inferNeed(S)) / Math.max(8, 0.25 * quota(S)), 0, 2.5) / share;", "if (p.kind === 'gpu') return clamp(Math.max(0, S.gpu - inferNeed(S)) / Math.max(P['proj.gpuMin'], P['proj.gpuShare'] * quota(S)), 0, P['proj.max']) / share;",
  ['proj.gpuMin', 8, '显卡类项目：每月进度 = 空闲显卡 ÷ max(这个数, 下一个数 × 配额)'], ['proj.gpuShare', 0.25, '同上'], ['proj.max', 2.5, '每月进度最多（同类项目同时做几个会被摊薄）']);
R('return clamp(power(S, p.kind) / (6 + 9 * S.stage), 0.35, 2.5) / share;', "return clamp(power(S, p.kind) / (P['proj.need0'] + P['proj.needStage'] * S.stage), P['proj.min'], P['proj.max']) / share;",
  ['proj.need0', 6, '其他项目：每月进度 = 对应人手的产出 ÷ (这个数 + 下一个数 × 已融轮次)'], ['proj.needStage', 9, '同上'], ['proj.min', 0.35, '每月进度最少']);
use = '员工说明';
reuse("lines.push(tx(S, 'impact.eng.quality', { 体验: (d * 0.08 * dm * Math.max(0, 1 - S.quality / qCeil(S))).toFixed(1) })", "lines.push(tx(S, 'impact.eng.quality', { 体验: (d * P['quality.engK'] * dm * Math.max(0, 1 - S.quality / qCeil(S))).toFixed(1) })");
reuse("if (S.ownModel) lines.push(tx(S, 'impact.eng.boom', { 概率: (d / 6).toFixed(1) }));", "if (S.ownModel) lines.push(tx(S, 'impact.eng.boom', { 概率: (d / (P['furnace.boomEngDiv'] / 100)).toFixed(1) }));");
reuse("lines.push(tx(S, 'impact.ops.users', { 用户: fmtUsers(d / 10 * gm * (0.5 + S.t / 36)) }), tx(S, 'impact.ops.growth', { 增长: ((Math.min(0.02, b.ops / 1000) - Math.min(0.02, a.ops / 1000)) * gm * 100).toFixed(2) }));",
  "lines.push(tx(S, 'impact.ops.users', { 用户: fmtUsers(d / P['users.seedOps'] * gm * (P['users.seedT0'] + S.t / P['users.seedTMonths'])) }), tx(S, 'impact.ops.growth', { 增长: ((Math.min(P['users.opsMax'], b.ops / P['users.opsDiv']) - Math.min(P['users.opsMax'], a.ops / P['users.opsDiv'])) * gm * 100).toFixed(2) }));");
reuse("tx(S, 'impact.legal.expose', { 概率: ((1 - (1 + a.legal / 12) / (1 + b.legal / 12)) * 100).toFixed(0) })", "tx(S, 'impact.legal.expose', { 概率: ((1 - (1 + a.legal / P['dirt.legalDiv']) / (1 + b.legal / P['dirt.legalDiv'])) * 100).toFixed(0) })");
reuse("const lines = [], dm = mod(S, 'devMult'), gm = TRACKS[S.co.track].growth * mod(S, 'growthMult') ** 0.5;", "const lines = [], dm = mod(S, 'devMult'), gm = TRACKS[S.co.track].growth * mod(S, 'growthMult') ** P['users.growModExp'];");
use = '特殊项目';
R('S.ap--; p.done += 1 + (k - 5) * 0.15;', "S.ap--; p.done += 1 + (k - 5) * P['proj.pushK'];", ['proj.pushK', 0.15, '亲自攻关：推进 1 个月的工作量，相关属性每比 5 高 1 点再 +这么多']);
use = '用户';
R("const T = TRACKS[S.co.track], O = power(S, 'ops'), gm = T.growth * mod(S, 'growthMult') ** 0.5 * (S.reg >= 70 ? 0.8 : 1);", "const T = TRACKS[S.co.track], O = power(S, 'ops'), gm = T.growth * mod(S, 'growthMult') ** P['users.growModExp'] * (S.reg >= P['reg.high'] ? P['reg.growthMult'] : 1);",
  ['users.growModExp', 0.5, '用户增长加成的这个次方（叠多了递减）'], ['reg.growthMult', 0.8, '监管压力过高时，用户增长的倍数']);
reuse('const rel = clamp((usedCap(S) - (frontier(S.t) - 18)) / 22, 0, 1.3);     // 模型相对前沿的竞争力', 'const rel = relCap(S);                                                  // 模型相对前沿的竞争力');
R('const attract = 0.005 + 0.025 * S.quality / 100 + 0.03 * S.hype / 100 + 0.025 * rel + Math.min(0.02, O / 1000);',
  "const attract = P['users.attract0'] + P['users.attractQ'] * S.quality / 100 + P['users.attractHype'] * S.hype / 100 + P['users.attractModel'] * rel + Math.min(P['users.opsMax'], O / P['users.opsDiv']);",
  ['users.attract0', 0.005, '每月新增用户率 = 这个数 + 下面几项（再乘赛道增速、剩余空间）'], ['users.attractQ', 0.025, '+ 这个数 × 产品体验 ÷ 100'], ['users.attractHype', 0.03, '+ 这个数 × 热度 ÷ 100'],
  ['users.attractModel', 0.025, '+ 这个数 × 模型竞争力'], ['users.opsMax', 0.02, '+ min(这个数, 运营产出 ÷ 下一个数)'], ['users.opsDiv', 1000, '同上']);
R("const churn = Math.max(0.005, 0.035 + 0.05 * (1 - S.rep / 100) + mod(S, 'churnAdd') + S.outage * 0.2);",
  "const churn = Math.max(P['users.churnMin'], P['users.churn0'] + P['users.churnRep'] * (1 - S.rep / 100) + mod(S, 'churnAdd') + S.outage * P['users.churnOutage']);",
  ['users.churnMin', 0.005, '每月流失率最低'], ['users.churn0', 0.035, '每月流失率 = 这个数 + 下一个数 × (1 - 口碑 ÷ 100) + 宕机比例 × users.churnOutage'], ['users.churnRep', 0.05, '同上'], ['users.churnOutage', 0.2, '同上']);
R('const seed = (0.2 + S.hype / 40 + O / 10 + S.quality / 60) * gm * (0.5 + S.t / 36) * (1 - S.outage);',
  "const seed = (P['users.seed0'] + S.hype / P['users.seedHype'] + O / P['users.seedOps'] + S.quality / P['users.seedQ']) * gm * (P['users.seedT0'] + S.t / P['users.seedTMonths']) * (1 - S.outage);",
  ['users.seed0', 0.2, '自然流量（每月）= (这个数 + 热度 ÷ users.seedHype + 运营产出 ÷ users.seedOps + 产品体验 ÷ users.seedQ) × 赛道增速 × (users.seedT0 + 月份 ÷ users.seedTMonths)', '万'],
  ['users.seedHype', 40, '同上'], ['users.seedOps', 10, '同上'], ['users.seedQ', 60, '同上'], ['users.seedT0', 0.5, '同上'], ['users.seedTMonths', 36, '同上', '月']);
R('S.fake *= 0.97;', "S.fake *= P['users.fakeDecay'];", ['users.fakeDecay', 0.97, '刷出来的假用户每月剩下这么多']);
use = '显卡';
R("if (S.outage > 0.05) news(S, tx(S, 'news.outage',", "if (S.outage > P['gpu.outageNews']) news(S, tx(S, 'news.outage',", ['gpu.outageNews', 0.05, '推理缺口超过这个比例，才发「服务器繁忙」的新闻']);
use = '模型和算力';
R("const pBoom = clamp(0.07 - power(S, 'eng') / 600, 0.015, 0.07) * mod(S, 'boomMult');", "const pBoom = clamp(P['furnace.boom'] - power(S, 'eng') / P['furnace.boomEngDiv'], P['furnace.boomMin'], P['furnace.boom']) * mod(S, 'boomMult');",
  ['furnace.boom', 0.07, '丹炉每月炸炉的概率（没有工程师时，也是上限）'], ['furnace.boomEngDiv', 600, '减去 工程产出 ÷ 这个数'], ['furnace.boomMin', 0.015, '最低']);
R("if (free > 0 && S.t > 3 && rnd(S) < pBoom) { gain = -S.E * 0.12;", "if (free > 0 && S.t > P['furnace.safeMonths'] && rnd(S) < pBoom) { gain = -S.E * P['furnace.boomLoss'];",
  ['furnace.safeMonths', 3, '开局头几个月不会炸炉', '月'], ['furnace.boomLoss', 0.12, '炸炉损失已炼算力的几成']);
R("EofCap(Math.max(...S.rivals.map(r => r.cap)) - 2)", "EofCap(Math.max(...S.rivals.map(r => r.cap)) - P['furnace.distillGap'])", ['furnace.distillGap', 2, '蒸馏别人的模型：能力最多追到最强对手减这么多']);
use = '仪表';
R('S.quality = clamp(S.quality + E * 0.08 * dm * Math.max(0, 1 - S.quality / qCeil(S)) - 0.6, 5, 100);', "S.quality = clamp(S.quality + E * P['quality.engK'] * dm * Math.max(0, 1 - S.quality / qCeil(S)) - P['quality.decay'], P['quality.min'], 100);",
  ['quality.engK', 0.08, '产品体验每月涨 工程产出 × 这个数 × (1 - 体验 ÷ 天花板)'], ['quality.decay', 0.6, '产品体验每月自然下滑'], ['quality.min', 5, '产品体验最低']);
use = '员工';
R("if (S.streak.x996 && S.streak.x996 % 8 === 0) addDirt(S, 'overwork');", "if (S.streak.x996 && S.streak.x996 % P['work.dirtMonths'] === 0) addDirt(S, 'overwork');", ['work.dirtMonths', 8, '连续 996 每满几个月，留一张「过劳」黑料', '月']);
use = '显卡';
R("if (S.gpu >= 0.85 * q) S.quotaEarn = (S.quotaEarn || 0) + (0.07 * q + 0.35 * Math.max(0, S.gpu - q)) / k;", "if (S.gpu >= P['gpu.fullLine'] * q) S.quotaEarn = (S.quotaEarn || 0) + (P['gpu.earnFull'] * q + P['gpu.earnOver'] * Math.max(0, S.gpu - q)) / k;",
  ['gpu.fullLine', 0.85, '租的卡到配额的这么多就算「租满了」：供应商每月多给配额'], ['gpu.earnFull', 0.07, '租满了：配额每月多给 当前配额 × 这个数'], ['gpu.earnOver', 0.35, '超租的部分有这么多转成长约']);
R("else if (S.gpu < 0.5 * q) S.quotaEarn = (S.quotaEarn || 0) * 0.97;", "else if (S.gpu < P['gpu.idleLine'] * q) S.quotaEarn = (S.quotaEarn || 0) * P['gpu.idleDecay'];",
  ['gpu.idleLine', 0.5, '租的不到配额的这么多（闲置过半）：长约慢慢收回'], ['gpu.idleDecay', 0.97, '那时长约每月剩下这么多']);
use = '仪表';
R("S.hype = clamp(S.hype * (1 - (0.11 + Math.max(0, S.hype - 60) * 0.002) * mod(S, 'hypeDecayMult')), 0, 100);", "S.hype = clamp(S.hype * (1 - (P['hype.decay'] + Math.max(0, S.hype - P['hype.decayFrom']) * P['hype.decayK']) * mod(S, 'hypeDecayMult')), 0, 100);",
  ['hype.decay', 0.11, '热度每月消退的比例'], ['hype.decayFrom', 60, '热度超过这个数的部分消退得更快'], ['hype.decayK', 0.002, '每高 1 点多消退这么多']);
R("S.morale = clamp(S.morale + (60 - S.morale) * 0.1 + mod(S, 'moraleAdd') - (rw < 3 ? 2 : 0), 0, 100);", "S.morale = clamp(S.morale + (P['morale.home'] - S.morale) * P['morale.pull'] + mod(S, 'moraleAdd') - (rw < P['morale.brokeLine'] ? P['morale.brokeHit'] : 0), 0, 100);",
  ['morale.home', 60, '士气每月往这个数回归'], ['morale.pull', 0.1, '每月回归差距的这么多'], ['morale.brokeLine', 3, '现金撑不过几个月时', '月'], ['morale.brokeHit', 2, '士气每月再掉这么多']);
R("S.rep = clamp(S.rep + mod(S, 'repAdd') + (S.quality > 70 ? 0.3 : S.quality < 30 ? -0.3 : 0) - S.outage * 4, 0, 100);", "S.rep = clamp(S.rep + mod(S, 'repAdd') + (S.quality > P['rep.qHigh'] ? P['rep.qStep'] : S.quality < P['rep.qLow'] ? -P['rep.qStep'] : 0) - S.outage * P['rep.outageHit'], 0, 100);",
  ['rep.qHigh', 70, '产品体验高于这个数，口碑每月涨'], ['rep.qLow', 30, '低于这个数，口碑每月掉'], ['rep.qStep', 0.3, '涨或掉多少'], ['rep.outageHit', 4, '宕机比例 × 这个数，从口碑里扣']);
R("const dr = 0.7 + S.hype / 90 + Math.log10(1 + S.users) / 3.5 + (S.co.track === 'companion' ? 0.3 : 0) + mod(S, 'regAdd');", "const dr = P['reg.drift'] + S.hype / P['reg.hypeDiv'] + Math.log10(1 + S.users) / P['reg.usersDiv'] + (S.co.track === 'companion' ? P['reg.companion'] : 0) + mod(S, 'regAdd');",
  ['reg.drift', 0.7, '监管压力每月上涨 = 这个数 + 热度 ÷ reg.hypeDiv + lg(1 + 用户) ÷ reg.usersDiv'], ['reg.hypeDiv', 90, '同上'], ['reg.usersDiv', 3.5, '同上'], ['reg.companion', 0.3, 'AI 陪伴赛道每月多涨这么多']);
R('S.bubble = clamp(S.bubble + (S.burstT ? rf(S, 0.1, 0.8) : rf(S, 0.4, 1.5)), 0, 100);', "S.bubble = clamp(S.bubble + (S.burstT ? rf(S, P['bubble.afterMin'], P['bubble.afterMax']) : rf(S, P['bubble.riseMin'], P['bubble.riseMax'])), 0, 100);",
  ['bubble.riseMin', 0.4, '行业泡沫每月上涨：这个数到下一个数之间随机'], ['bubble.riseMax', 1.5, '同上'], ['bubble.afterMin', 0.1, '泡沫破过一次以后：每月上涨的范围'], ['bubble.afterMax', 0.8, '同上']);
use = '显卡';
R('S.gpuBase = clamp(S.gpuBase + rf(S, -0.06, 0.07), 1.1, 2.1);', "S.gpuBase = clamp(S.gpuBase + rf(S, P['gpu.priceStepMin'], P['gpu.priceStepMax']), P['gpu.priceMin'], P['gpu.priceMax']);",
  ['gpu.priceStepMin', -0.06, '显卡市价每月随机变动：这个数到下一个数之间', '万'], ['gpu.priceStepMax', 0.07, '同上', '万'], ['gpu.priceMin', 1.1, '显卡市价最低（每张每月）', '万'], ['gpu.priceMax', 2.1, '最高', '万']);
R('S.apiIdx = clamp(S.apiIdx * rf(S, 0.97, 1.01), 0.4, 1.6);', "S.apiIdx = clamp(S.apiIdx * rf(S, P['api.stepMin'], P['api.stepMax']), P['api.min'], P['api.max']);",
  ['api.stepMin', 0.97, 'API 价格指数每月乘一个这个数到下一个数之间的随机数（大模型越来越便宜）'], ['api.stepMax', 1.01, '同上'], ['api.min', 0.4, '价格指数最低'], ['api.max', 1.6, '最高']);
use = '对手';
R('r.drift = clamp(r.drift + rf(S, -0.3, 0.3), -4, 4);', "r.drift = clamp(r.drift + rf(S, -P['rival.driftStep'], P['rival.driftStep']), -P['rival.driftMax'], P['rival.driftMax']);",
  ['rival.driftStep', 0.3, '对手的能力每月随机漂移 ±这么多'], ['rival.driftMax', 4, '漂移累计最多 ±这么多']);
R('r.cap = Math.min(AGI_CAP - 0.5, frontier(S.t + 1) + r.off + r.drift);', "r.cap = Math.min(AGI_CAP - P['rival.agiGap'], frontier(S.t + 1) + r.off + r.drift);", ['rival.agiGap', 0.5, '对手的能力最多到 AGI 线减这么多（AGI 只能由你炼出来）']);
R('r.hype *= 0.93;', "r.hype *= P['rival.hypeDecay'];", ['rival.hypeDecay', 0.93, '对手的热度每月剩下这么多']);
R('r.bench = r.cap + r.cheat + rf(S, -1, 1.5); r.next = ri(S, 4, 8); r.hype = clamp(r.hype + 18, 0, 100);', "r.bench = r.cap + r.cheat + rf(S, P['rival.benchMin'], P['rival.benchMax']); r.next = ri(S, P['rival.releaseMin'], P['rival.releaseMax']); r.hype = clamp(r.hype + P['rival.releaseHype'], 0, 100);",
  ['rival.benchMin', -1, '对手发布新模型：跑分 = 能力 + 注水 + 这个数到下一个数之间的随机数'], ['rival.benchMax', 1.5, '同上'], ['rival.releaseMin', 4, '对手隔几个月发布一次（随机）', '月'], ['rival.releaseMax', 8, '同上', '月'], ['rival.releaseHype', 18, '对手发布新模型，热度 +这么多']);
use = '员工';
R('if (S.morale < 25 && S.staff.length && rnd(S) < 0.3) {', "if (S.morale < P['morale.quitLine'] && S.staff.length && rnd(S) < P['morale.quitOdds']) {", ['morale.quitLine', 25, '士气低于这个数，每月可能有人提离职'], ['morale.quitOdds', 0.3, '每月有人提离职的概率']);
use = '随机事件';
R("if (S.t % 2 === 0 && NEWS.length) news(", "if (S.t % P['news.every'] === 0 && NEWS.length) news(", ['news.every', 2, '每几个月滚动一条行业新闻', '月']);
use = '行动点';
R('S.ap = clamp(apMax(S) + S.apNext, 1, 7); S.apNext = 0;', "S.ap = clamp(apMax(S) + S.apNext, P['ap.min'], P['ap.max']); S.apNext = 0;", ['ap.min', 1, '每月行动点最少'], ['ap.max', 7, '每月行动点最多']);
use = '成就';
R("if (S.users >= 100) award(S, 'm100');", "if (S.users >= P['ach.m100']) award(S, 'm100');", ['ach.m100', 100, '成就「百万雄师」：用户突破多少（设定.xlsx「成就」里的说明要一起改）', '万']);
R("if (S.users >= 10000) award(S, 'y1');", "if (S.users >= P['ach.y1']) award(S, 'y1');", ['ach.y1', 10000, '成就「一亿人的选择」：用户突破多少', '万']);
R("if (S.streak.x996 >= 24) award(S, 'x996');", "if (S.streak.x996 >= P['ach.x996']) award(S, 'x996');", ['ach.x996', 24, '成就「福报传人」：连续几个月 996', '月']);
R("if (S.stage === 0 && S.t >= 25) award(S, 'boot');", "if (S.stage === 0 && S.t >= P['ach.boot']) award(S, 'boot');", ['ach.boot', 25, '成就「不拿一分钱」：不融资撑到第几个月（25 = 撑过 24 个月）', '月']);
R("if (S.model.infl >= 4) award(S, 'fake1');", "if (S.model.infl >= P['ach.fake1']) award(S, 'fake1');", ['ach.fake1', 4, '成就「遥遥领先」：登顶时跑分里注水至少多少']);
use = '结局';
R("return endGame(S, val >= 4e6 ? 'giant' : val >= 1e5 ? 'unicorn' : S.streak.profit >= 3 ? 'small' : 'zombie');", "return endGame(S, val >= P['end.giant'] ? 'giant' : val >= P['end.unicorn'] ? 'unicorn' : S.streak.profit >= P['end.smallProfit'] ? 'small' : 'zombie');",
  ['end.giant', 4000000, '打满全程：估值到这个数算「巨头」结局（400 亿）', '万'], ['end.unicorn', 100000, '估值到这个数算「独角兽」结局（10 亿）', '万'], ['end.smallProfit', 3, '都不够的话：最后连续盈利几个月算「小而美」，否则「僵尸」', '月']);
R("S.flags.phoenixUsed = 1; S.cash = 6 * unit(S);", "S.flags.phoenixUsed = 1; S.cash = P['perk.phoenixMonths'] * unit(S);", ['perk.phoenixMonths', 6, '董事会卡「东山再起」：现金见底时补几个月的支出', '月']);
R("delete S.flags.revive; S.cash = 4 * unit(S);", "delete S.flags.revive; S.cash = P['meta.reviveMonths'] * unit(S);", ['meta.reviveMonths', 4, '局外成长「家底殷实」：现金见底时家里打来几个月的支出', '月']);
use = '黑料';
R('if (S.t - d.t >= 2 && rnd(S) < exposeP(S, d))', "if (S.t - d.t >= P['dirt.hideMonths'] && rnd(S) < exposeP(S, d))", ['dirt.hideMonths', 2, '新留下的黑料至少过几个月才可能被扒出来', '月']);
use = '系统事件';
R("if (S.reg >= 100 && !S.cd.crack) { S.cd.crack = S.t + 10; queueEvent(S, 'crackdown'); }", "if (S.reg >= 100 && !S.cd.crack) { S.cd.crack = S.t + P['reg.crackCd']; queueEvent(S, 'crackdown'); }",
  ['reg.crackCd', 10, '监管压力满了引来「监管重锤」以后，至少隔几个月才会再来', '月']);
R("if (!S.burstT && S.t > 24 && ((S.bubble >= 78 && rnd(S) < 0.14) || (S.t >= 56 && rnd(S) < 0.12))) queueEvent(S, 'bubble_burst');",
  "if (!S.burstT && S.t > P['bubble.burstFrom'] && ((S.bubble >= P['bubble.burstLine'] && rnd(S) < P['bubble.burstOdds']) || (S.t >= P['bubble.lateFrom'] && rnd(S) < P['bubble.lateOdds']))) queueEvent(S, 'bubble_burst');",
  ['bubble.burstFrom', 24, '第几个月以后泡沫才可能破', '月'], ['bubble.burstLine', 78, '泡沫高于这个数时'], ['bubble.burstOdds', 0.14, '每月破的概率'], ['bubble.lateFrom', 56, '第几个月起，不管泡沫多高都可能破', '月'], ['bubble.lateOdds', 0.12, '那时每月破的概率']);
R("if (S.stage >= 2 && !S.cd.coup && ((S.equity < 45 && (S.rep < 30 || S.morale < 28 || S.exposed >= 35) && rnd(S) < 0.35) || (S.equity < 25 && rnd(S) < 0.04))) { S.cd.coup = S.t + 18; queueEvent(S, 'coup'); }",
  "if (S.stage >= P['coup.stage'] && !S.cd.coup && ((S.equity < P['coup.equity'] && (S.rep < P['coup.rep'] || S.morale < P['coup.morale'] || S.exposed >= P['coup.exposed']) && rnd(S) < P['coup.odds']) || (S.equity < P['coup.equityLow'] && rnd(S) < P['coup.lowOdds']))) { S.cd.coup = S.t + P['coup.cd']; queueEvent(S, 'coup'); }",
  ['coup.stage', 2, '「董事会的突袭」：融完第几轮以后才可能来'], ['coup.equity', 45, '创始人股权低于这个数时', '%'], ['coup.rep', 30, '并且口碑低于这个数'], ['coup.morale', 28, '或者士气低于这个数'],
  ['coup.exposed', 35, '或者累计曝光的黑料严重度到这个数'], ['coup.odds', 0.35, '每月来的概率'], ['coup.equityLow', 25, '股权低于这个数时，不看别的', '%'], ['coup.lowOdds', 0.04, '那时每月来的概率'], ['coup.cd', 18, '来过一次以后至少隔几个月', '月']);
R("if (S.stage >= 2 && !S.cd.acq && rnd(S) < 0.04 + (S.hype > 60 ? 0.03 : 0)) { S.cd.acq = S.t + 14; queueEvent(S, 'acq_offer', { rival: pick(S, S.flags.red ? S.rivals.filter(r => EAST_RIVALS.includes(r.id)) : S.flags.rose ? S.rivals.filter(r => r.id === 'misan') : S.rivals.slice(0, 4)).id }); }",
  "if (S.stage >= P['acq.stage'] && !S.cd.acq && rnd(S) < P['acq.odds'] + (S.hype > P['acq.hypeLine'] ? P['acq.hypeOdds'] : 0)) { S.cd.acq = S.t + P['acq.cd']; queueEvent(S, 'acq_offer', { rival: pick(S, S.flags.red ? S.rivals.filter(r => EAST_RIVALS.includes(r.id)) : S.flags.rose ? S.rivals.filter(r => ROSE_RIVALS.includes(r.id)) : S.rivals.slice(0, P['acq.rivals'])).id }); }",
  ['acq.stage', 2, '「收购要约」：融完第几轮以后才会有'], ['acq.odds', 0.04, '每月来的概率'], ['acq.hypeLine', 60, '热度高于这个数时'], ['acq.hypeOdds', 0.03, '概率再加这么多'], ['acq.cd', 14, '谈过一次以后至少隔几个月', '月'],
  ['acq.rivals', 4, '平时来收购的是设定.xlsx「对手」表里排在前面的几家（红色路线只剩东方对手，共享繁荣只剩表里标了「共享繁荣」的）']);
use = '随机事件';
R('const n = S.tut?.on && S.t <= 2 ? 0 : (rnd(S) < 0.82 ? 1 : 0) + (S.t > 10 && rnd(S) < 0.18 ? 1 : 0);', "const n = S.tut?.on && S.t <= P['event.tutQuiet'] ? 0 : (rnd(S) < P['event.odds1'] ? 1 : 0) + (S.t > P['event.odds2From'] && rnd(S) < P['event.odds2'] ? 1 : 0);",
  ['event.tutQuiet', 2, '新手教学：头几个月不出随机事件', '月'], ['event.odds1', 0.82, '每月出一个随机事件的概率'], ['event.odds2From', 10, '第几个月以后，每月可能再多出一个', '月'], ['event.odds2', 0.18, '多出一个的概率']);
use = '开局';
R("hype: 8, rep: 50, morale: 65, reg: 10, bubble: 35, burstT: 0, outage: 0,", "hype: P['start.hype'], rep: P['start.rep'], morale: P['start.morale'], reg: P['start.reg'], bubble: P['start.bubble'], burstT: 0, outage: 0,",
  ['start.hype', 8, '开局热度'], ['start.rep', 50, '开局口碑'], ['start.morale', 65, '开局士气'], ['start.reg', 10, '开局监管压力'], ['start.bubble', 35, '开局行业泡沫']);
R("users: setup.route === 'app' ? 2 : 0.3, fake: 0, quality: setup.route === 'app' ? 40 : 28,", "users: setup.route === 'app' ? P['start.usersApp'] : P['start.usersModel'], fake: 0, quality: setup.route === 'app' ? P['start.qualityApp'] : P['start.qualityModel'],",
  ['start.usersApp', 2, '做应用：开局用户', '万'], ['start.usersModel', 0.3, '做模型：开局用户', '万'], ['start.qualityApp', 40, '做应用：开局产品体验'], ['start.qualityModel', 28, '做模型：开局产品体验']);
R('gpu: 0, gpuBase: 1.5, quotaBase: R.quota,', "gpu: 0, gpuBase: P['start.gpuPrice'], quotaBase: R.quota,", ['start.gpuPrice', 1.5, '开局的显卡市价（每张每月）', '万']);
R("const off = r.off + rf(S, -2, 2), cap = frontier(1) + off;", "const off = r.off + rf(S, -P['start.rivalJitter'], P['start.rivalJitter']), cap = frontier(1) + off;", ['start.rivalJitter', 2, '每局开局时，对手比行业前沿差多少在表里的基础上随机 ±这么多']);
R('ver: ri(S, 3, 4), cap, bench: cap + r.cheat, hype: 40, rel: 0, next: ri(S, 2, 7) };', "ver: ri(S, P['start.rivalVerMin'], P['start.rivalVerMax']), cap, bench: cap + r.cheat, hype: P['start.rivalHype'], rel: 0, next: ri(S, P['start.rivalNextMin'], P['start.rivalNextMax']) };",
  ['start.rivalVerMin', 3, '对手开局时模型的版本号（随机）'], ['start.rivalVerMax', 4, '同上'], ['start.rivalHype', 40, '对手开局的热度'], ['start.rivalNextMin', 2, '对手开局后第几个月发布下一版（随机）', '月'], ['start.rivalNextMax', 7, '同上', '月']);
R("S.gpu = 8; S.furnace = { on: true, data: 'open', months: 0 }; }", "S.gpu = P['start.gpu']; S.furnace = { on: true, data: 'open', months: 0 }; }", ['start.gpu', 8, '做模型：开局租的显卡', '张']);
R("e.quirk = 'loyal'; e.salary = +(e.salary * 0.5).toFixed(1); addStaff(S, e);", "e.quirk = 'loyal'; e.salary = +(e.salary * P['start.partnerPay']).toFixed(1); addStaff(S, e);", ['start.partnerPay', 0.5, '开局带来的合伙人只拿几成工资']);
R('if (own.m_cash) S.cash += 60;', "if (own.m_cash) S.cash += P['meta.cash'];", ['meta.cash', 60, '局外成长「老妈的私房钱」：开局多给的现金（设定.xlsx「局外商店」的名字里写着数，要一起改）', '万']);
R('if (own.m_gpu) S.quotaBase *= 1.4;', "if (own.m_gpu) S.quotaBase *= P['meta.gpu'];", ['meta.gpu', 1.4, '局外成长「祖传矿卡」：开局显卡配额的倍数（同上）']);
use = '系统事件';
R("if (setup.region === 'bay') S.sched.push({ id: 'chepole_1', at: 3 });", "if (setup.region === 'bay') S.sched.push({ id: 'chepole_1', at: P['event.chepoleAt'] });", ['event.chepoleAt', 3, '湾区：第几个月来「去吃 Chepole 吗」', '月']);
R("S.sched.push({ id: 'leather_rumor', at: ri(S, 9, 30) });", "S.sched.push({ id: 'leather_rumor', at: ri(S, P['event.leatherFrom'], P['event.leatherTo']) });",
  ['event.leatherFrom', 9, '「皮衣教主「出轨」门」在第几个月到第几个月之间随机来一次', '月'], ['event.leatherTo', 30, '同上', '月']);
use = '结算';
R("const score = Math.round(E.base + Math.log10(Math.max(10, o.val * S.equity / 100)) * 6 + Math.min(S.t, MONTHS) / 4 + S.perks.length - S.exposed / 6 + (o.id === 'acquired' ? 10 : 0));",
  "const score = Math.round(E.base + Math.log10(Math.max(10, o.val * S.equity / 100)) * P['score.valK'] + Math.min(S.t, MONTHS) / P['score.monthDiv'] + S.perks.length - S.exposed / P['score.exposedDiv'] + (o.id === 'acquired' ? P['score.acquired'] : 0));",
  ['score.valK', 6, '结算分 = 结局基础分 + lg(你手里那份股权值多少) × 这个数 + 月数 ÷ score.monthDiv + 董事会卡张数 - 曝光的黑料严重度 ÷ score.exposedDiv'], ['score.monthDiv', 4, '同上'], ['score.exposedDiv', 6, '同上'], ['score.acquired', 10, '以被收购收场额外加几分']);
R('if (Object.keys(meta.ends).length >= 8 && !meta.ach.allend)', "if (Object.keys(meta.ends).length >= P['ach.allend'] && !meta.ach.allend)", ['ach.allend', 8, '成就「人生百态」：见过几种不同结局']);
R('const points = Math.max(1, Math.round(score / 14)) + newAch.length * 2 + (newEnd ? 3 : 0);', "const points = Math.max(1, Math.round(score / P['meta.pointDiv'])) + newAch.length * P['meta.achPoints'] + (newEnd ? P['meta.endPoints'] : 0);",
  ['meta.pointDiv', 14, '一局结束得到的人脉点 = 结算分 ÷ 这个数（至少 1 点）+ 下面两项'], ['meta.achPoints', 2, '每个新成就多给几点'], ['meta.endPoints', 3, '第一次见到这个结局多给几点']);
// 引擎要用到对手表里「共享繁荣」那一列
reuse('GOALS, IDEO_FLAG_MODS, OLD_QUOTA_MULT, EAST_RIVALS, P,', 'GOALS, IDEO_FLAG_MODS, OLD_QUOTA_MULT, EAST_RIVALS, ROSE_RIVALS, P,');

writeFileSync(path.join(out, 'p-engine-params.json'), JSON.stringify({ 'src/game/engine.js': pairs }));
writeFileSync(path.join(out, 'engine-params.rows.json'), JSON.stringify(rows));
console.log('替换', pairs.length, '处；参数', rows.length, '个');

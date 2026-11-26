// 《炼丹大亨》静态数据：属性、地区、路线、赛道、特质、卡牌、对手、结局……
// 所有人物与公司均为虚构恶搞，如有雷同，那一定是现实在抄袭游戏。
//
// 数据本身在表格里：tables/设定.xlsx 和 tables/平衡参数.xlsx。
// 改表 → npm run tables（导出成 ./tables/*.json，顺便查错）→ 这里读进来，再补上几张派生的索引表和几个小函数。
import { localize } from '../i18n/tables.js';
import T from './tables/defs.json' with { type: 'json' };
import PARAMS from './tables/params.json' with { type: 'json' };
import { fillDefs, fillRefs, refMaps } from './refs.js';

// 说明里的 {变量}（比如「显卡价格 {显卡价格}」读这一条自己的修正）：载入时填好，游戏里拿到的就是填好的字

const REF = refMaps(T);
localize('defs', T, () => fillDefs(T, PARAMS.P, REF));
// 别的表（行动、事件、路线之争）里的说明也用它：rec = 这一条记录（{效果.热度} {临时.收入} 读它的效果），vars = 代码填的变量
export const fillRec = (text, rec, vars) => fillRefs(text, { vars, P: PARAMS.P, rec, ...REF });

// 平衡参数：P['键'] 取「参数」表里的值
export const P = PARAMS.P;
export const { MONTHS, START_YEAR, AGI_CAP } = P;

export const {
  ATTRS, REGIONS, ROUTES, TRACKS, TRAITS, OUTFITS, OFFICES, DEPTS, FLOOR_PLANS, ROLES, STAFF_QUIRKS, POLICIES, PERKS, FEATURES,
  RIVALS, INVESTORS, INVESTORS_EAST, EAST_RIVALS, INVEST_RIVALS, ROSE_RIVALS, INVESTORS_PROGRESSIVE, STAGES, OLD_QUOTA_MULT, DATA_SOURCES, DIRT, ENDINGS,
  ACHIEVEMENTS, GOALS, IDEO_FLAG_MODS, META_SHOP, NAMES, MOD_NAME, KIND_NAME, CAT,
} = T;

export const ATTR_NAME = Object.defineProperties({}, Object.fromEntries(ATTRS.map(a => [a.id, { enumerable: true, get: () => a.name }])));
export const TRAIT = Object.fromEntries(Object.values(TRAITS).flat().map(t => [t.id, t]));
export const PERK = Object.fromEntries(PERKS.map(p => [p.id, p]));
export const FEAT = Object.fromEntries(FEATURES.map(f => [f.id, f]));

export const MAX_OFFICE = OFFICES.length - 1;
// 起步那一档叫什么，看落脚点（3A 版里六个落脚点的房子和街区各不一样；「特质」表的「起步办公室叫什么」列）；
// 没选落脚点的老存档按地区叫车库 / 城中村出租屋
const START_OFFICE = T.START_OFFICE;
export const officeName = (S, lv = S.co.office) => {
  const n = OFFICES[lv].name; if (typeof n === 'string') return n;
  const d = lv === 1 ? S.founder?.traits?.find(id => START_OFFICE[id] && TRAIT[id]?.region === S.co.region) : null;
  return d ? START_OFFICE[d] : n[S.co.region];
};

// 多层办公楼：每层住哪些部门（从 1 楼往上，「楼层」表）。低档位两个小部门合用一层，总部一层一个部门。
// lobby = 大堂前台，ceo = 总裁办（创始人在这儿），res 研究院那层还放着丹炉和机房
export const floorsOf = lv => FLOOR_PLANS[lv] || null;
// 某个角色（或 'ceo' 创始人）在第几层（0 = 1 楼）。总部以外，创始人待在顶楼
export function floorOf(lv, who) {
  const plan = FLOOR_PLANS[lv];
  if (!plan) return 0;
  const i = plan.findIndex(f => f.includes(who));
  return i >= 0 ? i : who === 'ceo' ? plan.length - 1 : 0;
}

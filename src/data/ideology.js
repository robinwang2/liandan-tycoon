// 「路线之争」事件链与意识形态内容，深圳版（纯数据，逻辑在 src/game/ideology.js）。
// 内容在 tables/路线之争-深圳.xlsx 里；改表 → npm run tables → 这里读导出的 JSON。
//
// 触发：深圳选了「深创头：国资入股」→ 15 个月、每月一级的事件链，两条进度条「共产」「资本」。
// 第 15 级选完结算：共产条满或比资本条多 → 红色结局（苏联风界面、不能再拿西方融资）；
// 资本条满或更多 → 「警惕不现实的乌托邦主义」+ 处置共产倾向员工。终局时股权须 ≥ 40%，否则这条路没走成。
//
// 链上选项的格式（IDEO_STAGES[].opts 和 IDEO_POOL 通用）：
// {
//   side: 'red' | 'cap' | 'mid',      路线类型：red 共产 / cap 资本 / mid 务实、和稀泥
//   label: '≤12字', hint: '≤18字',
//   text: '结果文本', fx: { ... },      fx 和普通事件完全一样
//   bars: { red: 8, cap: -2 },         两条进度条的变化
//   // 或者用检定 / 概率：check: { attr, dc } 或 odds: 0.5，再配 ok / fail: { text, fx, bars }
//   req: { ... },                      可选：满足才能点
// }
// IDEO_POOL 里的卡另有 id（全局唯一）、from / to（能出现在第几级，1~15）、when（出现条件，同事件 when，
// 另外支持 redMin / redMax / capMin / capMax 读两条进度条）。
// 从第 3 级起，引擎按「玩家意图」决定每级给几张哪种类型的卡：本级 opts 优先，不够的从 IDEO_POOL 抽。
import T from './tables/ideology_cn.json' with { type: 'json' };

export const {
  IDEO_CAST,          // 主要角色（正文直接写名字）
  IDEO_STAGES,        // 15 级，按顺序。每级 2~4 个 opts，至少一张 red、一张 cap
  IDEO_POOL,          // 补充用的卡池
  IDEO_ENDINGS,       // 四种收场：red / cap / purge / fail
  IDEO_CHAINS,        // 红色线、资本线解锁的两条一次性事件链（格式同 events_chains.js）
  UTOPIA_EVENTS, BCI_EVENTS,
  PLAN_TEXT,          // 「五年计划」的文字
  ACT_TEXT,           // 意识形态行动的结果文案：每个 key 2~3 句随机挑
  YANK_TEXT,          // 「末位淘汰」确认窗
  IDEO_EVENTS,        // 结局之后才会出现的随机事件（when 里用 flag: 'red' / 'capb' / 'red_cell' 限定）
} = T;

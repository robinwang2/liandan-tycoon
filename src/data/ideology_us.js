// 「路线之争」湾区版（纯数据，逻辑在 src/game/ideology.js，格式和 src/data/ideology.js 完全一样）。
// 内容在 tables/路线之争-湾区.xlsx 里；改表 → npm run tables → 这里读导出的 JSON。
//
// 触发：湾区融资时选了「公地资本：工会养老金入股」→ 15 个月、每月一级。两条进度条在湾区叫「社会主义」「资本主义」，
// 另外多一条「反共压力」（0~100）：社会主义条越高涨得越快，压力大时社会主义条会被一点点磨掉，还会随机弹出「红色恐慌」事件。
// 结局：社会主义条满或更多 → 「共享繁荣」结局（公司嘴上始终不承认自己是社会主义）；资本主义条满或更多 → 「使命驱动、不谈政治」结局 +
// 处置 🌹 员工；终局时股权须 ≥ 40%。
//
// 与深圳版的差别只有三处：
// 1. 选项和事件的 fx 里可以用 heat: n（反共压力，-15~+15），湾区的红色选项大多会加压力
// 2. 普通事件（SCARE_EVENTS 等）的 fx 里可以用 ideo: { red, cap } 直接推进度条
// 3. 多一个 SCARE_EVENTS：红色恐慌事件，由引擎在路线之争期间（when.flag: 'us_chain'）和「共享繁荣」结局之后（when.flag: 'rose'）排进来
import T from './tables/ideology_us.json' with { type: 'json' };
import { fillRec } from './defs.js';

for (const e of T.SYS_EVENTS) for (const o of e.options) if (o.hint?.includes('{')) o.hint = fillRec(o.hint, o);   // 同深圳版

export const {
  IDEO_CAST, IDEO_STAGES, IDEO_POOL, IDEO_ENDINGS, IDEO_CHAINS, UTOPIA_EVENTS, BCI_EVENTS, SCARE_EVENTS,
  ACT_TEXT, IDEO_EVENTS, SYS_EVENTS, VER,
} = T;

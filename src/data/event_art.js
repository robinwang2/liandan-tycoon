// 事件 → 背景图 key 的对照表（图库清单见 docs/codex-art.md）。
// 现在每个事件的插画直接写在事件表的「插画」列（tables/事件.xlsx），分类的默认插画写在 设定.xlsx「事件分类」的「默认插画」列。
// 这里把它们整理成以前那两张对照表，给还按 id 查图的地方用。
import D from './tables/defs.json' with { type: 'json' };
import E from './tables/events.json' with { type: 'json' };

export const EVENT_ART = Object.fromEntries([...E.EVENTS_CORE, ...E.EVENTS_PACK].filter(e => e.art).map(e => [e.id, e.art]));
export const CAT_ART = D.CAT_ART;

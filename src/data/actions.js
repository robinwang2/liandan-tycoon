// CEO 行动的表格数据：页签、行动、融资报价、行动文本。
// 内容在 tables/行动.xlsx 里；改表 → npm run tables → 这里读导出的 JSON。逻辑在 src/game/actions.js。
import T from './tables/actions.json' with { type: 'json' };

export const TAB_ROWS = T.TABS;          // 左边面板的页签
export const ACTION_ROWS = T.ACTIONS;    // 每个行动：名字、图标、行动点、冷却、检定、效果、描述模板、参数
export const RAISE_OFFERS = T.OFFERS;    // 融资时的投资意向书
export const ACT_TEXT = T.TEXT;          // 键 → [{ text, bay? }]：结果、窗口、提示里的文字；几条 = 随机挑一句

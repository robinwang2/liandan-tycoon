// 随机事件包：每个月从这里按权重抽。
// 内容在 tables/事件.xlsx 的「随机事件」「随机选项」两张表里；改表 → npm run tables → 这里读导出的 JSON。
import T from './tables/events.json' with { type: 'json' };

import { fillRec } from './defs.js';

for (const event of T.EVENTS_PACK) for (const option of event.options || []) for (const key of ['label', 'hint']) {
  if (option[key]?.includes('{')) option[key] = fillRec(option[key], option);
}
export const EVENTS_PACK = T.EVENTS_PACK;

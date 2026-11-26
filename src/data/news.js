// 滚动新闻。内容在 tables/事件.xlsx 的「新闻」表里；改表 → npm run tables → 这里读导出的 JSON。
import { localize } from '../i18n/tables.js';
import T from './tables/events.json' with { type: 'json' };

localize('events', { NEWS: T.NEWS });
export const NEWS = T.NEWS;

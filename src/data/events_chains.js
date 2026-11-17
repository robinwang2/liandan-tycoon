// 事件链（参考《群星》的事件链 + 特殊项目）。
// 一条链 = 一个开头事件（进随机池）+ 若干后续事件（weight 0，由特殊项目完成/超期或 follow 触发）。
// 内容在 tables/事件链.xlsx 里：「事件链」「链事件」「链选项」「特殊项目」四张表；改表 → npm run tables → 这里读导出的 JSON。
// 链上用到的两种效果：
//   project: { id, chain, name, desc, kind, need, months, ok, fail }   开启一个特殊项目，完成触发 ok 事件，超期触发 fail 事件（表里写「项目:id」）
//   chain:   { id, note, done }                                         更新「情境日志」里这条链的进展；done 表示这条链结束（表里写「链:id」或「链结束:id」，文字填在「链进展」列）
// 事件上的 chain 字段标明它属于哪条链；art 指定背景图。
import T from './tables/chains.json' with { type: 'json' };

export const { CHAINS, EVENTS_CHAINS } = T;

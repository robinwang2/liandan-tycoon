// 生成 tools/verify/refs-changes.md：说明里写死的数改成 {变量} 的每一处（原文 → 现在）
import { readFileSync, writeFileSync } from 'node:fs';
const BOOK = { defs: '设定.xlsx', actions: '行动.xlsx', events: '事件.xlsx', ideology_cn: '路线之争-深圳.xlsx', ideology_us: '路线之争-湾区.xlsx' };
const SHEET = { PERKS: '董事会卡', TRAITS: '特质', FEATURES: '功能', STAFF_QUIRKS: '员工怪癖', POLICIES: '政策', DATA_SOURCES: '数据源', GOALS: '公司目标', REGIONS: '地区', META_SHOP: '局外商店', ACHIEVEMENTS: '成就', ATTRS: '属性',
  ACTIONS: '行动', OFFERS: '融资报价', TEXT: '行动文本', EVENTS_CORE: '系统选项', SYS_EVENTS: '系统选项' };
const rows = [];
function walk(a, b, book, sheet, rec, path) {
  if (typeof a === 'string' && typeof b === 'string') { if (a !== b) rows.push({ book, sheet, rec, field: /^\d+$/.test(path.at(-1)) ? '第 ' + (+path.at(-1) + 1) + ' 条' : path.at(-1), old: a, now: b }); return; }
  if (!a || !b || typeof a !== 'object') return;
  for (const k of Object.keys(a)) {
    const sh = sheet ?? (SHEET[k] ? k : null);
    if (!sh && path.length === 0 && !SHEET[k]) continue;
    const x = a[k], id = x && typeof x === 'object' && !Array.isArray(x) ? (x.id ?? x.label ?? (Array.isArray(a) ? null : k)) : null;
    walk(x, b[k], book, sh, id != null && path.length > 0 ? [...rec, id] : rec, [...path, k]);
  }
}
for (const f of Object.keys(BOOK)) walk(JSON.parse(readFileSync(`tools/verify/before-refs/${f}.before-refs.json`, 'utf8')), JSON.parse(readFileSync(`src/data/tables/${f}.json`, 'utf8')), f, null, [], []);
const esc = s => s.replace(/\|/g, '\|').replace(/\n/g, ' ');
const loc = r => `${BOOK[r.book]} › ${SHEET[r.sheet]} › ${[...new Set(r.rec)].filter(x => typeof x === 'string').join(' › ') || '—'} › ${r.field}`;
const by = {}; for (const r of rows) by[BOOK[r.book]] = (by[BOOK[r.book]] || 0) + 1;
let md = `# 说明里写死的数改成 {变量}：改动清单\n\n`;
md += `共 ${rows.length} 处（${Object.entries(by).map(([k, n]) => `${k} ${n}`).join('、')}）。改之前的 JSON 在 \`tools/verify/before-refs/\`；写法和格式后缀见 \`src/data/refs.js\` 开头。\n\n`;
md += `每一处游戏里显示出来的字都和「原文」一字不差（\`node tools/verify/check-filled.mjs tools/verify/before-refs .\` 逐条核对过）。\n\n`;
md += `**没改的**：剧情里的数（「连发 9 条」「合同 600 页」「昇天 910」「23:59」……）跟参数无关，没动；汉字写的数（「三成多」「半年」「两年」「减半」……）保留原文；另有 6 处故意留着：「开局带 2 名老部下」（带的是一张名单）、成就「泡沫破裂时……不够烧 3 个月」（数在系统事件 bubble_burst 的参数里）、「996」（政策的名字）、末位淘汰「2 人以上」（规则写在代码里）、「半年后要还 7 个月」（数在到期还款事件里）、「跑分 +5 / +13 左右」（参数区间的中间值）。\n\n`;
md += `| # | 位置 | 原文 | 现在 |\n|---|---|---|---|\n`;
rows.forEach((r, i) => { md += `| ${i + 1} | ${esc(loc(r))} | ${esc(r.old)} | ${esc(r.now)} |\n`; });
writeFileSync('tools/verify/refs-changes.md', md);
console.log(rows.length, '处', JSON.stringify(by));

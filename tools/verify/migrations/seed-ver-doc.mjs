import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const root = process.argv[2];
const { pretty } = await import(pathToFileURL(path.join(root, 'tools/tables/lib/json.mjs')));
const DOC = {
  'start.red': '开局时左边那条进度条的值（0~100）', 'start.cap': '开局时资本那条进度条的值', 'start.heat': '开局时的反共压力（没有反共压力的版本填 0）',
  'heat.on': '这个版本有没有「反共压力」：1 = 有，0 = 没有', 'brand': '左翼结局以后招牌和 Logo 换成的颜色',
  'goal.red': '左翼结局以后换成的公司目标（设定.xlsx「公司目标」表的 id）', 'goal.cap': '保守结局以后换成的公司目标',
  'flag.red': '左翼结局立起来的标记（「事件」表里结局后的事件靠它限定）', 'flag.cap': '保守结局立起来的标记', 'flag.cell': '处置左倾员工时选「睁一只眼闭一只眼」立起来的标记',
  'flag.on': '接受新股东以后立起来的标记', 'flag.chain': '路线之争进行中立着、走完撤掉的标记（红色恐慌事件靠它限定）',
  'chain.utopia': '意识形态行动「公社 / 合作社实验」开的事件链的第一个事件', 'chain.bci': '意识形态行动「脑机实验」开的事件链的第一个事件',
};
for (const v of ['cn', 'us']) {
  const f = path.join(root, 'src/data/tables', `ideology_${v}.json`), d = JSON.parse(readFileSync(f, 'utf8'));
  const keys = [], walk = (o, pre) => { for (const [k, x] of Object.entries(o)) x && typeof x === 'object' ? walk(x, pre + k + '.') : keys.push(pre + k); };
  walk(d.VER, '');
  d.VER_DOC = Object.fromEntries(keys.map(k => { if (!DOC[k]) throw new Error('没写说明：' + k); return [k, DOC[k]]; }));
  writeFileSync(f, pretty(d) + '\n');
  console.log(v, keys.join(' '));
}

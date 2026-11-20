// 一次性迁移：新手教学（src/ui/tutorial.js）里老周说的话 → 文本.xlsx「教学」；每一步第几个月开放 → 平衡参数.xlsx（tut. 开头）。
//   node seed-tutorial.mjs <旧版 src 目录> <项目根目录>
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const [old, root] = process.argv.slice(2);
const { pretty } = await import(pathToFileURL(path.join(root, 'tools/tables/lib/json.mjs')));
const src = readFileSync(path.join(old, 'ui/tutorial.js'), 'utf8').replace(/\r\n/g, '\n');
const { STEPS } = await import(pathToFileURL(path.join(old, 'ui/tutorial.js')));
const swap = (s, a, b) => { if (s.split(a).length !== 2) throw new Error(`「${a}」在「${s.slice(0, 20)}…」里不是恰好一处`); return s.replace(a, b); };
const TX = [];
for (const st of STEPS) {
  const tips = typeof st.tip === 'function' ? [['tut.model', st.tip({ ownModel: true })], ['tut.model.app', st.tip({ ownModel: false })]] : [['tut.' + st.key, st.tip]];
  for (const [k, tip] of tips) {
    let text = tip.text;
    if (st.key === 'cap') text = swap(text, '到 0.9 以上', '到 {流血线} 以上');
    if (st.key === 'policy') text = swap(text, '到 70 增长受限', '到 {监管线} 增长受限');
    TX.push([k + '.title', tip.title, `新手教学「${st.key}」这一步的标题${k.endsWith('.app') ? '（没有自研模型的公司）' : st.key === 'model' ? '（自研模型的公司）' : ''}`]);
    TX.push([k + '.text', text, st.key === 'cap' ? '{流血线} = 行动.xlsx「启动融资」的流血线；「三份」是报价份数' : st.key === 'policy' ? '{监管线} = 平衡参数 reg.high' : st.key === 'model' ? '「六家」是设定.xlsx「对手」表的家数' : st.key === 'done' ? '「六年」是一局的月数（平衡参数 MONTHS）' : undefined]);
  }
}
for (const [k, t] of TX) if (!src.includes(t.replace('{流血线}', '0.9').replace('{监管线}', '70'))) throw new Error('旧源码里找不到：' + k);
const tf = path.join(root, 'src/data/tables/text.json'), tj = JSON.parse(readFileSync(tf, 'utf8'));
for (const [key, text, note] of TX) { if (key in tj.TEXT) throw new Error('键重复：' + key); tj.TEXT[key] = { text }; tj.SHEET[key] = '教学'; if (note) tj.TEXT_DOC[key] = note; }
writeFileSync(tf, pretty(tj) + '\n');
console.log('text.json：教学', TX.length, '条');
const R = (key, value, desc, unit) => ({ key, value, ...(unit ? { unit } : {}), desc, use: '新手教学' });
const PR = [
  R('tut.team', 2, '第几个月开放「团队」（招人）', '月'), R('tut.product', 3, '第几个月开放「产品与用户」', '月'), R('tut.pr', 3, '第几个月开放「公关」', '月'),
  R('tut.model', 4, '第几个月开放「经营」（显卡、丹炉、榜单）', '月'), R('tut.cap', 5, '第几个月开放「资本」', '月'), R('tut.capRunway', 4, '或者现金撑不过几个月时提前开放「资本」', '月'),
  R('tut.dirt', 7, '第几个月讲「捷径和保险柜」（留下黑料时会提前讲）', '月'), R('tut.policy', 9, '第几个月开放「公司制度」', '月'), R('tut.done', 10, '第几个月出师（要先讲过「公司制度」）', '月'),
];
const lits = { 'tut.team': 'S.t >= 2', 'tut.product': "key: 'product', when: S => S.t >= 3", 'tut.pr': "key: 'pr', when: S => S.t >= 3", 'tut.model': 'S.t >= 4', 'tut.cap': 'S.t >= 5 || runway(S) < 4', 'tut.dirt': 'S.t >= 7', 'tut.policy': 'S.t >= 9', 'tut.done': 'S.t >= 10' };
for (const [k, s] of Object.entries(lits)) if (!src.includes(s)) throw new Error(`参数 ${k}：旧源码里找不到「${s}」`);
const pf = path.join(root, 'src/data/tables/params.json'), pj = JSON.parse(readFileSync(pf, 'utf8'));
for (const r of PR) { if (r.key in pj.P) throw new Error('参数重复：' + r.key); pj.ROWS.push(r); pj.P[r.key] = r.value; }
writeFileSync(pf, pretty(pj) + '\n');
console.log('params.json：教学', PR.length, '个');

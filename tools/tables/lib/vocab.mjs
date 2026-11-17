// 格子写法的词表：效果、条件、修正、属性、开局、进度条。
// 「修正」的名字来自 设定.xlsx 的「修正」表（那张表新增一行，这里就多认一个词），其余词表写死在这里：
// 这些关键字和引擎代码一一对应，新增一种效果本来就要改代码。
import { makeDsl, DslError, numText } from './dsl.mjs';

export const ATTRS = [['tech', '技术'], ['cha', '口才'], ['mgmt', '管理'], ['biz', '商业'], ['net', '人脉'], ['luck', '运气']];
export const ATTR_ZH = Object.fromEntries(ATTRS), ATTR_ID = Object.fromEntries(ATTRS.flatMap(([k, z]) => [[z, k], [k, k]]));
export const REGION_ZH = { bay: '湾区', sz: '深圳' }, REGION_ID = { 湾区: 'bay', 深圳: 'sz', bay: 'bay', sz: 'sz' };

const NUM = String.raw`(?:\d+(?:\.\d+)?|\.\d+)`;
const signed = n => (n < 0 ? '-' + numText(-n) : '+' + numText(n));
const keysAre = (o, re, what) => { const k = Object.keys(o).join(','); if (!re.test(k)) throw new DslError(`${what}的结构不认识：${JSON.stringify(o)}`); };
const pair = (zh, table) => {                                     // 名字:中文值 ⇄ 内部值
  const back = Object.fromEntries(Object.entries(table).map(([a, b]) => [b, a]));
  return {
    kind: 'custom', zh, usage: Object.keys(table).join('|'),
    parse: body => { if (!(body in table)) throw new DslError(`「${zh}:${body}」不认识，可以写：${Object.keys(table).join('、')}`); return table[body]; },
    format: v => { if (!(v in back)) throw new DslError(`「${zh}」写不了这个值：${JSON.stringify(v)}`); return back[v]; },
  };
};

// 读数类条件：名字≥数 / 名字≤数
const READS = [['t', '月份'], ['stage', '轮次'], ['users', '用户'], ['hype', '热度'], ['rep', '口碑'], ['morale', '士气'], ['reg', '监管'], ['bubble', '泡沫'], ['dirt', '黑料'],
  ['staff', '员工'], ['rank', '排名'], ['runway', '跑道'], ['office', '办公室'], ['equity', '股权'], ['gpu', '显卡'], ['red', '左翼'], ['cap', '资本'], ['heat', '反共压力']];
const READ_NOTE = { t: '第几个月（1 = 2023 年 1 月）', stage: '融资轮次：0 自筹 1 天使 2 A 3 B 4 C 5 D 6 IPO', users: '用户数（万，含刷的）', dirt: '所有黑料的严重度之和', runway: '现金还能撑几个月', office: '办公室档位 1~8', gpu: '租了多少张显卡', red: '路线之争的左翼进度条', cap: '路线之争的资本进度条' };

const dirtEntry = zh => ({
  key: 'dirt', zh, kind: 'custom', usage: '黑料id 或 黑料id/严重度 或 黑料id/严重度/名字',
  parse: body => {
    const p = body.split('/');
    if (p.length === 1) return p[0];
    if (!new RegExp(`^${NUM}$`).test(p[1])) throw new DslError(`黑料的严重度得是数字：${body}`);
    return p.length === 2 ? { type: p[0], sev: Number(p[1]) } : { type: p[0], sev: Number(p[1]), name: p.slice(2).join('/') };
  },
  format: v => { if (typeof v === 'string') return v; keysAre(v, /^type,sev(,name)?$/, '黑料'); return v.type + '/' + numText(v.sev) + (v.name != null ? '/' + v.name : ''); },
});

// mods: [{ id, zh }]，来自「修正」表
export function buildVocab(modRows) {
  const modKey = new Map(), modZh = new Map();
  for (const r of modRows) { modKey.set(r.zh, r.id); modKey.set(r.id, r.id); modZh.set(r.id, r.zh); }
  const mods = makeDsl('修正', modRows.map(r => ({ key: r.id, zh: r.zh, kind: r.id.endsWith('Mult') ? 'mult' : 'delta', note: r.note })));

  const attrSub = kind => ATTRS.map(([key, zh]) => ({ key, zh, kind }));
  const attr = makeDsl('属性', attrSub('delta'));
  const bars = makeDsl('进度条', [
    { key: 'red', zh: '左翼', alias: ['共产', '社会主义'], kind: 'delta', note: '路线之争左边那条（深圳叫共产，湾区叫社会主义）' },
    { key: 'cap', zh: '资本', alias: ['资本主义'], kind: 'delta', note: '路线之争右边那条' },
  ]);

  const tempRe = new RegExp(`^(.+?)(×|\\*|[+\\-])(${NUM})(?:/(\\d+)月?)?$`);
  const fx = makeDsl('效果', [
    { key: 'cash', zh: '现金', kind: 'delta', note: '单位是「一个月的支出」：现金+2 = 到账两个月支出那么多钱' },
    { key: 'cashAbs', zh: '现金额', alias: ['现金万'], kind: 'delta', note: '固定金额（万）' },
    { key: 'hype', zh: '热度', kind: 'delta' }, { key: 'rep', zh: '口碑', kind: 'delta' }, { key: 'morale', zh: '士气', kind: 'delta' },
    { key: 'bubble', zh: '泡沫', kind: 'delta' }, { key: 'reg', zh: '监管', alias: ['监管压力'], kind: 'delta' },
    { key: 'usersPct', zh: '用户', kind: 'delta', pct: true, note: '用户数按百分比涨跌' },
    { key: 'tech', zh: '模型能力', kind: 'delta', note: '有自研模型时加模型能力，没有时折算成产品体验' },
    { key: 'bench', zh: '跑分', kind: 'delta', note: '注水的跑分' },
    { key: 'quality', zh: '体验', alias: ['产品体验'], kind: 'delta' },
    { key: 'quota', zh: '配额', alias: ['显卡配额'], kind: 'delta', pct: true },
    { key: 'equity', zh: '股权', kind: 'delta', note: '百分点' },
    { key: 'ap', zh: '行动点', alias: ['下月行动点'], kind: 'delta' },
    { key: 'attr', kind: 'sub', vocab: attrSub('delta').map(e => ({ ...e, note: '创始人属性，永久' })) },
    dirtEntry('黑料'),
    { key: 'cleanDirt', zh: '清除黑料', kind: 'id', note: '黑料 id，或 all（全部）、random（随机一张）' },
    { key: 'expose', zh: '引爆黑料', kind: 'const', value: 'random', note: '随机引爆一张黑料' },
    { key: 'expose', zh: '引爆黑料', kind: 'id', noKey: true },
    { key: 'flag', zh: '标记', kind: 'ids', note: '立一个标记，别的事件可以用它当条件' },
    { key: 'unflag', zh: '去标记', kind: 'ids' },
    { key: 'staff', noKey: true, ...pair('失去员工', { 随机: 'loseRandom', 最强: 'loseBest', 当事人: 'loseCtx' }) },
    { key: 'staff', noKey: true, ...pair('新员工', { 研究员: 'gainRes', 工程师: 'gainEng', 运营: 'gainOps', 商务: 'gainBiz', 法务: 'gainLegal', 大牛: 'gainStar' }) },
    { key: 'staff', zh: '员工', kind: 'id' },
    { key: 'rival', kind: 'sub', vocab: [{ key: 'cap', zh: '对手能力', kind: 'delta' }, { key: 'hype', zh: '对手热度', kind: 'delta' }, { key: 'rel', zh: '对手关系', kind: 'delta' }] },
    {
      key: 'temp', zh: '临时', kind: 'custom', many: true, usage: '修正名×数/几月 或 修正名+数/几月', note: '限时修正，名字见 设定.xlsx 的「修正」表',
      parse: body => {
        const m = tempRe.exec(body);
        if (!m) throw new DslError(`临时修正写得不对：「临时:${body}」，应该像 临时:收入×1.12/6月`);
        const key = modKey.get(m[1]);
        if (!key) throw new DslError(`临时修正里不认识「${m[1]}」（名字见 设定.xlsx 的「修正」表）`);
        const out = { key };
        if (m[2] === '×' || m[2] === '*') out.mult = Number(m[3]); else out.add = m[2] === '-' ? -Number(m[3]) : Number(m[3]);
        if (m[4] != null) out.months = Number(m[4]);
        return out;
      },
      format: t => {
        keysAre(t, /^key,(mult|add)(,months)?$/, '临时修正');
        const zh = modZh.get(t.key);
        if (!zh) throw new DslError(`「修正」表里没有 ${t.key}`);
        return zh + (t.mult != null ? '×' + numText(t.mult) : signed(t.add)) + (t.months != null ? '/' + numText(t.months) + '月' : '');
      },
    },
    {
      key: 'follow', zh: '后续', kind: 'custom', usage: '事件id/几月', note: '几个月后触发另一个事件',
      parse: body => { const m = new RegExp(`^([\\w.\\-]+)(?:/(${NUM})月?)?$`).exec(body); if (!m) throw new DslError(`后续事件写得不对：「后续:${body}」，应该像 后续:gala_meme/2月`); return m[2] != null ? { id: m[1], in: Number(m[2]) } : { id: m[1] }; },
      format: v => { keysAre(v, /^id(,in)?$/, '后续事件'); return v.id + (v.in != null ? '/' + numText(v.in) + '月' : ''); },
    },
    { key: 'perk', zh: '抽董事会卡', kind: 'const', value: 'draft', note: '弹出董事会卡三选一' },
    { key: 'perk', zh: '董事会卡', kind: 'id', noKey: true },
    {
      key: 'project', zh: '项目', kind: 'custom', usage: '特殊项目id', note: '开启一个特殊项目（定义在「特殊项目」表）',
      parse: (body, ctx) => { const p = ctx.project?.(body); if (!p) throw new DslError(`「特殊项目」表里没有 ${body}`); return p; },
      format: (v, ctx) => { if (!ctx.addProject) throw new DslError('这里不能开特殊项目'); return ctx.addProject(v); },
    },
    {                                                               // 进展的文字写在旁边的「链进展」列
      key: 'chain', zh: '链', kind: 'custom', usage: '事件链id', note: '更新情境日志里这条链的进展；文字写在「链进展」列',
      parse: (body, ctx) => { ctx.chainSeen = true; return ctx.note != null ? { id: body, note: ctx.note } : { id: body }; },
      format: (v, ctx) => { keysAre(v, /^id(,note)?$/, '事件链进展'); if (v.note != null) ctx.note = v.note; return v.id; },
    },
    {
      key: 'chain', zh: '链结束', kind: 'custom', noKey: true, usage: '事件链id', note: '同上，并且这条链到此结束',
      parse: (body, ctx) => { ctx.chainSeen = true; return ctx.note != null ? { id: body, note: ctx.note, done: true } : { id: body, done: true }; },
      format: (v, ctx) => { keysAre(v, /^id(,note)?,done$/, '事件链进展'); if (v.done !== true) throw new DslError('done 只能是 true'); if (v.note != null) ctx.note = v.note; return v.id; },
    },
    { key: 'end', zh: '结局', kind: 'id', note: '直接结束这一局' },
    { key: 'ideo', kind: 'sub', vocab: [{ key: 'red', zh: '左翼', alias: ['共产', '社会主义'], kind: 'delta' }, { key: 'cap', zh: '资本', alias: ['资本主义'], kind: 'delta' }] },
    { key: 'heat', zh: '反共压力', kind: 'delta' },
  ]);

  const region = { key: 'region', zh: '地区', kind: 'custom', usage: '湾区|深圳', parse: b => { if (!REGION_ID[b]) throw new DslError(`地区只有 湾区、深圳：${b}`); return REGION_ID[b]; }, format: v => { if (!REGION_ZH[v]) throw new DslError(`不认识的地区 ${v}`); return REGION_ZH[v]; } };
  const policy = {
    key: 'policy', zh: '政策', kind: 'custom', merge: true, usage: '政策=选项', note: '比如 政策:work=996、政策:safety=loose',
    parse: b => { const m = /^(\w+)=(\w+)$/.exec(b); if (!m) throw new DslError(`政策条件写得不对：「政策:${b}」，应该像 政策:work=996`); return { [m[1]]: m[2] }; },
    format: v => Object.entries(v).map(([k, x]) => { if (typeof x !== 'string') throw new DslError(`政策条件的值得是文字：${JSON.stringify(v)}`); return k + '=' + x; }),
  };
  const when = makeDsl('条件', [
    ...READS.flatMap(([k, zh]) => [
      { key: k + 'Min', zh, alias: [k], noKey: true, kind: 'min', note: READ_NOTE[k] },
      { key: k + 'Max', zh, alias: [k], noKey: true, kind: 'max', note: READ_NOTE[k] },
    ]),
    region,
    { key: 'route', zh: '路线', kind: 'id', note: 'model 炼丹派 / app 套壳派' },
    { key: 'track', zh: '赛道', kind: 'ids', note: 'chat / code / companion / video，可以写多个' },
    { key: 'ownModel', kind: 'bool', on: '自研模型', off: '无自研模型' },
    { key: 'hasDirt', zh: '有黑料', kind: 'id' }, { key: 'hasRole', zh: '有岗位', kind: 'id', note: 'res / eng / ops / biz / legal' },
    { key: 'flag', zh: '标记', kind: 'ids', note: '这些标记都立着' }, { key: 'notFlag', zh: '无标记', kind: 'ids', note: '这些标记一个都没立' },
    policy,
    { key: 'cash', zh: '现金', kind: 'min', note: '现金够几个月的支出' },
    { key: 'attr', kind: 'sub', vocab: attrSub('min') },
  ]);

  const start = makeDsl('开局', [
    { key: 'cash', zh: '现金', kind: 'delta', note: '开局资金（万）' }, { key: 'cashMult', zh: '现金', kind: 'mult' },
    { key: 'rep', zh: '口碑', kind: 'delta' }, { key: 'hype', zh: '热度', kind: 'delta' }, { key: 'users', zh: '用户', kind: 'delta', note: '万' },
    { key: 'tech', zh: '模型能力', kind: 'delta' }, { key: 'equity', zh: '股权', kind: 'delta' }, { key: 'reg', zh: '监管', kind: 'delta' },
    { key: 'debt', zh: '欠债', kind: 'delta', note: '一年后要还的钱，单位是「一个月的支出」' },
    {
      key: 'staff', zh: '员工', kind: 'custom', usage: '岗位,岗位+能力加成', note: '开局带的人，比如 员工:eng,ops 或 员工:res+3（死忠）',
      parse: b => b.split(/[,，]/).map(s => { const m = /^(\w+)(?:\+(\d+))?$/.exec(s.trim()); if (!m) throw new DslError(`开局员工写得不对：${s}`); return m[2] != null ? { role: m[1], bonus: Number(m[2]) } : m[1]; }),
      format: v => v.map(x => { if (typeof x === 'string') return x; keysAre(x, /^role,bonus$/, '开局员工'); return x.role + '+' + numText(x.bonus); }).join(','),
    },
    dirtEntry('黑料'),
  ]);

  return { mods, attr, bars, fx, when, start };
}

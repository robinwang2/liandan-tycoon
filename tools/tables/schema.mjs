// 表结构：每本工作簿有哪些表、每张表有哪些列，以及「表里的行 ⇄ 游戏读的数据」怎么互相转换。
//   pack(data, ctx)        数据 → 行（生成 xlsx 时用）
//   unpack(rows, out, ctx) 行 → 数据（导出 JSON 时用）
// 列的写法：[中文列名, 字段名, 类型, 选项]。类型见 lib/types.mjs；选项里 long = 长文本（列更宽）、w = 列宽、list = 下拉选项。
// 表里多出来的列（表头写了字段名和类型）会原样带进数据，所以加一个纯数据字段不用改这里。
export const ROW = Symbol('row');                                   // 记着这条数据来自第几行，报错时用

const col = ([title, key, type, o = {}]) => ({ title, key, type, ...o, width: o.w });
const C = list => list.map(col);
const strip = r => { const o = {}; for (const k of Object.keys(r)) if (r[k] !== undefined) o[k] = r[k]; return o; };
const groupBy = (rows, key) => { const m = new Map(); for (const r of rows) { if (!m.has(r[key])) m.set(r[key], []); m.get(r[key]).push(r); } return m; };

// ───────── 通用形状 ─────────
// 一行一条记录 → 数组
const list = key => ({
  pack: d => d[key].map(r => ({ ...r })),
  unpack: (rows, out) => { out[key] = rows.map(strip); },
});
// 一行一条记录 → 以 id 为键的对象。keep = 记录里留着 id 字段
const map = (key, keep) => ({
  pack: d => Object.entries(d[key]).map(([id, r]) => { if (keep && r.id !== id) throw new Error(key + '.' + id + ' 的 id 字段和键不一致'); return { id, ...r }; }),
  unpack: (rows, out, ctx) => {
    out[key] = {};
    for (const r of rows) { const { id, ...rest } = strip(r); if (id in out[key]) ctx.fail(r, 'id', `「${id}」重复了`); out[key][id] = keep ? { id, ...rest } : rest; }
  },
});

// ───────── 事件和选项（好几本工作簿共用）─────────
const EVENT_COLS = [
  ['id', 'id', '标识', { w: 24 }], ['标题', 'title', '文本', { w: 22 }], ['图标', 'icon', '文本', { w: 6 }], ['分类', 'cat', '标识', { w: 10 }], ['插画', 'art', '标识', { w: 14 }],
  ['所属事件链', 'chain', '标识', { w: 12 }], ['出现条件', 'when', '条件', { w: 30 }], ['权重', 'weight', '小数', { w: 7 }], ['可重复', 'repeat', '是否', { w: 7 }], ['冷却(月)', 'cd', '整数', { w: 8 }],
  ['对手', 'rival', '标识', { w: 10 }], ['立绘', 'portrait', '标识', { w: 10 }], ['延迟(毫秒)', 'delay', '整数', { w: 9 }], ['演出', 'scene', '标识', { w: 8 }], ['演出文字', 'sceneText', '文本', { w: 20 }],
  ['正文', 'text', '文本', { long: true, w: 90 }],
];
const OPT_COLS = [
  ['选项', 'label', '文本', { w: 22 }], ['提示', 'hint', '文本', { w: 26 }], ['需要', 'req', '条件', { w: 16 }], ['检定', 'check', '检定', { w: 10 }],
  ['结果', 'text', '文本', { long: true, w: 60 }], ['效果', 'fx', '效果', { w: 38, noteKey: 'note' }], ['链进展', 'note', '文本', { w: 30 }],
  ['失败结果', 'failText', '文本', { long: true, w: 50 }], ['失败效果', 'failFx', '效果', { w: 32, noteKey: 'failNote' }], ['失败链进展', 'failNote', '文本', { w: 26 }],
];
const SIDE_COL = ['立场', 'side', '标识', { w: 7, list: ['red', 'cap', 'mid'] }];
const BARS_COLS = [['进度条', 'bars', '进度条', { w: 18 }], ['失败进度条', 'failBars', '进度条', { w: 16 }]];
const ACT_COL = ['动作', 'act', '标识', { w: 12 }];
// 在 cols 里某一列后面插几列
const after = (cols, key, extra) => { const i = cols.findIndex(c => c[1] === key); return [...cols.slice(0, i + 1), ...extra, ...cols.slice(i + 1)]; };

function packEvent(e) {
  const { once, scene, options, ...r } = e;
  if (once !== undefined) { if (once !== false) throw new Error(`事件 ${e.id}：once 只能是 false`); r.repeat = true; }
  if (scene) {
    if (scene.length > 2 || typeof scene[0] !== 'string' || (scene[1] && Object.keys(scene[1]).join() !== 'text')) throw new Error(`事件 ${e.id}：演出的结构不认识`);
    r.scene = scene[0]; if (scene[1]) r.sceneText = scene[1].text;
  }
  return r;
}
function unpackEvent(row, ctx) {
  const { repeat, scene, sceneText, ...e } = strip(row);
  if (repeat) e.once = false;
  if (scene) e.scene = sceneText != null ? [scene, { text: sceneText }] : [scene];
  else if (sceneText != null) ctx.fail(row, 'sceneText', '填了演出文字，但没填演出');
  return e;
}
// 选项：普通选项只用「结果 / 效果」；带检定的，成功用「结果 / 效果」，失败用「失败结果 / 失败效果」
function packOpt(o, where) {
  const { check, odds, ok, fail, text, fx, bars, ...r } = o;
  const empty = x => (x && !Object.keys(x).length ? undefined : x);
  if (check || odds != null) {
    if (check && odds != null) throw new Error(`${where}：不能同时有检定和概率`);
    if (!ok || !fail || text !== undefined || fx !== undefined || bars !== undefined) throw new Error(`${where}：带检定的选项要有 ok 和 fail，不能直接写 text / fx`);
    for (const [k, x] of [['ok', ok], ['fail', fail]]) for (const kk of Object.keys(x)) if (!['text', 'fx', 'bars'].includes(kk)) throw new Error(`${where}.${k} 里有没处理的字段「${kk}」`);
    r.check = check ? { check } : { odds };
    r.text = ok.text; r.fx = empty(ok.fx); r.bars = ok.bars; r.failText = fail.text; r.failFx = empty(fail.fx); r.failBars = fail.bars;
  } else {
    if (ok || fail) throw new Error(`${where}：没有检定的选项不该有 ok / fail`);
    r.text = text; r.fx = empty(fx); r.bars = bars;
  }
  return r;
}
function unpackOpt(row, ctx) {
  const { check, text, fx, note, failText, failFx, failNote, bars, failBars, ...o } = strip(row);
  if (check) {
    Object.assign(o, check);
    o.ok = { text: text ?? '', ...(bars ? { bars } : {}), fx: fx ?? {} };
    o.fail = { text: failText ?? '', ...(failBars ? { bars: failBars } : {}), fx: failFx ?? {} };
    if (text == null) ctx.fail(row, 'text', '带检定的选项要写成功时的结果');
    if (failText == null) ctx.fail(row, 'failText', '带检定的选项要写失败时的结果');
  } else {
    if (failText != null || failFx || failBars || failNote != null) ctx.fail(row, 'failText', '这个选项没有检定，「失败……」那几列应该留空（要么在「检定」列填上检定）');
    o.text = text ?? ''; if (bars) o.bars = bars; o.fx = fx ?? {};
  }
  return o;
}
// 事件表 + 选项表 → 事件数组
const eventSheets = (evName, optName, pick, { partial, group, evCols = EVENT_COLS, optCols = OPT_COLS, about, optAbout = '' } = {}) => {
  const head = group ? [['分组', 'group', '文本', { w: 10, list: Object.keys(group) }]] : [];
  return [
    {
      name: evName, about, freeze: group ? 3 : 2,
      cols: C([...head, ...evCols]),
      pack: d => pick(d).flatMap(([g, evs]) => evs.map(e => ({ ...(group ? { group: g } : {}), ...packEvent(e) }))),
      unpack: (rows, out, ctx) => { ctx.tmp[evName] = rows; },
    },
    {
      name: optName, freeze: 3, about: `「${evName}」里每个事件的选项，一行一个。「事件」列填事件 id，「序号」决定先后。没有检定的选项只填「结果」「效果」；有检定的，成功看「结果」「效果」，失败看「失败结果」「失败效果」。${optAbout}`,
      cols: C([['事件', 'ev', '标识', { w: 24 }], ['序号', 'n', '整数', { w: 6 }], ...optCols, ['#事件标题', '#', '备注', { w: 20, note_col: true, formula: (r, rec) => ({ formula: `IFERROR(VLOOKUP($A${r},'${evName}'!$${group ? 'B' : 'A'}:$${group ? 'C' : 'B'},2,FALSE),"")`, result: rec['#title'] || '' }) }]]),
      pack: (d, ctx) => pick(d).flatMap(([, evs]) => evs.flatMap(e => (e.options || []).map((o, i) => ({ ev: e.id, n: i + 1, ...packOpt(o, `${e.id} 的第 ${i + 1} 个选项`), '#title': e.title })))),
      unpack: (rows, out, ctx) => {
        const opts = groupBy(rows, 'ev'), evRows = ctx.tmp[evName], seen = new Set();
        const build = row => {
          const e = unpackEvent(row, ctx);
          if (seen.has(e.id)) ctx.fail(row, 'id', `事件 id「${e.id}」重复了`); seen.add(e.id);
          const mine = (opts.get(e.id) || []).slice().sort((a, b) => a.n - b.n);
          mine.forEach((o, i) => { if (o.n !== i + 1) ctx.fail(o, 'n', `事件 ${e.id} 的选项序号应该是 1、2、3……连着排，这里是 ${o.n}`); });
          if (mine.length) e.options = mine.map(o => { const { ev, n, ...rest } = o; return unpackOpt(Object.assign(rest, { [ROW]: o[ROW] }), ctx); });
          else if (!partial) ctx.fail(row, 'id', `事件 ${e.id} 一个选项都没有（去「${optName}」里加）`);
          if (e.text == null && !partial) ctx.fail(row, 'text', `事件 ${e.id} 没写正文`);
          opts.delete(e.id);
          return e;
        };
        if (group) {
          for (const k of Object.values(group)) out[k] = [];
          for (const row of evRows) { const { group: g, ...rest } = row; const k = group[g]; if (!k) { ctx.fail(row, 'group', `分组只能是：${Object.keys(group).join('、')}`); continue; } out[k].push(build(Object.assign(rest, { [ROW]: row[ROW] }))); }
        } else out[pick.key] = evRows.map(build);
        for (const [id, rs] of opts) ctx.fail(rs[0], 'ev', `「${evName}」里没有 id 是「${id}」的事件`);
      },
    },
  ];
};
const picker = key => Object.assign(d => [[null, d[key]]], { key });
const projectSheet = {
  name: '特殊项目', early: true, about: '事件效果里写「项目:xxx」开启的特殊项目。完成触发「成功事件」，超期触发「失败事件」。',
  cols: C([['id', 'id', '标识', { w: 22 }], ['所属事件链', 'chain', '标识', { w: 12 }], ['名称', 'name', '文本', { w: 18 }], ['说明', 'desc', '文本', { w: 50 }], ['类型', 'kind', '标识', { w: 8, list: ['res', 'eng', 'ops', 'biz', 'legal', 'gpu', 'ap'] }],
    ['工作量(月)', 'need', '小数', { w: 9 }], ['期限(月)', 'months', '整数', { w: 8 }], ['成功事件', 'ok', '标识', { w: 20 }], ['失败事件', 'fail', '标识', { w: 20 }]]),
  pack: (d, ctx) => [...ctx.projects.values()].map(p => ({ ...p })),
  unpack: (rows, out, ctx) => { for (const r of rows) { const p = strip(r); if (ctx.projects.has(p.id)) ctx.fail(r, 'id', `特殊项目「${p.id}」重复了`); ctx.projects.set(p.id, p); } },
};
const chainSheet = (name, key) => ({ name, about: '事件链的名字和开头的一句话（显示在「项目」页的情境日志里）。', cols: C([['id', 'id', '标识', { w: 14 }], ['标题', 'title', '文本', { w: 22 }], ['图标', 'icon', '文本', { w: 6 }], ['简介', 'intro', '文本', { w: 60 }]]), ...map(key) });

// ───────── 设定.xlsx ─────────
const NAME = ['名称', 'name', '文本', { w: 20 }], ICON = ['图标', 'icon', '文本', { w: 6 }], DESC = ['说明', 'desc', '文本', { w: 56 }], ID = ['id', 'id', '标识', { w: 16 }], MODS = ['修正', 'mods', '修正', { w: 40 }];
const DEFS = {
  file: '设定.xlsx', out: 'defs',
  about: ['游戏里的各种「设定」：地区、路线、赛道、特质、办公室、岗位、董事会卡、功能、对手、黑料、结局、成就……', '这些表里的 id 会被事件和代码引用，改名字、改数值随意，改 id 要小心。'],
  sheets: [
    { name: '修正', early: true, about: '所有「修正」的清单：修正就是那些「×1.2」「每月 +0.5」的长期效果，特质、董事会卡、政策、临时效果都用它。「名称」是在别的表里写修正时用的词（不能有空格），「界面显示名」是游戏里显示的名字（空着 = 游戏里不直接显示）。字段名以 Mult 结尾的是乘法，其余是加法。新增一个修正需要程序配合。',
      cols: C([['字段', 'id', '标识', { w: 18 }], ['名称', 'zh', '文本', { w: 14 }], ['界面显示名', 'ui', '文本', { w: 14 }], ['说明', 'note', '文本', { w: 50 }]]),
      pack: d => d.MODS.map(r => ({ ...r })),
      unpack: (rows, out, ctx) => { out.MODS = rows.map(strip); out.MOD_NAME = Object.fromEntries(rows.filter(r => r.ui != null).map(r => [r.id, r.ui])); for (const r of rows) if (/\s/.test(r.zh || '')) ctx.fail(r, 'zh', '名称里不能有空格'); },
    },
    { name: '属性', about: '创始人的六项属性。', cols: C([ID, NAME, ICON, DESC]), ...list('ATTRS') },
    { name: '地区', about: '两个开局地区。', cols: C([ID, NAME, ['货币符号', 'cur', '文本', { w: 8 }], ICON, ['一句话', 'tagline', '文本', { w: 30 }], ['启动资金(万)', 'cash', '小数', { w: 10 }], ['显卡配额', 'quota', '小数', { w: 9 }], ['特点（每行一条）', 'desc', '多行', { w: 40 }], MODS]), ...map('REGIONS', true) },
    { name: '路线', about: '炼丹派 / 套壳派。', cols: C([ID, NAME, ICON, ['副标题', 'sub', '文本', { w: 24 }], ['特点（每行一条）', 'desc', '多行', { w: 56 }]]), ...map('ROUTES', true) },
    { name: '赛道', about: '产品赛道。市场容量是 2028 年底的总用户（万）；每万用户月收入的单位是万；推理占卡 = 每万用户占几张显卡。', cols: C([ID, NAME, ICON, ['市场容量(万人)', 'cap', '小数', { w: 12 }], ['每万用户月收入', 'arpu', '小数', { w: 12 }], ['推理占卡', 'infer', '小数', { w: 9 }], ['增长系数', 'growth', '小数', { w: 9 }], DESC]), ...map('TRACKS', true) },
    {
      name: '特质', freeze: 2, about: '建角时选的特质，按「分组」分成八类：edu 学历、bg 经历、quirk 怪癖、motto 口头禅、cofounder 合伙人、seed 启动资金、district 落脚点、mission 使命。「地区」填了就只有那个地区能选；「解锁花费」填了就要先在局外商店解锁。',
      cols: C([['分组', 'group', '标识', { w: 10, list: ['edu', 'bg', 'quirk', 'motto', 'cofounder', 'seed', 'district', 'mission'] }], ID, NAME, ICON, DESC, ['地区', 'region', '标识', { w: 7, list: ['bay', 'sz'] }], ['解锁花费', 'cost', '整数', { w: 8 }],
        ['属性', 'attr', '属性', { w: 16 }], MODS, ['开局', 'start', '开局', { w: 30 }], ['起步办公室叫什么', 'startOffice', '文本', { w: 16 }]]),
      pack: d => Object.entries(d.TRAITS).flatMap(([group, arr]) => arr.map(t => ({ group, ...t, startOffice: d.START_OFFICE[t.id] }))),
      unpack: (rows, out, ctx) => {
        out.TRAITS = {}; out.START_OFFICE = {};
        const seen = new Set();
        for (const r of rows) {
          const { group, startOffice, ...t } = strip(r);
          if (seen.has(t.id)) ctx.fail(r, 'id', `特质「${t.id}」重复了`); seen.add(t.id);
          (out.TRAITS[group] ??= []).push(t);
          if (startOffice != null) out.START_OFFICE[t.id] = startOffice;
        }
      },
    },
    { name: '造型', about: '创始人的衣服。', cols: C([ID, NAME, ICON, DESC]), ...list('OUTFITS') },
    {
      name: '办公室', about: '办公室一共几档、每档能坐多少人、月租和升级费（万）。两个地区叫法不一样的，名称留空，填后面两列。',
      cols: C([['档位', 'lv', '整数', { w: 6 }], NAME, ['湾区名称', 'nameBay', '文本', { w: 16 }], ['深圳名称', 'nameSz', '文本', { w: 16 }], ['人数上限', 'cap', '整数', { w: 9 }], ['月租(万)', 'rent', '小数', { w: 9 }], ['升级费(万)', 'up', '小数', { w: 10 }]]),
      pack: d => d.OFFICES.slice(1).map((o, i) => { const { name, ...r } = o; return { lv: i + 1, ...(typeof name === 'string' ? { name } : { nameBay: name.bay, nameSz: name.sz }), ...r }; }),
      unpack: (rows, out, ctx) => {
        out.OFFICES = [null];
        rows.forEach((row, i) => {
          const { lv, name, nameBay, nameSz, ...r } = strip(row);
          if (lv !== i + 1) ctx.fail(row, 'lv', `档位要从 1 开始连着排，这里应该是 ${i + 1}`);
          if (name == null && (nameBay == null || nameSz == null)) ctx.fail(row, 'name', '名称留空时，湾区名称和深圳名称都要填');
          out.OFFICES.push({ name: name != null ? name : { bay: nameBay, sz: nameSz }, ...r });
        });
      },
    },
    {
      name: '楼层', about: '多层办公楼每层住哪些部门（从 1 楼往上）。没列出来的档位是单层。',
      cols: C([['办公室档位', 'lv', '整数', { w: 10 }], ['楼层', 'floor', '整数', { w: 6 }], ['部门', 'depts', '列表', { w: 30 }]]),
      pack: d => Object.entries(d.FLOOR_PLANS).flatMap(([lv, floors]) => floors.map((depts, i) => ({ lv: +lv, floor: i + 1, depts }))),
      unpack: (rows, out, ctx) => {
        out.FLOOR_PLANS = {};
        for (const [lv, rs] of groupBy(rows, 'lv')) { rs.sort((a, b) => a.floor - b.floor); rs.forEach((r, i) => { if (r.floor !== i + 1) ctx.fail(r, 'floor', `楼层要从 1 开始连着排，这里应该是 ${i + 1}`); }); out.FLOOR_PLANS[lv] = rs.map(r => r.depts); }
      },
    },
    { name: '部门', about: '多层办公楼里的部门。', cols: C([ID, NAME, ['简称', 'short', '文本', { w: 10 }], ICON, ['颜色', 'color', '文本', { w: 10 }]]), ...map('DEPTS') },
    { name: '岗位', about: '员工岗位。工资系数是相对工程师的倍数。', cols: C([ID, NAME, ICON, ['工资系数', 'pay', '小数', { w: 9 }], ['颜色', 'color', '文本', { w: 10 }]]), ...map('ROLES') },
    { name: '员工怪癖', about: '员工可能带的怪癖。「说明」显示在员工的说明气泡里。', cols: C([ID, NAME, ['产出倍数', 'out', '小数', { w: 9 }], ['工资倍数', 'pay', '小数', { w: 9 }], ['说明', 'desc', '文本', { w: 40 }]]), ...map('STAFF_QUIRKS') },
    {
      name: '政策', about: '公司政策和每项政策的档位。同一项政策的几行，「政策名」写一样的。',
      cols: C([['政策', 'policy', '标识', { w: 10 }], ['政策名', 'policyName', '文本', { w: 12 }], ['档位', 'opt', '标识', { w: 10 }], ['档位名', 'name', '文本', { w: 14 }], DESC, MODS]),
      pack: d => Object.entries(d.POLICIES).flatMap(([policy, P]) => Object.entries(P.opts).map(([opt, o]) => ({ policy, policyName: P.name, opt, ...o }))),
      unpack: (rows, out, ctx) => {
        out.POLICIES = {};
        for (const row of rows) {
          const { policy, policyName, opt, ...o } = strip(row);
          const P = (out.POLICIES[policy] ??= { name: policyName, opts: {} });
          if (policyName != null && P.name == null) P.name = policyName;
          if (policyName != null && P.name !== policyName) ctx.fail(row, 'policyName', `同一项政策的政策名要一样（前面写的是「${P.name}」）`);
          if (opt in P.opts) ctx.fail(row, 'opt', `档位「${opt}」重复了`);
          P.opts[opt] = o;
        }
      },
    },
    { name: '董事会卡', about: '董事会卡（三选一）。稀有度：1 普通、2 稀有、3 传说。「效果」是拿到那一刻生效一次，「修正」是长期的。', cols: C([ID, ['稀有度', 'r', '整数', { w: 7 }], NAME, ICON, DESC, MODS, ['效果', 'fx', '效果', { w: 24 }]]), ...list('PERKS') },
    { name: '功能', about: '功能冲刺（三选一）。工程量越大做得越久。', cols: C([ID, NAME, ICON, ['工程量', 'need', '小数', { w: 8 }], DESC, ['效果', 'fx', '效果', { w: 24 }], MODS]), ...list('FEATURES') },
    {
      name: '对手', about: '行业里的对手（全是虚构恶搞）。能力偏移 = 相对行业前沿的能力差；注水习惯 = 跑分虚高多少。后三列管融资时谁会来「战略投资」：平时从「战略投资」打勾的里面挑；走上红色路线以后从「东方阵营」里挑（东方阵营也是红色公司还留在牌桌上的对手）；湾区走了共享繁荣以后从「共享繁荣」里挑。',
      cols: C([ID, NAME, ['老板', 'boss', '文本', { w: 12 }], ['模型', 'model', '文本', { w: 12 }], ['能力偏移', 'off', '小数', { w: 9 }], ['注水习惯', 'cheat', '小数', { w: 9 }], ['颜色', 'color', '文本', { w: 10 }], ['风格', 'style', '文本', { w: 14 }],
        ['东方阵营', 'east', '是否', { w: 9 }], ['战略投资', 'invest', '是否', { w: 9 }], ['共享繁荣', 'rose', '是否', { w: 9 }]]),
      pack: d => { const yes = (l, id) => (l.includes(id) ? true : undefined); return d.RIVALS.map(r => ({ ...r, east: yes(d.EAST_RIVALS, r.id), invest: yes(d.INVEST_RIVALS, r.id), rose: yes(d.ROSE_RIVALS, r.id) })); },
      unpack: (rows, out) => {
        out.RIVALS = rows.map(r => { const { east, invest, rose, ...x } = strip(r); return x; });
        const of = k => rows.filter(r => r[k]).map(r => r.id);
        out.EAST_RIVALS = of('east'); out.INVEST_RIVALS = of('invest'); out.ROSE_RIVALS = of('rose');
      },
    },
    {
      name: '投资人', about: '融资时出现的投资机构。「默认」= 平时的名单；「红色路线」= 走上红色路线以后剩下的；「共享繁荣」= 湾区走了共享繁荣以后剩下的。',
      cols: C([['名称', 'name', '文本', { w: 22 }], ['默认', 'base', '是否', { w: 7 }], ['红色路线', 'east', '是否', { w: 9 }], ['共享繁荣', 'prog', '是否', { w: 9 }]]),
      pack: d => {
        const names = [...new Set([...d.INVESTORS, ...d.INVESTORS_EAST, ...d.INVESTORS_PROGRESSIVE])], yes = (l, n) => (l.includes(n) ? true : undefined);
        return names.map(name => ({ name, base: yes(d.INVESTORS, name), east: yes(d.INVESTORS_EAST, name), prog: yes(d.INVESTORS_PROGRESSIVE, name) }));
      },
      unpack: (rows, out) => { const of = k => rows.filter(r => r[k]).map(r => r.name); out.INVESTORS = of('base'); out.INVESTORS_EAST = of('east'); out.INVESTORS_PROGRESSIVE = of('prog'); },
    },
    {
      name: '融资轮次', about: '各轮融资的「达标线」：估值基数（万）、用户（万）、月收入（万）。「旧配额倍数」只给老存档迁移用。',
      cols: C([['轮次', 'stage', '整数', { w: 6 }], NAME, ['估值基数(万)', 'base', '小数', { w: 12 }], ['用户线(万)', 'users', '小数', { w: 10 }], ['月收入线(万)', 'rev', '小数', { w: 11 }], ['旧配额倍数', 'oldQuota', '小数', { w: 10 }]]),
      pack: d => d.STAGES.map((s, i) => ({ stage: i, ...s, oldQuota: d.OLD_QUOTA_MULT[i] })),
      unpack: (rows, out, ctx) => {
        out.STAGES = []; out.OLD_QUOTA_MULT = [];
        rows.forEach((row, i) => { const { stage, oldQuota, ...s } = strip(row); if (stage !== i) ctx.fail(row, 'stage', `轮次要从 0 开始连着排，这里应该是 ${i}`); out.STAGES.push(s); out.OLD_QUOTA_MULT.push(oldQuota ?? 1); });
      },
    },
    { name: '数据源', about: '丹炉可以烧的训练数据。「黑料」填了 = 用它就留下这张黑料。', cols: C([ID, NAME, ['效率倍数', 'mult', '小数', { w: 9 }], DESC, ['黑料', 'dirt', '标识', { w: 12 }]]), ...map('DATA_SOURCES') },
    { name: '黑料', about: '黑料的种类。「涉嫌违法」填 1 = 曝光多了会惊动经侦。', cols: C([ID, NAME, ['严重度', 'sev', '小数', { w: 8 }], ['涉嫌违法', 'crime', '整数', { w: 9 }], ['曝光时的文案', 'blurb', '文本', { long: true, w: 80 }]]), ...map('DIRT') },
    { name: '结局', about: '所有结局。「好结局」1 / 0；基础分用来算局外的人脉点。文案里 {co} 是公司名、{model} 是模型名、{pay} 是到手的钱。', cols: C([ID, NAME, ICON, ['好结局', 'good', '整数', { w: 7 }], ['基础分', 'base', '小数', { w: 8 }], ['文案', 'text', '文本', { long: true, w: 90 }]]), ...map('ENDINGS') },
    { name: '成就', about: '成就。达成条件在代码里，这里是名字和说明。', cols: C([ID, NAME, ICON, DESC]), ...map('ACHIEVEMENTS') },
    {
      name: '公司目标', about: '「意识形态」页显示的公司目标。走完路线之争以后会变，并带来长期修正。', cols: C([ID, ['名称', 'name', '文本', { w: 40 }], DESC, MODS]),
      pack: d => Object.entries(d.GOALS).map(([id, g]) => ({ id, ...g, desc: g.desc || undefined })),
      unpack: (rows, out) => { out.GOALS = Object.fromEntries(rows.map(r => { const { id, ...g } = strip(r); return [id, { name: g.name, desc: g.desc ?? '', ...g }]; })); },
    },
    {
      name: '标记修正', about: '某个标记立着的时候长期生效的修正（比如两条一次性事件链成功以后的长期效果）。', cols: C([['标记', 'flag', '标识', { w: 14 }], MODS, ['#说明', '#', '备注', { w: 40, note_col: true }]]),
      pack: d => Object.entries(d.IDEO_FLAG_MODS).map(([flag, mods]) => ({ flag, mods })),
      unpack: (rows, out) => { out.IDEO_FLAG_MODS = Object.fromEntries(rows.map(r => [r.flag, r.mods || {}])); },
    },
    { name: '局外商店', about: '用「人脉点」买的局外成长。「解锁特质」填特质 id；「前置」填另一件商品的 id。', cols: C([ID, ['名称', 'name', '文本', { w: 40 }], ['花费', 'cost', '整数', { w: 7 }], ['解锁特质', 'trait', '标识', { w: 12 }], ['前置', 'need', '标识', { w: 12 }]]), ...list('META_SHOP') },
    {
      name: '名字', about: '随机员工的名字：每一列是一个词库，互相独立，往下加就行。深圳是 姓 + 名，湾区是 名 + 姓。',
      cols: C([['深圳·姓', 'szA', '文本', { w: 12 }], ['深圳·名', 'szB', '文本', { w: 12 }], ['湾区·名', 'bayA', '文本', { w: 12 }], ['湾区·姓', 'bayB', '文本', { w: 12 }]]),
      pack: d => { const N = d.NAMES, n = Math.max(N.sz.a.length, N.sz.b.length, N.bay.a.length, N.bay.b.length); return Array.from({ length: n }, (_, i) => ({ szA: N.sz.a[i], szB: N.sz.b[i], bayA: N.bay.a[i], bayB: N.bay.b[i] })); },
      unpack: (rows, out) => { const colOf = k => rows.map(r => r[k]).filter(v => v != null); out.NAMES = { sz: { a: colOf('szA'), b: colOf('szB') }, bay: { a: colOf('bayA'), b: colOf('bayB') } }; },
    },
    {
      name: '项目类型', about: '特殊项目靠什么推进（显示在项目页）。', cols: C([ID, NAME]),
      pack: d => Object.entries(d.KIND_NAME).map(([id, name]) => ({ id, name })),
      unpack: (rows, out) => { out.KIND_NAME = Object.fromEntries(rows.map(r => [r.id, r.name])); },
    },
    {
      name: '事件分类', about: '事件的分类：名字、颜色，以及这一类事件没有指定插画时用哪张。', cols: C([ID, NAME, ['颜色', 'color', '文本', { w: 10 }], ['默认插画', 'art', '标识', { w: 14 }]]),
      pack: d => Object.entries(d.CAT).map(([id, c]) => ({ id, ...c, art: d.CAT_ART[id] })),
      unpack: (rows, out) => { out.CAT = {}; out.CAT_ART = {}; for (const r of rows) { const { id, art, ...c } = strip(r); out.CAT[id] = c; if (art != null) out.CAT_ART[id] = art; } },
    },
  ],
};

// ───────── 平衡参数.xlsx ─────────
const PARAMS = {
  file: '平衡参数.xlsx', out: 'params',
  about: ['公式里的数字。代码管「怎么算」，这张表管「调多少」。', '「值」一般是一个数；按名次、按顺序排的一组系数写成逗号隔开的一串数。「最小」「最大」填了的话，导出时会检查「值」有没有越界。', '参数名的前缀是它管的系统：model 模型和算力、users 用户、rev 收入、cost 支出、val 估值、perf 业绩、gpu 显卡、staff 员工、dirt 黑料、hype/morale/rep/reg/bubble 几项仪表、rival 对手、event 随机事件、start 开局、score 结算、ach 成就、ideo 路线之争……'],
  sheets: [{
    name: '参数', about: '一行一个参数。',
    cols: C([['参数', 'key', '标识', { w: 24 }], ['值', 'value', '数或数列', { w: 14 }], ['单位', 'unit', '文本', { w: 8 }], ['最小', 'min', '小数', { w: 8 }], ['最大', 'max', '小数', { w: 8 }], ['说明', 'desc', '文本', { w: 60 }], ['在哪用', 'use', '文本', { w: 30 }]]),
    pack: d => d.ROWS.map(r => ({ ...r })),
    unpack: (rows, out, ctx) => {
      out.ROWS = rows.map(strip); out.P = {};
      for (const r of rows) {
        if (r.value == null) { ctx.fail(r, 'value', `参数 ${r.key} 没填值`); continue; }
        if (r.key in out.P) ctx.fail(r, 'key', `参数「${r.key}」重复了`);
        for (const x of [].concat(r.value)) {
          if (r.min != null && x < r.min) ctx.fail(r, 'value', `${r.key} = ${x}，小于最小值 ${r.min}`);
          if (r.max != null && x > r.max) ctx.fail(r, 'value', `${r.key} = ${x}，大于最大值 ${r.max}`);
        }
        out.P[r.key] = r.value;
      }
    },
  }],
};

// ───────── 事件.xlsx ─────────
const EVENTS = {
  file: '事件.xlsx', out: 'events',
  about: ['系统事件（由引擎按规则触发）、随机事件（每月从池子里抽）和滚动新闻。', '系统事件背后有代码：文字和数字都在表里，但选项什么时候出现、选了以后具体怎么算，由选项的「脚本」决定。'],
  sheets: [
    ...eventSheets('系统事件', '系统选项', picker('EVENTS_CORE'), {
      evCols: [...EVENT_COLS, ['湾区正文', 'textBay', '文本', { long: true, w: 70 }], ['参数', 'p', '参数', { w: 40 }]],
      optCols: [...after(OPT_COLS, 'hint', [['出现条件', 'when', '条件', { w: 16 }]]), ['脚本', 'fn', '标识', { w: 10 }], ['参数', 'p', '参数', { w: 30 }], ['不预览', 'noTip', '是否', { w: 7 }]],
      about: '由引擎按规则触发的事件（权重 0 = 不进随机池）。正文里的 {现金} {报价} 这类是代码算出来填进去的变量；「湾区正文」填了的话，湾区用它代替正文；「参数」是给这个事件的脚本用的数字。系统事件要用 {rival} {boss}，得在「对手」列写明是谁。',
      optAbout: '「出现条件」不满足时这个选项不出现；「脚本」是这个选项背后那段代码的名字（别改，改了就对不上）；「参数」是脚本用的数字，可以改；「不预览」填「是」= 鼠标悬停时不显示效果预览。',
    }),
    {
      name: '系统文本', about: '系统事件里按局势换着用的几段话：正文里的变量（比如 {开场白} {员工的反应}）就是从这里挑一段填进去。键是给程序认的，别改；文本随便改。',
      cols: C([['键', 'key', '标识', { w: 26 }], ['文本', 'text', '文本', { long: true, w: 100 }], ['用在哪', 'note', '文本', { w: 44 }]]),
      pack: d => Object.entries(d.TEXT).map(([key, text]) => ({ key, text, note: d.TEXT_DOC?.[key] })),
      unpack: (rows, out, ctx) => { out.TEXT = {}; out.TEXT_DOC = {}; for (const r of rows) { if (r.key in out.TEXT) ctx.fail(r, 'key', `键「${r.key}」重复了`); out.TEXT[r.key] = r.text ?? ''; if (r.note != null) out.TEXT_DOC[r.key] = r.note; } },
    },
    ...eventSheets('随机事件', '随机选项', picker('EVENTS_PACK'), { about: '每个月从这里按权重抽。权重不填 = 1；默认每局只出现一次，「可重复」填是 = 过了冷却期还能再来。' }),
    { name: '新闻', about: '屏幕上滚动的行业新闻，一行一条，随机挑。', cols: C([['新闻', 'text', '文本', { long: true, w: 110 }]]), pack: d => d.NEWS.map(text => ({ text })), unpack: (rows, out) => { out.NEWS = rows.map(r => r.text); } },
  ],
};

// ───────── 事件链.xlsx ─────────
const CHAINS = {
  file: '事件链.xlsx', out: 'chains',
  about: ['事件链：一个开头事件（进随机池）+ 若干后续事件（权重 0，由特殊项目完成 / 超期，或者「后续:」触发）。'],
  sheets: [
    chainSheet('事件链', 'CHAINS'),
    ...eventSheets('链事件', '链选项', picker('EVENTS_CHAINS'), { about: '事件链上的事件。开头事件有权重和出现条件；后续事件权重填 0。' }),
    projectSheet,
  ],
};

// ───────── 路线之争（两本，结构一样）─────────
const STAGE_OPT_COLS = [SIDE_COL, ...after(OPT_COLS, 'fx', [BARS_COLS[0]]).filter(c => !['note', 'failNote'].includes(c[1])), BARS_COLS[1]];
const ideoBook = (ver, zh) => ({
  file: `路线之争-${zh}.xlsx`, out: `ideology_${ver}`,
  about: [`「路线之争」${zh}版的全部内容：角色、15 级阶段、卡池、结局、结局后的事件、两条一次性事件链，以及意识形态行动的文案。`, '立场：red 左翼 / cap 资本 / mid 务实。进度条写法：左翼+9 资本-2。'],
  sheets: [
    {
      name: '版本设定', about: '这个版本的几项基本设定。值是数字就填数字，是 id 就填 id。', cols: C([['设定', 'key', '标识', { w: 16 }], ['值', 'value', '文本', { w: 16 }], ['说明', 'note', '文本', { w: 72 }]]),
      pack: d => { const rows = [], walk = (o, pre) => { for (const [k, x] of Object.entries(o)) if (x && typeof x === 'object') walk(x, pre + k + '.'); else rows.push({ key: pre + k, value: String(x), note: d.VER_DOC?.[pre + k] }); }; walk(d.VER, ''); return rows; },
      unpack: (rows, out, ctx) => {
        out.VER = {}; out.VER_DOC = {};
        for (const r of rows) {
          if (r.value == null) { ctx.fail(r, 'value', `设定 ${r.key} 没填值`); continue; }
          const path = r.key.split('.'); let o = out.VER;
          for (const p of path.slice(0, -1)) { o[p] ??= {}; if (typeof o[p] !== 'object') { ctx.fail(r, 'key', `「${r.key}」和前面的设定冲突`); break; } o = o[p]; }
          if (path.at(-1) in o) ctx.fail(r, 'key', `设定「${r.key}」重复了`);
          o[path.at(-1)] = /^-?\d+(\.\d+)?$/.test(r.value.trim()) ? Number(r.value) : r.value;
          if (r.note != null) out.VER_DOC[r.key] = r.note;
        }
      },
    },
    { name: '角色', about: '三位主要角色（正文里直接写名字）。', cols: C([ID, ['名字', 'name', '文本', { w: 12 }], ['身份', 'role', '文本', { w: 24 }], ['简介', 'desc', '文本', { w: 70 }]]), ...map('IDEO_CAST') },
    {
      name: '阶段', about: '15 级，按顺序，每月一级。', cols: C([['第几级', 'n', '整数', { w: 7 }], ['标题', 'title', '文本', { w: 22 }], ICON, ['插画', 'art', '标识', { w: 14 }], ['立绘', 'portrait', '标识', { w: 10 }], ['正文', 'text', '文本', { long: true, w: 100 }]]),
      pack: d => d.IDEO_STAGES.map((s, i) => { const { opts, ...r } = s; return { n: i + 1, ...r }; }),
      unpack: (rows, out, ctx) => { ctx.tmp.stages = rows; },
    },
    {
      name: '阶段选项', freeze: 3, about: '每一级自带的选项（每级 2~4 个，至少一张左翼、一张资本）。从第 3 级起，引擎按玩家的倾向决定给几张哪种立场的卡：本级的优先，不够的从「卡池」抽。',
      cols: C([['第几级', 'n', '整数', { w: 7 }], ['序号', 'i', '整数', { w: 6 }], ...STAGE_OPT_COLS]),
      pack: d => d.IDEO_STAGES.flatMap((s, n) => s.opts.map((o, i) => ({ n: n + 1, i: i + 1, ...packOpt(o, `第 ${n + 1} 级的第 ${i + 1} 个选项`) }))),
      unpack: (rows, out, ctx) => {
        const by = groupBy(rows, 'n');
        out.IDEO_STAGES = ctx.tmp.stages.map((row, k) => {
          const { n, ...s } = strip(row);
          if (n !== k + 1) ctx.fail(row, 'n', `级数要从 1 开始连着排，这里应该是 ${k + 1}`);
          const mine = (by.get(n) || []).slice().sort((a, b) => a.i - b.i);
          mine.forEach((o, j) => { if (o.i !== j + 1) ctx.fail(o, 'i', `第 ${n} 级的选项序号应该连着排，这里应该是 ${j + 1}`); });
          if (!mine.length) ctx.fail(row, 'n', `第 ${n} 级一个选项都没有`);
          by.delete(n);
          return { ...s, opts: mine.map(o => { const { n: _n, i: _i, ...rest } = o; return unpackOpt(Object.assign(rest, { [ROW]: o[ROW] }), ctx); }) };
        });
        for (const [n, rs] of by) ctx.fail(rs[0], 'n', `「阶段」表里没有第 ${n} 级`);
      },
    },
    {
      name: '卡池', freeze: 2, about: '补充用的选项卡。「最早 / 最晚」= 能出现在第几级到第几级；「出现条件」和事件的写法一样，另外能用 左翼≥ / 资本≥ 读两条进度条。',
      cols: C([['id', 'id', '标识', { w: 24 }], SIDE_COL, ['最早', 'from', '整数', { w: 6 }], ['最晚', 'to', '整数', { w: 6 }], ['出现条件', 'when', '条件', { w: 24 }], ...STAGE_OPT_COLS.slice(1)]),
      pack: d => d.IDEO_POOL.map(c => packOpt(c, `卡池 ${c.id}`)),
      unpack: (rows, out, ctx) => { const seen = new Set(); out.IDEO_POOL = rows.map(r => { if (seen.has(r.id)) ctx.fail(r, 'id', `卡「${r.id}」重复了`); seen.add(r.id); return unpackOpt(r, ctx); }); },
    },
    {
      name: '结局', about: '第 15 级之后的四种收场：red 左翼结局、cap 保守结局、purge 处置左倾员工、fail 股权不够说了不算。', cols: C([ID, ['标题', 'title', '文本', { w: 24 }], ICON, ['插画', 'art', '标识', { w: 14 }], ['正文', 'text', '文本', { long: true, w: 100 }]]),
      pack: d => Object.entries(d.IDEO_ENDINGS).map(([id, e]) => { const { options, ...r } = e; return { id, ...r }; }),
      unpack: (rows, out, ctx) => { ctx.tmp.endings = rows; },
    },
    {
      name: '结局选项', freeze: 3, about: '四种收场各自的选项。「动作」只有 purge 用：fire_all / reeducate / release / tolerate。',
      cols: C([['结局', 'end', '标识', { w: 8 }], ['序号', 'i', '整数', { w: 6 }], ACT_COL, ...OPT_COLS.filter(c => !['note', 'failNote'].includes(c[1]))]),
      pack: d => Object.entries(d.IDEO_ENDINGS).flatMap(([end, e]) => e.options.map((o, i) => ({ end, i: i + 1, ...packOpt(o, `结局 ${end} 的第 ${i + 1} 个选项`) }))),
      unpack: (rows, out, ctx) => {
        const by = groupBy(rows, 'end'); out.IDEO_ENDINGS = {};
        for (const row of ctx.tmp.endings) {
          const { id, ...e } = strip(row), mine = (by.get(id) || []).slice().sort((a, b) => a.i - b.i);
          if (!mine.length) ctx.fail(row, 'id', `结局 ${id} 一个选项都没有`);
          out.IDEO_ENDINGS[id] = { ...e, options: mine.map(o => { const { end: _e, i: _i, ...rest } = o; return unpackOpt(Object.assign(rest, { [ROW]: o[ROW] }), ctx); }) };
          by.delete(id);
        }
        for (const [id, rs] of by) ctx.fail(rs[0], 'end', `「结局」表里没有「${id}」`);
      },
    },
    chainSheet('事件链', 'IDEO_CHAINS'),
    ...eventSheets('事件', '选项', d => [['结局后', d.IDEO_EVENTS], ['公社实验', d.UTOPIA_EVENTS], ['脑机实验', d.BCI_EVENTS], ...(d.SCARE_EVENTS ? [['红色恐慌', d.SCARE_EVENTS]] : [])],
      { group: { 结局后: 'IDEO_EVENTS', 公社实验: 'UTOPIA_EVENTS', 脑机实验: 'BCI_EVENTS', ...(ver === 'us' ? { 红色恐慌: 'SCARE_EVENTS' } : {}) }, about: '分组：「结局后」= 路线之争走完以后才进随机池的事件（靠标记限定）；「公社实验」「脑机实验」= 两条一次性事件链' + (ver === 'us' ? '；「红色恐慌」= 反共压力高的时候弹出来的事件' : '') + '。' }),
    projectSheet,
    {
      name: '行动文案', about: '意识形态页那些行动做完以后的结果文案：同一个行动写几行，游戏里随机挑一行。', cols: C([['行动', 'act', '标识', { w: 12 }], ['文案', 'text', '文本', { long: true, w: 110 }]]),
      pack: d => Object.entries(d.ACT_TEXT).flatMap(([act, arr]) => arr.map(text => ({ act, text }))),
      unpack: (rows, out) => { out.ACT_TEXT = {}; for (const r of rows) (out.ACT_TEXT[r.act] ??= []).push(r.text); },
    },
    ...eventSheets('系统事件', '系统选项', picker('SYS_EVENTS'), {
      evCols: [...EVENT_COLS, ['参数', 'p', '参数', { w: 20 }]],
      optCols: [...OPT_COLS.filter(c => !['note', 'failNote'].includes(c[1])), ['脚本', 'fn', '标识', { w: 9 }], ['参数', 'p', '参数', { w: 22 }]],
      about: '代码弹出来的几个窗口：ideo_entry「接盘老股」（中后期的入口）、ideo_plan「五年计划」立项、ideo_plan_ok / ideo_plan_fail 计划到期（完成 / 没完成）、ideo_yank「末位淘汰」确认。标题、正文、图标、插画、选项的文字、效果和检定都在这里改；分类和权重由代码定，这两列空着。',
      optAbout: '「脚本」是这个选项背后那段代码的名字（别改，改了就对不上）。「参数」是脚本用的数：接盘老股里 rofr 的「份额」「溢价」（价格 = 估值 × 份额% × 溢价）、stall 拖延失败时加的反共压力；五年计划里每个目标的算法（目标 = max(现在 × 倍数, 现在 + 至少)，模型是 现在 + 提升），「效果」是立项那一刻生效的限时加成。提示里的 {价格} {份额} {目标} 是代码填的。',
    }),
  ],
});

// ───────── 行动.xlsx ─────────
const ACTS = {
  file: '行动.xlsx', out: 'actions',
  about: ['CEO 行动：左边面板上的那些按钮。每个行动花行动点（有的还要花钱），要么直接生效，要么弹出一个窗口再选。',
    '行动背后有代码（src/game/actions.js，按 id 对上）：什么时候能点、具体怎么算由代码决定；名字、数字、文字都在这几张表里改。'],
  sheets: [
    { name: '页签', about: '左边面板的几个页签，按这里的顺序显示。', cols: C([ID, NAME, ICON]), ...list('TABS') },
    {
      name: '行动', freeze: 2,
      about: '一行一个行动，按页签分组显示，同一页签里按这里的先后排。「黑箱」= 名字前面挂 ☠；「地区」填了就只在那个地区出现。「检定」填了的行动，点下去先掷检定：成功生效「效果」，失败生效「失败效果」，结果文字是「行动文本」里的 <id>.ok / <id>.fail；没有检定的直接生效「效果」，结果文字是 <id>.done。有些行动的效果是代码算的（比如按属性加成），这两列就空着，数字在「参数」里。「描述」是按钮上那行字：{名字} 是代码算好填进去的数，「参数」里的每个数也都能这样引用，比如 {士气}；「湾区描述」填了的话湾区用它。「参数」是这个行动的公式里用到的数，名字=数，空格隔开；一串数用逗号隔开。',
      cols: C([ID, ['页签', 'tab', '标识', { w: 7, list: ['rd', 'team', 'cap', 'pr', 'ops', 'ideo'] }], ['名称', 'name', '文本', { w: 16 }], ['湾区名称', 'us', '文本', { w: 14 }], ICON,
        ['行动点', 'ap', '整数', { w: 7 }], ['冷却(月)', 'cd', '整数', { w: 8 }], ['黑箱', 'shady', '是否', { w: 6 }], ['地区', 'region', '标识', { w: 6, list: ['bay', 'sz'] }],
        ['检定', 'check', '检定', { w: 9 }], ['效果', 'fx', '效果', { w: 30 }], ['失败效果', 'failFx', '效果', { w: 24 }],
        ['描述', 'desc', '文本', { w: 56 }], ['湾区描述', 'descBay', '文本', { w: 44 }], ['参数', 'p', '参数', { w: 60 }]]),
      pack: d => d.ACTIONS.map(r => { const { check, odds, ...x } = r; return check ? { ...x, check: { check } } : odds != null ? { ...x, check: { odds } } : x; }),
      unpack: (rows, out, ctx) => {
        const seen = new Set();
        out.ACTIONS = rows.map(r => { const { check, ...x } = strip(r); if (seen.has(x.id)) ctx.fail(r, 'id', `行动「${x.id}」重复了`); seen.add(x.id); return check ? { ...x, ...check } : x; });
      },
    },
    {
      name: '融资报价',
      about: '「启动融资」弹出来的投资意向书。用途：「固定」= 每次都有的第一份；「随机」= 从满足「出现条件」的里面随机抽，补满三份；「流血」= 业绩不够时唯一的那一份。名称里的 {机构} 会换成一家随机的投资机构（名单在 设定.xlsx 的「投资人」表），{对手} 换成一家来战略投资的对手。「效果」在签字那一刻生效；「脚本」vam = 对赌（「参数」里的期限是几个月），备注里的 {目标} 是对赌要达到的用户数。',
      cols: C([['用途', 'kind', '文本', { w: 7, list: ['固定', '随机', '流血'] }], ['名称', 'label', '文本', { w: 24 }], ['估值倍数', 'vk', '小数', { w: 9 }], ['出让比例', 'share', '小数', { w: 9 }], ['备注', 'note', '文本', { w: 30 }],
        ['效果', 'fx', '效果', { w: 30 }], ['出现条件', 'when', '条件', { w: 20 }], ['脚本', 'fn', '标识', { w: 7 }], ['参数', 'p', '参数', { w: 12 }]]),
      ...list('OFFERS'),
    },
    {
      name: '行动文本', freeze: 1,
      about: '行动的结果、窗口和提示里的所有文字。键是给程序认的，别改；文本随便改。{名字} 是代码算好填进去的值。同一个键连着写几行 = 游戏里随机挑一句。「湾区文本」填了的话湾区用它。',
      cols: C([['键', 'key', '标识', { w: 26 }], ['文本', 'text', '文本', { long: true, w: 80 }], ['湾区文本', 'bay', '文本', { long: true, w: 60 }], ['用在哪', 'note', '文本', { w: 36 }]]),
      pack: d => Object.entries(d.TEXT).flatMap(([key, list]) => list.map((e, i) => ({ key, text: e.text, bay: e.bay, note: i ? undefined : d.TEXT_DOC?.[key] }))),
      unpack: (rows, out, ctx) => {
        out.TEXT = {}; out.TEXT_DOC = {};
        let last = null;
        for (const r of rows) {
          if (r.key in out.TEXT && r.key !== last) ctx.fail(r, 'key', `键「${r.key}」前面已经出现过：同一个键的几种说法（游戏里随机挑一句）要挨着写`);
          (out.TEXT[r.key] ??= []).push(r.bay != null ? { text: r.text ?? '', bay: r.bay } : { text: r.text ?? '' });
          if (r.note != null && !(r.key in out.TEXT_DOC)) out.TEXT_DOC[r.key] = r.note;
          last = r.key;
        }
      },
    },
  ],
};

// ───────── 文本.xlsx ─────────
// 每张表一样的四列；键在整本里唯一（导出时合成一张大表，SHEET 记着每个键在哪张表，反向生成表格时用）
const textSheet = (name, about) => ({
  name, about, freeze: 1,
  cols: C([['键', 'key', '标识', { w: 26 }], ['文本', 'text', '文本', { long: true, w: 80 }], ['湾区文本', 'bay', '文本', { long: true, w: 44 }], ['用在哪', 'note', '文本', { w: 44 }]]),
  pack: d => Object.keys(d.TEXT).filter(k => d.SHEET[k] === name).map(key => ({ key, text: d.TEXT[key].text, bay: d.TEXT[key].bay, note: d.TEXT_DOC[key] })),
  unpack: (rows, out, ctx) => {
    out.TEXT ??= {}; out.TEXT_DOC ??= {}; out.SHEET ??= {};
    for (const r of rows) {
      if (r.key in out.TEXT) ctx.fail(r, 'key', `键「${r.key}」重复了（${out.SHEET[r.key] === name ? '这张表里' : `「${out.SHEET[r.key]}」表里`}已经有了）`);
      out.TEXT[r.key] = r.bay != null ? { text: r.text ?? '', bay: r.bay } : { text: r.text ?? '' };
      out.SHEET[r.key] = name;
      if (r.note != null) out.TEXT_DOC[r.key] = r.note;
    }
  },
});
const TEXTS = {
  file: '文本.xlsx', out: 'text',
  about: ['代码里拼出来的文字：新闻流、各种小窗口、提示语、效果预览……按用在哪分成几张表。',
    '键是给程序认的，别改；文本随便改。{名字} 是代码算好填进去的值，别删（可以挪位置）。「湾区文本」填了的话湾区用它。每个键只写一行。'],
  sheets: [
    textSheet('引擎', '数值引擎自己说的话：新闻流里的句子、黑料引爆和董事会卡的窗口、选项上的检定和「点不了」的原因、选完以后冒出来的变化小标签、鼠标悬停时的效果预览、员工说明气泡。黑料引爆窗口里的数字在 平衡参数.xlsx 里（scandal. 开头）。'),
    textSheet('参谋', '参谋提示（左边「行动提示」里的那几条）：每条提示的图标、标题、正文和接在正文里的几句。什么时候出现由代码和 平衡参数.xlsx 里 advice. 开头的门槛决定；提示里提到的线（离职线、逼宫线、经侦线……）直接读引擎的参数。'),
    textSheet('教学', '新手教学里「学长老周」说的话：每一步一个标题、一段正文（tut.<步骤>.title / .text）。每一步第几个月开放在 平衡参数.xlsx 里（tut. 开头）；高亮哪个按钮、切到哪个页签由代码定。'),
    textSheet('界面', '界面上的字：标题画面、建角向导、局外成长、顶栏、左右两边的面板、底栏、事件窗的框、结局页、设置、菜单和几个确认窗、行动提示的按钮话术、员工气泡。{名字} 是代码填的值；有的值本身是一段带格式的字（比如加粗的数字），照样当一个变量用。一行一项的（随机名字、员工的口头禅）每行写一个。'),
    textSheet('路线之争', '路线之争的两地版本对照：「文本」是深圳版，「湾区文本」是湾区版（空着 = 两地一样）。进度条和立场的名字、开链和结局的新闻、情境日志、每一级正文后面接的局势提醒、处置左倾员工的结果和提示、五年计划和末位淘汰的新闻、意识形态页上的几句话。窗口本身（标题、正文、选项）在两本「路线之争」工作簿里；数字在 平衡参数.xlsx 里（ideo. 开头）。'),
  ],
};

// ───────── 音频.xlsx ─────────
const AUDIO = {
  file: '音频.xlsx', out: 'audio',
  about: ['声音都是浏览器现场合成的（src/audio/audio.js）：合成的配方在代码里，这里是参数和清单。', '「音量」「配乐」游戏会读；「音效」是清单，以后做 Unity 版要把每种声音录成文件，用它跟进。'],
  sheets: [
    {
      name: '音量', about: '玩家没调过音量时的默认值（0~1）。', cols: C([['通道', 'key', '标识', { w: 10 }], ['默认音量', 'value', '小数', { w: 10 }], ['说明', 'note', '文本', { w: 20 }]]),
      pack: d => Object.entries(d.VOLUMES).map(([key, value]) => ({ key, value, note: d.VOLUME_DOC?.[key] })),
      unpack: (rows, out) => { out.VOLUMES = {}; out.VOLUME_DOC = {}; for (const r of rows) { out.VOLUMES[r.key] = r.value; if (r.note != null) out.VOLUME_DOC[r.key] = r.note; } },
    },
    {
      name: '配乐', about: '生成式配乐的七种情绪。根音 = MIDI 音高；音阶 = 相对根音的半音数；和弦走向 = 每小节的和弦根音（音阶里的半音偏移）；速度 = 每分钟拍数；密度 = 每拍出音符的机会（0~1）；亮度 = 低通滤波的截止频率（Hz）。什么时候用哪种由代码按局势定（见「什么时候」）。id 别改。',
      cols: C([['情绪', 'id', '标识', { w: 9 }], ['根音', 'root', '整数', { w: 6 }], ['音阶', 'scale', '数或数列', { w: 18 }], ['和弦走向', 'chords', '数或数列', { w: 12 }], ['速度', 'bpm', '整数', { w: 6 }], ['密度', 'density', '小数', { w: 6 }], ['亮度', 'bright', '整数', { w: 7 }], ['什么时候', 'note', '文本', { w: 44 }]]),
      pack: d => Object.entries(d.MOODS).map(([id, m]) => ({ id, ...m, note: d.MOOD_DOC?.[id] })),
      unpack: (rows, out) => { out.MOODS = {}; out.MOOD_DOC = {}; for (const r of rows) { const { id, note, ...m } = strip(r); out.MOODS[id] = m; if (note != null) out.MOOD_DOC[id] = note; } },
    },
    {
      name: '音效', about: '全部音效（合成的配方在代码里，按 id 对上；id 别改）。「状态」「文件」给 Unity 版录音用：现场合成 → 已录制 → 已换成文件。',
      cols: C([ID, ['名字', 'name', '文本', { w: 12 }], ['在哪响', 'use', '文本', { w: 40 }], ['状态', 'status', '文本', { w: 10, list: ['现场合成', '已录制', '已换成文件'] }], ['文件', 'file', '文本', { w: 30 }]]), ...list('SFX'),
    },
  ],
};
// ───────── 美术.xlsx ─────────
const ART = {
  file: '美术.xlsx', out: 'art',
  about: ['美术资源清单：给 3D 模型和插画的制作管线（Tripo / Blender）跟进用，游戏不读这本表。', '「道具」「插画」里的尺寸、三角面、材质数、用到几处由 node tools/art/inventory.mjs 从代码里重新算；「状态」「源文件」「来源」「授权」「备注」手填，重新算的时候会保留。'],
  sheets: [
    {
      name: '道具', about: '3D 场景里的全部道具（src/scene3a/props.js）。尺寸单位是米（宽 × 深 × 高）；三角面是四种随机外观里最多的那种；面数预算和 tools/props-check.mjs 用的一样。',
      cols: C([ID, ['宽', 'w', '小数', { w: 6 }], ['深', 'd', '小数', { w: 6 }], ['高', 'h', '小数', { w: 6 }], ['三角面', 'tris', '整数', { w: 8 }], ['面数预算', 'budget', '整数', { w: 9 }], ['材质数', 'mats', '整数', { w: 7 }], ['有动画', 'anim', '是否', { w: 7 }],
        ['状态', 'status', '文本', { w: 10, list: ['程序生成', 'AI 生成中', 'AI 已出模', '人工精修', '已进引擎'] }], ['源文件', 'src', '文本', { w: 28 }], ['备注', 'note', '文本', { w: 30 }]]),
      ...list('PROPS'),
    },
    {
      name: '插画', about: '事件窗、结局页用的插画（src/assets/art）。「用到几处」= 表格和代码里引用它的次数，0 就是没用上。',
      cols: C([ID, ['文件', 'file', '文本', { w: 30 }], ['用到几处', 'uses', '整数', { w: 8 }], ['来源', 'source', '文本', { w: 16 }], ['授权', 'license', '文本', { w: 16 }], ['备注', 'note', '文本', { w: 30 }]]),
      ...list('ART'),
    },
    {
      name: '素材来源', about: '按资产记录生成、授权和质检依据。全文未提供的提示词留待补录。',
      cols: C([['资产 id','id','标识'], ['名称','name','文本'], ['来源','source','文本'], ['生成方式','method','文本',{w:38}],
        ['提示词','prompt','文本',{w:62}], ['积分','credits','整数'], ['日期','date','文本'], ['授权及依据','license','文本',{w:48}],
        ['文件位置','file','文本',{w:48}], ['质检结果（面数、尺寸）','qc','文本',{w:56}], ['状态','status','文本',{w:34}]]),
      ...list('SOURCES'),
    },
  ],
};

export const BOOKS = [DEFS, PARAMS, EVENTS, CHAINS, ACTS, TEXTS, ideoBook('cn', '深圳'), ideoBook('us', '湾区'), AUDIO, ART];

// 界面文字 → 文本.xlsx「界面」（路线之争页的两地说法 → 「路线之争」）；界面上的几个门槛 → 平衡参数.xlsx（ui. / crisis. 开头）。
// 生成：p-ui-text.json（给 rep.mjs 的替换）、ui-text.rows.json（文本行）、ui-params.rows.json（参数行）
// 每段文字里固定的部分都必须原样出现在被替换掉的那段旧代码里；文字里不能有 & < > " '（界面会先转义表里的字）。
//   node gen-ui-text.mjs <输出目录>
import { writeFileSync } from 'node:fs';
import path from 'node:path';
const out = process.argv[2];
const pairs = [], TX = new Map(), PR = [];
let sheet = '界面';
const seg = s => s.split(/\{[^{}]+\}|\n| /).filter(Boolean);            // 一行一项的列表每行分别核对；空格两边分别核对（「← 上一步」这种旧代码里是拼起来的）
// R(旧代码, 新代码, [键, 文字, 说明?, 湾区文字?]...)
function R(a, b, ...texts) {
  for (const [key, text, note, bay] of texts) {
    for (const v of [text, bay]) {
      if (v == null) continue;
      for (const s of seg(v)) if (!a.includes(s)) throw new Error(`${key}：「${s}」在旧代码里找不到\n${a.slice(0, 300)}`);
      if (/[&<>"']/.test(v)) throw new Error(`${key}：文字里有 HTML 特殊字符：${v}`);
      if (v !== v.trim() && !/^(ui\.sep)$/.test(key)) throw new Error(`${key}：首尾有空白`);
    }
    if (TX.has(key)) throw new Error('键重复：' + key);
    TX.set(key, { key, text, bay, note, sheet });
  }
  pairs.push([a, b]);
}
const P = (key, value, desc, unit, use = '界面') => PR.push({ key, value, ...(unit ? { unit } : {}), desc, use });
const list = arr => arr.join('\n');

// ── 工具和词库 ──
R("const nl = s => esc(s).replace(/\\n/g, '<br>');",
  "const nl = s => esc(s).replace(/\\n/g, '<br>');\n" +
  "// 界面上的字在 文本.xlsx「界面」里（意识形态页的两地说法在「路线之争」里）。\n" +
  "// ut = 纯文字（后面还会再转义的地方用）；uh = 直接拼进 HTML 的：表里的字先转义，{变量} 原样放进去（变量可能是代码拼好的 HTML）\n" +
  "const bayUI = () => (S ? S.co.region === 'bay' : V.W?.region === 'bay');\n" +
  "const pickText = (key, bay) => { const e = TEXT[key]; if (!e) throw new Error(`tables/文本.xlsx 里没有「${key}」`); return bay && e.bay != null ? e.bay : e.text; };\n" +
  "const ut = (key, vars) => text(key, vars, bayUI());\n" +
  "const uh = (key, vars, bay = bayUI()) => fill(esc(pickText(key, bay)), vars);\n" +
  "const ivh = (key, vars, us = IDEO.verOf(S) === 'us') => fill(esc(pickText(key, us)), vars);   // 路线之争：按版本挑说法\n" +
  "const lines = (key, bay) => pickText(key, bay).split('\\n').map(s => s.trim()).filter(Boolean);");
R("import { createAudio } from '../audio/audio.js';", "import { createAudio } from '../audio/audio.js';\nimport { text, fill, TEXT } from '../data/text.js';");
R("ACHIEVEMENTS, META_SHOP, CAT, MONTHS, MOD_NAME, KIND_NAME, floorsOf, DEPTS } from '../data/defs.js';", "ACHIEVEMENTS, META_SHOP, CAT, MONTHS, START_YEAR, MOD_NAME, KIND_NAME, floorsOf, DEPTS, IDEO_FLAG_MODS, P } from '../data/defs.js';");
sheet = '路线之争';
R("const chainInfo = id => (id === 'ideo' ? { title: '路线之争', icon: S && IDEO.verOf(S) === 'us' ? '🌹' : '☭' } : CHAIN_INFO[id]);",
  "const chainInfo = id => (id === 'ideo' ? { title: text('ideo.page.chain'), icon: text('ideo.page.chainIcon', null, !!S && IDEO.verOf(S) === 'us') } : CHAIN_INFO[id]);",
  ['ideo.page.chain', '路线之争', '事件链和意识形态页上「路线之争」这几个字'], ['ideo.page.chainIcon', '☭', '路线之争这条事件链的图标', '🌹']);
sheet = '界面';
R(`const RAND = {
  bay: { name: ['Kevin Wang', 'Alice Chen', 'Jason Lin', 'Mia Zhou', 'Leo Xu', 'Grace Liu'], co: ['Chaos Labs', '无限进步', 'Gradient', '奇点临近', 'Hallucinate', '第一性原理'] },
  sz: { name: ['王多鱼', '李想想', '陈不卷', '赵天选', '林有钱', '周加班'], co: ['混沌智能', '深度幻觉', '玄学科技', '梯度消失', '大力神科技', '搞钱智能'] },
  model: ['混沌', '悟空', '丹炉', '玄武', '夸父', 'Hallu', '太上', '盘古'],
};`,
  `// 建角向导里「🎲 随机」用的名字（一行一个）
const RAND = {
  bay: { name: lines('ui.rand.name', true), co: lines('ui.rand.co', true) },
  sz: { name: lines('ui.rand.name', false), co: lines('ui.rand.co', false) },
  model: lines('ui.rand.model'),
};`,
  ['ui.rand.name', list(['王多鱼', '李想想', '陈不卷', '赵天选', '林有钱', '周加班']), '建角向导：随机的创始人名字，一行一个（「湾区文本」是湾区的）', list(['Kevin Wang', 'Alice Chen', 'Jason Lin', 'Mia Zhou', 'Leo Xu', 'Grace Liu'])],
  ['ui.rand.co', list(['混沌智能', '深度幻觉', '玄学科技', '梯度消失', '大力神科技', '搞钱智能']), '建角向导：随机的公司名，一行一个', list(['Chaos Labs', '无限进步', 'Gradient', '奇点临近', 'Hallucinate', '第一性原理'])],
  ['ui.rand.model', list(['混沌', '悟空', '丹炉', '玄武', '夸父', 'Hallu', '太上', '盘古']), '建角向导：随机的模型系列名，一行一个']);

// ── 标题 ──
R('<h1>炼丹大亨</h1><p class="sub">AI 创业肉鸽模拟器 · 湾区 / 深圳 · 2023—2028</p>', "<h1>${uh('ui.title.name')}</h1><p class=\"sub\">${uh('ui.title.sub', { 起: START_YEAR, 止: START_YEAR + MONTHS / 12 - 1 })}</p>",
  ['ui.title.name', '炼丹大亨', '标题画面：游戏名'], ['ui.title.sub', 'AI 创业肉鸽模拟器 · 湾区 / 深圳 · {起}—{止}', '标题画面：副标题。{起} {止} = 开始和结束的年份（平衡参数 START_YEAR、MONTHS）']);
R('data-a="new">开始创业</button>', 'data-a="new">${uh(\'ui.title.new\')}</button>', ['ui.title.new', '开始创业']);
R('data-a="continue">继续上一局<small>', 'data-a="continue">${uh(\'ui.title.continue\')}<small>', ['ui.title.continue', '继续上一局']);
R('<button class="btn" data-a="meta">局外成长 · 图鉴<small>人脉点 ${meta.points}</small></button><button class="btn" data-a="settings">${icon(\'settings\', 18)}画质与声音</button>',
  '<button class="btn" data-a="meta">${uh(\'ui.title.meta\')}<small>${uh(\'ui.points\', { 点数: meta.points })}</small></button><button class="btn" data-a="settings">${icon(\'settings\', 18)}${uh(\'ui.title.settings\')}</button>',
  ['ui.title.meta', '局外成长 · 图鉴'], ['ui.points', '人脉点 {点数}', '标题画面和局外成长：现在有多少人脉点'], ['ui.title.settings', '画质与声音', '标题画面的按钮；顶栏齿轮按钮的提示']);
R('<p class="gpu-tip">检测到核显（${esc(office.quality().gpu)}），已自动降低画质。${GPU_TIP}</p>', '<p class="gpu-tip">${uh(\'ui.title.igpu\', { 显卡: esc(office.quality().gpu), 建议: GPU_TIP })}</p>',
  ['ui.title.igpu', '检测到核显（{显卡}），已自动降低画质。{建议}', '标题画面：浏览器在用核显。{建议} = ui.gpuTip']);
R('<p class="fine">本游戏所有人物、公司、事件纯属虚构恶搞；如有雷同，那是现实在抄袭游戏。<br>已创业 ${meta.runs} 次 · 最高分 ${meta.best}</p>', '<p class="fine">${uh(\'ui.title.fine\')}<br>${uh(\'ui.title.record\', { 次数: meta.runs, 最高分: meta.best })}</p>',
  ['ui.title.fine', '本游戏所有人物、公司、事件纯属虚构恶搞；如有雷同，那是现实在抄袭游戏。', '标题画面最下面的免责声明'], ['ui.title.record', '已创业 {次数} 次 · 最高分 {最高分}']);

// ── 建角向导 ──
R("const region = 'bay', attrs = Object.fromEntries(ATTRS.map(a => [a.id, 5]));", "const region = 'bay', attrs = Object.fromEntries(ATTRS.map(a => [a.id, P['start.attrBase']]));");
R("pts: 10 + (meta.own.m_point ? 1 : 0) + (meta.own.m_point2 ? 1 : 0),", "pts: P['start.attrPoints'] + (meta.own.m_point ? P['meta.attrPoint'] : 0) + (meta.own.m_point2 ? P['meta.attrPoint'] : 0),");
P('start.attrBase', 5, '建角时每项属性从几点起步', null, '建角'); P('start.attrMax', 10, '建角时单项属性最高加到几点', null, '建角'); P('start.attrPoints', 10, '建角时可以分配的属性点', null, '建角');
P('meta.attrPoint', 1, '局外成长「天赋异禀」「天赋异禀 II」：每个多给几个属性点（设定.xlsx「局外商店」的名字里写着数，要一起改）', null, '建角');
R('const ptsLeft = W => W.pts - ATTRS.reduce((a, x) => a + W.attrs[x.id] - 5, 0);', "const ptsLeft = W => W.pts - ATTRS.reduce((a, x) => a + W.attrs[x.id] - P['start.attrBase'], 0);");
R('return { cash: cash + (meta.own.m_cash ? 60 : 0), eq };', "return { cash: cash + (meta.own.m_cash ? P['meta.cash'] : 0), eq };");
R("const W = V.W, steps = ['你是谁', '属性', '出身', '公司', '品牌'], R = REGIONS[W.region];", "const W = V.W, steps = lines('ui.wiz.steps'), R = REGIONS[W.region];",
  ['ui.wiz.steps', list(['你是谁', '属性', '出身', '公司', '品牌']), '建角向导顶上的五步，一行一步（顺序别改）']);
R("<small>${lock ? `局外成长解锁（${x.cost} 人脉点）` : x.desc}</small>", "<small>${lock ? uh('ui.wiz.locked', { 点数: x.cost }) : x.desc}</small>", ['ui.wiz.locked', '局外成长解锁（{点数} 人脉点）', '向导里锁着的特质']);
R('body = `<h2>你叫什么？</h2><div class="form"><label>创始人<input data-f="name" maxlength="12" value="${esc(W.name)}"></label><button class="btn sm" data-a="w:rand">🎲 随机</button></div>',
  "body = `<h2>${uh('ui.wiz.name.h')}</h2><div class=\"form\"><label>${uh('ui.wiz.name.label')}<input data-f=\"name\" maxlength=\"12\" value=\"${esc(W.name)}\"></label><button class=\"btn sm\" data-a=\"w:rand\">${uh('ui.wiz.rand')}</button></div>",
  ['ui.wiz.name.h', '你叫什么？'], ['ui.wiz.name.label', '创始人'], ['ui.wiz.rand', '🎲 随机', '向导里随机起名的按钮']);
R('<h2>在哪儿创业？</h2><div class="cards2">', "<h2>${uh('ui.wiz.region.h')}</h2><div class=\"cards2\">", ['ui.wiz.region.h', '在哪儿创业？']);
R('<small>启动资金 ${r.cur}${r.cash} 万</small></button>`).join(\'\')}</div>', "<small>${uh('ui.wiz.region.cash', { 币: r.cur, 金额: r.cash })}</small></button>`).join('')}</div>", ['ui.wiz.region.cash', '启动资金 {币}{金额} 万']);
R('<h2>平时穿什么？</h2>', "<h2>${uh('ui.wiz.outfit.h')}</h2>", ['ui.wiz.outfit.h', '平时穿什么？']);
R("${grp('motto', '口头禅')}`;", "${grp('motto', uh('ui.wiz.motto.h'))}`;", ['ui.wiz.motto.h', '口头禅']);
R('body = `<h2>分配属性<small>还剩 <b class="pts">${left}</b> 点 · 所有属性从 5 起步，单项最高 10</small></h2>',
  "body = `<h2>${uh('ui.wiz.attr.h')}<small>${uh('ui.wiz.attr.left', { 点数: `<b class=\"pts\">${left}</b>`, 起步: P['start.attrBase'], 最高: P['start.attrMax'] })}</small></h2>",
  ['ui.wiz.attr.h', '分配属性'], ['ui.wiz.attr.left', '还剩 {点数} 点 · 所有属性从 {起步} 起步，单项最高 {最高}', '{起步} {最高} = 平衡参数 start.attrBase、start.attrMax']);
R('data-a="w:attr:${a.id}:-1" ${W.attrs[a.id] <= 5 ? \'disabled\' : \'\'}>', "data-a=\"w:attr:${a.id}:-1\" ${W.attrs[a.id] <= P['start.attrBase'] ? 'disabled' : ''}>");
R("${left <= 0 || W.attrs[a.id] >= 10 ? 'disabled' : ''}>＋</button></div><div class=\"pips\">${'<i class=\"on\"></i>'.repeat(W.attrs[a.id])}${'<i></i>'.repeat(10 - W.attrs[a.id])}</div>",
  "${left <= 0 || W.attrs[a.id] >= P['start.attrMax'] ? 'disabled' : ''}>＋</button></div><div class=\"pips\">${'<i class=\"on\"></i>'.repeat(W.attrs[a.id])}${'<i></i>'.repeat(P['start.attrMax'] - W.attrs[a.id])}</div>");
R("body = grp('edu', '学历') + grp('bg', '经历') + grp('quirk', '怪癖');", "body = grp('edu', uh('ui.wiz.edu.h')) + grp('bg', uh('ui.wiz.bg.h')) + grp('quirk', uh('ui.wiz.quirk.h'));", ['ui.wiz.edu.h', '学历'], ['ui.wiz.bg.h', '经历'], ['ui.wiz.quirk.h', '怪癖']);
R('body = `<h2>走哪条路？</h2>', "body = `<h2>${uh('ui.wiz.route.h')}</h2>", ['ui.wiz.route.h', '走哪条路？']);
R('<h2>做什么产品？</h2>', "<h2>${uh('ui.wiz.track.h')}</h2>", ['ui.wiz.track.h', '做什么产品？']);
R("${grp('cofounder', '和谁一起干？')}${grp('seed', '第一笔钱哪儿来？')}${grp('district', '在哪儿落脚？')}`;", "${grp('cofounder', uh('ui.wiz.cofounder.h'))}${grp('seed', uh('ui.wiz.seed.h'))}${grp('district', uh('ui.wiz.district.h'))}`;",
  ['ui.wiz.cofounder.h', '和谁一起干？'], ['ui.wiz.seed.h', '第一笔钱哪儿来？'], ['ui.wiz.district.h', '在哪儿落脚？']);
R('body = `<h2>给公司起名</h2><div class="form"><label>公司<input data-f="coName" maxlength="10" value="${esc(W.coName)}"></label><label>模型系列<input data-f="modelName" maxlength="8" value="${esc(W.modelName)}"></label><button class="btn sm" data-a="w:randco">🎲 随机</button></div>',
  "body = `<h2>${uh('ui.wiz.co.h')}</h2><div class=\"form\"><label>${uh('ui.wiz.co.label')}<input data-f=\"coName\" maxlength=\"10\" value=\"${esc(W.coName)}\"></label><label>${uh('ui.wiz.model.label')}<input data-f=\"modelName\" maxlength=\"8\" value=\"${esc(W.modelName)}\"></label><button class=\"btn sm\" data-a=\"w:randco\">${uh('ui.wiz.rand')}</button></div>",
  ['ui.wiz.co.h', '给公司起名'], ['ui.wiz.co.label', '公司'], ['ui.wiz.model.label', '模型系列']);
R("<h2>选一个 Logo<small>${W.region === 'sz' ? '国内互联网公司的传统：挑一只动物' : '湾区 AI 公司的传统：一个圆，稍微变个形（网友统称「菊花」）'}</small></h2>",
  "<h2>${uh('ui.wiz.logo.h')}<small>${uh('ui.wiz.logo.tip', null, W.region === 'bay')}</small></h2>",
  ['ui.wiz.logo.h', '选一个 Logo'], ['ui.wiz.logo.tip', '国内互联网公司的传统：挑一只动物', '按向导里选的地区挑说法', '湾区 AI 公司的传统：一个圆，稍微变个形（网友统称「菊花」）']);
R('<h2>品牌色</h2>', "<h2>${uh('ui.wiz.brand.h')}</h2>", ['ui.wiz.brand.h', '品牌色']);
R('aria-label="品牌色 ${c}"', "aria-label=\"${uh('ui.wiz.brand.aria', { 颜色: c })}\"", ['ui.wiz.brand.aria', '品牌色 {颜色}', '读屏用的说明']);
R("${grp('mission', '公司使命（写在官网首页的那句）', 'cards2')}", "${grp('mission', uh('ui.wiz.mission.h'), 'cards2')}", ['ui.wiz.mission.h', '公司使命（写在官网首页的那句）']);
R('<div class="nums"><small>启动资金</small><b>${R.cur}${Math.round(pv.cash)} 万</b><small>你的股权 ${pv.eq}%</small></div>',
  "<div class=\"nums\"><small>${uh('ui.wiz.card.cash')}</small><b>${uh('ui.wiz.card.cashValue', { 币: R.cur, 金额: Math.round(pv.cash) })}</b><small>${uh('ui.wiz.card.equity', { 股权: pv.eq })}</small></div>",
  ['ui.wiz.card.cash', '启动资金'], ['ui.wiz.card.cashValue', '{币}{金额} 万'], ['ui.wiz.card.equity', '你的股权 {股权}%']);
R('<b>新手教学</b>：学长老周带着你，一样一样开放系统（第一次玩建议开着；老手可以关掉，开局全部开放）</label>', "<b>${uh('ui.wiz.tutorial')}</b>${uh('ui.wiz.tutorial.desc')}</label>",
  ['ui.wiz.tutorial', '新手教学'], ['ui.wiz.tutorial.desc', '：学长老周带着你，一样一样开放系统（第一次玩建议开着；老手可以关掉，开局全部开放）']);
R("<div class=\"wfoot\"><button class=\"btn ghost\" data-a=\"${W.step ? 'w:step:-1' : 'back'}\">← ${W.step ? '上一步' : '返回'}</button>${W.step === 1 && ptsLeft(W) > 0 ? `<small>还有 ${ptsLeft(W)} 点没分配</small>` : ''}${W.step < 4 ? '<button class=\"btn big\" data-a=\"w:step:1\">下一步 →</button>' : '<button class=\"btn big go\" data-a=\"w:start\">开张！🚀</button>'}</div>",
  "<div class=\"wfoot\"><button class=\"btn ghost\" data-a=\"${W.step ? 'w:step:-1' : 'back'}\">${W.step ? uh('ui.wiz.prev') : uh('ui.back')}</button>${W.step === 1 && ptsLeft(W) > 0 ? `<small>${uh('ui.wiz.unspent', { 点数: ptsLeft(W) })}</small>` : ''}${W.step < 4 ? `<button class=\"btn big\" data-a=\"w:step:1\">${uh('ui.wiz.next')}</button>` : `<button class=\"btn big go\" data-a=\"w:start\">${uh('ui.wiz.start')}</button>`}</div>",
  ['ui.wiz.prev', '← 上一步'], ['ui.back', '← 返回', '向导和局外成长的返回按钮'], ['ui.wiz.unspent', '还有 {点数} 点没分配'], ['ui.wiz.next', '下一步 →'], ['ui.wiz.start', '开张！🚀']);
// ── 局外成长 ──
R('<span class="on">局外成长</span><b class="mp">人脉点 ${meta.points}</b>', "<span class=\"on\">${uh('ui.meta.h')}</span><b class=\"mp\">${uh('ui.points', { 点数: meta.points })}</b>", ['ui.meta.h', '局外成长']);
R('<h2>人脉商店<small>每局结算都会获得人脉点</small></h2>', "<h2>${uh('ui.meta.shop')}<small>${uh('ui.meta.shop.tip')}</small></h2>", ['ui.meta.shop', '人脉商店'], ['ui.meta.shop.tip', '每局结算都会获得人脉点']);
R("<small>${own ? '已拥有' : lock ? '需要先买前一级' : `${it.cost} 人脉点`}</small>", "<small>${own ? uh('ui.meta.owned') : lock ? uh('ui.meta.needPrev') : uh('ui.meta.cost', { 点数: it.cost })}</small>",
  ['ui.meta.owned', '已拥有'], ['ui.meta.needPrev', '需要先买前一级'], ['ui.meta.cost', '{点数} 人脉点', '商品的价格']);
R("<h2>结局图鉴<small>", "<h2>${uh('ui.meta.ends')}<small>", ['ui.meta.ends', '结局图鉴']);
R('title="达成 ${meta.ends[id]} 次">${e.icon} ${e.name}</span>` : \'<span>❓ ？？？</span>\'))',
  "title=\"${uh('ui.meta.endCount', { 次数: meta.ends[id] })}\">${e.icon} ${e.name}</span>` : `<span>${uh('ui.meta.unknown')}</span>`))",
  ['ui.meta.endCount', '达成 {次数} 次', '图鉴里已达成结局的提示'], ['ui.meta.unknown', '❓ ？？？', '图鉴里还没见过的结局']);
R("<h2>成就<small>${Object.keys(meta.ach).length}", "<h2>${uh('ui.meta.ach')}<small>${Object.keys(meta.ach).length}", ['ui.meta.ach', '成就']);
R('</div><div class="wfoot"><button class="btn ghost" data-a="back">← 返回</button></div></section>`;', "</div><div class=\"wfoot\"><button class=\"btn ghost\" data-a=\"back\">${uh('ui.back')}</button></div></section>`;");

// ── 顶栏 ──
R('<span class="logo" data-a="menu" title="菜单">', "<span class=\"logo\" data-a=\"menu\" title=\"${uh('ui.top.menu')}\">", ['ui.top.menu', '菜单', '点公司 Logo 打开菜单的提示']);
R('<small>${G.dateStr(Math.min(S.t, MONTHS))} · 第 ${Math.min(S.t, MONTHS)}/${MONTHS} 月 · ${REGIONS[S.co.region].name}${officeName(S)}</small>',
  "<small>${uh('ui.top.when', { 日期: G.dateStr(Math.min(S.t, MONTHS)), 月: Math.min(S.t, MONTHS), 总: MONTHS, 地区: REGIONS[S.co.region].name, 办公室: officeName(S) })}</small>",
  ['ui.top.when', '{日期} · 第 {月}/{总} 月 · {地区}{办公室}', '顶栏公司名下面那行']);
R("${chip(icon('cash', 20), '现金', G.money(S, S.cash), `${G.money(S, net, true)}/月 · ${rw >= 99 ? '盈利中' : `还能撑 ${rw < 1 ? '不到 1' : Math.floor(rw)} 个月`}`, net < 0 && rw < 4 ? 'bad' : net >= 0 ? 'good' : '')}",
  "${chip(icon('cash', 20), uh('ui.top.cash'), G.money(S, S.cash), uh('ui.top.net', { 净: G.money(S, net, true), 续航: rw >= 99 ? uh('ui.top.profit') : uh('ui.top.runway', { 月数: rw < 1 ? uh('ui.top.runway.lt1') : Math.floor(rw) }) }), net < 0 && rw < P['advice.cash.runway'] ? 'bad' : net >= 0 ? 'good' : '')}",
  ['ui.top.cash', '现金'], ['ui.top.net', '{净}/月 · {续航}'], ['ui.top.profit', '盈利中'], ['ui.top.runway', '还能撑 {月数} 个月'], ['ui.top.runway.lt1', '不到 1']);
R("${chipOpen(S, 'val') ? chip(icon('valuation', 20), '估值', G.money(S, G.valuation(S)), `业绩系数 ${G.perf(S).toFixed(2)}`) : ''}", "${chipOpen(S, 'val') ? chip(icon('valuation', 20), uh('ui.top.val'), G.money(S, G.valuation(S)), uh('ui.top.perf', { 业绩: G.perf(S).toFixed(2) })) : ''}",
  ['ui.top.val', '估值'], ['ui.top.perf', '业绩系数 {业绩}']);
R("${!chipOpen(S, 'users') ? '' : chip(icon('users', 20), '用户', G.fmtUsers(S.users + S.fake), S.fake > 0.5 ? `其中 ${G.fmtUsers(S.fake)} 是刷的` : `占市场 ${(S.users / G.market(S) * 100).toFixed(1)}%`)}",
  "${!chipOpen(S, 'users') ? '' : chip(icon('users', 20), uh('ui.top.users'), G.fmtUsers(S.users + S.fake), S.fake > 0.5 ? uh('ui.top.fake', { 假用户: G.fmtUsers(S.fake) }) : uh('ui.top.share', { 份额: (S.users / G.market(S) * 100).toFixed(1) }))}",
  ['ui.top.users', '用户'], ['ui.top.fake', '其中 {假用户} 是刷的'], ['ui.top.share', '占市场 {份额}%']);
R("${!chipOpen(S, 'rank') ? '' : S.model ? chip(icon('trophy', 20), '榜单', `第 ${G.rank(S)} 名`, `${esc(S.model.name)} · ${S.model.bench.toFixed(1)} 分`) : chip(icon('flask', 20), '模型', '套壳中', `${esc(G.rivalOf(S, S.upstream).name)} 的 API`)}",
  "${!chipOpen(S, 'rank') ? '' : S.model ? chip(icon('trophy', 20), uh('ui.top.rank'), uh('ui.top.rankN', { 名次: G.rank(S) }), uh('ui.top.bench', { 模型: esc(S.model.name), 跑分: S.model.bench.toFixed(1) })) : chip(icon('flask', 20), uh('ui.top.model'), uh('ui.top.wrapper'), uh('ui.top.api', { 上游: esc(G.rivalOf(S, S.upstream).name) }))}",
  ['ui.top.rank', '榜单'], ['ui.top.rankN', '第 {名次} 名'], ['ui.top.bench', '{模型} · {跑分} 分'], ['ui.top.model', '模型'], ['ui.top.wrapper', '套壳中', '没有自研模型时顶栏的「模型」'], ['ui.top.api', '{上游} 的 API']);
R("${!chipOpen(S, 'equity') ? '' : chip(icon('pie', 20), '股权', S.equity.toFixed(0) + '%', S.equity < 45 ? '小心董事会' : '你说了算', S.equity < 30 ? 'bad' : '')}</div>",
  "${!chipOpen(S, 'equity') ? '' : chip(icon('pie', 20), uh('ui.top.equity'), S.equity.toFixed(0) + '%', S.equity < P['coup.equity'] ? uh('ui.top.equity.warn') : uh('ui.top.equity.ok'), S.equity < P['ui.equityBad'] ? 'bad' : '')}</div>",
  ['ui.top.equity', '股权'], ['ui.top.equity.warn', '小心董事会', '股权低于逼宫线（平衡参数 coup.equity）'], ['ui.top.equity.ok', '你说了算']);
P('ui.equityBad', 30, '顶栏的股权低于这个数时标红', '%');
R('<div class="ap" title="行动点">', "<div class=\"ap\" title=\"${uh('ui.top.ap')}\">", ['ui.top.ap', '行动点', '顶栏那排圆点的提示']);
R('<button class="btn icon" data-a="settings" title="画质与声音">${icon(\'settings\', 18)}</button><button class="btn big next" data-a="next">下个月 ${icon(\'next\', 18)}</button>',
  "<button class=\"btn icon\" data-a=\"settings\" title=\"${uh('ui.title.settings')}\">${icon('settings', 18)}</button><button class=\"btn big next\" data-a=\"next\">${uh('ui.top.next')} ${icon('next', 18)}</button>",
  ['ui.top.next', '下个月', '顶栏的「下个月」按钮']);
// ── 左边：行动、候选人、经营 ──
R("${rec ? '<i class=\"rtag\">建议</i>' : ''}", "${rec ? `<i class=\"rtag\">${uh('ui.act.rec')}</i>` : ''}", ['ui.act.rec', '建议', '行动按钮上「参谋建议现在做」的小标签']);
sheet = '路线之争';
R("title=\"点一下，看看这个人能带来什么\">${avatarSVG(e.uid, e.role, 36)}<span class=\"bd\"><b>${esc(e.name)}</b> <small>${ROLES[e.role].name}${e.quirk ? ` · <i class=\"q\">${STAFF_QUIRKS[e.quirk].name}</i>` : ''}${e.red && S?.ideo ? (IDEO.verOf(S) === 'us' ? ' · <i class=\"q red\" title=\"签名档里挂着玫瑰\">🌹 读书会</i>' : ' · <i class=\"q red\" title=\"共产倾向：读书会成员\">☭ 读书会</i>') : ''}</small><br>${skillDots(e.skill)} <small>月薪 ${G.money(S, e.salary * G.mod(S, 'salaryMult'))}</small></span>",
  "title=\"${uh('ui.person.tip')}\">${avatarSVG(e.uid, e.role, 36)}<span class=\"bd\"><b>${esc(e.name)}</b> <small>${ROLES[e.role].name}${e.quirk ? ` · <i class=\"q\">${STAFF_QUIRKS[e.quirk].name}</i>` : ''}${e.red && S?.ideo ? ` · <i class=\"q red\" title=\"${ivh('ideo.page.redTip')}\">${ivh('ideo.page.redTag')}</i>` : ''}</small><br>${skillDots(e.skill)} <small>${uh('ui.person.pay', { 月薪: G.money(S, e.salary * G.mod(S, 'salaryMult')) })}</small></span>",
  ['ideo.page.redTip', '共产倾向：读书会成员', '团队页：左倾员工名字后面那个小标签的提示', '签名档里挂着玫瑰'], ['ideo.page.redTag', '☭ 读书会', '团队页：左倾员工的小标签', '🌹 读书会']);
sheet = '界面';
TX.set('ui.person.tip', { key: 'ui.person.tip', text: '点一下，看看这个人能带来什么', note: '员工、候选人那一行的提示', sheet });
TX.set('ui.person.pay', { key: 'ui.person.pay', text: '月薪 {月薪}', sheet });
R('return `<h4>候选人<small>团队 ${S.staff.length}/${cap} · 每招一人花 1 行动点 + 一个月工资</small></h4>`', "return `<h4>${uh('ui.cand.h')}<small>${uh('ui.cand.tip', { 人数: S.staff.length, 上限: cap })}</small></h4>`",
  ['ui.cand.h', '候选人'], ['ui.cand.tip', '团队 {人数}/{上限} · 每招一人花 1 行动点 + 一个月工资']);
R("const why = S.ap < 1 ? '行动点不够' : S.staff.length >= cap ? '工位满了' : S.cash < c.salary * G.mod(S, 'salaryMult') ? '钱不够' : '';", "const why = S.ap < 1 ? uh('ui.cand.noAp') : S.staff.length >= cap ? uh('ui.cand.full') : S.cash < c.salary * G.mod(S, 'salaryMult') ? uh('ui.cand.noCash') : '';",
  ['ui.cand.noAp', '行动点不够', '「招」按钮点不了的原因'], ['ui.cand.full', '工位满了'], ['ui.cand.noCash', '钱不够']);
R("${why ? `disabled title=\"${why}\"` : ''}>招</button>`);", "${why ? `disabled title=\"${why}\"` : ''}>${uh('ui.cand.hire')}</button>`);", ['ui.cand.hire', '招', '候选人后面的按钮']);
R("}).join('') : '<p class=\"empty\">这个月没有合适的人。下个月再看，或者找猎头。</p>');", "}).join('') : `<p class=\"empty\">${uh('ui.cand.none')}</p>`);", ['ui.cand.none', '这个月没有合适的人。下个月再看，或者找猎头。']);
R("const note = over ? `<br><b class=\"over\">超出配额 ${over} 张</b>：从黄牛和云厂商那里现租，均价是市价的 ${G.overMult(S).toFixed(1)} 倍，租得越多越贵。`",
  "const note = over ? `<br><b class=\"over\">${uh('ui.gpu.over', { 张数: over })}</b>${uh('ui.gpu.over.text', { 倍数: G.overMult(S).toFixed(1) })}`",
  ['ui.gpu.over', '超出配额 {张数} 张'], ['ui.gpu.over.text', '：从黄牛和云厂商那里现租，均价是市价的 {倍数} 倍，租得越多越贵。']);
R(": S.gpu >= q ? '<br>配额用满了。再点「＋」可以按现货价多租（市价 2 倍起）。配额会跟着采购慢慢涨：一直租满，供应商每月多给一点，超租的部分有三成多会转成长约；找皮衣教主能立刻涨一截。' : '';",
  ": S.gpu >= q ? `<br>${uh('ui.gpu.full', { 倍数: P['gpu.over0'] })}` : '';",
  ['ui.gpu.full', '配额用满了。再点「＋」可以按现货价多租（市价 {倍数} 倍起）。配额会跟着采购慢慢涨：一直租满，供应商每月多给一点，超租的部分有三成多会转成长约；找皮衣教主能立刻涨一截。', '{倍数} = 平衡参数 gpu.over0；「三成多」对应 gpu.earnOver']);
R('h += `<h4 style="border:0;margin-top:0;padding-top:0">显卡<small>${G.money(S, price)}/张·月 · 配额 ${q} 张</small></h4>', "h += `<h4 style=\"border:0;margin-top:0;padding-top:0\">${uh('ui.gpu.h')}<small>${uh('ui.gpu.price', { 单价: G.money(S, price), 配额: q })}</small></h4>",
  ['ui.gpu.h', '显卡'], ['ui.gpu.price', '{单价}/张·月 · 配额 {配额} 张']);
R('<b>${S.gpu} 张</b><button class="btn sm" data-a="gpu:+">＋</button><button class="btn sm" data-a="gpu:max" title="按市价把配额租满">配额拉满</button>',
  "<b>${uh('ui.gpu.count', { 张数: S.gpu })}</b><button class=\"btn sm\" data-a=\"gpu:+\">＋</button><button class=\"btn sm\" data-a=\"gpu:max\" title=\"${uh('ui.gpu.max.tip')}\">${uh('ui.gpu.max')}</button>",
  ['ui.gpu.count', '{张数} 张'], ['ui.gpu.max.tip', '按市价把配额租满'], ['ui.gpu.max', '配额拉满']);
R("<small><b style=\"color:var(--sky)\">■</b> 推理 ${Math.min(need, S.gpu)}/${need} 张${need > S.gpu ? ' <b class=\"bad\">不够！用户在看「服务器繁忙」</b>' : ''} · <b style=\"color:var(--coral)\">■</b> 炼丹 ${Math.max(0, S.gpu - need)} 张<br>月租 ${G.money(S, G.gpuRent(S))}。推理优先，剩下的显卡才进丹炉。${note}${brain ? `<br>🧠 员工脑力另外折合 <b>${brain} 张卡</b>：不花钱，先供推理、再进丹炉。` : ''}</small></div>`;",
  "<small><b style=\"color:var(--sky)\">■</b> ${uh('ui.gpu.infer', { 用了: Math.min(need, S.gpu), 需要: need })}${need > S.gpu ? ` <b class=\"bad\">${uh('ui.gpu.short')}</b>` : ''} · <b style=\"color:var(--coral)\">■</b> ${uh('ui.gpu.train', { 张数: Math.max(0, S.gpu - need) })}<br>${uh('ui.gpu.rent', { 月租: G.money(S, G.gpuRent(S)) })}${note}${brain ? `<br>${uh('ui.gpu.brain', { 卡: `<b>${uh('ui.gpu.brain.n', { 张数: brain })}</b>` })}` : ''}</small></div>`;",
  ['ui.gpu.infer', '推理 {用了}/{需要} 张'], ['ui.gpu.short', '不够！用户在看「服务器繁忙」'], ['ui.gpu.train', '炼丹 {张数} 张'], ['ui.gpu.rent', '月租 {月租}。推理优先，剩下的显卡才进丹炉。'],
  ['ui.gpu.brain', '🧠 员工脑力另外折合 {卡}：不花钱，先供推理、再进丹炉。', '脑机实验成功以后'], ['ui.gpu.brain.n', '{张数} 张卡']);
R("h += `<p class=\"note\">产品跑在 <b>${esc(G.rivalOf(S, S.upstream).name)}</b> 的 API 上（模型能力 ${G.upCap(S).toFixed(0)}），本月 API 账单约 ${G.money(S, G.costs(S).api)}。想摆脱上游，去「研发」里立项自研。</p>`;",
  "h += `<p class=\"note\">${uh('ui.ops.wrapper', { 上游: `<b>${esc(G.rivalOf(S, S.upstream).name)}</b>`, 能力: G.upCap(S).toFixed(0), 账单: G.money(S, G.costs(S).api) })}</p>`;",
  ['ui.ops.wrapper', '产品跑在 {上游} 的 API 上（模型能力 {能力}），本月 API 账单约 {账单}。想摆脱上游，去「研发」里立项自研。', '「经营」页：没有自研模型时']);
R("  return h + '<h4>行动</h4>';\n}\nfunction leftPanel() {", "  return h + `<h4>${uh('ui.acts.h')}</h4>`;\n}\nfunction leftPanel() {", ['ui.acts.h', '行动', '左边面板里「行动」这个小标题']);
R("(V.ltab === 'ideo' ? '' : '<p class=\"empty\">这里暂时没有可做的事。</p>');", "(V.ltab === 'ideo' ? '' : `<p class=\"empty\">${uh('ui.acts.none')}</p>`);", ['ui.acts.none', '这里暂时没有可做的事。']);
R("V.ltab === 'ideo' ? ideoPanel() + (acts ? '<h4>行动</h4>' + acts : '')", "V.ltab === 'ideo' ? ideoPanel() + (acts ? `<h4>${uh('ui.acts.h')}</h4>` + acts : '')");

// ── 意识形态页 ──
sheet = '路线之争';
R("return `<div class=\"ibars${us ? ' us' : ''}\">${row('red', us ? '🌹' : '☭', N.red, I.red)}${row('cap', '$', N.cap, I.cap)}${us ? row('heat', '🦅', '反共压力', I.heat || 0) : ''}</div>`;",
  "return `<div class=\"ibars${us ? ' us' : ''}\">${row('red', ivh('ideo.page.redIcon', null, us), N.red, I.red)}${row('cap', ivh('ideo.page.capIcon', null, us), N.cap, I.cap)}${us ? row('heat', ivh('ideo.page.heatIcon', null, us), uh('chip.heat'), I.heat || 0) : ''}</div>`;",
  ['ideo.page.redIcon', '☭', '进度条前面的图标：左边那条', '🌹'], ['ideo.page.capIcon', '$', '资本那条'], ['ideo.page.heatIcon', '🦅', '反共压力那条（名字用「引擎」表的 chip.heat）']);
R("const leanShort = () => { const { v } = IDEO.ideoLean(S), N = IDEO.sideName(S); return v > 0.18 ? `参谋看你偏「${N.red}」` : v < -0.18 ? `参谋看你偏「${N.cap}」` : '参谋看你在摇摆'; };",
  "const leanShort = () => { const { v } = IDEO.ideoLean(S), N = IDEO.sideName(S), k = P['ideo.lean.pref']; return v > k ? IDEO.vt(S, 'ideo.page.lean', { 立场: N.red }) : v < -k ? IDEO.vt(S, 'ideo.page.lean', { 立场: N.cap }) : IDEO.vt(S, 'ideo.page.lean.mixed'); };",
  ['ideo.page.lean', '参谋看你偏「{立场}」', '事件窗进度条下面那行：参谋看出倾向了'], ['ideo.page.lean.mixed', '参谋看你在摇摆']);
R(`const RESULT_TXT = {
  cn: { red: ['☭', '红色路线', '再也拿不到西方融资；招牌换成了红色。'], cap: ['🧯', '警惕不现实的乌托邦主义', '公司目标转向稳健经营。'], fail: ['🗳️', '你说了不算', '终局时股权不到四成，方向由董事会代为决定。'] },
  us: { red: ['🌹', '共享繁荣', '公司坚称这不是社会主义。主流 VC 不再接电话，反共压力挥之不去；Logo 换成了玫瑰色，公关说这叫「品牌焕新」。'], cap: ['🧭', '我们是一家公司', '使命驱动，工作时间不谈政治。'], fail: ['🗳️', '董事会接管', '终局时股权不到四成，方向由董事会代为决定。'] },
};`, '// 结局：图标、名字、一句话（文本.xlsx「路线之争」的 ideo.page.result.*）\nconst RESULT_OF = r => (r ? [\'icon\', \'title\', \'desc\'].map(k => ivh(`ideo.page.result.${r}.${k}`)) : [\'\', \'\', \'\']);',
  ['ideo.page.result.red.icon', '☭', '意识形态页：左翼结局的图标', '🌹'], ['ideo.page.result.red.title', '红色路线', '左翼结局的名字', '共享繁荣'],
  ['ideo.page.result.red.desc', '再也拿不到西方融资；招牌换成了红色。', '左翼结局的一句话', '公司坚称这不是社会主义。主流 VC 不再接电话，反共压力挥之不去；Logo 换成了玫瑰色，公关说这叫「品牌焕新」。'],
  ['ideo.page.result.cap.icon', '🧯', '保守结局的图标', '🧭'], ['ideo.page.result.cap.title', '警惕不现实的乌托邦主义', '保守结局的名字', '我们是一家公司'], ['ideo.page.result.cap.desc', '公司目标转向稳健经营。', '保守结局的一句话', '使命驱动，工作时间不谈政治。'],
  ['ideo.page.result.fail.icon', '🗳️', '没走成的图标'], ['ideo.page.result.fail.title', '你说了不算', '没走成的名字', '董事会接管'], ['ideo.page.result.fail.desc', '终局时股权不到四成，方向由董事会代为决定。', '没走成的一句话（「四成」对应 ideo.equity）']);
R(`const IDEO_TXT = {
  cn: { empty: '公司还没有自己的「主义」。等公司做大一点、早期投资人想退出的时候，听说深创头的国资基金很乐意接盘……', rule: '终局：共产条满或比资本条多 → 红色路线；资本条满或更多 → 警惕不现实的乌托邦主义。', reds: n => \`读书会成员 \${n} 人（团队页里标着 ☭）。\`, utopia: ['🌾 示范公社：增长 +8%，口碑和士气每月上涨', '🌾 乌托邦社区实验进行中'], cell: '📚 地下读书会还在', mark: '☭ 读书会成员' },
  us: { empty: '这家公司只信仰一样东西：下一轮融资。不过听说湾区几家工会养老金凑了个「公地资本」，专门接盘 AI 公司早期投资人的老股……', rule: '终局：社会主义条满或比资本主义条多 → 共享繁荣（公司照样不承认）；资本主义条满或更多 → 我们是一家公司。反共压力过半时，社会主义条每月会被磨掉一点。', reds: n => \`签名档里挂着 🌹 的员工 \${n} 人（团队页里标着 🌹）。\`, utopia: ['🏘️ 合作社住房：增长 +8%，口碑和士气每月上涨', '🏘️ 合作社住房实验进行中'], cell: '☕ 咖啡馆读书会还在', mark: '🌹 签名档里挂玫瑰的' },
};`, '',
  ['ideo.page.empty', '公司还没有自己的「主义」。等公司做大一点、早期投资人想退出的时候，听说深创头的国资基金很乐意接盘……', '意识形态页：路线之争还没开始', '这家公司只信仰一样东西：下一轮融资。不过听说湾区几家工会养老金凑了个「公地资本」，专门接盘 AI 公司早期投资人的老股……'],
  ['ideo.page.rule', '终局：共产条满或比资本条多 → 红色路线；资本条满或更多 → 警惕不现实的乌托邦主义。', '意识形态页：终局规则', '终局：社会主义条满或比资本主义条多 → 共享繁荣（公司照样不承认）；资本主义条满或更多 → 我们是一家公司。反共压力过半时，社会主义条每月会被磨掉一点。'],
  ['ideo.page.reds', '读书会成员 {人数} 人（团队页里标着 ☭）。', '意识形态页：左倾员工有几个', '签名档里挂着 🌹 的员工 {人数} 人（团队页里标着 🌹）。'],
  ['ideo.page.utopia.ok', '🌾 示范公社：增长 +{增长}%，口碑和士气每月上涨', '公社 / 合作社实验成功以后。{增长} = 设定.xlsx「标记修正」里 utopia_ok 的增长加成', '🏘️ 合作社住房：增长 +{增长}%，口碑和士气每月上涨'],
  ['ideo.page.utopia.on', '🌾 乌托邦社区实验进行中', '实验进行中', '🏘️ 合作社住房实验进行中'],
  ['ideo.page.cell', '📚 地下读书会还在', '处置左倾员工时选了「睁一只眼闭一只眼」', '☕ 咖啡馆读书会还在'],
  ['ideo.page.mark', '☭ 读书会成员 {人数} 人', '左翼结局以后：左倾员工有几个', '🌹 签名档里挂玫瑰的 {人数} 人']);
R("const heatLine = () => { const I = S.ideo; if (I?.v !== 'us' || !I.heat) return ''; const r = Math.round((1 - IDEO.heatDrag(S, 'raiseMult')) * 100), b = Math.round((1 - IDEO.heatDrag(S, 'b2bMult')) * 100); return `反共压力 <b class=\"${I.heat >= 50 ? 'bad' : 'warn'}\">${Math.round(I.heat)}</b>：融资估值 -${r}%、企业订单 -${b}%。`; };",
  "const heatLine = () => { const I = S.ideo; if (!IDEO.hasHeat(I?.v) || !I.heat) return ''; const r = Math.round((1 - IDEO.heatDrag(S, 'raiseMult')) * 100), b = Math.round((1 - IDEO.heatDrag(S, 'b2bMult')) * 100); return ivh('ideo.page.heatLine', { 压力: `<b class=\"${I.heat >= P['ideo.heat.half'] ? 'bad' : 'warn'}\">${Math.round(I.heat)}</b>`, 估值: r, 订单: b }); };",
  ['ideo.page.heatLine', '反共压力 {压力}：融资估值 -{估值}%、企业订单 -{订单}%。', '意识形态页：反共压力的拖累']);
R("const I = S.ideo, v = IDEO.verOf(S), T = IDEO_TXT[v], g = IDEO.goalOf(S), C = IDEO.castOf(S), reds = S.staff.filter(e => e.red).length;\n  let h = `<div class=\"goal ${I?.result || ''} ${v}\"><small>公司目标</small>",
  "const I = S.ideo, v = IDEO.verOf(S), g = IDEO.goalOf(S), C = IDEO.castOf(S), reds = S.staff.filter(e => e.red).length;\n  let h = `<div class=\"goal ${I?.result || ''} ${v}\"><small>${ivh('ideo.page.goal')}</small>",
  ['ideo.page.goal', '公司目标', '意识形态页最上面那块']);
R("if (!I) return h + `<p class=\"empty\">${T.empty}</p>`;", "if (!I) return h + `<p class=\"empty\">${ivh('ideo.page.empty')}</p>`;");
R("h += `<h4>路线之争<small>第 ${Math.min(IDEO.IDEO_LEN, I.n + 1)}/${IDEO.IDEO_LEN} 级 · 每月一级</small></h4>${ibars(I)}", "h += `<h4>${ivh('ideo.page.chain')}<small>${ivh('ideo.page.stage', { 级: Math.min(IDEO.IDEO_LEN, I.n + 1), 总: IDEO.IDEO_LEN })}</small></h4>${ibars(I)}",
  ['ideo.page.stage', '第 {级}/{总} 级 · 每月一级']);
R("<p class=\"note\">${T.rule}<br>你的股权 <b class=\"${S.equity < 40 ? 'bad' : S.equity < 45 ? 'warn' : 'good'}\">${S.equity.toFixed(0)}%</b>，终局时须 ≥ ${IDEO.IDEO_EQUITY}%，否则你说了不算。${heatLine() ? `<br>${heatLine()}` : ''}${reds ? `<br>${T.reds(reds)}` : ''}</p>",
  "<p class=\"note\">${ivh('ideo.page.rule')}<br>${ivh('ideo.page.equity', { 股权: `<b class=\"${S.equity < IDEO.IDEO_EQUITY ? 'bad' : S.equity < P['ideo.equityWarn'] ? 'warn' : 'good'}\">${S.equity.toFixed(0)}%</b>`, 底线: IDEO.IDEO_EQUITY })}${heatLine() ? `<br>${heatLine()}` : ''}${reds ? `<br>${ivh('ideo.page.reds', { 人数: reds })}` : ''}</p>",
  ['ideo.page.equity', '你的股权 {股权}，终局时须 ≥ {底线}%，否则你说了不算。', '{底线} = 平衡参数 ideo.equity']);
R("<h4>人物</h4><div class=\"cast\">", "<h4>${ivh('ideo.page.cast')}</h4><div class=\"cast\">", ['ideo.page.cast', '人物']);
R("if (I.picks.length) h += `<h4>你的表态</h4><ul class=\"ipicks\">${I.picks.slice(-6).reverse().map(p => `<li class=\"${p.side}\"><small>第 ${p.n} 级</small>${esc(p.label)}</li>`).join('')}</ul>`;",
  "if (I.picks.length) h += `<h4>${ivh('ideo.page.picks')}</h4><ul class=\"ipicks\">${I.picks.slice(-6).reverse().map(p => `<li class=\"${p.side}\"><small>${ivh('ideo.page.pickN', { 级: p.n })}</small>${esc(p.label)}</li>`).join('')}</ul>`;",
  ['ideo.page.picks', '你的表态'], ['ideo.page.pickN', '第 {级} 级']);
R("const R = RESULT_TXT[v][I.result] || ['', '', ''], st = [];", 'const R = RESULT_OF(I.result), st = [];');
R("if (S.flags.bci_ok) st.push(S.ownModel ? `🧠 员工脑力折合 ${G.brainGpu(S)} 张卡` : '🧠 员工大脑帮着跑推理：API 成本 -35%');\n  else if (S.flags.bci_on && !S.flags.bci_shut) st.push('🧠 秘密实验部运转中');\n  if (S.flags.utopia_ok) st.push(T.utopia[0]);\n  else if (S.flags.utopia_on && !S.flags.utopia_fail) st.push(T.utopia[1]);\n  if (S.flags.red_cell || S.flags.rose_cell) st.push(T.cell);\n  if (reds && I.result === 'red') st.push(`${T.mark} ${reds} 人`);",
  "if (S.flags.bci_ok) st.push(S.ownModel ? IDEO.vt(S, 'ideo.page.bci.model', { 张数: G.brainGpu(S) }) : IDEO.vt(S, 'ideo.page.bci.app', { 降幅: Math.round((1 - P['bci.apiMult']) * 100) }));\n  else if (S.flags.bci_on && !S.flags.bci_shut) st.push(IDEO.vt(S, 'ideo.page.bci.on'));\n  if (S.flags.utopia_ok) st.push(IDEO.vt(S, 'ideo.page.utopia.ok', { 增长: Math.round((IDEO_FLAG_MODS.utopia_ok.growthMult - 1) * 100) }));\n  else if (S.flags.utopia_on && !S.flags.utopia_fail) st.push(IDEO.vt(S, 'ideo.page.utopia.on'));\n  if (S.flags.red_cell || S.flags.rose_cell) st.push(IDEO.vt(S, 'ideo.page.cell'));\n  if (reds && I.result === 'red') st.push(IDEO.vt(S, 'ideo.page.mark', { 人数: reds }));",
  ['ideo.page.bci.model', '🧠 员工脑力折合 {张数} 张卡', '脑机实验成功以后（自研模型的公司）'], ['ideo.page.bci.app', '🧠 员工大脑帮着跑推理：API 成本 -{降幅}%', '同上（套壳的公司）。{降幅} 来自平衡参数 bci.apiMult'], ['ideo.page.bci.on', '🧠 秘密实验部运转中', '脑机实验进行中']);
R("const line = n ? `第 ${n}/${IDEO.IDEO_LEN} 级 · 股权 ${S.equity.toFixed(0)}%（终局须 ≥ ${IDEO.IDEO_EQUITY}%）${n >= 3 && !V.res ? ' · ' + leanShort() : ''}` : '';",
  "const vars = { 级: n, 总: IDEO.IDEO_LEN, 股权: S.equity.toFixed(0), 底线: IDEO.IDEO_EQUITY };\n  const line = n ? (n >= P['ideo.lean.from'] && !V.res ? IDEO.vt(S, 'ideo.page.strip.lean', { ...vars, 倾向: leanShort() }) : IDEO.vt(S, 'ideo.page.strip', vars)) : '';",
  ['ideo.page.strip', '第 {级}/{总} 级 · 股权 {股权}%（终局须 ≥ {底线}%）', '事件窗里进度条下面那行'], ['ideo.page.strip.lean', '第 {级}/{总} 级 · 股权 {股权}%（终局须 ≥ {底线}%） · {倾向}', '同上，从按倾向给牌的那一级起（ideo.lean.from）多一句参谋的判断']);
R("${us ? '<small>＊本公司不是社会主义组织</small>' : ''}</div>`;", "${us ? `<small>${ivh('ideo.page.emblem', null, true)}</small>` : ''}</div>`;", ['ideo.page.emblem', '＊本公司不是社会主义组织', '湾区共享繁荣以后，顶上玫瑰徽章下面那行小字']);
sheet = '界面';
R("const RTABS = [['board', 'board', '榜单'], ['chain', 'pin', '项目'], ['team', 'team', '团队'], ['safe', 'safe', '黑料'], ['perks', 'cards', '卡牌'], ['fin', 'ledger', '账本'], ['log', 'news', '日志']].map(([id, ic, n]) => [id, icon(ic, 18), n]);",
  "const RTABS = [['board', 'board'], ['chain', 'pin'], ['team', 'team'], ['safe', 'safe'], ['perks', 'cards'], ['fin', 'ledger'], ['log', 'news']].map(([id, ic]) => [id, icon(ic, 18), text('ui.rtab.' + id)]);",
  ['ui.rtab.board', '榜单', '右边面板的页签'], ['ui.rtab.chain', '项目'], ['ui.rtab.team', '团队'], ['ui.rtab.safe', '黑料'], ['ui.rtab.perks', '卡牌'], ['ui.rtab.fin', '账本'], ['ui.rtab.log', '日志']);
R("const eta = left <= 0 ? '月底验收' : p.kind === 'ap' ? '只能靠你亲自推' : rate > 0.01 ? `约 ${Math.ceil(left / rate)} 个月` : '停滞：没有人手或显卡';",
  "const eta = left <= 0 ? uh('ui.proj.check') : p.kind === 'ap' ? uh('ui.proj.apOnly') : rate > 0.01 ? uh('ui.proj.eta', { 月数: Math.ceil(left / rate) }) : uh('ui.proj.stalled');",
  ['ui.proj.check', '月底验收', '「项目」页：特殊项目做完了'], ['ui.proj.apOnly', '只能靠你亲自推'], ['ui.proj.eta', '约 {月数} 个月'], ['ui.proj.stalled', '停滞：没有人手或显卡']);
R("<small>${KIND_NAME[p.kind]} · ${eta} · 期限 ${G.dateStr(p.due)}${p.due - S.t <= 2 && left > 0 ? ' <b class=\"bad\">快超期了</b>' : ''}</small><button class=\"btn sm\" data-a=\"push:${p.uid}\" ${S.ap < 1 || left <= 0 ? 'disabled' : ''}>亲自攻关 ●</button></div>`;",
  "<small>${uh('ui.proj.line', { 类型: KIND_NAME[p.kind], 进度: eta, 日期: G.dateStr(p.due) })}${p.due - S.t <= P['advice.proj.urgent'] && left > 0 ? ` <b class=\"bad\">${uh('ui.proj.late')}</b>` : ''}</small><button class=\"btn sm\" data-a=\"push:${p.uid}\" ${S.ap < 1 || left <= 0 ? 'disabled' : ''}>${uh('ui.proj.push')}</button></div>`;",
  ['ui.proj.line', '{类型} · {进度} · 期限 {日期}'], ['ui.proj.late', '快超期了', '离到期不到 advice.proj.urgent 个月'], ['ui.proj.push', '亲自攻关 ●']);
R("${c.done ? '<i>已完结</i>' : ''}", "${c.done ? `<i>${uh('ui.chain.done')}</i>` : ''}", ['ui.chain.done', '已完结', '情境日志：走完的事件链']);
R("return (proj || '<p class=\"empty\">目前没有进行中的特殊项目。有些事件会开启一条「事件链」，需要你投入研究员、工程师、显卡或者亲自花行动点去推进，这里会显示进度。</p>') + (logs ? `<h4>情境日志</h4>${logs}` : '');",
  "return (proj || `<p class=\"empty\">${uh('ui.proj.none')}</p>`) + (logs ? `<h4>${uh('ui.chain.log')}</h4>${logs}` : '');",
  ['ui.proj.none', '目前没有进行中的特殊项目。有些事件会开启一条「事件链」，需要你投入研究员、工程师、显卡或者亲自花行动点去推进，这里会显示进度。'], ['ui.chain.log', '情境日志']);
// ── 右边：榜单、团队、黑料、卡牌、账本 ──
R("<p class=\"note\">行业前沿 ${G.frontier(S.t).toFixed(1)}${S.ownModel ? ` · 你的丹炉火候 ${G.myCap(S).toFixed(1)}` : ''}。榜单排的是对外跑分——谁都可能注了水。</p>`;",
  "<p class=\"note\">${S.ownModel ? uh('ui.board.note.own', { 前沿: G.frontier(S.t).toFixed(1), 火候: G.myCap(S).toFixed(1) }) : uh('ui.board.note', { 前沿: G.frontier(S.t).toFixed(1) })}</p>`;",
  ['ui.board.note', '行业前沿 {前沿}。榜单排的是对外跑分——谁都可能注了水。', '榜单下面那句'], ['ui.board.note.own', '行业前沿 {前沿} · 你的丹炉火候 {火候}。榜单排的是对外跑分——谁都可能注了水。', '同上（自研模型的公司）']);
R("if (V.rtab === 'team') return `<p class=\"note\">团队 ${S.staff.length}/${G.teamCap(S)} 人 · 月薪合计 ${G.money(S, G.costs(S).salary)}</p>` + (S.staff.length ? S.staff.map(e => person(e, `<button class=\"btn sm ghost\" data-a=\"fire:${e.uid}\" title=\"裁掉（赔 2 个月工资）\">✕</button>`)).join('') : '<p class=\"empty\">公司目前只有你一个人。去左边「团队」招人。</p>');",
  "if (V.rtab === 'team') return `<p class=\"note\">${uh('ui.team.note', { 人数: S.staff.length, 上限: G.teamCap(S), 月薪: G.money(S, G.costs(S).salary) })}</p>` + (S.staff.length ? S.staff.map(e => person(e, `<button class=\"btn sm ghost\" data-a=\"fire:${e.uid}\" title=\"${uh('ui.team.fire', { 月数: P['fire.payMonths'] })}\">✕</button>`)).join('') : `<p class=\"empty\">${uh('ui.team.none')}</p>`);",
  ['ui.team.note', '团队 {人数}/{上限} 人 · 月薪合计 {月薪}'], ['ui.team.fire', '裁掉（赔 {月数} 个月工资）', '{月数} = 平衡参数 fire.payMonths'], ['ui.team.none', '公司目前只有你一个人。去左边「团队」招人。']);
R("${DIRT[d.type]?.crime ? '<i>涉嫌违法</i>' : ''}<div class=\"bar\"><i style=\"width:${Math.min(100, d.sev * 2.5)}%\"></i></div><small>严重度 ${Math.round(d.sev)} · ${G.dateStr(d.t)}留下</small></div>`).join('') : '<p class=\"empty\">保险柜是空的。你是个体面人——暂时。</p>')",
  "${DIRT[d.type]?.crime ? `<i>${uh('ui.dirt.crime')}</i>` : ''}<div class=\"bar\"><i style=\"width:${Math.min(100, d.sev * 2.5)}%\"></i></div><small>${uh('ui.dirt.line', { 严重度: Math.round(d.sev), 日期: G.dateStr(d.t) })}</small></div>`).join('') : `<p class=\"empty\">${uh('ui.dirt.none')}</p>`)",
  ['ui.dirt.crime', '涉嫌违法', '保险柜里黑料的小标签'], ['ui.dirt.line', '严重度 {严重度} · {日期}留下'], ['ui.dirt.none', '保险柜是空的。你是个体面人——暂时。']);
R("+ `<p class=\"note\">每张黑料每个月都可能被扒出来：热度越高、用户越多、严重度越大，越容易爆。法务公关能压一压，「公关」里可以花钱洗白。<br>已曝光累计 ${Math.round(S.exposed)}${S.exposedCrime >= 15 ? `，其中涉嫌违法 ${Math.round(S.exposedCrime)}（到 40 经侦上门）` : ''}。</p>`;",
  "+ `<p class=\"note\">${uh('ui.dirt.note')}<br>${uh('ui.dirt.exposed', { 累计: Math.round(S.exposed), 违法: S.exposedCrime >= P['ui.crimeShow'] ? uh('ui.dirt.exposedCrime', { 违法: Math.round(S.exposedCrime), 经侦线: P['scandal.probeLine'] }) : '' })}</p>`;",
  ['ui.dirt.note', '每张黑料每个月都可能被扒出来：热度越高、用户越多、严重度越大，越容易爆。法务公关能压一压，「公关」里可以花钱洗白。'], ['ui.dirt.exposed', '已曝光累计 {累计}{违法}。'],
  ['ui.dirt.exposedCrime', '，其中涉嫌违法 {违法}（到 {经侦线} 经侦上门）', '涉嫌违法的曝光到 ui.crimeShow 才显示；{经侦线} = scandal.probeLine']);
P('ui.crimeShow', 15, '「黑料」页：涉嫌违法的黑料曝光到多少才单独列出来');
R("<small> 还剩 ${t.until - S.t} 个月</small></li>`).join('');", "<small> ${uh('ui.perks.left', { 月数: t.until - S.t })}</small></li>`).join('');", ['ui.perks.left', '还剩 {月数} 个月', '「卡牌」页：限时效果还剩几个月']);
R(".join('') : '<p class=\"empty\">还没有董事会卡。每轮融资和每年的董事会后都能三选一。</p>')", ".join('') : `<p class=\"empty\">${uh('ui.perks.none')}</p>`)", ['ui.perks.none', '还没有董事会卡。每轮融资和每年的董事会后都能三选一。']);
R("+ (S.feats.length ? `<h4>已上线功能</h4>", "+ (S.feats.length ? `<h4>${uh('ui.perks.feats')}</h4>", ['ui.perks.feats', '已上线功能']);
R("+ (temps ? `<h4>限时效果</h4>", "+ (temps ? `<h4>${uh('ui.perks.temps')}</h4>", ['ui.perks.temps', '限时效果']);
R("+ `<h4>创始人 ${esc(S.founder.name)}</h4>", "+ `<h4>${uh('ui.perks.founder', { 名字: esc(S.founder.name) })}</h4>", ['ui.perks.founder', '创始人 {名字}']);
R("return `<h4 style=\"border:0;margin-top:0;padding-top:0\">本月预计收入</h4>${row('订阅', rv.sub)}${row('API', rv.api)}${row('企业订单', rv.b2b)}<h4>本月预计支出</h4>${row('工资', cs.salary, 1)}${row('房租', cs.rent, 1)}${row('显卡', cs.gpu, 1)}${row('上游 API', cs.api, 1)}${row('运维杂项', cs.misc, 1)}\n    <div class=\"fr tot\"><span>净现金流</span>",
  "return `<h4 style=\"border:0;margin-top:0;padding-top:0\">${uh('ui.fin.rev')}</h4>${row(uh('ui.fin.sub'), rv.sub)}${row(uh('ui.fin.api'), rv.api)}${row(uh('ui.fin.b2b'), rv.b2b)}<h4>${uh('ui.fin.cost')}</h4>${row(uh('ui.fin.salary'), cs.salary, 1)}${row(uh('ui.fin.rent'), cs.rent, 1)}${row(uh('ui.fin.gpu'), cs.gpu, 1)}${row(uh('ui.fin.upstream'), cs.api, 1)}${row(uh('ui.fin.misc'), cs.misc, 1)}\n    <div class=\"fr tot\"><span>${uh('ui.fin.net')}</span>",
  ['ui.fin.rev', '本月预计收入', '「账本」页'], ['ui.fin.sub', '订阅'], ['ui.fin.api', 'API'], ['ui.fin.b2b', '企业订单'], ['ui.fin.cost', '本月预计支出'], ['ui.fin.salary', '工资'], ['ui.fin.rent', '房租'], ['ui.fin.gpu', '显卡'], ['ui.fin.upstream', '上游 API'], ['ui.fin.misc', '运维杂项'], ['ui.fin.net', '净现金流']);
R("<p class=\"note\">赛道「${TRACKS[S.co.track].name}」现在的盘子约 ${G.fmtUsers(G.market(S))}，以你的产品力最多能吃下 ${(G.shareCap(S) * 100).toFixed(0)}%。产品体验 ${S.quality.toFixed(0)}。${S.stage < 5 ? `<br>${STAGES[S.stage + 1].name}的达标线：用户 ${G.fmtUsers(STAGES[S.stage + 1].users)} 或月收入 ${G.money(S, STAGES[S.stage + 1].rev)}，或者冲到榜单前列。` : ''}${S.vam ? `<br><b class=\"bad\">对赌</b>：${G.dateStr(S.vam.due)}前用户须达 ${G.fmtUsers(S.vam.target)}。` : ''}</p>`;",
  "<p class=\"note\">${uh('ui.fin.market', { 赛道: TRACKS[S.co.track].name, 盘子: G.fmtUsers(G.market(S)), 份额: (G.shareCap(S) * 100).toFixed(0), 体验: S.quality.toFixed(0) })}${S.stage < STAGES.length - 2 ? `<br>${uh('ui.fin.next', { 轮次: STAGES[S.stage + 1].name, 用户: G.fmtUsers(STAGES[S.stage + 1].users), 收入: G.money(S, STAGES[S.stage + 1].rev) })}` : ''}${S.vam ? `<br><b class=\"bad\">${uh('ui.fin.vam')}</b>${uh('ui.fin.vam.text', { 日期: G.dateStr(S.vam.due), 目标: G.fmtUsers(S.vam.target) })}` : ''}</p>`;",
  ['ui.fin.market', '赛道「{赛道}」现在的盘子约 {盘子}，以你的产品力最多能吃下 {份额}%。产品体验 {体验}。'], ['ui.fin.next', '{轮次}的达标线：用户 {用户} 或月收入 {收入}，或者冲到榜单前列。', '下一轮融资的门槛（设定.xlsx「轮次」）'], ['ui.fin.vam', '对赌'], ['ui.fin.vam.text', '：{日期}前用户须达 {目标}。']);
R("return `<aside class=\"right panel\"><div class=\"gauges\">${g('hype', icon('flame', 14), '热度', S.hype, '#ff6b4a', '热度：拉新更快、估值更高，但黑料也更容易被扒')}${g('rep', icon('star', 14), '口碑', S.rep, '#e0a100', '口碑：影响留存和付费')}${g('morale', icon('smile', 14), '士气', S.morale, '#2ec4a6', '士气：决定团队产出，太低会有人跑路')}${g('reg', icon('bank', 14), '监管', S.reg, '#3a4460', '监管压力：到 70 增长受限、成本上升；到 100 吃重锤')}${g('bubble', icon('bubble', 14), '泡沫', S.bubble, '#7b5cff', 'AI 泡沫指数：越高估值越高，也越接近破裂')}${g('dirt', icon('bomb', 14), '黑料', Math.min(100, G.dirtTotal(S)), '#111', '保险柜里所有黑料的严重度之和')}</div>",
  "return `<aside class=\"right panel\"><div class=\"gauges\">${g('hype', icon('flame', 14), uh('ui.gauge.hype'), S.hype, '#ff6b4a', uh('ui.gauge.hype.tip'))}${g('rep', icon('star', 14), uh('ui.gauge.rep'), S.rep, '#e0a100', uh('ui.gauge.rep.tip'))}${g('morale', icon('smile', 14), uh('ui.gauge.morale'), S.morale, '#2ec4a6', uh('ui.gauge.morale.tip'))}${g('reg', icon('bank', 14), uh('ui.gauge.reg'), S.reg, '#3a4460', uh('ui.gauge.reg.tip', { 过高: P['reg.high'] }))}${g('bubble', icon('bubble', 14), uh('ui.gauge.bubble'), S.bubble, '#7b5cff', uh('ui.gauge.bubble.tip'))}${g('dirt', icon('bomb', 14), uh('ui.gauge.dirt'), Math.min(100, G.dirtTotal(S)), '#111', uh('ui.gauge.dirt.tip'))}</div>",
  ['ui.gauge.hype', '热度', '右边面板最上面的几根仪表'], ['ui.gauge.hype.tip', '热度：拉新更快、估值更高，但黑料也更容易被扒'], ['ui.gauge.rep', '口碑'], ['ui.gauge.rep.tip', '口碑：影响留存和付费'], ['ui.gauge.morale', '士气'], ['ui.gauge.morale.tip', '士气：决定团队产出，太低会有人跑路'],
  ['ui.gauge.reg', '监管'], ['ui.gauge.reg.tip', '监管压力：到 {过高} 增长受限、成本上升；到 100 吃重锤', '{过高} = 平衡参数 reg.high'], ['ui.gauge.bubble', '泡沫'], ['ui.gauge.bubble.tip', 'AI 泡沫指数：越高估值越高，也越接近破裂'], ['ui.gauge.dirt', '黑料'], ['ui.gauge.dirt.tip', '保险柜里所有黑料的严重度之和']);
// ── 底栏小部件 ──
R("const link = rel ? ' data-a=\"act:release\" title=\"点一下：出炉发布\"' : cold ? ' data-a=\"ltab:ops\" title=\"点一下：去「经营」租显卡\"' : '';",
  "const link = rel ? ` data-a=\"act:release\" title=\"${uh('ui.w.release.tip')}\"` : cold ? ` data-a=\"ltab:ops\" title=\"${uh('ui.w.cold.tip')}\"` : '';",
  ['ui.w.release.tip', '点一下：出炉发布', '底栏丹炉的提示'], ['ui.w.cold.tip', '点一下：去「经营」租显卡']);
R("<div><b>丹炉火候 ${cur.toFixed(1)}</b> <small>${rel ? '火候够了，点这里出炉发布' : gain > 0 ? `本月预计 +${(nxt - cur).toFixed(2)}` : '没有空闲显卡，炉子是凉的'}</small><br><small>现役 ${S.model ? S.model.cap.toFixed(1) : '—'} · 榜首 ${Math.max(...S.rivals.map(r => r.bench)).toFixed(1)} · 烧${DATA_SOURCES[S.furnace?.data || 'open'].name}</small></div></div>`);",
  "<div><b>${uh('ui.w.furnace', { 火候: cur.toFixed(1) })}</b> <small>${rel ? uh('ui.w.ready') : gain > 0 ? uh('ui.w.gain', { 涨: (nxt - cur).toFixed(2) }) : uh('ui.w.cold')}</small><br><small>${uh('ui.w.stats', { 现役: S.model ? S.model.cap.toFixed(1) : '—', 榜首: Math.max(...S.rivals.map(r => r.bench)).toFixed(1), 数据: DATA_SOURCES[S.furnace?.data || 'open'].name })}</small></div></div>`);",
  ['ui.w.furnace', '丹炉火候 {火候}'], ['ui.w.ready', '火候够了，点这里出炉发布'], ['ui.w.gain', '本月预计 +{涨}'], ['ui.w.cold', '没有空闲显卡，炉子是凉的'], ['ui.w.stats', '现役 {现役} · 榜首 {榜首} · 烧{数据}']);
R("const link = idle ? ` data-a=\"${now ? 'act:sprint' : 'ltab:rd'}\" title=\"${now ? '点一下：开始功能冲刺' : '这个月行动点用完了'}\"` : '';", "const link = idle ? ` data-a=\"${now ? 'act:sprint' : 'ltab:rd'}\" title=\"${now ? uh('ui.w.sprint.tip') : uh('ui.w.noAp.tip')}\"` : '';",
  ['ui.w.sprint.tip', '点一下：开始功能冲刺', '底栏产品的提示'], ['ui.w.noAp.tip', '这个月行动点用完了']);
R("<div><b>${TRACKS[S.co.track].name} · 体验 ${S.quality.toFixed(0)}</b><br><small>${S.sprint ? `开发中：${FEAT[S.sprint.id].name} ${Math.round(S.sprint.done / S.sprint.need * 100)}%` : idle ? (now ? '研发空闲，点这里开下一个功能' : '研发空闲，下个月记得开功能冲刺') : '功能都做完了'}</small></div></div>`);",
  "<div><b>${uh('ui.w.product', { 赛道: TRACKS[S.co.track].name, 体验: S.quality.toFixed(0) })}</b><br><small>${S.sprint ? uh('ui.w.dev', { 功能: FEAT[S.sprint.id].name, 进度: Math.round(S.sprint.done / S.sprint.need * 100) }) : idle ? (now ? uh('ui.w.idle') : uh('ui.w.idleLater')) : uh('ui.w.allDone')}</small></div></div>`);",
  ['ui.w.product', '{赛道} · 体验 {体验}'], ['ui.w.dev', '开发中：{功能} {进度}%'], ['ui.w.idle', '研发空闲，点这里开下一个功能'], ['ui.w.idleLater', '研发空闲，下个月记得开功能冲刺'], ['ui.w.allDone', '功能都做完了']);
R("<div><b>特殊项目 ×${S.projects.length}</b><br>", "<div><b>${uh('ui.w.proj', { 个数: S.projects.length })}</b><br>", ['ui.w.proj', '特殊项目 ×{个数}']);
R("${t.ok != null ? `<span class=\"${t.ok ? 'ok' : 'no'}\">${t.ok ? '✔ 成了' : '✘ 砸了'}　</span>` : ''}", "${t.ok != null ? `<span class=\"${t.ok ? 'ok' : 'no'}\">${t.ok ? uh('ui.toast.ok') : uh('ui.toast.fail')}　</span>` : ''}", ['ui.toast.ok', '✔ 成了', '行动做完冒出来的小提示：检定成功'], ['ui.toast.fail', '✘ 砸了']);
R("if (tip.fx) return tip.fx.length ? `<span class=\"tip\"><u>效果</u>${tipLines(tip.fx)}</span>` : '';\n  return tip.ok.length || tip.fail.length ? `<span class=\"tip\"><u>成功</u>${tipLines(tip.ok) || '<span>无事发生</span>'}<u>失败</u>${tipLines(tip.fail) || '<span>无事发生</span>'}</span>` : '';",
  "if (tip.fx) return tip.fx.length ? `<span class=\"tip\"><u>${uh('ui.tip.fx')}</u>${tipLines(tip.fx)}</span>` : '';\n  const none = `<span>${uh('ui.tip.nothing')}</span>`;\n  return tip.ok.length || tip.fail.length ? `<span class=\"tip\"><u>${uh('ui.ok')}</u>${tipLines(tip.ok) || none}<u>${uh('ui.fail')}</u>${tipLines(tip.fail) || none}</span>` : '';",
  ['ui.tip.fx', '效果', '鼠标悬停在选项上的效果预览'], ['ui.ok', '成功', '效果预览和结果页的「成功」'], ['ui.fail', '失败'], ['ui.tip.nothing', '无事发生']);
R("${ch ? `<span class=\"tag chain\">${ch.icon} 事件链 · ${ch.title}</span>` : ''}", "${ch ? `<span class=\"tag chain\">${uh('ui.dlg.chain', { 图标: ch.icon, 链: ch.title })}</span>` : ''}", ['ui.dlg.chain', '{图标} 事件链 · {链}', '事件窗左上角的事件链标签']);
R("${V.res.ok != null ? `<span class=\"stamp ${V.res.ok ? 'ok' : 'no'}\">${V.res.ok ? '成功' : '失败'}</span>` : ''}", "${V.res.ok != null ? `<span class=\"stamp ${V.res.ok ? 'ok' : 'no'}\">${V.res.ok ? uh('ui.ok') : uh('ui.fail')}</span>` : ''}");
R("<div class=\"pdx-opts\"><button class=\"opt go\" data-a=\"res\">继续</button></div>", "<div class=\"pdx-opts\"><button class=\"opt go\" data-a=\"res\">${uh('ui.dlg.continue')}</button></div>", ['ui.dlg.continue', '继续', '事件结果页的按钮']);
// ── 结局 ──
R("const stats = [['存活', `${t} 个月`], ['最终估值', G.money(S, o.val)], ['你的股权', S.equity.toFixed(0) + '%'], ['用户峰值', G.fmtUsers(S.stats.maxUsers)], ['融资总额', G.money(S, S.stats.raised)], ['经历事件', S.stats.events], ['董事会卡', S.perks.length], ['曝光黑料', Math.round(S.exposed)]];",
  "const stats = [['alive', uh('ui.end.months', { 月数: t })], ['val', G.money(S, o.val)], ['equity', S.equity.toFixed(0) + '%'], ['users', G.fmtUsers(S.stats.maxUsers)], ['raised', G.money(S, S.stats.raised)], ['events', S.stats.events], ['perks', S.perks.length], ['exposed', Math.round(S.exposed)]].map(([k, v]) => [uh('ui.end.' + k), v]);",
  ['ui.end.alive', '存活', '结局页的统计'], ['ui.end.months', '{月数} 个月'], ['ui.end.val', '最终估值'], ['ui.end.equity', '你的股权'], ['ui.end.users', '用户峰值'], ['ui.end.raised', '融资总额'], ['ui.end.events', '经历事件'], ['ui.end.perks', '董事会卡'], ['ui.end.exposed', '曝光黑料']);
R("<small>${esc(S.co.name)} · ${G.dateStr(t)} · 结局</small>", "<small>${uh('ui.end.sub', { 公司: esc(S.co.name), 日期: G.dateStr(t) })}</small>", ['ui.end.sub', '{公司} · {日期} · 结局']);
R("<div class=\"escore\">得分 <b>${R.score}</b>　人脉点 <b>+${R.points}</b>${R.newEnd ? '　<i>新结局！</i>' : ''}</div>", "<div class=\"escore\">${uh('ui.end.score', { 得分: `<b>${R.score}</b>`, 人脉点: `<b>+${R.points}</b>` })}${R.newEnd ? `　<i>${uh('ui.end.new')}</i>` : ''}</div>",
  ['ui.end.score', '得分 {得分}　人脉点 {人脉点}'], ['ui.end.new', '新结局！']);
R("<div class=\"tbtns row\"><button class=\"btn big go\" data-a=\"new\">再来一局</button><button class=\"btn\" data-a=\"meta\">局外成长</button><button class=\"btn ghost\" data-a=\"back\">回标题</button></div></section>`;",
  "<div class=\"tbtns row\"><button class=\"btn big go\" data-a=\"new\">${uh('ui.end.again')}</button><button class=\"btn\" data-a=\"meta\">${uh('ui.meta.h')}</button><button class=\"btn ghost\" data-a=\"back\">${uh('ui.end.title')}</button></div></section>`;",
  ['ui.end.again', '再来一局'], ['ui.end.title', '回标题']);
// ── 设置 ──
R("const GPU_TIP = '电脑有独立显卡的话：Windows 设置 → 系统 → 屏幕 → 显示卡（图形），把你用的浏览器添加进去、选「高性能」，然后彻底关掉浏览器再打开。显示器线也要插在独立显卡上，别插主板。';",
  "const GPU_TIP = uh('ui.gpuTip');", ['ui.gpuTip', '电脑有独立显卡的话：Windows 设置 → 系统 → 屏幕 → 显示卡（图形），把你用的浏览器添加进去、选「高性能」，然后彻底关掉浏览器再打开。显示器线也要插在独立显卡上，别插主板。', '浏览器在用核显时给的建议（标题画面和设置里）']);
R("return s ? `当前约 ${Math.round(s.fps)} 帧 · 显卡每帧 ${s.gpu ? s.gpu.toFixed(1) : '—'} 毫秒 · ${s.calls} 次绘制` : ''; };", "return s ? ut('ui.set.perf', { 帧: Math.round(s.fps), 毫秒: s.gpu ? s.gpu.toFixed(1) : '—', 绘制: s.calls }) : ''; };",
  ['ui.set.perf', '当前约 {帧} 帧 · 显卡每帧 {毫秒} 毫秒 · {绘制} 次绘制', '设置里的性能读数']);
R("const gfx = q ? `<h4>画质</h4>", "const gfx = q ? `<h4>${uh('ui.set.gfx')}</h4>", ['ui.set.gfx', '画质']);
R("${q.res ? `<br>内部渲染 ${q.res[0]}×${q.res[1]}` : ''}</p>", "${q.res ? `<br>${uh('ui.set.res', { 宽: q.res[0], 高: q.res[1] })}` : ''}</p>", ['ui.set.res', '内部渲染 {宽}×{高}']);
R('<div class="set-row scalerow"><span>渲染精度</span>', "<div class=\"set-row scalerow\"><span>${uh('ui.set.scale')}</span>", ['ui.set.scale', '渲染精度']);
R("<div class=\"set-row fpsrow\"><span>帧率上限</span><div class=\"seg\">${[['auto', '跟随画质'], ['30', '30'], ['60', '60'], ['0', '不限']].map(", "<div class=\"set-row fpsrow\"><span>${uh('ui.set.fps')}</span><div class=\"seg\">${[['auto', uh('ui.set.fps.auto')], ['30', '30'], ['60', '60'], ['0', uh('ui.set.fps.none')]].map(",
  ['ui.set.fps', '帧率上限'], ['ui.set.fps.auto', '跟随画质'], ['ui.set.fps.none', '不限']);
R("${q.auto ? 'checked' : ''}> 自动调整（卡顿时自动降一档）</label>", "${q.auto ? 'checked' : ''}> ${uh('ui.set.auto')}</label>", ['ui.set.auto', '自动调整（卡顿时自动降一档）']);
R("<p class=\"note\">正在用的显卡：<b>${esc(q.gpu || '未知')}</b>${q.phone ? '（手机）' : q.tablet ? '（平板）' : q.igpu ? '（核显）' : ''}</p>${q.igpu ? `<p class=\"note warn\">浏览器在用核显，画面会很卡。${GPU_TIP}</p>` : ''}${q.phone ? '<p class=\"note\">手机上建议用「手机」档、横屏玩；发烫的话把帧率上限设成 30。</p>' : ''}${q.q === 'max' ? '<p class=\"note\">「极致」档要高端显卡；天色变化和城市盖好时会补拍一次街景反射，那一下可能轻微顿一顿。</p>' : ''}` : '<p class=\"note\">3D 场景没有启动，画质设置不可用。</p>';",
  "<p class=\"note\">${uh('ui.set.gpu', { 显卡: `<b>${esc(q.gpu || ut('ui.set.gpu.unknown'))}</b>`, 类型: q.phone ? uh('ui.set.gpu.phone') : q.tablet ? uh('ui.set.gpu.tablet') : q.igpu ? uh('ui.set.gpu.igpu') : '' })}</p>${q.igpu ? `<p class=\"note warn\">${uh('ui.set.igpu', { 建议: GPU_TIP })}</p>` : ''}${q.phone ? `<p class=\"note\">${uh('ui.set.phone')}</p>` : ''}${q.q === 'max' ? `<p class=\"note\">${uh('ui.set.max')}</p>` : ''}` : `<p class=\"note\">${uh('ui.set.no3d')}</p>`;",
  ['ui.set.gpu', '正在用的显卡：{显卡}{类型}'], ['ui.set.gpu.unknown', '未知'], ['ui.set.gpu.phone', '（手机）'], ['ui.set.gpu.tablet', '（平板）'], ['ui.set.gpu.igpu', '（核显）'], ['ui.set.igpu', '浏览器在用核显，画面会很卡。{建议}'],
  ['ui.set.phone', '手机上建议用「手机」档、横屏玩；发烫的话把帧率上限设成 30。'], ['ui.set.max', '「极致」档要高端显卡；天色变化和城市盖好时会补拍一次街景反射，那一下可能轻微顿一顿。'], ['ui.set.no3d', '3D 场景没有启动，画质设置不可用。']);
R("return `<div class=\"veil\"><section class=\"settings panel\"><h2>${icon('settings', 20)} 设置</h2>${gfx}\n  <h4>声音</h4>${row('master', '总音量')}${row('music', '音乐')}${row('sfx', '音效')}${row('amb', '环境声')}\n  <label class=\"chk\"><input type=\"checkbox\" data-s=\"mute\" ${muted ? 'checked' : ''}> 静音</label>\n  <h4>显示</h4><label class=\"chk\"><input type=\"checkbox\" data-s=\"hints\" ${V.hintsOff ? '' : 'checked'}> 行动提示（顶部那排待办提醒）</label><label class=\"chk\"><input type=\"checkbox\" data-s=\"fps\" ${V.fps ? 'checked' : ''}> 显示帧率</label>\n  <div class=\"row\"><button class=\"btn go\" data-a=\"settings:close\">完成</button></div></section></div>`;",
  "return `<div class=\"veil\"><section class=\"settings panel\"><h2>${icon('settings', 20)} ${uh('ui.set.h')}</h2>${gfx}\n  <h4>${uh('ui.set.sound')}</h4>${row('master', uh('ui.set.vol.master'))}${row('music', uh('ui.set.vol.music'))}${row('sfx', uh('ui.set.vol.sfx'))}${row('amb', uh('ui.set.vol.amb'))}\n  <label class=\"chk\"><input type=\"checkbox\" data-s=\"mute\" ${muted ? 'checked' : ''}> ${uh('ui.set.mute')}</label>\n  <h4>${uh('ui.set.display')}</h4><label class=\"chk\"><input type=\"checkbox\" data-s=\"hints\" ${V.hintsOff ? '' : 'checked'}> ${uh('ui.set.hints')}</label><label class=\"chk\"><input type=\"checkbox\" data-s=\"fps\" ${V.fps ? 'checked' : ''}> ${uh('ui.set.showFps')}</label>\n  <div class=\"row\"><button class=\"btn go\" data-a=\"settings:close\">${uh('ui.set.done')}</button></div></section></div>`;",
  ['ui.set.h', '设置'], ['ui.set.sound', '声音'], ['ui.set.vol.master', '总音量'], ['ui.set.vol.music', '音乐'], ['ui.set.vol.sfx', '音效'], ['ui.set.vol.amb', '环境声'], ['ui.set.mute', '静音', '设置里的勾选框（菜单里的「静音」是 ui.menu.mute）'],
  ['ui.set.display', '显示'], ['ui.set.hints', '行动提示（顶部那排待办提醒）'], ['ui.set.showFps', '显示帧率'], ['ui.set.done', '完成']);
// ── 危机等级、配乐（只影响画面边缘的光和配乐）──
R("at(2, rw < 1.5); at(1, rw < 3);\n  at(2, crime >= 32 && G.leakRisk(S, isCrime) >= 0.08); at(1, crime >= 25);\n  at(2, reg >= 92); at(1, reg >= 82);\n  at(2, S.stage >= 2 && !S.cd.coup && S.equity < 45 && (S.rep < 30 || S.morale < 28 || S.exposed >= 35));",
  "at(2, rw < P['crisis.runwayBad']); at(1, rw < P['crisis.runway']);\n  at(2, crime >= P['crisis.crimeBad'] && G.leakRisk(S, isCrime) >= P['advice.dirt.risk']); at(1, crime >= P['advice.crime.from']);\n  at(2, reg >= P['crisis.regBad']); at(1, reg >= P['crisis.reg']);\n  at(2, S.stage >= P['coup.stage'] && !S.cd.coup && S.equity < P['coup.equity'] && (S.rep < P['coup.rep'] || S.morale < P['coup.morale'] || S.exposed >= P['coup.exposed']));");
R("at(1, S.morale < 22); at(1, G.leakRisk(S) >= 0.2); at(1, S.outage > 0.3);", "at(1, S.morale < P['crisis.morale']); at(1, G.leakRisk(S) >= P['advice.dirt.bad']); at(1, S.outage > P['crisis.outage']);");
R("at(2, !!I?.on && I.n >= 12 && S.equity < IDEO.IDEO_EQUITY); at(1, !!I?.on && S.equity < IDEO.IDEO_EQUITY + 2);", "at(2, !!I?.on && I.n >= P['crisis.ideoLate'] && S.equity < IDEO.IDEO_EQUITY); at(1, !!I?.on && S.equity < IDEO.IDEO_EQUITY + P['crisis.ideoMargin']);");
R("at(1, I?.v === 'us' && (I.on || I.result === 'red') && I.heat >= 85);", "at(1, IDEO.hasHeat(I?.v) && (I.on || I.result === 'red') && I.heat >= P['crisis.heat']);");
R("if (lv === 1 || rw < 6 || S.reg >= 70) return 'tense';", "if (lv === 1 || rw < P['crisis.tenseRunway'] || S.reg >= P['reg.high']) return 'tense';");
for (const [k, v, d, u] of [['crisis.runwayBad', 1.5, '危急（屏幕边缘红光、危机配乐）：现金撑不过几个月', '月'], ['crisis.runway', 3, '紧张：现金撑不过几个月', '月'], ['crisis.crimeBad', 32, '危急：涉嫌违法的曝光到多少，并且这个月爆违法黑料的概率到 advice.dirt.risk（紧张的线是 advice.crime.from）'],
  ['crisis.regBad', 92, '危急：监管压力到多少（监管重锤的冷却期里不算）'], ['crisis.reg', 82, '紧张：监管压力到多少'], ['crisis.morale', 22, '紧张：士气低于多少'], ['crisis.outage', 0.3, '紧张：推理缺口超过多少'],
  ['crisis.ideoLate', 12, '危急：路线之争到第几级以后股权还不到 ideo.equity'], ['crisis.ideoMargin', 2, '紧张：路线之争期间股权离 ideo.equity 不到几个点', '%'], ['crisis.heat', 85, '紧张：反共压力到多少'], ['crisis.tenseRunway', 6, '配乐转紧张：现金撑不过几个月（或者监管压力过高）', '月']]) P(k, v, d, u, '危机提示');
// ── 教学卡、行动提示、员工气泡、楼层 ──
R("return tip ? `<div class=\"tutor panel\"><span class=\"tface\">🧓</span><div><b>学长老周 · ${tip.title}</b><p>${esc(tip.text)}</p></div><button class=\"btn sm\" data-a=\"tip\">知道了</button></div>` : '';",
  "return tip ? `<div class=\"tutor panel\"><span class=\"tface\">${uh('ui.tutor.face')}</span><div><b>${uh('ui.tutor.h', { 标题: tip.title })}</b><p>${esc(tip.text)}</p></div><button class=\"btn sm\" data-a=\"tip\">${uh('ui.tutor.ok')}</button></div>` : '';",
  ['ui.tutor.face', '🧓', '新手教学卡片上老周的头像'], ['ui.tutor.h', '学长老周 · {标题}'], ['ui.tutor.ok', '知道了']);
R('const HINT_MAX = 4;', "const HINT_MAX = P['ui.hintMax'];");
P('ui.hintMax', 4, '顶部的行动提示最多同时显示几条（多出来的折叠起来）');
R("if (h.later) return `这个月行动点用完了，下个月记得${h.act ? `「${A.actName(S, A.ACT[h.act])}」` : '处理'}`;\n  if (h.act) return `点一下：${A.actName(S, A.ACT[h.act])}`;",
  "if (h.later) return ut('ui.hint.later', { 事: h.act ? ut('ui.hint.later.act', { 行动: A.actName(S, A.ACT[h.act]) }) : ut('ui.hint.later.other') });\n  if (h.act) return ut('ui.hint.do', { 行动: A.actName(S, A.ACT[h.act]) });",
  ['ui.hint.later', '这个月行动点用完了，下个月记得{事}', '行动提示悬停时最下面那句'], ['ui.hint.later.act', '「{行动}」'], ['ui.hint.later.other', '处理'], ['ui.hint.do', '点一下：{行动}']);
R("return tab ? `点一下：去「${tab}」看看` : '';", "return tab ? ut('ui.hint.go', { 页签: tab }) : '';", ['ui.hint.go', '点一下：去「{页签}」看看']);
R('aria-label="先别提醒">', "aria-label=\"${uh('ui.hint.mute.aria')}\">", ['ui.hint.mute.aria', '先别提醒']);
R("<small>${esc(hintCTA(h))}<br>点 × ${muteMonths(h) === 1 ? '这个月' : '3 个月内'}不再提醒这一条</small></div></div>`).join('')}${hs.length > HINT_MAX ? `<button class=\"alert more\" data-a=\"hintall\">${V.hintsAll ? '收起' : `还有 ${hs.length - HINT_MAX} 条`}</button>` : ''}</div>`;",
  "<small>${esc(hintCTA(h))}<br>${uh('ui.hint.mute', { 多久: muteMonths(h) === 1 ? uh('ui.hint.mute.month') : uh('ui.hint.mute.months', { 月数: muteMonths(h) }) })}</small></div></div>`).join('')}${hs.length > HINT_MAX ? `<button class=\"alert more\" data-a=\"hintall\">${V.hintsAll ? uh('ui.hint.less') : uh('ui.hint.more', { 条数: hs.length - HINT_MAX })}</button>` : ''}</div>`;",
  ['ui.hint.mute', '点 × {多久}不再提醒这一条'], ['ui.hint.mute.month', '这个月'], ['ui.hint.mute.months', '{月数} 个月内', '静音几个月在平衡参数 advice.mute.*'], ['ui.hint.less', '收起'], ['ui.hint.more', '还有 {条数} 条']);
R("<small>${ROLES[e.role].icon} ${ROLES[e.role].name} · 能力 ${e.skill}/10</small>", "<small>${uh('ui.pop.role', { 图标: ROLES[e.role].icon, 岗位: ROLES[e.role].name, 能力: e.skill })}</small>", ['ui.pop.role', '{图标} {岗位} · 能力 {能力}/10', '员工气泡']);
R("<h5>${hired ? '他现在给公司带来' : '招进来能带来'}</h5>", "<h5>${hired ? uh('ui.pop.now') : uh('ui.pop.would')}</h5>", ['ui.pop.now', '他现在给公司带来'], ['ui.pop.would', '招进来能带来']);
R("<p class=\"ps\">月薪 ${G.money(S, im.salary)}${hired ? ` · ${G.dateStr(e.since)}入职` : ' · 入职时另付一个月工资当签字费'}</p></div>`;", "<p class=\"ps\">${hired ? uh('ui.pop.pay.hired', { 月薪: G.money(S, im.salary), 日期: G.dateStr(e.since) }) : uh('ui.pop.pay.cand', { 月薪: G.money(S, im.salary) })}</p></div>`;",
  ['ui.pop.pay.hired', '月薪 {月薪} · {日期}入职'], ['ui.pop.pay.cand', '月薪 {月薪} · 入职时另付一个月工资当签字费']);
R("const lcdText = (f, n) => (f < 0 || f >= n ? '全' : `${f + 1}F`);", "const lcdText = (f, n) => (f < 0 || f >= n ? ut('ui.lift.lcd') : `${f + 1}F`);", ['ui.lift.lcd', '全', '电梯显示屏：在看全楼']);
R("data-a=\"floor:all\" title=\"看整栋楼（Home）\">${icon('building', 15)}<span>全楼</span></button>", "data-a=\"floor:all\" title=\"${uh('ui.lift.all.tip')}\">${icon('building', 15)}<span>${uh('ui.lift.all')}</span></button>", ['ui.lift.all.tip', '看整栋楼（Home）'], ['ui.lift.all', '全楼']);
R("title=\"${f.map(d => DEPTS[d].name).join('、')}（↑↓ 换楼层）\">", "title=\"${uh('ui.lift.floor.tip', { 部门: f.map(d => DEPTS[d].name).join(ut('ui.sep')) })}\">", ['ui.lift.floor.tip', '{部门}（↑↓ 换楼层）', '电梯面板：每一层的提示'], ['ui.sep', '、', '界面上列举几样东西时的分隔号']);
// ── 流程里的小窗口、提示 ──
R("if (!S.over) toast({ text: `${G.dateStr(S.t - 1)}结算：收入 ${G.money(S, S.last.rev)}，支出 ${G.money(S, S.last.cost)}，净 ${G.money(S, S.last.net, true)}${feat ? `\\n${feat.icon} 新功能「${feat.name}」上线了，研发组空出来了。` : ''}` });",
  "if (!S.over) toast({ text: ut('ui.month.toast', { 日期: G.dateStr(S.t - 1), 收入: G.money(S, S.last.rev), 支出: G.money(S, S.last.cost), 净: G.money(S, S.last.net, true) }) + (feat ? '\\n' + ut('ui.month.feat', { 图标: feat.icon, 功能: feat.name }) : '') });",
  ['ui.month.toast', '{日期}结算：收入 {收入}，支出 {支出}，净 {净}', '每个月结算完冒出来的小提示'], ['ui.month.feat', '{图标} 新功能「{功能}」上线了，研发组空出来了。', '同上，这个月有功能上线时多一行']);
R("else if (k === 'start') return startGame({ name: W.name.trim() || '无名氏', coName: W.coName.trim() || '无名公司', modelName: W.modelName.trim() || '混沌',", "else if (k === 'start') return startGame({ name: W.name.trim() || ut('ui.wiz.default.name'), coName: W.coName.trim() || ut('ui.wiz.default.co'), modelName: W.modelName.trim() || text('default.model'),",
  ['ui.wiz.default.name', '无名氏', '向导里没填创始人名字时'], ['ui.wiz.default.co', '无名公司', '没填公司名时（模型名用「引擎」表的 default.model）']);
R("office?.play('say', { who: uid, text: rnd(['到！', '老板好！', '在写了在写了', '这个需求真做不了', '我没在摸鱼', '下班前给你']) });", "office?.play('say', { who: uid, text: rnd(lines('ui.say.staff')) });",
  ['ui.say.staff', list(['到！', '老板好！', '在写了在写了', '这个需求真做不了', '我没在摸鱼', '下班前给你']), '点员工时沙盘里那个小人冒出来的话，一行一句，随机挑']);
R("localDialog('暂停', '进度会在每个月初自动保存，随时可以回来接着干。', '⏸️', [\n      { label: '继续经营', fn() { render(); } },\n      { label: '画质与声音设置', fn() { V.settings = true; render(); } },\n      { label: muted ? '打开声音' : '静音', fn() { setMuted(!muted); render(); } },\n      { label: '保存并回到标题', fn() { G.saveGame(S); V.screen = 'title'; render(); } },",
  "localDialog(ut('ui.menu.title'), ut('ui.menu.text'), ut('ui.menu.icon'), [\n      { label: ut('ui.menu.resume'), fn() { render(); } },\n      { label: ut('ui.menu.settings'), fn() { V.settings = true; render(); } },\n      { label: muted ? ut('ui.menu.unmute') : ut('ui.menu.mute'), fn() { setMuted(!muted); render(); } },\n      { label: ut('ui.menu.quit'), fn() { G.saveGame(S); V.screen = 'title'; render(); } },",
  ['ui.menu.title', '暂停', '点公司 Logo 弹出来的菜单'], ['ui.menu.text', '进度会在每个月初自动保存，随时可以回来接着干。'], ['ui.menu.icon', '⏸️'], ['ui.menu.resume', '继续经营'], ['ui.menu.settings', '画质与声音设置'], ['ui.menu.unmute', '打开声音'], ['ui.menu.mute', '静音'], ['ui.menu.quit', '保存并回到标题']);
R("if (e) localDialog(`让 ${e.name} 「毕业」？`, `赔偿 2 个月工资（${G.money(S, 2 * e.salary * G.mod(S, 'salaryMult'))}），团队士气会受影响。`, '📦', [{ label: '发毕业证', fn() { sfx('fire'); toast(A.fire(S, uid)); render(); } }, { label: '算了', fn() { render(); } }]);",
  "if (e) localDialog(ut('ui.fire.title', { 名字: e.name }), ut('ui.fire.text', { 月数: P['fire.payMonths'], 金额: G.money(S, P['fire.payMonths'] * e.salary * G.mod(S, 'salaryMult')) }), ut('ui.fire.icon'), [{ label: ut('ui.fire.ok'), fn() { sfx('fire'); toast(A.fire(S, uid)); render(); } }, { label: ut('ui.fire.no'), fn() { render(); } }]);",
  ['ui.fire.title', '让 {名字} 「毕业」？', '裁人的确认窗'], ['ui.fire.text', '赔偿 {月数} 个月工资（{金额}），团队士气会受影响。', '{月数} = 平衡参数 fire.payMonths'], ['ui.fire.icon', '📦'], ['ui.fire.ok', '发毕业证'], ['ui.fire.no', '算了']);
R("gpu(k) { const q = G.quota(S), step = Math.max(5, Math.round(q * 0.1));", "gpu(k) { const q = G.quota(S), step = Math.max(P['ui.gpuStepMin'], Math.round(q * P['ui.gpuStep']));");
P('ui.gpuStep', 0.1, '「经营」页显卡的 ＋ − 一次加减配额的几成'); P('ui.gpuStepMin', 5, '一次最少加减几张', '张');
R("const sug = hintsNow().filter(h => h.act && !h.later && !A.actionState(S, A.ACT[h.act]).why).slice(0, 2);\n      return localDialog('还有行动点没用', `这个月还剩 ${S.ap} 个行动点，不用就浪费了。${sug.length ? '下面是参谋觉得现在最值得做的事。' : ''}`, '⏭️', [\n        ...sug.map(h => ({ label: `先去「${A.actName(S, A.ACT[h.act])}」`, hint: h.title, fn() { CMD.act(h.act); } })),\n        { label: '就这样，进入下个月', fn: nextMonth }, { label: '我再想想', fn() { render(); } },",
  "const sug = hintsNow().filter(h => h.act && !h.later && !A.actionState(S, A.ACT[h.act]).why).slice(0, P['ui.nextSug']);\n      return localDialog(ut('ui.next.title'), ut('ui.next.text', { 行动点: S.ap }) + (sug.length ? ut('ui.next.sug') : ''), ut('ui.next.icon'), [\n        ...sug.map(h => ({ label: ut('ui.next.go', { 行动: A.actName(S, A.ACT[h.act]) }), hint: h.title, fn() { CMD.act(h.act); } })),\n        { label: ut('ui.next.ok'), fn: nextMonth }, { label: ut('ui.next.no'), fn() { render(); } },",
  ['ui.next.title', '还有行动点没用', '点「下个月」时还有行动点'], ['ui.next.text', '这个月还剩 {行动点} 个行动点，不用就浪费了。'], ['ui.next.sug', '下面是参谋觉得现在最值得做的事。', '有建议的行动时接在后面'], ['ui.next.icon', '⏭️'], ['ui.next.go', '先去「{行动}」'], ['ui.next.ok', '就这样，进入下个月'], ['ui.next.no', '我再想想']);
P('ui.nextSug', 2, '点「下个月」时还有行动点：最多列出几件参谋建议的事');
R("document.body.insertAdjacentHTML('beforeend', '<div class=\"rotate-hint\"><b>↻</b><span>把手机横过来玩</span><small>竖着放不下这么多信息</small></div>');", "document.body.insertAdjacentHTML('beforeend', `<div class=\"rotate-hint\"><b>↻</b><span>${uh('ui.rotate.h')}</span><small>${uh('ui.rotate.tip')}</small></div>`);",
  ['ui.rotate.h', '把手机横过来玩', '手机竖着拿时盖在上面的提示'], ['ui.rotate.tip', '竖着放不下这么多信息']);

const rows = [...TX.values()];
writeFileSync(path.join(out, 'p-ui-text.json'), JSON.stringify({ 'src/ui/ui.js': pairs }));
writeFileSync(path.join(out, 'ui-text.rows.json'), JSON.stringify(rows));
writeFileSync(path.join(out, 'ui-params.rows.json'), JSON.stringify(PR));
console.log('替换', pairs.length, '处；文字', rows.length, '条（界面', rows.filter(r => r.sheet === '界面').length, '、路线之争', rows.filter(r => r.sheet === '路线之争').length, '）；参数', PR.length, '个');

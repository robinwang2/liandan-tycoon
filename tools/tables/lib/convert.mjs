// 「数据 ⇄ 工作簿」的转换：
//   readTables(dir)        读全部 xlsx → { data: { defs, events, … }, errors, warnings }   （导出用）
//   writeTables(data, dir) 把数据写成 xlsx                                                 （第一次生成、以后改表结构时用）
import path from 'node:path';
import { existsSync } from 'node:fs';
import { BOOKS, ROW } from '../schema.mjs';
import { readBook, writeBook, colName } from './xlsx.mjs';
import { buildVocab } from './vocab.mjs';
import { makeTypes } from './types.mjs';
import { DslError } from './dsl.mjs';

export const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
export const TABLE_DIR = path.join(ROOT, 'tables'), JSON_DIR = path.join(ROOT, 'src', 'data', 'tables');
const clone = x => JSON.parse(JSON.stringify(x));

// ───────── 读 ─────────
export async function readTables(dir = TABLE_DIR, { only } = {}) {
  const errors = [], warnings = [], data = {};
  const books = [];
  for (const spec of BOOKS) {
    if (only && !only.includes(spec.out)) continue;
    const file = path.join(dir, spec.file);
    if (!existsSync(file)) { errors.push(`找不到 ${spec.file}（应该在 ${path.relative(ROOT, dir)} 里）`); continue; }
    let book;
    try { book = await readBook(file); } catch (e) { errors.push(`${spec.file} 打不开：${e.message}（如果正在 WPS 里开着，先保存并关掉再试）`); continue; }
    const byName = new Map(book.sheets.map(s => [s.name, s]));
    for (const s of book.sheets) if (!spec.sheets.some(x => x.name === s.name)) warnings.push(`${spec.file} 里的表「${s.name}」不在表结构定义里，已跳过（临时用的表请把表名改成 # 开头）`);
    books.push({ spec, byName, out: (data[spec.out] = {}), tmp: {} });
  }

  const projects = new Map();
  let T = makeTypes(buildVocab([]));
  const where = (spec, sh, r, c) => `${spec.file} › ${sh.name}${r ? ` › 第 ${r} 行` : ''}${c ? ` › ${colName(c.c)} 列「${c.title}」` : ''}`;

  function run(b, sh) {
    const sheet = b.byName.get(sh.name);
    if (!sheet) { errors.push(`${b.spec.file} 里缺少表「${sh.name}」`); return; }
    const have = new Map(sheet.cols.map(c => [c.key, c]));
    for (const c of sh.cols) if (!c.key.startsWith('#') && !have.has(c.key)) errors.push(`${where(b.spec, sh)}：缺少列「${c.title}」（第 2 行的字段名应该是 ${c.key}）`);
    const cols = sheet.cols.map(c => ({ ...c, t: T.get(c.type) }));
    for (const c of cols) if (!c.t) errors.push(`${where(b.spec, sh, 3, c)}：不认识的类型「${c.type}」。可以用：${[...new Set([...T.values()].map(t => t.name))].join('、')}`);
    const noteOf = new Map(sh.cols.filter(c => c.noteKey).map(c => [c.key, c.noteKey])), isNote = new Set(noteOf.values());
    const ctx = {
      tmp: b.tmp, projects,
      // 报错定位到这条数据原本所在的表和行（事件和选项是两张表拼起来的，出错的可能是另一张表里的行）；
      // 那一行已经有格子读不出来的话，就不再追加由它引起的连带报错
      fail: (rec, key, msg) => { const at = rec?.[ROW]; if (at?.bad) return; errors.push(`${where(b.spec, at?.sh || sh, at?.r, key && (at?.have || have).get(key))}：${msg}`); },
    };
    const recs = [];
    for (const row of sheet.rows) {
      const rec = { [ROW]: { r: row.r, sh, have } };
      for (const c of cols) {
        if (!c.t || isNote.has(c.key)) continue;
        const raw = row.cells[c.key], nk = noteOf.get(c.key), note = nk ? row.cells[nk] : undefined;
        if (raw == null) { if (note != null) errors.push(`${where(b.spec, sh, row.r, have.get(nk))}：这里写了进展，但左边的「${c.title}」是空的（要在效果里写 链:事件链id）`); continue; }
        const cctx = { note: note != null ? String(note) : undefined, chainSeen: false, project: id => (projects.has(id) ? clone(projects.get(id)) : null) };
        try { rec[c.key] = c.t.dec(raw, cctx); }
        catch (e) { if (!(e instanceof DslError)) throw e; errors.push(`${where(b.spec, sh, row.r, c)}：${e.message}`); rec[ROW].bad = true; continue; }
        if (note != null && !cctx.chainSeen) errors.push(`${where(b.spec, sh, row.r, have.get(nk))}：这里写了进展，但「${c.title}」里没有 链:事件链id`);
      }
      recs.push(rec);
    }
    try { sh.unpack(recs, b.out, ctx); }
    catch (e) { errors.push(`${where(b.spec, sh)}：${e.message}`); }
  }

  // 先读「修正」表（别的表写修正时要用它的名字），再读「特殊项目」，最后读其余的
  for (const b of books) for (const sh of b.spec.sheets) if (sh.early && sh.name === '修正') run(b, sh);
  const mods = data.defs?.MODS;
  if (mods) T = makeTypes(buildVocab(mods.filter(m => m.id && m.zh)));
  else if (!only) errors.push('设定.xlsx 的「修正」表没读出来，别的表里的修正都认不了');
  else warnings.push('这次没读 设定.xlsx，修正的名字认不了');
  for (const b of books) for (const sh of b.spec.sheets) if (sh.early && sh.name !== '修正') run(b, sh);
  for (const b of books) for (const sh of b.spec.sheets) if (!sh.early) run(b, sh);
  return { data, errors, warnings };
}

// ───────── 写 ─────────
export async function writeTables(data, dir = TABLE_DIR, { only } = {}) {
  const V = buildVocab(data.defs.MODS), T = makeTypes(V), fallbacks = [], written = [];
  for (const spec of BOOKS) {
    if (only && !only.includes(spec.out)) continue;
    const d = data[spec.out];
    if (!d) throw new Error(`没有 ${spec.out} 的数据`);
    const projects = new Map();
    const ctx = {
      projects, tmp: {},
      addProject: p => { const old = projects.get(p.id); if (old && JSON.stringify(old) !== JSON.stringify(p)) throw new DslError(`特殊项目 ${p.id} 有两种不同的定义`); if (!spec.sheets.some(s => s.name === '特殊项目')) throw new DslError(`${spec.file} 里没有「特殊项目」表`); projects.set(p.id, p); return p.id; },
      projectOf: id => (projects.has(id) ? clone(projects.get(id)) : null),
    };
    const sheets = [];
    for (const sh of spec.sheets) {
      const known = new Set(sh.cols.map(c => c.key));
      const rows = sh.pack(d, ctx).map((rec, i) => {
        const at = `${spec.file}「${sh.name}」第 ${i + 1} 条`, out = {};
        for (const k of Object.keys(rec)) { if (k.startsWith('#')) out[k] = rec[k]; else if (rec[k] !== undefined && !known.has(k)) throw new Error(`${at}：有没处理的字段「${k}」= ${String(JSON.stringify(rec[k])).slice(0, 100)}`); }
        for (const c of sh.cols) {
          if (c.key.startsWith('#') || rec[c.key] === undefined) continue;
          const t = T.get(c.type);
          if (!t) throw new Error(`${at}：未知的列类型 ${c.type}`);
          const cctx = { ...ctx, note: undefined, fallback: (name, v, err) => fallbacks.push(`${at}「${c.title}」写不成${name}的格子写法，退回成 JSON：${err}`) };
          let cell;
          try { cell = t.enc(rec[c.key], cctx); } catch (e) { throw new Error(`${at}「${c.title}」：${e.message}`); }
          if (cell !== undefined) out[c.key] = cell;
          if (cctx.note != null) { if (!c.noteKey) throw new Error(`${at}「${c.title}」：这里的效果带事件链进展，但这张表没有「链进展」列`); out[c.noteKey] = cctx.note; }
        }
        return out;
      });
      sheets.push({ name: sh.name, cols: sh.cols, rows, freeze: sh.freeze });
    }
    await writeBook(path.join(dir, spec.file), sheets, { readme: readme(spec, V) });
    written.push(`${spec.file}（${sheets.map(s => `${s.name} ${s.rows.length}`).join('、')}）`);
  }
  return { written, fallbacks };
}

// 每本工作簿第一张「#说明」
function readme(spec, V) {
  const L = [`# ${spec.file}`, ...spec.about, '',
    '## 怎么改',
    '· 第 1 行是中文列名，第 2 行是程序用的字段名，第 3 行是类型；这三行别动。从第 4 行开始是数据。',
    '· 改完保存，在项目文件夹里运行 npm run tables（把表导出成游戏读的 JSON，顺便检查有没有填错），再 npm run build。',
    '· 填错了会报「哪本表 › 哪张表 › 第几行 › 哪一列」，照着改就行。',
    '· 列名以 # 开头的是备注列，随便写，程序不读；想加自己的备注列，把第 1 行或第 2 行写成 # 开头。',
    '· 第一格以 # 开头的行是注释行，程序跳过；表名以 # 开头的表整张跳过。',
    '· 别合并单元格；别在数据列里写公式；带选项的表别只给一部分行排序（整张表一起排没关系）。',
    '· id（标识）会被别的表和代码引用：改名字、改数值、改文字都随意，改 id 之前先搜一下谁在用。',
    '', '## 每张表是什么'];
  for (const sh of spec.sheets) L.push(`· 「${sh.name}」：${sh.about || ''}`);
  const used = new Set(spec.sheets.flatMap(s => s.cols.map(c => c.type)));
  const sect = (type, d, intro) => {
    if (!used.has(type)) return;
    L.push('', `## 「${type}」列怎么写`, intro);
    for (const r of d.doc()) L.push(`    ${r.form.padEnd(16, '　')}${r.key}${r.note ? '　　' + r.note : ''}`);
  };
  if (['效果', '条件', '修正', '属性', '开局', '进度条'].some(t => used.has(t))) L.push('', '## 格子里的写法', '一个格子里写若干小项，用空格或换行隔开。四种样子：名字+数 / 名字-数（增减）、名字×数 或 名字≥数 / 名字≤数、名字:内容、单独一个词。先后顺序有意义：效果是从左到右依次执行的。', '下面每行是：写法　　对应的字段　　说明。中文关键字和英文字段名都认。');
  sect('效果', V.fx, '选了这个选项以后发生什么。');
  sect('条件', V.when, '几项条件要同时满足。');
  sect('修正', V.mods, '长期生效的倍率和加成。名字来自 设定.xlsx 的「修正」表。');
  sect('属性', V.attr, '创始人属性的增减。');
  sect('开局', V.start, '选了这个特质以后，开局时多带的东西。');
  sect('进度条', V.bars, '路线之争两条进度条的变化。');
  if (used.has('检定')) L.push('', '## 「检定」列怎么写', '空着 = 没有检定，直接出「结果」「效果」。', '    口才 14　　　　属性检定：难度 14，成功出「结果」「效果」，失败出「失败结果」「失败效果」。属性：技术、口才、管理、商业、人脉、运气', '    55%　　　　　　看运气：55% 的概率成功（运气属性会微调）');
  if (used.has('参数')) L.push('', '## 「参数」列怎么写', '给代码用的数字：名字=数，几个参数之间用空格隔开；一串数用逗号隔开。名字别改（代码按名字取），数随便调。', '    到账=5 期限=6', '    名次热度=30,20,13,9,6,4,3');
  return L;
}

// 读写表格工作簿（.xlsx）。
// 表头约定：第 1 行中文列名（给人看），第 2 行字段名（给程序用），第 3 行类型，第 4 行起是数据。
// 列名或字段名以 # 开头的列是备注列，导出时跳过（里面可以随便写，包括公式）；表名以 # 开头的整张表跳过。
// 第一格以 # 开头的行是注释行，也跳过。
import ExcelJS from 'exceljs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export const HEAD = 3;

export function colName(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; }

// 格子里的值 → 纯数据：公式取算好的结果，带格式的文字拼成普通文字；全是空白算空
export function plain(v) {
  if (v == null) return null;
  if (typeof v === 'string') { const s = v.replace(/_x000D_/g, '').replace(/\r\n?/g, '\n').trim(); return s === '' ? null : s; }
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return plain(v.richText.map(r => r.text).join(''));
    if ('result' in v) return plain(v.result);
    if ('formula' in v || 'sharedFormula' in v) return null;       // 公式还没算出结果
    if ('text' in v) return plain(v.text);                           // 超链接
    if ('error' in v) return null;
  }
  return String(v);
}

// 读一本工作簿 → { file, name, sheets: [{ name, cols: [{ c, title, key, type }], rows: [{ r, cells: { 字段: 值 } }] }] }
export async function readBook(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const sheets = [];
  wb.eachSheet(ws => {
    if (ws.name.startsWith('#')) return;
    const head = r => { const row = ws.getRow(r), out = []; for (let c = 1; c <= ws.columnCount; c++) { const v = plain(row.getCell(c).value); out[c] = v == null ? '' : String(v); } return out; };
    const titles = head(1), keys = head(2), types = head(3), cols = [];
    for (let c = 1; c <= ws.columnCount; c++) {
      if (!keys[c] || keys[c].startsWith('#') || titles[c].startsWith('#')) continue;
      cols.push({ c, title: titles[c], key: keys[c], type: types[c] });
    }
    const rows = [];
    for (let r = HEAD + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r), cells = {};
      let any = false;
      const first = plain(row.getCell(1).value);
      if (typeof first === 'string' && first.startsWith('#')) continue;
      for (const col of cols) {
        const cell = row.getCell(col.c);
        if (cell.isMerged && cell.master && cell.master.address !== cell.address) continue;     // 合并格只算左上角那一格
        const v = plain(cell.value);
        if (v != null) { cells[col.key] = v; any = true; }
      }
      if (any) rows.push({ r, cells });
    }
    sheets.push({ name: ws.name, cols, rows });
  });
  return { file, name: path.basename(file, '.xlsx'), sheets };
}

const FONT = '微软雅黑';
const BORDER = { style: 'thin', color: { argb: 'FFD5DAE3' } };
const box = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const WIDTH = { 标识: 20, 文本: 26, 整数: 9, 小数: 9, 是否: 8, 列表: 20, 多行: 34, 效果: 38, 条件: 30, 修正: 34, 属性: 20, 开局: 30, 进度条: 18, 检定: 11, JSON: 40, 备注: 22 };

// 写一本工作簿。sheets: [{ name, cols: [{ title, key, type, width?, note?, list?, formula? }], rows: [{ 字段: 值 }], freeze? }]
// readme: 字符串数组，写成第一张「#说明」表（# 开头的表导出时会跳过）
export async function writeBook(file, sheets, { readme } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = '炼丹大亨 tools/tables'; wb.created = wb.modified = new Date(Date.UTC(2026, 0, 1));
  wb.calcProperties.fullCalcOnLoad = true;
  if (readme) {
    const ws = wb.addWorksheet('#说明', { views: [{ showGridLines: false }] });
    ws.getColumn(1).width = 120;
    for (const line of readme) {
      const h = /^(#+) /.exec(line), row = ws.addRow([h ? line.slice(h[0].length) : line]), cell = row.getCell(1);
      cell.font = { name: FONT, size: h ? (h[1].length === 1 ? 14 : 11) : 10, bold: !!h, color: { argb: h ? 'FF1F2A44' : 'FF333333' } };
      cell.alignment = { vertical: 'top', wrapText: true };
    }
  }
  for (const sh of sheets) addSheet(wb, sh);
  await mkdir(path.dirname(file), { recursive: true });
  await wb.xlsx.writeFile(file);
}

// 迁移已有工作簿时也复用同一套三行表头和样式。
export function addSheet(wb, sh) {
    const ws = wb.addWorksheet(sh.name, { views: [{ state: 'frozen', xSplit: sh.freeze ?? 1, ySplit: HEAD }] });
    const cols = sh.cols;
    ws.columns = cols.map(c => {
      const long = c.type === '文本' && c.long, num = c.type === '整数' || c.type === '小数';
      return {
        width: c.width || (long ? 64 : WIDTH[c.type] || 22),
        style: { font: { name: FONT, size: 10 }, alignment: { vertical: 'top', wrapText: true, horizontal: num ? 'right' : 'left' }, ...(c.note_col ? { fill: fill('FFFFF8DC') } : {}) },
      };
    });
    const h1 = ws.addRow(cols.map(c => c.title)), h2 = ws.addRow(cols.map(c => c.key)), h3 = ws.addRow(cols.map(c => c.type));
    h1.height = 22;
    h1.eachCell(cell => { cell.font = { name: FONT, size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = fill('FF2F3B52'); cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; cell.border = box; });
    for (const hr of [h2, h3]) hr.eachCell(cell => { cell.font = { name: 'Consolas', size: 9, italic: hr === h3, color: { argb: 'FF5B6577' } }; cell.fill = fill('FFE8ECF3'); cell.alignment = { vertical: 'middle', horizontal: 'center' }; cell.border = box; });
    cols.forEach((c, i) => { if (c.note) h1.getCell(i + 1).note = c.note; });
    for (const rec of sh.rows) {
      const row = ws.addRow(cols.map(c => {
        if (c.formula) { const f = c.formula(ws.rowCount + 1, rec); return f ? { formula: f.formula, result: f.result ?? '' } : null; }
        const v = rec[c.key];
        return v === undefined ? null : v;
      }));
      row.eachCell({ includeEmpty: true }, cell => { cell.border = box; });
    }
    const last = Math.max(ws.rowCount, HEAD + 1) + 400;                       // 下拉框多留几百行，新加的行也能用
    cols.forEach((c, i) => {
      const list = c.list || (c.type === '是否' ? ['是', '否'] : null);
      if (!list || list.join(',').length > 250) return;
      const L = colName(i + 1);
      ws.dataValidations.add(`${L}${HEAD + 1}:${L}${last}`, { type: 'list', allowBlank: true, formulae: [`"${list.join(',')}"`], showErrorMessage: false });
    });
    ws.autoFilter = { from: { row: HEAD, column: 1 }, to: { row: HEAD, column: cols.length } };
    return ws;
}

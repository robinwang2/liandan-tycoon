// 已经跑过，不要再跑：只替换六个文案格，追加末位淘汰和监管满值两个参数。
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'node:url';

const months = 'N+{ideo.purge.relMonths}';
const edits = [
  ['设定', '路线', 'app', 'desc', '2 万用户，产品开发 +15%', '{start.usersApp} 万用户，产品开发 {dev.appMult:增}'],
  ['事件', '随机选项', 'poach_100m', 'hint', '-3% 股权', '{效果.股权}% 股权'],
  ['路线之争-深圳', '结局选项', 'purge', 'hint', 'N+3', months],
  ['路线之争-深圳', '结局选项', 'purge', 'text', 'N+3', months],
  ['文本', '路线之争', 'ideo.purge.release', 'text', 'N+3', months],
  ['文本', '路线之争', 'ideo.purge.hint.release', 'text', 'N+3', months],
];
for (const book of new Set([...edits.map(edit => edit[0]), '平衡参数'])) {
  const file = fileURLToPath(new URL(`../../../tables/${book}.xlsx`, import.meta.url));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  for (const [, sheetName, id, field, before, after] of edits.filter(edit => edit[0] === book)) {
    const sheet = workbook.getWorksheet(sheetName), col = sheet.getRow(2).values.indexOf(field), matches = [];
    sheet.eachRow(row => {
      const cell = row.getCell(col);
      if (row.getCell(1).value === id && typeof cell.value === 'string' && cell.value.includes(before)) matches.push(cell);
    });
    if (matches.length !== 1) throw new Error(`${book} › ${sheetName}（${id}）：应只匹配一格`);
    matches[0].value = matches[0].value.replace(before, after);
  }
  if (book === '平衡参数') {
    const sheet = workbook.getWorksheet('参数');
    for (const row of [
      ['ideo.yank.minDept', 2, '人', null, null, '部门至少有几人时才参加每月末位淘汰', '路线之争：末位淘汰'],
      ['reg.max', 100, '点', null, null, '监管压力的上限；达到满值时触发监管重锤（受冷却限制）', '监管压力、系统事件'],
    ]) sheet.addRow(row, 'i');
  }
  await workbook.xlsx.writeFile(file);
}

// 只替换工作簿的「#说明」表（内容取自 writeTables 生成到临时目录的候选表），其余表一格不动。build-xlsx --force 整本覆盖会丢掉 WPS 存过的打印设置，所以这次只换说明。已经跑过，不要再跑。
//   node tools/verify/migrations/readme-inplace.mjs <候选表目录> 设定.xlsx 行动.xlsx 事件.xlsx
import ExcelJS from 'exceljs';
const [, , candDir, ...files] = process.argv;
for (const f of files) {
  const cand = new ExcelJS.Workbook(); await cand.xlsx.readFile(`${candDir}/${f}`);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(`tables/${f}`);
  const src = cand.getWorksheet('#说明'), dst = wb.getWorksheet('#说明');
  const before = dst.rowCount;
  dst.spliceRows(1, dst.rowCount);
  src.eachRow({ includeEmpty: true }, (row, i) => { const c = dst.getRow(i).getCell(1), s = row.getCell(1); c.value = s.value; c.font = s.font; c.alignment = s.alignment; });
  dst.getColumn(1).width = src.getColumn(1).width;
  await wb.xlsx.writeFile(`tables/${f}`);
  console.log(f, before, '→', src.rowCount, '行');
}

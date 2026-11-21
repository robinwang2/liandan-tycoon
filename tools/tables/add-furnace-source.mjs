// 只追加新表；再次运行不覆盖已补全的提示词或人工验收状态。
import ExcelJS from 'exceljs';
import { rename } from 'node:fs/promises';
import path from 'node:path';
import { BOOKS } from './schema.mjs';
import { addSheet } from './lib/xlsx.mjs';

const book = BOOKS.find(book=>book.out==='art');
const schema = book.sheets.find(sheet=>sheet.name==='素材来源');
const file = path.resolve(import.meta.dirname,'../../tables',book.file);
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(file);
const row = { id:'furnace_tripo_run3', name:'办公室丹炉', source:'Tripo 专业版', method:'正交灰模四视图 → H3.1 几何（30）→ 文字贴图 2K（10）',
  prompt:"Stylized toy-like ancient Chinese bronze alchemy cauldron (ding). Warm aged bronze body with subtle green patina, polished gold round studs on the belly band, small bronze rivets, darker bronze legs and handles, octagonal dark stone base with faint carved trigram symbols. Clean game-asset look, soft hand-painted feel, no text, no logos.", credits:40, date:'2026-11-21',
  license:'私有 · 可商用；生成时选私有；据制作者当日核对官网定价页（2026-11-21）：Private Models · Commercial Use',
  file:'art-src/tripo/run3/furnace-tripo.glb', qc:'原模 39321 面，宽×深×高 0.9808×0.9804×0.8892 m；规范化 2.7699×2.7688×2.511 m，三级 39321/15727/4717 面，1 张 2048² 底色图。',
  status:"Blender 回读通过；Unity 白盒办公室截图验收通过（不透明 + 双面，金属度 0.25 / 光滑度 0.32）" };
let sheet = workbook.getWorksheet(schema.name);
if (sheet) {
  const keys = sheet.getRow(2).values.slice(1);
  if (JSON.stringify(keys)!==JSON.stringify(schema.cols.map(col=>col.key))) throw Error('已有素材来源表列不同，请手动合并');
  if (sheet.getColumn(1).values.includes(row.id)) { console.log('已有丹炉记录，保留原值'); process.exit(0); }
  sheet.addRow(keys.map(key=>row[key]));
} else sheet = addSheet(workbook,{...schema, rows:[row]});
sheet.lastRow.height = 82;
const tmp = file+'.'+process.pid+'.tmp';
await workbook.xlsx.writeFile(tmp);
await rename(tmp,file);
console.log('已追加丹炉来源记录，保留其他工作表');

// ExcelJS 仅读索引。写入时只替换目标 worksheet 的本批数据行；其他 ZIP 部件原样复制。
import Excel from 'exceljs';
import Zip from 'jszip';
import { SaxesParser } from 'saxes';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

function tags(xml,name) {
  const found=[], parser=new SaxesParser(); parser.on('opentag',tag=>{if(tag.name===name)found.push(tag.attributes);});parser.write(xml).close(); return found;
}
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export async function writeSources(file,rows) {
  const original=await fs.readFile(file), zip=await Zip.loadAsync(original), book=new Excel.Workbook(); await book.xlsx.load(original);
  const sheet=book.getWorksheet('素材来源'), keys=sheet?.getRow(2).values.slice(1);
  if(keys?.join(',')!=='id,name,source,method,prompt,credits,date,license,file,qc,status') throw Error('素材来源表头已变，请人工合并');
  const rid=tags(await zip.file('xl/workbook.xml').async('string'),'sheet').find(sheet=>sheet.name==='素材来源')['r:id'];
  const target=tags(await zip.file('xl/_rels/workbook.xml.rels').async('string'),'Relationship').find(link=>link.Id===rid).Target;
  const member=path.posix.resolve('/xl',target).slice(1); let xml=await zip.file(member).async('string'), next=sheet.rowCount;
  const byId=new Map();sheet.eachRow((row,n)=>{if(n>3){if(byId.has(row.getCell(1).text))throw Error('素材来源 ID 重复');byId.set(row.getCell(1).text,n);}});
  const before=xml;
  for(const data of rows) {
    const existing=byId.get(data.id), index=existing??++next;
    const rowPattern=new RegExp(`<row\\b(?=[^>]*\\br="${index}")[^>]*>[\\s\\S]*?</row>`);
    const previous=existing?xml.match(rowPattern)?.[0]:null;
    if(existing && !previous)throw Error('无法定位现有行 '+index);
    if(previous && !previous.includes('s="undefined"') && keys.every((key,col)=>data[key]===undefined || sheet.getCell(index,col+1).value===data[key]))continue;
    const cells=keys.map((key,col)=>{
      const template=sheet.getCell(existing??4,col+1),value=data[key]??(existing?template.value:null);
      if(value==null) return ''; if(typeof value!=='string'&&typeof value!=='number')throw Error('本批行含非文本/数值单元格，拒绝覆盖');
      const column=String.fromCharCode(65+col), address=column+index;
      const styleOf=(text,n)=>text?.match(new RegExp(`<c r="${column}${n}"[^>]*? s="(\\d+)"`))?.[1];
      const style=styleOf(previous,index)??styleOf(xml,4)??0;
      return typeof value==='number'?`<c r="${address}" s="${style}"><v>${value}</v></c>`:`<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escape(value)}</t></is></c>`;
    }).join('');
    const row=`<row r="${index}" ht="82" customHeight="1">${cells}</row>`;
    if(existing){const match=new RegExp(`<row\\b(?=[^>]*\\br="${index}")[^>]*>[\\s\\S]*?</row>`);if(!match.test(xml))throw Error('无法定位现有数据行 '+index); xml=xml.replace(match,()=>row);}
    else xml=xml.replace('</sheetData>',()=>row+'</sheetData>');
  }
  if(xml===before){console.log('台账无需更新');return;}
  xml=xml.replace(/(<dimension ref="A1:K)\d+/,(_,prefix)=>prefix+next).replace(/(<autoFilter ref="A3:K)\d+/,(_,prefix)=>prefix+next);
  zip.file(member,xml); const tmp=file+'.'+randomUUID()+'.tmp';
  try {await fs.writeFile(tmp,await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'})); if(!(await fs.readFile(file)).equals(original))throw Error('工作簿已被其他程序修改，取消写入');await fs.rename(tmp,file);}finally{await fs.rm(tmp,{force:true});}
  console.log('已更新素材来源；其他工作表未改动');
}

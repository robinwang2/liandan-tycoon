// 为所有已交付道具的材质分格。每格独立缩放，边缘扩张防 mip 串色；UV 矩形从左下起算。
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..'), assets=path.join(root,'unity/Game/Assets/Art/Props');
const out=path.join(assets,'BatchAtlas/Resources/BatchAtlas');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const entries=[];
for(const {id} of read(path.join(root,'unity/Game/Assets/Shell/Resources/PropPolicy.json')).props){
  const dir=path.join(assets,id,'Resources/Batch1',id), report=path.join(dir,'report.json'); if(!fs.existsSync(report))continue;
  const fingerprint=createHash('sha256').update(fs.readFileSync(report)).digest('hex');
  for(const mat of read(report).materials)entries.push({id,name:mat.name,file:mat.BaseColor && path.join(dir,mat.BaseColor),color:mat.baseColor,fingerprint});
}
if(!entries.length)throw Error('请先 ingest 至少一件道具');
const side=2048, cell=512, pad=8, inner=cell-pad*2, tiles=[]; fs.mkdirSync(out,{recursive:true});
for(let start=0;start<entries.length;start+=16){
  const page=start/16, layers=[];
  for(const [index,entry] of entries.slice(start,start+16).entries()){
    const left=index%4*cell,top=Math.floor(index/4)*cell;
    const srgb=entry.color.slice(0,3).map(value=>Math.round(255*(value<=.0031308?value*12.92:1.055*Math.pow(value,1/2.4)-.055)));
    const image=entry.file?sharp(entry.file):sharp({create:{width:1,height:1,channels:3,background:{r:srgb[0],g:srgb[1],b:srgb[2]}}});
    const input=await image.removeAlpha().resize(inner,inner,{fit:'fill'}).extend({left:pad,right:pad,top:pad,bottom:pad,extendWith:'copy'}).png().toBuffer();
    layers.push({input,left,top}); tiles.push({name:entry.name,id:entry.id,fingerprint:entry.fingerprint,page,x:(left+pad)/side,y:1-(top+cell-pad)/side,size:inner/side});
  }
  await sharp({create:{width:side,height:side,channels:3,background:'white'}}).composite(layers).png().toFile(path.join(out,`page${page}_BaseColor.png`));
}
fs.writeFileSync(path.join(out,'layout.json'),JSON.stringify({tiles},null,2));console.log(`${entries.length} 个材质 → ${Math.ceil(entries.length/16)} 张 2048² 图集：${out}`);

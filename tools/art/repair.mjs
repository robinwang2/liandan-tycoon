import { batchOptions } from './batch-options.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';

const { args:[id,...extra], batchName, policy }=batchOptions(process.argv.slice(2));
const root=path.resolve(import.meta.dirname,'../..');
const selection=JSON.parse(fs.readFileSync(path.join(root,'unity/Game/Assets/Shell/Resources',policy+'.json'),'utf8'));
if (!selection.props.some(item=>item.id===id)) throw Error(batchName+' 未收录：'+id);
if(!['server_rack','tv_wall'].includes(id) || extra.length) throw Error('用法：node tools/art/repair.mjs server_rack | tv_wall');
const folder=path.join(root,'art-src/tripo',batchName,id);
const reference=path.join(root,'unity/Game/Assets/Art/Props',id,'Editor/RepairReference');
for(const [script,...args] of [[id,folder],['compare',folder,reference]]){
  const run=spawnSync(process.env.BLENDER||'D:/SteamLibrary/steamapps/common/Blender/blender.exe',['-b','--factory-startup','--python-exit-code','1','-P',path.join(import.meta.dirname,'repair',script+'.py'),'--',...args],{stdio:'inherit',windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8'}});
  if(run.error || run.status!==0)throw run.error??Error('Blender 未完成：'+script);
}
const tiles=[], width=480, height=420, inset=116, head=46;
let labels='';
function label(x,y,text){labels+=`<text x="${x}" y="${y}" fill="#e6eef3" font-family="Microsoft YaHei,sans-serif" font-size="21">${text}</text>`;}
for(const [row,[model,caption]] of [['game','程序原模'],['tripo','AI 原件'],['repaired','修补后']].entries()){
  label(12,head+height*(row+.5),caption);
  for(const [col,[view,title]] of [['front','正面'],['left','左侧'],['right','右侧'],['back','背面'],['close','正面近景']].entries()){
    if(!row)label(inset+width*(col+.45),32,title);
    tiles.push({input:path.join(folder,'repair-views',`${model}-${view}.png`),left:inset+width*col,top:head+height*row});
  }
}
const canvas={width:inset+width*5,height:head+height*3};
tiles.push({input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">${labels}</svg>`),top:0,left:0});
await sharp({create:{...canvas,channels:3,background:'#243441'}}).composite(tiles).png().toFile(path.join(folder,'repair-compare.png'));
console.log(id,fs.readFileSync(path.join(folder,'repair-metrics.json'),'utf8'));

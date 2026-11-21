import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// 统计实际发布目录。Unity 的调试、备份目录由构建系统明确标为不随包分发。
function inventory(root) {
  const files={};
  function visit(dir, prefix) {
    for(const entry of readdirSync(dir,{withFileTypes:true})){
      const key=prefix+entry.name, path=join(dir,entry.name);
      if(entry.isDirectory()) { if(!/DoNotShip|DontShipItWithYourGame/i.test(entry.name)) visit(path,key+'/'); }
      else if(entry.isFile()) files[key]=statSync(path).size;
    }
  }
  if(!existsSync(join(root,'Liandan.exe')) || !existsSync(join(root,'Liandan_Data','StreamingAssets','tables','audio.json')))throw Error('请选择完整的 Liandan 播放器目录');
  visit(root,'');
  return {backend:files['GameAssembly.dll']?'IL2CPP':'Mono',unity:createHash('sha256').update(readFileSync(join(root,'UnityPlayer.dll'))).digest('hex'),files};
}
function report(current, before){
  if(before && (current.backend!==before.backend || current.unity!==before.unity))throw Error('两次构建的后端或 UnityPlayer.dll 不一致');
  const old=before?.files||{}, files=current.files;
  const paths=[...new Set([...Object.keys(old),...Object.keys(files)])].sort();
  const sum=(values)=>values.reduce((a,b)=>a+b,0);
  const rows=paths.filter(p=>/\/(Assembly-CSharp|Kernel)\.dll$|audio\.json$|GameAssembly\.dll$|global-metadata\.dat$|\.(wav|ogg|mp3|aif|aiff|flac)$/i.test(p));
  const changedDll=paths.filter(p=>p.endsWith('.dll') && before && !(p in old));
  const totals=(p)=>files[p]||0;
  function line(label,n,b){console.log(`${label}  ${n} B`+(before?`  (${n-b>=0?'+':''}${n-b} B)`:''));}
  console.log(current.backend); for(const path of new Set([...rows,...changedDll]))line(path,totals(path),old[path]||0);
  if(before)console.log('新增 DLL：'+(changedDll.join('、')||'无'));
  line('分发文件合计',sum(Object.values(files)),sum(Object.values(old)));
}
try {
  const [path,option,file,...rest]=process.argv.slice(2);
  if(!path || (option && (!['--save','--against'].includes(option)||!file)) || rest.length)throw Error('用法：build-size.mjs <播放器目录> [--save <清单.json> | --against <基线.json>]');
  const now=inventory(resolve(path)); report(now,option==='--against'?JSON.parse(readFileSync(file,'utf8')):null);
  if(option==='--save')writeFileSync(file,JSON.stringify(now,null,2)+'\n',{flag:'wx'});
} catch(err){console.error(err.message);process.exitCode=1;}

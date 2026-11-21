import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 用同一组播放器编译参数比较托管代码尺寸。源码、DLL、PDB 都写到临时目录。
// 读取已构建工程的 Bee 引用；只执行 Roslyn，不触发 Unity 导入、裁剪或原生链接。
const root=fileURLToPath(new URL('../../',import.meta.url)), project=resolve(process.env.UNITY_PROJECT||join(root,'unity/Game'));
const baseline=process.argv[2]||'48b2f18';
function git(args){return execFileSync('git',args,{cwd:root});}
function measure(out,rev,cache,compiler,dotnet){
  mkdirSync(out);
  const result={};
  for(const [assembly,dirs] of [['Kernel',['unity/Kernel']],['Assembly-CSharp',['unity/Game/Assets/Parity','unity/Game/Assets/Shell']]]){
    const list=git(rev?['ls-tree','-r','--name-only','-z',rev,'--',...dirs]:['ls-files','--cached','--others','--exclude-standard','-z','--',...dirs]);
    const sources=[];
    for(const file of list.toString().split('\0').sort()){
      if(!file.endsWith('.cs') || file.includes('/Editor/'))continue;
      const path=join(rev?out:root,file);
      if(rev){mkdirSync(dirname(path),{recursive:true});writeFileSync(path,git(['show',`${rev}:${file}`]));}
      if(existsSync(path))sources.push(`"${path}"`);
    }
    const options=readFileSync(join(cache,assembly+'.rsp'),'utf8').replace(/^\uFEFF/,'').split(/\r?\n/)
      .filter(line=>line && !/^("|-out:|-refout:)/.test(line))
      .map(line=>line.includes('/Kernel.ref.dll"')?`-r:"${join(out,'Kernel.dll')}"`:line);
    const dll=join(out,assembly+'.dll'), rsp=join(out,assembly+'.rsp');
    writeFileSync(rsp,[...options,`-out:"${dll}"`,...sources].join('\n'));
    execFileSync(dotnet,[compiler,'@'+rsp],{cwd:project}); result[assembly]=statSync(dll).size;
  }
  return result;
}
try{
  const rev=git(['rev-parse','--verify','--end-of-options',baseline+'^{commit}']).toString().trim();
  const dir=join(project,'Library/Bee/artifacts');
  const cache=readdirSync(dir).filter(name=>name.endsWith('P.dag')).map(name=>join(dir,name)).filter(path=>existsSync(join(path,'Assembly-CSharp.rsp')) && existsSync(join(path,'Kernel.rsp')))
    .sort((a,b)=>statSync(join(b,'Assembly-CSharp.rsp')).mtimeMs-statSync(join(a,'Assembly-CSharp.rsp')).mtimeMs)[0];
  if(!cache)throw Error('找不到播放器 Bee 编译参数，请在已构建的工程中测量');
  const editor=dirname(process.env.UNITY_EXE||String.raw`D:\Unity edititor\6000.5.2f1\Editor\Unity.exe`);
  const sdk=join(editor,'Data/DotNetSdk'), versions=readdirSync(join(sdk,'sdk'));
  const compiler=versions.map(name=>join(sdk,'sdk',name,'Roslyn/bincore/csc.dll')).find(existsSync);
  if(!compiler)throw Error('找不到 Unity 附带的 Roslyn 编译器');
  const temp=mkdtempSync(join(tmpdir(),'liandan-il-'));
  try{
    const run=(name,ref)=>measure(join(temp,name),ref,cache,compiler,join(sdk,'dotnet.exe'));
    const a=run('baseline',rev), b=run('working',null); let total=0;
    for(const name of Object.keys(a)){const delta=b[name]-a[name]; total+=delta; console.log(`${name}.dll  ${a[name]} → ${b[name]} B，差额 ${delta} B`);}
    console.log(`托管代码合计差额 ${total} B（${(total/1024).toFixed(1)} KiB），基线 ${rev.slice(0,7)}`);
  }finally{rmSync(temp,{recursive:true,force:true});}
}catch(err){console.error(err.stdout?.toString()||err.message);process.exitCode=1;}

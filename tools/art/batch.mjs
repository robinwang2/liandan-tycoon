// 第 1 批：政策只存选件与场景例外，库道具的尺寸和预算始终读表。
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { writeSources } from './batch-ledger.mjs';

const root = path.resolve(import.meta.dirname,'../..');
const inputArgs = process.argv.slice(2), [command,...args] = inputArgs;
const local = path.join(root,'art-src/tripo/batch1'), assets = path.join(root,'unity/Game/Assets/Art/Props');
const read = file => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')) : null;
function save(file,value) {
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temp = file+'.'+randomUUID()+'.tmp';
  fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n'); fs.renameSync(temp,file);
}
const hash = file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const specs = read(path.join(root,'src/data/tables/art.json')).PROPS;
const batch = read(path.join(root,'unity/Game/Assets/Shell/Resources/PropPolicy.json')).props.map(entry=>{
  const spec = {...entry,...specs.find(row=>row.id===entry.id)};
  if (![spec.w,spec.d,spec.h,spec.budget].every(num=>num>0)) throw Error('缺少道具规格：'+entry.id);
  return spec;
});
const views = ['front','left','right','back'];
const ledgerFile = path.join(local,'ledger.json'), ledger=read(ledgerFile)??{};
const shots = path.join(root,'unity/Game/Build/art-batch1');
function paths(id,repaired=false) {
  const dir=path.join(local,id), ref=path.join(dir,'ref'), dest=path.join(assets,id,'Resources/Batch1',id);
  return {dir,ref,dest,game:path.join(dir,'game.glb'),source:path.join(dir,repaired?'repaired.glb':'tripo.glb'),qc:path.join(dir,repaired?'repair-qc':'qc'),report:path.join(dest,'report.json')};
}
function tool(script,...params) {
  const result=spawnSync(process.execPath,[path.join(import.meta.dirname,script+'.mjs'),...params.map(String)],{cwd:root,stdio:'inherit',windowsHide:true});
  // 质检已出具不合格报告，让调用处记录具体面号，不当作 Blender 启动失败。
  if(script==='qc' && result.status===2) return;
  if(result.error || result.status!==0) throw result.error??Error(script+' 未完成');
}
function chosen(id) { const item=batch.find(prop=>prop.id===id); if(!item) throw Error('不是第 1 批 ID：'+id); return item; }
function prepared(p) { return fs.existsSync(p.game) && views.every(view=>fs.existsSync(path.join(p.ref,view+'.png'))) && read(path.join(p.ref,'report.json'))?.sha===hash(p.game); }
function manifest() {
  save(path.join(local,'upload.json'),batch.filter(item=>prepared(paths(item.id))).map(({id,name,w,d,h,budget})=>({id,name,w,d,h,budget,
    views:Object.fromEntries(views.map(view=>[view,path.join(paths(id).ref,view+'.png')])),tripoSlots:{正面:'front.png',左侧:'right.png',右侧:'left.png',背面:'back.png'},settings:'按 tripoSlots 填网页格子，不按文件名同名上传。私有；H3.1 四视图，正面 +Z；先审轮廓，再生成微缩玩具风底色，普通 1K / 大件最多 2K；下载 GLB。不要烘焙文字或灯光。'})));
}
function state(item) {
  const original=paths(item.id), report=read(original.report), repaired=report?.source==='repaired.glb', p=paths(item.id,repaired);
  const download=read(path.join(p.dir,'download.json')), stamp=repaired?report:download, qc=read(path.join(p.qc,'report.json'));
  const downloaded=fs.existsSync(original.source), current=downloaded && download?.sha===hash(original.source) && (!repaired || report.originalSha===download.sha) && fs.existsSync(p.source) && stamp?.sha===hash(p.source);
  const inspected=current && fs.existsSync(p.game) && qc?.sha===stamp.sha && qc.refSha===hash(p.game);
  const normal=inspected && qc.pass && report?.sha===stamp.sha && report.refSha===qc.refSha && !!qc.mirrorDepth===!!report.mirrorDepth && fs.existsSync(path.join(p.dest,report.model));
  const receipt=normal && read(path.join(shots,item.id+'.json'));
  return {prep:prepared(p),downloaded, qc:inspected?qc:null,report:normal?report:null,accepted:!!receipt && receipt.reportSha===hash(p.report) && fs.existsSync(path.join(shots,item.id+'.png'))};
}
async function ingest(item,file,mirrorDepth) {
  const repaired=path.basename(file)==='repaired.glb', p=paths(item.id,repaired); if(!prepared(p)) throw Error('请先 prep '+item.id);
  const incoming=path.resolve(file); if(path.extname(incoming).toLowerCase()!=='.glb' || !fs.statSync(incoming).isFile()) throw Error('需要下载的 GLB 文件');
  const sha=hash(incoming), refSha=hash(p.game);
  if(repaired && (incoming!==p.source || read(path.join(p.dir,'download.json'))?.sha!==hash(paths(item.id).source))) throw Error('修补件须与已登记的原件同目录；不能替换下载件');
  if(incoming!==p.source) {
    if(incoming===p.game) throw Error('不能把游戏原模当下载件');
    if(fs.existsSync(p.source)) fs.renameSync(p.source,path.join(p.dir,'previous-'+randomUUID()+'.glb'));
    fs.copyFileSync(incoming,p.source,fs.constants.COPYFILE_EXCL);
    if(hash(p.source)!==sha) throw Error('下载件复制校验失败，保留原件'); fs.unlinkSync(incoming);
  }
  if(!repaired) save(path.join(p.dir,'download.json'),{sha,refSha});
  try { tool('qc',p.source,'--out',p.qc,'--ref',p.ref,'--height',item.h,'--silhouette',...(repaired?['--budget',item.budget]:[]),...(repaired&&item.id==='server_rack'?['--rack-clearance']:[]),...(mirrorDepth?['--mirror-depth']:[])); }
  catch(error) {save(path.join(p.qc,'report.json'),{sha,refSha,pass:false,problems:['模型读取或四视图渲染失败：'+error.message]});throw error;}
  const result=read(path.join(p.qc,'report.json')), reference=read(path.join(p.ref,'report.json'));
  // Tripo 原件未定标，按高比较原模的宽深比；LOD0 预算在减面后硬验。
  for(const axis of ['width','depth']) {
    const ratio=(result.size[axis]/result.size.height)/(reference.size[axis]/reference.size.height);
    if(!Number.isFinite(ratio)||ratio<0.7||ratio>1.3) result.problems.push(`${axis}/高度偏离网页原模超过 30%（比值 ${ratio.toFixed(2)}）`);
  }
  if(!Object.keys(result.textures).length) result.problems.push('下载件没有贴图，请下载贴图版 GLB');
  result.pass=!result.problems.length; Object.assign(result,{sha,refSha});save(path.join(p.qc,'report.json'),result);
  if(!result.pass) throw Error(result.problems.join('；')+'；见 '+p.qc);
  console.log('四视图 IoU（'+(mirrorDepth?'深度镜像':'原样')+'）：',result.silhouetteIoU);
  deliver(item,p,mirrorDepth,sha,refSha);
}
function deliver(item,p,mirrorDepth,sha,refSha) {
  const stage=fs.mkdtempSync(path.join(p.dir,'normalized-'));
  tool('normalize',p.source,'--out',stage,'--name',item.id,'--width',item.w,'--depth',item.d,'--height',item.h,'--origin',item.origin,'--budget',item.budget,'--qc',path.join(p.dir,'lod-qc'),'--ref',p.ref,'--res',512,...(mirrorDepth?['--mirror-depth']:[]));
  const report=read(path.join(stage,'report.json'));
  if(mirrorDepth) {
    const check=path.join(p.dir,'verified-lod0');
    tool('qc',path.join(stage,report.model),'--lod',0,'--out',check,'--ref',p.ref,'--silhouette');
    const actual=read(path.join(check,'report.json'));
    if(!actual.pass) throw Error('修正后 LOD0 回读失败：'+actual.problems.join('；'));
    report.verifiedSilhouetteIoU=actual.silhouetteIoU;
  }
  if(!report.materials.some(mat=>mat.BaseColor)) throw Error('没有可用的 BaseColor，保留上一次交付');
  if(report.source==='repaired.glb') Object.assign(report,{originalSha:hash(paths(item.id).source),repairMethod:'AI 外壳 + 程序化修补',repairCredits:0});
  Object.assign(report,{sha,refSha}); save(path.join(stage,'report.json'),report);
  fs.mkdirSync(p.dest,{recursive:true});
  // 不替换文件夹和已有 .meta，保留已有 Unity 引用；FBX 最后复制。
  for(const name of [...fs.readdirSync(stage).filter(name=>name!==report.model),report.model]) fs.copyFileSync(path.join(stage,name),path.join(p.dest,name));
  console.log('已规范化：'+p.dest);
}
try {
  if(command==='prep' && args.join(' ')==='--manifest-only') manifest();
  else if(command==='prep') {
    if(!fs.existsSync(ledgerFile)) save(ledgerFile,{});
    for(const item of args.length?args.map(chosen):batch) {
      const p=paths(item.id); tool('export-scene-glb',item.id,p.game);
      tool('qc',p.game,'--out',p.ref,'--flat','--bg',1,'--views',views.join(','));
      const reportFile=path.join(p.ref,'report.json');save(reportFile,{...read(reportFile),sha:hash(p.game)});manifest();
    }
    console.log('上传清单：'+path.join(local,'upload.json'));
  } else if(command==='ingest' && (args.length===2 || (args.length===3 && args.includes('--mirror-depth')))) {
    const [id,file]=args.filter(arg=>arg!=='--mirror-depth'); await ingest(chosen(id),file,args.includes('--mirror-depth'));
  }
  else if(command==='reexport') {
    for(const item of args.length?args.map(chosen):batch){
      const p=paths(item.id);
      if(!args.length && !fs.existsSync(p.report) && !fs.existsSync(p.source)) continue;
      const {report}=state(item);
      if(!report) throw Error(item.id+'：原件、参考图或交付报告不匹配，请先 ingest');
      deliver(item,paths(item.id,report.source==='repaired.glb'),report.mirrorDepth,report.sha,report.refSha);
    }
  }
  else if(command==='credit' && args.join(' ')==='--from-notes') {
    const notes=read(path.join(local,'credits-notes.json'));
    for(const {id} of batch) {
      const entry=notes?.[id];
      if(!entry || ![entry.credits,entry.rework].every(n=>Number.isSafeInteger(n)&&n>=0) || typeof entry.note!=='string') throw Error('缺少有效的实测记录：'+id);
      ledger[id]={...ledger[id],source:'Tripo Studio 网页（H3.1，私有四视图）',credits:entry.credits,reworks:entry.rework,note:entry.note};
    }
    save(ledgerFile,ledger);
  } else if(command==='credit' && args.length>=2) {
    const {id}=chosen(args[0]), points=Number(args[1]); if(!/^\d+$/.test(args[1])||!Number.isSafeInteger(points)) throw Error('积分须为非负整数（累计实耗）');
    ledger[id]={reworks:0,...ledger[id],credits:points,...(args.length>2?{note:args.slice(2).join(' ')}:{})}; save(ledgerFile,ledger);
  } else if(command==='status' && !args.length) console.table(batch.map(item=>{const s=state(item), entry=ledger[item.id]; return {id:item.id,底图:s.prep,下载:s.downloaded,质检:s.qc?(s.qc.pass?(s.qc.mirrorDepth?'深度镜像通过':'通过'):s.qc.problems.join('；')):'—',规范化:!!s.report,Unity:s.accepted,积分:entry?.credits??'—',返工:entry?.reworks??'—',状态:deliveryStatus(s,entry)};}));
  else if(command==='ledger') {
    const rows=(args.length?args.map(chosen):batch).map(item=>{
      const {id,name}=item,s=state(item),e=ledger[id]??{},repaired=s.report?.source==='repaired.glb';
      const method=[e.method,e.reworks!=null?'返工 '+e.reworks+' 次':null,e.note,repaired?'AI 外壳 + 程序化修补；本地追加 0 积分':null].filter(Boolean).join('；');
      return {id:'batch1_'+id,name,source:e.source,method:method||undefined,prompt:e.prompt,date:e.date,license:e.license,credits:e.credits,
        file:s.downloaded?`art-src/tripo/batch1/${id}/${repaired?'repaired':'tripo'}.glb`:undefined,
        qc:s.qc?(s.qc.size?`${repaired?'修补件':'下载件'} ${s.qc.triangles} 面，宽深高 ${Object.values(s.qc.size).join('×')} m；`:'')+(s.qc.pass?(s.qc.mirrorDepth?'深度镜像通过':'通过'):s.qc.problems.join('；'))+(s.report?'；LOD '+s.report.lods.map(lod=>lod.triangles).join('/'):''):(e.status&&!s.downloaded?'未下载，未做网格质检':'待检'),status:deliveryStatus(s,e)};
    });
    await writeSources(path.join(root,'tables/美术.xlsx'),rows);
  } else throw Error('用法：batch.mjs prep [id... | --manifest-only] | ingest <id> <下载或同目录 repaired.glb 的路径> [--mirror-depth] | reexport [id...] | credit --from-notes | credit <id> <累计积分> [备注] | status | ledger [id...]');
} catch(error) { console.error(error.message); process.exitCode=1; }

function deliveryStatus(s,entry) {
  if(s.report?.source==='repaired.glb') return '本地修补及三级回读通过；待 Unity 人工验收';
  return entry?.status ?? (s.accepted?'Unity 已生成截图；待人工验收':s.report?'FBX 回读通过；待 Unity 验收':s.qc?.pass?'下载件通过；尚无匹配的正式 FBX':s.downloaded?'已下载':s.prep?'已备上传图':'计划中');
}

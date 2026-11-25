// 各批次：政策只存选件与场景例外，库道具的尺寸和预算始终读表。
import { batchOptions } from './batch-options.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { writeSources } from './batch-ledger.mjs';

const root = path.resolve(import.meta.dirname,'../..');
const { args: [command,...args], batchName, resource, policy } = batchOptions(process.argv.slice(2));
const withColor = batchName !== 'batch1';
// 前三批沿用原先的取景和下载件处理，以便复现已交付结果。
const legacyBatch = ['batch1','batch2','batch3'].includes(batchName);
const isHybrid = item => !!item.parts?.length;
const local = path.join(root,'art-src/tripo',batchName), assets = path.join(root,'unity/Game/Assets/Art/Props');
const read = file => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')) : null;
function save(file,value) {
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temp = file+'.'+randomUUID()+'.tmp';
  fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n'); fs.renameSync(temp,file);
}
const hash = file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const specs = read(path.join(root,'src/data/tables/art.json')).PROPS;
const selection = read(path.join(root,'unity/Game/Assets/Shell/Resources',policy+'.json'));
const batch = selection.props.map(entry=>{
  const spec = {...entry,...specs.find(row=>row.id===entry.id)};
  if (![spec.w,spec.d,spec.h,spec.budget].every(num=>num>0)) throw Error('缺少道具规格：'+entry.id);
  return spec;
});
const views = ['front','left','right','back'];
const ledgerFile = path.join(local,'ledger.json'), ledger=read(ledgerFile)??{};
const shots = path.join(root,'unity/Game/Build/art-'+batchName);
function paths(id,repaired=false) {
  const dir=path.join(local,id), ref=path.join(dir,'ref'), dest=path.join(assets,id,'Resources',resource,id);
  return {dir,ref,dest,game:path.join(dir,'game.glb'),source:path.join(dir,repaired?'repaired.glb':'tripo.glb'),qc:path.join(dir,repaired?'repair-qc':'qc'),report:path.join(dest,'report.json')};
}
function tool(script,...params) {
  const result=spawnSync(process.execPath,[path.join(import.meta.dirname,script+'.mjs'),...params.map(String)],{cwd:root,stdio:'inherit',windowsHide:true});
  // 质检已出具不合格报告，让调用处记录具体面号，不当作 Blender 启动失败。
  if(script==='qc' && result.status===2) return;
  if(result.error || result.status!==0) throw result.error??Error(script+' 未完成');
}
function chosen(id) { const item=batch.find(prop=>prop.id===id); if(!item) throw Error(batchName+' 未收录：'+id); return item; }
function prepared(item,p) {
  const report = read(path.join(p.ref,'report.json'));
  const shell = path.join(p.dir,'shell.glb');
  return fs.existsSync(p.game) && views.every(view=>fs.existsSync(path.join(p.ref,view+'.png'))) &&
    (!withColor || fs.existsSync(path.join(p.ref,'color.png'))) && report?.sha===hash(p.game) &&
    (legacyBatch || report.tightFrame === true) &&
    (!isHybrid(item) || (fs.existsSync(shell) && report.shellSha===hash(shell)));
}
function manifest() {
  const entries=batch.filter(item=>prepared(item,paths(item.id))).map(({id,name,w,d,h,budget})=>({id,name,w,d,h,budget,
    views:Object.fromEntries(views.map(view=>[view,path.join(paths(id).ref,view+'.png')])),tripoSlots:{正面:'front.png',左侧:'right.png',右侧:'left.png',背面:'back.png'},settings:'按 tripoSlots 填网页格子，不按文件名同名上传。私有；H3.1 四视图，正面 +Z；先审轮廓，再生成微缩玩具风底色，普通 1K / 大件最多 2K；下载 GLB。不要烘焙文字或灯光。'}));
  if (withColor) {
    const lines = ['# '+batchName+' 网页上传清单', '', '私有 · H3.1 多视图。先核对几何正反与轮廓，再选图片贴图，上传彩色参考。'];
    if (selection.creditLimit) {
      const first = batch.filter(item=>!item.reserve).length;
      const remaining = first < batch.length ? '候补与返工共用剩余' : '返工可用';
      lines.push('', `首轮 ${first} 件 × 40＝${first*40} 分（几何 30＋图片贴图 10）。${remaining} ${selection.creditLimit-first*40} 分，全批上限 ${selection.creditLimit}。`);
    }
    for (const entry of entries) {
      entry.color = path.join(paths(entry.id).ref,'color.png');
      lines.push('', '## '+entry.name+'（'+entry.id+'）','');
      const item=chosen(entry.id);
      if(selection.creditLimit) {
        entry.reserve=!!item.reserve;
        lines.push(item.reserve ? '候补，首轮请跳过。' : '首轮上传。', '');
      }
      if(isHybrid(item)) {
        entry.shell=item.shell;
        lines.push('仅生成一件：'+item.shell+'。四张灰图用于几何，彩图用于图片贴图。','');
      }
      for (const [slot,file] of Object.entries(entry.tripoSlots)) lines.push('- '+slot+'　`'+path.join(paths(entry.id).ref,file)+'`');
      lines.push('- 图片贴图　`'+entry.color+'`');
      entry.settings='按 tripoSlots 上传四向灰模，审几何后用 color 路径做图片贴图。';
    }
    fs.mkdirSync(local,{recursive:true});
    fs.writeFileSync(path.join(local,'upload.md'),lines.join('\n')+'\n');
  }
  save(path.join(local,'upload.json'),entries);
}
// 选件表 replacement：整件改用第三方模型（如 CC0 的 ficus），不走 Tripo 下载件。
function replacementState(item) {
  const r=item.replacement, p=paths(item.id), report=read(p.report), blend=path.join(root,r.blend);
  const normal=!!report && report.replacement===r.name && fs.existsSync(blend) && report.blendSha===hash(blend) &&
    report.sha===hash(path.join(p.dir,r.name,'lod0.glb')) && fs.existsSync(path.join(p.dest,report.model));
  const qc=normal?{pass:true,triangles:report.lods[0].triangles,size:report.lods[0].size,problems:[]}:null;
  const receipt=normal && read(path.join(shots,item.id+'.json'));
  return {prep:true,downloaded:fs.existsSync(blend),qc,report:normal?report:null,accepted:!!receipt && receipt.reportSha===hash(p.report) && fs.existsSync(path.join(shots,item.id+'.png'))};
}
function replace(item) {
  const r=item.replacement, p=paths(item.id), blend=path.join(root,r.blend), dir=path.join(p.dir,r.name);
  if(!fs.existsSync(blend)) throw Error('缺少第三方原件：'+blend);
  if(hash(blend)!==r.blendSha) throw Error('第三方原件哈希与选件表不符：'+blend);
  // 下载的 .blend 可能带脚本，始终禁用自动执行。
  const run=spawnSync(process.env.BLENDER || 'D:/SteamLibrary/steamapps/common/Blender/blender.exe',
    ['-b','--factory-startup','--disable-autoexec','--python-exit-code','1',blend,'-P',path.join(root,r.prep),'--',dir],
    {stdio:'inherit',windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8'}});
  if(run.error || run.status!==0) throw run.error??Error('第三方模型整理失败：'+item.id);
  const lods=[0,1,2].map(n=>path.join(dir,'lod'+n+'.glb')), ref=path.join(p.dir,r.name+'-ref');
  tool('qc',lods[0],'--tight-frame','--out',ref,'--flat','--bg',1,'--views',[...views,'color'].join(','));
  // 等比缩放到表内高度，树冠宽深须与选件表登记一致（Unity 按它验尺寸，按表内宽深放碰撞）。
  const size=read(path.join(ref,'report.json')).size, k=item.h/size.height;
  const w=+(size.width*k).toFixed(4), d=+(size.depth*k).toFixed(4);
  if(Math.abs(w-item.canopyW)>.001 || Math.abs(d-item.canopyD)>.001) throw Error(`等比树冠 ${w}×${d} 与选件表 canopyW/canopyD ${item.canopyW}×${item.canopyD} 不符`);
  const stage=fs.mkdtempSync(path.join(p.dir,'normalized-'));
  tool('normalize',lods[0],'--lod-sources',lods.slice(1).join(','),'--min-iou',r.minIoU.join(','),'--max-interior-loss',r.maxInteriorLoss,
    '--out',stage,'--name',item.id,'--width',w,'--depth',d,'--height',item.h,'--origin',item.origin,'--budget',item.budget,'--qc',path.join(p.dir,r.name+'-lod-qc'),'--ref',ref,'--res',512);
  const report=read(path.join(stage,'report.json'));
  if(!report.materials.some(mat=>mat.BaseColor)) throw Error('没有可用的 BaseColor，保留上一次交付');
  Object.assign(report,{replacement:r.name,blendSha:r.blendSha,sha:hash(lods[0]),refSha:hash(lods[0]),credits:0}); save(path.join(stage,'report.json'),report);
  // 原交付（Tripo 版）首次替换前整体留底；之后只覆盖。
  const backup=path.join(p.dir,'tripo-delivery');
  if(fs.existsSync(p.dest) && !fs.existsSync(backup) && read(p.report)?.replacement===undefined) fs.cpSync(p.dest,backup,{recursive:true});
  fs.mkdirSync(p.dest,{recursive:true});
  const fresh=new Set(fs.readdirSync(stage));
  for(const name of fs.readdirSync(p.dest)) {
    const stem=name.endsWith('.meta')?name.slice(0,-5):name;
    if(!fresh.has(stem)) fs.rmSync(path.join(p.dest,name));
  }
  for(const name of [...[...fresh].filter(name=>name!==report.model),report.model]) fs.copyFileSync(path.join(stage,name),path.join(p.dest,name));
  console.log('已替换为 '+r.name+'：'+p.dest+'；原交付留底 '+backup);
}
function state(item) {
  if(item.replacement) return replacementState(item);
  const hybrid=isHybrid(item);
  const original=paths(item.id), report=read(original.report), download=read(path.join(original.dir,'download.json'));
  const assembly=hybrid && read(path.join(original.dir,'assembly.json'));
  const repaired=hybrid ? !!assembly && !!download && assembly.originalSha===download.sha && assembly.refSha===download.refSha : report?.source==='repaired.glb';
  const p=paths(item.id,repaired), stamp=repaired?(hybrid?assembly:report):download, qc=read(path.join(p.qc,'report.json'));
  const downloaded=fs.existsSync(original.source), current=downloaded && download?.sha===hash(original.source) && (!repaired || stamp.originalSha===download.sha) && fs.existsSync(p.source) && stamp?.sha===hash(p.source);
  const inspected=current && fs.existsSync(p.game) && qc?.sha===stamp.sha && qc.refSha===hash(p.game);
  const normal=inspected && qc.pass && report?.sha===stamp.sha && report.refSha===qc.refSha && !!qc.mirrorDepth===!!report.mirrorDepth &&
    (!hybrid || (repaired && report.originalSha===download.sha)) && fs.existsSync(path.join(p.dest,report.model));
  const receipt=normal && read(path.join(shots,item.id+'.json'));
  return {prep:prepared(item,p),downloaded, qc:inspected?qc:null,report:normal?report:null,accepted:!!receipt && receipt.reportSha===hash(p.report) && fs.existsSync(path.join(shots,item.id+'.png')) && (!hybrid || !item.actions.length || fs.existsSync(path.join(shots,item.id+'-action.png')))};
}
async function ingest(item,file,mirrorDepth) {
  const hybrid=isHybrid(item);
  const repaired=path.basename(file)==='repaired.glb', p=paths(item.id,repaired); if(!prepared(item,p)) throw Error('请先 prep '+item.id);
  const incoming=path.resolve(file); if(path.extname(incoming).toLowerCase()!=='.glb' || !fs.statSync(incoming).isFile()) throw Error('需要下载的 GLB 文件');
  const sha=hash(incoming), refSha=hash(p.game);
  const assemblyFile=path.join(p.dir,'assembly.json');
  if(hybrid && repaired) {
    const stamp=read(assemblyFile);
    if(mirrorDepth || stamp?.sha!==sha || stamp.refSha!==refSha || stamp.originalSha!==hash(paths(item.id).source))
      throw Error('修补件、游戏原模或下载原件不匹配，请从外壳重新 ingest');
  }
  if(repaired && (incoming!==p.source || read(path.join(p.dir,'download.json'))?.sha!==hash(paths(item.id).source))) throw Error('修补件须与已登记的原件同目录；不能替换下载件');
  if(incoming!==p.source) {
    if(incoming===p.game || (hybrid && incoming===path.join(p.dir,'shell.glb'))) throw Error('不能把游戏原模当下载件');
    if(fs.existsSync(p.source)) fs.renameSync(p.source,path.join(p.dir,'previous-'+randomUUID()+'.glb'));
    fs.copyFileSync(incoming,p.source,fs.constants.COPYFILE_EXCL);
    if(hash(p.source)!==sha) throw Error('下载件复制校验失败，保留原件');
    if(legacyBatch && !hybrid) fs.unlinkSync(incoming);
  }
  if(!repaired) save(path.join(p.dir,'download.json'),{sha,refSha});
  const referenceDir=hybrid && repaired ? path.join(p.dir,'game-ref') : p.ref;
  if(hybrid && repaired) tool('qc',p.game,...(legacyBatch?[]:['--tight-frame']),'--out',referenceDir,'--flat','--bg',1,'--views',views.join(','));
  try { tool('qc',p.source,'--out',p.qc,'--ref',referenceDir,'--height',item.h,'--silhouette',...(repaired?['--budget',item.budget]:[]),...(repaired&&item.id==='server_rack'?['--rack-clearance']:[]),...(mirrorDepth?['--mirror-depth']:[])); }
  catch(error) {save(path.join(p.qc,'report.json'),{sha,refSha,pass:false,problems:['模型读取或四视图渲染失败：'+error.message]});throw error;}
  const result=read(path.join(p.qc,'report.json')), reference=read(path.join(referenceDir,'report.json'));
  // Tripo 原件未定标，按高比较原模的宽深比；LOD0 预算在减面后硬验。
  for(const axis of ['width','depth']) {
    const ratio=(result.size[axis]/result.size.height)/(reference.size[axis]/reference.size.height);
    if(!Number.isFinite(ratio)||ratio<0.7||ratio>1.3) result.problems.push(`${axis}/高度偏离网页原模超过 30%（比值 ${ratio.toFixed(2)}）`);
  }
  if(!Object.keys(result.textures).length) result.problems.push('下载件没有贴图，请下载贴图版 GLB');
  result.pass=!result.problems.length; Object.assign(result,{sha,refSha});save(path.join(p.qc,'report.json'),result);
  if(!result.pass) throw Error(result.problems.join('；')+'；见 '+p.qc);
  console.log('四视图 IoU（'+(mirrorDepth?'深度镜像':'原样')+'）：',result.silhouetteIoU);
  if(hybrid && !repaired) {
    const run=spawnSync(process.env.BLENDER || 'D:/SteamLibrary/steamapps/common/Blender/blender.exe',
      ['-b','--factory-startup','--python-exit-code','1','-P',path.join(import.meta.dirname,'repair/hybrid.py'),'--',p.dir,JSON.stringify(item),String(item.budget),...(mirrorDepth?['--mirror-depth']:[])],
      {stdio:'inherit',windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8'}});
    if(run.error || run.status!==0) throw run.error??Error('外壳与程序部件装配失败：'+item.id);
    const merged=paths(item.id,true).source;
    save(assemblyFile,{originalSha:sha,refSha,sha:hash(merged),shellMirrorDepth:mirrorDepth});
    return ingest(item,merged,false);
  }
  deliver(item,p,mirrorDepth,sha,refSha);
}
function deliver(item,p,mirrorDepth,sha,refSha,previous=null) {
  const hybrid=isHybrid(item);
  const stage=fs.mkdtempSync(path.join(p.dir,'normalized-'));
  // 旧版已经交付的混合件在 reexport 时复现原配方。重新 ingest 则使用独立程序件预算。
  const legacy = hybrid && previous && (previous.legacyHybridRecipe ?? !previous.lods[0].partRatios);
  tool('normalize',p.source,'--out',stage,'--name',item.id,'--width',item.w,'--depth',item.d,'--height',item.h,'--origin',item.origin,'--budget',item.budget,'--qc',path.join(p.dir,'lod-qc'),'--ref',hybrid?path.join(p.dir,'game-ref'):p.ref,'--res',512,...(hybrid?['--hybrid']:[]),...(legacy?['--legacy-hybrid']:[]),...(mirrorDepth?['--mirror-depth']:[]));
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
  if(hybrid) Object.assign(report,{repairMethod:'AI 外壳＋程序部件',shellMirrorDepth:read(path.join(p.dir,'assembly.json')).shellMirrorDepth});
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
      const p=paths(item.id), shell=path.join(p.dir,'shell.glb');
      const hybrid=isHybrid(item);
      if(hybrid || !legacyBatch) tool('hybrid-export',item.id,p.dir,'--batch',batchName);
      else tool('export-scene-glb',item.id,p.game);
      tool('qc',hybrid?shell:p.game,...(legacyBatch?[]:['--tight-frame']),'--out',p.ref,'--flat','--bg',1,'--views',(withColor?[...views,'color']:views).join(','));
      const reportFile=path.join(p.ref,'report.json');
      save(reportFile,{...read(reportFile),sha:hash(p.game),...(hybrid?{shellSha:hash(shell)}:{})});manifest();
    }
    console.log('上传清单：'+path.join(local,withColor?'upload.md':'upload.json'));
  } else if(command==='ingest' && (args.length===2 || (args.length===3 && args.includes('--mirror-depth')))) {
    const [id,file]=args.filter(arg=>arg!=='--mirror-depth'); await ingest(chosen(id),file,args.includes('--mirror-depth'));
  }
  else if(command==='replace' && args.length===1) {
    const item=chosen(args[0]); if(!item.replacement) throw Error(item.id+' 的选件表没有 replacement'); replace(item);
  }
  else if(command==='reexport') {
    for(const item of args.length?args.map(chosen):batch){
      if(item.replacement) { if(args.length) replace(item); continue; }
      const p=paths(item.id);
      if(!args.length && !fs.existsSync(p.report) && !fs.existsSync(p.source)) continue;
      const {report}=state(item);
      if(!report) throw Error(item.id+'：原件、参考图或交付报告不匹配，请先 ingest');
      deliver(item,paths(item.id,report.source==='repaired.glb'),report.mirrorDepth,report.sha,report.refSha,report);
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
  } else if(command==='status' && !args.length) console.table(batch.map(item=>{const s=state(item), entry=ledger[item.id]; return {id:item.id,底图:s.prep,下载:s.downloaded,质检:s.qc?(s.qc.pass?(s.qc.mirrorDepth?'深度镜像通过':'通过'):s.qc.problems.join('；')):'—',规范化:!!s.report,Unity:s.accepted,积分:entry?.credits??'—',返工:entry?.reworks??'—',状态:deliveryStatus(s,entry,item)};}));
  else if(command==='ledger') {
    const rows=(args.length?args.map(chosen):batch).map(item=>{
      const {id,name}=item,s=state(item),e=ledger[id]??{},repaired=s.report?.source==='repaired.glb';
      if(item.replacement) {
        const r=item.replacement;
        return {id:batchName+'_'+id,name,source:r.source,method:r.method,license:r.license,credits:0,file:r.blend,
          qc:s.report?`精模 ${s.qc.triangles} 面，宽深高 ${Object.values(s.qc.size).map(v=>+v.toFixed(3)).join('×')} m；LOD ${s.report.lods.map(lod=>lod.triangles).join('/')}；远级轮廓 IoU 门槛 ${r.minIoU.join('/')}`:'待替换',
          status:deliveryStatus(s,{},item)};
      }
      const hybrid=isHybrid(item);
      const method=[e.method,!legacyBatch&&!hybrid?'四向灰模生成整件；原色 3/4 图贴图':null,hybrid?'四向灰模生成外壳：'+item.shell+'；参考原色图贴图，程序件从游戏原模回装':null,
        e.reworks!=null?'返工 '+e.reworks+' 次':null,e.note,repaired?(hybrid?'AI 外壳＋程序部件':'AI 外壳 + 程序化修补')+'；本地追加 0 积分':null].filter(Boolean).join('；');
      return {id:batchName+'_'+id,name,source:hybrid && repaired?'AI 外壳＋程序部件':e.source,method:method||undefined,prompt:e.prompt,date:e.date,license:e.license,credits:e.credits,
        file:s.downloaded?`art-src/tripo/${batchName}/${id}/${repaired?'repaired':'tripo'}.glb`:undefined,
        qc:s.qc?(s.qc.size?`${repaired?'修补件':'下载件'} ${s.qc.triangles} 面，宽深高 ${Object.values(s.qc.size).join('×')} m；`:'')+(s.qc.pass?(s.qc.mirrorDepth?'深度镜像通过':'通过'):s.qc.problems.join('；'))+(s.report?'；LOD '+s.report.lods.map(lod=>lod.triangles).join('/'):''):(e.status&&!s.downloaded?'未下载，未做网格质检':'待检'),status:deliveryStatus(s,e,item)};
    });
    await writeSources(path.join(root,'tables/美术.xlsx'),rows);
  } else throw Error('用法：batch.mjs [--batch batchN] prep [id... | --manifest-only] | ingest <id> <下载或同目录 repaired.glb 的路径> [--mirror-depth] | replace <id> | reexport [id...] | credit --from-notes | credit <id> <累计积分> [备注] | status | ledger [id...]');
} catch(error) { console.error(error.message); process.exitCode=1; }

function deliveryStatus(s,entry,item) {
  if(isHybrid(item) && s.accepted) return 'Unity 已生成截图；待人工验收';
  if(s.report?.source==='repaired.glb') return '本地修补及三级回读通过；待 Unity 人工验收';
  return entry?.status ?? (s.accepted?'Unity 已生成截图；待人工验收':s.report?'FBX 回读通过；待 Unity 验收':s.qc?.pass?'下载件通过；尚无匹配的正式 FBX':s.downloaded?'已下载':s.prep?'已备上传图':'计划中');
}

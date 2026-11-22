// --qc 指定质检根目录，--ref 是对照四视图，--reference 才是定高用的模型。
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import { budgetFor, geometryErrors } from './prop-geometry.mjs';

const options = Object.fromEntries(['out','name','height','width','depth','origin','reference','rotate-z','budget','qc','ref','res'].map(key => [key, { type: 'string' }]));
options['mirror-depth'] = { type: 'boolean' };
options.hybrid = { type: 'boolean' };
options['legacy-hybrid'] = { type: 'boolean' };
const { values, positionals } = parseArgs({ options, allowPositionals: true });
if (positionals.length !== 1 || !values.out || (!values.height === !values.reference))
  throw Error('用法：node tools/art/normalize.mjs 输入.glb --out 目录 (--height 米 | --reference 参考模型) [--name Furnace] [--rotate-z 角度] [--mirror-depth] [--budget 40000] [--qc 目录 --ref 四视图目录]');
function run(exe, args) {
  const result = spawnSync(exe, args, { stdio: 'inherit', windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  if (result.error || result.status !== 0) throw result.error || Error(`${exe} 退出码 ${result.status}`);
}
const { qc, ref, res, ...settings } = values;
settings['lod-limits'] = [1,2].map(level=>budgetFor(Number(values.budget ?? 40000),level)).join(',');
const targets = [0,0], attempts = [[],[]];
const reportFile = path.join(values.out,'report.json');
let report;
while (true) {
  settings['lod-targets'] = targets.join(',');
  run(process.env.BLENDER || 'D:/SteamLibrary/steamapps/common/Blender/blender.exe', ['-b','--factory-startup','--python-exit-code','1','-P',path.join(import.meta.dirname,'normalize.py'),'--',positionals[0], ...Object.entries(settings).flatMap(([key,value]) => value===true?['--'+key]:['--'+key,value])]);
  report = JSON.parse(fs.readFileSync(reportFile,'utf8'));
  let retry = false;
  const exhausted = [];
  for (const lod of report.lods.slice(1)) {
    const index = lod.level-1, integrity = lod.lodIntegrity;
    const errors = Object.entries(integrity.views)
      .filter(([,v])=>v.interiorLoss>integrity.maxInteriorLoss || v.iou<integrity.minIoU)
      .map(([view,v])=>`${view} 内部漏像素 ${(100*v.interiorLoss).toFixed(3)}%，IoU ${v.iou.toFixed(4)}`);
    if (lod.triangles > lod.budget) errors.push(`面数 ${lod.triangles} 超过预算 ${lod.budget}`);
    const history = attempts[index];
    if (history.at(-1)?.target !== lod.targetTriangles) {
      history.push({target:lod.targetTriangles,triangles:lod.triangles,retainedRatio:lod.retainedRatio,errors});
    }
    lod.attempts = history;
    if (!errors.length) continue;
    const reason = `LOD${lod.level} ${lod.triangles}/${lod.budget} 面：${errors.join('；')}`;
    if (lod.targetTriangles >= lod.budget || lod.triangles > lod.budget) {
      exhausted.push(reason);
      continue;
    }
    // 始终从原件重建；每次增加该级预算的 5%，最后一档精确取上限。
    targets[index] = Math.min(lod.budget, Math.max(lod.targetTriangles,lod.triangles) + Math.ceil(.05*lod.budget));
    console.log(`${reason}；以 ${targets[index]} 面为目标重试`);
    retry = true;
  }
  fs.writeFileSync(reportFile, JSON.stringify(report,null,2)+'\n');
  if (!retry) {
    if (exhausted.length) throw Error(exhausted.join('\n')+'；见 '+reportFile);
    break;
  }
}
if (qc) for (const [index, lod] of report.lods.entries()) {
  const out = path.join(qc, 'LOD'+index);
  const spec = values.width && values.depth ? {w:Number(values.width),d:Number(values.depth),h:report.targetHeight,origin:report.origin,budget:report.budget} : null;
  const budget = lod.budget;
  const rack=values.name==='server_rack' && report.source==='repaired.glb';
  run(process.execPath,[path.join(import.meta.dirname,'qc.mjs'),path.join(values.out,report.model),'--lod',String(index),'--out',out,'--budget',String(budget),'--height',String(report.targetHeight), ...(rack?['--rack-clearance']:[]), ...(ref ? ['--ref',ref] : []), ...(res ? ['--res',res] : [])]);
  const check = JSON.parse(fs.readFileSync(path.join(out,'report.json'),'utf8'));
  const pos = check.origin;
  const anchor = [pos.centerX, pos.centerY+(values.origin==='wall'?check.size.depth/2:0), pos.bottomZ+(values.origin==='ceiling'?check.size.height:0)];
  const errors = [...check.problems];
  function verify(label,actual,target,limit) {
    if (!(Math.abs(actual-target)<=limit)) errors.push(`${label}=${actual}，目标 ${target} ± ${limit} m`);
  }
  if(spec) errors.push(...geometryErrors(check,spec,index));
  else anchor.forEach((value,axis)=>verify(['横向中心','深度锚点','高度锚点'][axis],value,0,.002));
  if(check.triangles!==lod.triangles) errors.push(`FBX 回读面数 ${check.triangles} != ${lod.triangles}`);
  for(const key of Object.keys(lod.size)) verify('FBX 回读 '+key,check.size[key],lod.size[key],.002);
  if(errors.length) throw Error(`LOD${index}：${errors.join('；')}：${out}`);
}
if(qc) console.log('规范化验收通过：三级 FBX 的面数、交付尺寸及锚点均合格');

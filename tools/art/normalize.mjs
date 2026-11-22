// --qc 指定质检根目录，--ref 是对照四视图，--reference 才是定高用的模型。
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import { budgetFor, geometryErrors } from './prop-geometry.mjs';

const options = Object.fromEntries(['out','name','height','width','depth','origin','reference','rotate-z','budget','qc','ref','res'].map(key => [key, { type: 'string' }]));
options['mirror-depth'] = { type: 'boolean' };
const { values, positionals } = parseArgs({ options, allowPositionals: true });
if (positionals.length !== 1 || !values.out || (!values.height === !values.reference))
  throw Error('用法：node tools/art/normalize.mjs 输入.glb --out 目录 (--height 米 | --reference 参考模型) [--name Furnace] [--rotate-z 角度] [--mirror-depth] [--budget 40000] [--qc 目录 --ref 四视图目录]');
function run(exe, args) {
  const result = spawnSync(exe, args, { stdio: 'inherit', windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  if (result.error || result.status !== 0) throw result.error || Error(`${exe} 退出码 ${result.status}`);
}
const { qc, ref, res, ...settings } = values;
run(process.env.BLENDER || 'D:/SteamLibrary/steamapps/common/Blender/blender.exe', ['-b','--factory-startup','--python-exit-code','1','-P',path.join(import.meta.dirname,'normalize.py'),'--',positionals[0], ...Object.entries(settings).flatMap(([key,value]) => value===true?['--'+key]:['--'+key,value])]);
const report = JSON.parse(fs.readFileSync(path.join(values.out,'report.json'),'utf8'));
if (qc) for (const [index, lod] of report.lods.entries()) {
  const out = path.join(qc, 'LOD'+index);
  const spec = values.width && values.depth ? {w:Number(values.width),d:Number(values.depth),h:report.targetHeight,origin:report.origin,budget:report.budget} : null;
  const budget = spec ? budgetFor(spec.budget,index) : report.budget;
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

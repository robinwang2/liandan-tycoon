// --qc 指定质检根目录，--ref 是对照四视图，--reference 才是定高用的模型。
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';

const options = Object.fromEntries(['out','name','height','reference','rotate-z','budget','qc','ref','res'].map(key => [key, { type: 'string' }]));
const { values, positionals } = parseArgs({ options, allowPositionals: true });
if (positionals.length !== 1 || !values.out || (!values.height === !values.reference))
  throw Error('用法：node tools/art/normalize.mjs 输入.glb --out 目录 (--height 米 | --reference 参考模型) [--name Furnace] [--rotate-z 角度] [--budget 40000] [--qc 目录 --ref 四视图目录]');
function run(exe, args) {
  const result = spawnSync(exe, args, { stdio: 'inherit', windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  if (result.error || result.status !== 0) throw result.error || Error(`${exe} 退出码 ${result.status}`);
}
const { qc, ref, res, ...settings } = values;
run(process.env.BLENDER || 'D:/SteamLibrary/steamapps/common/Blender/blender.exe', ['-b','--factory-startup','--python-exit-code','1','-P',path.join(import.meta.dirname,'normalize.py'),'--',positionals[0], ...Object.entries(settings).flatMap(([key,value]) => ['--'+key,value])]);
const report = JSON.parse(fs.readFileSync(path.join(values.out,'report.json'),'utf8'));
if (qc) for (const [index, lod] of report.lods.entries()) {
  const out = path.join(qc, 'LOD'+index);
  run(process.execPath,[path.join(import.meta.dirname,'qc.mjs'),path.join(values.out,report.model),'--lod',String(index),'--out',out,'--budget',String(report.budget),'--height',String(report.targetHeight), ...(ref ? ['--ref',ref] : []), ...(res ? ['--res',res] : [])]);
  const check = JSON.parse(fs.readFileSync(path.join(out,'report.json'),'utf8'));
  if (check.triangles !== lod.triangles || Math.abs(check.size.height-lod.size.height) > .002 || check.note_origin || !check.pass) throw Error(`LOD${index} 的 FBX 回读质检未通过：${out}`);
}

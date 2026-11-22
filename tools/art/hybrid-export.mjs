// 直接构建 PROPS 原模。按活动组与材质归类，在各自原枢轴合并同材质网格。
import fs from 'node:fs';
import path from 'node:path';
import { Group, Mesh, Matrix4, Vector3 } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeKit } from '../../src/scene3a/kit.js';
import { PROPS } from '../../src/scene3a/props.js';
import { batchOptions } from './batch-options.mjs';

// Node 提供 Blob；此导出器在写二进制时只需要 FileReader 的这一项。
globalThis.FileReader ??= class {
  async readAsArrayBuffer(blob) { this.result = await blob.arrayBuffer(); this.onloadend(); }
};
// 兼容原先直接调用此脚本时默认只导出第 3 批外壳的用法。
const argv = process.argv.slice(2);
const { args:[id, dir], policy, batchName } = batchOptions(argv.includes('--batch') ? argv : [...argv,'--batch','batch3']);
const {props} = JSON.parse(fs.readFileSync(new URL('../../unity/Game/Assets/Shell/Resources/'+policy+'.json', import.meta.url)));
const spec = props.find(item => item.id === id);
if (!spec) throw Error(batchName+' 未收录：'+id);
const parts = spec.parts ?? [];
const root = PROPS[id].build(makeKit(), batchName === 'batch3' ? {seed:0} : {seed:0,brand:'#3d968d'});
root.updateMatrixWorld(true);
const bins = new Map(), names = new Map(), guards = new Set(), counts = {};
root.traverse(node => {
  if (!node.userData.dynamic) return;
  let name = node.name;
  // 这两款设备的摆放只用默认固定面板。其余可替换表面和活动组仍须逐件登记。
  if (spec.fixedSurfaces?.includes(name)) return;
  if (name === 'wheel' || name === 'fan') {
    counts[name] = (counts[name] ?? 0) + 1;
    if (name === 'fan') guards.add(node.parent);
    name += '_' + counts[name];
  }
  if (!parts.includes(name)) throw Error('未登记的活动组：' + name);
  names.set(node, name);
});
const glass = mat => mat.transparent || (batchName === 'batch3' && ['192f3e','253946'].includes(mat.color.getHexString()));
root.traverse(mesh => {
  if (!mesh.isMesh) return;
  const mat = mesh.material, color = mat.color.getHexString();
  let part = 'Shell', pivot = new Vector3();
  // 动件优先，雷达的深色光学环与雷达同轴，仍使用独立玻璃材质。
  for (let node = mesh.parent; node; node = node.parent) {
    if (names.has(node)) { part = names.get(node); node.getWorldPosition(pivot); break; }
    if (guards.has(node)) { part = 'Guard'; break; }
  }
  if (part === 'Shell') {
    if (glass(mat)) part = 'Glass';
    else if (id === 'news_rack' && ['e4ddcb','4a5160'].includes(color)) part = 'Papers';
    else if (spec.partColors?.[color]) part = spec.partColors[color];
    else if (mat.emissive?.getHex() && parts.includes('Lights')) part = 'Lights';
  }
  if (glass(mat)) mat.name = 'M_' + id + '_Glass';
  if (!bins.has(part)) bins.set(part, {pivot, materials:new Map()});
  const bucket = bins.get(part).materials;
  if (!bucket.has(mat)) bucket.set(mat, []);
  const geo = mesh.geometry.index ? mesh.geometry.clone() : mergeVertices(mesh.geometry, 1e-7);
  geo.applyMatrix4(new Matrix4().makeTranslation(-pivot.x,-pivot.y,-pivot.z).multiply(mesh.matrixWorld));
  bucket.get(mat).push(geo);
});
if ([...bins.keys()].sort().join() !== ['Shell',...parts].sort().join()) throw Error(id+' 分件不匹配：'+[...bins.keys()]);
const model = new Group();
for (const [name,{pivot,materials}] of bins) {
  const chunks = [...materials.values()].map(list => mergeGeometries(list));
  const geometry = mergeGeometries(chunks,true);
  const mesh = new Mesh(geometry,[...materials.keys()]);
  mesh.name = name; mesh.position.copy(pivot); model.add(mesh);
}
fs.mkdirSync(dir,{recursive:true});
async function write(name) {
  const bytes = await new GLTFExporter().parseAsync(model,{binary:true});
  fs.writeFileSync(path.join(dir,name),Buffer.from(bytes));
}
await write('game.glb');
if (parts.length) {
  for (const node of model.children) node.visible = node.name === 'Shell';
  await write('shell.glb');
}
console.log(id+'：'+[...bins.keys()].join('、'));

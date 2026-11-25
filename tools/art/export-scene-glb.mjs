// 把游戏 3D 场景里的一样东西导出成 GLB（给 Blender 和 Tripo 当底图、当对照）。
// 要先开着开发服务器（npm run dev，127.0.0.1:5173），用无界面 Chrome 打开游戏标题画面，从场景里取出物体，用 three.js 自带的 glTF 导出器导出。
//   node tools/art/export-scene-glb.mjs furnace art-src/tripo/ref/furnace-game.glb
// 库道具取固定种子；蛋和轿厢通过一次性页面的 room.sync 生成。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [what = 'furnace', outFile = 'art-src/tripo/ref/furnace-game.glb', mode] = process.argv.slice(2);
if (mode === '--procedural') {
  await exportProcedural(what, outFile);
  process.exit(0);
}

async function exportProcedural(id, output) {
  const { Group, Mesh, Matrix4, Vector3, Float32BufferAttribute } = await import('three');
  const { mergeGeometries, mergeVertices } = await import('three/addons/utils/BufferGeometryUtils.js');
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const { makeKit } = await import('../../src/scene3a/kit.js');
  const policy = JSON.parse(fs.readFileSync(new globalThis.URL('../../unity/Game/Assets/Shell/Resources/PropPolicyBatch7.json',import.meta.url)));
  const spec = policy.props.find(prop=>prop.id===id && prop.procedural);
  if (!spec) throw Error('未登记程序件：'+id);
  const kit=makeKit(), cabin=id==='elevator_car';
  const root=cabin ? (await import('../../src/scene3a/office.js')).buildElevatorCabin(kit,'#ff6b4a').car
    : (await import('../../src/scene3a/props.js')).PROPS[id].build(kit,{seed:0});
  root.updateMatrixWorld(true);
  const bins=new Map(), model=new Group(); let wheels=0, piece=0;
  function walk(node, owner, pivot) {
    if(node.name==='wheel' && node.userData.dynamic) owner='wheel_'+(++wheels);
    else if(spec.parts.includes(node.name)) owner=node.name;
    else if(node.userData.dynamic) throw Error('未登记活动件：'+node.name);
    if(node.userData.dynamic || spec.parts.includes(node.name)) pivot=node.getWorldPosition(new Vector3());
    if(node.isMesh) {
      const mat=node.material, glass=mat.transparent || (!cabin && ['192f3e','253946'].includes(mat.color.getHexString()));
      const part=owner ?? (glass?'Glass':mat.emissive?.getHex()?'Lights':'Shell');
      if(glass) {
        mat.name='M_'+id+(owner?.startsWith('door_')?'_DoorGlass':'_Glass');
        if(!cabin){mat.transparent=true; mat.opacity=.62;}
      }
      if(!bins.has(part)) bins.set(part,{pivot,slots:new Map()});
      const slots=bins.get(part).slots;
      if(!slots.has(mat)) slots.set(mat,[]);
      const geo=node.geometry.index?node.geometry.clone():mergeVertices(node.geometry,1e-7);
      geo.applyMatrix4(new Matrix4().makeTranslation(-pivot.x,-pivot.y,-pivot.z).multiply(node.matrixWorld));
      geo.setAttribute('_PIECE',new Float32BufferAttribute(new Float32Array(geo.attributes.position.count).fill(++piece),1));
      slots.get(mat).push(geo);
    }
    for(const child of node.children) walk(child,owner,pivot);
  }
  walk(root,null,new Vector3());
  if([...bins.keys()].sort().join()!==['Shell',...spec.parts].sort().join()) throw Error('分件与选件表不符：'+[...bins.keys()]);
  for(const [name,{pivot,slots}] of bins) {
    const mesh=new Mesh(mergeGeometries([...slots.values()].map(group=>mergeGeometries(group)),true),[...slots.keys()]);
    mesh.name=name; mesh.position.copy(pivot); model.add(mesh);
  }
  globalThis.FileReader ??= class { async readAsArrayBuffer(blob){this.result=await blob.arrayBuffer(); this.onloadend();} };
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,Buffer.from(await new GLTFExporter().parseAsync(model,{binary:true})));
  console.log(id+' → '+output+'：'+[...bins.keys()].join('、'));
}
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.env.GAME_URL || 'http://127.0.0.1:5173/';
// 在页面里执行：返回要导出的那个物体（Object3D）
const PICK = {
  // 丹炉：office.js 的 createRoom 把它放在 world 的第 4 个子组（furnaceG）里；world 是场景里挂着三盏点光源的那个组
  furnace: `(() => { const sc = __game.office.debug.stage.scene; const world = sc.children.find(o => o.isGroup && o.children.filter(c => c.isPointLight).length >= 3); return world?.children[3]?.children[0]; })()`,
};
const art = JSON.parse(fs.readFileSync(new globalThis.URL('../../src/data/tables/art.json',import.meta.url)));
const world = `stage.scene.children.find(o=>o.isGroup && o.children.filter(c=>c.isPointLight).length>=3)`;
PICK.office_egg = `(()=>{const {room,stage}=__game.office.debug; room.sync({level:3,own:false}); return ${world}.children[3].children[0]})()`;
PICK.elevator_car = `(()=>{const {room,stage}=__game.office.debug; room.sync({level:5,floor:0}); return ${world}.getObjectByName('elevator_car')})()`;
if (!Object.hasOwn(PICK,what) && art.PROPS.some(prop=>prop.id===what)) PICK[what] = `(await import('/src/scene3a/props.js')).PROPS[${JSON.stringify(what)}].build(__game.office.debug.k,{seed:0,brand:'#3d968d'})`;
if (!Object.hasOwn(PICK,what)) throw Error('未知道具：'+what);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'ldt-export-'));
const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });
let port, launchError;
proc.once('error',error=>{launchError=error});
try {
for (let attempt = 0; attempt < 80 && !port && !launchError && proc.exitCode===null; attempt++) {
  try { port = Number(fs.readFileSync(path.join(prof,'DevToolsActivePort'),'utf8').split('\n')[0]); } catch { await sleep(250); }
}
if (!port) throw launchError??Error('Chrome 未开启调试端口；请检查 CHROME、临时目录权限和沙箱限制');
function connect(u) {
  const ws = new WebSocket(u), pending = new Map(), handlers = []; let id = 0;
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else handlers.forEach(h => h(m)); };
  const send = (method, params = {}) => new Promise((resolve,reject) => { const i = ++id; const timer=setTimeout(()=>reject(Error('Chrome 调试超时：'+method)),60000); if(ws.readyState!==1){clearTimeout(timer);reject(Error('Chrome 调试连接已断开'));return;} pending.set(i, reply=>{clearTimeout(timer);reply.error?reject(Error(reply.error.message)):resolve(reply)}); ws.send(JSON.stringify({ id: i, method, params })); });
  return new Promise((resolve,reject) => { ws.onerror=()=>reject(Error('Chrome 调试连接失败')); ws.onclose=()=>{for(const done of pending.values()) done({error:{message:'Chrome 调试连接已关闭'}}); pending.clear();}; ws.onopen = () => resolve({ ws, send, on: h => handlers.push(h) }); });
}
let targets = [];
for (let i = 0; i < 20 && !targets.some(t => t.type === 'page'); i++) { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (!targets.some(t => t.type === 'page')) await sleep(250); }
const page = await connect(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
const errors = [];
page.on(m => { if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 300)); });
await page.send('Runtime.enable'); await page.send('Page.enable');
await page.send('Page.navigate', { url: URL });
const ev = async expr => { const r = await page.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); return r.result?.result?.value; };
// 等场景搭好
let ok = false;
for (let i = 0; i < 80 && !ok; i++) { await sleep(500); ok = await ev('!!window.__game?.office?.debug?.room').catch(() => false); }
if (!ok) throw Error('未加载 3A 开发场景 '+URL+(errors.length?'；页面报错：'+errors.join(' | '):''));
await sleep(2500);
const res = await ev(`(async () => {
  const { GLTFExporter } = await import('/node_modules/three/examples/jsm/exporters/GLTFExporter.js');
  const root = ${PICK[what]};
  if (!root) throw Error('未找到指定道具');
  // 场景重建后立即固定姿势，不把动画推进或页面里缓存的几何、材质写进 glTF extras。
  const saved=new Map(); let c;
  try { root.traverse(o=>{saved.set(o,o.userData);o.userData={tris:o.userData.tris};});c=root.clone(true); }
  finally {for(const [obj,data] of saved)obj.userData=data;}
  const gameScale = c.scale.x;
  c.position.set(0, 0, 0); c.rotation.set(0, 0, 0); c.scale.set(1, 1, 1);
  // 只留静态合批出来的那几块（炉座、炉身、炉盖……，合批结果的 userData 里记着三角面数）；火星、烟、光晕这些会动的特效不要
  const drop = []; c.traverse(o => { if (o.isSprite || o.isPoints || o.isLine || o.isLight || !o.visible) drop.push(o); });
  if (${what === 'furnace'}) for (const ch of c.children) if (ch.userData?.tris == null && !drop.includes(ch)) drop.push(ch);
  c.visible = true;
  c.traverse(o => { o.userData = {}; if (o.geometry) {o.geometry=o.geometry.clone();o.geometry.userData={};} });
  for (const o of drop) if (o !== c) o.removeFromParent();
  c.updateMatrixWorld(true);
  let tris = 0, meshes = 0, box = null;
  c.traverse(o => { if (!o.isMesh) return; meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; g.computeBoundingBox(); const b = g.boundingBox.clone().applyMatrix4(o.matrixWorld); box = box ? box.union(b) : b; });
  const ab = await new GLTFExporter().parseAsync(c, { binary: true });
  const u8 = new Uint8Array(ab); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return { gameScale, meshes, tris, dropped: drop.length, min: box.min.toArray(), max: box.max.toArray(), b64: btoa(s) };
})()`);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, Buffer.from(res.b64, 'base64'));
const size = res.max.map((v, i) => +(v - res.min[i]).toFixed(3));
console.log(`✓ ${what} → ${outFile}（${(fs.statSync(outFile).size / 1024).toFixed(0)} KB）`);
console.log(`  网格 ${res.meshes} 个、三角面 ${Math.round(res.tris)}、去掉粒子和灯 ${res.dropped} 个；尺寸 宽 ${size[0]} × 高 ${size[1]} × 深 ${size[2]}（游戏里再放大 ${res.gameScale} 倍）`);
if (errors.length) console.log('  页面报错：' + errors.slice(0, 3).join(' | '));
} finally {
try { proc.kill(); } catch {}
await sleep(500);
try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
}

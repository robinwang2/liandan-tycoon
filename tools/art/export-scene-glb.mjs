// 把游戏 3D 场景里的一样东西导出成 GLB（给 Blender 和 Tripo 当底图、当对照）。
// 要先开着开发服务器（npm run dev，127.0.0.1:5173），用无界面 Chrome 打开游戏标题画面，从场景里取出物体，用 three.js 自带的 glTF 导出器导出。
//   node tools/art/export-scene-glb.mjs furnace art-src/tripo/ref/furnace-game.glb
// 现在支持：furnace（丹炉）。以后要导别的，在 PICK 里加一条「怎么在场景里找到它」。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [what = 'furnace', outFile = 'art-src/tripo/ref/furnace-game.glb'] = process.argv.slice(2);
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.env.GAME_URL || 'http://127.0.0.1:5173/';
// 在页面里执行：返回要导出的那个物体（Object3D）
const PICK = {
  // 丹炉：office.js 的 createRoom 把它放在 world 的第 4 个子组（furnaceG）里；world 是场景里挂着三盏点光源的那个组
  furnace: `(() => { const sc = __game.office.debug.stage.scene; const world = sc.children.find(o => o.isGroup && o.children.filter(c => c.isPointLight).length >= 3); return world?.children[3]?.children[0]; })()`,
};
if (!PICK[what]) { console.log('不认识：' + what + '，现在支持：' + Object.keys(PICK).join(', ')); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'ldt-export-'));
const port = 9300 + Math.floor(Math.random() * 600);
const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });
let ver = null;
for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await sleep(250); } }
if (!ver) { console.log('Chrome 没启动'); proc.kill(); process.exit(1); }
function connect(u) {
  const ws = new WebSocket(u), pending = new Map(), handlers = []; let id = 0;
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else handlers.forEach(h => h(m)); };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  return new Promise(r => { ws.onopen = () => r({ ws, send, on: h => handlers.push(h) }); });
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
for (let i = 0; i < 40 && !ok; i++) { await sleep(500); ok = await ev(`!!(window.__game && ${PICK[what]})`).catch(() => false); }
if (!ok) { console.log('场景里没找到 ' + what + (errors.length ? '；页面报错：' + errors.join(' | ') : '')); proc.kill(); process.exit(1); }
await sleep(2500);
const res = await ev(`(async () => {
  const root = ${PICK[what]};
  const { GLTFExporter } = await import('/node_modules/three/examples/jsm/exporters/GLTFExporter.js');
  const c = root.clone(true);
  const gameScale = c.scale.x;
  c.position.set(0, 0, 0); c.rotation.set(0, 0, 0); c.scale.set(1, 1, 1);
  // 只留静态合批出来的那几块（炉座、炉身、炉盖……，合批结果的 userData 里记着三角面数）；火星、烟、光晕这些会动的特效不要
  const drop = []; c.traverse(o => { if (o.isSprite || o.isPoints || o.isLine || o.isLight || !o.visible) drop.push(o); });
  for (const ch of c.children) if (ch.userData?.tris == null && !drop.includes(ch)) drop.push(ch);
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
const br = await connect(ver.webSocketDebuggerUrl); br.send('Browser.close'); await sleep(1500);
try { proc.kill(); } catch {}
try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
process.exit(0);

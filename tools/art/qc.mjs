// 模型质检：调 Blender 出统计和渲染图（tools/art/qc.py），再拼成一张对照图。
//   node tools/art/qc.mjs <模型> [--out 目录] [--budget 40000] [--height 2.6] [--ref 参考图目录或图片] [--flat]
// 输出目录里：report.json、各方向渲染图、sheet.png（各方向排一排；给了 --ref 的话上面一排是参考图，下面一排是模型）。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const BLENDER = process.env.BLENDER || 'D:/SteamLibrary/steamapps/common/Blender/blender.exe';
const args = process.argv.slice(2), model = args[0];
if (!model) { console.log('用法：node tools/art/qc.mjs <模型> [--out 目录] [--budget N] [--height 米] [--ref 目录或图片] [--flat]'); process.exit(1); }
const opt = {}; for (let i = 1; i < args.length; i++) { if (args[i] === '--flat') opt.flat = true; else opt[args[i].slice(2)] = args[++i]; }
const out = path.resolve(opt.out || model.replace(/\.[^.]+$/, '') + '_qc');
const views = (opt.views || 'front,left,right,back,persp').split(',');
const pyArgs = ['--', path.resolve(model), '--out', out, '--views', views.join(','), ...(opt.budget ? ['--budget', opt.budget] : []), ...(opt.height ? ['--height', opt.height] : []), ...(opt.res ? ['--res', opt.res] : []), ...(opt.flat ? ['--flat'] : [])];
const t0 = Date.now();
const r = spawnSync(BLENDER, ['-b', '--factory-startup', '-P', path.resolve(import.meta.dirname, 'qc.py'), ...pyArgs], { encoding: 'utf8', maxBuffer: 64 << 20 });
const line = (r.stdout || '').split('\n').find(l => l.startsWith('QC_REPORT '));
if (!line) { console.log('Blender 没跑通：\n' + (r.stderr || '').slice(-2000) + '\n' + (r.stdout || '').slice(-2000)); process.exit(1); }
const rep = JSON.parse(line.slice(10));
// 拼图：一格 320 像素
const S = 320, refs = [];
if (opt.ref) {
  const st = fs.statSync(opt.ref);
  if (st.isDirectory()) for (const v of views) { const f = ['.png', '.jpg', '.webp'].map(e => path.join(opt.ref, v + e)).find(fs.existsSync); refs.push(f || null); }
  else refs.push(opt.ref, ...views.slice(1).map(() => null));
}
const rows = refs.length ? 2 : 1, tiles = [];
for (const [ri, list] of (refs.length ? [refs, views.map(v => rep.renders[v])] : [views.map(v => rep.renders[v])]).entries())
  for (const [ci, f] of list.entries()) if (f) tiles.push({ input: await sharp(f).resize(S, S, { fit: 'contain', background: '#dbdbdb' }).png().toBuffer(), left: ci * S, top: ri * S });
await sharp({ create: { width: views.length * S, height: rows * S, channels: 3, background: '#f2f2f2' } }).composite(tiles).png().toFile(path.join(out, 'sheet.png'));
const sz = rep.size;
console.log(`${rep.pass ? '✓ 合格' : '✗ 不合格'}  ${path.basename(model)}（${((Date.now() - t0) / 1000).toFixed(1)} 秒）`);
console.log(`  三角面 ${rep.triangles}${opt.budget ? ` / 预算 ${opt.budget}` : ''} · 顶点 ${rep.vertices} · 物体 ${rep.objects} 个 · 连通零件 ${rep.parts} 个 · 开口边 ${rep.boundaryEdges} · 破面边 ${rep.nonManifoldEdges}`);
console.log(`  尺寸 宽 ${sz.width} × 深 ${sz.depth} × 高 ${sz.height}（宽/高 ${rep.ratio['width/height']}）${rep.scaleToTarget ? ` · 缩放到目标高度要 ×${rep.scaleToTarget}` : ''}`);
console.log(`  材质 ${rep.materials.length} 个 · 贴图 ${Object.entries(rep.textures).map(([n, wh]) => `${wh[0]}×${wh[1]}`).join('、') || '无'} · 底面 z=${rep.origin.bottomZ}${rep.note_origin ? ' · ' + rep.note_origin : ''}`);
for (const p of rep.problems) console.log('  ✗ ' + p);
for (const n of rep.notes || []) console.log('  ⚠ ' + n);
console.log(`  对照图：${path.join(out, 'sheet.png')}`);

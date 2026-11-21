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
const opt = {}; for (let i = 1; i < args.length; i++) { if (['--flat','--silhouette','--mirror-depth','--rack-clearance'].includes(args[i])) opt[args[i].slice(2)] = true; else opt[args[i].slice(2)] = args[++i]; }
if(opt['mirror-depth']) opt.silhouette=true;
if (opt.silhouette) {
  if(!opt.ref || !fs.statSync(opt.ref).isDirectory()) throw Error('轮廓检查需要 --ref 四视图目录');
  Object.assign(opt,{flat:true,bg:1,views:'front,left,right,back'});
}
const out = path.resolve(opt.out || model.replace(/\.[^.]+$/, '') + '_qc');
const views = (opt.views || 'front,left,right,back,persp').split(',');
const pyArgs = ['--', path.resolve(model), '--out', out, '--views', views.join(','), ...(opt.budget ? ['--budget', opt.budget] : []), ...(opt.height ? ['--height', opt.height] : []), ...(opt.res ? ['--res', opt.res] : []), ...(opt.flat ? ['--flat'] : [])];
const t0 = Date.now();
if (opt.lod !== undefined) pyArgs.push('--lod', opt.lod);
if (opt.bg !== undefined) pyArgs.push('--bg', opt.bg);
if (opt['rack-clearance']) pyArgs.push('--rack-clearance');
const r = spawnSync(BLENDER, ['-b', '--factory-startup', '-P', path.resolve(import.meta.dirname, 'qc.py'), ...pyArgs], { encoding: 'utf8', maxBuffer: 64 << 20 });
const line = (r.stdout || '').split('\n').find(l => l.startsWith('QC_REPORT '));
if (!line) { console.log('Blender 没跑通：\n' + (r.stderr || '').slice(-2000) + '\n' + (r.stdout || '').slice(-2000)); process.exit(1); }
const rep = JSON.parse(line.slice(10));
if (opt.silhouette) {
  const side=160, threshold=.45, raw={}, mirrored={}, opposite={front:'back',back:'front',left:'left',right:'right'};
  const mask=file=>sharp(file).resize(side,side).removeAlpha().greyscale().raw().toBuffer();
  const images=Object.fromEntries(await Promise.all(views.map(async view=>[view,await mask(rep.renders[view])])));
  function overlap(reference,generated,flip) {
    let both=0,either=0;
    for(let index=0;index<reference.length;index++) {
      const a=reference[index]<249,b=generated[flip?index+side-1-2*(index%side):index]<249;
      both+=a&&b; either+=a||b;
    }
    return either?both/either:0;
  }
  for(const view of views) {
    const reference=await mask(path.join(opt.ref,view+'.png'));
    raw[view]=overlap(reference,images[view],false);
    // 深度反射后正背相机互换，且屏幕横轴翻转；侧视相机不换，仅水平翻图。
    mirrored[view]=overlap(reference,images[opposite[view]],true);
  }
  rep.silhouetteCandidates={raw,mirrored}; rep.mirrorDepth=!!opt['mirror-depth'];
  rep.silhouetteIoU=rep.mirrorDepth?mirrored:raw;
  if(Object.values(raw).some(score=>score<threshold) && Object.values(mirrored).every(score=>score>=threshold)) {
    rep.orientation='深度镜像，可用 --mirror-depth 修正';
    if(!rep.mirrorDepth) rep.problems.push(rep.orientation);
  }
  for(const [view,score] of Object.entries(rep.silhouetteIoU)) if(score<threshold) rep.problems.push(`${view} 轮廓交并比 ${score.toFixed(2)} 低于 ${threshold}，请复核朝向/缺件`);
  rep.pass=!rep.problems.length;
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(rep,null,2)+'\n');
}
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
const orientation = rep.normalOrientationEstimate;
console.log(`  射线估计疑似朝内 ${orientation.suspectedInward} 面，占全部面的 ${(100*orientation.inwardFractionOfAllFaces).toFixed(2)}%；另有 ${orientation.unresolved} 面无法判断（不作为硬性判废依据）`);
console.log(`${rep.pass ? '✓ 合格' : '✗ 不合格'}  ${path.basename(model)}（${((Date.now() - t0) / 1000).toFixed(1)} 秒）`);
console.log(`  三角面 ${rep.triangles}${opt.budget ? ` / 预算 ${opt.budget}` : ''} · 顶点 ${rep.vertices} · 物体 ${rep.objects} 个 · 连通零件 ${rep.parts} 个 · 开口边 ${rep.boundaryEdges} · 破面边 ${rep.nonManifoldEdges}`);
console.log(`  尺寸 宽 ${sz.width} × 深 ${sz.depth} × 高 ${sz.height}（宽/高 ${rep.ratio['width/height']}）${rep.scaleToTarget ? ` · 缩放到目标高度要 ×${rep.scaleToTarget}` : ''}`);
console.log(`  材质 ${rep.materials.length} 个 · 贴图 ${Object.entries(rep.textures).map(([n, wh]) => `${wh[0]}×${wh[1]}`).join('、') || '无'} · 底面 z=${rep.origin.bottomZ}${rep.note_origin ? ' · ' + rep.note_origin : ''}`);
for (const p of rep.problems) console.log('  ✗ ' + p);
for (const n of rep.notes || []) console.log('  ⚠ ' + n);
console.log(`  对照图：${path.join(out, 'sheet.png')}`);
if (rep.rackFrontClearance) console.log(`  行板前方 5 cm：${rep.rackFrontClearance.intersectingTriangles} 个外壳三角面`);
if ((opt['rack-clearance'] || opt.lod !== undefined) && !rep.pass) process.exitCode=2;

// 把一张 2×2 的四视图拆成四张单独的图（给 Tripo 的「前 / 左侧 / 右侧 / 后」四个格子）。
//   node tools/art/split-views.mjs <四视图> <输出目录> [front=TR left=TL right=TL! back=BR]
// 四个格子：TL 左上、TR 右上、BL 左下、BR 右下；后面加 ! 表示水平翻转（左右对称的东西，右视图可以用左视图翻过来）。
// 默认按提示词里的排法：front=TL left=TR right=BL back=BR。图片模型经常把视角放错格，质检以后在命令行里改。
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const [src, outDir, ...map] = process.argv.slice(2);
if (!src || !outDir) { console.log('用法：node tools/art/split-views.mjs <四视图> <输出目录> [front=TR left=TL right=TL! back=BR]'); process.exit(1); }
const want = { front: 'TL', left: 'TR', right: 'BL', back: 'BR' };
for (const m of map) { const [k, v] = m.split('='); if (!(k in want) || !/^(TL|TR|BL|BR)!?$/.test(v || '')) { console.log('写法不对：' + m); process.exit(1); } want[k] = v; }
const meta = await sharp(src).metadata(), W = Math.floor(meta.width / 2), H = Math.floor(meta.height / 2);
const cell = { TL: [0, 0], TR: [W, 0], BL: [0, H], BR: [W, H] };
fs.mkdirSync(outDir, { recursive: true });
for (const [view, spec] of Object.entries(want)) {
  const [x, y] = cell[spec.replace('!', '')];
  let img = sharp(src).extract({ left: x, top: y, width: W, height: H });
  if (spec.endsWith('!')) img = img.flop();
  const file = path.join(outDir, view + '.png');
  await img.png().toFile(file);
  console.log(`${view.padEnd(5)} ← ${spec.padEnd(3)} → ${file}（${W}×${H}）`);
}

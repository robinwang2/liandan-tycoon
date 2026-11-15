// 打包后把单文件版复制到项目根目录，方便直接双击打开。
//   node tools/pack.mjs          → 3A 版：dist/index.html → 炼丹大亨-3A.html
//   node tools/pack.mjs classic  → 经典版：classic/dist/index.html → 炼丹大亨-经典版.html
import fs from 'node:fs';

const classic = process.argv[2] === 'classic';
const src = classic ? 'classic/dist/index.html' : 'dist/index.html', out = classic ? '炼丹大亨-经典版.html' : '炼丹大亨-3A.html';
fs.copyFileSync(src, out);
console.log(`已生成 ${out}（${(fs.statSync(out).size / 1024).toFixed(0)} KB），双击即可游玩。`);

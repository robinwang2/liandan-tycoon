// 小工具：按「原文 → 新文」替换，每条原文必须恰好出现一次；保留文件原来的换行（CRLF / LF）。
//   node rep.mjs <补丁.json>    补丁：{ "文件": [["原文", "新文"], ...] }
import { readFileSync, writeFileSync } from 'node:fs';
const patch = JSON.parse(readFileSync(process.argv[2], 'utf8'));
for (const [f, pairs] of Object.entries(patch)) {
  const raw = readFileSync(f, 'utf8'), crlf = raw.includes('\r\n');
  let s = raw.replace(/\r\n/g, '\n');
  for (const [a, b] of pairs) {
    const n = s.split(a).length - 1;
    if (n !== 1) throw new Error(`${f}：「${a.slice(0, 60)}」出现了 ${n} 次（应为 1 次）`);
    s = s.replace(a, () => b);
  }
  writeFileSync(f, crlf ? s.replace(/\n/g, '\r\n') : s);
  console.log(`✓ ${f}（${pairs.length} 处）`);
}

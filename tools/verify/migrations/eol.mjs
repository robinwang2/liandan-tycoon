// 把文件统一成 CRLF（Edit 工具插进来的新行可能是 LF）。node eol.mjs <文件...>
import { readFileSync, writeFileSync } from 'node:fs';
for (const f of process.argv.slice(2)) {
  const s = readFileSync(f, 'utf8'), lf = (s.match(/(?<!\r)\n/g) || []).length;
  if (lf) writeFileSync(f, s.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'));
  console.log(`${f}：${lf ? `改了 ${lf} 处 LF` : '已经是 CRLF'}`);
}

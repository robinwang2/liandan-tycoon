// 在当前工作树生成试验产物；素材目录始终只读。
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const assemble = process.argv[2] === '--assemble';
const script = fileURLToPath(new URL(assemble ? './egg-assemble-trial.py' : './egg-split-trial.py', import.meta.url));
const root = path.resolve(path.dirname(script), '../..');
const source = path.resolve(process.argv[assemble ? 3 : 2] || path.join(root, '../liandan-tycoon'));
const out = path.join(root, 'art-out/egg-split');
mkdirSync(out, { recursive: true });
// 链接工作树的 info/exclude 属于主仓库，使用等效的目录内排除，不改共享元数据。
writeFileSync(path.join(out, '.gitignore'), '*\n');
const result = spawnSync(process.env.BLENDER || 'D:/SteamLibrary/steamapps/common/Blender/blender.exe',
  ['-b', '--factory-startup', '--python-exit-code', '1', '-P', script, '--', source, out],
  { stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;

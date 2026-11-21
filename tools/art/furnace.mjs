// 从仓库内已下载的两份原模重建本地 Unity 包及六张质检对照页，不调用 Unity 或在线服务。
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname,'../..');
const source = 'art-src/tripo/run3';
const dest = 'unity/Game/Assets/Art/Props/Furnace/Resources/Furnaces';
for (const [variant,file,name] of [['Tripo','tripo','Furnace'],['Original','game','FurnaceOriginal']]) {
  const result = spawnSync(process.execPath,['tools/art/normalize.mjs',`${source}/furnace-${file}.glb`,
    '--name',name,'--out',`${dest}/${variant}`,'--height','2.511','--rotate-z','0','--budget','40000',
    '--qc',`${source}/normalized-qc/${variant}`,'--ref',`${source}/game-qc`,'--res','512'], { cwd:root, stdio:'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// 共用批次目录、选件表及 Unity 资源名，旧命令默认读第 1 批。
import { existsSync } from 'node:fs';

export function batchConfig(batchName) {
  if (!/^batch[1-9]\d*$/.test(batchName)) throw Error('无效批次：'+batchName);
  const batchLabel = 'B' + batchName.slice(1);
  const resource = batchName === 'batch8' ? 'B8' : batchLabel;
  const policy = batchName === 'batch8' ? 'PropPolicyBatch8' : batchName === 'batch1' ? 'PropPolicy' : 'PropPolicy' + batchLabel;
  if (!existsSync(new URL('../../unity/Game/Assets/Shell/Resources/'+policy+'.json',import.meta.url)))
    throw Error('缺少批次选件表：'+policy);
  return { batchName, resource, policy };
}

export function batchOptions(argv) {
  const args = [...argv], index = args.indexOf('--batch');
  const batchName = index < 0 ? 'batch1' : args.splice(index, 2)[1];
  if (args.includes('--batch')) throw Error('只能指定一个批次');
  return { args, ...batchConfig(batchName) };
}

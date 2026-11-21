// 共用批次目录、选件表及 Unity 资源名，旧命令默认读第 1 批。
export function batchOptions(argv) {
  const args = [...argv], index = args.indexOf('--batch');
  const batchName = index < 0 ? 'batch1' : args.splice(index, 2)[1];
  if (!['batch1','batch2'].includes(batchName) || args.includes('--batch')) throw Error('批次须为 batch1 或 batch2');
  const resource = 'B' + batchName.slice(1);
  const policy = batchName === 'batch1' ? 'PropPolicy' : 'PropPolicy' + resource;
  return { args, batchName, resource, policy };
}

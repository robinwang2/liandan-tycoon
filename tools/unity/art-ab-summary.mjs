const modes=['A','B'];
const labels={draws:'Draw Calls',batches:'Batches（批次数，不是 Draw Calls）',setpass:'SetPass Calls'};
const fields=['renderers','slots','materials','textures','litEligible','excluded','unknown'];

export function summarizeDraws(csv,structures) {
  const [header,...rows]=csv.trim().split(/\r?\n/);
  if(header!=='模式,帧,指标,计数器,值')throw Error('draws.csv 表头不匹配，请重新 build-game-art');
  const sources=new Map();
  for(const line of rows){
    const [mode,frame,metric,name,value,...extra]=line.split(',');
    if(!modes.includes(mode)||!Object.hasOwn(labels,metric)||!name||extra.length||!/^\d+$/.test(frame)||Number(frame)>=120||!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value)))throw Error('draws.csv 样本无效：'+line);
    if(!sources.has(name))sources.set(name,{name,metric,A:[],B:[]});
    const source=sources.get(name), samples=source[mode];
    if(source.metric!==metric || (samples.length && Number(frame)<=samples.at(-1).frame))throw Error('draws.csv 指标冲突或采样帧重复：'+line);
    samples.push({frame:Number(frame),value:Number(value)});
  }
  function median(samples){
    const values=samples.slice(-30).map(sample=>sample.value).sort((left,right)=>left-right);
    return values.length===30 && values[29]>0?(values[14]+values[15])/2:null;
  }
  const lines=[], data=[...sources.values()].sort((left,right)=>left.name.length-right.name.length||left.name.localeCompare(right.name));
  for(const mode of modes){
    const stats=structures.find(entry=>entry.mode===mode);
    if(!stats||typeof stats.srpBatcher!=='boolean'||!fields.every(key=>Number.isSafeInteger(stats[key])&&stats[key]>=0)||stats.renderers===0||stats.litEligible+stats.excluded+stats.unknown!==stats.renderers)throw Error(mode+' 结构统计缺失或无效');
    let measured=0;
    for(const [metric,label] of Object.entries(labels)){
      const candidates=data.filter(source=>source.metric===metric && median(source[mode])!==null);
      const chosen=candidates.find(source=>modes.every(key=>median(source[key])!==null))??candidates[0];
      if(chosen){lines.push(`${mode} 引擎实测：${label} = ${median(chosen[mode])}（${chosen.name}，最近 30 个已完成帧样本的中位数）`);measured++;}
      else lines.push(`${mode} ${label}：不可用（未发现、样本不足或持续为零）`);
    }
    if(!measured)lines.push(`${mode} 无可靠引擎计数，回退到结构统计。`);
    lines.push(`${mode} 结构统计（不是引擎实测）：Renderer ${stats.renderers}，材质槽 ${stats.slots}，不同材质 ${stats.materials}，不同贴图 ${stats.textures}。`,
      `  SRP Batcher 开关：${stats.srpBatcher?'开':'关'}；Renderer 兼容性初筛：标准 URP/Lit 候选 ${stats.litEligible}，已知不符合 ${stats.excluded}，未判定 ${stats.unknown}。`);
  }
  lines.push('结构范围：场景中启用且未强制关闭渲染的 Renderer（含各级 LOD，不按相机剔除）；材质与其绑定贴图按对象去重。兼容性初筛排除非网格类型及 MaterialPropertyBlock，不证明实际参与合批。');
  return lines;
}

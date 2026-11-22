import assert from 'node:assert/strict';
import test from 'node:test';
import { geometryErrors } from '../art/prop-geometry.mjs';
import { summarizeDraws } from '../unity/art-ab-summary.mjs';

test('电视背面贴墙，不是前面或厚度中心',()=>{
  const spec={w:2.2,d:.15,h:1.3,origin:'wall',budget:15000};
  const check={triangles:14999,size:{width:2.2,depth:.15,height:1.3},origin:{bottomZ:0,centerX:0,centerY:-.075}};
  assert.deepEqual(geometryErrors(check,spec,0),[]);
  for(const centerY of [0,.075])assert.match(geometryErrors({...check,origin:{...check.origin,centerY}},spec,0).join(),/贴墙面/);
});
test('上下铺远景允许单侧收缩，不放过超面、悬空或过度收缩',()=>{
  const spec={w:2,d:1,h:1.8,origin:'bottom',budget:15000};
  const check={triangles:1799,size:{width:2,depth:.94,height:1.8},origin:{bottomZ:0,centerX:0,centerY:-.03}};
  assert.deepEqual(geometryErrors(check,spec,2),[]);
  assert.match(geometryErrors(check,spec,0).join(),/深度中心/);
  assert.match(geometryErrors({...check,triangles:2101},spec,2).join(),/预算 2100/);
  assert.match(geometryErrors({...check,origin:{...check.origin,bottomZ:.021}},spec,2).join(),/高度锚点/);
  assert.match(geometryErrors({...check,size:{...check.size,depth:.87}},spec,2).join(),/深=/);
});
const header='模式,帧,指标,计数器,值';
const structures=['A','B'].map(mode=>({mode,srpBatcher:true,renderers:3,slots:4,materials:mode==='A'?3:1,textures:1,litEligible:2,excluded:1,unknown:0}));
const report=rows=>summarizeDraws([header,...rows].join('\r\n'),structures).join('\n');
const series=(mode,metric,name,count,fn)=>Array.from({length:count},(_,frame)=>`${mode},${frame},${metric},${name},${fn(frame)}`);
test('缺 Draw 不影响 Batches 或 SetPass；汇总保留零值并分别取中位数',()=>{
  const text=report([...series('A','batches','Render/Batches Count',30,frame=>frame),...series('B','batches','Render/Batches Count',30,()=>7),...series('B','setpass','Render Pipeline/SetPass Calls Count',30,()=>3)]);
  assert.match(text,/A Draw Calls：不可用/);assert.match(text,/A 引擎实测：Batches（批次数，不是 Draw Calls） = 14.5/);
  assert.match(text,/B 引擎实测：SetPass Calls = 3/);assert.match(text,/B 引擎实测：Batches[^\n]+ = 7/);
});
test('缺失、全零及不足 30 帧都回退；不得把回退写成实测 0',()=>{
  for(const rows of [[],series('A','setpass','Render/SetPass Calls Count',120,()=>0),series('A','draws','Render/Draw Calls Count',29,()=>10)]){
    const text=report(rows);assert.doesNotMatch(text,/引擎实测：/);
    for(const mode of ['A','B'])assert.ok(text.includes(mode+' 结构统计（不是引擎实测）'));
  }
  assert.throws(()=>report(['A,0,draws,Render/Draw Calls Count,-1']));
  assert.throws(()=>report(Array(2).fill('B,0,batches,Render/Batches Count,1')));
  assert.throws(()=>summarizeDraws(header,structures.slice(0,1)));
});

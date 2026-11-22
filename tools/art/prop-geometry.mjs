import { readFileSync } from 'node:fs';

const policy=JSON.parse(readFileSync(new URL('../../unity/Game/Assets/Shell/Resources/PropPolicy.json',import.meta.url),'utf8'));
export const budgetFor=(budget,level)=>Math.ceil(budget*policy.lodRules[level].budgetPercent/100);

export function geometryErrors(check,spec,level) {
  const rule=policy.lodRules[level],errors=[];
  function verify(label,actual,target,limit) {
    if(!(Math.abs(actual-target)<=limit+policy.epsilon)) errors.push(`${label}=${actual}，目标 ${target} ± ${limit} m`);
  }
  const {size,origin}=check;
  const budget=budgetFor(spec.budget,level);
  if(!(check.triangles>0 && check.triangles<=budget)) errors.push(`三角面 ${check.triangles}，预算 ${budget}`);
  verify('宽',size.width,spec.w,rule.widthDepth);verify('深',size.depth,spec.d,rule.widthDepth);verify('高',size.height,spec.h,rule.height);
  verify('横向中心',origin.centerX,0,rule.center);
  if(spec.origin==='wall')verify('贴墙面 max.y',origin.centerY+size.depth/2,0,rule.contact);
  else verify('深度中心',origin.centerY,0,rule.center);
  verify('高度锚点',origin.bottomZ+(spec.origin==='ceiling'?size.height:0),0,rule.contact);
  return errors;
}

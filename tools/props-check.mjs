// Real-kit integration check. Run: node tools/props-check.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { makeKit, bake } from '../src/scene3a/kit.js';
import { PROPS } from '../src/scene3a/props.js';
import { PROPS as OLD } from '../src/scene/props.js';

const expected = {
  desk_set:[1.5,.75,1.25], office_chair:[.65,.65,1.05], desk_lamp:[.3,.3,.5], server_rack:[.7,1,2.1], rack_cooling:[.7,1,2.1], whiteboard:[1.8,.5,1.9], tv_wall:[2.2,.15,1.3], poster_frame:[.9,.05,1.2], pendant_lamp:[.5,.5,1.2], wall_clock:[.4,.06,.4], fire_extinguisher:[.25,.2,.6], ac_split:[.9,.25,.3], locker:[1.2,.5,1.9], standing_desk:[1.5,.75,1.5], glass_room:[4.2,3.2,2.6], pantry:[2.6,.7,2.1], gong:[1,.5,1.5], neon_slogan:[2.4,.12,.6],
  traffic_light:[.5,2.6,4.2], bus_stop:[3.6,1.5,2.6], billboard:[6,.6,5.2], billboard_roof:[6,1,3.2], neon_sign:[.9,.3,3.2], shop_awning:[3,1.1,.9], food_cart:[1.8,1.2,2.2], food_truck:[2.4,5.2,3], kiosk:[2,2,2.6], bike_rack:[3.2,1.8,1.1], planter_box:[1.6,.6,.9], bollard:[.2,.2,.8], trash_public:[.6,.5,1], parking_meter:[.25,.25,1.3], manhole:[.8,.8,.03], utility_pole:[1.8,.4,7.5], power_box:[1,.5,1.4], scaffold:[4,1.2,6], crane_tower:[14,3,30], tree_street:[2.4,2.4,4.6], tree_cypress:[1,1,5], flower_bed:[2.4,1.2,.5],
  ac_unit:[1,.45,.8], water_tank:[1.6,1.6,2.4], water_tower_wood:[2,2,3.4], roof_vent:[.8,.8,.9], roof_hvac:[2.6,1.6,1.4], solar_array:[3.2,2,.8], sat_dish:[1.2,1.2,1.3], antenna_mast:[.6,.6,6], roof_garden:[4,3,2.4], helipad:[7,7,.1], laundry_line:[2.4,.6,1.9],
  car_sedan:[1.5,3.3,1.2], car_suv:[1.6,3.5,1.45], car_hatch:[1.45,2.9,1.25], car_pickup:[1.7,4,1.5], car_taxi:[1.5,3.3,1.35], robotaxi:[1.6,3.5,1.75], van_delivery:[1.7,4.2,2.1], bus_city:[2.2,8,2.6], scooter_delivery:[.7,1.7,1.5],
};
for (const [n, p] of Object.entries(OLD)) assert.deepEqual(PROPS[n]?.size, p.size, `${n}: legacy size changed`);
for (const [n, s] of Object.entries(expected)) assert.deepEqual(PROPS[n]?.size, s, `${n}: missing or wrong dimensions`);
assert.equal(Object.keys(PROPS).length, Object.keys(OLD).length + Object.keys(expected).length, 'unexpected/missing prop');
const source = readFileSync(new URL('../src/scene3a/props.js', import.meta.url), 'utf8');
assert(!/Math\.random\s*\(/.test(source), 'nondeterministic random');
assert(!/new\s+(?:\w+\.)*(?:\w*Light|\w*Texture|Mesh\w*Material)\s*\(/.test(source), 'props must use kit materials and no lights/textures');
const small = new Set('plant_small trash_bin coffee_table desk_lamp pendant_lamp wall_clock fire_extinguisher ac_split poster_frame neon_slogan bollard parking_meter manhole roof_vent skateboard surfboard lucky_cat traffic_cone mailbox flower_bed'.split(' '));
const budget = n => ['crane_tower','glass_room','roof_garden','scaffold'].includes(n) ? 40000 : /^(car|robotaxi|van_|bus_city|scooter|food_truck)/.test(n) ? 20000 : /tree|bush|plant_tall/.test(n) ? 14000 : small.has(n) ? 6000 : 15000;
const errors = [], rows = [], k = makeKit();
function stats(g) {
  let tris = 0, meshes = 0; const mats = new Set();
  g.traverse(n => { if (n.isMesh) { assert(n.geometry?.attributes.position, 'mesh without positions'); tris += (n.geometry.index?.count ?? n.geometry.attributes.position.count) / 3; meshes++; (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => mats.add(m)); } assert(!n.isLight, 'prop creates a light'); });
  return { tris, meshes, mats };
}
function fingerprint(g) {
  g.updateMatrixWorld(true); const h = createHash('sha256');
  g.traverse(n => {
    h.update(JSON.stringify([n.type, n.name, n.matrixWorld.elements, !!n.userData.dynamic]));
    if (n.isMesh) {
      for (const a of Object.values(n.geometry.attributes)) { assert(Array.from(a.array).every(Number.isFinite), 'nonfinite geometry'); h.update(Buffer.from(a.array.buffer, a.array.byteOffset, a.array.byteLength)); }
      if (n.geometry.index) h.update(Buffer.from(n.geometry.index.array.buffer, n.geometry.index.array.byteOffset, n.geometry.index.array.byteLength));
      h.update(JSON.stringify([n.material.color?.getHex(), n.material.roughness, n.material.metalness, n.material.opacity, n.material.emissive?.getHex(), n.material.emissiveIntensity]));
    }
  }); return h.digest('hex');
}
function within(name, g, size) {
  const b = new THREE.Box3().setFromObject(g, true), [w,d,h] = size, pad = 0.0001;
  assert(!b.isEmpty(), 'empty prop');
  const lo = [-w*.56, 0, -d*.56], hi = [w*.56, h*1.12, d*.56];
  if (name === 'scroll') { lo[1] = -h*.56; hi[1] = h*.56; }
  if (name === 'pendant_lamp' || name === 'shop_awning') { lo[1] = -h*1.12; hi[1] = .015; }
  if (['tv_wall','poster_frame','neon_slogan'].includes(name)) { lo[2] = -.005; hi[2] = d*1.12; }
  if (name === 'shop_awning') { lo[2] = -.02; hi[2] = d*1.12; }
  if (name === 'neon_sign') { lo[0] = -.005; hi[0] = w*1.12; }
  lo[1] -= .025;
  for (let i=0;i<3;i++) assert(b.min.getComponent(i) >= lo[i]-pad && b.max.getComponent(i) <= hi[i]+pad, `bounds ${'xyz'[i]}: [${b.min.getComponent(i).toFixed(3)}, ${b.max.getComponent(i).toFixed(3)}], allowed [${lo[i].toFixed(3)}, ${hi[i].toFixed(3)}]`);
  if (!['scroll','pendant_lamp','shop_awning'].includes(name)) assert(Math.abs(b.min.y) <= .035, `bottom is ${b.min.y.toFixed(3)}, should touch y=0`);
  if (name === 'pendant_lamp' || name === 'shop_awning') assert(Math.abs(b.max.y) <= .035, 'hanging origin must touch y=0');
}
function transforms(g) { const m = new Map(); g.traverse(n => m.set(n, JSON.stringify([n.position.toArray(), n.quaternion.toArray(), n.scale.toArray(), n.visible]))); return m; }
function preserved(n, root) { for (let p=n;p && p!==root;p=p.parent) if (p.userData.dynamic) return true; return false; }
for (const [name,spec] of Object.entries(PROPS)) {
  let peak = 0, materials = 0, bakedMeshes = 0, hasTick = false;
  for (let seed=0;seed<4;seed++) {
    let g, twin, b;
    try {
      const o = { seed, brand:'#3d968d' }; g = spec.build(k,o); twin = spec.build(k,o);
      assert(g.isGroup && twin.isGroup, 'build must return THREE.Group');
      g.userData.tick?.(0,0); twin.userData.tick?.(0,0);
      const s = stats(g); assert.equal(s.tris, stats(twin).tris, 'same seed triangle mismatch');
      assert.equal(fingerprint(g), fingerprint(twin), 'same seed geometry/material/transform mismatch');
      assert(s.tris <= budget(name), `triangles ${s.tris} > ${budget(name)}`);
      peak = Math.max(peak,s.tris); materials = Math.max(materials,s.mats.size); hasTick ||= !!g.userData.tick;
      within(name,g,spec.size);
      const original = transforms(g), originalMaterials = new Map([...s.mats].map(m=>[m,JSON.stringify([m.color.toArray(),m.emissive?.toArray(),m.emissiveIntensity,m.opacity])]));
      for (const t of [.2,1.5,3,6,7.5,10,13.49,13.5,27,35,100]) {
        g.userData.tick?.(t,1/60); within(name,g,spec.size);
        for (const [n,state] of original) if (JSON.stringify([n.position.toArray(),n.quaternion.toArray(),n.scale.toArray(),n.visible]) !== state) assert(preserved(n,g), `tick mutates unpreserved ${n.name || n.type}`);
        for (const [m,state] of originalMaterials) if (JSON.stringify([m.color.toArray(),m.emissive?.toArray(),m.emissiveIntensity,m.opacity]) !== state) assert(g.userData.own?.includes(m), 'tick changes a shared material');
      }
      for (const m of g.userData.own || []) assert(!stats(twin).mats.has(m), 'owned material is shared between builds');
      if (name === 'server_rack') { const leds = g.getObjectByName('leds'); assert(leds?.isGroup && leds.userData.dynamic, 'missing dynamic leds'); assert(leds.children.length > 0 && leds.children.length <= 24, 'LED budget'); }
      if (/^(car|robotaxi|van_|bus_city|food_truck)/.test(name)) { assert.equal(g.userData.wheels?.length,4,'four wheels required'); for (const w of g.userData.wheels) assert(w.isGroup && w.userData.dynamic,'wheel is not a dynamic group'); }
      const retained = []; g.traverse(n => { if(n.userData.dynamic) retained.push(n); });
      g.userData.tick?.(0,0); b = bake(g); assert.equal(stats(b).tris,s.tris,'bake lost triangles');
      bakedMeshes = Math.max(bakedMeshes, stats(b).meshes);
      for (const n of retained) { let p=n; while(p && p!==b) p=p.parent; assert.equal(p,b,'dynamic subtree lost during bake'); }
      g.userData.tick?.(2,1/60); within(name,b,spec.size);
    } catch(e) { errors.push(`${name} seed=${seed}: ${e.message}`); }
    finally { b?.userData.dispose?.(); for(const p of [g,twin]) for(const m of p?.userData.own || []) { m.dispose(); for(let i=k.nightMats.length-1;i>=0;i--) if(k.nightMats[i][0]===m) k.nightMats.splice(i,1); } }
  }
  rows.push({ prop:name, triangles:peak, materials, bakedMeshes, tick:hasTick?'yes':'—', budget:budget(name) });
}
// External artwork must stay one complete UV plane and survive static batching.
for (const name of ['desk_set','standing_desk','rack_cooling','tv_wall','poster_frame','glass_room','bus_stop','billboard','billboard_roof','parking_meter','arcade','water_cooler','printer','bus_city']) {
  try {
    const screen = k.mat('#eb40a8'), art = k.mat('#3f87f5'), g = PROPS[name].build(k,{seed:1,screen,art});
    const kind = ['poster_frame','bus_stop','billboard','billboard_roof'].includes(name)?'art':'screen';
    const n=g.userData[kind]; assert(n?.isMesh,`${kind} handle missing`); assert.equal(n.material,kind==='art'?art:screen,'supplied material ignored'); assert.equal(n.geometry.type,'PlaneGeometry','surface must be a plane');
    const uv=n.geometry.attributes.uv; assert.equal(Math.min(...uv.array),0); assert.equal(Math.max(...uv.array),1); assert(preserved(n,g),'surface handle will be invalid after bake');
    const b=bake(g); assert(n.parent?.parent===b || n.parent===b,'surface not retained'); b.userData.dispose();
  } catch(e) { errors.push(`${name} override: ${e.message}`); }
}
// Contract-specific orientation and signal phases, including night scaling.
try {
  for (let seed=0;seed<4;seed++) {
    const g=PROPS.desk_set.build(k,{seed}); g.updateMatrixWorld(true);
    for (const screen of g.userData.screens) assert(new THREE.Vector3(0,0,1).transformDirection(screen.matrixWorld).z<-.99,'desk screen must face seated user at -Z');
  }
  const g=PROPS.traffic_light.build(k), owned=g.userData.own;
  for(const [m,,night]of k.nightMats)m.emissiveIntensity=night;
  for(const [t,on]of [[0,2],[5.999,2],[6,1],[7.499,1],[7.5,0],[13.499,0],[13.5,2]]) {
    g.userData.tick(t,0); assert(owned[on].emissiveIntensity>2,'active night signal too dim'); assert(owned.every((m,i)=>i===on||m.emissiveIntensity<.01),'inactive signal still lit');
  }
  for(const [m,day]of k.nightMats)m.emissiveIntensity=day;
  g.userData.tick(0,0); assert(owned[2].emissiveIntensity<.5,'day signal ignores night scaling');
  for(const m of owned)m.dispose();
} catch(e) { errors.push(`specific contracts: ${e.message}`); }
console.table(rows);
k.dispose();
if (errors.length) { console.error(errors.join('\n')); console.error(`PROPS FAILED ${errors.length}`); process.exitCode=1; }
else console.log(`PROPS OK ${Object.keys(PROPS).length}`);

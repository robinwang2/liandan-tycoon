import * as THREE from 'three';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createRoom } from '../../src/scene3a/office.js';
import { makeKit } from '../../src/scene3a/kit.js';
import { PROPS } from '../../src/scene3a/props.js';
import { FLOOR_PLANS, TRAITS, TRACKS } from '../../src/data/defs.js';
import { archive, canvas, transform } from './office-mesh.mjs';
import { streetSnapshot } from './office-street.mjs';

const assets=process.argv[2]?path.resolve(process.argv[2],'Assets'):fileURLToPath(new URL('../../unity/Game/Assets/',import.meta.url));
const folder=path.join(assets,'StreamingAssets/office'), store=archive(folder);
globalThis.document={createElement:canvas};
const kit=makeKit();kit.bake=root=>root;
const posters='launch robots awakening datacenter leaderboard furnace pitch party press market bubble lab seminar bay urban_village bell'.split(' ');
async function posterMaterial(key,tall){
  const input=fileURLToPath(new URL(`../../src/assets/art/${key}.webp`,import.meta.url));
  const img=sharp(input),{width,height}=await img.metadata(),crop=Math.round(width*.31);
  if(tall)img.extract({left:Math.floor((width-crop)/2),top:0,width:crop,height});
  const name=(tall?'poster-':'billboard-')+key;
  await img.resize({height:384}).png().toFile(path.join(folder,name+'.png'));
  const mat=new THREE.MeshStandardMaterial({roughness:tall?.45:.6,emissive:0xffffff,emissiveIntensity:tall?.03:.1});
  mat.userData.poster=name;return mat;
}
const [tall,wide]=await Promise.all([true,false].map(shape=>Promise.all(posters.map(key=>posterMaterial(key,shape)))));
const poster=(list,seed)=>list[((seed%list.length)+list.length)%list.length];
const art={mat:seed=>poster(tall,seed),wide:seed=>poster(wide,seed)};
const templates=new Map(),source=new Map(),stats=new Map(),layouts=[],actors=new Map(),streets=new Map();
const props=Object.fromEntries(Object.keys(PROPS).map(id=>[id,{size:PROPS[id].size,build(_,options={}){
  const marker=new THREE.Group();marker.userData.placement={id,options};marker.add(new THREE.Group());return marker;
}}]));
const stockPath=path.join(assets,'Art/Props');
const pivots=[];
for(const file of (fs.existsSync(stockPath)?fs.readdirSync(stockPath,{recursive:true}):[]).map(String).sort()){
  const match=file.replaceAll('\\','/').match(/\/Resources\/(.+\/([^/]+)\/SM_\2)\.fbx$/i);
  if(!match)continue;
  // During art ingestion a raw FBX may appear before its Unity import policy.
  const batch=/^(?:B|Batch)(\d+)\//.exec(match[1]);
  if(!batch || !fs.existsSync(path.join(assets,'Shell/Resources',
    batch[1]==='1'?'PropPolicy.json':`PropPolicyBatch${batch[1]}.json`)))continue;
  source.set(match[2],match[1]);
  const report=path.join(stockPath,path.dirname(file),'report.json');
  if(fs.existsSync(report)){
    // One off-axis LOD0 pivot distinguishes the two axis conversions accepted by PropImport.
    const points=JSON.parse(fs.readFileSync(report,'utf8')).pivots??[];
    const probe=points.sort((a,b)=>Math.hypot(b.x,b.z)-Math.hypot(a.x,a.z))[0];
    if(probe && Math.hypot(probe.x,probe.z)>.001)pivots.push({resource:match[1],node:`SM_${match[2]}_${probe.node}_LOD0`,x:probe.x,z:-probe.z});
  }
}
function variant(id,options){
  const key=JSON.stringify({...options,screen:options.screen?.map.image.svg(),art:options.art?.userData.poster});
  const cache=id+key;if(!templates.has(cache)){const root=PROPS[id].build(kit,options);root.userData.tick?.(0,0);templates.set(cache,store.model(root));}
  return templates.get(cache);
}
const roles=['res','eng','ops','biz','legal'];
const seats=new Map();
function build(region,level,district,track,floor){
  let random=0x813d122;Math.random=()=>((random=(Math.imul(random,1664525)+1013904223)>>>0)/4294967296);
  let frame;const scene=new THREE.Scene(),room=createRoom({scene,st:{az:Math.PI/4},onFrame(fn){frame=fn;return ()=>{};},setFrame(){},setLift(){}},kit,props,art);
  const seatKey=level+':'+floor+':'+(level===1?district:'');
  // Sample until the web seat allocator repeats. Every department fits in 42 slots.
  const staff=seats.has(seatKey)?[]:Array.from({length:level<5?43:43*roles.length},(_,i)=>({id:'e'+i,role:roles[i%5]}));
  const info=room.sync({mode:'play',level,region,district,track,floor,staff,racks:12,own:true,motion:false});
  frame(0,0,{night:0});scene.updateMatrixWorld(true);
  const world=scene.children[0],[roomG,floorsG,rackG,furnaceG,actorsG,fxG]=world.children;
  const frameSize=info.frame||info.L, instances=[];
  function add(node,id,model,seed=0,resource=source.get(id)||''){
    instances.push({id,seed,resource,model,...transform(node.matrixWorld)});
    stats.set(id,resource?'prefab':'procedural');
  }
  function collect(node){
    const item=node.userData.placement;
    if(item){add(node,item.id,variant(item.id,item.options),item.options.seed||0);}
    else if(node.name==='elevator_car')add(node,node.name,store.model(node));
  }
  world.traverseVisible(collect);
  if(furnaceG.visible){const furnace=furnaceG.children[0];if(!templates.has('furnace'))templates.set('furnace',store.model(furnace));
    const resource='Furnaces/Tripo/SM_Furnace';add(furnace,'furnace',templates.get('furnace'),0,fs.existsSync(path.join(assets,'Art/Props/Furnace/Resources',resource+'.fbx'))?resource:'');}
  if(!seats.has(seatKey)){
    const samples=[],seen=new Set();for(const [index,node] of actorsG.children.entries()){
      if(level>=5 && (floor<0||Math.abs(node.position.y-floor*(info.L.H+.5))>.1))continue;
      const role=index===0?'founder':staff[index-1].role,slot=level<5?index-1:Math.floor((index-1)/roles.length);
      const pose=node.children[0].position.y>.08?'sit':'stand', key=role+pose;
      const positionKey=[level>=5||role==='founder'?role:'staff',...node.position.toArray()].join(':');
      if(seen.has(positionKey))continue;
      seen.add(positionKey);
      if(!actors.has(key)){const rig=node.children[0];rig.name='rig';rig.children.forEach((part,index)=>part.name=['leg_l','leg_r','torso','arm_l','arm_r','head'][index]||'accessory');actors.set(key,store.model(node));}
      samples.push({role,pose,slot,...transform(node.matrixWorld)});
    }seats.set(seatKey,samples);
  }
  const omit=node=>Boolean(node.userData.placement)||node===rackG||node===furnaceG||node===actorsG||node===fxG||node.name==='elevator_car';
  for(const [index,sprite] of floorsG.children.filter(node=>node.isSprite && node.visible).entries()){
    const geo=new THREE.PlaneGeometry(1,1).translate(.5-sprite.center.x,.5-sprite.center.y,0);
    const label=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({map:sprite.material.map,transparent:true,side:THREE.DoubleSide}));
    label.name=`floor-label-${index+1}`;label.quaternion.setFromEuler(new THREE.Euler(-.6,Math.PI/4,0,'YXZ'));label.scale.copy(sprite.scale);label.position.copy(sprite.position);floorsG.add(label);
  }
  const shell=store.model(world,omit,true),cable=rackG.visible?store.model(rackG,node=>Boolean(node.userData.placement),true):'';
  if(!roomG||!floorsG||!instances.length||!store.models.get(shell).parts.some(p=>p.bins.length))throw Error('Empty office');
  const streetKey=[region,level,district].join(':');
  if(!streets.has(streetKey)){
    const street=streetSnapshot(kit,props,art.wide,region,level,district,info.L),start=instances.length;
    street.root.traverseVisible(collect);
    streets.set(streetKey,{model:store.model(street.root,node=>!!node.userData.placement),items:instances.splice(start)});street.dispose();
  }
  const street=streets.get(streetKey);instances.push(...street.items);
  let egg=null,eggCable='';if(furnaceG.visible){room.sync({own:false,racks:0,staff:[]});frame(0,0,{night:0});scene.updateMatrixWorld(true);
    const node=furnaceG.children[0];if(!templates.has('egg'))templates.set('egg',store.model(node));add(node,'office_egg',templates.get('egg'));egg=instances.pop();eggCable=store.model(furnaceG.children[1],()=>false,true);}
  layouts.push({region,level,district,track,floor,floors:info.floors,w:frameSize.W,d:frameSize.D,h:frameSize.H,target:frameSize.H*.3+info.lift,shell,street:street.model,cable,egg,eggCable,instances,actors:seats.get(seatKey)});
  room.dispose();kit.nightMats.length=0;
}
for(const region of ['sz','bay'])for(let level=1;level<=8;level++){
  const districts=level<=2?TRAITS.district.filter(x=>x.region===region).map(x=>x.id):[''];
  const tracks=level<5?['',...Object.keys(TRACKS)]:[''];
  for(const district of districts)for(const track of tracks)for(let floor=-1;floor<(FLOOR_PLANS[level]?.length||0);floor++)build(region,level,district,track,floor);
  console.log(region,level,layouts.length+' layouts');
}
await Promise.all(store.pending);
const catalog={version:3,layouts,pivots,actorModels:[...actors].map(([key,model])=>({key,model})),models:[...store.models.values()],materials:[...store.materials.values()]};
fs.writeFileSync(path.join(folder,'layouts.tmp'),JSON.stringify(catalog));fs.renameSync(path.join(folder,'layouts.tmp'),path.join(folder,'layouts.json'));
for(const file of fs.readdirSync(folder)){const match=/^([a-f0-9]{32})\.(mesh\.gz|png)$/.exec(file);if(match&&!(match[2]==='png'?store.images:store.meshes).has(match[1]))fs.unlinkSync(path.join(folder,file));}
for(const type of ['prefab','procedural']){const ids=[...stats].filter(([,kind])=>kind===type).map(([id])=>id).sort();console.log(type,ids.length,ids.join(','));}
console.log('layouts',layouts.length,'models',store.models.size,'mesh bins',store.meshes.size);

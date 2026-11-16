import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { makeKit, bake } from './kit.js';
import { PROPS } from './props.js';

const canvas=document.querySelector('#scene');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.05;
const scene=new THREE.Scene(); scene.background=new THREE.Color('#d7dfd7');
const pmrem=new THREE.PMREMGenerator(renderer), room=new RoomEnvironment();
const environment=pmrem.fromScene(room,.045); scene.environment=environment.texture; room.dispose(); pmrem.dispose();
scene.environmentIntensity=.8;
const sun=new THREE.DirectionalLight('#fff0d1',3.6); sun.position.set(-20,32,24); sun.castShadow=true;
sun.shadow.mapSize.set(4096,4096); sun.shadow.normalBias=.018; sun.shadow.bias=-.00015; sun.shadow.radius=3;
scene.add(sun,sun.target);
const camera=new THREE.PerspectiveCamera(35,innerWidth/innerHeight,.01,1000);
const controls=new OrbitControls(camera,canvas); controls.enableDamping=true; controls.dampingFactor=.08;
controls.minDistance=.35; controls.maxDistance=280; controls.maxPolarAngle=Math.PI*.49;
const labels=new CSS2DRenderer(); labels.domElement.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:2'; document.body.append(labels.domElement);
const selector=document.querySelector('#prop'), params=new URLSearchParams(location.search);
const palette=[['jade','#398d80'],['copper','#be7054'],['saffron','#d6ab3f'],['cobalt','#497ca7']];
let brandIndex=0,seed=Number(params.get('seed')||0)|0,night=params.get('night')==='1',selected=params.get('prop')||'',kit,world,items=[],categoryLabels=[],elapsed=0;
const order=['Office','Botanical','Street','Rooftop','Vehicles'];
const entries=order.flatMap(category=>Object.entries(PROPS).filter(([,p])=>p.category===category));
for(const category of order){const og=document.createElement('optgroup');og.label=category;for(const [name,p] of entries.filter(([,p])=>p.category===category)){const opt=document.createElement('option');opt.value=name;opt.textContent=name;og.append(opt);}selector.append(og);}
function label(text,category=false){const e=document.createElement('div');e.className='label'+(category?' category':'');e.textContent=text;return new CSS2DObject(e);}
function metrics(g){let triangles=0,meshes=0;const mats=new Set();g.traverse(n=>{if(n.isMesh){meshes++;triangles+=(n.geometry.index?.count??n.geometry.attributes.position.count)/3;mats.add(n.material);}});return{triangles,meshes,materials:mats.size};}
function release(){if(!world)return;for(const item of items){item.model.userData.dispose?.();for(const m of item.own)m.dispose();}world.traverse(n=>{if(n.isCSS2DObject)n.element.remove();});scene.remove(world);kit.dispose();}
function populate(){
  release();kit=makeKit();world=new THREE.Group();scene.add(world);items=[];categoryLabels=[];
  let z=-25;
  for(const category of order){
    const groupEntries=entries.filter(([,p])=>p.category===category);
    const title=label(category,true);title.position.set(-22,.02,z-3);world.add(title);categoryLabels.push(title);
    let x=-19,rowDepth=0;
    for(const [name,spec] of groupEntries){
      const [w,d,h]=spec.size,cellW=Math.max(4.5,w+1.5),cellD=Math.max(4.4,d+1.7);
      if(x+cellW/2>23){x=-19;z+=rowDepth+1;rowDepth=0;}
      const px=x+cellW/2, pz=z+cellD/2;
      const source=spec.build(kit,{brand:palette[brandIndex][1],seed});source.userData.tick?.(0,0);
      const stat=metrics(source),tick=source.userData.tick,wheels=source.userData.wheels||[],own=source.userData.own||[];
      const holder=new THREE.Group();holder.position.set(px,.08,pz);world.add(holder);
      const mount=name==='pendant_lamp'?1.7:name==='string_lights'?1.6:name==='shop_awning'?1.1:name==='scroll'?.6:0;
      const model=bake(source);model.position.y=mount;holder.add(model);
      const stage=kit.box(cellW-.25,.08,cellD-.25,kit.mat('#e6e7db',{rough:.88,metal:0,tex:'concrete'}),holder,0,-.04,0,{r:.018});
      const tag=label(name);tag.position.set(0,.07,cellD/2-.3);holder.add(tag);
      const box=new THREE.Box3().setFromObject(model,true), center=box.getCenter(new THREE.Vector3());
      items.push({name,spec,holder,model,stage,tag,tick,wheels,own,...stat,x:px,z:pz,mount,center});
      x+=cellW+.6;rowDepth=Math.max(rowDepth,cellD);
    }
    z+=rowDepth+7;
  }
  const floor=kit.box(58,.14,z+42,kit.mat('#c5cfc3',{rough:.95,metal:0,tex:'concrete'}),world,0,-.15,(z-33)/2,{r:.03,cast:false});floor.receiveShadow=true;
  world.userData.bounds=new THREE.Box3(new THREE.Vector3(-25,0,-28),new THREE.Vector3(25,30,z));
  document.querySelector('#seed').textContent=`Seed · ${seed}`;document.querySelector('#brand').textContent=`Brand · ${palette[brandIndex][0]}`;
  focus(selected);setNight(night);
  window.propsDemo={count:items.length,report:items.map(({name,triangles,materials,meshes})=>({name,triangles,materials,meshes})),focus, get seed(){return seed;},get night(){return night;}};
}
function focus(name){
  selected=PROPS[name]?name:'';selector.value=selected;const item=items.find(i=>i.name===selected);
  for(const i of items){i.holder.visible=!item||i===item;i.tag.visible=!item;}
  categoryLabels.forEach(l=>l.visible=!item);
  let center,span;
  if(item){center=item.holder.position.clone().add(item.center);const s=item.spec.size;span=Math.max(s[0],s[1],s[2],.45);controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(1.15,.85,1.55).normalize().multiplyScalar(span*2.6));
    document.querySelector('#category').textContent=`${item.spec.category} · ${String(items.indexOf(item)+1).padStart(3,'0')} / ${items.length}`;
    document.querySelector('#title').textContent=item.name;
    document.querySelector('#detail').textContent=`${s.join(' × ')} m · ${item.triangles.toLocaleString()} triangles · ${item.materials} materials · ${metrics(item.model).meshes} meshes after batching${item.tick?' · animated':''}. ${item.name==='car'?'Legacy footprint, hatchback detailing.':item.mount?'Presented at display height; native origin preserved.':'Front faces +Z.'}`;
  }else{center=world.userData.bounds.getCenter(new THREE.Vector3());center.y=1;span=world.userData.bounds.getSize(new THREE.Vector3()).z;controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(span*.36,span*.7,span*.76));
    document.querySelector('#category').textContent='The complete collection';document.querySelector('#title').textContent=`${items.length} little stories`;
    document.querySelector('#detail').textContent='Five material studies: office life, layered foliage, streets, rooftops, and vehicles. Select a miniature to inspect its construction.';
  }
  const shadowSpan=item?Math.max(span*1.2,2):Math.max(span*.6,35);
  sun.target.position.copy(center);sun.position.copy(center).add(new THREE.Vector3(-.7,1.3,.9).multiplyScalar(Math.max(span,15)));
  Object.assign(sun.shadow.camera,{left:-shadowSpan,right:shadowSpan,top:shadowSpan,bottom:-shadowSpan,near:.1,far:Math.max(span*5,100)});sun.shadow.camera.updateProjectionMatrix();sun.shadow.needsUpdate=true;
  camera.near=Math.max(.005,span/3000);camera.far=600;camera.updateProjectionMatrix();controls.update();
  const url=new URL(location);selected?url.searchParams.set('prop',selected):url.searchParams.delete('prop');history.replaceState(null,'',url);
}
function setNight(value){night=value;document.body.classList.toggle('night',night);scene.background.set(night?'#152936':'#d7dfd7');scene.environmentIntensity=night?.13:.8;sun.intensity=night?.35:3.6;sun.color.set(night?'#94b9db':'#fff0d1');renderer.toneMappingExposure=night?1.18:1.05;for(const [m,day,dark]of kit.nightMats)m.emissiveIntensity=night?dark:day;const b=document.querySelector('#day-night');b.textContent=night?'Day':'Night';b.setAttribute('aria-pressed',String(night));}
selector.addEventListener('change',()=>focus(selector.value));document.querySelector('#overview').onclick=()=>focus('');
const step=delta=>focus(items[(items.findIndex(i=>i.name===selected)+delta+items.length)%items.length].name);
document.querySelector('#previous').onclick=()=>step(-1);document.querySelector('#next').onclick=()=>step(1);
document.querySelector('#day-night').onclick=()=>setNight(!night);document.querySelector('#brand').onclick=()=>{brandIndex=(brandIndex+1)%palette.length;populate();};document.querySelector('#seed').onclick=()=>{seed=(seed+1)>>>0;populate();};
addEventListener('keydown',e=>{if(e.target.matches('select,input,button'))return;if(e.key==='ArrowRight')step(1);if(e.key==='ArrowLeft')step(-1);if(e.key==='Escape')focus('');if(e.key.toLowerCase()==='n')setNight(!night);});
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);labels.setSize(innerWidth,innerHeight);}addEventListener('resize',resize);resize();populate();
let previous=performance.now(),lastStatus=0;
renderer.setAnimationLoop(now=>{const dt=Math.min(.05,(now-previous)/1000);previous=now;elapsed+=dt;for(const item of items){item.tick?.(elapsed,dt);for(const wheel of item.wheels)wheel.rotation.x+=dt*.6;}controls.update();renderer.render(scene,camera);labels.render(scene,camera);if(now-lastStatus>1000){lastStatus=now;document.querySelector('#status').textContent=`${renderer.info.render.calls} draw calls · ${renderer.info.render.triangles.toLocaleString()} visible triangles`;}});
addEventListener('pagehide',()=>{renderer.setAnimationLoop(null);controls.dispose();release();environment.dispose();renderer.dispose();labels.domElement.remove();},{once:true});

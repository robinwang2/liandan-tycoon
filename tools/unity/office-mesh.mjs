import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdirSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const digest = data => createHash('sha256').update(data).digest('hex').slice(0,32);
const round = value => Math.round(value * 1e6) / 1e6;
export function transform(matrix) {
  const pos=new THREE.Vector3(), rot=new THREE.Quaternion(), scale=new THREE.Vector3();
  matrix.decompose(pos,rot,scale);
  return {p:[pos.x,pos.y,-pos.z].map(round),q:[-rot.x,-rot.y,rot.z,rot.w].map(round),s:scale.toArray().map(round)};
}

export function canvas() {
  const elements=[], escape=text=>String(text).replaceAll('&','&amp;').replaceAll('<','&lt;');
  let path='';
  const ctx={fillStyle:'#000',strokeStyle:'#000',lineWidth:1,font:'16px sans-serif',textAlign:'left',
    fillRect(x,y,w,h){elements.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${this.fillStyle}"/>`);},
    clearRect(){elements.length=0;},strokeRect(x,y,w,h){elements.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${this.strokeStyle}"/>`);},
    beginPath(){path='';}, moveTo(x,y){path+=`M${x} ${y}`;},lineTo(x,y){path+=`L${x} ${y}`;}, closePath(){path+='Z';},
    roundRect(x,y,w,h){path=`M${x} ${y}h${w}v${h}h${-w}Z`;},fill(){elements.push(`<path d="${path}" fill="${this.fillStyle}"/>`);},
    stroke(){elements.push(`<path d="${path}" fill="none" stroke="${this.strokeStyle}" stroke-width="${this.lineWidth}"/>`);},
    measureText(text){return {width:[...text].reduce((sum,ch)=>sum+(ch.charCodeAt(0)>255?1:.57),0)*Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1]||16)};},
    fillText(text,x,y){if(x===612 && y===70 && this.textAlign==='right')return;elements.push(`<text x="${x}" y="${y}" font-family="Microsoft YaHei, sans-serif" font-size="${/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1]||16}" text-anchor="${({center:'middle',right:'end'})[this.textAlign]||'start'}" dominant-baseline="central" fill="${this.fillStyle}">${escape(text)}</text>`);},
    createRadialGradient(){return {addColorStop(){},toString(){return 'white';}};}};
  return {width:1,height:1,getContext:()=>ctx,svg(){return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}">${elements.join('')}</svg>`;}};
}

export function archive(folder) {
  const meshes=new Set(),models=new Map(),materials=new Map(),images=new Set(),pending=[],rawImages=new WeakMap();
  mkdirSync(folder,{recursive:true});
  function image(mat){
    if(mat.userData.poster)return mat.userData.poster;
    const source=mat.map?.image;
    if(source?.data){if(rawImages.has(source))return rawImages.get(source);const bytes=Buffer.from(source.data),key=digest(bytes);rawImages.set(source,key);
      if(!images.has(key)){images.add(key);pending.push(sharp(bytes,{raw:{width:source.width,height:source.height,channels:4}}).flip().png().toFile(join(folder,key+'.png')));}return key;}
    if(!source?.svg)return '';
    const svg=source.svg(), key=digest(svg);
    if(!images.has(key)){images.add(key);pending.push(sharp(Buffer.from(svg)).png().toFile(join(folder,key+'.png')));}
    return key;
  }
  function material(mat){
    const entry={color:mat.color?.getHexString()||'ffffff',glow:mat.emissive?.getHexString()||'000000',power:mat.emissiveIntensity??0,alpha:mat.opacity??1,transparent:mat.transparent,metal:mat.metalness??0,smooth:1-(mat.roughness??.8),doubleSide:mat.side===THREE.DoubleSide,texture:image(mat)};
    const key=JSON.stringify(entry);if(!materials.has(key))materials.set(key,{...entry,id:materials.size});return materials.get(key).id;
  }
  function model(root,omit=()=>false,world=false){
    root.updateWorldMatrix(true,true);
    const parts=[];
    function part(node,parent,inverse,pose,name){
      const index=parts.length,bins=new Map();parts.push({parent,name,...transform(pose),bins:[]});
      function visit(child){
        if(!child.visible||omit(child))return;
        if(child!==node && (child.name||child.userData.dynamic)){
          part(child,index,child.matrixWorld.clone().invert(),inverse.clone().multiply(child.matrixWorld),child.name||'pivot');return;
        }
        if(child.isMesh&&!child.isInstancedMesh){
          if(Array.isArray(child.material))throw Error('multi-material geometry: '+child.name);
          const mat=material(child.material);if(!bins.has(mat))bins.set(mat,{vertices:[],indices:[]});
          const bin=bins.get(mat),geo=child.geometry,attr=geo.attributes,matrix=inverse.clone().multiply(child.matrixWorld),nm=new THREE.Matrix3().getNormalMatrix(matrix),base=bin.vertices.length/8;
          const vertex=new THREE.Vector3(),normal=new THREE.Vector3();
          for(let i=0;i<attr.position.count;i++){
            vertex.fromBufferAttribute(attr.position,i).applyMatrix4(matrix);normal.fromBufferAttribute(attr.normal,i).applyNormalMatrix(nm);
            bin.vertices.push(vertex.x,vertex.y,-vertex.z,normal.x,normal.y,-normal.z,attr.uv?.getX(i)||0,attr.uv?.getY(i)||0);
          }
          const count=geo.index?.count??attr.position.count, flip=matrix.determinant()>0;
          for(let i=0;i<count;i+=3)for(const delta of flip?[0,2,1]:[0,1,2])bin.indices.push(base+(geo.index?.getX(i+delta)??i+delta));
        }
        for(const sub of child.children)visit(sub);
      }
      visit(node);
      for(const [mat,bin] of bins){
        const vertices=new Float32Array(bin.vertices),indices=new Uint32Array(bin.indices);
        if(!vertices.every(Number.isFinite)||indices.length%3)throw Error('Invalid mesh: '+name);
        const header=Buffer.alloc(8);header.writeUInt32LE(vertices.length/8);header.writeUInt32LE(indices.length,4);
        const data=Buffer.concat([header,Buffer.from(vertices.buffer),Buffer.from(indices.buffer)]),key=digest(data);
        if(!meshes.has(key)){
          meshes.add(key);
          const file=join(folder,key+'.mesh.gz');
          if(!existsSync(file)){
            const temp=file+'.'+process.pid+'.tmp';
            writeFileSync(temp,gzipSync(data,{level:1}));
            renameSync(temp,file);
          }
        }
        parts[index].bins.push({mat,key});
      }
    }
    part(root,-1,world?new THREE.Matrix4():root.matrixWorld.clone().invert(),new THREE.Matrix4(),'root');
    const key=digest(JSON.stringify(parts));if(!models.has(key))models.set(key,{key,parts});return key;
  }
  return {model,meshes,models,materials,images,pending};
}

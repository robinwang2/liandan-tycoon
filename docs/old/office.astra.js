import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const ROLE_COLORS = { res: 0x9b6ee8, eng: 0x398ad7, ops: 0xf49345, biz: 0x283653, legal: 0x717887 };
const LEVEL_SEATS = [6, 8, 14, 22, 34];
const LEVEL_COLS = [3, 4, 5, 6, 6];
const FLOOR_SIZE = [[13, 12.5], [15, 12.5], [18, 15], [21, 17.5], [24, 22.5]];

function hash(value) {
  let h = 2166136261;
  const s = String(value);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function seeded(value, salt = 0) {
  let x = hash(`${value}:${salt}`) + 0x6d2b79f5;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function ease(t) { return 1 - Math.pow(1 - clamp(t, 0, 1), 3); }

export function createOffice(containerEl) {
  if (!containerEl) throw new Error('createOffice(containerEl) 需要有效容器');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none';
  containerEl.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfeaff, 59, 105);
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 120);
  const world = new THREE.Group();
  scene.add(world);
  const backdropRoot = new THREE.Group();
  const buildingRoot = new THREE.Group();
  const staticRoot = new THREE.Group();
  const deskRoot = new THREE.Group();
  const rackRoot = new THREE.Group();
  const peopleRoot = new THREE.Group();
  const fxRoot = new THREE.Group();
  world.add(backdropRoot, buildingRoot, peopleRoot, fxRoot);
  buildingRoot.add(staticRoot, deskRoot, rackRoot);

  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const matCache = new Map();
  const geoCache = new Map();
  const screens = [];
  const windowMaterials = new Set();
  const nightObjects = [];
  const skyObjects = [];
  const backdropColors = [];
  const brandSigns = [];
  const brandAccents = [];
  let nightMix = 0;
  let layoutCount = 6;
  let resourceSweep = 0;
  let animationFrame;

  const material = (color, options = {}) => {
    const key = `${color}:${options.emissive || 0}:${options.emissiveIntensity || 0}:${options.depthWrite ?? true}:${options.transparent || false}:${options.opacity ?? 1}:${options.metalness ?? 0}:${options.roughness ?? .78}:${options.side || 0}`;
    if (matCache.has(key)) return matCache.get(key);
    const m = new THREE.MeshStandardMaterial({
      color, flatShading: true, roughness: options.roughness ?? .78,
      metalness: options.metalness ?? 0, transparent: !!options.transparent,
      opacity: options.opacity ?? 1, side: options.side || THREE.FrontSide,
      emissive: options.emissive || 0, emissiveIntensity: options.emissiveIntensity || 0,
      depthWrite: options.depthWrite ?? true
    });
    materials.add(m); matCache.set(key, m); return m;
  };
  const geo = (type, ...args) => {
    const key = `${type}:${args.join(',')}`;
    if (geoCache.has(key)) return geoCache.get(key);
    let g;
    if (type === 'box') g = new THREE.BoxGeometry(...args);
    else if (type === 'round') g = new RoundedBoxGeometry(...args);
    else if (type === 'cyl') g = new THREE.CylinderGeometry(...args);
    else if (type === 'sphere') g = new THREE.SphereGeometry(...args);
    else if (type === 'cone') g = new THREE.ConeGeometry(...args);
    else if (type === 'torus') g = new THREE.TorusGeometry(...args);
    else if (type === 'plane') g = new THREE.PlaneGeometry(...args);
    geometries.add(g); geoCache.set(key, g); return g;
  };
  const mesh = (g, m, parent, x = 0, y = 0, z = 0, shadow = true) => {
    const o = new THREE.Mesh(g, m); o.position.set(x, y, z);
    o.castShadow = shadow; o.receiveShadow = shadow; parent.add(o); return o;
  };
  const box = (parent, size, color, pos, radius = 0, options) => {
    const g = radius ? geo('round', size[0], size[1], size[2], 3, Math.min(radius, Math.min(...size) * .45)) : geo('box', ...size);
    return mesh(g, material(color, options), parent, ...pos);
  };
  const cyl = (parent, r1, r2, height, color, pos, sides = 10, options) =>
    mesh(geo('cyl', r1, r2, height, sides), material(color, options), parent, ...pos);

  // 屏幕空间天空，确保 canvas 始终不透明且不受 inset 影响。
  const skyScene = new THREE.Scene();
  const skyCamera = new THREE.Camera();
  const skyMaterial = new THREE.ShaderMaterial({
    depthWrite: false, depthTest: false, toneMapped:false,
    uniforms: { night:{value:0}, aspect:{value:1}, time:{value:0}, top: { value: new THREE.Color(0xbfe6ff) }, bottom: { value: new THREE.Color(0xfef3d6) } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position,1.);}',
    fragmentShader: `
      varying vec2 vUv; uniform vec3 top; uniform vec3 bottom; uniform float night; uniform float aspect; uniform float time;
      float random(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){
        vec3 color=mix(bottom,top,smoothstep(0.,1.,vUv.y));
        vec2 grid=vUv*vec2(38.,23.),cell=floor(grid);float seed=random(cell);
        vec2 point=vec2(.2+.6*seed,.2+.6*random(cell+13.));
        float star=(1.-smoothstep(.012,.055,distance(fract(grid),point)))*step(.64,seed)*smoothstep(.46,.8,vUv.y);
        color+=vec3(.8,.85,1.)*star*night*(.6+.4*sin(time*.8+seed*31.));
        vec2 p=(vUv-vec2(.93,.9))*vec2(aspect,1.);float moon=1.-smoothstep(.036,.038,length(p));
        float crater=(1.-smoothstep(.006,.009,length(p-vec2(.012,.012))))*.17;
        crater+=(1.-smoothstep(.004,.007,length(p+vec2(.016,.006))))*.13;
        color=mix(color,vec3(1.,.89,.62)-crater,moon*night);
        gl_FragColor=vec4(color,1.);
        #include <colorspace_fragment>
      }
    `
  });
  materials.add(skyMaterial);
  mesh(geo('plane', 2, 2), skyMaterial, skyScene, 0, 0, 0, false);

  const hemi = new THREE.HemisphereLight(0xdff4ff, 0x70634d, 2.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4d8, 3.25);
  sun.position.set(-12, 20, 14); sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 1536); sun.shadow.camera.left = -25; sun.shadow.camera.right = 25;
  sun.shadow.camera.top = 24; sun.shadow.camera.bottom = -20; sun.shadow.bias = -.0008;
  scene.add(sun);
  const warmLights = [];
  const fill = new THREE.DirectionalLight(0xffe3b5, 1.2);
  fill.position.set(8, 12, 10); scene.add(fill);

  function roomSize() {
    const level = state.view.level - 1;
    return [FLOOR_SIZE[level][0], Math.max(FLOOR_SIZE[level][1], Math.ceil(layoutCount / LEVEL_COLS[level]) * 2.5 + 7.5)];
  }

  // 仅回收已离开场景的资源；共享的几何、材质继续复用。
  function collectResources() {
    const liveG = new Set(), liveM = new Set(), liveT = new Set();
    const visit = o => {
      if (o.geometry) liveG.add(o.geometry);
      for (const m of (Array.isArray(o.material) ? o.material : o.material ? [o.material] : [])) {
        liveM.add(m); if (m.map) liveT.add(m.map);
      }
    };
    scene.traverse(visit); skyScene.traverse(visit);
    for (const [pool, live] of [[geometries, liveG], [materials, liveM], [textures, liveT]]) {
      for (const item of pool) if (!live.has(item)) { item.dispose(); pool.delete(item); }
    }
    for (const [key, value] of geoCache) if (!liveG.has(value)) geoCache.delete(key);
    for (const [key, value] of matCache) if (!liveM.has(value)) matCache.delete(key);
  }

  // 静态装潢按材质批处理，避免细节数量变成数千次 draw call。
  function batchStatic(root) {
    root.updateMatrixWorld(true);
    const batches = new Map();
    root.traverse(o => {
      if (!o.isMesh || o.material.transparent || o.userData.animated) return;
      for (let p=o.parent;p && p!==root;p=p.parent) if(p.userData.noBatch)return;
      const key = o.material.uuid + ':' + o.castShadow;
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key).push(o);
    });
    const inverse = root.matrixWorld.clone().invert();
    for (const objects of batches.values()) {
      if (objects.length < 2) continue;
      // 有的几何体带索引、有的不带，合并前统一成不带索引的，否则 mergeGeometries 会报错并放弃合并
      const copies = objects.map(o => (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, o.matrixWorld)));
      const merged = mergeGeometries(copies, false); copies.forEach(g => g.dispose());
      if (!merged) continue;
      geometries.add(merged); mesh(merged, objects[0].material, root, 0, 0, 0, objects[0].castShadow);
      objects.forEach(o => o.removeFromParent());
    }
  }

  const state = {
    view: { mode: 'play', region: 'sz', level: 1, sign: '混沌智能', staff: [], racks: 0, furnace: null, night: false, alert: false },
    roomKey: '', insets: { left: 0, right: 0, top: 0, bottom: 0 }, width: 1, height: 1,
    yaw: Math.PI / 4, pitch: THREE.MathUtils.degToRad(35), zoom: 1, dragging: false,
    pointerX: 0, baseYaw: Math.PI / 4, visible: !document.hidden, disposed: false, last: performance.now(), elapsed: 0
  };
  const staffObjects = new Map();
  const seatById = new Map();
  const deskBySeat = new Map();
  const effects = [];
  const leds = [];
  const furnaceParticles = [];
  let stationPositions = [];
  let founder;
  let furnace;
  let siren;
  let cameo;
  let alertPhase = 0;
  let alarmUntil = 0;
  let levelBounce = 0;

  function createCanvasTexture(draw, width = 512, height = 256) {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    draw(canvas.getContext('2d'), width, height);
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter; textures.add(tex); return tex;
  }

  function addLine(parent, points, color, opacity = 1) {
    const g = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
    const m = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
    geometries.add(g); materials.add(m); const line = new THREE.Line(g, m); parent.add(line); return line;
  }

  function makeCloud(parent, x, y, z, scale = 1) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(scale); g.userData.cloud = true;
    const white = material(0xffffff, { roughness: 1 });
    [[0, 0, 0, .75], [.7, .08, .05, .55], [-.65, -.05, .05, .5], [.05, .35, .02, .58]].forEach(p => {
      const puff = mesh(geo('sphere', p[3], 8, 6), white, g, p[0], p[1], p[2], false); puff.scale.y = .72;
    }); parent.add(g); return g;
  }

  function makeTree(parent, x, z, scale = 1, palm = false) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(scale);
    cyl(g, .13, .2, 1.4, palm ? 0x9a623b : 0x8a5938, [0, .7, 0], 8);
    if (palm) {
      for (let i = 0; i < 7; i++) {
        const leaf = box(g, [1.05, .08, .28], 0x42a35a, [0, 1.5, 0], .04);
        leaf.rotation.y = i * TAU / 7; leaf.rotation.z = .35; leaf.position.x = Math.cos(leaf.rotation.y) * .38; leaf.position.z = Math.sin(leaf.rotation.y) * .38;
      }
    } else {
      [[0, 1.45, 0], [.3, 1.3, .05], [-.25, 1.3, -.12]].forEach(p => mesh(geo('sphere', .52, 7, 5), material(0x5eb85b), g, ...p));
    }
    parent.add(g); return g;
  }

  function buildBackdrop(region) {
    backdropRoot.clear(); skyObjects.length = 0; backdropColors.length=0;
    const horizon = new THREE.Group(); horizon.position.set(-18, -9, -18); horizon.rotation.y=Math.PI/4; horizon.scale.setScalar(.82);
    backdropRoot.add(horizon); backdropRoot.userData.horizon=horizon;
    const cloudLayer = new THREE.Group(); backdropRoot.add(cloudLayer); backdropRoot.userData.cloudLayer=cloudLayer;
    makeCloud(cloudLayer, -10, .5, -2, 1.5); makeCloud(cloudLayer, 6, 1.2, -3, 1.1); makeCloud(cloudLayer, 14, -.5, -2, 1.45);
    makeCloud(cloudLayer, -18, 1.5, -4, 2.2); makeCloud(cloudLayer, 0, -.6, -2, .9);
    if (region === 'bay') {
      // 远山与金门桥式剪影。
      for (let i = 0; i < 8; i++) {
        const hill = mesh(geo('sphere', 3.5 + (i % 3), 8, 5), material(i % 2 ? 0x6c9b7b : 0x78a987), horizon, -15 + i * 4.3, 1.0 + (i % 2) * .3, -2, false);
        hill.scale.y = .42;
      }
      const red = 0xc65348;
      [-6, 6].forEach(x => {
        box(horizon, [.55, 6, .55], red, [x, 3, 0], .08);
        box(horizon, [2.3, .28, .55], red, [x, 5.2, 0], .04);
      });
      box(horizon, [19, .28, .65], red, [0, 1.25, 0], .04);
      for (let x = -9; x <= 9; x += 1.5) {
        const arch = 5.25 - 3.5 * Math.pow(Math.abs(x) / 10, .7);
        addLine(horizon, [[x, 1.35, 0], [x, arch, 0]], 0x9f3f3a, .8);
      }
      const cable = [];
      for (let i = 0; i <= 40; i++) { const x = -10 + i * .5; cable.push([x, 5.3 - 3.45 * (1 - Math.pow(Math.abs(x) / 10, 1.7)), 0]); }
      addLine(horizon, cable, 0x9f3f3a);
      makeTree(horizon, -11, 2, 1.15, true); makeTree(horizon, 11, 1, .9, true);
      const mist = box(horizon, [28, 1.4, .1], 0xe9f6f4, [0, .5, 2], .3, { transparent: true, opacity: .35, depthWrite: false }); mist.castShadow = false;
    } else {
      const colors = [0x7eb5cf, 0x6a92b4, 0x92c1cb, 0x557b9f, 0x80a9b8];
      for (let i = 0; i < 13; i++) {
        const h = 2.3 + seeded('tower', i) * 6.2; const x = -13 + i * 2.15;
        const tower = box(horizon, [1.4 + seeded('tw', i) * .8, h, 1.2], colors[i % colors.length], [x, h / 2, -.4 - (i % 3)], .08);
        if (i === 7) mesh(geo('cone', .7, 2.8, 4), material(0x557b9f), horizon, x, h + 1.35, -.4);
        for (let y = 1; y < h - .3; y += .65) box(horizon, [.09, .23, 1.23], 0xdff5ed, [x - .35, y, -.35 - (i % 3)], 0, { emissive: 0x365a62, emissiveIntensity: .12 });
      }
      // 塔吊和握手楼。
      box(horizon, [.18, 6.4, .18], 0xe7b548, [-10, 3.2, 1.2]); box(horizon, [6, .18, .18], 0xe7b548, [-7.2, 6.1, 1.2]);
      addLine(horizon, [[-10, 6.1, 1.2], [-4.3, 5.05, 1.2]], 0xc18e35);
      for (let i = 0; i < 7; i++) box(horizon, [2.25, 2.3 + (i % 2) * .45, 1.4], i % 2 ? 0xb9a892 : 0xc6b69f, [-8 + i * 2.65, 1.1, 3.2], .05);
    }
    for (let i = 0; i < 9; i++) {
      const h = 2 + seeded('night-tower', i) * 4;
      box(horizon, [1.3, h, .9], 0x4f647e, [-14 + i * 3.4, h / 2, -5], .04);
      for (let j = 0; j < 8; j++) if (seeded(i, j + 56) > .52) {
        const win = box(horizon, [.21, .27, .03], 0xffdc92, [-14.4 + i * 3.4 + (j % 2) * .55, .7 + Math.floor(j / 2) * .9, -4.53], 0, {emissive:0xffc46b, emissiveIntensity:1.2});
        win.userData.nightOnly = true;
      }
    }
    const clones=new Map();
    horizon.traverse(o=>{
      if(!o.material || o.userData.nightOnly || !o.material.color)return;
      if(!clones.has(o.material)){
        const m=o.material.clone();materials.add(m);clones.set(o.material,m);
        backdropColors.push({material:m,day:m.color.clone(),night:m.color.clone().lerp(new THREE.Color(0x111c3e),.91)});
      }
      o.material=clones.get(o.material);
    });
    backdropRoot.traverse(o => { if (o.userData.nightOnly || o.userData.cloud) skyObjects.push(o); });
  }

  function addWindowWall(parent, width, depth, height) {
    const level = state.view.level, garage = level === 1 && state.view.region === 'bay';
    const wall = garage ? 0x9baba9 : level === 1 ? 0xdce8d7 : [0, 0, 0xe9c899, 0xb0cdd1, 0x93b8ca, 0xe7dcc4][level];
    const trim = level >= 4 ? 0x344e68 : garage ? 0x566b70 : 0x577f80;
    const paneMat = material(0xa9dfeb, {transparent:true, opacity:.42, roughness:.24, emissive:0xffcf8c, emissiveIntensity:0, depthWrite:false});
    windowMaterials.add(paneMat);
    for (const side of ['back', 'left']) {
      const length = side === 'back' ? width : depth;
      const wallGroup = new THREE.Group();
      if (side === 'back') wallGroup.position.z = -depth / 2;
      else { wallGroup.position.x = -width / 2; wallGroup.rotation.y = Math.PI / 2; }
      parent.add(wallGroup);
      box(wallGroup, [length + .3, 1.05, .34], wall, [0, .63, 0], .045);
      box(wallGroup, [length + .3, .18, .42], trim, [0, .23, .04], .025);
      box(wallGroup, [length + .3, .25, .38], wall, [0, height, 0], .035);
      const n = Math.ceil(length / 3), gap = length / n;
      for (let i = 0; i <= n; i++) box(wallGroup, [.26, height - 1, .36], trim, [-length / 2 + i * gap, (height + 1) / 2, 0], .025);
      for (let i = 0; i < n; i++) {
        const x = -length / 2 + (i + .5) * gap;
        if(garage && (side==='left'?i%2===0:i===0))box(wallGroup,[gap-.25,height-1,.32],wall,[x,(height+1)/2,0],.025);
        else mesh(geo('box', gap - .25, height - 1.25, .055), paneMat, wallGroup, x, (height + 1) / 2, 0, false);
        box(wallGroup, [gap, .08, .12], trim, [x, 2.1, .08]);
        if (level === 1 && !garage) for (let k = -1; k <= 1; k++) box(wallGroup, [.045, height - 1.3, .06], 0x748c91, [x + k * gap / 4, (height + 1) / 2, .15]);
      }
      if (level === 1 && !garage) for (let y = .45; y < 1.1; y += .25) addLine(wallGroup, [[-length / 2,y,.18],[length / 2,y,.18]],0xb0c2b7);
    }
    // 墙面小物和暖灯构成办公室的视觉层次。
    const clockFace = createCanvasTexture((ctx,w,h) => {
      ctx.fillStyle='#fff4dc';ctx.beginPath();ctx.arc(w/2,h/2,w*.46,0,TAU);ctx.fill();
      ctx.strokeStyle='#304656';ctx.lineWidth=9;ctx.stroke();
      for(let i=0;i<12;i++){const a=i*TAU/12;ctx.beginPath();ctx.moveTo(w/2+Math.sin(a)*80,h/2+Math.cos(a)*80);ctx.lineTo(w/2+Math.sin(a)*95,h/2+Math.cos(a)*95);ctx.stroke();}
      ctx.beginPath();ctx.moveTo(128,64);ctx.lineTo(128,128);ctx.lineTo(187,142);ctx.stroke();
    },256,256);
    const clockMat = new THREE.MeshBasicMaterial({map:clockFace, transparent:true}); materials.add(clockMat);
    mesh(geo('plane', .9, .9),clockMat,parent,width/2-4.2,2.85,-depth/2+.25,false);
    box(parent,[2.1,.63,.45],0xf6eee0,[width/2-1.5,3.05,-depth/2+.22],.12);
    for(let i=0;i<4;i++)box(parent,[1.6,.035,.025],0x839b9c,[width/2-1.5,2.9+i*.09,-depth/2+.46]);
    makeSign(parent,level===1?'从这里改变世界':'BUILD · TRAIN · REPEAT',width/2-4.6,1.05,-depth/2+.22,2.5,false,'optional');
    for(let i=1;i<3;i++){
      const x=-width/2+2+i*(width-4)/3;
      box(parent,[1.65,.13,.5],0xffedc2,[x,3.55,-depth/2+.55],.05,{emissive:0xffd085,emissiveIntensity:1.4});
    }
  }

  function makePlant(parent, x, z, scale = 1, moneyTree = false) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(scale);
    cyl(g, .34, .27, .52, moneyTree ? 0xe1b257 : 0xe87655, [0, .26, 0], 10);
    cyl(g, .07, .09, .85, 0x786044, [0, .86, 0], 7);
    const green = moneyTree ? 0x58ad67 : 0x4aa967;
    for (let i = 0; i < 6; i++) { const l = mesh(geo('sphere', .27, 7, 5), material(green), g, Math.cos(i) * .28, .85 + (i % 3) * .2, Math.sin(i) * .28); l.scale.y = 1.35; }
    parent.add(g); return g;
  }

  function makeWhiteboard(parent, x, z, width = 2.3) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    box(g, [width, 1.4, .12], 0xf8fbf4, [0, 1.55, 0], .08);
    const colors = [0xe75b61, 0x4f83cf, 0x62aa72];
    for (let i = 0; i < 7; i++) box(g, [.27 + seeded('scribble', i) * .5, .025, .035], colors[i % 3], [-width * .35 + (i % 3) * .65, 1.25 + Math.floor(i / 3) * .32, .075], .01);
    box(g, [.09, 1.25, .09], 0x767b7d, [-width / 2 + .12, .7, 0]); box(g, [.09, 1.25, .09], 0x767b7d, [width / 2 - .12, .7, 0]);
    parent.add(g); return g;
  }

  function paintBrandSign(record) {
    const { tex, roof, text, kind, sign } = record;
    const canvas = tex.image, ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    const branded = !!(state.view.logo || state.view.brand);
    const label = String(kind === 'optional' && !branded ? text : state.view.sign).slice(0,24);
    const logo = state.view.logo;
    const revision = record.revision = (record.revision || 0) + 1;
    if (record.brandOnly) sign.visible = branded;
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = roof ? '#24334c' : '#fff8e8';
    ctx.beginPath(); ctx.roundRect(10, 10, w - 20, h - 20, 32); ctx.fill();
    ctx.strokeStyle = state.view.brand || '#e7b85f'; ctx.lineWidth = 12; ctx.stroke();
    const left = logo ? 174 : 30, available = w - 30 - left;
    ctx.fillStyle = roof ? '#fff3bb' : '#293b55';
    let font = 86; ctx.font = '900 '+font+'px system-ui,"Microsoft YaHei",sans-serif';
    while (ctx.measureText(label).width > available && font > 24) { font -= 2; ctx.font = '900 '+font+'px system-ui,"Microsoft YaHei",sans-serif'; }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, left + available / 2, h / 2 + 4, available);
    tex.needsUpdate = true;
    if (logo) {
      const image = new Image();
      image.onload = () => {
        // A previous selection, rebuilt room, or disposed office must never repaint.
        if (state.disposed || record.revision !== revision || !brandSigns.includes(record)) return;
        ctx.drawImage(image, 34, (h - 128) / 2, 128, 128); tex.needsUpdate = true;
      };
      image.onerror = () => {}; // Keep the already painted company name on decode failure.
      image.src = logo;
    }
  }

  function makeSign(parent, text, x, y, z, width = 3.4, roof = false, kind = 'company') {
    const tex = createCanvasTexture(() => {});
    const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: .6, emissive: roof ? 0x3e361b : 0, emissiveIntensity: roof ? .35 : 0 });
    materials.add(m); const sign = mesh(geo('plane', width, width / 2), m, parent, x, y, z);
    sign.userData.animated = true;
    const record = { tex, roof, text, kind, sign };
    brandSigns.push(record); paintBrandSign(record);
    return sign;
  }

  function updateBrand() {
    brandSigns.forEach(paintBrandSign);
    for (const accent of brandAccents) {
      accent.visible = !!state.view.brand;
      accent.material.color.set(state.view.brand || '#e7b85f');
    }
  }

  function makeBrandAccents(width, depth) {
    // Dedicated materials and unbatched meshes keep recoloring local to the accents.
    for (const [size, pos] of [
      [[width - 1, .15, .08], [0, 1.18, -depth / 2 + .23]],
      [[3, .035, .16], [-width / 2 + 3, .17, depth / 2 - 1.3]],
    ]) {
      const m = new THREE.MeshStandardMaterial({ color: state.view.brand || '#e7b85f', roughness: .78 }); materials.add(m);
      const accent = mesh(geo('box', ...size), m, staticRoot, ...pos);
      accent.userData.animated = true; accent.visible = !!state.view.brand; brandAccents.push(accent);
    }
  }

  function makeCouch(parent, x, z, color = 0xf1b95d) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    box(g, [2.2, .65, .8], color, [0, .45, 0], .23); box(g, [2.15, .8, .28], color, [0, .78, -.32], .15);
    box(g, [.26, .72, .85], color, [-1.02, .5, 0], .12); box(g, [.26, .72, .85], color, [1.02, .5, 0], .12);
    parent.add(g);
  }

  function makePingPong(parent, x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    box(g, [2.5, .16, 1.35], 0x3a9b7c, [0, .82, 0], .08);
    box(g, [.05, .55, 1.4], 0xf7f5e8, [0, 1.08, 0], .01);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, [.12, .72, .12], 0x465a63, [sx, .4, sz * .45], .02);
    parent.add(g);
  }

  function makeRegionalDecor(parent, region, level, width, depth) {
    if (region === 'bay') {
      makePingPong(parent, width / 2 - 2.1, depth / 2 - 1.45);
      const barrel = cyl(parent, .42, .42, 1.05, 0xe3a944, [width / 2 - .7, .53, depth / 2 - 3.3], 12);
      box(parent, [.55, .08, 1.25], 0x5b86c5, [-width / 2 + 1, .14, depth / 2 - .8], .08).rotation.z = .08;
      if (level >= 3) makePlant(parent, width / 2 - .7, depth / 2 - 4.7, 1, false);
      barrel.userData.decor = 'kombucha';
    } else {
      const tea = new THREE.Group(); tea.position.set(width / 2 - 1.4, 0, depth / 2 - 1.2);
      box(tea, [2.1, .2, 1.05], 0x9a633e, [0, .68, 0], .08); for (const x of [-.45, .45]) cyl(tea, .13, .11, .18, 0xf4ead2, [x, .88, 0], 10); parent.add(tea);
      makePlant(parent, width / 2 - .7, depth / 2 - 3.4, 1.2, true);
      const cat = new THREE.Group(); cat.position.set(width / 2 - 2, .8, depth / 2 - 1.2); cat.scale.setScalar(1.3);
      mesh(geo('sphere', .32, 9, 7), material(0xf9e7c8), cat, 0, .68, 0); box(cat, [.42, .45, .34], 0xf9e7c8, [0, .32, 0], .14); cyl(cat, .045, .045, .55, 0xe35b55, [.27, .62, 0], 7).rotation.z = -.55; parent.add(cat);
      {
        const nightGroup = new THREE.Group(); parent.add(nightGroup); nightObjects.push(nightGroup); nightGroup.userData.noBatch=true; parent = nightGroup;
        const bedX = -width / 2 + 3.2, bedZ = depth / 2 - .7;
        const bed = box(parent, [2, .18, .75], 0x6c91b4, [bedX, .25, bedZ], .1); box(parent, [.5, .18, .72], 0xf2e4ca, [bedX - .65, .4, bedZ], .08); bed.userData.campBed = true;
        const sleeper = mesh(geo('sphere', .25, 8, 6), material(0xe0a47b), parent, bedX - .47, .58, bedZ);
        sleeper.scale.z = .82; box(parent, [1.05, .3, .56], 0x3d83ba, [bedX + .2, .5, bedZ], .13);
      }
    }
  }

  function buildStarterDetails(parent, region, width, depth) {
    if (region === 'bay') {
      // 半开的卷帘门、纸箱、自行车。
      box(parent, [3.3, 1.45, .16], 0x93a2a4, [.3, 3.15, -depth / 2 + .16], .04);
      for (let i = 0; i < 6; i++) box(parent, [3.1, .04, .05], 0x65777a, [.3, 2.55 + i * .22, -depth / 2 + .26]);
      [[-width / 2 + 2.5, .4, depth / 2 - 1], [-width / 2 + 3.3, .32, depth / 2 - .85]].forEach((p, i) => box(parent, [.72 + i * .15, .65, .72], 0xbb8a54, p, .06));
      const bike = new THREE.Group(); bike.position.set(-width / 2 + 2.2, .55, -depth / 2 + .5);
      for (const x of [-.6, .6]) { const w = mesh(geo('torus', .42, .055, 6, 16), material(0x34434c), bike, x, 0, 0); w.rotation.x = 0; }
      addLine(bike, [[-.6, 0, 0], [0, .55, 0], [.35, 0, 0], [-.6, 0, 0]], 0xd95750); parent.add(bike);
    } else {
      // 城中村上下铺、电饭煲和窗外衣服。
      const bunk = new THREE.Group(); bunk.position.set(.3, 0, -depth / 2 + 1.1);
      for (const y of [.55, 1.8]) { box(bunk, [2.15, .16, .85], 0x7ca3bc, [0, y, 0], .05); box(bunk, [1.8, .12, .72], 0xf1d793, [0, y + .13, 0], .08); }
      for (const x of [-1, 1]) box(bunk, [.09, 2.35, .09], 0x4f6472, [x, 1.2, 0]); parent.add(bunk);
      const cooker = cyl(parent, .34, .3, .45, 0xf2f0e8, [-width / 2 + 1.1, .4, -depth / 2 + .8], 12); box(parent, [.42, .12, .35], 0xbfc4c2, [cooker.position.x, .67, cooker.position.z], .12);
      addLine(parent, [[-2.8, 3.25, -depth / 2 + .35], [2.8, 3.25, -depth / 2 + .35]], 0x555d66);
      [0xe96762, 0x63a5d8, 0xf0c756].forEach((c, i) => box(parent, [.65, .5, .04], c, [-1.7 + i * 1.7, 3.02, -depth / 2 + .36], .04));
    }
  }

  function buildExecutiveDetails(parent, level, width, depth) {
    if (level >= 3) {
      // 玻璃会议室。
      const meeting = new THREE.Group(); meeting.position.set(0, 0, -depth / 2 + 1.1);
      const glassMat = material(0xa9dbe3, { transparent: true, opacity: .28, roughness: .18, metalness: .08, depthWrite: false });
      const glass = mesh(geo('box', 3.5, 2.35, .07), glassMat, meeting, 0, 1.25, 1.6); glass.castShadow = false;
      box(meeting, [2.5, .18, 1.1], 0xb9784e, [0, .78, .4], .08);
      for (const x of [-1, 1]) box(meeting, [.45, .55, .45], 0x4d6476, [x, .38, .4], .12);
      parent.add(meeting);
    }
    if (level >= 4) {
      // 前台与玻璃机房隔断。
      box(parent, [3.1, 1.05, .75], 0xf2b64e, [-width / 2 + 3.1, .55, depth / 2 - .8], .17);
      const gm = material(0x9ad4df, { transparent: true, opacity: .25, roughness: .18, depthWrite: false });
      const divider = mesh(geo('box', .08, 2.7, 5.1), gm, parent, width / 2 - 4.35, 1.35, -depth / 2 + 3.1); divider.castShadow = false;
    }
    if (level === 5) {
      makeTree(parent, width/2-6.4, -depth / 2 + 3.2, 1.65, false);
      // 夸张的镀金创始人像。
      const statue = new THREE.Group(); statue.position.set(0, 0, depth / 2 - 1.5);
      cyl(statue, .72, .84, .42, 0x6b7180, [0, .21, 0], 12);
      const gold = material(0xe1b43e, { metalness: .68, roughness: .28 });
      mesh(geo('sphere', .4, 10, 8), gold, statue, 0, 2.1, 0); box(statue, [.72, 1.3, .5], 0xe1b43e, [0, 1.25, 0], .22, { metalness: .68, roughness: .28 });
      for (const x of [-.48, .48]) { const arm = cyl(statue, .13, .16, 1.15, 0xe1b43e, [x, 1.45, 0], 8, { metalness: .68, roughness: .28 }); arm.rotation.z = x > 0 ? -.65 : .35; }
      parent.add(statue);
      makeSign(parent, state.view.sign, 0, 5.5, -depth / 2 + .04, 5.2, true);
    }
  }

  const screenTexture = createCanvasTexture(() => {}, 256, 128);
  const screenMaterial = new THREE.MeshBasicMaterial({map:screenTexture}); materials.add(screenMaterial);
  function updateScreens(now) {
    const tick = Math.floor(now * 8); if (tick === screenTexture.userData.tick) return;
    screenTexture.userData.tick = tick;
    const ctx = screenTexture.image.getContext('2d');
    ctx.fillStyle='#132e42';ctx.fillRect(0,0,256,128);
    ctx.fillStyle='#285269';ctx.fillRect(0,0,256,18);
    for(let i=0;i<6;i++){ctx.fillStyle=i%3?'#7de0be':'#f5cb73';ctx.fillRect(12+(i%2)*9,29+i*14,25+((i*29+tick*3)%90),5);}
    ctx.strokeStyle='#ffb96a';ctx.lineWidth=4;ctx.beginPath();
    for(let i=0;i<9;i++){const x=145+i*12,y=96-i*6+Math.sin(i+tick*.17)*10;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();
    ctx.fillStyle='#e7f4df';ctx.fillRect(238,103,5,tick%2?8:2);screenTexture.needsUpdate=true;
  }

  function makeStation(parent, pos, index) {
    const g = new THREE.Group(); g.position.copy(pos);
    const deskColor = state.view.level >= 3 ? 0xe8d4b3 : 0xc58b55;
    box(g, [1.55, .12, .72], deskColor, [0, .78, 0], .06);
    for (const x of [-.62, .62]) for (const z of [-.24, .24]) box(g, [.08, .72, .08], 0x4e5e68, [x, .38, z], .02);
    box(g, [.82, .55, .06], 0x334555, [0, 1.18, -.18], .06);
    mesh(geo('plane', .7, .41), screenMaterial, g, 0, 1.18, -.14, false);
    cyl(g, .085, .075, .19, 0xffe3b8, [.57,.94,.14], 8);
    mesh(geo('torus', .065,.018,4,8),material(0xffe3b8),g,.66,.94,.14,false);
    if(index%3===0){const plant=makePlant(g,-.57,.04,.24);plant.position.y=.84;}
    else {mesh(geo('sphere', .09,6,5),material(index%2?0xffcb68:0xf58e7a),g,-.58,.97,.03);box(g,[.12,.12,.1],0x617b8b,[-.58,.86,.03],.02);}
    addLine(g,[[0,.8,-.24],[.45,.25,-.3],[.7,.15,-.3],[.7,.15,.6]],0x394d60);
    screens.push(g);
    box(g, [.58, .035, .23], 0xd5d7cf, [0, .86, .18], .02);
    box(g, [.63, .12, .58], 0x526c7b, [0, .42, .72], .14); box(g, [.55, .62, .12], 0x526c7b, [0, .68, .98], .08);
    g.userData.seat = index; parent.add(g); return g;
  }

  function computeStations(width, depth) {
    const cols = LEVEL_COLS[state.view.level - 1], positions = [];
    for (let i = 0; i < layoutCount; i++) {
      positions.push(new THREE.Vector3(-width / 2 + 1.7 + (i % cols) * 2.15, .02, -depth / 2 + 4 + Math.floor(i / cols) * 2.5));
    }
    return positions;
  }

  function rebuildRoom() {
    brandSigns.length = 0; brandAccents.length = 0;
    staticRoot.clear(); deskRoot.clear(); deskBySeat.clear(); screens.length = 0; windowMaterials.clear(); nightObjects.length = 0; warmLights.splice(0).forEach(l => scene.remove(l));
    const level = state.view.level; const [width, depth] = roomSize(); const floorColor = level === 1 ? (state.view.region === 'bay' ? 0xbab8ae : 0xd8d2c5) : level === 2 ? 0xd9c398 : level >= 3 ? 0x7f9db2 : 0xbab8ae;
    // 草皮蛋糕底座 + 奶油色剖面。
    box(staticRoot, [width + 2.25, .95, depth + 2.25], 0x77b765, [0, -.72, 0], .42);
    box(staticRoot, [width + 1.6, .42, depth + 1.6], 0xf4d89c, [0, -.18, 0], .25);
    box(staticRoot, [width, .22, depth], floorColor, [0, .02, 0], .08);
    if (level === 1 && state.view.region === 'sz') {
      for (let x = -width / 2 + .6; x < width / 2; x += 1.05) addLine(staticRoot, [[x, .14, -depth / 2], [x, .14, depth / 2]], 0xb8b0a5, .6);
      for (let z = -depth / 2 + .6; z < depth / 2; z += 1.05) addLine(staticRoot, [[-width / 2, .14, z], [width / 2, .14, z]], 0xb8b0a5, .6);
    }
    if(level>=2){
      const cols=LEVEL_COLS[level-1],rows=Math.ceil(layoutCount/cols);
      box(staticRoot,[cols*2.15+.3,.025,rows*2.5+.1],level>=4?0x6e9aa9:0x729b9a,[-width/2+1.7+(cols-1)*1.075,.15,-depth/2+4+(rows-1)*1.25+.35],.06);
      box(staticRoot,[3.9,.025,5.8],0x40596b,[width/2-2.25,.15,-depth/2+3.1],.08);
      box(staticRoot,[4.3,.025,3.1],0xddbd85,[width/2-2.4,.15,depth/2-1.7],.08);
    }
    addWindowWall(staticRoot, width, depth, 3.55);
    if (level === 1) buildStarterDetails(staticRoot, state.view.region, width, depth);
    if (level === 1) makeWhiteboard(staticRoot, -width / 2 + 1.65, -depth / 2 + .26, 1.9);
    if (level === 2) {
      makeCouch(staticRoot, .3, -depth / 2 + 1.1); makeWhiteboard(staticRoot, -width / 2 + 1.7, -depth / 2 + .25);

    }
    if (level >= 3) { makeWhiteboard(staticRoot, -width / 2 + 1.8, -depth / 2 + .25); makePlant(staticRoot, -width / 2 + 1.7, depth / 2 - .9, .9); }
    buildExecutiveDetails(staticRoot, level, width, depth);
    makeRegionalDecor(staticRoot, state.view.region, level, width, depth);
    if (level >= 3) {
      const wallSign = makeSign(staticRoot, state.view.sign, -width / 2 + 2.6, 3.25, -depth / 2 + .26, 3.5);
      if (level === 5) {
        brandSigns[brandSigns.length - 1].brandOnly = true;
        wallSign.visible = !!(state.view.logo || state.view.brand);
      }
    }
    makeBrandAccents(width, depth);
    const sirenGroup = new THREE.Group(); sirenGroup.position.set(width / 2 - .55, 3.75, -depth / 2 + .42);
    cyl(sirenGroup, .25, .31, .14, 0x343d4b, [0, 0, 0], 10);
    const dome = mesh(geo('sphere', .25, 10, 6), material(0xee3445, { transparent: true, opacity: .78, emissive: 0xff162e, emissiveIntensity: 1.2 }), sirenGroup, 0, .19, 0); dome.scale.y = .8;
    box(sirenGroup, [.06, .05, .9], 0xff4658, [0, .22, .25], .02, { emissive: 0xff1630, emissiveIntensity: 2, transparent: true, opacity: .72 });
    sirenGroup.userData.noBatch=true; staticRoot.add(sirenGroup); siren = sirenGroup;
    stationPositions = computeStations(width, depth);
    const count = layoutCount; for (let i = 0; i < count; i++) deskBySeat.set(i, makeStation(deskRoot, stationPositions[i], i));
    makeFounder(width, depth);
    rebuildRacks();
    for (const [id, person] of staffObjects) positionPersonAtSeat(person, seatById.get(id), true);
    for (let i = 0; i < 2; i++) { const l = new THREE.PointLight(0xffdca0, 18, width, 2); l.position.set(-width / 4 + i * width / 2, 5, 0); scene.add(l); warmLights.push(l); }
    batchStatic(staticRoot); batchStatic(deskRoot);
  }

  function rebuildRacks() {
    rackRoot.clear(); leds.length = 0; furnaceParticles.length = 0;
    const [width, depth] = roomSize();
    const count = state.view.racks;
    for (let i = 0; i < count; i++) {
      const col = i % 3, row = Math.floor(i / 3); const g = new THREE.Group();
      g.position.set(width / 2 - .9 - col * 1.08, .1, -depth / 2 + 1.1 + row * 1.3);
      box(g, [.72, 2.2, .84], 0x303b46, [0, 1.1, 0], .09, { metalness: .18, roughness: .5 });
      for (let j = 0; j < 5; j++) {
        box(g, [.58, .025, .23], 0x182027, [0, .35 + j * .38, .43], .02);
        for (let k = 0; k < 3; k++) {
          const ledMat = material(0x4de486,{emissive:0x2cff71,emissiveIntensity:.8+(j%3)*.03,roughness:.25});
          const led = mesh(geo('sphere', .025, 5, 4), ledMat, g, -.22 + k * .13, .35 + j * .38, .47, false); leds.push({ mesh: led, seed: seeded(`led${i}`, j * 3 + k) * 10 });
        }
      }
      rackRoot.add(g);
    }
    batchStatic(rackRoot);
    makeFurnace(rackRoot, width / 2 - 2.25, depth / 2 - 4.9);
    if (count) {
      const pts = [[width / 2 - 2.25, .2, depth / 2 - 4.9], [width / 2 - 3.8, .2, depth / 2 - 4.9], [width / 2 - 3.8, .2, -depth / 2 + .5], [width / 2 - 1.05, .2, -depth / 2 + 1.1]];
      addLine(rackRoot, pts, 0x354752);
    }
  }

  function makeFurnace(parent, x, z) {
    const g = new THREE.Group(); g.position.set(x, .05, z); parent.add(g);
    const bronze = material(0x698b75, { metalness: .55, roughness: .42 });
    const belly = mesh(geo('sphere', .68, 12, 8), bronze, g, 0, .88, 0); belly.scale.y = .82;
    cyl(g, .48, .58, .28, 0x5c7868, [0, 1.42, 0], 12, { metalness: .55, roughness: .42 });
    mesh(geo('cone', .55, .4, 10), bronze, g, 0, 1.72, 0); mesh(geo('torus', .16, .045, 6, 12), bronze, g, 0, 1.94, 0).rotation.x = Math.PI / 2;
    for (let i = 0; i < 3; i++) { const leg = cyl(g, .09, .13, .62, 0x526f60, [Math.cos(i * TAU / 3) * .45, .32, Math.sin(i * TAU / 3) * .45], 7, { metalness: .5 }); leg.rotation.z = Math.cos(i * TAU / 3) * .18; }
    const coreMat = new THREE.MeshStandardMaterial({ color: 0x6a6d68, emissive: 0xff672b, emissiveIntensity: 0, roughness: .3 }); materials.add(coreMat);
    const core = mesh(geo('sphere', .38, 10, 7), coreMat, g, 0, .82, .52, false); core.scale.y = .62;
    for (let i = 0; i < 18; i++) { const p = mesh(geo('sphere', .045 + (i % 3) * .015, 5, 4), material(0xffb442, { emissive: 0xff6a22, emissiveIntensity: 1 }), g, 0, .8, 0, false); p.visible = false; furnaceParticles.push({ mesh: p, phase: seeded('furnace', i), speed: .55 + seeded('fs', i) }); }
    for(const sx of [-1,1]){const handle=mesh(geo('torus',.25,.065,6,12),bronze,g,sx*.7,1.15,0);handle.rotation.y=Math.PI/2;}
    for(let i=0;i<5;i++)box(g,[.09,.14,.055],0x293c38,[-.28+i*.14,1.5,.45],.01);
    const shell=[],shellClones=new Map();g.traverse(o=>{if(o.isMesh && o.material!==coreMat && !furnaceParticles.some(p=>p.mesh===o)){if(!shellClones.has(o.material)){const m=o.material.clone();materials.add(m);shellClones.set(o.material,m);shell.push({material:m,day:m.color.clone()});}o.material=shellClones.get(o.material);}});
    const scale=1.35+(state.view.level-1)*.1;g.scale.setScalar(scale);
    const glowTexture = createCanvasTexture((ctx,w,h) => {const grad=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);grad.addColorStop(0,'rgba(255,144,36,.8)');grad.addColorStop(.45,'rgba(255,116,20,.35)');grad.addColorStop(1,'rgba(255,110,20,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);},128,128);
    const glowMat = new THREE.MeshBasicMaterial({map:glowTexture,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});materials.add(glowMat);
    const glow=mesh(geo('plane',4.6,4.6),glowMat,parent,x,.15,z,false);glow.rotation.x=-Math.PI/2;
    const light=new THREE.PointLight(0xff8b36,8,5,2);light.position.set(x,1.2,z);parent.add(light);
    const smoke=[];
    for(let i=0;i<5;i++){const m=new THREE.MeshBasicMaterial({color:0xaeb7c4,transparent:true,opacity:.2,depthWrite:false});materials.add(m);const p=mesh(geo('sphere',.09,6,5),m,g,0,2,0,false);smoke.push(p);}
    furnace = { group:g, core, coreMat, glow, light, smoke, x, shell, scale };
  }

  function makeHead(parent, id, y, cameoStyle = false) {
    const skins = [0xf3c6a5, 0xdca57d, 0xbd7d58, 0xf0bd91]; const skin = skins[Math.floor(seeded(id, 1) * skins.length)];
    mesh(geo('sphere', cameoStyle ? .47 : .45, 10, 8), material(skin), parent, 0, y, 0);
    const hairColor = [0x2b2423, 0x4d3022, 0x18242c, 0x6b4b32][Math.floor(seeded(id, 2) * 4)];
    if (cameoStyle) {
      const hair = mesh(geo('sphere', .43, 10, 8), material(0x292629), parent, 0, y + .08, -.08); hair.scale.set(1.08, 1.35, .75);
      box(parent, [.2, .72, .16], 0x292629, [-.3, y - .19, -.03], .08); box(parent, [.2, .72, .16], 0x292629, [.3, y - .19, -.03], .08);
    } else {
      const style = Math.floor(seeded(id, 3) * 3);
      if (style === 0) { const h = mesh(geo('sphere', .46, 9, 6), material(hairColor), parent, 0, y + .13, -.04); h.scale.y = .65; }
      else if (style === 1) for (let i = 0; i < 5; i++) mesh(geo('cone', .12, .34, 5), material(hairColor), parent, -.24 + i * .12, y + .38 - Math.abs(i - 2) * .025, -.04);
      else { box(parent, [.78, .3, .63], hairColor, [0, y + .25, -.05], .12); }
    }
    for(const x of [-.15,.15]) mesh(geo('sphere',.035,6,4),material(0x263647),parent,x,y+.015,.413,false);
    box(parent,[.12,.025,.025],0xae654f,[0,y-.17,.416],.008);
    return skin;
  }

  function makePerson(data, special = '') {
    const g = new THREE.Group(); g.userData.id = data.id; const body = new THREE.Group(); g.add(body);
    const cameoStyle = special === 'cameo'; const scale = cameoStyle ? 1.3 : special === 'founder' ? 1.24 : 1.18;
    const skin = makeHead(body, data.id, 1.72, cameoStyle);
    let cloth = special === 'founder' ? 0x1f242b : cameoStyle ? 0x5b85a4 : (ROLE_COLORS[data.role] || ROLE_COLORS.eng);
    const torso = box(body, [.7, .82, .48], cloth, [0, 1.02, 0], .22);
    if (special === 'founder') torso.userData.animated = true;
    if (data.role === 'res' && !special) box(body, [.76, .66, .5], 0xf1eef7, [0, 1.04, 0], .16);
    if (data.role === 'legal' && !special) { const tie = box(body, [.09, .5, .04], 0xc74242, [0, 1.08, .27], .025); tie.rotation.z = .02; }
    if (cameoStyle) {
      for (let i = -2; i <= 2; i++) box(body, [.72, .035, .025], i % 2 ? 0xd15b4d : 0xe4c96a, [0, .84 + (i + 2) * .17, .255]);
      for (const x of [-.22, .22]) {
        for (const dy of [-.1, .1]) box(body, [.25, .026, .032], 0x12161c, [x, 1.71 + dy, .34], .008);
        for (const dx of [-.12, .12]) box(body, [.026, .21, .032], 0x12161c, [x + dx, 1.71, .34], .008);
      }
      box(body, [.2, .03, .035], 0x12161c, [0, 1.71, .34]);
    }
    if(data.role==='eng' && !special){const band=mesh(geo('torus',.47,.045,5,12,Math.PI),material(0xf5bb57),body,0,1.75,0);band.rotation.z=0; for(const x of [-.46,.46])box(body,[.12,.25,.19],0xf5bb57,[x,1.7,.02],.04);}
    if(data.role==='ops' && !special)box(body,[.6,.075,.3],0xf8c866,[0,1.97,.38],.03);
    const arms = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(s * .43, 1.25, 0); body.add(pivot); pivot.userData.noBatch=true;
      const arm = cyl(pivot, .105, .13, .62, cloth, [0, -.28, .04], 7); arm.rotation.z = s * -.12;
      pivot.userData.sleeve = arm;
      mesh(geo('sphere', .12, 7, 5), material(skin), pivot, 0, -.59, .04); arms.push(pivot);
    }
    const legs = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(s * .2, .66, 0); body.add(pivot); pivot.userData.noBatch=true;
      const legColor = special === 'founder' ? 0x3d6e9d : cameoStyle ? 0x343943 : 0x3e4a58;
      pivot.userData.trouser = cyl(pivot, .12, .15, .58, legColor, [0, -.27, 0], 7); box(pivot, [.25, .14, .4], 0x303840, [0, -.57, .09], .07); legs.push(pivot);
    }
    if (special === 'founder') {
      const crown = new THREE.Group(); crown.position.y = 2.37;
      for (let i = 0; i < 5; i++) mesh(geo('cone', .1, .34, 5), material(0xf0c84d, { emissive: 0x7c5c0d, emissiveIntensity: .35 }), crown, -.24 + i * .12, 0, 0);
      body.add(crown);
    }
    batchStatic(body); body.scale.setScalar(scale); g.userData.parts = { body, torso, arms, legs };
    return g;
  }

  function makeFounder(width, depth) {
    if (founder) peopleRoot.remove(founder);
    founder = makePerson({ id: 'founder', role: 'eng', mood: 90 }, 'founder'); founder.position.set(-width / 2 + 2, .12, -depth / 2 + 1.25); founder.rotation.y = .35;
    founder.userData.homeX = founder.position.x; peopleRoot.add(founder);
    updateFounderOutfit();
  }

  function updateFounderOutfit() {
    if (!founder) return;
    const outfit = state.view.founder?.outfit || 'turtleneck';
    const { body, torso, arms, legs } = founder.userData.parts;
    let wardrobe = founder.userData.wardrobe;
    if (!wardrobe) { wardrobe = new THREE.Group(); wardrobe.userData.noBatch = true; body.add(wardrobe); founder.userData.wardrobe = wardrobe; }
    wardrobe.clear();
    const cloth = { turtleneck: 0x1f242b, hoodie: 0x8a929c, plaid: 0xa55840, suit: 0x26364e }[outfit];
    torso.material = material(cloth);
    arms.forEach(arm => { arm.userData.sleeve.material = material(cloth); });
    legs.forEach(leg => { leg.userData.trouser.material = material(outfit === 'suit' ? 0x26364e : 0x3d6e9d); });
    if (outfit === 'hoodie') {
      const hood = mesh(geo('torus', .29, .12, 6, 12), material(cloth), wardrobe, 0, 1.44, -.16); hood.rotation.x = Math.PI / 2;
      box(wardrobe, [.39, .18, .045], 0x727c87, [0, .85, .244], .05);
      for (const x of [-.12, .12]) box(wardrobe, [.025, .25, .025], 0xe4e7e8, [x, 1.22, .252], .01);
    } else if (outfit === 'plaid') {
      for (const z of [-.245, .245]) {
        for (const x of [-.22, 0, .22]) box(wardrobe, [.065, .61, .018], 0xe1bd86, [x, 1.02, z]);
        for (const y of [.81, 1.03, 1.25]) box(wardrobe, [.57, .065, .022], 0x533e3d, [0, y, z]);
      }
    } else if (outfit === 'suit') {
      box(wardrobe, [.25, .57, .025], 0xf2f0e9, [0, 1.1, .247], .02);
      for (const s of [-1, 1]) { const lapel = box(wardrobe, [.13, .45, .04], 0x435371, [s * .15, 1.16, .27], .018); lapel.rotation.z = s * -.28; }
      box(wardrobe, [.065, .36, .035], 0xc36551, [0, 1.09, .273], .015);
    }
  }

  function assignSeat(id) {
    if (seatById.has(id)) return seatById.get(id);
    const occupied = new Set(seatById.values());
    for (let seat = 0; seat < 36; seat++) if (!occupied.has(seat)) {seatById.set(id, seat);return seat;}
    return 0;
  }

  function ensureDesk(seat) { if (!deskBySeat.has(seat) && stationPositions[seat]) deskBySeat.set(seat, makeStation(deskRoot, stationPositions[seat], seat)); }

  function positionPersonAtSeat(person, seat, immediate = false) {
    if (seat == null || !stationPositions[seat]) return;
    ensureDesk(seat); const p = stationPositions[seat]; person.userData.target = new THREE.Vector3(p.x, .28, p.z + .9);
    person.userData.home = person.userData.target.clone(); person.userData.seated = true;
    if (immediate) {person.position.copy(person.userData.target);person.userData.route=[];person.userData.entering=false;person.userData.lounge=null;person.userData.returnAt=0;person.userData.atLounge=false;}
    else routePerson(person,person.userData.target);
  }

  function routePerson(person, destination, leaving = false) {
    const [w,d]=roomSize(),u=person.userData,aisle=-w/2+.65;
    const points=[];
    if(u.home && !u.entering && !u.atLounge){points.push(new THREE.Vector3(person.position.x,.28,u.home.z+.7),new THREE.Vector3(aisle,.28,u.home.z+.7));}
    else if(u.atLounge)points.push(new THREE.Vector3(aisle,.28,d/2-2.5));
    if(leaving){points.push(new THREE.Vector3(aisle,.28,d/2-.3),destination.clone());}
    else if(destination===u.lounge){points.push(new THREE.Vector3(aisle,.28,d/2-2.5),new THREE.Vector3(destination.x,.28,d/2-2.5),destination.clone());}
    else {points.push(new THREE.Vector3(aisle,.28,destination.z+.7),new THREE.Vector3(destination.x,.28,destination.z+.7),destination.clone());}
    u.route=points;u.target=u.route.shift();u.walking=true;
  }

  function addStaff(data) {
    const seat = assignSeat(data.id); ensureDesk(seat);
    const person = makePerson(data); person.userData.data = { ...data }; person.userData.phase = seeded(data.id, 9) * TAU;
    const [width, depth] = roomSize(); person.position.set(-width / 2 + .65, .1, depth / 2 - .3);
    person.userData.entering = true; person.userData.birth = state.elapsed; peopleRoot.add(person); staffObjects.set(data.id, person);
    positionPersonAtSeat(person, seat);
    starBurst(person.position.clone().add(new THREE.Vector3(0, 1.4, 0)), 6, 0xffe278);
  }

  function removeStaff(id) {
    const person = staffObjects.get(id); if (!person || person.userData.leaving) return;
    const [width, depth] = roomSize(); person.userData.leaving = true; person.userData.seated = false; seatById.delete(id);
    person.userData.target = new THREE.Vector3(-width / 2 - 1.6, .1, depth / 2 + 1);
    routePerson(person,person.userData.target,true);
    const carton = box(person, [.62, .48, .48], 0xbb8650, [0, 1.05, .42], .05); carton.userData.box = true;
  }

  function updateStaffData(data) {
    const person = staffObjects.get(data.id); if (!person) return;
    if (person.userData.leaving) {person.userData.leaving=false;assignSeat(data.id);person.children.filter(o=>o.userData.box).forEach(o=>o.removeFromParent());positionPersonAtSeat(person,seatById.get(data.id));}
    if (person.userData.data.role !== data.role) {const replacement=makePerson(data);person.remove(person.userData.parts.body);person.add(replacement.userData.parts.body);person.userData.parts=replacement.userData.parts;}
    person.userData.data = { ...data };
  }

  function bubbleTexture(text, large = false) {
    const tokens=String(text||'……').match(/[A-Za-z]+|[^A-Za-z]/gu)||[],lines=[];
    const max=large?12:15;let line='',truncated=false;
    for(const token of tokens){
      if(Array.from(line+token).length>max && line){lines.push(line.trim());line='';if(lines.length===3){truncated=true;break;}}
      if(token.length>max){line+=token.slice(0,max-1)+'…';}else line+=token;
    }
    if(line && lines.length<3)lines.push(line.trim());
    if(truncated)lines[2]=lines[2].slice(0,-1)+'…';
    const font=large?64:52, width=Math.max(280,Math.max(...lines.map(l=>l.length))*font+64), height=lines.length*(font+15)+70;
    const tex = createCanvasTexture((ctx,w,h)=>{
      ctx.fillStyle=large?'#fff0b8':'#fffdf7';ctx.strokeStyle=large?'#c35c3e':'#29384c';ctx.lineWidth=8;
      ctx.beginPath();ctx.roundRect(8,8,w-16,h-32,24);ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.moveTo(w*.45,h-28);ctx.lineTo(w*.5,h-6);ctx.lineTo(w*.54,h-28);ctx.fill();
      ctx.fillStyle='#243449';ctx.font='900 '+font+'px system-ui,"Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      lines.forEach((line,i)=>ctx.fillText(line,w/2,35+font/2+i*(font+15)));
    },width,height);
    tex.userData.font=font;return tex;
  }

  function attachBubble(target, text, life = 3.5, large = false) {
    const tex=bubbleTexture(text,large), m=new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false,depthWrite:false,toneMapped:false});materials.add(m);
    const sprite=new THREE.Sprite(m);sprite.renderOrder=100;fxRoot.add(sprite);
    effects.push({type:'bubble',object:sprite,target,large,age:0,life,tex});return sprite;
  }

  // 用屏幕像素定字号，镜头缩放和办公室升级都不会让字缩成蚂蚁。
  function positionBubbles() {
    const h=Math.max(1,state.height-state.insets.top-state.insets.bottom),w=Math.max(1,state.width-state.insets.left-state.insets.right);
    const units=(camera.top-camera.bottom)/h;
    for(const e of effects){
      if(e.type!=='bubble')continue;
      const font=e.large?30:21, image=e.tex.image;
      const pixels=Math.min(w*.94,Math.max(e.large?w*.34:0,image.width/e.tex.userData.font*font));
      const pop=Math.min(1,e.age*7)*Math.min(1,(e.life-e.age)*5);
      e.object.scale.set(pixels*units*pop,pixels*image.height/image.width*units*pop,1);
      e.target.getWorldPosition(e.object.position);e.object.position.y+=(e.large?3.55:3.05)+e.object.scale.y/(2*Math.cos(state.pitch));
      const projected=e.object.position.clone().project(camera);
      const mx=pixels/w+.03,my=(pixels*image.height/image.width)/h+.03;
      projected.x=clamp(projected.x,-1+mx,1-mx);projected.y=clamp(projected.y,-1+my,1-my);
      e.object.position.copy(projected.unproject(camera));
      e.object.material.rotation=e.large?-.045+Math.sin(state.elapsed*24)*.018:0;
    }
  }

  function emojiSprite(text, person) {
    const tex = createCanvasTexture((ctx, w, h) => { ctx.font = '100px "Segoe UI Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, w / 2, h / 2 + 4); }, 128, 128);
    const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite:false, toneMapped:false }); materials.add(m);
    const s = new THREE.Sprite(m); s.scale.set(.75, .75, 1); s.position.set(0, 2.65, 0); person.add(s);
    effects.push({ type: 'emoji', object: s, parent: person, age: 0, life: 1.9 });
  }

  function starBurst(position, count = 10, color = 0xffdc55) {
    const group = new THREE.Group(); group.position.copy(position); fxRoot.add(group);
    const parts = [];
    for (let i = 0; i < count; i++) { const p = mesh(geo('sphere', .09, 5, 4), material(i % 2 ? color : 0xffffff, { emissive: color, emissiveIntensity: .35 }), group, 0, 0, 0, false); parts.push({ mesh: p, velocity: new THREE.Vector3((seeded(i, count) - .5) * 2.6, .8 + seeded(i, count + 1) * 2.1, (seeded(i, count + 2) - .5) * 2.6) }); }
    effects.push({ type: 'particles', object: group, parts, age: 0, life: 1.2, gravity: 1.5 });
  }

  function rainEffect(type) {
    const group = new THREE.Group(); fxRoot.add(group); const parts = []; const colors = type === 'confetti' ? [0xf05264, 0x47b9d2, 0xf3c54d, 0x7cc66d, 0xa878d2] : [0xf5c84b, 0x70b673];
    for (let i = 0; i < 65; i++) {
      const isCoin = type === 'money' && i % 2 === 0; const g = isCoin ? geo('cyl', .12, .12, .035, 8) : geo('box', type === 'money' ? .32 : .08, .03, type === 'money' ? .18 : .42);
      const p = mesh(g, material(colors[i % colors.length], { metalness: isCoin ? .45 : 0 }), group, (seeded(type, i) - .5) * 13, 7 + seeded(type, i + 99) * 5, (seeded(type, i + 15) - .5) * 8, false);
      p.rotation.set(seeded(i, 2) * TAU, seeded(i, 3) * TAU, seeded(i, 4) * TAU); parts.push({ mesh: p, velocity: new THREE.Vector3((seeded(i, 8) - .5) * .5, -2 - seeded(i, 9) * 1.7, 0), spin: .8 + seeded(i, 11) * 2 });
    }
    effects.push({ type: 'rain', object: group, parts, age: 0, life: 4.2 });
  }

  function smokeBurst() {
    if (!furnace) return; const group = new THREE.Group(); group.position.copy(furnace.group.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(0, 1.2, 0)); fxRoot.add(group); const parts = [];
    for (let i = 0; i < 24; i++) { const p = mesh(geo('sphere', .25 + seeded('smoke', i) * .25, 7, 5), material(i % 3 ? 0x384147 : 0x20272d, { transparent: true, opacity: .78 }), group, 0, 0, 0, false); parts.push({ mesh: p, velocity: new THREE.Vector3((seeded(i, 20) - .5) * 2, 1.2 + seeded(i, 21) * 2, (seeded(i, 22) - .5) * 2), spin: seeded(i, 23) }); }
    effects.push({ type: 'smoke', object: group, parts, age: 0, life: 3.5 });
    for (const person of staffObjects.values()) person.userData.scaredUntil = state.elapsed + 1.4;
  }

  function sync(view) {
    if (!view || state.disposed) return;
    const next = {
      mode: view.mode === 'title' ? 'title' : 'play', region: view.region === 'bay' ? 'bay' : 'sz', level: clamp(Math.round(view.level || 1), 1, 5),
      sign: String(view.sign || '混沌智能'), staff: Array.isArray(view.staff) ? view.staff.slice(0, 36) : [], racks: clamp(Math.round(view.racks || 0), 0, 12),
      furnace: view.furnace && typeof view.furnace === 'object' ? { heat: clamp(Number(view.furnace.heat) || 0, 0, 1) } : null,
      logo: typeof view.logo === 'string' && /^data:image\/svg\+xml[;,]/i.test(view.logo) ? view.logo : '',
      brand: /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(view.brand) ? view.brand : '',
      founder: { outfit: ['turtleneck', 'hoodie', 'plaid', 'suit'].includes(view.founder?.outfit) ? view.founder.outfit : 'turtleneck' },
      night: !!view.night, alert: !!view.alert
    };
    const old = state.view;
    const reserved=new Set(next.staff.map(p=>seatById.get(String(p.id))).filter(seat=>seat!==undefined));
    for(const person of next.staff)if(!seatById.has(String(person.id))){for(let seat=0;seat<36;seat++)if(!reserved.has(seat)){reserved.add(seat);break;}}
    const required=Math.max(LEVEL_SEATS[next.level-1],Math.max(-1,...reserved)+1);
    const capacityChanged=required>layoutCount;
    if(old.level!==next.level || old.region!==next.region || capacityChanged)layoutCount=required;
    const roomChanged = !state.roomKey || old.level !== next.level || old.region !== next.region || capacityChanged;
    const racksChanged = old.racks !== next.racks;
    const brandChanged = old.logo !== next.logo || old.brand !== next.brand || old.sign !== next.sign;
    const outfitChanged = (old.founder?.outfit || 'turtleneck') !== next.founder.outfit;
    state.view = next;
    if (!state.roomKey || old.region !== next.region) buildBackdrop(next.region);
    if (roomChanged) { state.roomKey = `${next.region}:${next.level}:${next.sign}`; rebuildRoom(); }
    else {
      if (racksChanged) rebuildRacks();
      if (brandChanged) updateBrand();
      if (outfitChanged) updateFounderOutfit();
    }
    const incoming = new Map(next.staff.map(s => [String(s.id), { id: String(s.id), role: s.role, mood: clamp(Number(s.mood) || 0, 0, 100) }]));
    for (const [id] of staffObjects) if (!incoming.has(id)) removeStaff(id);
    for (const [id, data] of incoming) { if (!staffObjects.has(id)) addStaff(data); else updateStaffData(data); }
    if(roomChanged || racksChanged || outfitChanged) collectResources();
  }

  const dayTop=new THREE.Color(0xbfe6ff),nightTop=new THREE.Color(0x1b2350);
  const dayBottom=new THREE.Color(0xfef3d6),nightBottom=new THREE.Color(0x3a2b63);
  const dayFog=new THREE.Color(0xcfeaff),nightFog=new THREE.Color(0x30345f);
  const alarmColor=new THREE.Color(0xff2d37);
  function updateTheme(dt=0) {
    nightMix=THREE.MathUtils.damp(nightMix,state.view.night?1:0,5,dt);
    skyMaterial.uniforms.night.value=nightMix;skyMaterial.uniforms.aspect.value=state.width/state.height;skyMaterial.uniforms.time.value=state.elapsed;
    skyMaterial.uniforms.top.value.copy(dayTop).lerp(nightTop,nightMix);
    skyMaterial.uniforms.bottom.value.copy(dayBottom).lerp(nightBottom,nightMix);
    scene.fog.color.copy(dayFog).lerp(nightFog,nightMix);
    hemi.intensity=2.15-nightMix*.25;sun.intensity=3.25-nightMix*1.55;fill.intensity=1+nightMix*1.5;
    warmLights.forEach(l=>{l.intensity=4+nightMix*22;});
    backdropColors.forEach(c=>c.material.color.copy(c.day).lerp(c.night,nightMix));
    windowMaterials.forEach(m=>{m.emissiveIntensity=nightMix*.7;});
    nightObjects.forEach(o=>{o.visible=nightMix>.5;});
    skyObjects.forEach(o=>{o.visible=o.userData.nightOnly?nightMix>.2:nightMix<.9;});
  }

  function startle() {
    for(const p of [...staffObjects.values(),founder].filter(Boolean)) {p.userData.scaredUntil=state.elapsed+1.4;emojiSprite('!',p);}
  }

  function play(name, data = {}) {
    if (state.disposed) return;
    if (name === 'confetti' || name === 'money') rainEffect(name);
    else if (name === 'alarm') { alarmUntil = state.elapsed + 3; alertPhase = 0; startle(); }
    else if (name === 'boom') { smokeBurst(); startle(); alarmUntil = Math.max(alarmUntil, state.elapsed + 1.1); }
    else if (name === 'levelup') { levelBounce = state.elapsed; starBurst(new THREE.Vector3(0, 3.4, 0), 28, 0xffd349); }
    else if (name === 'say') {
      let target = data.who === 'founder' ? founder : staffObjects.get(String(data.who || ''));
      if (!target) { const list = [...staffObjects.values()].filter(p => !p.userData.leaving); target = list[Math.floor(seeded(data.text || state.elapsed, 1) * list.length)] || founder; }
      if (target) attachBubble(target, data.text || '收到！');
    } else if (name === 'cameo') startCameo(data.text || '你再也吃不到 Chepole 了！！！');
  }

  function startCameo(text) {
    if (cameo) { peopleRoot.remove(cameo); cameo = null; }
    cameo = makePerson({ id: 'longhair-cameo', role: 'eng', mood: 100 }, 'cameo'); cameo.position.set(-roomSize()[0], .1, roomSize()[1]/2-1.3); cameo.userData.centerX=state.view.level===5?-2.4:0; cameo.userData.started = state.elapsed; cameo.userData.text = text; peopleRoot.add(cameo);
  }

  function animatePerson(person, dt, now) {
    const u=person.userData,parts=u.parts,phase=(u.phase||0)+now*4;
    if(u.target){
      const dx=u.target.x-person.position.x,dz=u.target.z-person.position.z,dist=Math.hypot(dx,dz);
      if(dist>.035){
        const step=Math.min(dist,dt*(u.leaving?3.5:3));person.position.x+=dx/dist*step;person.position.z+=dz/dist*step;person.position.y=.28;
        person.rotation.y=Math.atan2(dx,dz);parts.body.position.y=Math.abs(Math.sin(now*8+phase))*.07;
        parts.legs[0].rotation.x=Math.sin(now*8)*.5;parts.legs[1].rotation.x=-parts.legs[0].rotation.x;
        parts.arms[0].rotation.x=-parts.legs[0].rotation.x*.5;parts.arms[1].rotation.x=-parts.arms[0].rotation.x;
        return;
      }
      if(u.route?.length){u.target=u.route.shift();return;}
      u.target=null;u.walking=false;u.entering=false;
      if(u.leaving){peopleRoot.remove(person);staffObjects.delete(u.id);seatById.delete(u.id);return;}
      if(u.lounge && person.position.distanceTo(u.lounge)<.2){u.atLounge=true;u.returnAt=now+4.5;person.rotation.y=u.chatSlot?Math.PI/2:-Math.PI/2;if(!u.chatBubble){attachBubble(person,'先喝一杯，再炼一炉');u.chatBubble=true;}}
      else {u.atLounge=false;person.rotation.y=Math.PI;}
    }
    parts.body.position.y=(u.atLounge?0:-.43)+(u.scaredUntil>now?Math.abs(Math.sin(now*24))*.24:Math.sin(now*1.5+phase)*.018);
    parts.arms[0].rotation.x=-.75+Math.sin(phase)*.18;parts.arms[1].rotation.x=-.75-Math.sin(phase*1.13)*.18;
    parts.legs.forEach(l=>{l.rotation.x=u.atLounge?0:-1.05;});parts.body.rotation.y=Math.sin(now*.75+phase)*.045;
    if(u.returnAt && now>u.returnAt && u.home){u.returnAt=0;routePerson(person,u.home);return;}
    if(u.atLounge)return;
    const mood=u.data?.mood??50,pulse=Math.floor(now/7+seeded(u.id,20)*5);
    if(pulse!==u.moodPulse){u.moodPulse=pulse;if(seeded(u.id,pulse)>.85){if(mood<35)emojiSprite('💢',person);else if(mood>75)emojiSprite('🔥',person);}}
    const walkPulse=Math.floor(now/18+seeded(u.id,30)*8);
    if(walkPulse!==u.walkPulse){
      const first=u.walkPulse===undefined;u.walkPulse=walkPulse;
      const chatting=[...staffObjects.values()].filter(p=>p.userData.lounge && (p.userData.walking||p.userData.atLounge)).length;
      if(!first && chatting<2 && seeded(u.id,walkPulse+90)>.8){const [w,d]=roomSize();u.lounge=new THREE.Vector3(w/2-4.8+chatting*1.15,.28,d/2-1.2);u.chatBubble=false;u.chatSlot=chatting;routePerson(person,u.lounge);}
    }
  }

  function updateEffects(dt) {
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i]; e.age += dt;
      if (e.type === 'particles' || e.type === 'smoke' || e.type === 'rain') {
        for (const p of e.parts) { p.mesh.position.addScaledVector(p.velocity, dt); if (e.gravity) p.velocity.y -= e.gravity * dt; p.mesh.rotation.x += (p.spin || 1) * dt; p.mesh.rotation.z += (p.spin || 1.4) * dt; if (e.type === 'smoke') p.mesh.scale.addScalar(dt * .32); }
      } else if (e.type === 'bubble' && !e.target.parent) e.age=e.life;
      else if (e.type === 'emoji') e.object.position.y += dt * .35;
      if (e.age >= e.life) { e.object.removeFromParent(); if(e.object.isSprite){textures.delete(e.object.material.map);e.object.material.map.dispose();materials.delete(e.object.material);e.object.material.dispose();}effects.splice(i,1); }
    }
  }

  const coldBronze=new THREE.Color(0x77838a);
  function updateFurnace(now) {
    if(!furnace)return;
    const active=!!state.view.furnace,heat=active?state.view.furnace.heat:0;
    furnace.coreMat.emissiveIntensity=active?.8+heat*1.7:0;
    furnace.coreMat.color.setHex(active?0xff6e22:0x6a747e);
    furnace.shell.forEach(s=>s.material.color.copy(active?s.day:coldBronze));
    furnace.group.scale.setScalar(furnace.scale*(1+(active?Math.sin(now*3.5)*(.012+heat*.02):0)));
    furnace.group.position.x=furnace.x+(active?Math.sin(now*32)*heat*.016:0);
    furnace.glow.material.opacity=active?.25+heat*.65:0;
    furnace.light.intensity=active?4+heat*14:0;
    furnaceParticles.forEach((p,i)=>{p.mesh.visible=active&&i<Math.ceil(5+heat*13);if(p.mesh.visible){const t=(now*p.speed+p.phase)%1;p.mesh.position.set(Math.sin(p.phase*30+t*5)*.35*(1-t),1.65+t*2,.12+Math.cos(p.phase*20)*.25);p.mesh.scale.setScalar(1-t*.7);}});
    furnace.smoke.forEach((p,i)=>{p.visible=!active;if(!active){const t=(now*.18+i/5)%1;p.position.set(Math.sin(t*7)*.12,1.95+t*1.55,0);p.scale.setScalar(.4+t*1.7);p.material.opacity=(1-t)*.23;}});
  }

  function updateCameo(now) {
    if (!cameo) return; const age = now - cameo.userData.started; const parts = cameo.userData.parts;
    if (age < .85) cameo.position.x = THREE.MathUtils.lerp(-roomSize()[0], cameo.userData.centerX, ease(age / .85));
    else if (age < 3.2) { const jumpT = (age - .85) / .78; const local = jumpT % 1; cameo.position.y = Math.sin(local * Math.PI) * 1.4; parts.body.scale.set(1 - .16 * Math.sin(local * Math.PI), 1 + .25 * Math.sin(local * Math.PI), 1 - .16 * Math.sin(local * Math.PI)); if (!cameo.userData.bubble && age > 1.05) { attachBubble(cameo, cameo.userData.text, 5.2, true); cameo.userData.bubble = true; } }
    else if (age < 6) { cameo.position.y = 0; parts.body.scale.set(1, 1, 1); }
    else if (age < 6.8) { cameo.position.x = THREE.MathUtils.lerp(cameo.userData.centerX, roomSize()[0], ease((age - 6) / .8)); cameo.position.y = Math.sin((age - 6) / .8 * Math.PI) * 1.8; }
    else { peopleRoot.remove(cameo); cameo = null; }
  }

  const fitCorner=new THREE.Vector3(),cameraFocus=new THREE.Vector3();
  function updateCamera(now) {
    const modeYaw=state.view.mode==='title'&&!state.dragging?now*.055:state.yaw;
    const yaw=modeYaw+(state.view.mode==='play'&&!state.dragging?Math.sin(now*.22)*.012:0);
    const [w,d]=roomSize(),dist=48;
    cameraFocus.set(0,1.8,0);
    camera.position.set(Math.sin(yaw)*Math.cos(state.pitch)*dist,1.8+Math.sin(state.pitch)*dist,Math.cos(yaw)*Math.cos(state.pitch)*dist);
    camera.lookAt(cameraFocus);camera.updateMatrixWorld(true);
    const aspect=Math.max(.1,(state.width-state.insets.left-state.insets.right)/Math.max(1,state.height-state.insets.top-state.insets.bottom));
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(const x of [-w/2-1.15,w/2+1.15])for(const z of [-d/2-1.15,d/2+1.15])for(const y of [-1.2,state.view.level===5?6.3:3.9]){
      fitCorner.set(x,y,z).applyMatrix4(camera.matrixWorldInverse);minX=Math.min(minX,fitCorner.x);maxX=Math.max(maxX,fitCorner.x);minY=Math.min(minY,fitCorner.y);maxY=Math.max(maxY,fitCorner.y);
    }
    const vertical=Math.max((maxY-minY)/2,(maxX-minX)/2/aspect)/.85/state.zoom;
    const cx=(minX+maxX)/2,cy=(minY+maxY)/2;
    camera.top=cy+vertical;camera.bottom=cy-vertical;camera.left=cx-vertical*aspect;camera.right=cx+vertical*aspect;camera.updateProjectionMatrix();
    const horizon=backdropRoot.userData.horizon,clouds=backdropRoot.userData.cloudLayer;
    if(horizon){horizon.position.set(cx,cy+vertical*.38,-76).applyMatrix4(camera.matrixWorld);horizon.rotation.y=yaw;horizon.scale.setScalar(Math.min(vertical*aspect/19,vertical/12));}
    if(clouds){clouds.position.set(cx,cy+vertical*.75,-72).applyMatrix4(camera.matrixWorld);clouds.rotation.y=yaw;clouds.scale.setScalar(vertical*aspect/20);}
  }

  function renderFrame(time) {
    if (state.disposed) return; animationFrame=requestAnimationFrame(renderFrame);
    if (!state.visible) { state.last = time; return; }
    const dt = Math.min(.05, (time - state.last) / 1000); state.last = time; state.elapsed += dt; const now = state.elapsed;
    backdropRoot.traverse(o => { if (o.userData.cloud) o.position.x = ((o.position.x + dt * .18 + 22) % 44) - 22; });
    for (const [id, person] of [...staffObjects]) animatePerson(person, dt, now);
    if (founder) { founder.position.x = founder.userData.homeX + Math.sin(now * .55) * .55; founder.userData.parts.body.position.y=founder.userData.scaredUntil>now?Math.abs(Math.sin(now*20))*.2:0; founder.userData.parts.legs[0].rotation.x = Math.sin(now * 3.4) * .35; founder.userData.parts.legs[1].rotation.x = -founder.userData.parts.legs[0].rotation.x; }
    leds.forEach(l => { l.mesh.material.emissiveIntensity = Math.sin(now * (4 + l.seed) + l.seed) > .2 ? 1.25 : .08; });
    updateTheme(dt); updateScreens(now); updateFurnace(now); updateEffects(dt); updateCameo(now);
    if(now-resourceSweep>10){collectResources();resourceSweep=now;}
    const alarm = now < alarmUntil; if (alarm || state.view.alert) alertPhase += dt;
    if (siren) { siren.rotation.y += dt * .8; siren.visible = state.view.alert; }
    if (levelBounce) { const t = now - levelBounce; const s = t < 1.2 ? 1 + Math.sin(t * 10) * .12 * (1 - t / 1.2) : 1; buildingRoot.scale.setScalar(s); if (t >= 1.2) levelBounce = 0; }
    const shake = alarm ? .16 * Math.sin(now * 43) : 0; world.position.set(shake, 0, -shake * .55);
    if (alarm) { const flash = (Math.sin(now * 13) + 1) / 2; skyMaterial.uniforms.bottom.value.lerp(alarmColor, flash * .12); }
    updateCamera(now); positionBubbles();
    const availW = Math.max(1, state.width - state.insets.left - state.insets.right), availH = Math.max(1, state.height - state.insets.top - state.insets.bottom);
    renderer.setScissorTest(false); renderer.setViewport(0, 0, state.width, state.height); renderer.autoClear = true; renderer.render(skyScene, skyCamera);
    renderer.autoClear = false; renderer.clearDepth(); renderer.setViewport(state.insets.left, state.insets.bottom, availW, availH); renderer.setScissor(state.insets.left, state.insets.bottom, availW, availH); renderer.setScissorTest(true); renderer.render(scene, camera); renderer.setScissorTest(false);
  }

  function resize() {
    const rect = containerEl.getBoundingClientRect(); state.width = Math.max(1, Math.round(rect.width)); state.height = Math.max(1, Math.round(rect.height)); renderer.setSize(state.width, state.height, false);
  }
  function setInsets(value = {}) { for (const k of ['left', 'right', 'top', 'bottom']) state.insets[k] = Math.max(0, Number(value[k]) || 0); }
  function onPointerDown(e) { state.dragging = true; state.pointerX = e.clientX; state.baseYaw = state.yaw; renderer.domElement.setPointerCapture?.(e.pointerId); }
  function onPointerMove(e) { if (!state.dragging) return; state.yaw = clamp(state.baseYaw - (e.clientX - state.pointerX) * .006, THREE.MathUtils.degToRad(-25), THREE.MathUtils.degToRad(115)); }
  function onPointerUp() { state.dragging = false; }
  function onWheel(e) { e.preventDefault(); state.zoom = clamp(state.zoom * Math.exp(-e.deltaY * .001), .72, 1.55); }
  function onVisibility() { state.visible = !document.hidden; state.last = performance.now(); }
  const ro = new ResizeObserver(resize); ro.observe(containerEl); resize();
  renderer.domElement.addEventListener('pointerdown', onPointerDown); renderer.domElement.addEventListener('pointermove', onPointerMove); renderer.domElement.addEventListener('pointerup', onPointerUp); renderer.domElement.addEventListener('pointercancel', onPointerUp); renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
  document.addEventListener('visibilitychange', onVisibility);
  animationFrame=requestAnimationFrame(renderFrame);

  function dispose() {
    if (state.disposed) return; state.disposed = true; cancelAnimationFrame(animationFrame); ro.disconnect(); document.removeEventListener('visibilitychange', onVisibility);
    renderer.domElement.removeEventListener('pointerdown', onPointerDown); renderer.domElement.removeEventListener('pointermove', onPointerMove); renderer.domElement.removeEventListener('pointerup', onPointerUp); renderer.domElement.removeEventListener('pointercancel', onPointerUp); renderer.domElement.removeEventListener('wheel', onWheel);
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); sun.shadow.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    effects.length=0;staffObjects.clear();seatById.clear();deskBySeat.clear();geoCache.clear();matCache.clear();geometries.clear();materials.clear();textures.clear();
    brandSigns.length=0;brandAccents.length=0;
    for(const root of [backdropRoot,staticRoot,deskRoot,rackRoot,buildingRoot,peopleRoot,fxRoot,world,scene,skyScene])root.clear();
    leds.length=0;furnaceParticles.length=0;screens.length=0;warmLights.length=0;nightObjects.length=0;skyObjects.length=0;backdropColors.length=0;windowMaterials.clear();founder=null;furnace=null;cameo=null;
  }

  // 首帧有内容，同时保留模块顶层的 Node 可导入性。
  buildBackdrop(state.view.region); rebuildRoom(); updateTheme();
  return { sync, play, setInsets, dispose };
}

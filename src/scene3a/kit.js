// 3A 版建模工具箱：PBR 材质（带世界空间的微表面纹理）+ 基础几何体 + 静态合批。
// 约定：单位≈米，y 轴朝上；所有 x/y/z 都是「物体中心」的位置（不是底面）；物体正面朝 +Z。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ── 可平铺的噪声贴图：RG = 法线扰动，B = 粗糙度起伏，A = 大块的明暗斑驳 ──
function tileNoise(n, cx, cy, seed) {
  const g = new Float32Array(cx * cy); let s = seed >>> 0;
  for (let i = 0; i < g.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; g[i] = s / 4294967296; }
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const fx = x / n * cx, fy = y / n * cy, x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), x1 = (x0 + 1) % cx, y1 = (y0 + 1) % cy;
    const a = g[y0 * cx + x0], b = g[y0 * cx + x1], c = g[y1 * cx + x0], d = g[y1 * cx + x1];
    out[y * n + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  return out;
}
function fbm(n, cx, cy, oct, seed) {
  const out = new Float32Array(n * n); let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) { const t = tileNoise(n, Math.min(n, cx << o), Math.min(n, cy << o), seed + o * 97); for (let i = 0; i < out.length; i++) out[i] += t[i] * amp; tot += amp; amp *= 0.5; }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
function grainTexture(height, k, seed) {
  const n = Math.sqrt(height.length) | 0, data = new Uint8Array(n * n * 4), rv = fbm(n, 8, 8, 3, seed + 7), cv = fbm(n, 3, 3, 3, seed + 13);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, l = height[y * n + (x + n - 1) % n], r = height[y * n + (x + 1) % n], u = height[((y + n - 1) % n) * n + x], d = height[((y + 1) % n) * n + x];
    data[i * 4] = 127.5 + Math.max(-127, Math.min(127, (l - r) * k * 127)); data[i * 4 + 1] = 127.5 + Math.max(-127, Math.min(127, (u - d) * k * 127));
    data[i * 4 + 2] = rv[i] * 255; data[i * 4 + 3] = cv[i] * 255;
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4; t.needsUpdate = true;
  return t;
}
function makeGrains() {
  const N = 256, weave = new Float32Array(N * N), pebble = fbm(N, 24, 24, 2, 5);
  const wn = fbm(N, 32, 32, 2, 9);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) weave[y * N + x] = 0.5 + 0.32 * Math.sin(x / N * Math.PI * 48) * Math.sin(y / N * Math.PI * 48) + (wn[y * N + x] - 0.5) * 0.3;
  for (let i = 0; i < pebble.length; i++) pebble[i] = Math.pow(Math.abs(pebble[i] - 0.5) * 2, 0.6);          // 颗粒感：一粒一粒的凸起
  return {
    noise: grainTexture(fbm(N, 16, 16, 4, 1), 6, 1), wood: grainTexture(fbm(N, 6, 64, 3, 2), 5, 2), weave: grainTexture(weave, 4, 3),
    brushed: grainTexture(fbm(N, 128, 4, 2, 4), 5, 4), pebble: grainTexture(pebble, 5, 5),
  };
}
// 材质的 tex 提示 → [贴图, 每多少米平铺一次, 凹凸强度, 粗糙度起伏, 明暗斑驳]
const TEX = {
  wood: ['wood', 0.9, 0.45, 0.22, 0.10], fabric: ['weave', 0.14, 0.55, 0.12, 0.06], carpet: ['weave', 0.22, 0.85, 0.10, 0.12], metal: ['brushed', 0.5, 0.22, 0.18, 0.05],
  plastic: ['noise', 0.09, 0.10, 0.07, 0.02], stone: ['noise', 1.6, 0.5, 0.28, 0.14], concrete: ['noise', 1.6, 0.5, 0.28, 0.14], asphalt: ['pebble', 0.9, 0.85, 0.28, 0.16],
  plaster: ['noise', 0.6, 0.22, 0.10, 0.06], leather: ['pebble', 0.12, 0.45, 0.18, 0.05], paper: ['noise', 0.2, 0.14, 0.05, 0.03], rubber: ['pebble', 0.1, 0.3, 0.1, 0.03],
  foliage: ['noise', 0.35, 0.8, 0.2, 0.2], grass: ['noise', 0.45, 1.0, 0.1, 0.24], bronze: ['noise', 0.4, 0.45, 0.32, 0.26], paint: ['noise', 0.25, 0.08, 0.06, 0.03], brick: ['pebble', 0.5, 0.6, 0.2, 0.14],
};
// pat: ['tile', 边长, 缝深, 色差] 地面方砖 | ['plank', 宽, 长, 缝深, 色差] 木地板 | ['brick', 长, 高, 缝深, 色差] 立面砖墙 | ['grid', 宽, 高, 缝深, 色差] 立面瓷砖/幕墙分格
const PAT_H = `float gH = fract(sin(dot(floor(q), vec2(12.9898, 78.233))) * 43758.5453);`;
const PAT = {
  tile: `if (gW.y > 0.5) { vec2 q = vGPos.xz / uPat.x; vec2 a = abs(fract(q) - 0.5); float w = max(fwidth(q.x), fwidth(q.y)) * 1.5 + 0.015; ${PAT_H}
    diffuseColor.rgb *= (1.0 - smoothstep(0.5 - w, 0.5, max(a.x, a.y)) * uPat.z) * (1.0 + (gH - 0.5) * uPat.w); }`,
  plank: `if (gW.y > 0.5) { float row = floor(vGPos.x / uPat.x); vec2 q = vec2(vGPos.x / uPat.x, vGPos.z / uPat.y + fract(sin(row * 12.9898) * 43758.5453)); vec2 a = abs(fract(q) - 0.5); ${PAT_H}
    float l = max(smoothstep(0.5 - fwidth(q.x) * 1.5 - 0.02, 0.5, a.x), smoothstep(0.5 - fwidth(q.y) * 1.5 - 0.004, 0.5, a.y));
    diffuseColor.rgb *= (1.0 - l * uPat.z) * (1.0 + (gH - 0.5) * uPat.w); }`,
  brick: `if (gW.y < 0.5) { float u = gW.x > 0.5 ? vGPos.z : vGPos.x; float rw = floor(vGPos.y / uPat.y); vec2 q = vec2(u / uPat.x + 0.5 * mod(rw, 2.0), vGPos.y / uPat.y); vec2 a = abs(fract(q) - 0.5); ${PAT_H}
    float l = max(smoothstep(0.5 - fwidth(q.x) * 1.5 - 0.02, 0.5, a.x), smoothstep(0.5 - fwidth(q.y) * 1.5 - 0.05, 0.5, a.y));
    diffuseColor.rgb *= (1.0 - l * uPat.z) * (1.0 + (gH - 0.5) * uPat.w); }`,
  grid: `if (gW.y < 0.5) { float u = gW.x > 0.5 ? vGPos.z : vGPos.x; vec2 q = vec2(u / uPat.x, vGPos.y / uPat.y); vec2 a = abs(fract(q) - 0.5); ${PAT_H}
    float l = max(smoothstep(0.5 - fwidth(q.x) * 1.5 - 0.02, 0.5, a.x), smoothstep(0.5 - fwidth(q.y) * 1.5 - 0.02, 0.5, a.y));
    diffuseColor.rgb *= (1.0 - l * uPat.z) * (1.0 + (gH - 0.5) * uPat.w); }`,
};
const GRAIN_PARS = /* glsl */`
uniform sampler2D uGrain; uniform vec4 uGrainP; uniform vec4 uPat; varying vec3 vGPos;
`;

export function makeKit() {
  const mats = new Map(), geos = new Map(), nightMats = [], grains = makeGrains();
  const R = v => Math.round(v * 1000) / 1000;

  // 材质。color 是十六进制数或字符串。o：
  //   rough 粗糙度(0.8) | metal 金属度(0) | glow 自发光颜色 | glowK 自发光强度(1) | night 夜里的自发光强度（给了就会在天黑时自动变亮）
  //   alpha 透明度 | side 双面 | clear 清漆层 0..1（车漆、釉面）| env 环境反射强度 | tex 微表面提示（见 TEX）| pat 拼缝图案（见 PAT）
  function create(color, o, pv) {
    const base = { color, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0 };
    const m = o.clear ? new THREE.MeshPhysicalMaterial({ ...base, clearcoat: o.clear, clearcoatRoughness: 0.12 }) : new THREE.MeshStandardMaterial(base);
    if (o.glow != null) { m.emissive = new THREE.Color(o.glow); m.emissiveIntensity = o.glowK ?? 1; if (o.night != null) nightMats.push([m, o.glowK ?? 1, o.night]); }
    if (o.alpha != null && o.alpha < 1) { m.transparent = true; m.opacity = o.alpha; m.depthWrite = false; }
    if (o.side) m.side = THREE.DoubleSide;
    if (o.env != null) m.envMapIntensity = o.env;
    if (pv) m.vertexColors = true;
    const T = TEX[o.tex] || (o.pat ? TEX.paint : null), P = o.pat;
    if (T || pv) {
      m.onBeforeCompile = sh => {
        if (T) {                                                               // 世界空间三向投影的微表面：不依赖 UV，合批后也不会乱
          sh.uniforms.uGrain = { value: grains[T[0]] }; sh.uniforms.uGrainP = { value: new THREE.Vector4(1 / T[1], T[2], T[3], T[4]) };
          sh.uniforms.uPat = { value: P ? (P[0] === 'tile' ? new THREE.Vector4(P[1], P[1], P[2] ?? 0.3, P[3] ?? 0.1) : new THREE.Vector4(P[1], P[2], P[3] ?? 0.3, P[4] ?? 0.1)) : new THREE.Vector4() };
          sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGPos;')
            .replace('#include <project_vertex>', `#include <project_vertex>
            { vec4 gw = vec4(transformed, 1.0);
            #ifdef USE_BATCHING
              gw = batchingMatrix * gw;
            #endif
            #ifdef USE_INSTANCING
              gw = instanceMatrix * gw;
            #endif
            vGPos = (modelMatrix * gw).xyz; }`);
          sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + GRAIN_PARS)
            .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
            vec3 gN = abs(inverseTransformDirection(normalize(vNormal), viewMatrix)), gP = vGPos * uGrainP.x;
            vec3 gW = gN.x > gN.y && gN.x > gN.z ? vec3(1.0, 0.0, 0.0) : gN.y > gN.z ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0);
            vec4 gA = texture2D(uGrain, gW.x > 0.5 ? gP.zy : gW.y > 0.5 ? gP.xz : gP.xy);
            roughnessFactor = clamp(roughnessFactor + (gA.b - 0.5) * 2.0 * uGrainP.z, 0.05, 1.0);
            diffuseColor.rgb *= 1.0 + (gA.a - 0.5) * 2.0 * uGrainP.w;
            ${P ? PAT[P[0]] || '' : ''}`)
            .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
            { vec2 a = (gA.rg - 0.5) * 2.0;
              vec3 gG = gW.x > 0.5 ? vec3(0.0, a.y, a.x) : gW.y > 0.5 ? vec3(a.x, 0.0, a.y) : vec3(a.x, a.y, 0.0);
              vec3 nW = normalize(inverseTransformDirection(normal, viewMatrix) + gG * uGrainP.y);
              normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz); }`);
        }
        if (pv) {                                                              // 合批后的类别材质：粗糙度、金属度从顶点读
          sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aRM; varying vec2 vRM;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = aRM;');
          sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vRM;').replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vRM.x;').replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vRM.y;');
        }
      };
      m.customProgramCacheKey = () => 'kit' + (T ? 'T' : '') + (o.clear ? 'P' : 'S') + (P ? P[0] : '') + (pv ? 'V' : '');
    }
    return m;
  }
  // 材质。color 是十六进制数或字符串。o：
  //   rough 粗糙度(0.8) | metal 金属度(0) | glow 自发光颜色 | glowK 自发光强度(1) | night 夜里的自发光强度（给了就会在天黑时自动变亮）
  //   alpha 透明度 | side 双面 | clear 清漆层 0..1（车漆、釉面）| env 环境反射强度 | tex 微表面提示（见 TEX）| pat 拼缝图案（见 PAT）
  function mat(color, o = {}) {
    const key = [color, o.rough ?? 0.8, o.metal ?? 0, o.glow ?? '', o.glowK ?? 1, o.night ?? '', o.alpha ?? 1, o.side ? 1 : 0, o.clear ?? 0, o.env ?? '', o.tex ?? '', o.pat ? o.pat.join(',') : ''].join('|');
    let m = mats.get(key);
    if (m) return m;
    m = create(color, o, false);
    // 不发光、不透明的普通材质可以按类别合批（同一种质感的不同颜色合成一个网格）
    if (o.glow == null && !(o.alpha < 1) && !o.side) { m.userData.cls = [o.tex ?? '', o.pat ? o.pat.join(',') : '', o.clear ?? 0, o.env ?? ''].join('|'); m.userData.o = { tex: o.tex, pat: o.pat, clear: o.clear, env: o.env }; }
    mats.set(key, m);
    return m;
  }
  const classMats = new Map();
  const classMat = m => { const c = m.userData.cls; if (c == null) return null; let x = classMats.get(c); if (!x) classMats.set(c, (x = create('#ffffff', m.userData.o, true))); return x; };
  const geo = (key, make) => { let g = geos.get(key); if (!g) geos.set(key, (g = make())); return g; };
  // 放一个网格。color 也可以直接传材质。o 里还能带：rx/ry/rz 旋转、s 或 sx/sy/sz 缩放、cast/receive 是否投射/接收阴影
  function put(g, color, parent, x = 0, y = 0, z = 0, o = {}) {
    const m = new THREE.Mesh(g, color?.isMaterial ? color : mat(color, o));
    m.position.set(x, y, z);
    if (o.rx) m.rotation.x = o.rx;
    if (o.ry) m.rotation.y = o.ry;
    if (o.rz) m.rotation.z = o.rz;
    if (o.s || o.sx || o.sy || o.sz) m.scale.set(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1, o.sz ?? o.s ?? 1);
    m.castShadow = o.cast !== false && !(o.alpha < 1);
    m.receiveShadow = o.receive !== false;
    parent?.add(m);
    return m;
  }
  const rad = r => Math.max(10, Math.min(48, Math.round(10 + r * 44)));        // 圆面分段：小东西少一点，大东西密一点
  const V2 = pts => pts.map(p => new THREE.Vector2(p[0], p[1])), V3 = pts => pts.map(p => new THREE.Vector3(p[0], p[1], p[2]));
  return {
    THREE, mat, geo, put, nightMats, grains,
    // 静态合批（见文件末尾的 bake）：同一类质感的材质会并成一个网格
    bake(root, o = {}) { return bake(root, { ...o, classMat }); },
    group(parent, x = 0, y = 0, z = 0, ry = 0) { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent?.add(g); return g; },
    // 方块：o.r 给倒角半径（几乎所有硬表面都该带一点，哪怕 0.01）
    box(w, h, d, color, parent, x, y, z, o = {}) {
      const r = o.r ? Math.min(o.r, w / 2, h / 2, d / 2) : 0;
      return put(geo(`box|${R(w)}|${R(h)}|${R(d)}|${R(r)}`, () => (r > 0.004 ? new RoundedBoxGeometry(w, h, d, r < 0.03 ? 1 : r < 0.1 ? 2 : 3, r) : new THREE.BoxGeometry(w, h, d))), color, parent, x, y, z, o);
    },
    // 圆柱/圆台：rt 顶半径，rb 底半径；o.seg 指定边数（比如 6 = 六棱柱）；o.open 不封口
    cyl(rt, rb, h, color, parent, x, y, z, o = {}) { const s = o.seg || rad(Math.max(rt, rb)); return put(geo(`cyl|${R(rt)}|${R(rb)}|${R(h)}|${s}|${o.open ? 1 : 0}`, () => new THREE.CylinderGeometry(rt, rb, h, s, 1, !!o.open)), color, parent, x, y, z, o); },
    ball(r, color, parent, x, y, z, o = {}) { const s = o.seg || rad(r); return put(geo(`ball|${R(r)}|${s}`, () => new THREE.SphereGeometry(r, s, Math.max(8, Math.round(s * 0.66)))), color, parent, x, y, z, o); },
    cone(r, h, color, parent, x, y, z, o = {}) { const s = o.seg || rad(r); return put(geo(`cone|${R(r)}|${R(h)}|${s}`, () => new THREE.ConeGeometry(r, h, s)), color, parent, x, y, z, o); },
    // 圆环：R0 环半径，r 管半径；o.arc 弧度（默认整圈）。默认立在 XY 平面上
    torus(R0, r, color, parent, x, y, z, o = {}) { return put(geo(`torus|${R(R0)}|${R(r)}|${R(o.arc || 0)}`, () => new THREE.TorusGeometry(R0, r, Math.max(6, Math.min(16, Math.round(6 + r * 80))), Math.max(16, Math.min(64, Math.round(16 + R0 * 44))), o.arc || Math.PI * 2)), color, parent, x, y, z, o); },
    // 胶囊：r 半径，len 中段长度（总高 = len + 2r），竖着
    capsule(r, len, color, parent, x, y, z, o = {}) { return put(geo(`cap|${R(r)}|${R(len)}`, () => new THREE.CapsuleGeometry(r, len, 6, rad(r))), color, parent, x, y, z, o); },
    // 旋转体：pts = [[半径, 高度], …] 从下往上的轮廓线，绕 y 轴转一圈（花瓶、灯罩、鼎身）
    lathe(pts, color, parent, x, y, z, o = {}) { const s = o.seg || rad(Math.max(...pts.map(p => p[0]))); return put(geo(`lathe|${JSON.stringify(pts)}|${s}`, () => new THREE.LatheGeometry(V2(pts), s)), color, parent, x, y, z, o); },
    // 管子：pts = [[x,y,z], …] 走一条平滑曲线（电线、水管、把手）；o.closed 首尾相接
    tube(pts, r, color, parent, x, y, z, o = {}) { return put(geo(`tube|${JSON.stringify(pts)}|${R(r)}|${o.closed ? 1 : 0}`, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(V3(pts), !!o.closed), Math.max(8, pts.length * 8), r, 8, !!o.closed)), color, parent, x, y, z, o); },
    // 拉伸体：pts = [[x,y], …] 一圈轮廓（逆时针），沿 +z 拉出 depth；o.bevel 倒角
    extrude(pts, depth, color, parent, x, y, z, o = {}) {
      return put(geo(`ext|${JSON.stringify(pts)}|${R(depth)}|${R(o.bevel || 0)}`, () => new THREE.ExtrudeGeometry(new THREE.Shape(V2(pts)), { depth, bevelEnabled: !!o.bevel, bevelThickness: o.bevel || 0, bevelSize: o.bevel || 0, bevelSegments: 2, curveSegments: 12 })), color, parent, x, y, z, o);
    },
    plane(w, h, color, parent, x, y, z, o = {}) { return put(geo(`plane|${R(w)}|${R(h)}`, () => new THREE.PlaneGeometry(w, h)), color, parent, x, y, z, o); },
    disc(r, color, parent, x, y, z, o = {}) { const s = o.seg || rad(r); return put(geo(`disc|${R(r)}|${s}`, () => new THREE.CircleGeometry(r, s)), color, parent, x, y, z, o); },
    dispose() { for (const g of geos.values()) g.dispose(); for (const m of mats.values()) m.dispose(); for (const m of classMats.values()) m.dispose(); for (const t of Object.values(grains)) t.dispose(); geos.clear(); mats.clear(); classMats.clear(); nightMats.length = 0; },
  };
}

// ── 静态合批：把一棵不动的物体树按材质合并成很少的几个网格（draw call 从几千降到几十）──
// 带 userData.dynamic 的子树、实例化网格、精灵、线条原样保留（道具的 userData.tick 由场景在合批前收走）。
export function bake(root, o = {}) {
  root.updateMatrixWorld(true);
  const out = new THREE.Group(), inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), buckets = new Map(), keep = [], N3 = new THREE.Matrix3();
  out.position.copy(root.position); out.quaternion.copy(root.quaternion); out.scale.copy(root.scale);
  (function walk(n) {
    if (n !== root && (n.userData.dynamic || n.isInstancedMesh || n.isSprite || n.isLine || n.isPoints || n.isLight || n.isSkinnedMesh)) { keep.push(n); return; }
    if (n.isMesh && n.visible && n.geometry?.attributes.position && !Array.isArray(n.material)) {
      const cm = o.classMat ? o.classMat(n.material) : null, key = (cm || n.material).uuid + (n.castShadow ? 'c' : '') + (n.receiveShadow ? 'r' : '') + (n.renderOrder || '');
      let b = buckets.get(key); if (!b) buckets.set(key, (b = { mat: cm || n.material, pv: !!cm, cast: n.castShadow, receive: n.receiveShadow, order: n.renderOrder, items: [], nv: 0, ni: 0 }));
      const g = n.geometry, nv = g.attributes.position.count, ni = g.index ? g.index.count : nv;
      b.items.push([g, new THREE.Matrix4().multiplyMatrices(inv, n.matrixWorld), n.material]); b.nv += nv; b.ni += ni;
    }
    for (const c of n.children.slice()) walk(c);
  })(root);
  let tris = 0; const owned = [];
  for (const b of buckets.values()) {
    const pos = new Float32Array(b.nv * 3), nor = new Float32Array(b.nv * 3), uv = b.pv ? null : new Float32Array(b.nv * 2), col = b.pv ? new Uint16Array(b.nv * 3) : null, rm = b.pv ? new Uint8Array(b.nv * 2) : null, idx = b.nv > 65535 ? new Uint32Array(b.ni) : new Uint16Array(b.ni); let v0 = 0, i0 = 0;
    for (const [g, M, src] of b.items) {
      const cr = b.pv ? Math.round(src.color.r * 65535) : 0, cg = b.pv ? Math.round(src.color.g * 65535) : 0, cb = b.pv ? Math.round(src.color.b * 65535) : 0, rr = b.pv ? Math.round(src.roughness * 255) : 0, rmt = b.pv ? Math.round(src.metalness * 255) : 0;
      const P = g.attributes.position, Nn = g.attributes.normal, U = g.attributes.uv, e = M.elements, m = N3.getNormalMatrix(M).elements, nv = P.count, flip = M.determinant() < 0;
      for (let i = 0; i < nv; i++) {
        const x = P.getX(i), y = P.getY(i), z = P.getZ(i), o3 = (v0 + i) * 3;
        pos[o3] = e[0] * x + e[4] * y + e[8] * z + e[12]; pos[o3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; pos[o3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        if (Nn) { const a = Nn.getX(i), c = Nn.getY(i), d = Nn.getZ(i), nx = m[0] * a + m[3] * c + m[6] * d, ny = m[1] * a + m[4] * c + m[7] * d, nz = m[2] * a + m[5] * c + m[8] * d, l = Math.hypot(nx, ny, nz) || 1; nor[o3] = nx / l; nor[o3 + 1] = ny / l; nor[o3 + 2] = nz / l; } else nor[o3 + 1] = 1;
        if (b.pv) { col[o3] = cr; col[o3 + 1] = cg; col[o3 + 2] = cb; rm[(v0 + i) * 2] = rr; rm[(v0 + i) * 2 + 1] = rmt; }
        else if (U) { uv[(v0 + i) * 2] = U.getX(i); uv[(v0 + i) * 2 + 1] = U.getY(i); }
      }
      const I = g.index, ni = I ? I.count : nv;
      for (let i = 0; i < ni; i += 3) { const a = (I ? I.getX(i) : i) + v0, c = (I ? I.getX(i + 1) : i + 1) + v0, d = (I ? I.getX(i + 2) : i + 2) + v0; idx[i0 + i] = flip ? c : a; idx[i0 + i + 1] = flip ? a : c; idx[i0 + i + 2] = d; }      // 镜像过的要把面翻回来
      v0 += nv; i0 += ni;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1));
    if (b.pv) { g.setAttribute('color', new THREE.BufferAttribute(col, 3, true)); g.setAttribute('aRM', new THREE.BufferAttribute(rm, 2, true)); } else g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const m = new THREE.Mesh(g, b.mat); m.castShadow = b.cast && o.cast !== false; m.receiveShadow = b.receive; m.renderOrder = b.order || 0; out.add(m); owned.push(g); tris += b.ni / 3;
  }
  for (const n of keep) { const w = new THREE.Matrix4().multiplyMatrices(inv, n.matrixWorld); n.removeFromParent(); w.decompose(n.position, n.quaternion, n.scale); out.add(n); }
  out.userData.owned = owned; out.userData.tris = tris; out.userData.calls = buckets.size + keep.length;
  out.userData.dispose = () => { for (const g of owned) g.dispose(); };
  return out;
}

// ── 再合一层：把多组「合批结果」按材质并进 BatchedMesh。每一组在每个 BatchedMesh 里是一个实例，
//    可以单独改矩阵、单独隐藏（城里每栋楼的剖切就靠这个），但整座城只有十来个 draw call ──
export function batchGroups(groups) {
  const buckets = new Map(), refs = groups.map(() => []);
  groups.forEach((g, i) => {
    for (const m of g.children) {
      if (!m.isMesh || m.isInstancedMesh || m.isBatchedMesh || !m.geometry.index) continue;
      const key = m.material.uuid + (m.castShadow ? 'c' : '') + (m.receiveShadow ? 'r' : '');
      let b = buckets.get(key); if (!b) buckets.set(key, (b = { mat: m.material, cast: m.castShadow, receive: m.receiveShadow, list: [], nv: 0, ni: 0 }));
      b.list.push([i, m.geometry]); b.nv += m.geometry.attributes.position.count; b.ni += m.geometry.index.count;
    }
  });
  const group = new THREE.Group(), owned = [];
  for (const b of buckets.values()) {
    const bm = new THREE.BatchedMesh(b.list.length, b.nv, b.ni, b.mat); bm.castShadow = b.cast; bm.receiveShadow = b.receive; bm.sortObjects = false;
    for (const [i, geo] of b.list) refs[i].push([bm, bm.addInstance(bm.addGeometry(geo))]);
    group.add(bm); owned.push(bm);
  }
  for (const g of groups) g.userData.dispose?.();                               // 几何体已经拷进 BatchedMesh 了
  group.userData.dispose = () => { for (const bm of owned) bm.dispose(); };
  return { group, refs };
}

// ── 动态合批池：一堆会动、会增删的小零件（比如小人的胳膊腿）共用一个 BatchedMesh ──
export function batchPool(material, o = {}) {
  let bm = null, maxI = o.instances || 256, maxV = o.vertices || 200000, maxX = o.indices || 600000;
  const make = () => { const n = new THREE.BatchedMesh(maxI, maxV, maxX, material); n.castShadow = o.cast !== false; n.receiveShadow = true; n.sortObjects = false; n.frustumCulled = false; return n; };
  bm = make();
  return {
    get mesh() { return bm; },
    add(geo) {
      const nv = geo.attributes.position.count, ni = geo.index.count;
      if (bm.unusedVertexCount < nv || bm.unusedIndexCount < ni) bm.optimize();
      if (bm.unusedVertexCount < nv || bm.unusedIndexCount < ni) { maxV = Math.max(maxV * 1.5, maxV + nv) | 0; maxX = Math.max(maxX * 1.5, maxX + ni) | 0; bm.setGeometrySize(maxV, maxX); }
      if (bm.instanceCount >= maxI) { maxI = Math.ceil(maxI * 1.5); bm.setInstanceCount(maxI); }
      const gid = bm.addGeometry(geo), iid = bm.addInstance(gid);
      return { gid, iid };
    },
    remove(h) { if (!h) return; try { bm.deleteInstance(h.iid); bm.deleteGeometry(h.gid); } catch { /* 已经删过了 */ } },
    set(h, matrix, visible = true) { bm.setMatrixAt(h.iid, matrix); bm.setVisibleAt(h.iid, visible); },
    dispose() { bm.dispose(); },
  };
}

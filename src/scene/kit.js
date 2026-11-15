// 建模工具箱：带缓存的材质和基础几何体，场景和小道具库共用。
// 约定：单位≈米，y 轴朝上；所有 x/y/z 都是「物体中心」的位置（不是底面）。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function makeKit() {
  const mats = new Map(), geos = new Map();

  // 材质：color 是十六进制数或字符串。o: rough 粗糙度 | metal 金属度 | glow 自发光颜色 | glowK 自发光强度 | alpha 透明度 | flat 平直着色 | side 双面
  function mat(color, o = {}) {
    const key = [color, o.rough ?? 0.85, o.metal ?? 0, o.glow ?? '', o.glowK ?? 1, o.alpha ?? 1, o.flat ? 1 : 0, o.side ? 1 : 0].join('|');
    let m = mats.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.85, metalness: o.metal ?? 0 });   // 一律平滑着色，不做棱角分明的低模感
      if (o.glow != null) { m.emissive = new THREE.Color(o.glow); m.emissiveIntensity = o.glowK ?? 1; }
      if (o.alpha != null && o.alpha < 1) { m.transparent = true; m.opacity = o.alpha; m.depthWrite = false; }
      if (o.side) m.side = THREE.DoubleSide;
      mats.set(key, m);
    }
    return m;
  }
  const geo = (key, make) => { let g = geos.get(key); if (!g) geos.set(key, (g = make())); return g; };
  // 放一个网格。color 也可以直接传一个材质。o 里还能带 rx/ry/rz 旋转、cast/receive 是否投射/接收阴影
  function put(g, color, parent, x = 0, y = 0, z = 0, o = {}) {
    const m = new THREE.Mesh(g, color?.isMaterial ? color : mat(color, o));
    m.position.set(x, y, z);
    if (o.rx) m.rotation.x = o.rx;
    if (o.ry) m.rotation.y = o.ry;
    if (o.rz) m.rotation.z = o.rz;
    m.castShadow = o.cast !== false && !(o.alpha < 1);
    m.receiveShadow = o.receive !== false;
    parent?.add(m);
    return m;
  }
  return {
    THREE, mat, geo, put,
    group(parent, x = 0, y = 0, z = 0, ry = 0) { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent?.add(g); return g; },
    // 方块：o.r 给圆角半径
    box(w, h, d, color, parent, x, y, z, o = {}) { return put(geo(`box|${w}|${h}|${d}|${o.r || 0}`, () => (o.r ? new RoundedBoxGeometry(w, h, d, 4, Math.min(o.r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d))), color, parent, x, y, z, o); },
    // 圆柱/圆台：rt 顶半径，rb 底半径；o.seg 分段数
    cyl(rt, rb, h, color, parent, x, y, z, o = {}) { return put(geo(`cyl|${rt}|${rb}|${h}|${o.seg || 24}`, () => new THREE.CylinderGeometry(rt, rb, h, o.seg && o.seg <= 4 ? o.seg : Math.max(o.seg || 24, 20))), color, parent, x, y, z, o); },
    ball(r, color, parent, x, y, z, o = {}) { return put(geo(`ball|${r}|${o.seg || 14}`, () => new THREE.SphereGeometry(r, Math.max(24, (o.seg || 14) * 1.6 | 0), Math.max(16, o.seg || 14))), color, parent, x, y, z, o); },
    cone(r, h, color, parent, x, y, z, o = {}) { return put(geo(`cone|${r}|${h}|${o.seg || 12}`, () => new THREE.ConeGeometry(r, h, (o.seg || 12) <= 4 ? o.seg : Math.max(20, (o.seg || 12) * 2))), color, parent, x, y, z, o); },
    // 圆环：R 环半径，r 管半径；o.arc 弧度（默认整圈）。默认躺在 XY 平面上
    torus(R, r, color, parent, x, y, z, o = {}) { return put(geo(`torus|${R}|${r}|${o.arc || 0}|${o.seg || 20}`, () => new THREE.TorusGeometry(R, r, 12, Math.max(32, o.seg || 20), o.arc || Math.PI * 2)), color, parent, x, y, z, o); },
    dispose() { for (const g of geos.values()) g.dispose(); for (const m of mats.values()) m.dispose(); geos.clear(); mats.clear(); },
  };
}

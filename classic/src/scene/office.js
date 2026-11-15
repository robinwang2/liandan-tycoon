// 《炼丹大亨》办公室沙盘：整体场景（房间、灯光、镜头、小人、丹炉、机柜、远景、特效）。
// 小道具来自 props.js（可选：没有也能跑）。对外接口：createOffice(el) → { sync, play, setInsets, dispose }
import * as THREE from 'three';
import { makeKit } from './kit.js';
import { lookOf, FOUNDER_OUTFITS } from './looks.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const PROPS = Object.values(import.meta.glob('./props.js', { eager: true }))[0]?.PROPS || {};
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);
const LOOP_C = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
function loopPos(p, a, b, r = 1.4) {                                              // a/b 是 x/z 方向的半宽，返回 [x, z, 车头朝向]
  const len = [2 * (b - r), 2 * (a - r)], q = Math.PI * r / 2, per = 2 * (len[0] + len[1]) + 4 * q;
  p = ((p % per) + per) % per;
  for (let i = 0; i < 4; i++) {
    const f0 = i * Math.PI / 2, s = len[i % 2], pc = LOOP_C[(i + 3) % 4], nc = LOOP_C[i];
    if (p < s) return [pc[0] * (a - r) + r * Math.cos(f0) - Math.sin(f0) * p, pc[1] * (b - r) + r * Math.sin(f0) + Math.cos(f0) * p, -f0];
    p -= s;
    if (p < q) { const f = f0 + p / r; return [nc[0] * (a - r) + r * Math.cos(f), nc[1] * (b - r) + r * Math.sin(f), -f]; }
    p -= q;
  }
  return [a, 0, 0];
}

// 五个等级的房间：W×D 地板，H 墙高；cols×rows 工位；rz 机房区宽度；rackRow 每排机柜数
const LEVELS = [null,
  { W: 10, D: 8, H: 3.0, cols: 3, rows: 2, px: 1.7, pz: 2.0, rz: 3.0, rackRow: 2 },
  { W: 13, D: 9.5, H: 3.2, cols: 4, rows: 3, px: 1.9, pz: 2.0, rz: 3.4, rackRow: 3 },
  { W: 16, D: 11.5, H: 3.6, cols: 5, rows: 4, px: 1.9, pz: 2.0, rz: 4.2, rackRow: 3 },
  { W: 20, D: 13.5, H: 3.8, cols: 7, rows: 4, px: 1.9, pz: 2.1, rz: 5.0, rackRow: 4 },
  { W: 24, D: 15.5, H: 4.4, cols: 8, rows: 5, px: 1.9, pz: 2.05, rz: 6.0, rackRow: 5 },
];
function themeOf(region, level) {
  if (level === 1) return region === 'bay'
    ? { floor: '#c2c6cc', line: '#b0b5bd', tx: 2, tz: 2, wall: '#ded6c6', desk: '#c99a6b', garage: true }
    : { floor: '#ecdcc0', line: '#d8c5a4', tx: 0.8, tz: 0.8, wall: '#f5f2ea', dado: '#86b9a0', desk: '#e6c9a0', bars: true };
  if (level === 2) return { floor: '#dcbc92', line: '#c9a77c', tx: 2.2, tz: 0.45, wall: '#f6f2e9', dado: 'brand', desk: '#e6c9a0' };
  if (level === 3) return { floor: '#d3dae3', line: '#c3ccd7', tx: 1.2, tz: 1.2, wall: '#f1f3f6', carpet: '#93a8c0', desk: '#f7f5ef' };
  if (level === 4) return { floor: '#d8dee6', line: '#c8d0da', tx: 1.2, tz: 1.2, wall: '#f5f7f9', carpet: '#7f96b1', desk: '#f7f5ef', glassRoom: true };
  return { floor: '#ece6d9', line: '#ddd5c4', tx: 1.6, tz: 1.6, wall: '#ffffff', carpet: '#64809e', desk: '#f7f5ef', glassRoom: true, curtain: true };
}

export function createOffice(container) {
  const k = makeKit();
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
  container.appendChild(renderer.domElement);

  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene();
  { const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.38; pm.dispose(); }
  scene.fog = new THREE.Fog(0xd3e9fa, 108, 250);                                 // 远处的楼渐渐隐进天色里
  const cam = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 500);
  const st = {
    view: { mode: 'title', region: 'bay', level: 0, sign: '', staff: [], racks: 0, furnace: null, night: false, alert: false },
    key: '', L: LEVELS[1], az: Math.PI / 4, azUser: 0, zoom: 1, insets: { left: 0, right: 0, top: 0, bottom: 0 }, scale: 0, t: 0,
    night: 0, heat: 0, shake: 0, alarm: 0, pop: 0, w: 1, h: 1, ledT: 0, signKey: '',
  };

  // ── 天空与灯光 ──
  const skyCv = document.createElement('canvas'); skyCv.width = 4; skyCv.height = 256;
  const skyTex = new THREE.CanvasTexture(skyCv); skyTex.colorSpace = THREE.SRGBColorSpace; scene.background = skyTex;
  const mix = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
  let skyN = -1;
  function paintSky(n) {
    if (Math.abs(n - skyN) < 0.01) return; skyN = n;
    const c = skyCv.getContext('2d'), g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, mix('#8fcdff', '#10163a', n)); g.addColorStop(0.55, mix('#cfeaff', '#2b2a5e', n)); g.addColorStop(1, mix('#fff0d2', '#553a6c', n));
    c.fillStyle = g; c.fillRect(0, 0, 4, 256); skyTex.needsUpdate = true;
  }
  const hemi = new THREE.HemisphereLight(0xeaf6ff, 0xd9c7a8, 1.15);
  const sun = new THREE.DirectionalLight(0xfff1d8, 2.5);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.035;
  const fill = new THREE.DirectionalLight(0xbfd9ff, 0.55); fill.position.set(-10, 8, 12);
  const lampA = new THREE.PointLight(0xffd9a0, 0, 26, 1.4), lampB = new THREE.PointLight(0xffd9a0, 0, 26, 1.4);
  const fireLight = new THREE.PointLight(0xff8a3c, 0, 9, 1.6), beacon = new THREE.PointLight(0xff3030, 0, 16, 1.5);
  scene.add(hemi, sun, sun.target, fill, lampA, lampB, fireLight, beacon);
  // 夜里要亮起来的自发光材质：[材质, 白天强度, 夜晚强度]
  const glowMats = [];
  const glow = (color, day, night, o = {}) => { const m = k.mat(color, { glow: o.glow || color, glowK: day, ...o }); if (!glowMats.some(g => g[0] === m)) glowMats.push([m, day, night]); return m; };
  const screenMat = glow('#9fd0ff', 0.55, 1.5, { rough: 0.4 }), winGlow = glow('#ffe7a8', 0, 1.3), lampMat = glow('#fff3d0', 0.25, 1.6);
  const glassMat = k.mat('#bfe3f2', { alpha: 0.32, rough: 0.15 });

  const world = new THREE.Group(), cityG = new THREE.Group();
  const roomG = new THREE.Group(), rackG = new THREE.Group(), furnaceG = new THREE.Group(), actorsG = new THREE.Group(), fxG = new THREE.Group();
  world.add(roomG, rackG, furnaceG, actorsG, fxG); scene.add(cityG, world);
  let ticks = [], owned = [], seats = [], stands = [], leds = [], pace = [new THREE.Vector3(), new THREE.Vector3()];
  const door = new THREE.Vector3();
  const own = x => { owned.push(x); return x; };

  // ── 贴图小工具 ──
  function gridTex(base, line, rx, rz) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'); x.fillStyle = base; x.fillRect(0, 0, 64, 64); x.strokeStyle = line; x.lineWidth = 2; x.strokeRect(0, 0, 64, 64);
    const t = own(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, rz); t.anisotropy = 4;
    return t;
  }
  const emojiTex = new Map();
  function emojiSprite(ch, size = 0.55) {
    let t = emojiTex.get(ch);
    if (!t) { const c = document.createElement('canvas'); c.width = c.height = 96; const x = c.getContext('2d'); x.font = '72px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, 48, 54); t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; emojiTex.set(ch, t); }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(size, size, 1); s.renderOrder = 20; return s;
  }
  function bubbleSprite(text, big) {
    const fs = big ? 58 : 40, pad = 30, maxW = big ? 760 : 560, c = document.createElement('canvas'), x = c.getContext('2d'), font = `900 ${fs}px "PingFang SC","Microsoft YaHei",sans-serif`;
    x.font = font;
    const lines = []; let cur = '';
    for (const ch of String(text)) { if (x.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch; } else cur += ch; }
    if (cur) lines.push(cur);
    const tw = Math.max(...lines.map(l => x.measureText(l).width)), w = Math.ceil(tw + pad * 2), h = Math.ceil(lines.length * fs * 1.28 + pad * 2 + 28);
    c.width = w; c.height = h; x.font = font; x.textBaseline = 'top';
    x.fillStyle = '#fff'; x.strokeStyle = '#1e2233'; x.lineWidth = 8; x.lineJoin = 'round';
    x.beginPath(); x.roundRect(5, 5, w - 10, h - 34, 26); x.fill(); x.stroke();
    x.beginPath(); x.moveTo(w / 2 - 20, h - 31); x.lineTo(w / 2, h - 5); x.lineTo(w / 2 + 20, h - 31); x.closePath(); x.fill(); x.stroke();
    x.fillStyle = '#fff'; x.fillRect(w / 2 - 15, h - 39, 30, 10);
    x.fillStyle = big ? '#d1362b' : '#1e2233'; lines.forEach((l, i) => x.fillText(l, pad, pad + i * fs * 1.28));
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })), u = big ? 0.0085 : 0.0062;
    s.scale.set(w * u, h * u, 1); s.center.set(0.5, 0); s.renderOrder = 30; s.userData.tex = t; return s;
  }

  // ── 城市：办公室坐落在街区中央，四周全是楼；挡在镜头和办公室之间的楼会自动收成地基 ──
  const hsh = (i, j, s) => { let h = Math.imul((i * 73856093) ^ (j * 19349663) ^ (s * 83492791), 2654435761); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
  function facade(wall, win, seed) {                                           // 4×4 扇窗的外墙贴图，外加一张夜里亮灯用的发光贴图
    const mk = lit => {
      const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
      x.fillStyle = lit ? '#000000' : wall; x.fillRect(0, 0, 128, 128);
      for (let r = 0; r < 4; r++) for (let q = 0; q < 4; q++) {
        x.fillStyle = lit ? (hsh(r, q, seed) > 0.42 ? '#ffffff' : '#1c1c1c') : win; x.fillRect(q * 32 + 6, r * 32 + 8, 20, 16);
        if (!lit) { x.fillStyle = 'rgba(255,255,255,.3)'; x.fillRect(q * 32 + 6, r * 32 + 8, 20, 4); }
      }
      const t = new THREE.CanvasTexture(c); if (!lit) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
    };
    return [mk(false), mk(true)];
  }
  let blocks = [], cars = [], cityOwned = [], cityMats = [];
  function buildCity() {
    for (const x of cityOwned) x.dispose(); cityOwned = []; cityMats = []; blocks = []; cars = []; cityG.clear();
    const keep = x => { cityOwned.push(x); return x; };
    const bay = st.view.region === 'bay', L = st.L, P = 14, cx = L.W / 2 + 8, cz = L.D / 2 + 8, E = Math.max(cx, cz) + 3 * P;
    const gnd = new THREE.Mesh(k.geo('gnd', () => new THREE.PlaneGeometry(520, 520)), k.mat('#59606d', { rough: 0.96 })); gnd.rotation.x = -Math.PI / 2; gnd.position.y = -0.2; gnd.receiveShadow = true; cityG.add(gnd);
    const styles = (bay ? [['#f1d5c8', '#6c88a8'], ['#cfe3d4', '#6c88a8'], ['#f5e6b6', '#5f7d9c'], ['#d8d3ee', '#6c88a8'], ['#dfe6ec', '#86a9cc']] : [['#93abc9', '#d3e6f6'], ['#d9d3c5', '#62809f'], ['#eadfc8', '#56718f'], ['#5a677d', '#a6c0db'], ['#b9c7d6', '#e2eef8']]).map((s, i) => facade(s[0], s[1], i + (bay ? 11 : 3)).map(keep));
    const neon = [glow('#ff5fa2', 0.5, 2.4), glow('#4de1ff', 0.5, 2.4), glow('#ffd84d', 0.5, 2.4)], mats = new Map();
    const matOf = (si, s, h) => {
      const key = si + '|' + s + '|' + h; let m = mats.get(key);
      if (!m) { const ta = keep(styles[si][0].clone()), tb = keep(styles[si][1].clone()); ta.repeat.set(s / 6, h / 6); tb.repeat.set(s / 6, h / 6); m = keep(new THREE.MeshStandardMaterial({ map: ta, emissive: 0xffd58a, emissiveMap: tb, emissiveIntensity: 0, roughness: 0.72 })); mats.set(key, m); cityMats.push(m); }
      return m;
    };
    // 街区网格：中间一圈留给办公室和环路，外面三圈是楼
    const axis = (c, n) => { const out = []; for (let m = 3; m >= 1; m--) out.push([-(c + (m - 0.5) * P), m + 1]); for (let q = 0; q < n; q++) out.push([-c + (q + 0.5) * (2 * c / n), 0]); for (let m = 1; m <= 3; m++) out.push([c + (m - 0.5) * P, m + 1]); return out; };
    const xs = axis(cx, Math.max(1, Math.round(2 * cx / P))), zs = axis(cz, Math.max(1, Math.round(2 * cz / P)));
    const treeAt = [];
    xs.forEach(([x, rx], i) => zs.forEach(([z, rz], j) => {
      const ring = Math.max(rx, rz); if (!ring) return;
      const r1 = hsh(i, j, 1), r2 = hsh(i, j, 2), r3 = hsh(i, j, 3), s = r1 > 0.5 ? 9 : 7.5;
      const floors = bay ? (ring >= 3 && r2 > 0.72 ? 9 + (r3 * 6 | 0) : 2 + (r2 * 3.4 | 0)) : (ring === 2 ? 4 + (r2 * 7 | 0) : 7 + (r2 * 13 | 0)), h = floors * 1.5, si = r3 * styles.length | 0;
      const g = k.group(cityG, x, 0, z); k.box(s + 2.2, 0.2, s + 2.2, '#cfd3d9', g, 0, -0.1, 0, { cast: false, r: 0.05 });
      const body = k.group(g, 0, 0, 0);
      const slab = (w, hh, y) => { const b = new THREE.Mesh(k.geo('bld' + w + 'x' + hh, () => new THREE.BoxGeometry(w, hh, w)), matOf(si, w, hh)); b.position.y = y + hh / 2; b.castShadow = ring === 2; b.receiveShadow = true; body.add(b); k.box(w + 0.3, 0.3, w + 0.3, '#aab0b9', body, 0, y + hh + 0.15, 0, { cast: false }); };
      slab(s, h, 0);
      let top = h, ts = s;                                                      // 高楼再退一层台，天际线才不是一排方盒子
      if (floors >= 11) { ts = s === 9 ? 5.5 : 4.5; const h2 = Math.max(2, Math.round(floors * 0.28)) * 1.5; slab(ts, h2, h); top = h + h2; if (floors >= 15) k.cyl(0.07, 0.07, 4, '#e8eef5', body, 0, top + 2.2, 0, { cast: false, seg: 8 }); }


      if (r1 < 0.62) k.box(1.5, 0.8, 1.1, '#d5d9de', body, ts * 0.2, top + 0.7, -ts * 0.15, { cast: false, r: 0.08 });
      if (r2 < 0.42) k.cyl(0.7, 0.7, 1.3, bay ? '#b98f66' : '#9aa3ad', body, -ts * 0.22, top + 0.95, ts * 0.2, { cast: false });
      if (!bay && r3 > 0.6) k.box(s * 0.7, 1.7, 0.2, neon[(r3 * 10 | 0) % 3], body, 0, h + 1.5, s / 2 - 0.3, { cast: false });
      if (bay && floors <= 4) { const roof = k.cone(s * 0.74, 2.2, ['#b5654a', '#8a6a55', '#6d7f8f'][(r3 * 3) | 0], body, 0, h + 1.4, 0, { seg: 4, cast: false, ry: Math.PI / 4 }); roof.scale.y = 0.8; }
      blocks.push({ body, x, z, h: top, s: -1 });
      for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1]]) if (hsh(i + sx, j + sz, 7) > 0.3) treeAt.push([x + sx * (s / 2 + 0.75), z + sz * (s / 2 + 0.75), 0.75 + hsh(i, j, sx + sz * 3 + 9) * 0.5]);
    }));
    // 远处的地标：湾区一座红色悬索桥，深圳一座尖顶高塔
    const far = k.group(cityG, -(cx + 3 * P + 12), 0, -(cz + 3 * P + 12), Math.PI / 4);
    if (bay) {
      k.box(96, 1, 3, '#d9473f', far, 0, 14, 0, { cast: false });
      for (const x of [-24, 24]) { for (const z of [1.8, -1.8]) k.box(2, 36, 2, '#d9473f', far, x, 18, z, { cast: false }); k.box(2.4, 1.2, 5.4, '#c63d36', far, x, 32, 0, { cast: false }); }
      for (let x = -46; x <= 46; x += 4) { const d = Math.min(1, Math.min(Math.abs(x - 24), Math.abs(x + 24)) / 24), hh = 1 + 17 * (1 - d) ** 2; k.box(0.2, +hh.toFixed(1), 0.2, '#c63d36', far, x, 14.5 + hh / 2, 1.8, { cast: false }); }
    } else { k.box(9, 60, 9, '#8ea6c4', far, 0, 30, 0, { cast: false }); k.cone(5.8, 16, '#7f98b8', far, 0, 68, 0, { seg: 4, cast: false, ry: Math.PI / 4 }); k.cyl(0.25, 0.25, 12, '#e8eef5', far, 0, 82, 0, { cast: false }); }
    // 车道线（实例化，一次画完）：办公室外面的环路 + 楼与楼之间的街道
    const marks = [], M = new THREE.Matrix4();
    const rx = cx - 2.2, rz = cz - 2.2, zx = -L.W * 0.22, zz = L.D * 0.2;          // 环路中线；斑马线的位置
    const dashX = (x, a, b, skip) => { for (let t = a; t <= b; t += 3) if (skip == null || Math.abs(t - skip) > 2) marks.push(M.clone().makeTranslation(x, -0.18, t)); };
    const dashZ = (z, a, b, skip) => { for (let t = a; t <= b; t += 3) if (skip == null || Math.abs(t - skip) > 2) marks.push(M.clone().makeRotationY(Math.PI / 2).setPosition(t, -0.18, z)); };
    for (const sg of [-1, 1]) { dashX(sg * rx, -rz + 4, rz - 4, zz); dashZ(sg * rz, -rx + 4, rx - 4, zx); for (const m of [1, 2]) { dashX(sg * (cx + m * P), -E, E); dashZ(sg * (cz + m * P), -E, E); } }
    const im = new THREE.InstancedMesh(k.geo('dash', () => new THREE.BoxGeometry(0.18, 0.04, 1.3)), k.mat('#eef1f4', { rough: 0.9 }), marks.length);
    marks.forEach((m, n) => im.setMatrixAt(n, m)); im.receiveShadow = true; cityG.add(im);
    // 斑马线：四条边各一道
    const zeb = [];
    for (const sg of [-1, 1]) for (let q = -3.15; q <= 3.16; q += 0.9) { zeb.push(M.clone().makeTranslation(sg * rx + q, -0.18, zz)); zeb.push(M.clone().makeRotationY(Math.PI / 2).setPosition(zx, -0.18, sg * rz + q)); }
    const zi = new THREE.InstancedMesh(k.geo('zebra', () => new THREE.BoxGeometry(0.45, 0.04, 1.7)), k.mat('#eef1f4', { rough: 0.9 }), zeb.length);
    zeb.forEach((m, n) => zi.setMatrixAt(n, m)); zi.receiveShadow = true; cityG.add(zi);
    // 行道树（实例化）
    const trunkI = new THREE.InstancedMesh(k.geo('ctrunk', () => new THREE.CylinderGeometry(0.1, 0.14, 1.1, 10)), k.mat('#8a623f'), treeAt.length);
    const leafI = new THREE.InstancedMesh(k.geo('cleaf', () => new THREE.SphereGeometry(0.75, 20, 14)), k.mat(bay ? '#74c078' : '#5fbf6a'), treeAt.length);
    treeAt.forEach(([x, z, sc], n) => { trunkI.setMatrixAt(n, M.clone().makeTranslation(x, 0.5, z)); leafI.setMatrixAt(n, M.clone().makeScale(sc, sc * 1.1, sc).setPosition(x, 1.25 + sc * 0.45, z)); });
    cityG.add(trunkI, leafI);
    // 绕着办公室转的车：外圈两辆、内圈一辆（车库门口停着车，内圈就不走了）
    if (PROPS.car) [[1.2, -1, '#ffd23f'], [1.2, -1, '#f7f5ef'], [-1.2, 1, '#4aa8ff']].forEach(([off, dir, brand], n) => {
      if (off < 0 && themeOf(st.view.region, st.view.level).garage) return;
      const o = PROPS.car.build(k, { brand }); o.scale.setScalar(0.8); cityG.add(o);
      cars.push({ o, loop: true, a: rx + off, b: rz + off, p: n * (rx + rz) * 2 + 7, v: dir * 4.6 });
    });
    // 街上跑着的车
    if (PROPS.car) for (let n = 0; n < 8; n++) {
      const ax = n % 2, sg = n % 4 < 2 ? 1 : -1, side = n < 4 ? 1 : -1, lane = side * ((ax ? cz : cx) + (n % 3 ? P : 2 * P)) + sg * 0.85;
      const o = PROPS.car.build(k, { brand: ['#e5484d', '#4aa8ff', '#ffd23f', '#f7f5ef', '#2ec4a6', '#7b5cff', '#ff9736', '#22252d'][n] });
      o.scale.setScalar(0.6); o.rotation.y = ax ? sg * Math.PI / 2 : sg > 0 ? 0 : Math.PI; cityG.add(o); cars.push({ o, ax, sg, lane, E, p: -E + n * 23 % (2 * E), v: 5 + (n % 3) * 1.6 });
    }
  }

  // ── 一面带窗洞的墙：沿本地 x 轴，内表面朝本地 +z ──
  function spans(len, ops) { const out = []; let cur = -len / 2; for (const p of ops.filter(p => p.y0 < 0.05).sort((a, b) => a.a - b.a)) { if (p.a > cur) out.push([cur, p.a]); cur = p.b; } if (cur < len / 2) out.push([cur, len / 2]); return out; }
  function wall(parent, len, H, color, ops, o = {}) {
    const g = k.group(parent), th = 0.3, f = n => +n.toFixed(3); let cur = -len / 2;
    const seg = (a, b, y0, y1) => { if (b - a > 0.02 && y1 - y0 > 0.02) k.box(f(b - a), f(y1 - y0), th, color, g, (a + b) / 2, (y0 + y1) / 2, 0); };
    for (const p of ops.slice().sort((a, b) => a.a - b.a)) {
      seg(cur, p.a, 0, H); seg(p.a, p.b, 0, p.y0); seg(p.a, p.b, p.y1, H);
      if (p.glass) {
        k.box(f(p.b - p.a), f(p.y1 - p.y0), 0.05, glassMat, g, (p.a + p.b) / 2, (p.y0 + p.y1) / 2, 0, { cast: false });
        k.box(f(p.b - p.a + 0.16), 0.1, th + 0.1, '#ffffff', g, (p.a + p.b) / 2, p.y0, 0); k.box(0.07, f(p.y1 - p.y0), th + 0.04, '#ffffff', g, (p.a + p.b) / 2, (p.y0 + p.y1) / 2, 0);
        if (o.bars) for (let x = p.a + 0.18; x < p.b; x += 0.22) k.cyl(0.018, 0.018, f(p.y1 - p.y0), '#9aa3ad', g, x, (p.y0 + p.y1) / 2, -0.2, { seg: 6 });
      }
      cur = p.b;
    }
    seg(cur, len / 2, 0, H);
    k.box(len, 0.1, th + 0.14, '#ffffff', g, 0, H + 0.05, 0);                                          // 压顶
    for (const [a, b] of spans(len, ops)) {                                                             // 踢脚线与墙裙（避开门洞）
      k.box(f(b - a), 0.14, 0.04, '#cfc8b8', g, (a + b) / 2, 0.07, th / 2 + 0.02, { cast: false });
      if (o.dado) k.box(f(b - a), 1.05, 0.03, o.dado, g, (a + b) / 2, 0.66, th / 2 + 0.015, { cast: false });
    }
    return g;
  }

  // ── 房间：底座、地板、两面后墙、工位、白板、招牌、摆设 ──
  function buildRoom() {
    for (const x of owned) x.dispose?.(); owned = []; ticks = []; seats = []; stands = [];
    roomG.clear();
    const v = st.view, L = (st.L = LEVELS[v.level] || LEVELS[1]), T = themeOf(v.region, v.level), brand = v.brand || '#ff6b4a', { W, D, H } = L, bay = v.region === 'bay';
    // 底座：草地 + 土层 + 人行道 + 地板
    k.box(W + 4.4, 0.22, D + 4.4, '#d9dce1', roomG, 0, -0.1, 0, { r: 0.08 });
    k.box(W + 3.6, 0.07, 1.0, '#8fd07c', roomG, 0, 0.03, D / 2 + 1.55, { r: 0.03, cast: false }); k.box(1.0, 0.07, D + 3.6, '#8fd07c', roomG, W / 2 + 1.55, 0.03, 0, { r: 0.03, cast: false });
    const floor = new THREE.Mesh(k.geo(`floor${W}x${D}`, () => new THREE.PlaneGeometry(W, D)), own(new THREE.MeshStandardMaterial({ map: gridTex(T.floor, T.line, W / T.tx, D / T.tz), roughness: 0.9 })));
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.025; floor.receiveShadow = true; roomG.add(floor);
    const dx0 = -W / 2 + 2.6, dz0 = -D / 2 + 2.4, deskW = (L.cols - 1) * L.px, deskD = (L.rows - 1) * L.pz;
    if (T.carpet) k.box(deskW + 2.6, 0.04, deskD + 2.8, T.carpet, roomG, dx0 + deskW / 2, 0.04, dz0 + deskD / 2 - 0.1, { r: 0.02, cast: false });
    // 后墙（z=-D/2）与左墙（x=-W/2）
    const dado = T.dado === 'brand' ? brand : T.dado, winY0 = T.curtain ? 0.35 : 1.0, winY1 = T.curtain ? H - 0.45 : Math.min(2.5, H - 0.5), back = [], left = [];
    const backEnd = W / 2 - L.rz - 0.3;
    if (T.garage) back.push({ a: -1.9, b: 1.9, y0: 0, y1: 2.5 });
    else for (let x = -W / 2 + 1.1; x + 1.5 < backEnd; x += T.curtain ? 1.75 : 2.3) back.push({ a: x, b: x + 1.5, y0: winY0, y1: winY1, glass: true });
    const bw = wall(roomG, W + 0.3, H, T.wall, back, { dado, bars: T.bars }); bw.position.set(-0.15, 0, -D / 2 - 0.15);
    if (T.garage) {                                                           // 半开的卷帘门，门外停着车
      for (let i = 0; i < 6; i++) k.box(3.8, 0.19, 0.08, '#aeb6c2', bw, 0, 2.4 - i * 0.2, 0.02);
      k.box(4.1, 0.24, 0.5, '#8d96a3', bw, 0, 2.62, 0.05);
      const car = PROPS.car?.build(k, { brand }); if (car) { car.position.set(0.2, -0.02, -D / 2 - 3.2); car.rotation.y = 0.35; roomG.add(car); }
    }
    left.push({ a: -D / 2 + 1.1, b: -D / 2 + 2.5, y0: 0, y1: 2.25 });              // 门（墙的本地 a = -世界 z）
    if (!T.garage) left.push({ a: D / 2 - 3.2, b: D / 2 - 1.5, y0: winY0, y1: winY1, glass: true });
    const lw = wall(roomG, D + 0.3, H, T.wall, left, { dado, bars: T.bars }); lw.rotation.y = Math.PI / 2; lw.position.set(-W / 2 - 0.15, 0, 0.15);
    k.box(0.34, H + 0.1, 0.34, '#ffffff', roomG, -W / 2 - 0.15, H / 2, -D / 2 - 0.15);        // 墙角柱
    door.set(-W / 2, 0, D / 2 - 1.8);
    k.box(0.5, 0.03, 1.5, brand, roomG, -W / 2 + 0.5, 0.045, D / 2 - 1.8, { cast: false });      // 门垫
    // 白板 + 创始人踱步的走廊
    const wb = k.group(roomG, -W / 2 + 0.06, 1.65, -0.6, Math.PI / 2);
    k.box(2.6, 1.5, 0.06, '#f9fbfd', wb, 0, 0, 0); k.box(2.74, 0.09, 0.1, '#9aa3ad', wb, 0, 0.78, 0); k.box(2.74, 0.09, 0.1, '#9aa3ad', wb, 0, -0.78, 0); k.box(1.2, 0.05, 0.14, '#9aa3ad', wb, 0.4, -0.84, 0.06);
    for (let i = 0; i < 6; i++) k.box(0.34, 0.035, 0.02, i % 2 ? '#4aa8ff' : '#22252d', wb, -0.85 + (i % 2) * 0.2, 0.5 - i * 0.14, 0.04, { cast: false });
    for (let i = 0; i < 7; i++) k.box(0.2, 0.05, 0.02, '#e5484d', wb, 0.1 + i * 0.16, -0.5 + (i < 4 ? i * 0.03 : (i - 3) ** 2 * 0.1 + 0.09), 0.04, { rz: i < 4 ? 0.15 : 0.7, cast: false });
    pace = [new THREE.Vector3(-W / 2 + 1.25, 0, -D / 2 + 1.9), new THREE.Vector3(-W / 2 + 1.25, 0, Math.min(D / 2 - 3.4, 1.4))];
    // 工位：小人坐在桌子后面、面朝 +z（镜头方向），所以能看到脸
    for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) {
      const x = dx0 + c * L.px, z = dz0 + r * L.pz, n = r * L.cols + c, d = k.group(roomG, x, 0, z);
      k.box(1.5, 0.07, 0.72, T.desk, d, 0, 0.74, 0.18, { r: 0.03 }); k.box(0.07, 0.7, 0.62, '#aeb6c2', d, -0.68, 0.36, 0.18); k.box(0.07, 0.7, 0.62, '#aeb6c2', d, 0.68, 0.36, 0.18);
      k.box(0.46, 0.03, 0.3, '#c9ced6', d, 0, 0.79, 0.12);
      const lid = k.box(0.46, 0.32, 0.025, '#c9ced6', d, 0, 0.94, 0.3, { rx: 0.22 }); k.put(k.geo('scr', () => new THREE.PlaneGeometry(0.4, 0.26)), screenMat, lid, 0, 0, -0.014, { ry: Math.PI, cast: false }); k.ball(0.035, brand, lid, 0, 0, 0.014, { cast: false, seg: 8 });
      if (n % 3 === 0) k.cyl(0.055, 0.045, 0.11, ['#e5484d', '#ffd23f', '#2ec4a6'][(n / 3 | 0) % 3], d, 0.5, 0.83, 0.3, { seg: 8 });
      if (n % 4 === 1) { k.cyl(0.07, 0.055, 0.1, '#d9805a', d, -0.52, 0.82, 0.34, { seg: 8 }); k.ball(0.11, '#5fbf6a', d, -0.52, 0.95, 0.34, { flat: true, seg: 6 }); }
      if (n % 5 === 2) k.box(0.3, 0.02, 0.22, '#ffffff', d, 0.42, 0.785, 0.05, { ry: 0.3, cast: false });
      k.box(0.5, 0.08, 0.5, '#4a5160', d, 0, 0.44, -0.55, { r: 0.03 }); k.box(0.5, 0.5, 0.07, '#4a5160', d, 0, 0.74, -0.82, { r: 0.03 }); k.cyl(0.04, 0.04, 0.4, '#8a919e', d, 0, 0.22, -0.55, { seg: 8 }); k.cyl(0.26, 0.26, 0.04, '#8a919e', d, 0, 0.03, -0.55, { seg: 10 });
      seats.push({ x, z: z - 0.55 });
    }
    for (let i = 0; i < 14; i++) stands.push({ x: -W / 2 + 2.4 + (i % 7) * 1.05, z: D / 2 - 0.8 - (i / 7 | 0) * 0.9 });
    // 机房地台、玻璃隔断
    const rx0 = W / 2 - L.rz, rd = 3 * 1.6 + 0.6;
    k.box(L.rz - 0.2, 0.08, rd, '#aab3bf', roomG, rx0 + L.rz / 2, 0.06, -D / 2 + rd / 2 + 0.1, { cast: false });
    if (T.glassRoom) { k.box(0.06, 2.3, rd, glassMat, roomG, rx0, 1.2, -D / 2 + rd / 2 + 0.1, { cast: false }); k.box(L.rz * 0.55, 2.3, 0.06, glassMat, roomG, rx0 + L.rz * 0.275, 1.2, -D / 2 + rd + 0.1, { cast: false }); k.box(0.1, 2.36, 0.1, '#ffffff', roomG, rx0, 1.2, -D / 2 + rd + 0.1); }
    // 吊灯（夜里发光）
    for (let x = dx0; x <= dx0 + deskW + 0.1; x += L.px * 2) for (let z = dz0; z <= dz0 + deskD + 0.1; z += L.pz * 2) { k.cyl(0.02, 0.02, 0.9, '#8a919e', roomG, x + 0.5, H - 0.1, z, { seg: 5, cast: false }); k.put(k.geo('lamp', () => new THREE.CylinderGeometry(0.16, 0.34, 0.2, 10)), lampMat, roomG, x + 0.5, H - 0.6, z, { cast: false }); }
    lampA.position.set(dx0 + deskW * 0.25, H - 0.4, dz0 + deskD / 2); lampB.position.set(dx0 + deskW * 0.8, H - 0.4, dz0 + deskD / 2);
    beacon.position.set(-W / 2 + 0.6, H - 0.3, -D / 2 + 0.6); k.cyl(0.14, 0.16, 0.22, glow('#ff4d4d', 0.2, 0.2), roomG, -W / 2 + 0.5, H + 0.2, -D / 2 + 0.5, { seg: 8 });
    decorate(L, bay, brand);
    buildSign(); buildFurnace(); buildRacks();
    sun.position.set(W * 0.55, 20, D * 0.35); sun.target.position.set(0, 0, 0);
    const sc = sun.shadow.camera, e = Math.max(W, D) * 0.75 + 16; sc.left = -e; sc.right = e; sc.top = e; sc.bottom = -e; sc.near = 1; sc.far = 90; sc.updateProjectionMatrix();
    buildCity();
  }
  // 摆放小道具（props.js 里有才放）
  function decorate(L, bay, brand) {
    const { W, D } = L, lv = st.view.level, fz = D / 2 - 1.15, lx = -W / 2;
    const put = (name, x, z, ry = 0) => { const P = PROPS[name]; if (!P) return; const o = P.build(k, { brand }); o.position.set(x, 0.03, z); o.rotation.y = ry; roomG.add(o); if (o.userData.tick) ticks.push(o.userData.tick); };
    const slots = []; for (let x = lx + 3.4; x < W / 2 - L.rz - 1.2; x += 3.1) slots.push(x);
    const strip = lv === 1 ? (bay ? ['boxes', 'skateboard'] : ['camp_bed', 'water_dispenser'])
      : lv === 2 ? (bay ? ['sofa', 'pingpong', 'kombucha'] : ['sofa', 'tea_table', 'water_dispenser'])
        : lv === 3 ? (bay ? ['sofa', 'pingpong', 'coffee_bar', 'kombucha'] : ['sofa', 'tea_table', 'coffee_bar', 'fish_tank'])
          : lv === 4 ? (bay ? ['reception', 'sofa', 'foosball', 'coffee_bar', 'vending', 'arcade'] : ['reception', 'sofa', 'tea_table', 'coffee_bar', 'vending', 'fish_tank'])
            : (bay ? ['reception', 'statue_founder', 'sofa', 'pingpong', 'coffee_bar', 'vending', 'arcade'] : ['reception', 'statue_founder', 'sofa', 'tea_table', 'coffee_bar', 'vending', 'fish_tank']);
    strip.forEach((n, i) => { if (slots[i] != null) put(n, slots[i], fz, Math.PI); });
    // 靠左墙和后墙的东西
    if (lv === 1) { if (bay) { put('garage_shelf', W / 2 - L.rz - 1.3, -D / 2 + 0.45); put('bicycle', lx + 0.5, -D / 2 + 2.2, Math.PI / 2); } else { put('bunk_bed', lx + 0.7, -D / 2 + 1.3, Math.PI / 2); put('rice_cooker', lx + 0.5, 1.2, Math.PI / 2); put('clothes_rack', W / 2 - L.rz - 1.3, -D / 2 + 0.5); } }
    if (lv >= 2) { put('plant_tall', lx + 0.55, -D / 2 + 0.6); put(bay ? 'bean_bag' : 'money_tree', lx + 0.7, D / 2 - 3.3, 0.6); put('printer', lx + 0.6, 2.2, Math.PI / 2); }
    if (lv >= 3) { put('bookshelf', lx + 0.42, -D / 2 + 3.6, Math.PI / 2); put('plant_small', W / 2 - L.rz - 0.5, D / 2 - 0.5); put('water_cooler', lx + 0.5, 3.6, Math.PI / 2); if (bay) put('surfboard', lx + 0.4, -D / 2 + 5.4, Math.PI / 2); else put('lucky_cat', lx + 3.4, fz - 1.2); }
    if (lv >= 4) { put('meeting_table', W / 2 - L.rz / 2 - 0.4, D / 2 - 2.0); put('phone_booth', lx + 0.8, -D / 2 + 5.6, Math.PI / 2); put('trophy_case', lx + 0.42, 0.9, Math.PI / 2); put('plant_tall', W / 2 - 0.6, D / 2 - 0.6); put('standing_lamp', lx + 2.2, D / 2 - 0.5); }
    if (lv >= 5) { put('atrium_tree', W / 2 - L.rz / 2 - 0.3, -D / 2 + 9.2); put('fridge', lx + 0.55, 5.2, Math.PI / 2); put('plant_tall', lx + 0.55, 6.6); }
    // 屋外
    const ox = W / 2 + 1.6, oz = D / 2 + 1.6;
    put(bay ? 'tree_palm' : 'tree_round', -W / 2 + 1.5, oz); put(bay ? 'tree_palm' : 'tree_round', ox, -D / 2 + 1.5); put(bay ? 'tree_palm' : 'tree_round', ox, D / 2 - 3); put('bush', ox, 1.5); put('bush', -1, oz + 0.2); put('street_lamp', W / 2 - 1, oz); put('bench', 2.5, oz, Math.PI);
    put(bay ? 'mailbox' : 'parcels', -W / 2 - 1.2, D / 2 - 2.6); put(bay ? 'fire_hydrant' : 'shared_bike', ox - 0.2, D / 2 - 1, bay ? 0 : Math.PI / 2);
    if (!bay) put('e_bike', -W / 2 - 1.3, D / 2 - 4.6, 0.2);
    if (lv <= 2) put('traffic_cone', ox - 0.4, -2);
  }
  // 招牌：立在后墙顶上的灯箱，左边 Logo 右边公司名
  let signTex = null, signImg = null;
  function buildSign() {
    const L = st.L, lv = st.view.level, w = [0, 4.2, 5, 6, 7, 9][lv] || 4.2, h = w * 0.24, g = k.group(roomG, -L.W / 2 + 2.6 + w / 2, L.H + 0.1, -L.D / 2 - 0.15), brand = st.view.brand || '#ff6b4a';
    k.box(w + 0.3, h + 0.3, 0.26, lv >= 3 ? '#22252d' : '#8a623f', g, 0, h / 2 + 0.55, 0, { r: 0.08 });
    k.box(w + 0.42, 0.1, 0.34, brand, g, 0, 0.42, 0); k.box(0.14, 0.5, 0.14, '#4a5160', g, -w / 2 + 0.5, 0.2, 0); k.box(0.14, 0.5, 0.14, '#4a5160', g, w / 2 - 0.5, 0.2, 0);
    const c = document.createElement('canvas'); c.width = 1024; c.height = 246; signTex = own(new THREE.CanvasTexture(c)); signTex.colorSpace = THREE.SRGBColorSpace; signTex.anisotropy = 8;
    const m = new THREE.Mesh(k.geo(`sign${w}`, () => new THREE.PlaneGeometry(w, h)), own(new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.35, roughness: 0.6 })));
    m.position.set(0, h / 2 + 0.55, 0.14); g.add(m); st.signKey = ''; drawSign();
  }
  function drawSign() {
    const v = st.view, key = `${v.sign}|${v.logo}|${v.brand}`;
    if (!signTex || key === st.signKey) return; st.signKey = key;
    const x = signTex.image.getContext('2d'), paint = img => {
      x.fillStyle = '#fffdf7'; x.fillRect(0, 0, 1024, 246); x.fillStyle = v.brand || '#ff6b4a'; x.fillRect(0, 226, 1024, 20);
      const name = v.sign || '炼丹大亨', lw = img ? 200 : 0; let fs = 132; x.font = `900 ${fs}px "PingFang SC","Microsoft YaHei",sans-serif`;
      while (x.measureText(name).width > 1024 - lw - 90 && fs > 40) { fs -= 6; x.font = `900 ${fs}px "PingFang SC","Microsoft YaHei",sans-serif`; }
      const tw = x.measureText(name).width, x0 = (1024 - tw - lw) / 2;
      if (img) x.drawImage(img, x0, 28, 170, 170);
      x.fillStyle = '#1e2233'; x.textBaseline = 'middle'; x.fillText(name, x0 + lw, 116); signTex.needsUpdate = true;
    };
    paint(null);
    if (v.logo) { const img = new Image(); signImg = img; img.onload = () => { if (signImg === img && st.signKey === key) paint(img); }; img.src = v.logo; }
  }

  // ── 丹炉：青铜鼎 + 炉火 + 火星 ──
  let furnace = null;
  function buildFurnace() {
    furnaceG.clear();
    const L = st.L, g = k.group(furnaceG, L.W / 2 - L.rz / 2, 0, clamp(-L.D / 2 + 5.9, -L.D / 2 + 4.2, L.D / 2 - 2.2)), s = st.view.level >= 3 ? 1.3 : 1.12;
    g.scale.setScalar(s);
    const bronze = k.mat('#9a7a45', { metal: 0.55, rough: 0.42 }), patina = k.mat('#5f9482', { metal: 0.3, rough: 0.6 }), fire = glow('#ffb347', 0.2, 0.2, { glow: '#ff7a1a' });
    k.cyl(1.05, 1.15, 0.16, '#b8b0a2', g, 0, 0.08, 0, { seg: 8 });                                       // 石台
    const body = k.group(g, 0, 0.16, 0);
    for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3 + 0.5, leg = k.put(k.geo('fleg', () => new THREE.CylinderGeometry(0.16, 0.1, 0.62, 8)), bronze, body, Math.sin(a) * 0.5, 0.3, Math.cos(a) * 0.5); leg.rotation.set(Math.cos(a) * 0.16, 0, -Math.sin(a) * 0.16); }
    k.put(k.geo('fbelly', () => new THREE.LatheGeometry([[0.0, 0], [0.5, 0.02], [0.78, 0.2], [0.86, 0.48], [0.8, 0.74], [0.66, 0.9], [0.7, 0.98]].map(p => new THREE.Vector2(p[0], p[1])), 20)), bronze, body, 0, 0.5, 0);
    k.torus(0.84, 0.045, patina, body, 0, 0.98, 0, { rx: Math.PI / 2 }); k.torus(0.72, 0.06, bronze, body, 0, 1.48, 0, { rx: Math.PI / 2 });
    for (const sx of [-1, 1]) k.torus(0.2, 0.05, bronze, body, sx * 0.78, 1.52, 0, { ry: Math.PI / 2, arc: Math.PI });                               // 双耳
    k.put(k.geo('fcore', () => new THREE.CylinderGeometry(0.62, 0.62, 0.1, 18)), fire, body, 0, 1.47, 0, { cast: false });                         // 炉口的火光
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; k.put(k.geo('fhole', () => new THREE.SphereGeometry(0.1, 8, 6)), fire, body, Math.sin(a) * 0.84, 1.0, Math.cos(a) * 0.84, { cast: false }); }
    const lid = k.group(body, 0, 1.52, 0);
    k.put(k.geo('flid', () => new THREE.SphereGeometry(0.66, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2)), bronze, lid, 0, 0, 0).scale.y = 0.55; k.ball(0.12, patina, lid, 0, 0.42, 0);
    const sparks = []; for (let i = 0; i < 16; i++) { const m = k.box(0.07, 0.07, 0.07, fire, g, 0, 2, 0, { cast: false, receive: false }); m.userData.p = i / 16; sparks.push(m); }
    const smoke = []; for (let i = 0; i < 4; i++) { const m = k.ball(0.16, k.mat('#9aa0a8', { alpha: 0.5 }), g, 0, 2, 0, { cast: false, receive: false, seg: 7 }); m.userData.p = i / 4; smoke.push(m); }
    furnace = { g, body, lid, fire, sparks, smoke };
    fireLight.position.set(g.position.x, 2.2, g.position.z + 0.6);
  }
  // ── 机柜：一排排黑柜子，LED 乱闪；线缆通向丹炉 ──
  function buildRacks() {
    rackG.clear(); leds = [];
    const L = st.L, n = Math.min(st.view.racks || 0, L.rackRow * 3), x0 = L.W / 2 - L.rz + 0.75, sp = Math.min(1.05, (L.rz - 1.3) / Math.max(1, L.rackRow - 1));
    const ledM = [glow('#3dffa0', 1.4, 1.8), glow('#ffcf4a', 1.4, 1.8), glow('#4ab8ff', 1.4, 1.8), k.mat('#1a1d24')];
    for (let i = 0; i < n; i++) {
      const r = i / L.rackRow | 0, c = i % L.rackRow, g = k.group(rackG, x0 + c * sp, 0.1, -L.D / 2 + 0.75 + r * 1.6);
      k.box(0.82, 2.05, 0.9, '#2b303b', g, 0, 1.03, 0, { r: 0.04 }); k.box(0.7, 1.86, 0.03, '#3a404d', g, 0, 1.03, 0.455); k.box(0.86, 0.06, 0.94, '#4a5160', g, 0, 2.08, 0);
      for (let y = 0; y < 6; y++) for (let x = 0; x < 3; x++) leds.push(k.box(0.09, 0.05, 0.02, ledM[(i + x + y) % 3], g, -0.2 + x * 0.2, 0.34 + y * 0.28, 0.475, { cast: false, receive: false }));
    }
    leds.mats = ledM;
    if (n && furnace) {                                                       // 线缆
      const a = new THREE.Vector3(x0 + 0.4, 0.14, -L.D / 2 + 1.3), b = furnace.g.position.clone().setY(0.2);
      const curve = new THREE.CatmullRomCurve3([a, new THREE.Vector3(a.x + 0.3, 0.14, (a.z + b.z) / 2 - 0.4), new THREE.Vector3(b.x - 0.5, 0.14, b.z - 1.1), b]);
      for (const off of [-0.08, 0.08]) { const m = new THREE.Mesh(own(new THREE.TubeGeometry(curve, 16, 0.045, 6)), k.mat(off < 0 ? '#22252d' : '#c8402f')); m.position.x = off; m.castShadow = true; rackG.add(m); }
    }
  }

  // ── 小人 ──
  function buildActor(id, role, kind, outfit) {
    const lk = lookOf(id, role), root = new THREE.Group(), rig = k.group(root), pants = kind === 'cameo' ? '#3c4a6b' : '#39435a';
    const shirt = kind === 'founder' ? FOUNDER_OUTFITS[outfit] || FOUNDER_OUTFITS.turtleneck : kind === 'cameo' ? '#c8402f' : lk.outfit;
    if (kind === 'cameo') Object.assign(lk, { style: 'long', glasses: true, hair: '#1f1a17', skin: '#f1c7a0', headphones: false });
    if (kind === 'founder') Object.assign(lk, { headphones: false });
    const legs = [-1, 1].map(sx => { const p = k.group(rig, sx * 0.14, 0.36, 0); k.box(0.19, 0.36, 0.22, pants, p, 0, -0.18, 0, { r: 0.06 }); k.box(0.21, 0.1, 0.3, '#f7f5ef', p, 0, -0.33, 0.05, { r: 0.04 }); return p; });
    k.box(0.64, 0.6, 0.44, shirt, rig, 0, 0.64, 0, { r: 0.17 });
    const suit = (kind === 'founder' && outfit === 'suit') || (kind === 'staff' && (role === 'biz' || role === 'legal'));
    if ((kind === 'founder' && outfit === 'plaid') || kind === 'cameo') { for (const x of [-0.16, 0.16]) k.box(0.04, 0.5, 0.455, '#7a1f1f', rig, x, 0.64, 0, { cast: false }); for (const y of [0.56, 0.76]) k.box(0.65, 0.04, 0.455, '#7a1f1f', rig, 0, y, 0, { cast: false }); }
    if (kind === 'founder' && outfit === 'turtleneck') k.torus(0.17, 0.07, shirt, rig, 0, 0.94, 0, { rx: Math.PI / 2 });
    if ((kind === 'founder' && outfit === 'hoodie') || (kind === 'staff' && role === 'eng')) k.ball(0.2, shirt, rig, 0, 0.9, -0.2);
    if (suit) { k.box(0.2, 0.3, 0.02, '#ffffff', rig, 0, 0.74, 0.225, { cast: false }); k.box(0.07, 0.3, 0.025, kind === 'founder' ? '#e5484d' : lk.trim, rig, 0, 0.7, 0.235, { cast: false }); }
    if (kind === 'staff' && role === 'res') for (const x of [-0.13, 0.13]) k.box(0.1, 0.5, 0.02, lk.trim, rig, x, 0.66, 0.225, { cast: false });
    if (kind === 'staff' && role === 'ops') k.ball(0.09, lk.trim, rig, 0, 0.7, 0.2, { cast: false, seg: 8 });
    const arms = [-1, 1].map(sx => { const p = k.group(rig, sx * 0.39, 0.86, 0); k.box(0.16, 0.42, 0.18, shirt, p, 0, -0.18, 0, { r: 0.07 }); k.ball(0.09, lk.skin, p, 0, -0.42, 0, { seg: 8 }); return p; });
    const head = k.group(rig, 0, 1.26, 0); k.ball(0.38, lk.skin, head, 0, 0, 0, { seg: 18 }).scale.set(1, 0.94, 0.96);
    for (const sx of [-1, 1]) { k.ball(0.048, '#22252d', head, sx * 0.135, 0.02, 0.335, { seg: 8, cast: false }); k.ball(0.055, '#f0a3a0', head, sx * 0.235, -0.09, 0.27, { seg: 8, cast: false }).scale.set(1, 0.6, 0.5); }
    const hair = (r, sx, sy, sz, y, z) => k.ball(r, lk.hair, head, 0, y, z, { seg: 14 }).scale.set(sx, sy, sz);
    const stl = lk.style;
    if (stl === 'buzz') hair(0.385, 1, 0.68, 1, 0.12, -0.03);
    else if (stl === 'bob') { hair(0.43, 1.04, 0.92, 1, 0.07, -0.07); for (const sx of [-1, 1]) k.box(0.13, 0.4, 0.34, lk.hair, head, sx * 0.37, -0.1, -0.04, { r: 0.06 }); }
    else hair(0.395, 1.02, 0.8, 1.02, 0.13, -0.05);
    if (stl === 'side') k.box(0.5, 0.13, 0.16, lk.hair, head, -0.06, 0.24, 0.27, { r: 0.06, rz: 0.22 });
    if (stl === 'bun') k.ball(0.17, lk.hair, head, 0, 0.44, -0.12);
    if (stl === 'long') k.box(0.66, kind === 'cameo' ? 0.86 : 0.62, 0.22, lk.hair, head, 0, kind === 'cameo' ? -0.26 : -0.14, -0.27, { r: 0.1 });
    if (kind === 'cameo') for (const sx of [-1, 1]) k.box(0.12, 0.7, 0.3, lk.hair, head, sx * 0.39, -0.2, -0.05, { r: 0.06 });
    if (stl === 'spiky') for (const [x, z, rz] of [[-0.18, 0, 0.5], [0, 0.06, 0], [0.18, 0, -0.5], [0, -0.16, 0]]) k.cone(0.1, 0.26, lk.hair, head, x, 0.42, z, { rz, seg: 6 });
    if (lk.glasses) { for (const sx of [-1, 1]) k.torus(0.09, kind === 'cameo' ? 0.028 : 0.018, '#22252d', head, sx * 0.135, 0.02, 0.36, { seg: 12, cast: false }); k.box(0.1, 0.025, 0.02, '#22252d', head, 0, 0.03, 0.37, { cast: false }); }
    if (lk.headphones) { k.torus(0.4, 0.035, '#22252d', head, 0, 0.06, 0, { arc: Math.PI, cast: false }); for (const sx of [-1, 1]) k.cyl(0.1, 0.1, 0.08, '#e5484d', head, sx * 0.39, 0, 0, { rz: Math.PI / 2, seg: 10 }); }
    let crown = null;
    if (kind === 'founder') { crown = k.group(head, 0, 0.62, 0); k.cyl(0.2, 0.2, 0.09, '#f2c94c', crown, 0, 0, 0, { seg: 10, metal: 0.5, rough: 0.35 }); for (let i = 0; i < 5; i++) k.cone(0.06, 0.16, '#f2c94c', crown, Math.sin(i * 1.257) * 0.17, 0.1, Math.cos(i * 1.257) * 0.17, { seg: 4, metal: 0.5, rough: 0.35 }); }
    if (kind === 'cameo') root.scale.setScalar(1.18);
    return { id, role, kind, root, rig, legs, arms, head, crown, ph: (parseInt(String(id).replace(/\D/g, ''), 10) || 0) * 1.7, mode: 'idle', path: null, emo: null, emoT: 3 + Math.random() * 8, scare: 0, mood: 60, bubble: null, bubT: 0, born: 0 };
  }
  const actors = new Map(), leaving = []; let founder = null, cameo = null;
  const freeSeat = () => { const used = new Set([...actors.values()].map(a => a.seatI)); for (let i = 0; i < seats.length + stands.length; i++) if (!used.has(i)) return i; return 0; };
  const seatPos = i => (i < seats.length ? seats[i] : stands[(i - seats.length) % stands.length]);
  function seatActor(a, walk) {
    const s = seatPos(a.seatI); a.sit = a.seatI < seats.length; a.home = new THREE.Vector3(s.x, 0, s.z);
    if (walk) { a.root.position.set(door.x - 1.4, 0, door.z); a.path = [new THREE.Vector3(door.x + 1.0, 0, door.z), new THREE.Vector3(s.x - 0.95, 0, door.z), new THREE.Vector3(s.x - 0.95, 0, s.z), a.home.clone()]; a.mode = 'walk'; a.born = 1; }
    else { a.root.position.copy(a.home); a.root.rotation.y = 0; a.mode = a.sit ? 'sit' : 'idle'; a.path = null; }
  }
  function syncStaff(list, instant) {
    const ids = new Set(list.map(s => s.id));
    for (const [id, a] of actors) if (!ids.has(id)) { a.mode = 'leave'; a.leaveT = 0; actors.delete(id); leaving.push(a); }
    for (const s of list) {
      let a = actors.get(s.id);
      if (!a) { a = buildActor(s.id, s.role, 'staff'); a.seatI = freeSeat(); actors.set(s.id, a); actorsG.add(a.root); seatActor(a, !instant); }
      a.mood = s.mood ?? 60;
    }
  }
  function buildFounder() {
    if (founder) actorsG.remove(founder.root);
    founder = buildActor('founder', 'eng', 'founder', st.view.founder?.outfit || 'turtleneck'); founder.root.position.copy(pace[0]); founder.mode = 'pace'; founder.paceI = 1; founder.wait = 1; actorsG.add(founder.root);
  }
  function dropBubble(a) { if (a.bubble) { a.root.remove(a.bubble); a.bubble.userData.tex.dispose(); a.bubble.material.dispose(); a.bubble = null; } }
  function say(a, text, big, secs = 3.6) { if (!a) return; dropBubble(a); a.bubble = bubbleSprite(text, big); a.bubble.position.set(0, 1.95, 0); a.root.add(a.bubble); a.bubT = secs; }
  function pose(a, sit, swing) {
    a.legs[0].rotation.x = sit ? -1.45 : swing; a.legs[1].rotation.x = sit ? -1.45 : -swing;
    if (!sit) { a.arms[0].rotation.x = -swing * 0.8; a.arms[1].rotation.x = swing * 0.8; }
  }
  function animActor(a, dt) {
    const t = st.t + a.ph, R = a.root; let y = 0;
    if (a.mode === 'walk' || a.mode === 'pace') {
      if (a.mode === 'pace' && a.wait > 0) { a.wait -= dt; pose(a, false, 0); a.head.rotation.y = Math.sin(t * 0.9) * 0.5; }
      else {
        const tgt = a.mode === 'pace' ? pace[a.paceI] : a.path[0], d = tgt.clone().sub(R.position); d.y = 0;
        const len = d.length(), sp = (a.mode === 'pace' ? 1.1 : 3.2) * dt;
        if (len <= sp) {
          R.position.x = tgt.x; R.position.z = tgt.z;
          if (a.mode === 'pace') { a.paceI ^= 1; a.wait = 2 + Math.random() * 3; }
          else { a.path.shift(); if (!a.path.length) { a.mode = a.sit ? 'sit' : 'idle'; R.rotation.y = 0; if (a.born) { a.born = 0; burst(R.position.x, 1.6, R.position.z, 10, ['#ffd23f', '#ffffff'], 2.2); } } }
        } else { R.position.addScaledVector(d.normalize(), sp); R.rotation.y = Math.atan2(d.x, d.z); }
        pose(a, false, Math.sin(t * 11) * 0.7); y = Math.abs(Math.sin(t * 11)) * 0.06; a.head.rotation.y = 0;
      }
    } else if (a.mode === 'sit') {
      pose(a, true, 0); a.arms[0].rotation.x = -1.15 + Math.sin(t * 10) * 0.13; a.arms[1].rotation.x = -1.15 + Math.cos(t * 10.5) * 0.13;
      a.head.rotation.y = Math.sin(t * 0.55) * 0.28; a.head.rotation.x = Math.sin(t * 0.8) * 0.05 + 0.05; y = 0.1 + Math.sin(t * 2.2) * 0.008;
    } else if (a.mode === 'idle') { pose(a, false, 0); a.head.rotation.y = Math.sin(t * 0.7) * 0.5; y = Math.abs(Math.sin(t * 1.6)) * 0.02; }
    else if (a.mode === 'leave') { a.leaveT += dt; R.scale.setScalar(Math.max(0.001, 1 - a.leaveT * 2.2)); R.position.y += dt * 1.5; R.rotation.y += dt * 9; }
    if (a.scare > 0) { a.scare -= dt; y += Math.abs(Math.sin(a.scare * 14)) * 0.22; }
    a.rig.position.y = y;
    if (a.crown) { a.crown.rotation.y += dt * 1.6; a.crown.position.y = 0.62 + Math.sin(t * 2) * 0.03; }
    if (a.bubble && (a.bubT -= dt) <= 0) dropBubble(a);
    if (a.kind === 'staff' && (a.emoT -= dt) <= 0) {                           // 偶尔冒个表情
      if (a.emo) { R.remove(a.emo); a.emo.material.dispose(); a.emo = null; a.emoT = 5 + Math.random() * 12; }
      else if (Math.random() < (a.mood < 35 || a.mood > 75 ? 0.8 : 0.3)) { const pool = a.mood < 35 ? ['💢', '😫', '🥱'] : a.mood > 75 ? ['😀', '🔥', '✨'] : ['☕', '💬', '🤔']; a.emo = emojiSprite(pool[Math.random() * 3 | 0]); a.emo.position.set(0.1, 2.05, 0); R.add(a.emo); a.emoT = 2.2; }
      else a.emoT = 4 + Math.random() * 8;
    }
    if (a.emo) a.emo.position.y = 2.05 + Math.sin(st.t * 3) * 0.05;
  }

  // ── 粒子特效 ──
  const parts = [];
  function spawn(mesh, x, y, z, vx, vy, vz, life, o = {}) { mesh.position.set(x, y, z); fxG.add(mesh); parts.push({ m: mesh, v: new THREE.Vector3(vx, vy, vz), life, max: life, g: o.g ?? 9, spin: o.spin ?? 6, grow: o.grow ?? 0 }); }
  function burst(x, y, z, n, colors, power) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28; spawn(k.box(0.09, 0.09, 0.09, colors[i % colors.length], null, 0, 0, 0, { cast: false, receive: false }), x, y, z, Math.cos(a) * power * Math.random(), power * (0.6 + Math.random()), Math.sin(a) * power * Math.random(), 0.9 + Math.random() * 0.5); } }
  function rain(kind) {
    const L = st.L, cols = ['#ff6b4a', '#ffd23f', '#2ec4a6', '#7b5cff', '#4aa8ff', '#ff7ab6'], money = kind === 'money';
    for (let i = 0; i < (money ? 54 : 90); i++) {
      const m = money && i % 4 === 0 ? k.cyl(0.11, 0.11, 0.03, '#f2c94c', null, 0, 0, 0, { seg: 10, metal: 0.6, rough: 0.3, cast: false }) : k.box(money ? 0.34 : 0.16, 0.012, money ? 0.17 : 0.1, money ? '#5fbf6a' : cols[i % 6], null, 0, 0, 0, { cast: false, receive: false });
      spawn(m, (Math.random() - 0.5) * L.W * 0.9, L.H + 2 + Math.random() * 5, (Math.random() - 0.5) * L.D * 0.9, (Math.random() - 0.5) * 1.5, -1 - Math.random() * 2, (Math.random() - 0.5) * 1.5, 3.2 + Math.random(), { g: money ? 3.5 : 2.2, spin: 7 });
    }
  }
  function scareAll() { for (const a of actors.values()) a.scare = 0.7 + Math.random() * 0.3; if (founder) founder.scare = 0.8; }
  function play(name, data = {}) {
    const L = st.L;
    if (name === 'confetti' || name === 'money') rain(name);
    else if (name === 'alarm') { st.alarm = 3; st.shake = 0.35; scareAll(); }
    else if (name === 'boom') {
      st.shake = 0.7; scareAll();
      if (furnace) for (let i = 0; i < 16; i++) spawn(k.ball(0.3, k.mat('#3a3d45', { alpha: 0.75 }), null, 0, 0, 0, { seg: 7, cast: false, receive: false }), furnace.g.position.x + (Math.random() - 0.5) * 0.8, 2 + Math.random(), furnace.g.position.z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 1.6, 1.4 + Math.random() * 1.6, (Math.random() - 0.5) * 1.6, 2 + Math.random(), { g: -0.4, spin: 0.5, grow: 1.4 });
    } else if (name === 'levelup') { st.pop = 1; for (let i = 0; i < 5; i++) burst((Math.random() - 0.5) * L.W, L.H * 0.6, (Math.random() - 0.5) * L.D, 12, ['#ffd23f', '#fff6c2', '#ff9736'], 4.5); }
    else if (name === 'say') { const list = [...actors.values()]; say(data.who === 'founder' ? founder : actors.get(data.who) || list[Math.random() * list.length | 0] || founder, data.text || '……', false); }
    else if (name === 'cameo') {
      if (cameo) actorsG.remove(cameo.root);
      cameo = buildActor('cameo', 'eng', 'cameo'); cameo.cT = 0; cameo.text = data.text || '你再也吃不到 Chepole 了！！！';
      cameo.from = new THREE.Vector3(-L.W / 2 - 4, 0, L.D / 2 + 3); cameo.to = new THREE.Vector3(-0.5, 0, L.D / 2 - 1.5); cameo.root.position.copy(cameo.from); actorsG.add(cameo.root); scareAll();
    }
  }
  function animCameo(dt) {                                                    // 长发眼镜男：冲进来 → 蹦三下喊话 → 跳走
    const a = cameo, t = (a.cT += dt), R = a.root;
    if (t < 0.9) { const u = ease(t / 0.9); R.position.lerpVectors(a.from, a.to, u); R.position.y = Math.sin(u * Math.PI) * 2.4; R.rotation.y = 0.6; pose(a, false, Math.sin(t * 20) * 0.8); }
    else if (t < 6.2) {
      const hop = t < 3.4 ? Math.sin((t - 0.9) % 0.62 / 0.62 * Math.PI) : 0; R.position.copy(a.to); R.position.y = hop * 1.3; R.rotation.y = 0.5 + Math.sin(t * 3) * 0.25;
      a.rig.scale.set(1 - hop * 0.12, 1 + hop * 0.2, 1 - hop * 0.12); pose(a, false, 0); a.arms[0].rotation.x = a.arms[1].rotation.x = 0; a.arms[0].rotation.z = -2.4 + Math.sin(t * 16) * 0.3; a.arms[1].rotation.z = 2.4 - Math.sin(t * 16) * 0.3;
      if (!a.said && t > 1.0) { a.said = 1; say(a, a.text, true, 5); st.shake = 0.4; }
    } else if (t < 7.1) { const u = ease((t - 6.2) / 0.9); R.position.lerpVectors(a.to, new THREE.Vector3(st.L.W / 2 + 5, 0, st.L.D / 2 + 3), u); R.position.y = Math.sin(u * Math.PI) * 3; R.rotation.y += dt * 12; }
    else { dropBubble(a); actorsG.remove(R); cameo = null; return; }
    if (a.bubble && (a.bubT -= dt) <= 0) dropBubble(a);
  }

  // ── 镜头：等距正交，自动把沙盘放进 UI 留出的空档里 ──
  function fitCamera(dt) {
    const L = st.L, i = st.insets, fw = Math.max(120, st.w - i.left - i.right), fh = Math.max(120, st.h - i.top - i.bottom), el = 0.58;
    const diag = Math.hypot(L.W + 5, L.D + 5), ph = diag * Math.sin(el) + (L.H + 3.2) * Math.cos(el);
    const target = Math.max(diag / fw, ph / fh) / 0.92 / st.zoom;
    if (!st.scale || st.snap) { st.scale = target; st.snap = false; } else st.scale = lerp(st.scale, target, 1 - Math.exp(-dt * 6));
    const az = st.az + st.azUser + (st.view.mode === 'title' ? Math.sin(st.t * 0.16) * 0.42 : Math.sin(st.t * 0.25) * 0.02);
    const sh = st.shake > 0 ? st.shake * 0.25 : 0, cy = L.H * 0.3, dist = 80;
    cam.position.set(Math.sin(az) * Math.cos(el) * dist + (Math.random() - 0.5) * sh, cy + Math.sin(el) * dist + (Math.random() - 0.5) * sh, Math.cos(az) * Math.cos(el) * dist);
    cam.lookAt(0, cy, 0); st.azNow = az;
    const vw = st.scale * st.w, vh = st.scale * st.h, ox = (i.left - i.right) / 2 * st.scale, oy = (i.top - i.bottom) / 2 * st.scale;
    cam.left = -vw / 2 - ox; cam.right = vw / 2 - ox; cam.top = vh / 2 + oy; cam.bottom = -vh / 2 + oy; cam.updateProjectionMatrix();
  }
  let drag = null;
  const el = renderer.domElement;
  const onDown = e => { drag = { x: e.clientX, az: st.azUser }; el.setPointerCapture?.(e.pointerId); };
  const onMove = e => { if (drag) st.azUser = clamp(drag.az - (e.clientX - drag.x) * 0.006, -1.25, 1.25); };
  const onUp = () => { drag = null; };
  const onWheel = e => { e.preventDefault(); st.zoom = clamp(st.zoom * (e.deltaY > 0 ? 0.92 : 1.08), 0.6, 1.9); };
  el.addEventListener('pointerdown', onDown); el.addEventListener('pointermove', onMove); el.addEventListener('pointerup', onUp); el.addEventListener('pointercancel', onUp); el.addEventListener('wheel', onWheel, { passive: false });
  function resize() { st.w = Math.max(1, container.clientWidth); st.h = Math.max(1, container.clientHeight); renderer.setSize(st.w, st.h, false); st.snap = true; }
  const ro = new ResizeObserver(resize); ro.observe(container); resize();

  // ── 每帧 ──
  let raf = 0, last = performance.now(), dead = false;
  function frame(now) {
    if (dead) return; raf = requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now; st.t += dt;
    const v = st.view, n = (st.night = lerp(st.night, v.night ? 1 : 0, 1 - Math.exp(-dt * 2.5)));
    paintSky(n);
    const red = st.alarm > 0 ? (Math.sin(st.t * 12) * 0.5 + 0.5) * Math.min(1, st.alarm) : 0;
    hemi.intensity = lerp(1.15, 0.5, n); hemi.color.set(mix(mix('#eaf6ff', '#9aa8f0', n), '#ff5a4a', red * 0.7)); sun.intensity = lerp(2.5, 0.42, n); sun.color.set(mix('#fff1d8', '#a9b9ff', n)); fill.intensity = lerp(0.55, 0.2, n);
    lampA.intensity = lampB.intensity = n * 34;
    for (const [m, d, nt] of glowMats) m.emissiveIntensity = lerp(d, nt, n);
    st.alarm = Math.max(0, st.alarm - dt); st.shake = Math.max(0, st.shake - dt * 1.6);
    beacon.intensity = v.alert ? 26 * (Math.sin(st.t * 5) * 0.5 + 0.5) : 0;
    if (st.pop > 0) { st.pop = Math.max(0, st.pop - dt * 1.4); world.scale.setScalar(1 + Math.sin((1 - st.pop) * Math.PI) * 0.09 * st.pop); } else world.scale.setScalar(1);
    // 丹炉：火越旺越亮，炉盖会被顶得一跳一跳
    const heat = (st.heat = lerp(st.heat, v.furnace ? clamp(v.furnace.heat ?? 0.6, 0.15, 1) : 0, 1 - Math.exp(-dt * 3)));
    if (furnace) {
      furnace.fire.emissiveIntensity = 0.15 + heat * 2.6 + Math.sin(st.t * 9) * 0.25 * heat; fireLight.intensity = heat * 16 * (0.85 + Math.sin(st.t * 11) * 0.15);
      furnace.body.scale.setScalar(1 + Math.sin(st.t * 4) * 0.012 * heat); furnace.lid.position.y = 1.52 + Math.max(0, Math.sin(st.t * 7)) * 0.03 * heat; furnace.lid.rotation.z = Math.sin(st.t * 13) * 0.02 * heat;
      for (const s of furnace.sparks) { const p = (st.t * (0.35 + heat * 0.5) + s.userData.p) % 1, a = s.userData.p * 40; s.visible = heat > 0.08 && s.userData.p < 0.3 + heat * 0.7; s.position.set(Math.sin(a + p * 3) * 0.35 * (1 + p), 1.9 + p * 2.6, Math.cos(a * 1.3) * 0.35 * (1 + p)); s.scale.setScalar(1 - p); s.rotation.set(p * 9, p * 7, 0); }
      for (const s of furnace.smoke) { const p = (st.t * 0.22 + s.userData.p) % 1; s.visible = heat < 0.08; s.position.set(Math.sin(p * 5 + s.userData.p * 9) * 0.15, 1.9 + p * 1.8, 0); s.scale.setScalar(0.5 + p * 1.2); }
    }
    if ((st.ledT -= dt) <= 0 && leds.length) { st.ledT = 0.18; for (let i = 0; i < 14; i++) leds[Math.random() * leds.length | 0].material = leds.mats[Math.random() < 0.25 ? 3 : Math.random() * 3 | 0]; }
    for (const a of actors.values()) animActor(a, dt);
    if (founder) animActor(founder, dt);
    if (cameo) animCameo(dt);
    for (let i = leaving.length - 1; i >= 0; i--) { animActor(leaving[i], dt); if (leaving[i].leaveT > 0.5) { actorsG.remove(leaving[i].root); leaving.splice(i, 1); } }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life -= dt; p.v.y -= p.g * dt; p.m.position.addScaledVector(p.v, dt); p.m.rotation.x += p.spin * dt; p.m.rotation.z += p.spin * 0.7 * dt;
      if (p.grow) p.m.scale.setScalar(1 + (1 - p.life / p.max) * p.grow); else if (p.life < 0.4) p.m.scale.setScalar(Math.max(0.01, p.life / 0.4));
      if (p.life <= 0 || p.m.position.y < -0.2) { fxG.remove(p.m); parts.splice(i, 1); }
    }
    for (const f of ticks) f(st.t, dt);
    // 城市：夜里亮窗；挡在镜头前的楼收成地基；车在街上跑
    for (const m of cityMats) m.emissiveIntensity = n * 1.25;
    scene.fog.color.set(mix('#d3e9fa', '#23264f', n)); scene.environmentIntensity = lerp(0.38, 0.14, n);
    const az = st.azNow ?? st.az, cx = Math.sin(az), cz = Math.cos(az), kf = 1 - Math.exp(-dt * 7);
    for (const b of blocks) { const dot = (b.x * cx + b.z * cz) / Math.hypot(b.x, b.z), lo = Math.min(1, 1.3 / b.h), tg = dot > 0.42 ? lo : dot > 0.05 ? lerp(1, lo, (dot - 0.05) / 0.37) : 1; b.s = b.s < 0 ? tg : lerp(b.s, tg, kf); b.body.scale.y = b.s; }
    for (const c of cars) {
      if (c.loop) { c.p += c.v * dt; const [x, z, ry] = loopPos(c.p, c.a, c.b); c.o.position.set(x, -0.18, z); c.o.rotation.y = c.v > 0 ? ry : ry + Math.PI; continue; }
      c.p += c.v * c.sg * dt; if (Math.abs(c.p) > c.E) c.p = -c.sg * c.E; c.o.position.set(c.ax ? c.p : c.lane, -0.18, c.ax ? c.lane : c.p); }
    fitCamera(dt);
    renderer.render(scene, cam);
  }
  raf = requestAnimationFrame(frame);

  // ── 对外接口 ──
  function sync(view) {
    const p = st.view, v = (st.view = { ...p, ...view, staff: view.staff || p.staff || [] });
    v.level = clamp(v.level | 0 || 1, 1, 5);
    const key = `${v.region}|${v.level}|${v.brand || ''}`, rebuilt = key !== st.key;
    if (rebuilt) {
      const up = st.key && p.region === v.region && v.level > p.level; st.key = key; buildRoom(); if (!up) st.snap = true;
      for (const a of actors.values()) seatActor(a, false);
      buildFounder(); if (up) play('levelup');
    } else {
      if ((v.racks || 0) !== (p.racks || 0)) buildRacks();
      if ((v.founder?.outfit || '') !== (p.founder?.outfit || '')) buildFounder();
      drawSign();
    }
    syncStaff(v.staff, rebuilt || p.mode !== v.mode);
  }
  return {
    sync, play,
    setInsets(i) { const n = { left: i.left || 0, right: i.right || 0, top: i.top || 0, bottom: i.bottom || 0 }, o = st.insets; if (n.left !== o.left || n.right !== o.right || n.top !== o.top || n.bottom !== o.bottom) { st.insets = n; st.snap = true; } },
    dispose() {
      dead = true; cancelAnimationFrame(raf); ro.disconnect();
      el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp); el.removeEventListener('pointercancel', onUp); el.removeEventListener('wheel', onWheel);
      for (const x of owned) x.dispose?.(); for (const x of cityOwned) x.dispose(); scene.environment?.dispose(); for (const t of emojiTex.values()) t.dispose(); skyTex.dispose(); k.dispose(); renderer.dispose(); el.remove();
    },
  };
}

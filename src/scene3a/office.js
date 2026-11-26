import { tr, getLang } from '../i18n/index.js';
import { fill } from '../data/text.js';
// 3A 版办公室：剖开的房间（两面后墙）、工位、机房、丹炉、招牌、小人和特效。
// 布局规则沿用经典版（同一套 LEVELS），但所有东西都换成了 PBR 材质 + 高精度道具，静态部分全部合批。
import * as THREE from 'three';
import { FX } from './stage.js';
import { createDelivery, rackSlot } from './delivery.js';
import { batchPool } from './kit.js';
import { lookOf, FOUNDER_OUTFITS } from '../scene/looks.js';
import { FLOOR_PLANS, DEPTS } from '../data/defs.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);
const easeIO = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);       // 电梯：起步加速、到站减速
const Y0 = 0.2;                                                                 // 办公室地坪比马路高一个台阶

// 各档的房间：W×D 地板，H 墙高；cols×rows 工位；rz 机房区宽度；rackRow 每排机柜数。
// 1–4 档是单层的剖面房间；5 档以上是多层楼，这里是「每一层」的尺寸，层数和部门见 FLOOR_PLANS
export const LEVELS = [null,
  { W: 10, D: 8, H: 3.0, cols: 3, rows: 2, px: 1.7, pz: 2.0, rz: 3.0, rackRow: 2 },
  { W: 13, D: 9.5, H: 3.2, cols: 4, rows: 3, px: 1.9, pz: 2.0, rz: 3.4, rackRow: 3 },
  { W: 16, D: 11.5, H: 3.6, cols: 5, rows: 4, px: 1.9, pz: 2.0, rz: 4.2, rackRow: 3 },
  { W: 20, D: 13.5, H: 3.8, cols: 7, rows: 4, px: 1.9, pz: 2.1, rz: 5.0, rackRow: 4 },
  { W: 20, D: 13.5, H: 3.6, cols: 7, rows: 3, px: 1.9, pz: 2.1, rz: 5.0, rackRow: 4 },          // rows：多层楼每层只摆这几排工位，前半层留给部门的特色区
  { W: 20, D: 13, H: 3.7, cols: 6, rows: 2, px: 1.9, pz: 2.1, rz: 5.0, rackRow: 4 },              // 三层往上楼身收窄一点，更像写字楼
  { W: 20, D: 13, H: 3.8, cols: 6, rows: 2, px: 1.9, pz: 2.1, rz: 5.0, rackRow: 4 },
  { W: 21, D: 13.5, H: 4.0, cols: 6, rows: 2, px: 1.9, pz: 2.05, rz: 5.4, rackRow: 4 },
];
const MAXLV = LEVELS.length - 1;
// 起步的房子（1 档）按落脚点分六种。没给落脚点（标题页）或者对不上地区，就取这个地区的默认：湾区车库、深圳握手楼
const START_KIND = { d_paloalto: 'garage', d_soma: 'loft', d_berkeley: 'house', d_village: 'village', d_nanshan: 'park', d_hqb: 'stall' };
const START_BAY = { garage: 1, loft: 1, house: 1 };
export const startKind = (region, district) => { const kd = START_KIND[district], bay = region === 'bay'; return kd && !!START_BAY[kd] === bay ? kd : bay ? 'garage' : 'village'; };
// 起步房子的装修。除了下面「装修」那几项，还有：H 层高 | wtex/wpat 墙面质感 | win 窗台和窗顶高度 | backWin/leftWin 后墙、左墙的窗（墙的本地坐标）
// | grid 工厂式的细格窗 | shutter 后墙是卷帘门 | lawn 屋外有没有草坪
const START_THEME = {
  garage: { floor: ['#b4b7bb', { rough: 0.7, tex: 'concrete', pat: ['tile', 2.5, 0.35, 0.05] }], wall: '#d8d0c0', frame: '#f4f1ea', shutter: '#aab2bd', lawn: true },
  loft: { H: 3.7, floor: ['#8a6a4c', { rough: 0.55, tex: 'wood', pat: ['plank', 0.18, 1.5, 0.45, 0.2] }], wall: '#a35a43', wtex: 'brick', wpat: ['brick', 0.5, 0.16, 0.36, 0.2], frame: '#23272e', grid: true, win: [0.8, 3.1], backWin: [[-2.1, -0.3], [0.0, 1.6]], leftWin: [] },
  house: { floor: ['#b98a5a', { rough: 0.5, tex: 'wood', pat: ['plank', 0.14, 1.3, 0.4, 0.16] }], wall: '#eadfbf', frame: '#fffaf0', dado: '#86a37e', lawn: true, leftWin: [] },
  village: { H: 2.9, floor: ['#e6d8bd', { rough: 0.35, tex: 'plaster', pat: ['tile', 0.6, 0.35, 0.06] }], wall: '#f3efe6', frame: '#f4f1ea', dado: '#7fb39a', bars: true, leftWin: [[1.95, 3.45]] },
  park: { H: 3.2, floor: ['#d5dade', { rough: 0.25, tex: 'concrete', pat: ['tile', 1.2, 0.2, 0.03] }], wall: '#eef1f4', frame: '#2f353d', win: [0.3, 2.8], backWin: [[-3.9, -2.4], [-2.15, -0.65], [-0.4, 1.1]], leftWin: [[1.95, 3.65]], lawn: true },
  stall: { floor: ['#dcd7cb', { rough: 0.3, tex: 'stone', pat: ['tile', 0.8, 0.3, 0.06] }], wall: '#f4f2ea', wtex: 'paint', wpat: ['grid', 0.3, 0.3, 0.22, 0.04], frame: '#aab2bd', dado: '#3f78b8', shutter: '#c9ced6' },
};
// 装修：floor 地面 [颜色, 材质参数] | wall 墙色 | frame 窗框色 | carpet 工位区地毯 | 其它是开关
function themeOf(region, level, district) {
  if (level === 1) { const kind = startKind(region, district); return { ...START_THEME[kind], kind }; }
  if (level === 2) return { floor: ['#c79f70', { rough: 0.5, tex: 'wood', pat: ['plank', 0.16, 1.3, 0.4, 0.16] }], wall: '#f4f0e8', frame: '#f4f1ea', dado: 'brand' };
  if (level === 3) return { floor: ['#c9cfd6', { rough: 0.3, tex: 'concrete', pat: ['tile', 3.2, 0.2, 0.03] }], wall: '#eff1f3', frame: '#3a4048', carpet: '#7c90a8' };
  if (level === 4 || level === 5) return { floor: ['#d9c4a0', { rough: 0.45, tex: 'wood', pat: ['plank', 0.14, 1.6, 0.35, 0.12] }], wall: '#f3f5f6', frame: '#2f353d', carpet: '#6a819d', glassRoom: true };
  return { floor: ['#e8e2d6', { rough: 0.22, tex: 'stone', pat: ['tile', 1.2, 0.25, 0.05] }], wall: '#fbfbfa', frame: '#2a2f36', carpet: '#526b8a', glassRoom: true, curtain: true };
}

export function buildElevatorCabin(k, accent) {
  const car = k.group(), shell = k.group(car);
  car.name = 'elevator_car';
  const frame = k.mat('#37434b', { rough: .38, metal: .78, tex: 'metal' });
  const steel = k.mat('#bac5ca', { rough: .31, metal: .85, tex: 'metal' });
  const dark = k.mat('#232d33'), light = k.mat('#fff3d6', { glow: '#fff3d6', glowK: .9, night: 2.6 });
  const amber = k.mat('#ffcf77', { glow: '#ffb653', glowK: .55, night: 1.2 });
  const glass = k.mat('#bfe3f0', { alpha: .28, rough: .05, metal: .2, env: 1.5, side: true });
  const doorGlass = k.mat('#cfe9f3', { alpha: .36, rough: .05, metal: .2, env: 1.5, side: true });
  const box = (w,h,d,mat,x,y,z,r=0) => k.box(w,h,d,mat,shell,x,y,z,{r});
  const rail = k.group(shell), panel = k.group(shell); rail.name = 'Handrails'; panel.name = 'Controls';
  box(1.62,.14,1.72,frame,0,.07,0,.018);
  box(1.59,.027,1.69,steel,0,.149,0);
  for (const x of [-.375,.375]) for (const z of [-.39,.39])
    box(.746,.021,.775,k.mat('#818984',{tex:'stone',rough:.64}),x,.171,z);
  box(1.62,.1,1.72,frame,0,2.23,0,.022);
  for (const x of [-.75,.75]) for (const z of [-.8,.8]) box(.09,2.1,.09,frame,x,1.17,z,.014);
  for (const side of [-1,0,1]) {
    const rear = side === 0, wall = rear ? .75 : side*.8;
    const strip = (span,h,thick,mat,along,y,inset=0) => rear
      ? box(thick,h,span,mat,wall-inset,y,along) : box(span,h,thick,mat,along,y,wall-side*inset);
    k.plane(rear?1.51:1.41,1.98,glass,shell,rear?wall:0,1.18,rear?0:wall,{ry:rear?Math.PI/2:side<0?Math.PI:0,cast:false});
    for (const y of [.206,2.154]) strip(rear?1.52:1.42,.043,.036,steel,0,y);
    for (const pos of [-1,1]) {
      strip(.026,1.97,.032,frame,pos*(rear?.747:.697),1.18);
      for (const y of [.39,1.94]) strip(.074,.092,.044,steel,pos*(rear?.693:.643),y);
      k.box(rear?.105:.04,.048,rear?.04:.105,steel,rail,rear?.70:pos*.54,1.06,rear?pos*.58:side*.745);
    }
    k.cyl(.025,.025,rear?1.42:1.32,steel,rail,rear?.65:0,1.06,rear?0:side*.70,{rx:rear?Math.PI/2:0,rz:rear?0:Math.PI/2,seg:12});
    strip(rear?1.48:1.38,.048,.015,accent,0,.88,-.013);
  }
  box(.79,.035,.90,dark,0,2.172,0); box(.74,.024,.85,light,0,2.148,0,.008);
  for (const x of [-.54,.54]) {
    box(.19,.022,.75,dark,x,2.17,0);
    for (let index=0;index<9;index++) box(.17,.014,.024,steel,x,2.155,(index-4)*.078);
  }
  for (const y of [.195,2.1]) box(.082,.032,1.58,steel,-.75,y,0);
  const doors = [-1,1].map(sign => {
    const pane=k.geo('elevator-door-pane',()=>new THREE.PlaneGeometry(.774,1.87).rotateY(-Math.PI/2));
    const door=k.put(pane,doorGlass,car,-.75,1.146,sign*.4,{cast:false});
    door.name=sign<0?'door_left':'door_right';
    for(const z of [-.386,.386]) k.box(.033,1.89,.021,steel,door,0,0,z);
    for(const y of [-.935,.935]) k.box(.033,.032,.79,frame,door,0,y,0);
    return door;
  });
  k.box(.21,.62,.035,frame,panel,-.55,1.22,.773,{r:.012});
  for(let row=0;row<4;row++) for(const sign of [-1,1]) {
    const x=-.55+sign*.048, y=1.41-row*.114;
    k.cyl(.030,.030,.019,steel,panel,x,y,.747,{rx:Math.PI/2,seg:12});
    if(row<3) k.cyl(.016,.016,.004,amber,panel,x,y,.735,{rx:Math.PI/2,seg:10});
    else for(const half of [-1,1]) k.cone(.009,.015,amber,panel,x+half*.012,y,.733,{rz:half*sign*Math.PI/2,seg:3});
  }
  box(.073,.115,.42,dark,-.75,2.163,0);
  for(const y of [2.145,2.18]) box(.008,.031,.011,amber,-.790,y,.008);
  for(const sign of [-1,1]) box(.008,.013,.05,amber,-.790,2.16,sign*.017-.09).rotation.x=sign*.73;
  for(const x of [-.63,.63]) {
    for(const z of [-.69,.69]) box(.031,.22,.031,steel,x,2.38,z);
    box(.032,.031,1.41,steel,x,2.49,0);
  }
  box(1.29,.032,.032,steel,0,2.49,-.69);
  box(.26,.088,.53,frame,0,2.323,0,.014);
  for(let index=0;index<4;index++) k.cyl(.018,.018,.21,steel,shell,0,2.465,(index-1.5)*.093,{seg:10});
  for(const z of [-.69,.69]) box(.17,.092,.14,dark,.66,2.321,z,.012);
  return {car,shell,doors};
}

export function createRoom(stage, k, PROPS, art, traffic) {
  const world = new THREE.Group(); world.position.y = Y0; stage.scene.add(world);
  const roomG = new THREE.Group(), rackG = new THREE.Group(), furnaceG = new THREE.Group(), actorsG = new THREE.Group(), fxG = new THREE.Group(), floorsG = new THREE.Group();
  world.add(roomG, floorsG, rackG, furnaceG, actorsG, fxG);
  // 多层楼的状态：N 层，层高 FH；open = 正在看的楼层（-1 = 全楼总览），cut = 电梯此刻停在第几层（小数，总览 = N）
  const tw = { on: false, plan: null, N: 0, FH: 4.5, EZ: 0, F: [], open: -1, target: -1, cut: 0, ride: null, camY: 0, frame: null, bounce: 0, doorT: 0, roof: null, car: null, doors: null, beacon: null, labels: [], labelKey: '', res: 0, boss: 0, queue: [], qT: 0, pending: [] };
  const st = { view: { mode: 'title', region: 'bay', level: 1, staff: [] }, L: LEVELS[1], key: '', signKey: '', heat: 0, alarm: 0, pop: 0, ledT: 0, t: 0 };
  let owned = [], bakes = [], ticks = [], seats = [], stands = [], pace = [new THREE.Vector3(), new THREE.Vector3()], rackOwned = [];
  const door = new THREE.Vector3(); let beaconMat = null;
  const own = x => { owned.push(x); return x; };
  // 灯：夜里才亮。两盏室内暖光、炉火、警报灯、两盏街灯
  const lampA = new THREE.PointLight(0xffd6a0, 0, 18, 2), lampB = new THREE.PointLight(0xffd6a0, 0, 18, 2), fireLight = new THREE.PointLight(0xff8a3c, 0, 9, 2);
  world.add(lampA, lampB, fireLight);

  // ── 屏幕：几张会动的画布轮流贴在显示器上 ──
  const screens = [];
  function makeScreens() {
    for (let i = 0; i < 4; i++) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 160; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.35 }); screens.push({ c, x: c.getContext('2d'), t, m, kind: i, n: 0 });
    }
  }
  function drawScreen(s, time) {
    const x = s.x, W = 256, H = 160; s.n++;
    x.fillStyle = s.kind === 1 ? '#0f1722' : '#11151c'; x.fillRect(0, 0, W, H);
    if (s.kind === 0 || s.kind === 3) {                                                   // 代码编辑器 / 终端
      const cols = s.kind === 0 ? ['#7dd3fc', '#f9a8d4', '#a7f3d0', '#fde68a', '#c4b5fd'] : ['#86efac', '#86efac', '#fde68a'];
      for (let r = 0; r < 13; r++) { const seed = (r + s.n) * 7.13, ind = ((Math.sin(seed) * 0.5 + 0.5) * 4 | 0) * 10; let px = 10 + ind; for (let w = 0; w < 4; w++) { const len = 12 + ((Math.sin(seed * (w + 2)) * 0.5 + 0.5) * 46 | 0); if (px + len > W - 8) break; x.fillStyle = cols[(r + w + s.n) % cols.length]; x.globalAlpha = 0.9; x.fillRect(px, 10 + r * 11, len, 5); px += len + 6; } }
      x.globalAlpha = 1; x.fillStyle = '#fff'; if (s.n % 2) x.fillRect(12, 10 + 12 * 11, 7, 6);
    } else {                                                                             // 数据大屏：曲线 + 柱子
      x.strokeStyle = '#243044'; x.lineWidth = 1; for (let i = 1; i < 5; i++) { x.beginPath(); x.moveTo(0, i * 32); x.lineTo(W, i * 32); x.stroke(); }
      x.strokeStyle = s.kind === 1 ? '#38bdf8' : '#f97316'; x.lineWidth = 3; x.beginPath();
      for (let i = 0; i <= 32; i++) { const u = i / 32, y = 130 - u * 80 - Math.sin(u * 9 + time * 0.6) * 10 - Math.sin(u * 23 + s.n) * 4; i ? x.lineTo(u * W, y) : x.moveTo(0, y); } x.stroke();
      for (let i = 0; i < 9; i++) { x.fillStyle = i % 3 ? '#334155' : '#22c55e'; const h = 14 + (Math.sin(i * 1.7 + s.n * 0.5) * 0.5 + 0.5) * 30; x.fillRect(14 + i * 26, 150 - h, 16, h); }
    }
    s.t.needsUpdate = true;
  }
  makeScreens(); screens.forEach(s => drawScreen(s, 0));

  // ── 精灵：表情、对话气泡、光晕 ──
  const emojiTex = new Map();
  function emojiSprite(ch, size = 0.5) {
    let t = emojiTex.get(ch);
    if (!t) { const c = document.createElement('canvas'); c.width = c.height = 96; const x = c.getContext('2d'); x.font = '72px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, 48, 54); t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; emojiTex.set(ch, t); }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, toneMapped: false })); s.scale.set(size, size, 1); s.renderOrder = 20; s.layers.set(FX); return s;
  }
  function bubbleSprite(text, big) {
    const fs = big ? 58 : 40, pad = 30, maxW = big ? 760 : 560, c = document.createElement('canvas'), x = c.getContext('2d'), font = `900 ${fs}px "PingFang SC","Microsoft YaHei",sans-serif`;
    x.font = font;
    const lines = []; let cur = '';
    for (const ch of String(text)) { if (x.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch; } else cur += ch; }
    if (cur) lines.push(cur);
    const tw = Math.max(...lines.map(l => x.measureText(l).width)), w = Math.ceil(tw + pad * 2), h = Math.ceil(lines.length * fs * 1.28 + pad * 2 + 28);
    c.width = w; c.height = h; x.font = font; x.textBaseline = 'top';
    x.fillStyle = '#fff'; x.strokeStyle = '#1e2233'; x.lineWidth = 6; x.lineJoin = 'round';
    x.beginPath(); x.roundRect(5, 5, w - 10, h - 34, 26); x.fill(); x.stroke();
    x.beginPath(); x.moveTo(w / 2 - 20, h - 31); x.lineTo(w / 2, h - 5); x.lineTo(w / 2 + 20, h - 31); x.closePath(); x.fill(); x.stroke();
    x.fillStyle = '#fff'; x.fillRect(w / 2 - 15, h - 39, 30, 10);
    x.fillStyle = big ? '#d1362b' : '#1e2233'; lines.forEach((l, i) => x.fillText(l, pad, pad + i * fs * 1.28));
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })), u = big ? 0.008 : 0.0058;
    s.scale.set(w * u, h * u, 1); s.center.set(0.5, 0); s.renderOrder = 30; s.userData.tex = t; s.layers.set(FX); return s;
  }
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  const glowSprite = (color, size) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); s.scale.setScalar(size); s.layers.set(FX); return s; };

  // ── 一面带窗洞的墙：沿本地 x 轴，内表面朝本地 +z。顶上露出一圈「剖面」 ──
  function wall(parent, len, H, T, ops, o = {}) {
    const g = k.group(parent), th = 0.3, f = n => +n.toFixed(3), wm = k.mat(T.wall, { rough: 0.9, tex: T.wtex || 'plaster', pat: T.wpat }), fm = k.mat(T.frame, { rough: 0.5, metal: T.frame[1] < '9' ? 0.5 : 0, tex: 'paint' }), glass = k.mat('#c4e3ef', { alpha: 0.26, rough: 0.05, metal: 0.25, env: 1.5 });
    let cur = -len / 2;
    const seg = (a, b, y0, y1) => { if (b - a > 0.02 && y1 - y0 > 0.02) k.box(f(b - a), f(y1 - y0), th, wm, g, (a + b) / 2, (y0 + y1) / 2, 0); };
    for (const p of ops.slice().sort((a, b) => a.a - b.a)) {
      seg(cur, p.a, 0, H); seg(p.a, p.b, 0, p.y0); seg(p.a, p.b, p.y1, H);
      if (p.glass) {
        const w = f(p.b - p.a), h = f(p.y1 - p.y0), cx = (p.a + p.b) / 2, cy = (p.y0 + p.y1) / 2;
        k.box(w, h, 0.03, glass, g, cx, cy, 0, { cast: false });
        k.box(w + 0.1, 0.07, th + 0.06, fm, g, cx, p.y0, 0); k.box(w + 0.1, 0.07, th + 0.06, fm, g, cx, p.y1, 0); k.box(0.07, h, th + 0.06, fm, g, p.a, cy, 0); k.box(0.07, h, th + 0.06, fm, g, p.b, cy, 0); k.box(0.05, h, 0.08, fm, g, cx, cy, 0);
        if (h > 1.8) k.box(w, 0.05, 0.08, fm, g, cx, p.y0 + h * 0.62, 0);
        if (o.grid) {                                                                                                                  // 老厂房的细格钢窗
          const nx = Math.max(2, Math.round(w / 0.48)), ny = Math.max(2, Math.round(h / 0.56));
          for (let i = 1; i < nx; i++) k.box(0.03, h, 0.06, fm, g, p.a + i * w / nx, cy, 0, { cast: false });
          for (let j = 1; j < ny; j++) k.box(w, 0.03, 0.06, fm, g, cx, p.y0 + j * h / ny, 0, { cast: false });
        }
        if (o.bars) for (let x = p.a + 0.16; x < p.b; x += 0.2) k.cyl(0.016, 0.016, h, '#8d959e', g, x, cy, -0.2, { seg: 6, metal: 0.6, rough: 0.5 });
      }
      cur = p.b;
    }
    seg(cur, len / 2, 0, H);
    k.box(len, 0.05, th + 0.02, k.mat('#8d877c', { rough: 0.95, tex: 'concrete' }), g, 0, H + 0.025, 0);                              // 剖面
    let c2 = -len / 2;                                                                                                               // 踢脚线与墙裙（避开门洞）
    for (const p of [...ops.filter(p => p.y0 < 0.05).sort((a, b) => a.a - b.a), { a: len / 2, b: len / 2 }]) {
      if (p.a - c2 > 0.05) { k.box(f(p.a - c2), 0.12, 0.03, k.mat('#d9d2c4', { rough: 0.6, tex: 'paint' }), g, (c2 + p.a) / 2, 0.06, th / 2 + 0.015, { cast: false }); if (o.dado) k.box(f(p.a - c2), 1.0, 0.02, k.mat(o.dado, { rough: 0.6, tex: 'paint' }), g, (c2 + p.a) / 2, 0.62, th / 2 + 0.01, { cast: false }); }
      c2 = p.b;
    }
    return g;
  }
  const P = (name, o) => { const p = PROPS[name]; if (!p) return null; const g = p.build(k, o || {}); if (g.userData.tick) ticks.push(g.userData.tick); if (g.userData.own) owned.push(...g.userData.own); return g; };
  const put = (parent, name, x, z, ry = 0, o, y = 0) => { const g = P(name, o); if (g) { g.position.set(x, y, z); g.rotation.y = ry; parent.add(g); } return g; };

  // ── 房间 ──
  function buildRoom() {
    for (const b of bakes) b.userData.dispose?.(); for (const x of owned) x.dispose?.();
    const dead = new Set(owned); for (let i = k.nightMats.length - 1; i >= 0; i--) if (dead.has(k.nightMats[i][0])) k.nightMats.splice(i, 1);
    for (const s of tw.labels) s.material.map?.dispose();
    owned = []; bakes = []; ticks = []; seats = []; stands = []; drops = []; dropsNew = []; roomG.clear(); floorsG.clear(); tw.on = false; tw.F = []; tw.ride = null; tw.labels = []; tw.queue = []; tw.pending = [];
    furnaceG.position.y = rackG.position.y = 0; furnaceG.visible = rackG.visible = true;
    const v = st.view, T = themeOf(v.region, v.level, v.district), L0 = LEVELS[v.level] || LEVELS[1], L = (st.L = T.H ? { ...L0, H: T.H } : L0), brand = v.brand || '#ff6b4a', { W, D, H } = L, bay = v.region === 'bay', lv = v.level, g = k.group();
    st.kind = T.kind || ''; st.shutter = !!T.shutter;
    if (FLOOR_PLANS[lv]) return buildTower();
    // 地块：铺地、草坪（起步的房子有的没草坪：阁楼临街、握手楼和档口门口是水泥地）
    k.box(W + 6.8, 0.5, D + 6.8, '#c4c7cc', g, 0, -0.25, 0, { r: 0.06, rough: 0.85, tex: 'concrete', pat: ['tile', 0.9, 0.24, 0.07] });
    const lawn = k.mat(bay ? '#7fb56a' : '#6fb564', { rough: 0.95, tex: 'grass' });
    if (lv > 1 || T.lawn) { k.box(W + 5.6, 0.1, 1.5, lawn, g, 0.3, 0.02, D / 2 + 2.15, { r: 0.04, cast: false }); k.box(1.5, 0.1, D + 4.1, lawn, g, W / 2 + 2.15, 0.02, -0.45, { r: 0.04, cast: false }); }
    k.box(W + 0.4, 0.06, D + 0.4, '#9a958a', g, -0.05, 0.0, -0.05, { rough: 0.9, tex: 'concrete' });                                // 楼板边
    k.box(W, 0.05, D, T.floor[0], g, 0, 0.03, 0, { ...T.floor[1], cast: false });
    const dx0 = -W / 2 + 2.6, dz0 = -D / 2 + 2.4, deskW = (L.cols - 1) * L.px, deskD = (L.rows - 1) * L.pz;
    if (T.carpet) k.box(deskW + 2.7, 0.03, deskD + 2.9, T.carpet, g, dx0 + deskW / 2, 0.065, dz0 + deskD / 2 - 0.1, { r: 0.012, rough: 0.98, tex: 'carpet', cast: false });
    // 后墙（z=-D/2）与左墙（x=-W/2）
    const dado = T.dado === 'brand' ? brand : T.dado, [winY0, winY1] = T.win || [T.curtain ? 0.3 : 0.95, T.curtain ? H - 0.4 : Math.min(2.5, H - 0.5)], back = [], left = [], backEnd = W / 2 - L.rz - 0.3;
    if (T.shutter) back.push({ a: -1.9, b: 1.9, y0: 0, y1: 2.5 });
    else if (T.backWin) for (const [a, b] of T.backWin) back.push({ a, b, y0: winY0, y1: winY1, glass: true });
    else for (let x = -W / 2 + 1.1; x + 1.5 < backEnd; x += T.curtain ? 1.75 : 2.3) back.push({ a: x, b: x + 1.5, y0: winY0, y1: winY1, glass: true });
    const wo = { dado, bars: T.bars, grid: T.grid }, bw = wall(g, W + 0.3, H, T, back, wo); bw.position.set(-0.15, 0, -D / 2 - 0.15);
    if (T.shutter) {                                                          // 半开的卷帘门：车库门外停着车，档口门外是市场的过道
      for (let i = 0; i < 7; i++) k.box(3.8, 0.17, 0.06, T.shutter, bw, 0, 2.42 - i * 0.18, 0.02, { metal: 0.6, rough: 0.45, tex: 'metal' });
      k.box(4.1, 0.26, 0.5, '#868f9b', bw, 0, 2.63, 0.05, { metal: 0.5, rough: 0.5 });
      if (T.kind === 'garage') put(g, PROPS.car_hatch ? 'car_hatch' : 'car', 0.2, -D / 2 - 3.0, 0.35, { brand });
    }
    left.push({ a: -D / 2 + 1.1, b: -D / 2 + 2.5, y0: 0, y1: 2.25 });              // 门（墙的本地 a = -世界 z）
    if (T.leftWin) for (const [a, b] of T.leftWin) left.push({ a, b, y0: winY0, y1: winY1, glass: true });
    else if (!T.shutter) for (let a = D / 2 - 3.2; a > -D / 2 + 4.6; a -= lv >= 4 ? 2.3 : 99) left.push({ a, b: a + 1.7, y0: winY0, y1: winY1, glass: true });
    const lw = wall(g, D + 0.3, H, T, left, wo); lw.rotation.y = Math.PI / 2; lw.position.set(-W / 2 - 0.15, 0, 0.15);
    k.box(0.34, H + 0.06, 0.34, T.wall, g, -W / 2 - 0.15, H / 2, -D / 2 - 0.15, { rough: 0.9, tex: 'plaster' });        // 墙角柱
    door.set(-W / 2, 0, D / 2 - 1.8);
    k.box(0.06, 2.2, 1.3, '#8a623f', g, -W / 2 - 0.5, 1.1, D / 2 - 1.05, { ry: 0.5, rough: 0.6, tex: 'wood', r: 0.01 });             // 敞开的门扇
    k.box(0.7, 0.025, 1.4, brand, g, -W / 2 + 0.55, 0.068, D / 2 - 1.8, { rough: 0.95, tex: 'carpet', cast: false });               // 门垫
    // 左墙上的数据大屏 + 创始人踱步的走廊
    const tv = put(g, PROPS.tv_wall ? 'tv_wall' : 'whiteboard', -W / 2 + 0.02, -0.6, Math.PI / 2, { screen: screens[1].m, brand }, PROPS.tv_wall ? 1.05 : 0.06);
    if (!tv) k.box(0.06, 1.5, 2.6, '#f9fbfd', g, -W / 2 + 0.05, 1.65, -0.6);
    pace = [new THREE.Vector3(-W / 2 + 1.25, 0, -D / 2 + 1.9), new THREE.Vector3(-W / 2 + 1.25, 0, Math.min(D / 2 - 3.4, 1.4))];
    // 工位：小人坐在桌子后面、面朝 +z（镜头方向）
    for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) {
      const x = dx0 + c * L.px, z = dz0 + r * L.pz, n = r * L.cols + c;
      if (!put(g, 'desk_set', x, z + 0.18, 0, { seed: n * 7 + lv, brand, screen: screens[n % 4 === 1 ? 2 : n % 4 === 3 ? 3 : 0].m }, 0.06)) { k.box(1.5, 0.07, 0.72, '#e6c9a0', g, x, 0.8, z + 0.18, { r: 0.03, tex: 'wood' }); k.box(0.07, 0.72, 0.62, '#aeb6c2', g, x - 0.68, 0.42, z + 0.18); k.box(0.07, 0.72, 0.62, '#aeb6c2', g, x + 0.68, 0.42, z + 0.18); }
      if (!put(g, 'office_chair', x, z - 0.52, 0, { brand, seed: n }, 0.06)) k.box(0.5, 0.5, 0.5, '#4a5160', g, x, 0.3, z - 0.55, { r: 0.05 });
      if (lv >= 2 && n % 3 === 1) put(g, 'desk_lamp', x - 0.55, z + 0.35, 0.6, { brand }, 0.8);
      seats.push({ x, z: z - 0.5 });
    }
    for (let i = 0; i < 14; i++) stands.push({ x: -W / 2 + 2.4 + (i % 7) * 1.05, z: D / 2 - 0.8 - (i / 7 | 0) * 0.9 });
    // 机房地台、玻璃隔断
    const rx0 = W / 2 - L.rz, rd = 3 * 1.6 + 0.6;
    k.box(L.rz - 0.2, 0.09, rd, '#a9b1bc', g, rx0 + L.rz / 2, 0.075, -D / 2 + rd / 2 + 0.1, { rough: 0.4, metal: 0.5, tex: 'metal', pat: ['tile', 0.6, 0.45, 0.04], cast: false });
    if (T.glassRoom) { const gl = k.mat('#c4e3ef', { alpha: 0.22, rough: 0.05, metal: 0.25, env: 1.5 }), fr = k.mat('#2f353d', { rough: 0.5, metal: 0.5 }); k.box(0.04, 2.3, rd, gl, g, rx0, 1.25, -D / 2 + rd / 2 + 0.1, { cast: false }); k.box(L.rz * 0.55, 2.3, 0.04, gl, g, rx0 + L.rz * 0.275, 1.25, -D / 2 + rd + 0.1, { cast: false }); for (const [x, z] of [[rx0, -D / 2 + rd + 0.1], [rx0, -D / 2 + 0.2], [rx0 + L.rz * 0.55, -D / 2 + rd + 0.1]]) k.box(0.08, 2.4, 0.08, fr, g, x, 1.25, z); k.box(0.06, 0.06, rd, fr, g, rx0, 2.42, -D / 2 + rd / 2 + 0.1); k.box(L.rz * 0.55, 0.06, 0.06, fr, g, rx0 + L.rz * 0.275, 2.42, -D / 2 + rd + 0.1); }
    lampA.position.set(dx0 + deskW * 0.25, H + 0.6, dz0 + deskD / 2); lampB.position.set(dx0 + deskW * 0.8, H + 0.6, dz0 + deskD / 2);
    beaconMat = own(new THREE.MeshStandardMaterial({ color: 0xff4d4d, emissive: 0xff3030, emissiveIntensity: 0.25, roughness: 0.4 }));
    k.cyl(0.13, 0.15, 0.2, beaconMat, g, -W / 2 + 0.2, H + 0.16, -D / 2 + 0.2);
    if (lv === 1) { startShell(g, L, T, brand); startDecor(g, L, T, brand); } else decorate(g, L, bay, brand, T);
    buildSign(g);
    const b = k.bake(g); bakes.push(b); roomG.add(b);
    for (const d of dropsNew) { const db = k.bake(d.g); bakes.push(db); roomG.add(db); drops.push({ o: db, axis: d.axis, min: d.min, s: 1 }); }
    dropsNew = [];
    buildCore(); buildRacks();
  }
  // ───────── 起步的房子：六个落脚点各有各的结构和摆设 ─────────
  // 一块写着字的招牌（画布贴图，夜里发光）。vert：竖排；legs：底下加两根支脚（立在墙头上用）
  function textSign(parent, text, w, h, x, y, z, ry, bg, fg, o = {}) {
    text = tr(text);
    const c = document.createElement('canvas'), u = 128 / Math.min(w, h), cw = (c.width = Math.round(w * u)), ch = (c.height = Math.round(h * u)), x2 = c.getContext('2d'), chars = [...text];
    const font = s => `900 ${s}px "Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif`;
    x2.fillStyle = bg; x2.fillRect(0, 0, cw, ch); x2.strokeStyle = fg; x2.globalAlpha = 0.5; x2.lineWidth = 5; x2.strokeRect(7, 7, cw - 14, ch - 14); x2.globalAlpha = 1;
    x2.fillStyle = fg; x2.textAlign = 'center'; x2.textBaseline = 'middle';
    if (o.vert) { const step = (ch - 26) / chars.length, s = Math.min(cw * 0.7, step * 0.9); x2.font = font(s); chars.forEach((chr, i) => x2.fillText(chr, cw / 2, 13 + (i + 0.5) * step + s * 0.04)); }
    else { let s = ch * 0.62; x2.font = font(s); while (x2.measureText(text).width > cw - 36 && s > 16) { s -= 3; x2.font = font(s); } x2.fillText(text, cw / 2, ch / 2 + s * 0.05); }
    const t = own(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const m = own(new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.22, roughness: 0.55 })); k.nightMats.push([m, 0.22, 1.05]);
    const sg = k.group(parent, x, y, z, ry);
    k.box(w + 0.14, h + 0.14, 0.12, '#2a2f36', sg, 0, 0, -0.04, { metal: 0.5, rough: 0.5 });
    k.put(k.geo(`tsign|${w}|${h}`, () => new THREE.PlaneGeometry(w, h)), m, sg, 0, 0, 0.025, { cast: false });
    if (o.legs) for (const sx of [-1, 1]) k.box(0.08, o.legs, 0.08, '#4a5160', sg, sx * (w / 2 - 0.3), -h / 2 - o.legs / 2, -0.04, { metal: 0.6, rough: 0.5 });
    return sg;
  }
  // 墙外高出一大截的东西（邻楼、幕墙、水塔）：镜头转到它背后时会把屋里挡住，所以各自成组，到时候缩下去（和城里的楼被「剖开」一个道理）。
  // axis：它在哪面墙外（'z' 后墙，'x' 左墙）；min：最矮缩到几成；y0：这一组从多高起算
  let drops = [], dropsNew = [];
  const dropG = (axis, min = 0, y0 = 0) => { const dg = k.group(null, 0, y0, 0); dropsNew.push({ g: dg, axis, min }); return dg; };
  // 墙外和墙头上的结构：山墙、夹层、邻楼、幕墙、招牌墙……六种房子的轮廓一眼就不一样
  function startShell(g, L, T, brand) {
    const { W, D, H } = L, kind = T.kind, PI = Math.PI, bzc = -D / 2 - 0.15, lxc = -W / 2 - 0.15, ww = W + 0.3;       // 后墙、左墙的中线；后墙的长度
    if (kind === 'garage' || kind === 'house') {
      // 人字山墙立在后墙顶上，前面带一截屋面的剖口；车库是浅色木板墙，合租屋是深色木瓦
      const sh = kind === 'house', rise = sh ? 2.7 : 2.6, roofC = sh ? '#4c5a52' : '#5f5651', sl = Math.hypot(ww / 2, rise), ang = Math.atan2(rise, ww / 2), ca = Math.cos(ang), sa = Math.sin(ang);
      const gg = k.group(g, -0.15, H + 0.05, bzc - 0.15);
      k.extrude([[-ww / 2, 0], [ww / 2, 0], [0, rise]], 0.2, sh ? '#6f4f3a' : '#e4dccb', gg, 0, 0, 0, { rough: 0.9, tex: sh ? 'wood' : 'paint', pat: sh ? ['grid', 0.28, 0.17, 0.42, 0.22] : ['grid', 99, 0.19, 0.28, 0.05] });
      for (const sx of [-1, 1]) {
        const cx = sx * (ww / 4 + 0.2 * ca + 0.09 * sa), cy = rise / 2 - 0.2 * sa + 0.09 * ca;
        k.box(sl + 0.7, 0.18, 1.0, roofC, gg, cx, cy, 0.35, { rz: -sx * ang, rough: 0.9, tex: 'asphalt', pat: ['grid', 0.4, 0.3, 0.3, 0.1] });
        k.box(sl + 0.7, 0.12, 0.06, '#f4f1ea', gg, cx + sx * 0.1 * sa, cy - 0.1 * ca, 0.86, { rz: -sx * ang, rough: 0.6, tex: 'paint' });        // 封檐板
      }
      k.box(0.34, 0.16, 1.02, roofC, gg, 0, rise + 0.13, 0.35, { rough: 0.9, tex: 'asphalt' });                                             // 屋脊
      k.cyl(0.27, 0.27, 0.06, '#fffaf0', gg, 0, rise - 0.72, 0.22, { rx: PI / 2, rough: 0.6, tex: 'paint' }); k.cyl(0.2, 0.2, 0.07, '#5d7890', gg, 0, rise - 0.72, 0.225, { rx: PI / 2, rough: 0.15, metal: 0.4 });   // 山墙尖上的小圆窗
      if (sh) {                                                                                                                            // 合租屋：左墙外一根砖烟囱
        const brick = k.mat('#9a5a43', { rough: 0.9, tex: 'brick', pat: ['brick', 0.4, 0.12, 0.36, 0.2] }), ch = H + 3.1;
        k.box(0.8, ch, 0.8, brick, g, lxc - 0.5, ch / 2, -1.4); k.box(0.98, 0.12, 0.98, '#8d877c', g, lxc - 0.5, ch + 0.06, -1.4, { rough: 0.95, tex: 'concrete' });
        for (const dz of [-0.19, 0.19]) k.cyl(0.11, 0.13, 0.32, '#b5583c', g, lxc - 0.5, ch + 0.28, -1.4 + dz, { rough: 0.8, tex: 'stone' });
      }
    } else if (kind === 'loft') {
      const steel = k.mat('#2a2f36', { rough: 0.5, metal: 0.6, tex: 'metal' }), wood = k.mat('#9a7350', { rough: 0.6, tex: 'wood', pat: ['plank', 0.2, 1.4, 0.4, 0.18] });
      // 睡觉的夹层：钢架托着木板，靠着后墙和左墙；一架梯子、两面栏杆、床垫铺盖
      const x0 = -W / 2, x1 = -W / 2 + 2.15, z0 = -D / 2, z1 = -D / 2 + 1.75, py = 2.15, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, lx0 = x1 - 0.3;
      k.box(x1 - x0, 0.1, z1 - z0, wood, g, mx, py, mz, { r: 0.01 });
      k.box(x1 - x0, 0.14, 0.08, steel, g, mx, py - 0.12, z1 - 0.04); k.box(0.08, 0.14, z1 - z0, steel, g, x1 - 0.04, py - 0.12, mz); k.box(0.09, py - 0.05, 0.09, steel, g, x1 - 0.05, (py - 0.05) / 2, z1 - 0.05);
      for (const yy of [0.45, 0.9]) { k.box(x1 - x0 - 0.62, 0.04, 0.04, steel, g, mx - 0.31, py + yy, z1 - 0.04); k.box(0.04, 0.04, z1 - z0, steel, g, x1 - 0.04, py + yy, mz); }
      for (let x = x0 + 0.12; x < x1 - 0.62; x += 0.47) k.box(0.03, 0.9, 0.03, steel, g, x, py + 0.45, z1 - 0.04);
      for (let z = z0 + 0.22; z < z1; z += 0.5) k.box(0.03, 0.9, 0.03, steel, g, x1 - 0.04, py + 0.45, z);
      for (const dx of [-0.2, 0.2]) k.box(0.05, py + 0.35, 0.05, steel, g, lx0 + dx, (py + 0.35) / 2 - 0.02, z1 + 0.32, { rx: -0.26 });
      for (let i = 0; i < 6; i++) k.box(0.4, 0.035, 0.05, steel, g, lx0, 0.3 + i * 0.34, z1 + 0.57 - i * 0.09);
      k.box(1.85, 0.2, 1.0, '#f1ede4', g, x0 + 1.0, py + 0.15, z0 + 0.62, { r: 0.06, rough: 0.95, tex: 'fabric' }); k.box(0.5, 0.12, 0.7, '#ffffff', g, x0 + 0.35, py + 0.3, z0 + 0.62, { r: 0.05, rough: 0.95, tex: 'fabric' });
      k.box(1.15, 0.1, 1.02, brand, g, x0 + 1.32, py + 0.28, z0 + 0.62, { r: 0.04, rough: 0.95, tex: 'fabric' });
      // 外露的通风管，沿着后墙上沿
      const duct = k.mat('#c9ced6', { rough: 0.35, metal: 0.8, tex: 'metal' });
      k.cyl(0.17, 0.17, 4.6, duct, g, -0.2, H - 0.3, -D / 2 + 0.34, { rz: PI / 2 });
      for (const x of [-2.4, -1.3, -0.2, 0.9, 2.0]) k.torus(0.176, 0.018, duct, g, x, H - 0.3, -D / 2 + 0.34, { ry: PI / 2 });
      for (const x of [-1.7, 1.1]) k.box(0.34, 0.1, 0.24, '#8d959e', g, x, H - 0.52, -D / 2 + 0.34, { metal: 0.6, rough: 0.5 });
      // 后墙外一截邻楼，楼顶立着木箍水塔，侧面挂着防火梯
      const sh2 = H + 0.9, dg = dropG('z', (H - 0.4) / (sh2 + 3.6));
      k.box(2.6, sh2, 2.4, T.wall, dg, 2.9, sh2 / 2, bzc - 1.45, { rough: 0.9, tex: 'brick', pat: T.wpat }); k.box(2.8, 0.14, 2.6, '#8d877c', dg, 2.9, sh2 + 0.07, bzc - 1.45, { rough: 0.95, tex: 'concrete' });
      put(dg, 'water_tower_wood', 2.9, bzc - 1.45, 0.3, { seed: 3 }, sh2 + 0.14);
      if (PROPS.fire_escape) put(dg, 'fire_escape', 4.2, bzc - 1.45, PI / 2, {}, sh2 - 2.85);
    } else if (kind === 'village') {
      // 握手楼：后面和左边紧贴着两栋邻楼，贴着瓷砖，窗外是防盗网、空调外机和晾出来的衣服
      const walls = [k.mat('#e9e1cf', { rough: 0.8, tex: 'plaster', pat: ['grid', 0.3, 0.15, 0.2, 0.05] }), k.mat('#dfe7d6', { rough: 0.8, tex: 'plaster', pat: ['grid', 0.3, 0.15, 0.2, 0.05] })];
      const dark = k.mat('#48586a', { rough: 0.2, metal: 0.4 }), lit = k.mat('#ffd9a0', { glow: '#ffcf8a', glowK: 0.04, night: 1.5, rough: 0.5 }), cage = k.mat('#8d959e', { rough: 0.5, metal: 0.6 }), ac = k.mat('#eef0f1', { rough: 0.6, tex: 'plastic' }), cloth = ['#e5484d', '#3f7fd6', '#f4f4f2', '#f2c14e', '#2f8f6b'];
      const facade = (x, z, ry, len, top, n) => {
        const fg = k.group(dropG(ry ? 'x' : 'z', (H - 0.5) / top), x, 0, z, ry), nb = Math.max(2, Math.round(len / 2.3)), bw2 = len / nb;
        k.box(len, top, 2.2, walls[n % 2], fg, 0, top / 2, -1.1); k.box(len + 0.2, 0.3, 2.4, '#8d877c', fg, 0, top + 0.15, -1.1, { rough: 0.95, tex: 'concrete' });
        for (let fl = 1; 0.9 + fl * 2.75 + 1.5 < top; fl++) for (let b = 0; b < nb; b++) {
          const wx = -len / 2 + (b + 0.5) * bw2, wy = 1.55 + fl * 2.75, r = (b * 7 + fl * 5 + n * 3) % 6;
          k.box(1.2, 1.3, 0.06, r < 2 ? lit : dark, fg, wx, wy, 0.02, { cast: false });
          k.box(1.36, 0.06, 0.34, cage, fg, wx, wy - 0.68, 0.17); k.box(1.36, 0.03, 0.03, cage, fg, wx, wy + 0.66, 0.33);
          for (let i = -2; i <= 2; i++) k.box(0.025, 1.34, 0.025, cage, fg, wx + i * 0.33, wy, 0.33);                                     // 防盗网
          if (r % 3 === 0) k.box(0.78, 0.5, 0.3, ac, fg, wx + (b % 2 ? -0.25 : 0.25), wy - 1.15, 0.16);
          if (r % 2 === 1) { k.cyl(0.014, 0.014, 1.5, cage, fg, wx, wy - 0.42, 0.62, { rz: PI / 2, seg: 6 }); for (let i = 0; i < 3; i++) k.box(0.34, 0.42, 0.03, cloth[(b + fl + i + n) % 5], fg, wx - 0.5 + i * 0.5, wy - 0.66, 0.62, { rough: 0.95, tex: 'fabric' }); }
        }
        return fg;
      };
      const fb = facade(-0.15, bzc - 0.95, 0, W + 1.2, 9.3, 0), fl = facade(lxc - 0.95, -1.75, PI / 2, 5.3, 8.1, 1);
      put(fb, 'water_tank', 1.75, -1.15, 0, { seed: 1 }, 9.6); put(fl, 'laundry_line', 0.2, -1.1, 0, { seed: 2 }, 8.4);                     // 楼顶的水塔和晾衣杆跟着邻楼一起收放
      // 头顶的「蜘蛛网」：电线杆之间、楼和楼之间拉着的线
      const wire = k.mat('#20242b', { rough: 0.7, tex: 'rubber' }), a = [-W / 2 - 1.9, 6.5, D / 2 + 1.9], b = [W / 2 + 2.3, 6.4, bzc - 1.9];
      const span = (p, q, sag, off = 0) => k.tube([[p[0], p[1] + off, p[2]], [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2 - sag + off, (p[2] + q[2]) / 2], [q[0], q[1] + off, q[2]]], 0.02, wire, g, 0, 0, 0, { cast: false });
      span(a, b, 0.9); span(a, b, 1.25, -0.35); span(a, [-3.6, 7.2, bzc - 0.7], 0.7); span(a, [lxc - 0.75, 6.2, -0.4], 0.5); span(b, [3.2, 7.6, bzc - 0.7], 0.4); span([lxc - 0.75, 5.4, 0.4], [-2.2, 5.9, bzc - 0.7], 0.5, 0);
    } else if (kind === 'park') {
      // 我们只是研发楼底层的一间：后墙往上是两层玻璃幕墙，楼顶有设备
      const glassM = k.mat('#6f93b3', { rough: 0.07, metal: 0.85, env: 1.3, glow: '#cfe6ff', glowK: 0, night: 0.3 }), mull = k.mat('#2a3038', { rough: 0.45, metal: 0.6, tex: 'metal' }), band = k.mat('#e9ecef', { rough: 0.55, metal: 0.2, tex: 'metal' });
      const fh = 3.3, nfl = 2, top = nfl * fh, cy = top / 2, dg = dropG('z', 0, H + 0.08);                                                // 这一组从后墙顶上起算
      k.box(ww, top, 0.14, glassM, dg, -0.15, cy, bzc - 0.06, { cast: false });
      for (let i = 0; i <= 8; i++) k.box(0.07, top, 0.2, mull, dg, -0.15 - ww / 2 + i * ww / 8, cy, bzc - 0.02);
      for (let f = 0; f <= nfl; f++) k.box(ww + 0.1, 0.46, 0.36, band, dg, -0.15, f * fh + (f === 0 ? 0.23 : f === nfl ? -0.23 : 0), bzc);
      k.box(0.34, top, 0.5, brand, dg, W / 2 - 0.17, cy, bzc + 0.05, { rough: 0.5, tex: 'paint' });                                        // 一根品牌色的竖向装饰条
      k.box(ww, 0.3, 3.4, band, dg, -0.15, top + 0.15, bzc - 1.55); put(dg, 'roof_hvac', 2.2, bzc - 1.7, 0, { seed: 1 }, top + 0.3); put(dg, 'solar_array', -2.4, bzc - 1.7, 0, { seed: 2 }, top + 0.3);
      // 门头的钢雨棚：从左墙顶上往外挑
      k.box(1.5, 0.1, 2.3, mull, g, lxc - 0.6, H - 0.35, D / 2 - 1.8); for (const dz of [-1.0, 1.0]) k.box(0.05, 0.05, 1.3, mull, g, lxc - 0.4, H - 0.05, D / 2 - 1.8 + dz, { rz: 0.5 });
    } else if (kind === 'stall') {
      // 招牌墙：公司招牌旁边、左墙头上全是别家的招牌，一块比一块大
      textSign(g, '显卡回收', 2.5, 0.8, 3.5, H + 0.72, bzc + 0.2, 0, '#c8402f', '#fff6e0', { legs: 0.26 });
      textSign(g, '手机配件批发', 2.5, 0.72, 3.5, H + 1.62, bzc + 0.2, 0, '#f2c14e', '#3a2a10');
      textSign(g, '芯片 · 元器件 · 一件代发', 4.6, 0.78, lxc + 0.2, H + 0.7, -1.35, PI / 2, '#1f6f8b', '#eaf6ff', { legs: 0.26 });
      textSign(g, '柜台出租', 0.72, 2.5, lxc + 0.2, H + 1.56, 2.75, PI / 2, '#1e2233', '#ffd66b', { vert: true, legs: 0.26 });
      put(g, 'neon_sign', W / 2 + 0.02, bzc + 0.15, 0, { brand: '#ff4f8b', seed: 5 }, 0.7);                                                // 墙角挑出去的竖排霓虹
      const blue = k.mat('#3f78b8', { rough: 0.6, tex: 'paint' });
      k.box(ww, 0.16, 0.36, blue, g, -0.15, H + 0.13, bzc); k.box(0.36, 0.16, D + 0.3, blue, g, lxc, H + 0.13, 0.15);                       // 墙头一圈蓝色的檐口
    }
  }
  // 起步房子里外的摆设。墙上的位置（世界 z）：左墙前角 3.1~4、门 1.65~3.05、门和大屏之间 0.55~1.6、大屏 -1.7~0.5、后角 -4~-1.75
  const TRACK_PROP = { chat: 'chat_sign', code: 'rubber_duck', companion: 'plush_bear', video: 'film_set' };       // 四条产品赛道各有一样标志摆设
  function startDecor(g, L, T, brand) {
    const { W, D, H } = L, kind = T.kind, PI = Math.PI, lx = -W / 2, bz = -D / 2, fz = D / 2 - 1.15, F = 0.06, ox = W / 2 + 2.15, oz = D / 2 + 2.15;
    const alt = (a, b) => (PROPS[a] ? a : b);
    const pp = (name, x, z, ry = 0, o, y = F) => (PROPS[name] ? put(g, name, x, z, ry, { brand, seed: (x * 7 + z * 13) | 0, ...o }, y) : null);       // 屋里的（踩在地板上）
    const out = (name, x, z, ry = 0, o, y = 0) => (PROPS[name] ? put(g, name, x, z, ry, { brand, seed: (x * 5 + z * 11) | 0, ...o }, y) : null);     // 屋外的
    // 每种房子都有的：挂钟、灭火器、路灯、产品赛道的标志摆设
    put(g, 'wall_clock', lx + 0.02, D / 2 - 4.1, PI / 2, {}, H - 0.75); pp('fire_extinguisher', lx + 0.2, 3.5, PI / 2);
    out('street_lamp', W / 2 - 1, oz + 0.4, PI);
    pp(TRACK_PROP[st.view.track], 0.6, fz + 0.15, 0.45, { seed: 1 });
    if (kind === 'garage') {
      pp('boxes', -1.6, fz, PI); pp(alt('workbench', 'garage_shelf'), -3.5, bz + 0.42); pp('garage_shelf', lx + 0.35, -2.95, PI / 2); pp('bicycle', lx + 0.5, -0.75, PI / 2); pp('skateboard', -3.4, 3.5, 0.5);
      // 车道、草坪上的石板小路、白栅栏、柠檬树、篮球架、信箱
      k.box(4.7, 0.05, 3.0, '#cfcbc0', g, 0, 0.025, bz - 1.85, { rough: 0.85, tex: 'concrete', pat: ['tile', 1.5, 0.2, 0.04], cast: false });
      for (let i = 0; i < 3; i++) k.box(0.8, 0.05, 0.42, '#c9c5ba', g, 0.9 + (i % 2) * 0.14, 0.09, D / 2 + 1.62 + i * 0.52, { r: 0.02, rough: 0.9, tex: 'stone', cast: false });
      for (const x of [6.95, 4.95, 2.95, -1.05, -3.05, -5.05, -7.05]) out('picket_fence', x, oz + 0.82);
      for (const z of [5.95, 3.95, 1.95, -0.05, -2.05, -4.05, -6.05]) out('picket_fence', ox + 0.82, z, PI / 2);
      out(alt('lemon_tree', 'tree_round'), lx + 1.5, oz, 0, { seed: 1 }, 0.05); out('tree_palm', ox, bz + 1.5, 1, { seed: 2 }, 0.05); out('tree_palm', ox, D / 2 - 3, 2, { seed: 3 }, 0.05);
      out('bush', ox, 1.5, 0, {}, 0.05); out('bush', -1, oz + 0.1, 1, {}, 0.05); out('flower_bed', 4.2, oz, 0, { seed: 1 }, 0.05);
      out('basketball_hoop', W / 2 + 1.25, bz - 1.9, -PI / 2); out('mailbox', 2.5, oz + 1.05); out('fire_hydrant', ox - 1.1, D / 2 + 0.8); out('street_lamp', lx - 2.3, 0, PI / 2);
    } else if (kind === 'loft') {
      pp('sofa', -1.6, fz, PI); pp('bean_bag', lx + 0.95, -3.0, 0.6); pp('plant_tall', lx + 0.5, bz + 0.5); pp('bicycle', lx + 0.5, -0.75, PI / 2); pp('kombucha', lx + 0.5, 1.05, PI / 2); pp('plant_tall', -3.9, 3.6);
      put(g, 'neon_slogan', lx + 0.02, 2.35, PI / 2, { brand }, H - 1.05); put(g, 'poster_frame', -3.9, bz + 0.02, 0, { art: art?.mat(1), seed: 1 }, 0.8);
      // 临街：没有草坪，行道树、咪表、报刊箱、共享滑板车
      out('tree_street', lx + 1.5, oz, 0, { seed: 1 }); out('tree_street', ox, D / 2 - 3, 0, { seed: 3 });
      for (const x of [-4.6, -0.2, 4.2]) out('parking_meter', x, oz + 1.0); for (const z of [-3.4, 2.2]) out('parking_meter', ox + 1.0, z, PI / 2);
      [0, 1, 3].forEach((s, i) => out('news_rack', 5.3 + i * 0.6, oz + 0.2, 0, { seed: s }));
      out('kick_scooter', -2.4, oz - 0.1, 0.5, { seed: 0 }); out('kick_scooter', -1.8, oz + 0.1, 0.2, { seed: 1 }); out('bike_rack', 2.4, oz + 0.05, 0, { seed: 3 });
      out('fire_hydrant', ox - 1.1, D / 2 + 0.8); out('trash_public', lx - 1.2, D / 2 - 2.6); out('street_lamp', lx - 2.3, 0, PI / 2);
      // 楼下天天有状况：围起来的检修井在冒汽
      out(alt('manhole_steam', 'manhole'), ox + 0.1, -0.5); out('road_barrier', ox + 0.1, -1.8); out('road_barrier', ox + 0.1, 0.8); out('road_barrier', ox - 1.15, -0.5, PI / 2);
      for (const [x, z] of [[ox + 0.95, -1.4], [ox + 1.0, 0.3], [ox - 0.8, 0.75], [ox - 0.9, -1.7]]) out('traffic_cone', x, z);
    } else if (kind === 'house') {
      pp('sofa', -1.6, fz, PI); pp('rug', -1.6, 1.75); pp('coffee_table', -1.6, 1.75); pp('pizza_stack', -1.5, 1.75, 0.4, {}, F + 0.42);
      pp('bunk_bed', lx + 0.7, bz + 1.3, PI / 2); pp('bicycle', lx + 0.5, -0.75, PI / 2); pp('fridge', lx + 0.5, 1.05, PI / 2); pp('guitar_stand', -3.6, 3.55, 0.5); pp('bookshelf', 0.85, bz + 0.25);
      if (PROPS.string_lights) { put(g, 'string_lights', -2.6, bz + 0.02, 0, { brand, seed: 1 }, H - 0.12); put(g, 'string_lights', 0.45, bz + 0.02, 0, { brand, seed: 2 }, H - 0.12); put(g, 'string_lights', lx + 0.02, -2.4, PI / 2, { brand, seed: 3 }, H - 0.12); }
      // 门廊：木平台上扔着一张旧沙发，台阶下去是草坪；院子里晾着衣服、停着自行车
      const deck = k.mat('#a9825c', { rough: 0.7, tex: 'wood', pat: ['plank', 0.16, 1.4, 0.4, 0.16] });
      k.box(5.6, 0.12, 1.15, deck, g, -2.3, 0.06, D / 2 + 0.8, { r: 0.01 }); k.box(1.5, 0.08, 0.34, deck, g, -2.3, 0.04, D / 2 + 1.52, { r: 0.01 });
      out('sofa', -3.5, D / 2 + 0.78, 0, { seed: 5 }, 0.12); out('plant_small', -0.1, D / 2 + 0.9, 0, {}, 0.12);
      out('tree_round', lx + 1.5, oz, 0, { seed: 1 }, 0.05); out('tree_cypress', ox, bz + 1.5, 0, { seed: 2 }, 0.05); out('laundry_line', ox, D / 2 - 3.2, PI / 2, {}, 0.05);
      for (const [x, z] of [[ox, 1.4], [-1, oz + 0.1], [ox - 0.2, -0.5], [3.0, oz - 0.1]]) out('bush', x, z, x, {}, 0.05);
      out('flower_bed', 5.0, oz, 0, { seed: 4 }, 0.05); out('flower_bed', -5.6, oz + 0.05, 0, { seed: 2 }, 0.05);
      out(alt('bulletin_board', 'mailbox'), 6.0, 4.9, PI / 4); out('bike_rack', 2.2, oz - 1.0, 0, { seed: 2 }); out('mailbox', lx - 1.2, D / 2 - 2.6); out('street_lamp', lx - 2.3, 0, PI / 2);
    } else if (kind === 'village') {
      pp('camp_bed', -1.6, fz, PI); pp('bunk_bed', lx + 0.7, bz + 1.3, PI / 2); pp('rice_cooker', lx + 0.5, 1.2, PI / 2); pp('clothes_rack', 0.9, bz + 0.5); pp('water_dispenser', -0.5, bz + 0.4); pp('shoe_rack', lx + 0.75, 3.55, PI / 2); pp('parcels', lx + 0.6, -0.6, PI / 2);
      // 楼下：电线杆、小吃摊、塑料凳、电动车，没有一寸草坪
      out('utility_pole', lx - 1.9, D / 2 + 1.9, 0.3); out('utility_pole', W / 2 + 2.3, bz - 2.05, 1.2);
      out('food_cart', ox - 0.3, 2.3, PI / 2, { seed: 2 }); out(alt('plastic_stools', 'bench'), 3.3, oz - 0.1, 0.3);
      out('e_bike', -3.3, oz - 0.3, 1.2); out('e_bike', -2.4, oz - 0.2, 1.45); out('shared_bike', ox - 1.1, D / 2 + 0.8, PI / 2); out('parcels', lx - 1.2, D / 2 - 2.6); out('parcels', 0.3, oz + 0.3, 0.4);
      out('laundry_line', lx - 1.9, 3.5, PI / 2); out('tree_round', ox, bz + 1.5, 1, { seed: 2 }); for (const x of [-0.9, 1.5, 5.4]) out('plant_small', x, D / 2 + 0.75); out('traffic_cone', W / 2 + 0.9, -2);
    } else if (kind === 'park') {
      pp('sofa', -1.6, fz, PI); pp('plant_tall', lx + 0.55, bz + 0.6); pp('plant_tall', 1.35, bz + 0.55); pp('water_cooler', lx + 0.45, 1.05, PI / 2); pp('whiteboard', lx + 0.65, -2.85, PI / 2); pp('plant_small', lx + 0.45, -0.3);
      pp('standing_banner', -3.9, 3.5, 0.6, { art: art?.mat(4) });
      // 园区：修剪整齐的绿篱、导视牌、旗杆、一排共享单车、隔离桩
      out('tree_round', lx + 1.5, oz, 0, { seed: 1 }, 0.05); out('tree_round', ox, D / 2 - 3, 2, { seed: 3 }, 0.05); out(alt('flag_row', 'tree_round'), ox, bz + 1.6, PI / 2, { seed: 2 }, 0.05);
      for (let x = -0.6; x <= 5.5; x += 1.2) out('bush', x, oz + 0.15, x, {}, 0.05);
      out(alt('info_totem', 'kiosk'), 5.9, D / 2 + 0.75, PI / 4); out('bike_rack', 2.0, oz - 1.05, 0, { seed: 1 }); for (let x = -6.8; x <= 7.5; x += 2.03) out('bollard', x, oz + 1.05);
      out('planter_box', ox - 1.15, 2.6, PI / 2); out('planter_box', ox - 1.15, -1.2, PI / 2); out('bench', -3.4, oz - 1.05, PI); out('parcels', lx - 1.2, D / 2 - 2.6); out('street_lamp', lx - 2.3, 0, PI / 2);
    } else if (kind === 'stall') {
      // 档口：临街一排玻璃柜台，后墙是元器件货架和滚动屏，卷帘门外是市场的过道
      pp(alt('display_counter', 'coffee_bar'), -3.3, D / 2 - 0.72); pp(alt('display_counter', 'coffee_bar'), -1.62, D / 2 - 0.72); pp(alt('parts_shelf', 'garage_shelf'), -4.15, bz + 0.4); pp(alt('parts_shelf', 'bookshelf'), -2.72, bz + 0.4);
      if (PROPS.led_ticker) put(g, 'led_ticker', -3.43, bz + 0.02, 0, {}, 2.3);
      pp('camp_bed', lx + 0.55, -2.7, PI / 2); pp('water_dispenser', lx + 0.45, 1.05, PI / 2); pp('boxes', lx + 0.65, -0.6, PI / 2); pp('hand_truck', 1.25, -3.2, -0.5); pp('boxes', -1.1, -3.3, 0.3);
      out('hand_truck', 0.9, bz - 1.3, 0.6); out('parcels', -0.9, bz - 1.5, 0.2); out('parcels', -1.6, bz - 2.2, 1.1); out('e_bike', 2.7, bz - 1.3, 1.3); out(alt('van_delivery', 'car'), 0.4, bz - 2.45, PI / 2, { brand: '#f4f4f2' });
      // 门口：堆成山的快递、等单的骑手、小吃摊
      out('parcels', 2.0, oz, 0.2); out('parcels', 3.1, oz + 0.35, 1.0); out('parcels', 2.6, oz - 0.9, 0.5); out('hand_truck', 4.1, oz - 0.5, 0.9);
      out('e_bike', -3.2, oz - 0.2, 1.3); out('e_bike', -2.3, oz - 0.1, 1.5); out('scooter_delivery', -0.7, oz + 0.35, 1.1, { seed: 1 });
      out('food_cart', ox - 0.3, 2.4, PI / 2, { seed: 4 }); out('standing_banner', 5.8, D / 2 + 0.8, 0.5); out('shared_bike', ox - 1.1, D / 2 - 0.4, PI / 2);
      out('tree_street', ox, bz + 1.5, 0, { seed: 2 }); out('power_box', ox + 0.3, -1.6, -PI / 2); out('street_lamp', lx - 2.3, 0, PI / 2); out('traffic_cone', W / 2 + 0.9, -2);
    }
  }
  // 摆设（沿用经典版的摆法，换成高精度道具，再加几样新的）
  function decorate(g, L, bay, brand, T) {
    const { W, D, H } = L, lv = st.view.level, fz = D / 2 - 1.15, lx = -W / 2, F = 0.06;
    const pp = (name, x, z, ry = 0, o) => put(g, name, x, z, ry, { brand, seed: (x * 7 + z * 13) | 0, ...o }, F);
    const slots = []; for (let x = lx + 3.4; x < W / 2 - L.rz - 1.2; x += 3.1) slots.push(x);
    const strip = lv === 2 ? (bay ? ['sofa', 'pingpong', 'kombucha'] : ['sofa', 'tea_table', 'water_dispenser'])
        : lv === 3 ? (bay ? ['sofa', 'pingpong', 'coffee_bar', 'kombucha'] : ['sofa', 'tea_table', 'coffee_bar', 'fish_tank'])
          : lv === 4 ? (bay ? ['reception', 'sofa', 'foosball', 'pantry', 'vending', 'arcade'] : ['reception', 'sofa', 'tea_table', 'pantry', 'vending', 'fish_tank'])
            : (bay ? ['reception', 'statue_founder', 'sofa', 'pingpong', 'pantry', 'vending', 'arcade'] : ['reception', 'statue_founder', 'sofa', 'tea_table', 'pantry', 'vending', 'gong']);
    const tp = TRACK_PROP[st.view.track]; if (PROPS[tp]) strip.splice(1, 0, tp);                    // 产品赛道的标志摆设：排第二个，脸朝镜头
    strip.forEach((n, i) => { if (slots[i] != null) pp(PROPS[n] ? n : 'coffee_bar', slots[i], n === tp ? fz + 0.1 : fz, n === tp ? 0.45 : Math.PI); });
    if (lv >= 2) { pp('plant_tall', lx + 0.55, -D / 2 + 0.6); pp(bay ? 'bean_bag' : 'money_tree', lx + 0.7, D / 2 - 3.3, 0.6); pp('printer', lx + 0.6, 2.2, Math.PI / 2); pp('whiteboard', lx + 2.4, D / 2 - 3.4, 0.9); }
    if (lv >= 3) { pp('bookshelf', lx + 0.42, -D / 2 + 3.6, Math.PI / 2); pp('plant_small', W / 2 - L.rz - 0.5, D / 2 - 0.5); pp('water_cooler', lx + 0.5, 3.6, Math.PI / 2); if (bay) pp('surfboard', lx + 0.4, -D / 2 + 5.4, Math.PI / 2); else pp('lucky_cat', lx + 3.4, fz - 1.2); }
    if (lv >= 4) { pp(PROPS.glass_room ? 'glass_room' : 'meeting_table', W / 2 - 2.5, D / 2 - 2.1, Math.PI, { screen: screens[2].m }); pp('phone_booth', lx + 0.8, -D / 2 + 5.6, Math.PI / 2); pp('trophy_case', lx + 0.42, 0.9, Math.PI / 2); pp('standing_lamp', lx + 2.2, D / 2 - 0.5); pp('locker', lx + 0.4, D / 2 - 5.4, Math.PI / 2); }
    if (lv >= 5) { pp('atrium_tree', W / 2 - L.rz / 2 - 0.3, -D / 2 + 9.2); pp('fridge', lx + 0.55, 5.2, Math.PI / 2); pp('plant_tall', lx + 0.55, 6.6); }
    // 墙上：海报、时钟、空调、灭火器、霓虹标语
    const wz = -D / 2 + 0.02, we = W / 2 - L.rz - 0.4;
    if (!T.curtain) for (let i = 0, x = lx + 2.25; x + 0.5 < we && i < 4; x += T.garage ? 99 : 2.3, i++) put(g, 'poster_frame', T.garage ? lx + 1.2 : x + 1.6 - 2.3 + 1.85, wz, 0, { art: art?.mat(i + lv), seed: i }, 1.25);
    put(g, 'wall_clock', lx + 0.02, D / 2 - 4.1, Math.PI / 2, {}, H - 0.75); put(g, 'fire_extinguisher', lx + 0.2, D / 2 - 2.9, Math.PI / 2, {}, F);
    if (lv >= 2) put(g, 'ac_split', lx + 0.02, -D / 2 + 3.2, Math.PI / 2, {}, H - 0.55);
    if (lv >= 3) put(g, 'neon_slogan', lx + 0.02, 2.6, Math.PI / 2, { brand }, H - 1.15);
    // 屋外
    const ox = W / 2 + 2.15, oz = D / 2 + 2.15, tree = bay ? 'tree_palm' : 'tree_round';
    put(g, tree, -W / 2 + 1.5, oz, 0, { seed: 1 }, 0.05); put(g, tree, ox, -D / 2 + 1.5, 1, { seed: 2 }, 0.05); put(g, tree, ox, D / 2 - 3, 2, { seed: 3 }, 0.05); put(g, 'bush', ox, 1.5, 0, {}, 0.05); put(g, 'bush', -1, oz + 0.1, 1, {}, 0.05); put(g, 'flower_bed', 4.2, oz, 0, { seed: lv }, 0.05);
    put(g, 'street_lamp', W / 2 - 1, oz + 0.4, Math.PI, {}, 0); put(g, 'bench', 1.6, oz - 1.05, Math.PI, {}, 0); put(g, 'street_lamp', -W / 2 - 2.3, 0, Math.PI / 2, {}, 0);
    put(g, bay ? 'mailbox' : 'parcels', -W / 2 - 1.2, D / 2 - 2.6, 0, {}, 0); put(g, bay ? 'fire_hydrant' : 'shared_bike', ox - 1.1, D / 2 + 0.8, bay ? 0 : Math.PI / 2, {}, 0);
    if (!bay) put(g, 'e_bike', -W / 2 - 1.3, D / 2 - 4.6, 0.2, {}, 0);
    if (lv <= 2) put(g, 'traffic_cone', W / 2 + 0.9, -2, 0, {}, 0);
  }
  // 招牌：立在后墙顶上的灯箱，左边 Logo 右边公司名
  let signTex = null, signImg = null, signMat = null;
  function buildSign(parent) {
    const L = st.L, lv = st.view.level, gab = lv === 1 && /garage|house/.test(st.kind);                // 带山墙的房子：招牌小一号，挂在山墙正中
    const w = gab ? 3.4 : [0, 4.2, 5, 6, 7, 9][lv] || 4.2, h = w * 0.24, g = k.group(parent, gab ? -0.15 : -L.W / 2 + 2.6 + w / 2, L.H + 0.08, -L.D / 2 - 0.15), brand = st.view.brand || '#ff6b4a';
    k.box(w + 0.3, h + 0.3, 0.28, lv >= 3 ? '#20242b' : '#7b5a3c', g, 0, h / 2 + 0.55, 0, { r: 0.05, rough: 0.5, metal: lv >= 3 ? 0.6 : 0, tex: lv >= 3 ? 'metal' : 'wood' });
    k.box(w + 0.42, 0.08, 0.36, brand, g, 0, 0.42, 0, { rough: 0.5, tex: 'paint' }); for (const sx of [-1, 1]) k.box(0.12, 0.5, 0.12, '#4a5160', g, sx * (w / 2 - 0.5), 0.2, 0, { metal: 0.6, rough: 0.5 });
    for (let i = 0; i < 3; i++) { const x = (i - 1) * w * 0.33; k.tube([[x, h + 0.72, 0.1], [x, h + 0.95, 0.3], [x, h + 0.82, 0.52]], 0.018, '#3a4048', g, 0, 0, 0); k.box(0.14, 0.07, 0.1, '#fff1cf', g, x, h + 0.8, 0.55, { glow: '#ffe2a8', glowK: 0.2, night: 2.2 }); }      // 招牌射灯
    const c = document.createElement('canvas'); c.width = 1024; c.height = 246; signTex = own(new THREE.CanvasTexture(c)); signTex.colorSpace = THREE.SRGBColorSpace; signTex.anisotropy = 8;
    signMat = own(new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.3, roughness: 0.5 }));
    k.put(k.geo(`sign${w}`, () => new THREE.PlaneGeometry(w, h)), signMat, g, 0, h / 2 + 0.55, 0.15, { cast: false }); st.signKey = ''; drawSign();
  }
  function drawSign() {
    const v = st.view, key = `${v.sign}|${v.logo}|${v.brand}`;
    if (!signTex || key === st.signKey) return; st.signKey = key;
    const x = signTex.image.getContext('2d'), paint = img => {
      x.fillStyle = '#fffdf7'; x.fillRect(0, 0, 1024, 246); x.fillStyle = v.brand || '#ff6b4a'; x.fillRect(0, 228, 1024, 18);
      const name = v.sign || tr('炼丹大亨'), lw = img ? 200 : 0; let fs = 132; x.font = `900 ${fs}px "PingFang SC","Microsoft YaHei",sans-serif`;
      while (x.measureText(name).width > 1024 - lw - 90 && fs > 40) { fs -= 6; x.font = `900 ${fs}px "PingFang SC","Microsoft YaHei",sans-serif`; }
      const tw = x.measureText(name).width, x0 = (1024 - tw - lw) / 2;
      if (img) x.drawImage(img, x0, 28, 170, 170);
      x.fillStyle = '#1e2233'; x.textBaseline = 'middle'; x.fillText(name, x0 + lw, 116); signTex.needsUpdate = true;
    };
    paint(null);
    if (v.logo) { const img = new Image(); signImg = img; img.onload = () => { if (signImg === img && st.signKey === key) paint(img); }; img.src = v.logo; }
  }

  // ───────── 多层办公楼（5 档以上）─────────
  // 每层都是一个剖面房间（只有后墙和左墙）。看某一层时，它下面的楼层是玻璃幕墙，上面的楼层先拿掉；
  // 「全楼」总览时每层都是幕墙，楼顶立着招牌，每层挂一块部门牌。楼右侧有一部观光电梯，换楼层时镜头跟着它上下
  const WORK = { res: 1, eng: 1, ops: 1, biz: 1, legal: 1 };
  const ZONE_PROPS = {
    res: () => ['whiteboard', 'bookshelf', 'standing_desk'],
    eng: bay => (bay ? ['kombucha', 'bean_bag', 'pingpong'] : ['tea_table', 'bean_bag', 'water_dispenser']),
    ops: () => ['sofa', 'coffee_table', 'phone_booth'],
    biz: bay => ['coffee_bar', 'sofa', bay ? 'surfboard' : 'money_tree'],
    legal: () => ['bookshelf', 'locker', 'printer'],
  };
  // 工位前面那一片：各部门的特色区
  const MID_PROPS = {
    res: () => ['whiteboard', 'meeting_table', 'whiteboard'],
    eng: bay => ['standing_desk', 'foosball', bay ? 'arcade' : 'tea_table'],
    ops: () => ['phone_booth', 'sofa', 'coffee_table'],
    biz: () => ['meeting_table', 'plant_tall', 'sofa'],
    legal: () => ['bookshelf', 'meeting_table', 'bookshelf'],
  };
  const mixHex = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
  const floorOfRole = role => { const i = tw.plan.findIndex(f => f.includes(role)); return i >= 0 ? i : 0; };
  const towerTheme = () => themeOf(st.view.region, st.view.level === 5 ? 5 : 9);
  const yOf = p => (p >= tw.N ? 0.45 * (tw.N * tw.FH + 1.5) : 0.3 * st.L.H + p * tw.FH);      // 镜头对准的高度：某层（可以是小数）或者整栋楼的腰部

  function buildTower() {
    const v = st.view, L = st.L, { W, D, H } = L, bay = v.region === 'bay', brand = v.brand || '#ff6b4a', plan = FLOOR_PLANS[v.level];
    Object.assign(tw, { on: true, plan, N: plan.length, FH: H + 0.5, EZ: D / 2 - 3.2, F: plan.map((depts, i) => ({ i, y: i * (H + 0.5), depts })), open: -1, target: -1, cut: plan.length, ride: null, labelKey: '' });
    tw.res = floorOfRole('res'); tw.boss = plan.findIndex(f => f.includes('ceo')); if (tw.boss < 0) tw.boss = tw.N - 1;
    for (const F of tw.F) layoutFloor(F);
    // 招牌贴图：楼顶大招牌和门口的立牌共用一张
    const c = document.createElement('canvas'); c.width = 1024; c.height = 246; signTex = own(new THREE.CanvasTexture(c)); signTex.colorSpace = THREE.SRGBColorSpace; signTex.anisotropy = 8;
    signMat = own(new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.3, roughness: 0.5 })); st.signKey = '';
    // 地块和屋外
    const g = k.group();
    towerSite(g, L, bay, brand);
    const b = k.bake(g); bakes.push(b); roomG.add(b);
    for (const F of tw.F) { F.shell = buildShell(F); F.rail = buildRail(F); }
    buildRoof(bay, brand); buildCar(); buildLabels();
    beaconMat = own(new THREE.MeshStandardMaterial({ color: 0xff4d4d, emissive: 0xff3030, emissiveIntensity: 0.25, roughness: 0.4 }));
    tw.beacon = new THREE.Mesh(k.geo('beacon', () => new THREE.CylinderGeometry(0.13, 0.15, 0.2, 12)), beaconMat); floorsG.add(tw.beacon);
    // 创始人在顶楼（总部是总裁办）踱步
    const by = tw.F[tw.boss].y;
    pace = [new THREE.Vector3(-W / 2 + 1.25, by, -D / 2 + 1.9), new THREE.Vector3(-W / 2 + 1.25, by, Math.min(D / 2 - 3.4, 1.4))];
    door.set(W / 2 + 0.4, 0, tw.EZ);
    drawSign();
    const dx0 = -W / 2 + 2.6, dz0 = -D / 2 + 2.4, deskW = (L.cols - 1) * L.px, deskD = (L.rows - 1) * L.pz;
    lampA.position.set(dx0 + deskW * 0.25, H + 0.6, dz0 + deskD / 2); lampB.position.set(dx0 + deskW * 0.8, H + 0.6, dz0 + deskD / 2);
    buildCore(); buildRacks();
    furnaceG.position.y = rackG.position.y = tw.F[tw.res].y; fireLight.position.y += tw.F[tw.res].y;
  }
  // 每层的工位怎么分：几个部门按人多人少分工位列；研究院排在最右，挨着机房和丹炉
  function layoutFloor(F) {
    const L = st.L, { W, D } = L, work = F.depts.filter(d => WORK[d]), dx0 = -W / 2 + 2.6, dz0 = -D / 2 + 2.4;
    F.zones = []; F.seats = {}; F.stands = {};
    if (!work.length) return;
    const wgt = d => (d === 'res' || d === 'eng' ? 1.4 : d === 'ops' ? 1.15 : 1), tot = work.reduce((a, d) => a + wgt(d), 0);
    let c0 = 0;
    work.forEach((d, j) => {
      const n = j === work.length - 1 ? L.cols - c0 : Math.max(2, Math.round(L.cols * wgt(d) / tot)), xa = dx0 + c0 * L.px - 1.0, xb = dx0 + (c0 + n - 1) * L.px + 1.0;
      const seats = [], stands = [];
      for (let r = 0; r < L.rows; r++) for (let c = c0; c < c0 + n; c++) seats.push({ x: dx0 + c * L.px, z: dz0 + r * L.pz - 0.5, dz: dz0 + r * L.pz });
      for (let i = 0; i < 2 * n; i++) stands.push({ x: xa + 1.0 + (i % n) * L.px, z: D / 2 - 1.9 - (i / n | 0) * 0.9 });
      F.zones.push({ dept: d, c0, n, xa, xb }); F.seats[d] = seats; F.stands[d] = stands; c0 += n;
    });
  }
  // 地块、草坪、门口立牌、树和路灯（右边给电梯让出位置）
  function towerSite(g, L, bay, brand) {
    const { W, D } = L, ox = W / 2 + 2.15, oz = D / 2 + 2.15, tree = bay ? 'tree_palm' : 'tree_round';
    k.box(W + 6.8, 0.5, D + 6.8, '#c4c7cc', g, 0, -0.25, 0, { r: 0.06, rough: 0.85, tex: 'concrete', pat: ['tile', 0.9, 0.24, 0.07] });
    const lawn = k.mat(bay ? '#7fb56a' : '#6fb564', { rough: 0.95, tex: 'grass' });
    k.box(W + 5.6, 0.1, 1.5, lawn, g, 0.3, 0.02, D / 2 + 2.15, { r: 0.04, cast: false }); k.box(1.5, 0.1, D + 4.1, lawn, g, W / 2 + 2.15, 0.02, -0.45, { r: 0.04, cast: false });
    put(g, tree, -W / 2 + 1.5, oz, 0, { seed: 1 }, 0.05); put(g, tree, ox, -D / 2 + 1.5, 1, { seed: 2 }, 0.05); put(g, tree, ox, -1.2, 2, { seed: 3 }, 0.05); put(g, 'bush', ox, D / 2 + 0.3, 0, {}, 0.05); put(g, 'bush', -1, oz + 0.1, 1, {}, 0.05); put(g, 'flower_bed', 4.2, oz, 0, { seed: 7 }, 0.05);
    put(g, 'street_lamp', W / 2 - 1, oz + 0.4, Math.PI, {}, 0); put(g, 'bench', 1.6, oz - 1.05, Math.PI, {}, 0); put(g, 'street_lamp', -W / 2 - 2.3, 0, Math.PI / 2, {}, 0);
    put(g, bay ? 'mailbox' : 'parcels', -W / 2 - 1.2, D / 2 - 2.6, 0, {}, 0); if (!bay) put(g, 'e_bike', -W / 2 - 1.3, D / 2 - 4.6, 0.2, {}, 0);
    put(g, 'bike_rack', W / 2 + 2.2, D / 2 - 6.4, Math.PI / 2, {}, 0);
    // 门口的石座立牌：公司名
    const w = 3.6, sg = k.group(g, -W / 2 - 1.9, 0, D / 2 + 1.7, Math.PI / 4);
    k.box(w + 0.5, 0.55, 0.7, '#8e8a83', sg, 0, 0.28, 0, { r: 0.05, rough: 0.85, tex: 'stone' });
    signPanel(sg, 0, 0.62, 0.05, w);
  }
  // 招牌面板：深色金属框 + 共用的招牌贴图
  function signPanel(parent, x, y, z, w, ry = 0) {
    const h = w * 0.24, g = k.group(parent, x, y, z, ry);
    k.box(w + 0.3, h + 0.3, 0.26, '#20242b', g, 0, h / 2, -0.12, { r: 0.05, rough: 0.5, metal: 0.6, tex: 'metal' });
    k.put(k.geo(`sign${w}`, () => new THREE.PlaneGeometry(w, h)), signMat, g, 0, h / 2, 0.02, { cast: false });
    return g;
  }
  // 不在看的楼层：四面玻璃幕墙 + 白色楼板腰线。玻璃夜里透出暖光
  function buildShell(F) {
    const { W, D } = st.L, h = tw.FH - 0.5, cy = 0.05 + h / 2, g = k.group();
    const glass = k.mat('#55707f', { rough: 0.06, metal: 0.72, env: 1.35, glow: '#ffd9a6', glowK: 0, night: 0.45 }), band = k.mat('#e7e3da', { rough: 0.75, tex: 'concrete' }), mull = k.mat('#2a3038', { rough: 0.45, metal: 0.6, tex: 'metal' });
    k.box(W + 0.36, 0.5, D + 0.36, band, g, 0, -0.2, 0);
    k.box(W, h, 0.1, glass, g, 0, cy, D / 2 + 0.05, { cast: false }); k.box(W, h, 0.1, glass, g, 0, cy, -D / 2 - 0.05, { cast: false });
    k.box(0.1, h, D, glass, g, W / 2 + 0.05, cy, 0, { cast: false }); k.box(0.1, h, D, glass, g, -W / 2 - 0.05, cy, 0, { cast: false });
    const nx = Math.round(W / 1.6), nz = Math.round(D / 1.6);
    for (let i = 0; i <= nx; i++) { const x = -W / 2 + i * W / nx; k.box(0.08, h, 0.16, mull, g, x, cy, D / 2 + 0.06); k.box(0.08, h, 0.16, mull, g, x, cy, -D / 2 - 0.06); }
    for (let i = 0; i <= nz; i++) { const z = -D / 2 + i * D / nz; k.box(0.16, h, 0.08, mull, g, W / 2 + 0.06, cy, z); k.box(0.16, h, 0.08, mull, g, -W / 2 - 0.06, cy, z); }
    const b = k.bake(g); b.position.y = F.y; bakes.push(b); floorsG.add(b); return b;
  }
  // 观光电梯的导轨：每层一段，跟着楼层一起显隐
  function buildRail(F) {
    const { W } = st.L, g = k.group(), x = W / 2 + 0.8, z = tw.EZ, m = k.mat('#59616b', { rough: 0.4, metal: 0.8, tex: 'metal' });
    for (const dz of [-0.92, 0.92]) k.box(0.12, tw.FH, 0.12, m, g, x + 0.62, tw.FH / 2 - 0.45, z + dz);
    k.box(0.06, 0.12, 1.96, m, g, x + 0.62, tw.FH - 0.5, z); k.box(0.7, 0.08, 0.12, m, g, x + 0.3, tw.FH - 0.5, z - 0.92); k.box(0.7, 0.08, 0.12, m, g, x + 0.3, tw.FH - 0.5, z + 0.92);
    const b = k.bake(g); b.position.y = F.y; bakes.push(b); floorsG.add(b); return b;
  }
  // 楼顶：顶板、女儿墙、设备、大招牌；总部还有停机坪和屋顶花园
  function buildRoof(bay, brand) {
    const { W, D } = st.L, g = k.group(), band = k.mat('#e7e3da', { rough: 0.75, tex: 'concrete' }), lv = st.view.level;
    k.box(W + 0.36, 0.5, D + 0.36, band, g, 0, -0.2, 0); k.box(W - 0.2, 0.04, D - 0.2, '#9da3aa', g, 0, 0.07, 0, { rough: 0.9, tex: 'concrete', cast: false });
    for (const [w, d, x, z] of [[W + 0.36, 0.25, 0, D / 2 + 0.05], [W + 0.36, 0.25, 0, -D / 2 - 0.05], [0.25, D + 0.36, W / 2 + 0.05, 0], [0.25, D + 0.36, -W / 2 - 0.05, 0]]) k.box(w, 0.75, d, band, g, x, 0.4, z);
    k.box(2.2, 2.2, 2.4, '#d5d1c7', g, W / 2 - 0.4, 1.1, tw.EZ, { rough: 0.8, tex: 'concrete' });            // 电梯机房
    const sw = Math.min(10, W * 0.42); signPanel(g, -W * 0.12, 0.85, -D / 2 + 0.55, sw);
    for (const sx of [-1, 1]) k.box(0.12, 0.9, 0.12, '#4a5160', g, -W * 0.12 + sx * (sw / 2 - 0.6), 0.45, -D / 2 + 0.4, { metal: 0.6, rough: 0.5 });
    const pp = (name, x, z, ry = 0, o) => put(g, PROPS[name] ? name : 'roof_vent', x, z, ry, { brand, seed: (x * 7 + z * 13) | 0, ...o }, 0.09);
    if (lv >= 8) { pp('helipad', W / 2 - 5.2, -D / 2 + 5.8); pp('roof_garden', -W / 2 + 3.4, D / 2 - 2.6); pp('antenna_mast', -W / 2 + 1.2, -D / 2 + 1.2); pp('roof_hvac', -W / 2 + 4.5, -D / 2 + 4.4); }
    else { pp('roof_hvac', W / 2 - 4.6, -D / 2 + 3.8); pp('water_tank', -W / 2 + 2.0, -D / 2 + 2.4); pp('ac_unit', 1.5, D / 2 - 1.6); pp('ac_unit', 3.2, D / 2 - 1.6); if (lv >= 7) pp('solar_array', -W / 2 + 4.8, D / 2 - 3.2); else pp('roof_vent', -2, D / 2 - 2.4); }
    const b = k.bake(g); b.position.y = tw.N * tw.FH; bakes.push(b); floorsG.add(b); tw.roof = b;
  }
  function buildCar() {
    const { car, shell, doors } = buildElevatorCabin(k, brand());
    const baked = k.bake(shell); shell.removeFromParent(); bakes.push(baked); car.add(baked);
    tw.doors = doors; tw.car = car;
    car.position.set(st.L.W / 2 + 0.8, 0, tw.EZ); floorsG.add(car);
  }
  const brand = () => st.view.brand || '#ff6b4a';
  // 总览时每层挂一块牌子：楼层号、部门、人数
  function labelTex(text, sub, color) {
    const c = document.createElement('canvas'); c.width = 640; c.height = 132; const x = c.getContext('2d');
    x.fillStyle = 'rgba(14,18,26,0.86)'; x.beginPath(); x.roundRect(4, 4, 632, 124, 22); x.fill(); x.strokeStyle = 'rgba(242,196,109,0.55)'; x.lineWidth = 3; x.stroke();
    x.fillStyle = color; x.fillRect(4, 26, 10, 80);
    x.textBaseline = 'middle'; x.font = '900 60px "PingFang SC","Microsoft YaHei",sans-serif'; x.fillStyle = '#f2c46d'; x.fillText(text.split(' ')[0], 34, 68);
    x.fillStyle = '#f4f1ea'; x.font = '700 50px "PingFang SC","Microsoft YaHei",sans-serif'; x.fillText(text.split(' ').slice(1).join(' '), 150, 68, sub ? 260 : 460);
    if (sub) { x.font = '500 40px "PingFang SC","Microsoft YaHei",sans-serif'; x.fillStyle = '#aeb6c2'; x.textAlign = 'right'; x.fillText(sub, 612, 70); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function buildLabels() {
    const { W, D } = st.L;
    tw.labels = tw.F.map(F => {
      const s = new THREE.Sprite(own(new THREE.SpriteMaterial({ depthTest: false, transparent: true, toneMapped: false })));
      // 挂在楼的左前角外面，往左伸出去
      s.scale.set(9.2, 1.9, 1); s.center.set(1, 0.5); s.position.set(-W / 2 - 0.8, F.y + tw.FH * 0.5, D / 2 + 0.8); s.renderOrder = 25; s.layers.set(FX); s.visible = false; floorsG.add(s); return s;
    });
    tw.labelKey = '';
  }
  function updateLabels() {
    const staff = st.view.staff || [], n = tw.F.map(() => 0);
    for (const s of staff) n[floorOfRole(s.role)]++;
    const key = n.join(',');
    if (key === tw.labelKey) return; tw.labelKey = key;
    tw.F.forEach((F, i) => {
      const names = F.depts.map(d => DEPTS[d]?.short || d).join(' · '), top = DEPTS[F.depts.find(d => WORK[d]) || F.depts[0]], s = tw.labels[i];
      const sub = F.depts.includes('ceo') || i === tw.boss ? (n[i] ? fill('{人数} 人 · 老板', { 人数: n[i] }) : tr('老板')) : F.depts.every(d => !WORK[d]) ? '' : fill('{人数} 人', { 人数: n[i] });
      s.material.map?.dispose(); s.material.map = labelTex(`${i + 1}F ${names}`, sub, top?.color || '#c9a86a'); s.material.needsUpdate = true;
    });
  }
  // 某一层的内景：第一次去的时候才盖（总览、电梯路过的楼层只要幕墙）
  function floorInner(F) {
    if (F.inner) return F.inner;
    const v = st.view, L = st.L, { W, D, H } = L, T = towerTheme(), bay = v.region === 'bay', br = brand(), g = k.group(), lx = -W / 2, res = F.depts.includes('res');
    const pp = (name, x, z, ry = 0, o, y = 0.06) => put(g, PROPS[name] ? name : 'plant_small', x, z, ry, { brand: br, seed: (x * 7 + z * 13 + F.i * 31) | 0, ...o }, y);
    k.box(W + 0.4, 0.06, D + 0.4, '#9a958a', g, -0.05, 0.0, -0.05, { rough: 0.9, tex: 'concrete' });
    k.box(W, 0.05, D, T.floor[0], g, 0, 0.03, 0, { ...T.floor[1], cast: false });
    // 后墙、左墙：落地窗；1 楼左墙开大门
    const winY0 = T.curtain ? 0.3 : 0.95, winY1 = T.curtain ? H - 0.4 : Math.min(2.5, H - 0.5), backEnd = res ? W / 2 - L.rz - 0.3 : W / 2 - 3.6, back = [], left = [];
    for (let x = -W / 2 + 1.1; x + 1.5 < backEnd; x += T.curtain ? 1.75 : 2.3) back.push({ a: x, b: x + 1.5, y0: winY0, y1: winY1, glass: true });
    const bw = wall(g, W + 0.3, H, T, back, {}); bw.position.set(-0.15, 0, -D / 2 - 0.15);
    if (F.i === 0) left.push({ a: -D / 2 + 1.1, b: -D / 2 + 2.5, y0: 0, y1: 2.25 });
    for (let a = D / 2 - 3.2; a > -D / 2 + 4.6; a -= 2.3) left.push({ a, b: a + 1.7, y0: winY0, y1: winY1, glass: true });
    const lw = wall(g, D + 0.3, H, T, left, {}); lw.rotation.y = Math.PI / 2; lw.position.set(-W / 2 - 0.15, 0, 0.15);
    k.box(0.34, H + 0.06, 0.34, T.wall, g, -W / 2 - 0.15, H / 2, -D / 2 - 0.15, { rough: 0.9, tex: 'plaster' });
    if (F.i === 0) { k.box(0.06, 2.2, 1.3, '#8a623f', g, -W / 2 - 0.5, 1.1, D / 2 - 1.05, { ry: 0.5, rough: 0.6, tex: 'wood', r: 0.01 }); k.box(0.7, 0.025, 1.4, br, g, -W / 2 + 0.55, 0.068, D / 2 - 1.8, { rough: 0.95, tex: 'carpet', cast: false }); }
    // 电梯口：地上一块金属踏板，旁边一根带指示灯的召唤柱
    k.box(1.5, 0.03, 1.8, '#9aa3ad', g, W / 2 - 0.75, 0.07, tw.EZ, { metal: 0.6, rough: 0.4, tex: 'metal', cast: false });
    k.box(0.12, 1.2, 0.12, '#2f353d', g, W / 2 - 0.12, 0.62, tw.EZ - 1.1, { metal: 0.6, rough: 0.4 }); k.box(0.07, 0.16, 0.02, '#ffd27a', g, W / 2 - 0.12, 1.08, tw.EZ - 1.03, { glow: '#ffd27a', glowK: 0.6, night: 2 });
    // 墙上的东西
    pp('wall_clock', lx + 0.02, D / 2 - 4.1, Math.PI / 2, {}, H - 0.75); pp('fire_extinguisher', lx + 0.2, D / 2 - 2.9, Math.PI / 2);
    if (F.depts.includes('ops') || res) pp('tv_wall', lx + 0.02, -0.6, Math.PI / 2, { screen: screens[1].m }, 1.05);
    if (F.depts.includes('eng')) pp('neon_slogan', lx + 0.02, 2.6, Math.PI / 2, {}, H - 1.15);
    pp('ac_split', lx + 0.02, -D / 2 + 3.2, Math.PI / 2, {}, H - 0.55);
    if (F.depts.includes('lobby') && !F.zones.length) lobbyFloor(g, pp, bay);
    else if (F.depts.includes('ceo')) ceoFloor(g, pp, bay);
    else {
      for (const z of F.zones) deptZone(g, F, z, pp, T, bay);
      const rx = W / 2 - L.rz / 2;
      if (F.depts.includes('lobby')) { pp('reception', W / 2 - 2.9, D / 2 - 1.3, Math.PI); pp('plant_tall', W / 2 - 0.6, D / 2 - 0.6); pp('sofa', W / 2 - 3.0, -D / 2 + 3.4, 0); pp('coffee_table', W / 2 - 3.0, -D / 2 + 2.3); pp('pantry', rx - 0.4, -D / 2 + 0.5); }
      else if (!res) { pp('pantry', rx - 0.6, -D / 2 + 0.5); pp('vending', W / 2 - 0.75, -D / 2 + 0.5); if (F.depts.includes('biz')) pp('glass_room', rx, -D / 2 + 3.6, 0, { screen: screens[2].m }); else { pp('sofa', rx, -D / 2 + 3.6, 0); pp('coffee_table', rx, -D / 2 + 2.6); pp('plant_tall', W / 2 - 0.6, -D / 2 + 4.6); } }
    }
    const b = k.bake(g); b.position.y = F.y; b.visible = false; bakes.push(b); floorsG.add(b); F.inner = b;
    return b;
  }
  // 一个部门的地盘：工位、部门色的地毯、后墙上的部门牌、前排的摆设
  function deptZone(g, F, z, pp, T, bay) {
    const L = st.L, { D } = L, dz0 = -D / 2 + 2.4, deskD = (L.rows - 1) * L.pz, d = z.dept, col = DEPTS[d].color, br = brand();
    for (const s of F.seats[d]) {
      const n = Math.abs(Math.round(s.x * 3 + s.dz * 7 + F.i * 5));
      if (!put(g, 'desk_set', s.x, s.dz + 0.18, 0, { seed: n, brand: br, screen: screens[n % 4 === 1 ? 2 : n % 4 === 3 ? 3 : 0].m }, 0.06)) k.box(1.5, 0.07, 0.72, '#e6c9a0', g, s.x, 0.8, s.dz + 0.18, { r: 0.03, tex: 'wood' });
      put(g, 'office_chair', s.x, s.dz - 0.52, 0, { brand: br, seed: n }, 0.06);
      if (n % 3 === 1) put(g, 'desk_lamp', s.x - 0.55, s.dz + 0.35, 0.6, { brand: br }, 0.8);
    }
    const cx = (z.xa + z.xb) / 2;
    k.box(z.xb - z.xa + 0.5, 0.03, deskD + 2.9, mixHex(T.carpet || '#6a819d', col, 0.3), g, cx, 0.065, dz0 + deskD / 2 - 0.1, { r: 0.012, rough: 0.98, tex: 'carpet', cast: false });
    deptSign(g, d, cx, L.H - 0.42, -D / 2 + 0.03);
    const list = ZONE_PROPS[d](bay), slots = [];
    for (let x = z.xa + 1.3; x < z.xb - 0.6; x += 2.9) slots.push(x);
    list.forEach((n, i) => { if (slots[i] != null) pp(n, slots[i], D / 2 - 1.15, Math.PI); });
    // 特色区：工位前面一块部门色地毯，上面摆白板、会议桌、站立桌、桌游……
    const zm = dz0 + deskD + 2.9, mid = MID_PROPS[d](bay), ms = [];
    for (let x = z.xa + 1.8; x < z.xb - 1.2; x += 3.3) ms.push(x);
    if (ms.length) k.box(Math.min(z.xb - z.xa, ms.length * 3.3) + 0.2, 0.025, 3.0, mixHex('#e8e2d6', col, 0.22), g, (ms[0] + ms[ms.length - 1]) / 2, 0.06, zm, { r: 0.01, rough: 0.98, tex: 'carpet', cast: false });
    mid.forEach((n, i) => { if (ms[i] != null) pp(n, ms[i], zm, 0); });
    if (d === 'res') pp('bookshelf', -L.W / 2 + 0.42, -D / 2 + 3.6, Math.PI / 2);
    if (d === 'legal') pp('locker', -L.W / 2 + 0.4, D / 2 - 5.4, Math.PI / 2);
  }
  // 部门牌：深色底、部门色竖条、图标和名字，夜里自己发光
  function deptSign(g, d, x, y, z) {
    const D_ = DEPTS[d], c = document.createElement('canvas'); c.width = 512; c.height = 128; const x2 = c.getContext('2d');
    x2.fillStyle = '#1b2029'; x2.fillRect(0, 0, 512, 128); x2.fillStyle = D_.color; x2.fillRect(0, 0, 14, 128);
    x2.textBaseline = 'middle'; x2.font = '64px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; x2.fillText(D_.icon, 34, 70);
    x2.font = '900 58px "PingFang SC","Microsoft YaHei",sans-serif'; x2.fillStyle = '#f4f1ea'; x2.fillText(D_.name, 122, 68, 368);
    const t = own(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const m = own(new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.3, roughness: 0.5 })); k.nightMats.push([m, 0.3, 0.95]);
    k.box(2.52, 0.72, 0.05, '#2a2f36', g, x, y, z + 0.02, { metal: 0.5, rough: 0.5 });
    k.put(k.geo('deptsign', () => new THREE.PlaneGeometry(2.4, 0.6)), m, g, x, y, z + 0.055, { cast: false });
  }
  // 总部 1 楼：整层大堂
  function lobbyFloor(g, pp, bay) {
    const { W, D } = st.L, lx = -W / 2;
    signPanel(g, 0, 1.25, -D / 2 + 0.06, 6.4);                                                       // 背景墙上的公司大招牌
    pp('reception', 0, D / 2 - 3.4, Math.PI); pp('statue_founder', lx + 3.2, -D / 2 + 3.2); pp('atrium_tree', W / 2 - 3.6, -D / 2 + 2.8);
    pp('rug', lx + 4.8, D / 2 - 2.4, 0); pp('sofa', lx + 3.4, D / 2 - 1.3, Math.PI); pp('sofa', lx + 6.2, D / 2 - 1.3, Math.PI); pp('coffee_table', lx + 4.8, D / 2 - 2.6);
    pp('trophy_case', lx + 0.42, -0.6, Math.PI / 2); pp('tv_wall', lx + 0.02, 1.9, Math.PI / 2, { screen: screens[1].m }, 1.05);
    for (const [x, z] of [[lx + 1.0, -D / 2 + 0.6], [-2.4, -D / 2 + 0.6], [2.4, -D / 2 + 0.6], [lx + 0.7, D / 2 - 0.6]]) pp('plant_tall', x, z);
    pp(bay ? 'kombucha' : 'fish_tank', W / 2 - 2.2, -0.4, -Math.PI / 2); pp(bay ? 'arcade' : 'gong', W / 2 - 4.6, D / 2 - 1.2, Math.PI); pp('bench', -2.2, -D / 2 + 4.4, 0);
    for (const x of [-1.5, 0, 1.5]) { k.box(0.14, 1.0, 0.9, '#2f353d', g, x, 0.55, 0.6, { metal: 0.6, rough: 0.4 }); k.box(0.6, 0.5, 0.03, k.mat('#c4e3ef', { alpha: 0.3, rough: 0.05, env: 1.5 }), g, x + 0.38, 0.8, 0.6, { cast: false }); }   // 闸机
  }
  // 总部顶楼：总裁办 + 董事会会议室 + 会客区
  function ceoFloor(g, pp, bay) {
    const { W, D } = st.L, lx = -W / 2;
    pp('glass_room', W / 2 - 2.8, -D / 2 + 2.2, 0, { screen: screens[2].m });                         // 董事会会议室
    pp('rug', -3.6, -D / 2 + 3.1, 0); pp('desk_set', -3.6, -D / 2 + 3.2, 0, { seed: 7, screen: screens[0].m }); pp('office_chair', -3.6, -D / 2 + 2.6, 0, { seed: 7 });
    pp('bookshelf', -5.6, -D / 2 + 0.45, 0); pp('bookshelf', -1.6, -D / 2 + 0.45, 0); pp('standing_lamp', -6.9, -D / 2 + 1.2);
    pp('meeting_table', 2.2, 0.6, 0); pp('trophy_case', lx + 0.42, 0.4, Math.PI / 2); pp('statue_founder', lx + 2.8, D / 2 - 3.4);
    pp('rug', lx + 5.2, D / 2 - 2.3, 0); pp('sofa', lx + 3.8, D / 2 - 1.3, Math.PI); pp('sofa', lx + 6.6, D / 2 - 1.3, Math.PI); pp('coffee_table', lx + 5.2, D / 2 - 2.5);
    pp('coffee_bar', W / 2 - 3.6, D / 2 - 1.1, Math.PI); pp('plant_tall', lx + 0.6, D / 2 - 0.6); pp('plant_tall', W / 2 - 0.6, -0.4); pp('plant_tall', 0.4, -D / 2 + 0.6);
    pp(bay ? 'surfboard' : 'money_tree', 2.0, -D / 2 + 0.6); pp(bay ? 'arcade' : 'lucky_cat', W / 2 - 6.2, D / 2 - 1.2, Math.PI); pp(bay ? 'kombucha' : 'gong', -1.0, D / 2 - 1.0, Math.PI);
  }
  // 哪些楼层看得见：电梯所在高度（cut）以下是幕墙，正在看的那层打开，上面的拿掉
  function towerVis() {
    const c = tw.cut, open = tw.ride ? -1 : tw.open;
    for (const F of tw.F) {
      const shown = F.i <= c + 0.02;
      F.shell.visible = shown && F.i !== open;
      if (F.inner) F.inner.visible = F.i === open;
      F.rail.visible = shown || F.i === open;
    }
    tw.roof.visible = open < 0 && c >= tw.N - 0.02;
    const lbl = open < 0 && !tw.ride && tw.target < 0;
    for (const s of tw.labels) s.visible = lbl;
    furnaceG.visible = rackG.visible = open === tw.res;
    const y = open >= 0 ? tw.F[open].y + st.L.H + 0.16 : tw.N * tw.FH + 0.66;
    tw.beacon.position.set(-st.L.W / 2 + 0.2, y, -st.L.D / 2 + 0.2);
  }
  // 坐电梯去某一层（-1 = 全楼）。instant：刚搬进来，直接摆好不播动画
  function goFloor(target, instant) {
    target = clamp(target | 0, -1, tw.N - 1);
    const N = tw.N, from = tw.ride ? tw.cut : tw.open >= 0 ? tw.open : N, to = target >= 0 ? target : N, L = st.L;
    if (target >= 0) floorInner(tw.F[target]);
    tw.target = target;
    tw.frame = target >= 0 ? { W: L.W, D: L.D, H: L.H } : { W: L.W, D: L.D, H: N * tw.FH + 1.5 };
    stage.setFrame(tw.frame);
    if (instant) { tw.ride = null; tw.cut = to; tw.open = target; tw.camY = yOf(to); arrive(); }
    else { const y0 = tw.ride ? tw.camY : yOf(from); tw.open = -1; tw.ride = { from, to, t: 0, dur: clamp(0.55 + 0.17 * Math.abs(to - from), 0.6, 1.5), y0, y1: yOf(to) }; tw.camY = y0; tw.doorT = 0; }
    stage.setLift(tw.camY - 0.3 * tw.frame.H);
    towerVis(); queueFloors();
  }
  // 其余楼层的内景排队，闲下来时一层一层盖好，下次去就不用等
  function queueFloors() { const c = tw.target >= 0 ? tw.target : tw.N; tw.queue = tw.F.filter(F => !F.inner).sort((a, b) => Math.abs(a.i - c) - Math.abs(b.i - c)).map(F => F.i); tw.qT = 0.6; }
  function towerStep(dt) {
    const R = tw.ride;
    if (R) {
      R.t += dt; const u = Math.min(1, R.t / R.dur), e = easeIO(u);
      tw.cut = lerp(R.from, R.to, e); tw.camY = lerp(R.y0, R.y1, e);
      if (u >= 1) { tw.ride = null; tw.cut = R.to; tw.open = tw.target; tw.bounce = 0.0001; tw.doorT = tw.open >= 0 ? 1.7 : 0; arrive(); }
    } else if (tw.queue.length && (tw.qT -= dt) <= 0) { floorInner(tw.F[tw.queue.shift()]); tw.qT = 0.45; }
    let y = tw.camY;
    if (tw.bounce > 0) { tw.bounce += dt; y += Math.exp(-tw.bounce * 7) * Math.sin(tw.bounce * 22) * 0.08; if (tw.bounce > 0.9) tw.bounce = 0; }
    stage.setLift(y - 0.3 * tw.frame.H);
    tw.car.position.y = clamp(tw.cut, 0, tw.N - 1) * tw.FH;
    if (tw.doorT > 0) { tw.doorT = Math.max(0, tw.doorT - dt); const o = tw.doorT > 1.35 ? (1.7 - tw.doorT) / 0.35 : tw.doorT > 0.45 ? 1 : tw.doorT / 0.45; tw.doors[0].position.z = -0.4 - o * 0.42; tw.doors[1].position.z = 0.4 + o * 0.42; }
    towerVis();
  }
  // 到站：灯挪过来；排着队的丹炉特效（出炉、炸炉）这会儿再放
  function arrive() {
    if (tw.open >= 0) { const y = tw.F[tw.open].y + st.L.H + 0.6; lampA.position.y = lampB.position.y = y; }
    const now = tw.pending.splice(0); for (const [n, d] of now) play(n, d);
  }

  // ── 丹炉：八卦石台上的三足青铜鼎，炉口有火，机柜的线缆通到炉下 ──
  let furnace = null, furnaceBakes = [];
  const fireMat = new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff6a1a, emissiveIntensity: 0.2, roughness: 0.6 });
  // 屋子正中摆什么：自己炼模型的是丹炉；套壳派（还没立项自研）是一颗套了壳的蛋
  const buildCore = () => (st.view.own === false ? buildEgg() : buildFurnace());
  // ── 套壳派：品牌色的蛋壳里，是别人家的模型在发光；一根线从墙上的「上游 API」接进来。上半个壳悬着，一呼一吸 ──
  let egg = null;
  const coreMat = new THREE.MeshStandardMaterial({ color: 0xbfefff, emissive: 0x39c6ff, emissiveIntensity: 0.9, roughness: 0.35 });
  function buildEgg() {
    for (const b of furnaceBakes) b.userData.dispose?.(); furnaceBakes = []; furnaceG.clear(); furnace = null;
    const L = st.L, s = st.view.level >= 3 ? 1.2 : 1.0, brand = st.view.brand || '#ff6b4a', PI = Math.PI, rx = L.W / 2 - L.rz / 2, rz = clamp(-L.D / 2 + 5.9, -L.D / 2 + 4.2, L.D / 2 - 2.2), wz = -L.D / 2;
    const root = k.group(furnaceG, rx, 0.06, rz); root.scale.setScalar(s);
    const dk = { metal: 0.6, rough: 0.42, tex: 'metal' }, sh = { rough: 0.3, clear: 0.7, tex: 'paint' }, gold = k.mat('#e2b84a', { metal: 1, rough: 0.28 }), neon = { glow: '#39c6ff', glowK: 0.7, night: 2.6 };
    // 底座：机柜味的八角台 + 一圈灯带，上面是线缆盘成的「鸟巢」
    const base = k.group();
    k.cyl(1.22, 1.32, 0.14, '#2b303b', base, 0, 0.07, 0, { seg: 8, ...dk }); k.cyl(1.02, 1.1, 0.12, '#3a4150', base, 0, 0.2, 0, { seg: 8, ...dk });
    k.torus(1.03, 0.028, '#39c6ff', base, 0, 0.27, 0, { rx: PI / 2, ...neon });
    ['#20242b', '#c8402f', '#20242b', '#e2b84a', '#2f6fb0', '#20242b'].forEach((c, i) => k.torus(0.5 + i * 0.075, 0.055, c, base, (i % 2) * 0.03, 0.31 + i * 0.05, (i % 3) * 0.02, { rx: PI / 2 + (i % 2 ? 0.06 : -0.05), rough: 0.6, tex: 'rubber' }));
    const bb = k.bake(base); furnaceBakes.push(bb); root.add(bb);
    // 下半个壳（碗口朝上），正面贴着一张自家的圆标
    const body = k.group(null, 0, 0.44, 0);
    k.lathe([[0, 0], [0.3, 0.03], [0.52, 0.18], [0.67, 0.42], [0.73, 0.68], [0.71, 0.92], [0.62, 0.92], [0.6, 0.8], [0, 0.8]], brand, body, 0, 0, 0, sh);
    k.torus(0.715, 0.022, gold, body, 0, 0.92, 0, { rx: PI / 2 });
    k.cyl(0.2, 0.2, 0.02, '#fffdf7', body, 0, 0.52, 0.7, { rx: PI / 2 - 0.2, rough: 0.5, tex: 'paper' }); k.torus(0.11, 0.022, '#1e2233', body, 0, 0.523, 0.713, { rx: -0.2, rough: 0.5 });
    k.ball(0.59, coreMat, body, 0, 1.0, 0, { cast: false });                                               // 壳里那颗「别人家的模型」：从两半壳中间的缝里透出光来
    for (const dy of [-0.07, 0.07, 0.21]) k.torus(Math.sqrt(0.6 * 0.6 - dy * dy), 0.012, '#eaffff', body, 0, 1.0 + dy, 0, { rx: PI / 2, glow: '#bff3ff', glowK: 0.8, night: 2.2, cast: false });
    const bodyB = k.bake(body); furnaceBakes.push(bodyB); root.add(bodyB);
    // 上半个壳：悬在上面，留一道一拃宽的缝
    const lidY = 0.44 + 0.92 + 0.24, lid = k.group(null, 0, lidY, 0);
    k.lathe([[0, 0.1], [0.6, 0.1], [0.62, 0], [0.71, 0], [0.69, 0.25], [0.6, 0.55], [0.45, 0.8], [0.25, 0.97], [0, 1.03]], brand, lid, 0, 0, 0, sh);
    k.torus(0.715, 0.022, gold, lid, 0, 0, 0, { rx: PI / 2 });
    const lidB = k.bake(lid); furnaceBakes.push(lidB); root.add(lidB);
    const glow = glowSprite(0x59c8ff, 2.6); glow.position.set(0, 1.45, 0); root.add(glow);
    // 墙上的上游接口：一个配线盒，发光的线一路拖到蛋底下
    const cg = k.group();
    k.box(1.0, 0.72, 0.14, '#2b303b', cg, rx, 1.45, wz + 0.09, { r: 0.03, ...dk }); k.box(0.5, 0.24, 0.03, '#39c6ff', cg, rx, 1.38, wz + 0.17, { r: 0.01, ...neon });
    for (let i = 0; i < 4; i++) k.box(0.05, 0.05, 0.02, i % 2 ? '#7dff8a' : '#ffd23f', cg, rx - 0.3 + i * 0.2, 1.68, wz + 0.17, { glow: i % 2 ? '#7dff8a' : '#ffd23f', glowK: 0.8, night: 2.4 });
    textSign(cg, '上游 API', 1.0, 0.3, rx, 2.05, wz + 0.1, 0, '#1e2233', '#9be7ff');
    const path = off => [[rx + off, 1.2, wz + 0.2], [rx + off, 0.5, wz + 0.26], [rx + off, 0.1, wz + 0.6], [rx + 0.3 + off, 0.09, (rz + wz) / 2], [rx + off, 0.1, rz - 1.5 * s], [rx + off * 0.5, 0.16, rz - 0.9 * s]];
    k.tube(path(0), 0.045, '#39c6ff', cg, 0, 0, 0, { glow: '#39c6ff', glowK: 0.5, night: 2.4 }); k.tube(path(-0.12), 0.04, '#20242b', cg, 0, 0, 0, { rough: 0.6, tex: 'rubber' });
    const cb = k.bake(cg); furnaceBakes.push(cb); furnaceG.add(cb);
    egg = { g: root, lid: lidB, lidY, glow, s };
    fireLight.color.setHex(0x59c8ff); fireLight.position.set(rx, 2.3 * s, rz + 0.5);
  }
  function buildFurnace() {
    for (const b of furnaceBakes) b.userData.dispose?.(); furnaceBakes = []; furnaceG.clear(); egg = null; fireLight.color.setHex(0xff8a3c);
    const L = st.L, s = st.view.level >= 3 ? 1.3 : 1.12, root = k.group(furnaceG, L.W / 2 - L.rz / 2, 0.06, clamp(-L.D / 2 + 5.9, -L.D / 2 + 4.2, L.D / 2 - 2.2));
    root.scale.setScalar(s);
    const bz = { metal: 0.9, rough: 0.4, tex: 'bronze' }, bronze = '#8f6b3a', dark = '#5c4526', patina = '#4f8f7c', gold = k.mat('#e2b84a', { metal: 1, rough: 0.28 }), stone = { rough: 0.85, tex: 'stone' };
    const base = k.group();
    k.cyl(1.32, 1.4, 0.12, '#8f8a82', base, 0, 0.06, 0, { seg: 8, ...stone }); k.cyl(1.12, 1.2, 0.12, '#a8a297', base, 0, 0.18, 0, { seg: 8, ...stone });
    const TRI = [7, 3, 5, 1, 6, 2, 4, 0];                                                 // 八卦：每个三位二进制是一卦，1 = 阳爻（整根），0 = 阴爻（断开）
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8, tg = k.group(base, Math.sin(a) * 1.22, 0.245, Math.cos(a) * 1.22, a); for (let r = 0; r < 3; r++) { if ((TRI[i] >> r) & 1) k.box(0.3, 0.012, 0.035, gold, tg, 0, 0, -0.07 + r * 0.07); else for (const sx of [-1, 1]) k.box(0.12, 0.012, 0.035, gold, tg, sx * 0.09, 0, -0.07 + r * 0.07); } }
    const bb = k.bake(base); furnaceBakes.push(bb); root.add(bb);
    const body = k.group(null, 0, 0.24, 0);
    for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3 + 0.5, leg = k.group(body, Math.sin(a) * 0.52, 0, Math.cos(a) * 0.52, a); k.lathe([[0.07, 0], [0.11, 0.04], [0.09, 0.3], [0.15, 0.52], [0.19, 0.66]], bronze, leg, 0, 0, 0, { ...bz, rx: 0.14 }); k.ball(0.13, dark, leg, 0, 0.52, 0.09, { ...bz, sy: 0.8 }); }
    k.lathe([[0, 0.5], [0.42, 0.52], [0.7, 0.66], [0.84, 0.9], [0.88, 1.14], [0.82, 1.36], [0.7, 1.5], [0.66, 1.56], [0.72, 1.6], [0.72, 1.66], [0.62, 1.66]], bronze, body, 0, 0, 0, bz);
    k.torus(0.885, 0.04, dark, body, 0, 1.14, 0, { rx: Math.PI / 2, ...bz }); k.torus(0.8, 0.03, patina, body, 0, 1.38, 0, { rx: Math.PI / 2, metal: 0.5, rough: 0.55, tex: 'bronze' }); k.torus(0.78, 0.03, patina, body, 0, 0.82, 0, { rx: Math.PI / 2, metal: 0.5, rough: 0.55, tex: 'bronze' });
    for (let i = 0; i < 18; i++) { const a = i * Math.PI / 9; k.ball(0.045, gold, body, Math.sin(a) * 0.9, 1.26, Math.cos(a) * 0.9); }
    for (const sx of [-1, 1]) { k.torus(0.2, 0.045, bronze, body, sx * 0.78, 1.72, 0, { ry: Math.PI / 2, arc: Math.PI, ...bz }); k.box(0.1, 0.16, 0.2, dark, body, sx * 0.76, 1.66, 0, bz); }
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + 0.2; k.ball(0.085, fireMat, body, Math.sin(a) * 0.86, 1.0, Math.cos(a) * 0.86, { cast: false }); }
    k.cyl(0.6, 0.6, 0.06, fireMat, body, 0, 1.62, 0, { cast: false });
    const bodyB = k.bake(body); furnaceBakes.push(bodyB); root.add(bodyB);
    const lid = k.group(null, 0, 1.9, 0);
    k.lathe([[0.7, 0], [0.66, 0.08], [0.5, 0.2], [0.28, 0.3], [0.1, 0.34], [0.12, 0.42], [0.06, 0.5], [0, 0.52]], bronze, lid, 0, 0, 0, bz); k.ball(0.07, gold, lid, 0, 0.54, 0);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; k.cyl(0.05, 0.05, 0.03, dark, lid, Math.sin(a) * 0.4, 0.26, Math.cos(a) * 0.4, { rx: 0.5, ...bz }); }
    const lidB = k.bake(lid); furnaceBakes.push(lidB); root.add(lidB);
    const glow = glowSprite(0xff8a3c, 3.2); glow.position.set(0, 2.2, 0); root.add(glow);
    const sparks = []; for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(k.geo('spark', () => new THREE.BoxGeometry(0.05, 0.05, 0.05)), fireMat); m.layers.set(FX); m.userData.p = i / 14; root.add(m); sparks.push(m); }
    const smokeM = k.mat('#9aa0a8', { alpha: 0.45, rough: 1 }), smoke = []; for (let i = 0; i < 4; i++) { const m = k.ball(0.16, smokeM, root, 0, 2, 0, { cast: false, receive: false }); m.layers.set(FX); m.userData.p = i / 4; smoke.push(m); }
    furnace = { g: root, body: bodyB, lid: lidB, glow, sparks, smoke, s };
    fireLight.position.set(root.position.x, 2.6 * s, root.position.z + 0.5);
  }
  // ── 机柜：指示灯全部实例化（一个 draw call），随机闪 ──
  let leds = null;
  const LEDC = [new THREE.Color(0.3, 3.2, 1.6), new THREE.Color(3.2, 2.2, 0.4), new THREE.Color(0.5, 1.8, 3.4), new THREE.Color(0.04, 0.05, 0.06)];
  function makeRack(index) {
    const rack = PROPS.server_rack?.build(k, { seed: index }) || k.group();
    if (!rack.children.length) k.box(0.7, 2.05, 0.95, '#2b303b', rack, 0, 1.03, 0);
    rack.getObjectByName('leds')?.removeFromParent();
    const dead = new Set(rack.userData.own);
    for (const material of dead) material.dispose();
    for (let i = k.nightMats.length - 1; i >= 0; i--) if (dead.has(k.nightMats[i][0])) k.nightMats.splice(i, 1);
    return rack;
  }
  const delivery = createDelivery(k, PROPS, world, { makeRack, install: buildRacks, traffic, impact({ x, z }) {
    burst(x, 0.25, z, 14, ['#e6ccaa', '#ffe6ae', '#fff3d7'], 2.1); st.view.onRackImpact?.();
  } });
  function buildRacks(count = st.view.racks || 0) {
    for (const x of rackOwned) x.dispose?.(); rackOwned = []; rackG.clear(); leds = null;
    const L = st.L, n = Math.min(count, L.rackRow * 3), x0 = rackSlot(L, 0).x, g = k.group(), pts = [];
    for (let i = 0; i < n; i++) {
      const { x, z } = rackSlot(L, i), rack = makeRack(i); rack.position.set(x, 0.12, z); g.add(rack);
      for (let row = 0; row < 12; row++) for (let j = 0; j < 3; j++) pts.push([x + 0.165 + j * 0.03, 0.12 + 0.19 + row * 0.15, z + 0.43]);
    }
    if (n && furnace) {                                                       // 线缆和冷却管：从机柜底下通到炉子
      const a = [x0 + 0.4, 0.1, -L.D / 2 + 1.5], b = furnace.g.position;
      for (const [off, col, o] of [[-0.1, '#20242b', { rough: 0.6, tex: 'rubber' }], [0.02, '#c8402f', { rough: 0.5, tex: 'rubber' }], [0.14, '#39c6ff', { glow: '#39c6ff', glowK: 0.5, night: 2.4 }]]) k.tube([[a[0] + off, a[1], a[2]], [a[0] + 0.3 + off, 0.1, (a[2] + b.z) / 2 - 0.4], [b.x - 0.6 + off, 0.1, b.z - 1.2], [b.x + off * 0.5, 0.14, b.z - 0.5]], 0.04, col, g, 0, 0, 0, o);
    }
    const bk = k.bake(g); rackOwned.push({ dispose: bk.userData.dispose }); rackG.add(bk);
    if (pts.length) {
      const im = new THREE.InstancedMesh(k.geo('led3a', () => new THREE.BoxGeometry(0.018, 0.012, 0.012)), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), pts.length), M = new THREE.Matrix4();
      pts.forEach((p, i) => { im.setMatrixAt(i, M.makeTranslation(p[0], p[1], p[2])); im.setColorAt(i, LEDC[i % 3]); });
      rackOwned.push(im.material, im); rackG.add(im); leds = im;
    }
  }

  // ── 小人：光滑的「潮玩」公仔。每个部件单独合批，一个人只有六七个 draw call ──
  function buildActor(id, role, kind, outfit) {
    const lk = lookOf(id, role), root = new THREE.Group(), rig = k.group(root), pants = kind === 'cameo' ? '#3c4a6b' : '#343c52', sm = { rough: 0.62 }, cl = { rough: 0.85 };
    const shirt = kind === 'founder' ? FOUNDER_OUTFITS[outfit] || FOUNDER_OUTFITS.turtleneck : kind === 'cameo' ? '#c8402f' : lk.outfit;
    if (kind === 'cameo') Object.assign(lk, { style: 'long', glasses: true, hair: '#1f1a17', skin: '#f1c7a0', headphones: false });
    if (kind === 'founder') Object.assign(lk, { headphones: false });
    const parts = [];
    const part = (parent, x, y, z, make) => {
      const g = k.group(null, x, y, z); make(g); g.traverse(m => { if (m.isMesh) m.castShadow = m.receiveShadow = true; });
      const b = k.bake(g); parent.add(b);
      for (const m of b.children.slice()) if (m.isMesh && !m.isInstancedMesh && m.material.vertexColors) { pool ??= batchPool(m.material, { instances: 320, vertices: 400000, indices: 1200000 }); if (!pool.mesh.parent) stage.scene.add(pool.mesh); parts.push([pool.add(m.geometry), b]); b.remove(m); }
      b.userData.dispose?.(); return b;
    };
    const legs = [-1, 1].map(sx => part(rig, sx * 0.11, 0.42, 0, g => { k.capsule(0.088, 0.22, pants, g, 0, -0.2, 0, cl); k.box(0.17, 0.09, 0.27, kind === 'founder' ? '#f4f2ec' : '#e9e6df', g, 0, -0.375, 0.04, { r: 0.04, rough: 0.6 }); }));
    part(rig, 0, 0.38, 0, g => {
      k.lathe([[0, 0], [0.19, 0.02], [0.235, 0.12], [0.24, 0.3], [0.205, 0.46], [0.12, 0.56], [0, 0.585]], shirt, g, 0, 0, 0, { ...cl, sz: 0.8 });
      const suit = (kind === 'founder' && outfit === 'suit') || (kind === 'staff' && (role === 'biz' || role === 'legal'));
      if ((kind === 'founder' && outfit === 'plaid') || kind === 'cameo') { for (const x of [-0.1, 0.1]) k.box(0.03, 0.44, 0.39, '#7a1f1f', g, x, 0.27, 0, { cast: false }); for (const y of [0.16, 0.34]) k.box(0.47, 0.03, 0.39, '#7a1f1f', g, 0, y, 0, { cast: false }); }
      if (kind === 'founder' && outfit === 'turtleneck') k.torus(0.11, 0.05, shirt, g, 0, 0.58, 0, { rx: Math.PI / 2, ...cl });
      if ((kind === 'founder' && outfit === 'hoodie') || (kind === 'staff' && role === 'eng')) k.ball(0.15, shirt, g, 0, 0.52, -0.14, cl);
      if (suit) { k.box(0.13, 0.26, 0.02, '#ffffff', g, 0, 0.4, 0.178, { cast: false }); k.box(0.05, 0.24, 0.025, kind === 'founder' ? '#e5484d' : lk.trim, g, 0, 0.38, 0.186, { cast: false }); }
      if (kind === 'staff' && role === 'res') for (const x of [-0.09, 0.09]) k.box(0.06, 0.44, 0.02, lk.trim, g, x, 0.3, 0.176, { cast: false });
      if (kind === 'staff' && role === 'ops') { k.box(0.1, 0.13, 0.015, '#ffffff', g, 0.07, 0.3, 0.19, { cast: false }); k.box(0.012, 0.2, 0.012, lk.trim, g, 0.07, 0.44, 0.185, { cast: false }); }
    });
    const arms = [-1, 1].map(sx => part(rig, sx * 0.27, 0.86, 0, g => { k.capsule(0.066, 0.22, shirt, g, sx * 0.01, -0.16, 0, cl); k.ball(0.072, lk.skin, g, sx * 0.01, -0.37, 0, sm); }));
    const head = part(rig, 0, 1.2, 0, g => {
      k.ball(0.3, lk.skin, g, 0, 0, 0, { ...sm, sx: 1, sy: 0.95, sz: 0.97 }); k.cyl(0.075, 0.085, 0.1, lk.skin, g, 0, -0.29, 0, sm);
      for (const sx of [-1, 1]) {
        k.ball(0.055, lk.skin, g, sx * 0.29, -0.02, 0, sm); k.ball(0.04, '#1c1e24', g, sx * 0.105, 0.02, 0.265, { rough: 0.15, cast: false }); k.ball(0.012, '#ffffff', g, sx * 0.105 + 0.014, 0.036, 0.3, { cast: false, rough: 0.3 });
        k.ball(0.045, '#f0a3a0', g, sx * 0.185, -0.075, 0.215, { cast: false, sy: 0.6, sz: 0.5, rough: 0.8 }); k.capsule(0.012, 0.07, lk.hair, g, sx * 0.105, 0.105, 0.272, { rz: Math.PI / 2 + sx * 0.12, cast: false });
      }
      k.torus(0.04, 0.011, '#8a4038', g, 0, -0.085, 0.272, { arc: Math.PI, rz: Math.PI, cast: false });
      const hair = (r, sx, sy, sz, y, z) => k.ball(r, lk.hair, g, 0, y, z, { rough: 0.55, sx, sy, sz }), stl = lk.style;
      if (stl === 'buzz') hair(0.305, 1, 0.68, 1, 0.095, -0.025);
      else if (stl === 'bob') { hair(0.34, 1.04, 0.92, 1, 0.055, -0.055); for (const sx of [-1, 1]) k.box(0.1, 0.32, 0.27, lk.hair, g, sx * 0.29, -0.08, -0.03, { r: 0.045, rough: 0.55 }); }
      else hair(0.312, 1.02, 0.8, 1.02, 0.1, -0.04);
      if (stl === 'side') k.box(0.4, 0.1, 0.13, lk.hair, g, -0.05, 0.19, 0.21, { r: 0.045, rz: 0.22, rough: 0.55 });
      if (stl === 'bun') k.ball(0.135, lk.hair, g, 0, 0.35, -0.095, { rough: 0.55 });
      if (stl === 'long') k.box(0.52, kind === 'cameo' ? 0.68 : 0.49, 0.17, lk.hair, g, 0, kind === 'cameo' ? -0.2 : -0.11, -0.21, { r: 0.08, rough: 0.55 });
      if (kind === 'cameo') for (const sx of [-1, 1]) k.box(0.095, 0.55, 0.24, lk.hair, g, sx * 0.31, -0.16, -0.04, { r: 0.045, rough: 0.55 });
      if (stl === 'spiky') for (const [x, z, rz] of [[-0.14, 0, 0.5], [0, 0.05, 0], [0.14, 0, -0.5], [0, -0.13, 0]]) k.cone(0.08, 0.2, lk.hair, g, x, 0.33, z, { rz, rough: 0.55 });
      if (lk.glasses) { for (const sx of [-1, 1]) k.torus(0.07, kind === 'cameo' ? 0.02 : 0.012, '#22252d', g, sx * 0.105, 0.02, 0.285, { cast: false, rough: 0.3 }); k.box(0.08, 0.018, 0.015, '#22252d', g, 0, 0.03, 0.292, { cast: false }); }
      if (lk.headphones) { k.torus(0.315, 0.028, '#22252d', g, 0, 0.05, 0, { arc: Math.PI, cast: false, rough: 0.4 }); for (const sx of [-1, 1]) k.cyl(0.08, 0.08, 0.065, '#e5484d', g, sx * 0.31, 0, 0, { rz: Math.PI / 2, rough: 0.4 }); }
    });
    // 脑机实验成功以后：员工都戴着脑机头盔（银色头箍 + 小圆顶 + 发蓝光的天线）
    if (kind === 'staff' && st.view.bci) part(head, 0, 0.16, 0, g => { k.torus(0.305, 0.03, '#c9d2dc', g, 0, -0.02, 0, { rx: Math.PI / 2, metal: 0.8, rough: 0.3 }); k.ball(0.2, '#e4eaf1', g, 0, 0.1, -0.02, { sy: 0.55, metal: 0.6, rough: 0.25 }); k.cyl(0.012, 0.012, 0.16, '#8a93a6', g, 0.1, 0.22, -0.02, { metal: 0.8, rough: 0.3 }); k.ball(0.035, '#39c6ff', g, 0.1, 0.31, -0.02, { glow: '#39c6ff', glowK: 1.4, night: 2.6, cast: false }); });
    let crown = null;
    if (kind === 'founder') { crown = part(head, 0, 0.5, 0, g => { k.cyl(0.15, 0.15, 0.07, '#f2c94c', g, 0, 0, 0, { metal: 1, rough: 0.25 }); for (let i = 0; i < 5; i++) k.cone(0.045, 0.12, '#f2c94c', g, Math.sin(i * 1.257) * 0.128, 0.08, Math.cos(i * 1.257) * 0.128, { seg: 4, metal: 1, rough: 0.25 }); }); }
    if (kind === 'cameo') root.scale.setScalar(1.18);
    return { id, role, kind, root, rig, legs, arms, head, crown, parts, ph: (parseInt(String(id).replace(/\D/g, ''), 10) || 0) * 1.7, mode: 'idle', path: null, emo: null, emoT: 3 + Math.random() * 8, scare: 0, mood: 60, bubble: null, bubT: 0, born: 0 };
  }
  let pool = null;
  const freeActor = a => { for (const [h] of a.parts || []) pool?.remove(h); a.parts = []; dropBubble(a); if (a.emo) a.emo.material.dispose(); };
  const syncPool = () => {                                                   // 动画算完以后，把每个零件的世界矩阵抄进合批池
    if (!pool) return; world.updateMatrixWorld(true);
    const each = a => {                                                       // 多层楼：只有正在看的那层的人露面
      if (!a) return;
      const vis = !tw.on || (!tw.ride && tw.open >= 0 && a.floor === tw.open); a.root.visible = vis;
      for (const [h, o] of a.parts) pool.set(h, o.matrixWorld, vis);
    };
    for (const a of actors.values()) each(a); each(founder); each(cameo); for (const a of leaving) each(a);
  };
  const actors = new Map(), leaving = []; let founder = null, cameo = null;
  const freeSeat = a => {
    const mates = [...actors.values()].filter(b => b !== a && (!tw.on || (b.floor === a.floor && b.dept === a.dept))), used = new Set(mates.map(b => b.seatI));
    for (let i = 0; i < (tw.on ? 400 : seats.length + stands.length); i++) if (!used.has(i)) return i;
    return 0;
  };
  const seatPos = i => (i < seats.length ? seats[i] : stands[(i - seats.length) % stands.length]);
  // 换了房子以后重新排座：多层楼按部门分到各层
  function reseatAll() {
    for (const a of actors.values()) { a.seatI = -1; if (tw.on) { a.dept = a.role; a.floor = floorOfRole(a.role); } else a.floor = 0; }
    for (const a of actors.values()) { a.seatI = freeSeat(a); seatActor(a, false); }
  }
  function seatActor(a, walk) {
    if (tw.on) {                                                               // 多层楼：新人从电梯口出来，走到自己部门的工位
      const F = tw.F[a.floor] || tw.F[0], sl = F.seats[a.dept] || [], all = sl.concat(F.stands[a.dept] || []), s = all.length ? all[a.seatI % all.length] : { x: 0, z: 0 }, y = F.y;
      a.sit = a.seatI < sl.length; a.home = new THREE.Vector3(s.x, y, s.z);
      if (walk && a.floor === tw.open) { a.root.position.set(st.L.W / 2 + 0.4, y, tw.EZ); a.path = [new THREE.Vector3(s.x - 0.95, y, tw.EZ), new THREE.Vector3(s.x - 0.95, y, s.z), a.home.clone()]; a.mode = 'walk'; a.born = 1; }
      else { a.root.position.copy(a.home); a.root.rotation.y = 0; a.mode = a.sit ? 'sit' : 'idle'; a.path = null; }
      return;
    }
    const s = seatPos(a.seatI); a.sit = a.seatI < seats.length; a.home = new THREE.Vector3(s.x, 0, s.z);
    if (walk) { a.root.position.set(door.x - 1.4, 0, door.z); a.path = [new THREE.Vector3(door.x + 1.0, 0, door.z), new THREE.Vector3(s.x - 0.95, 0, door.z), new THREE.Vector3(s.x - 0.95, 0, s.z), a.home.clone()]; a.mode = 'walk'; a.born = 1; }
    else { a.root.position.copy(a.home); a.root.rotation.y = 0; a.mode = a.sit ? 'sit' : 'idle'; a.path = null; }
  }
  function syncStaff(list, instant) {
    const ids = new Set(list.map(s => s.id));
    for (const [id, a] of actors) if (!ids.has(id)) { a.mode = 'leave'; a.leaveT = 0; actors.delete(id); leaving.push(a); }
    for (const s of list) {
      let a = actors.get(s.id);
      if (!a) { a = buildActor(s.id, s.role, 'staff'); a.dept = s.role; a.floor = tw.on ? floorOfRole(s.role) : 0; a.seatI = freeSeat(a); actors.set(s.id, a); actorsG.add(a.root); seatActor(a, !instant); }
      a.mood = s.mood ?? 60;
    }
  }
  function buildFounder() {
    if (founder) { actorsG.remove(founder.root); freeActor(founder); }
    founder = buildActor('founder', 'eng', 'founder', st.view.founder?.outfit || 'turtleneck'); founder.root.position.copy(pace[0]); founder.mode = 'pace'; founder.paceI = 1; founder.wait = 1; founder.floor = tw.on ? tw.boss : 0; actorsG.add(founder.root);
  }
  function dropBubble(a) { if (a.bubble) { a.root.remove(a.bubble); a.bubble.userData.tex.dispose(); a.bubble.material.dispose(); a.bubble = null; } }
  function say(a, text, big, secs = 3.6) { if (!a) return; dropBubble(a); a.bubble = bubbleSprite(text, big); a.bubble.position.set(0, 1.72, 0); a.root.add(a.bubble); a.bubT = secs; }
  function pose(a, sit, swing) {
    a.legs[0].rotation.x = sit ? -1.5 : swing; a.legs[1].rotation.x = sit ? -1.5 : -swing;
    if (!sit) { a.arms[0].rotation.x = -swing * 0.8; a.arms[1].rotation.x = swing * 0.8; }
  }
  function animActor(a, dt) {
    const t = st.t + a.ph, R = a.root; let y = 0;
    if (a.mode === 'walk' || a.mode === 'pace') {
      if (a.mode === 'pace' && a.wait > 0) { a.wait -= dt; pose(a, false, 0); a.head.rotation.y = Math.sin(t * 0.9) * 0.5; a.arms[0].rotation.z = 0; }
      else {
        const tgt = a.mode === 'pace' ? pace[a.paceI] : a.path[0], d = tgt.clone().sub(R.position); d.y = 0;
        const len = d.length(), sp = (a.mode === 'pace' ? 1.1 : 3.2) * dt;
        if (len <= sp) {
          R.position.x = tgt.x; R.position.z = tgt.z;
          if (a.mode === 'pace') { a.paceI ^= 1; a.wait = 2 + Math.random() * 3; }
          else { a.path.shift(); if (!a.path.length) { a.mode = a.sit ? 'sit' : 'idle'; R.rotation.y = 0; if (a.born) { a.born = 0; burst(R.position.x, 1.5, R.position.z, 10, ['#ffd23f', '#ffffff'], 2.2); } } }
        } else { R.position.addScaledVector(d.normalize(), sp); R.rotation.y = Math.atan2(d.x, d.z); }
        pose(a, false, Math.sin(t * 11) * 0.7); y = Math.abs(Math.sin(t * 11)) * 0.05; a.head.rotation.y = 0;
      }
    } else if (a.mode === 'sit') {
      pose(a, true, 0); y = 0.14 + Math.sin(t * 2.2) * 0.006;
      const tired = a.mood < 30, k2 = tired ? 0.25 : 1, lean = Math.sin(t * 0.21) > 0.93;                    // 偶尔往后一靠伸个懒腰
      a.arms[0].rotation.x = lean ? -2.9 : -1.2 + Math.sin(t * 10) * 0.12 * k2; a.arms[1].rotation.x = lean ? -2.9 : -1.2 + Math.cos(t * 10.5) * 0.12 * k2;
      a.head.rotation.y = Math.sin(t * 0.55) * 0.28; a.head.rotation.x = lean ? -0.35 : (tired ? 0.32 : 0.06) + Math.sin(t * 0.8) * 0.05;
    } else if (a.mode === 'idle') { pose(a, false, 0); a.head.rotation.y = Math.sin(t * 0.7) * 0.5; y = Math.abs(Math.sin(t * 1.6)) * 0.02; }
    else if (a.mode === 'leave') { a.leaveT += dt; R.scale.setScalar(Math.max(0.001, 1 - a.leaveT * 2.2)); R.position.y += dt * 1.5; R.rotation.y += dt * 9; }
    if (a.scare > 0) { a.scare -= dt; y += Math.abs(Math.sin(a.scare * 14)) * 0.2; }
    a.rig.position.y = y;
    if (a.crown) { a.crown.rotation.y += dt * 1.6; a.crown.position.y = 0.5 + Math.sin(t * 2) * 0.025; }
    if (a.bubble && (a.bubT -= dt) <= 0) dropBubble(a);
    if (a.kind === 'staff' && (a.emoT -= dt) <= 0) {                           // 偶尔冒个表情
      if (a.emo) { R.remove(a.emo); a.emo.material.dispose(); a.emo = null; a.emoT = 5 + Math.random() * 12; }
      else if (Math.random() < (a.mood < 35 || a.mood > 75 ? 0.8 : 0.3)) { const pool = a.mood < 35 ? ['💢', '😫', '🥱'] : a.mood > 75 ? ['😀', '🔥', '✨'] : ['☕', '💬', '🤔']; a.emo = emojiSprite(pool[Math.random() * 3 | 0]); a.emo.position.set(0.1, 1.85, 0); R.add(a.emo); a.emoT = 2.2; }
      else a.emoT = 4 + Math.random() * 8;
    }
    if (a.emo) a.emo.position.y = 1.85 + Math.sin(st.t * 3) * 0.05;
  }

  // ── 粒子特效 ──
  const parts = [];
  const baseY = () => (tw.on ? (tw.open >= 0 ? tw.F[tw.open].y : tw.N * tw.FH) : 0);         // 特效落在哪一层的地面上（总览时落在楼顶）
  function spawn(mesh, x, y, z, vx, vy, vz, life, o = {}) { mesh.position.set(x, y, z); mesh.layers.set(FX); fxG.add(mesh); parts.push({ m: mesh, v: new THREE.Vector3(vx, vy, vz), life, max: life, g: o.g ?? 9, spin: o.spin ?? 6, grow: o.grow ?? 0, fl: o.fl ?? baseY() - 0.2 }); }
  function burst(x, y, z, n, colors, power) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28; spawn(k.box(0.08, 0.08, 0.08, colors[i % colors.length], null, 0, 0, 0, { cast: false, receive: false, glow: colors[i % colors.length], glowK: 1.4 }), x, y, z, Math.cos(a) * power * Math.random(), power * (0.6 + Math.random()), Math.sin(a) * power * Math.random(), 0.9 + Math.random() * 0.5); } }
  function rain(kind) {
    const L = st.L, cols = ['#ff6b4a', '#ffd23f', '#2ec4a6', '#7b5cff', '#4aa8ff', '#ff7ab6'], money = kind === 'money', by = baseY();
    for (let i = 0; i < (money ? 54 : 90); i++) {
      const m = money && i % 4 === 0 ? k.cyl(0.11, 0.11, 0.03, '#f2c94c', null, 0, 0, 0, { metal: 1, rough: 0.25, cast: false }) : k.box(money ? 0.34 : 0.16, 0.012, money ? 0.17 : 0.1, money ? '#5fbf6a' : cols[i % 6], null, 0, 0, 0, { cast: false, receive: false, rough: 0.6 });
      spawn(m, (Math.random() - 0.5) * L.W * 0.9, by + L.H + 2 + Math.random() * 5, (Math.random() - 0.5) * L.D * 0.9, (Math.random() - 0.5) * 1.5, -1 - Math.random() * 2, (Math.random() - 0.5) * 1.5, 3.2 + Math.random(), { g: money ? 3.5 : 2.2, spin: 7 });
    }
  }
  function scareAll() { for (const a of actors.values()) a.scare = 0.7 + Math.random() * 0.3; if (founder) founder.scare = 0.8; }
  function play(name, data = {}) {
    const L = st.L, by = baseY(), fy = furnaceG.position.y;
    // 多层楼：电梯还在路上时特效先排队（出炉、炸炉、撒花……），到站再放
    if (tw.on && tw.ride && name !== 'alarm') { tw.pending.push([name, data]); if (name === 'boom') stage.shake(0.3); return; }
    if (name === 'confetti' || name === 'money') rain(name);
    else if (name === 'alarm') { st.alarm = 3; stage.shake(0.35); scareAll(); }
    else if (name === 'boom') {
      stage.shake(0.7); scareAll();
      if (furnace) for (let i = 0; i < 16; i++) spawn(k.ball(0.3, k.mat('#3a3d45', { alpha: 0.7, rough: 1 }), null, 0, 0, 0, { cast: false, receive: false }), furnace.g.position.x + (Math.random() - 0.5) * 0.8, fy + 2 + Math.random(), furnace.g.position.z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 1.6, 1.4 + Math.random() * 1.6, (Math.random() - 0.5) * 1.6, 2 + Math.random(), { g: -0.4, spin: 0.5, grow: 1.4, fl: fy - 0.2 });
    } else if (name === 'levelup') { st.pop = 1; for (let i = 0; i < 5; i++) burst((Math.random() - 0.5) * L.W, by + L.H * 0.6, (Math.random() - 0.5) * L.D, 12, ['#ffd23f', '#fff6c2', '#ff9736'], 4.5); }
    else if (name === 'release' && (furnace || egg)) { const c = furnace || egg; st.release = 1.6; burst(c.g.position.x, fy + 2.6, c.g.position.z, 26, furnace ? ['#ffe9a8', '#ffb347', '#ffffff'] : ['#bff3ff', '#59c8ff', '#ffffff'], 5); }
    else if (name === 'say') {
      const here = a => !tw.on || a?.floor === tw.open, list = [...actors.values()].filter(here), pick = data.who === 'founder' ? founder : actors.get(data.who) || list[Math.random() * list.length | 0] || (here(founder) ? founder : null);
      if (pick) say(pick, data.text || '……', false);
    } else if (name === 'cameo') {
      if (tw.on && tw.open < 0) return;                                        // 总览时看不见人，跳过
      if (cameo) { actorsG.remove(cameo.root); freeActor(cameo); }
      cameo = buildActor('cameo', 'eng', 'cameo'); cameo.cT = 0; cameo.text = data.text || tr('你再也吃不到 Chepole 了！！！'); cameo.base = by; cameo.floor = tw.open;
      cameo.from = new THREE.Vector3(-L.W / 2 - 4, by, L.D / 2 + 3); cameo.to = new THREE.Vector3(-0.5, by, L.D / 2 - 1.5); cameo.root.position.copy(cameo.from); actorsG.add(cameo.root); scareAll();
    }
  }
  function animCameo(dt) {                                                    // 长发眼镜男：冲进来 → 蹦三下喊话 → 跳走
    const a = cameo, t = (a.cT += dt), R = a.root;
    if (t < 0.9) { const u = ease(t / 0.9); R.position.lerpVectors(a.from, a.to, u); R.position.y = (a.base || 0) + Math.sin(u * Math.PI) * 2.4; R.rotation.y = 0.6; pose(a, false, Math.sin(t * 20) * 0.8); }
    else if (t < 6.2) {
      const hop = t < 3.4 ? Math.sin((t - 0.9) % 0.62 / 0.62 * Math.PI) : 0; R.position.copy(a.to); R.position.y = (a.base || 0) + hop * 1.3; R.rotation.y = 0.5 + Math.sin(t * 3) * 0.25;
      a.rig.scale.set(1 - hop * 0.12, 1 + hop * 0.2, 1 - hop * 0.12); pose(a, false, 0); a.arms[0].rotation.x = a.arms[1].rotation.x = 0; a.arms[0].rotation.z = -2.4 + Math.sin(t * 16) * 0.3; a.arms[1].rotation.z = 2.4 - Math.sin(t * 16) * 0.3;
      if (!a.said && t > 1.0) { a.said = 1; say(a, a.text, true, 5); stage.shake(0.4); }
    } else if (t < 7.1) { const u = ease((t - 6.2) / 0.9); R.position.lerpVectors(a.to, new THREE.Vector3(st.L.W / 2 + 5, 0, st.L.D / 2 + 3), u); R.position.y = (a.base || 0) + Math.sin(u * Math.PI) * 3; R.rotation.y += dt * 12; }
    else { actorsG.remove(R); freeActor(a); cameo = null; return; }
    if (a.bubble && (a.bubT -= dt) <= 0) dropBubble(a);
  }

  let scrT = 0;
  const off = stage.onFrame((dt, t, env) => {
    st.t = t; const v = st.view, n = env.night;
    delivery.step(dt);
    if (tw.on) towerStep(dt);
    for (const f of ticks) f(t, dt);
    lampA.intensity = lampB.intensity = tw.on && (tw.open < 0 || tw.ride) ? 0 : n * 9;      // 总览、坐电梯途中没有哪层是「打开」的
    for (const s of screens) s.m.emissiveIntensity = lerp(0.85, 1.5, n);
    if (signMat) signMat.emissiveIntensity = lerp(0.3, 0.85, n);
    if ((scrT -= dt) <= 0) { scrT = 0.28; drawScreen(screens[(t * 3.6 | 0) % 4], t); }
    st.alarm = Math.max(0, st.alarm - dt);
    const red = st.alarm > 0 ? (Math.sin(t * 12) * 0.5 + 0.5) * Math.min(1, st.alarm) : 0;
    if (beaconMat) beaconMat.emissiveIntensity = 0.25 + (v.alert ? 4 * (Math.sin(t * 5) * 0.5 + 0.5) : 0) + red * 8;
    if (st.pop > 0) { st.pop = Math.max(0, st.pop - dt * 1.4); world.scale.setScalar(1 + Math.sin((1 - st.pop) * Math.PI) * 0.09 * st.pop); } else world.scale.setScalar(1);
    // 丹炉：火越旺越亮，炉盖被顶得一跳一跳；出炉那一下炉盖掀起、金光大作
    const rel = st.release > 0 ? (st.release = Math.max(0, st.release - dt)) / 1.6 : 0;
    const heat = (st.heat = lerp(st.heat, v.furnace ? clamp(v.furnace.heat ?? 0.6, 0.15, 1) : 0, 1 - Math.exp(-dt * 3))) + rel * 1.5;
    if (furnace) {
      fireMat.emissiveIntensity = 0.12 + heat * 3.4 + Math.sin(t * 9) * 0.3 * heat; fireLight.intensity = tw.on && !furnaceG.visible ? 0 : heat * 7 * (0.85 + Math.sin(t * 11) * 0.15);
      furnace.body.scale.setScalar(1 + Math.sin(t * 4) * 0.01 * heat); furnace.lid.position.y = 1.9 + Math.max(0, Math.sin(t * 7)) * 0.03 * heat + Math.sin(rel * Math.PI) * 1.1; furnace.lid.rotation.z = Math.sin(t * 13) * 0.02 * heat + rel * 0.6;
      furnace.glow.material.opacity = clamp(heat * 0.55, 0, 1); furnace.glow.scale.setScalar(2.6 + heat * 1.6 + Math.sin(t * 8) * 0.15);
      for (const s of furnace.sparks) { const p = (t * (0.35 + heat * 0.5) + s.userData.p) % 1, a = s.userData.p * 40; s.visible = heat > 0.08 && s.userData.p < 0.3 + heat * 0.7; s.position.set(Math.sin(a + p * 3) * 0.3 * (1 + p), 2.2 + p * 2.6, Math.cos(a * 1.3) * 0.3 * (1 + p)); s.scale.setScalar(1 - p); s.rotation.set(p * 9, p * 7, 0); }
      for (const s of furnace.smoke) { const p = (t * 0.22 + s.userData.p) % 1; s.visible = heat < 0.08; s.position.set(Math.sin(p * 5 + s.userData.p * 9) * 0.15, 2.2 + p * 1.8, 0); s.scale.setScalar(0.5 + p * 1.2); }
    }
    if (drops.length) {                                                       // 墙外的邻楼、幕墙：镜头转到它们背后时缩下去，别挡着屋里
      const az = stage.st.azNow ?? stage.st.az, cx = Math.sin(az), cz = Math.cos(az), kf = 1 - Math.exp(-dt * 6);
      for (const d of drops) { d.s = lerp(d.s, clamp(((d.axis === 'z' ? cz : cx) + 0.02) / 0.2, 0, 1), kf); const q = d.min + (1 - d.min) * d.s; d.o.scale.y = Math.max(0.001, q); d.o.visible = q > 0.01; }
    }
    if (egg) {                                                                // 套壳派的蛋：内核一明一暗，上半个壳悬着慢慢转；有发布时壳被顶起来
      const beat = Math.sin(t * 2.1) * 0.5 + 0.5;
      coreMat.emissiveIntensity = 0.7 + beat * 0.7 + rel * 3; fireLight.intensity = tw.on && !furnaceG.visible ? 0 : 1.6 + beat * 1.2 + rel * 5;
      egg.lid.position.y = egg.lidY + Math.sin(t * 1.3) * 0.05 + Math.sin(rel * Math.PI) * 0.9; egg.lid.rotation.y = t * 0.25; egg.lid.rotation.z = 0.07 + Math.sin(t * 0.9) * 0.03 + rel * 0.5;
      egg.glow.material.opacity = 0.28 + beat * 0.2 + rel * 0.5; egg.glow.scale.setScalar(2.4 + beat * 0.5);
    }
    if (leds && (st.ledT -= dt) <= 0) { st.ledT = 0.16; for (let i = 0; i < 18; i++) leds.setColorAt(Math.random() * leds.count | 0, LEDC[Math.random() < 0.3 ? 3 : Math.random() * 3 | 0]); leds.instanceColor.needsUpdate = true; }
    for (const a of actors.values()) animActor(a, dt);
    if (founder) animActor(founder, dt);
    if (cameo) animCameo(dt);
    for (let i = leaving.length - 1; i >= 0; i--) { animActor(leaving[i], dt); if (leaving[i].leaveT > 0.5) { actorsG.remove(leaving[i].root); freeActor(leaving[i]); leaving.splice(i, 1); } }
    syncPool();
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life -= dt; p.v.y -= p.g * dt; p.m.position.addScaledVector(p.v, dt); p.m.rotation.x += p.spin * dt; p.m.rotation.z += p.spin * 0.7 * dt;
      if (p.grow) p.m.scale.setScalar(1 + (1 - p.life / p.max) * p.grow); else if (p.life < 0.4) p.m.scale.setScalar(Math.max(0.01, p.life / 0.4));
      if (p.life <= 0 || p.m.position.y < p.fl) { fxG.remove(p.m); parts.splice(i, 1); }
    }
  });

  // 同步经营状态。返回值告诉外面这次是不是重建了房间（城市也要跟着换）
  function sync(view) {
    const p = st.view, v = (st.view = { ...p, ...view, staff: view.staff || p.staff || [] });
    v.level = clamp(v.level | 0 || 1, 1, MAXLV);
    // 什么变了要重盖房子：地区、档位、品牌色；起步那档还看落脚点；套壳派没丹炉；产品赛道的摆设（多层楼里没有）
    const key = `${getLang()}|${v.region}|${v.level}|${v.brand || ''}|${v.level === 1 ? startKind(v.region, v.district) : ''}|${v.own === false ? 'egg' : ''}|${FLOOR_PLANS[v.level] ? '' : v.track || ''}`, rebuilt = key !== st.key; let up = false;
    if (rebuilt) {
      delivery.cancel();
      up = !!st.key && p.region === v.region && v.level > p.level; st.key = key; buildRoom();
      reseatAll();
      buildFounder(); if (up) play('levelup');
    } else {
      const capacity = st.L.rackRow * 3, before = Math.min(p.racks || 0, capacity), after = Math.min(v.racks || 0, capacity);
      const animate = !tw.on && p.mode === 'play' && v.mode === 'play' && v.motion !== false && p.session === v.session && p.track === v.track;
      if (animate && after > before) {
        if (delivery.active) delivery.extend(after); else delivery.start(st.L, v.brand, before, after, st.shutter);
      } else if (before !== after || (delivery.active && (!animate || v.racks < p.racks))) {
        delivery.cancel(); buildRacks(); if (tw.on) rackG.position.y = tw.F[tw.res].y;
      }
      if ((v.founder?.outfit || '') !== (p.founder?.outfit || '')) buildFounder();
      drawSign();
    }
    const bciFlip = !!v.bci !== !!p.bci;                                        // 戴上 / 摘下脑机头盔：小人整批重做
    if (bciFlip) { for (const a of actors.values()) { actorsG.remove(a.root); freeActor(a); } actors.clear(); }
    syncStaff(v.staff, rebuilt || bciFlip || p.mode !== v.mode);
    // 多层楼：外面传进来要看哪一层（-1 = 全楼），变了就坐电梯过去
    if (tw.on) { const want = v.floor ?? -1; if (rebuilt) goFloor(want, true); else if (want !== tw.target) goFloor(want); updateLabels(); }
    else stage.setLift?.(0);
    return { rebuilt, up, L: st.L, floors: tw.on ? tw.N : 1, frame: tw.on ? tw.frame : null, lift: tw.on ? tw.camY - 0.3 * tw.frame.H : 0, top: tw.on ? tw.N * tw.FH + 3 : st.L.H + 2 };
  }
  return {
    sync, play, get L() { return st.L; }, get deliveryIdleSince() { return delivery.idleSince; },
    // 手机档：关掉三盏点光源（室内暖灯、炉火），每个像素少算三盏灯；屏幕、招牌、炉火这些自发光照样亮
    setLite(on) { lampA.visible = lampB.visible = fireLight.visible = !on; },
    // 电梯现在的状态：给界面上的楼层面板用
    lift: () => ({ on: tw.on, N: tw.N, open: tw.open, target: tw.target, pos: tw.cut, moving: !!tw.ride, dir: tw.ride ? Math.sign(tw.ride.to - tw.ride.from) : 0, eta: tw.ride ? Math.max(0, tw.ride.dur - tw.ride.t) : 0, res: tw.res, boss: tw.boss }),
    dispose() {
      delivery.cancel();
      off(); for (const b of bakes) b.userData.dispose?.(); for (const b of furnaceBakes) b.userData.dispose?.(); for (const x of owned) x.dispose?.(); for (const x of rackOwned) x.dispose?.();
      for (const a of actors.values()) freeActor(a); if (founder) freeActor(founder); if (pool) { stage.scene.remove(pool.mesh); pool.dispose(); } for (const s of screens) { s.t.dispose(); s.m.dispose(); } for (const t of emojiTex.values()) t.dispose(); glowTex.dispose(); fireMat.dispose(); coreMat.dispose(); stage.scene.remove(world);
    },
  };
}

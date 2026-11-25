// Miniature PBR prop library. Adapted from the original 51 prop drawings below.
// Shared shapes and materials belong to the caller's kit, never to a prop.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const C = {
  wood: '#c99a6b', darkWood: '#8a623f', paleWood: '#e6c9a0',
  metal: '#aeb6c2', dark: '#4a5160', white: '#f7f5ef', black: '#22252d',
  leaf: '#5fbf6a', leafDark: '#3f9a55', pot: '#d9805a', red: '#e5484d',
  gold: '#e2b84a', teal: '#2ec4a6', blue: '#4aa8ff', purple: '#7b5cff',
  orange: '#ff9736', yellow: '#ffd23f', glass: '#bfe3f2', cream: '#ffe6a5',
};
const colors = [C.blue, C.red, C.gold, C.teal, C.purple];
const soft = { r: 0.06 };
const gold = { metal: 0.75, rough: 0.32, tex: 'bronze' };
const glass = { alpha: 0.35, rough: 0.15, cast: false };
const lit = (k, color, strength = 0.18) => k.mat(color, { rough: 0.24, metal: 0, tex: 'plastic', glow: color, glowK: strength, night: 2.6 });
const brand = (o, fallback = C.teal) => o.brand || fallback;

function prop(size, draw) {
  return { size, build(k, o = {}) { const g = k.group(); draw(surfaceKit(k), g, o); return g; } };
}
// A material policy for the inherited palette; explicit materials always win.
// Geometry still comes exclusively from the caller's real kit and its caches.
function surfaceKit(k, context = '') {
  if (k.isPropKit && !context) return k;
  const base = k.rawKit || k;
  const defaults = c => {
    if ([C.wood, C.darkWood, C.paleWood].includes(c)) return { rough: 0.58, metal: 0, tex: 'wood' };
    if ([C.metal, C.dark].includes(c)) return { rough: 0.38, metal: 0.75, tex: 'metal' };
    if ([C.leaf, C.leafDark, '#87ce70', '#88cd70'].includes(c)) return { rough: 0.9, metal: 0, tex: 'foliage' };
    if (c === C.glass) return { rough: 0.08, metal: 0.15, clear: 0.8 };
    if (c === C.gold) return gold;
    if (c === C.pot) return { rough: 0.65, metal: 0, tex: 'stone' };
    if (/sofa|bean_bag|bed|clothes/.test(context) && ![C.black].includes(c)) return { rough: 0.92, metal: 0, tex: 'fabric' };
    if (context === 'rug') return { rough: 1, metal: 0, tex: 'carpet' };
    if (context === 'bookshelf' && colors.includes(c)) return { rough: 0.85, metal: 0, tex: 'paper' };
    return { rough: 0.47, metal: 0, tex: c === C.black ? 'rubber' : 'plastic' };
  };
  const out = { ...base, rawKit: base, isPropKit: true };
  out.mat = (c, o = {}) => base.mat(c, { ...defaults(c), ...o });
  const indices = { box: 3, cyl: 3, ball: 1, cone: 2, torus: 2, capsule: 2, lathe: 1, tube: 2, extrude: 2, plane: 2, disc: 1, put: 1 };
  for (const [fn, ci] of Object.entries(indices)) out[fn] = (...args) => {
    const oi = ci + 5, options = args[oi] || {};
    if (!args[ci]?.isMaterial) args[ci] = out.mat(args[ci], options);
    args[oi] = { ...(fn === 'box' ? { r: 0.008 } : {}), ...options };
    return base[fn](...args);
  };
  return out;
}
const hash = (seed, salt = 0) => {
  let n = (seed | 0) ^ Math.imul(salt + 1, 0x9e3779b1);
  n = Math.imul(n ^ n >>> 16, 0x21f0aaad); n = Math.imul(n ^ n >>> 15, 0x735a2d97);
  return ((n ^ n >>> 15) >>> 0) / 4294967296;
};
const material = (k, c, tex, rough = 0.6, metal = 0, extra = {}) => k.mat(c, { tex, rough, metal, ...extra });
function dynamic(k, g, name, x = 0, y = 0, z = 0) {
  const p = k.group(g, x, y, z); p.name = name; p.userData.dynamic = true; return p;
}
function face(k, g, o, kind, w, h, x, y, z, ry = 0) {
  const p = dynamic(k, g, `${kind}-surface`, x, y, z); p.rotation.y = ry;
  const m = k.plane(w, h, o[kind] || (kind === 'screen' ? lit(k, '#16394c') : material(k, brand(o, '#e1bd7c'), 'paper')), p, 0, 0, 0);
  g.userData[kind] ||= m;
  (g.userData[kind + 's'] ||= []).push(m);
  return m;
}
function screw(k, g, x, y, z, r = 0.009) {
  k.cyl(r, r, 0.005, C.metal, g, x, y, z, { rx: Math.PI / 2, seg: 8 });
  k.box(r * 1.25, 0.002, 0.002, C.black, g, x, y, z + 0.003, { r: 0 });
}
function grille(k, g, x, y, z, w, h, count = 10, color = C.dark) {
  k.box(w, h, 0.012, C.black, g, x, y, z);
  for (let i = 0; i < count; i++) k.box(w * 0.95, h / count * 0.35, 0.018, color, g, x, y - h / 2 + (i + 0.5) * h / count, z + 0.01);
}
function labelLines(k, g, x, y, z, w = 0.14, n = 3, c = C.dark) {
  for (let i = 0; i < n; i++) k.box(w * (i === n - 1 ? 0.65 : 1), 0.006, 0.002, c, g, x, y - i * 0.017, z, { r: 0 });
}
function oval(k, g, color, x, y, z, sx, sy, sz, options = {}) {
  const m = k.ball(1, color, g, x, y, z, { seg: 12, ...options });
  m.scale.set(sx, sy, sz); return m;
}
function bar(k, g, color, a, b, radius = 0.035, options = {}) {
  const start = new k.THREE.Vector3(...a), end = new k.THREE.Vector3(...b);
  const delta = end.sub(start);
  const m = k.cyl(radius, radius, delta.length(), color, g,
    a[0] + delta.x / 2, a[1] + delta.y / 2, a[2] + delta.z / 2, { seg: 8, ...options });
  m.quaternion.setFromUnitVectors(new k.THREE.Vector3(0, 1, 0), delta.normalize());
  return m;
}
function feet(k, g, w, d, h, color = C.dark, y = 0, thickness = 0.08) {
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2])
    k.box(thickness, h, thickness, color, g, x, y + h / 2, z, { r: 0.02 });
}
function cup(k, g, x, y, z, color = C.white, s = 1) {
  const glaze = color?.isMaterial ? color : material(k, color, 'paint', 0.18, 0, { clear: 0.65 });
  k.cyl(0.065 * s, 0.052 * s, 0.13 * s, glaze, g, x, y + 0.065 * s, z);
  k.cyl(0.051 * s, 0.051 * s, 0.012 * s, C.darkWood, g, x, y + 0.132 * s, z);
  k.torus(0.059 * s, 0.006 * s, glaze, g, x, y + 0.131 * s, z, { rx: Math.PI / 2 });
  k.torus(0.046 * s, 0.018 * s, glaze, g, x + 0.075 * s, y + 0.075 * s, z);
}
function pot(k, g, radius, height) {
  k.lathe([[radius * 0.72, 0], [radius * 0.75, 0.018], [radius, height - 0.06], [radius * 1.05, height - 0.05], [radius * 1.05, height], [radius * 0.91, height], [radius * 0.88, height - 0.035]], C.pot, g, 0, 0, 0);
  k.cyl(radius * 0.85, radius * 0.85, 0.025, C.darkWood, g, 0, height, 0);
}
function trophy(k, g, x, y, z, s = 1) {
  const p = k.group(g, x, y, z); p.scale.setScalar(s);
  k.box(0.24, 0.07, 0.2, C.darkWood, p, 0, 0.035, 0, { r: 0.02 });
  k.cyl(0.035, 0.07, 0.14, C.gold, p, 0, 0.14, 0, gold);
  k.lathe([[0.055, 0], [0.06, 0.035], [0.11, 0.11], [0.13, 0.17], [0.13, 0.18], [0.115, 0.18], [0.098, 0.11], [0.05, 0.035]], C.gold, p, 0, 0.19, 0, gold);
  for (const x of [-0.13, 0.13]) k.torus(0.075, 0.025, C.gold, p, x, 0.28, 0, gold);
}
function carton(k, g, x, y, z, w, h, d, color = C.wood) {
  k.box(w, h, d, color, g, x, y + h / 2, z, { r: 0.025 });
  k.box(0.09, 0.012, d * 0.98, C.paleWood, g, x, y + h + 0.006, z);
  k.box(w * 0.32, h * 0.26, 0.012, C.white, g, x - w * 0.14, y + h * 0.52, z + d / 2);
}
function chair(k, parent, x, z, rotation, color) {
  const g = k.group(parent, x, 0, z, rotation);
  feet(k, g, 0.36, 0.36, 0.4, C.dark, 0, 0.055);
  k.box(0.5, 0.1, 0.48, color, g, 0, 0.44, 0, soft);
  k.box(0.5, 0.36, 0.09, color, g, 0, 0.65, -0.2, soft);
}
function bicycle(k, g, color, electric = false, shared = false) {
  const r = electric ? 0.24 : 0.31, y = r + 0.035;
  for (const x of [-0.5, 0.5]) {
    k.torus(r, 0.035, C.black, g, x, y, 0);
    k.torus(r - 0.055, 0.025, C.metal, g, x, y, 0);
    for (const angle of [0, Math.PI / 2])
      k.box((r - 0.065) * 2, 0.05, 0.05, C.metal, g, x, y, 0, { rz: angle });
  }
  const rear = [-0.5, y, 0], crank = [-0.08, 0.29, 0], seat = [-0.2, 0.7, 0];
  const head = [0.36, 0.73, 0], front = [0.5, y, 0];
  for (const [a, b] of [[rear, seat], [seat, crank], [crank, rear], [seat, head], [head, crank], [head, front]])
    bar(k, g, color, a, b, electric ? 0.045 : 0.03);
  bar(k, g, C.dark, seat, [-0.2, 0.81, 0]);
  k.box(0.26, 0.08, 0.18, C.black, g, -0.23, 0.83, 0, soft);
  bar(k, g, C.dark, head, [0.32, 0.91, 0]);
  bar(k, g, C.black, [0.32, 0.91, -0.21], [0.32, 0.91, 0.21]);
  k.cyl(0.08, 0.08, 0.08, C.dark, g, -0.08, 0.29, 0, { rx: Math.PI / 2 });
  bar(k, g, C.metal, [-0.08, 0.29, 0], [0.03, 0.23, 0.17], 0.025);
  k.box(0.12, 0.05, 0.09, C.black, g, 0.03, 0.23, 0.17);
  bar(k, g, C.dark, [-0.2, 0.4, 0], [-0.3, 0.025, 0.2], 0.025);
  if (electric) {
    k.box(0.32, 0.33, 0.22, color, g, -0.08, 0.49, 0, soft);
    k.box(0.44, 0.08, 0.35, C.dark, g, -0.5, 0.64, 0, soft);
    k.box(0.44, 0.36, 0.45, C.yellow, g, -0.5, 0.86, 0, soft);
    k.box(0.46, 0.06, 0.47, C.orange, g, -0.5, 1.06, 0, { r: 0.025 });
    k.box(0.23, 0.15, 0.015, C.white, g, -0.5, 0.88, 0.231, { r: 0.02 });
    k.ball(0.07, lit(k, C.cream), g, 0.44, 0.79, 0);
  } else if (shared) {
    k.box(0.22, 0.19, 0.3, C.dark, g, 0.5, 0.79, 0, { r: 0.035 });
    k.box(0.16, 0.02, 0.22, C.black, g, 0.5, 0.891, 0);
    k.box(0.3, 0.08, 0.16, color, g, -0.48, 0.73, 0, soft);
  }
}

export const PROPS = {
  plant_small: prop([0.5, 0.5, 0.8], (k, g) => {
    pot(k, g, 0.19, 0.25);
    for (const [x, y, z, rz] of [[0, 0.54, 0, 0], [-0.09, 0.47, 0, 0.6], [0.09, 0.48, 0.02, -0.6], [0, 0.44, 0.12, 0]])
      oval(k, g, C.leaf, x, y, z, 0.095, 0.23, 0.08, { rz });
  }),
  plant_tall: prop([0.6, 0.6, 1.7], (k, g) => {
    pot(k, g, 0.23, 0.39);
    bar(k, g, C.leafDark, [0, 0.4, 0], [0, 1.43, 0]);
    for (let i = 0; i < 6; i++) {
      const a = i * 2.4, y = 0.65 + i * 0.15;
      oval(k, g, i % 2 ? C.leafDark : C.leaf, Math.cos(a) * 0.12, y, Math.sin(a) * 0.12,
        0.125, 0.23, 0.09, { ry: -a, rz: i % 2 ? -0.4 : 0.4 });
    }
  }),
  coffee_bar: prop([1.6, 0.6, 1.1], (k, g) => {
    k.box(1.5, 0.65, 0.52, C.wood, g, 0, 0.325, 0, soft);
    k.box(1.6, 0.08, 0.6, C.paleWood, g, 0, 0.69, 0, { r: 0.035 });
    for (const x of [-0.4, 0.4]) {
      k.box(0.66, 0.49, 0.025, C.paleWood, g, x, 0.35, 0.27, { r: 0.025 });
      k.box(0.19, 0.05, 0.04, C.darkWood, g, x, 0.5, 0.28);
    }
    k.box(0.5, 0.36, 0.35, C.red, g, -0.42, 0.91, -0.07, soft);
    k.box(0.36, 0.19, 0.025, C.black, g, -0.42, 0.88, 0.116, { r: 0.02 });
    k.box(0.46, 0.05, 0.22, C.metal, g, -0.42, 0.755, 0.1);
    k.box(0.23, 0.05, 0.09, C.metal, g, -0.42, 0.98, 0.14);
    cup(k, g, -0.43, 0.78, 0.13, C.white, 0.75);
    for (let i = 0; i < 3; i++) cup(k, g, 0.06 + i * 0.23, 0.73, 0.03, [C.white, C.teal, C.yellow][i]);
  }),
  water_cooler: prop([0.4, 0.4, 1.2], (k, g) => {
    k.box(0.36, 1.16, 0.36, C.white, g, 0, 0.58, 0, soft);
    k.box(0.28, 0.35, 0.015, C.dark, g, 0, 0.76, 0.182, { r: 0.025 });
    for (const [x, color] of [[-0.08, C.blue], [0.08, C.red]]) k.box(0.07, 0.08, 0.028, color, g, x, 0.85, 0.185);
    k.box(0.27, 0.05, 0.06, C.metal, g, 0, 0.59, 0.17);
    for (let y = 0.17; y < 0.4; y += 0.09) k.box(0.22, 0.035, 0.015, C.metal, g, 0, y, 0.183);
    k.box(0.2, 0.1, 0.015, lit(k, C.blue), g, 0, 1.05, 0.184, { r: 0.02 });
  }),
  printer: prop([0.7, 0.6, 0.9], (k, g) => {
    k.box(0.65, 0.51, 0.54, C.wood, g, 0, 0.255, 0, soft);
    for (const y of [0.15, 0.38]) {
      k.box(0.57, 0.18, 0.025, C.paleWood, g, 0, y, 0.278, { r: 0.02 });
      k.box(0.19, 0.05, 0.035, C.darkWood, g, 0, y + 0.02, 0.282);
    }
    k.box(0.65, 0.28, 0.5, C.white, g, 0, 0.66, -0.04, soft);
    k.box(0.63, 0.08, 0.48, C.dark, g, 0, 0.84, -0.04, { r: 0.035 });
    k.box(0.46, 0.07, 0.025, C.black, g, 0, 0.63, 0.218);
    k.box(0.38, 0.018, 0.25, C.white, g, -0.02, 0.62, 0.2195, { rx: 0.95 });
    k.box(0.11, 0.06, 0.02, lit(k, C.teal), g, 0.22, 0.75, 0.215);
  }),
  sofa: prop([2, 0.9, 0.8], (k, g, o) => {
    feet(k, g, 1.65, 0.58, 0.15, C.darkWood, 0, 0.12);
    k.box(1.96, 0.25, 0.85, '#5c80b5', g, 0, 0.27, 0, { r: 0.11 });
    k.box(1.88, 0.49, 0.2, '#7096ca', g, 0, 0.555, -0.335, { r: 0.095 });
    for (const x of [-0.875, 0.875]) k.box(0.25, 0.39, 0.82, '#7096ca', g, x, 0.43, 0.015, { r: 0.11 });
    for (const x of [-0.39, 0.39]) {
      k.box(0.74, 0.18, 0.62, '#88b0df', g, x, 0.425, 0.075, { r: 0.08 });
      k.box(0.32, 0.3, 0.14, brand(o, C.yellow), g, x * 1.32, 0.61, -0.13, { r: 0.07, rz: x * 0.22 });
    }
  }),
  coffee_table: prop([1, 0.6, 0.4], (k, g) => {
    feet(k, g, 0.75, 0.35, 0.22, C.darkWood);
    k.box(1, 0.07, 0.6, C.paleWood, g, 0, 0.255, 0, soft);
    k.box(0.3, 0.035, 0.23, C.purple, g, -0.15, 0.307, 0.02, { ry: 0.2 });
    k.box(0.18, 0.012, 0.14, C.yellow, g, -0.15, 0.331, 0.02, { ry: 0.2 });
    cup(k, g, 0.27, 0.29, 0.02, C.teal, 0.75);
  }),
  bookshelf: prop([1.4, 0.4, 1.9], (k, g) => {
    k.box(1.4, 1.9, 0.06, C.darkWood, g, 0, 0.95, -0.17);
    for (const x of [-0.65, 0.65]) k.box(0.1, 1.9, 0.4, C.wood, g, x, 0.95, 0, { r: 0.025 });
    for (const y of [0.06, 0.65, 1.24, 1.85]) k.box(1.3, 0.1, 0.4, C.paleWood, g, 0, y, 0);
    for (let row = 0; row < 3; row++) for (let i = 0; i < (row === 2 ? 3 : 6); i++) {
      const h = 0.28 + (i % 3) * 0.07;
      k.box(0.12, h, 0.25, colors[(i + row) % 5], g, -0.49 + i * 0.18, 0.11 + row * 0.59 + h / 2, 0.015, { r: 0.012 });
    }
    trophy(k, g, 0.34, 1.29, 0.02, 1.1);
  }),
  boxes: prop([1.1, 0.9, 0.9], (k, g) => {
    carton(k, g, -0.22, 0, 0.04, 0.58, 0.37, 0.62);
    carton(k, g, 0.32, 0, 0.08, 0.4, 0.28, 0.52, C.paleWood);
    const p = k.group(g, -0.17, 0.382, 0.02);
    k.box(0.43, 0.06, 0.4, C.darkWood, p, 0, 0.03, 0);
    for (const x of [-0.2, 0.2]) k.box(0.04, 0.28, 0.4, C.wood, p, x, 0.18, 0);
    for (const z of [-0.18, 0.18]) k.box(0.4, 0.28, 0.04, C.wood, p, 0, 0.18, z);
    for (const x of [-1, 1]) k.box(0.21, 0.025, 0.39, C.paleWood, p, x * 0.28, 0.37, 0, { rz: x * 0.5 });
    for (const z of [-1, 1]) k.box(0.4, 0.025, 0.18, C.wood, p, 0, 0.36, z * 0.25, { rx: -z * 0.5 });
  }),
  trash_bin: prop([0.35, 0.35, 0.5], (k, g) => {
    k.cyl(0.16, 0.125, 0.43, C.teal, g, 0, 0.215, 0);
    k.cyl(0.17, 0.17, 0.06, C.dark, g, 0, 0.46, 0);
    k.box(0.19, 0.02, 0.12, C.black, g, 0, 0.49, 0, { r: 0.025 });
    k.box(0.13, 0.06, 0.07, C.metal, g, 0, 0.04, 0.13, { r: 0.02 });
    k.box(0.1, 0.13, 0.012, C.white, g, 0, 0.25, 0.154, { r: 0.02 });
  }),
  vending: prop([0.9, 0.8, 1.9], (k, g, o) => {
    k.box(0.89, 1.9, 0.56, brand(o, C.red), g, 0, 0.95, -0.1, { r: 0.08 });
    for (const x of [-0.407, 0.31]) k.box(x < 0 ? 0.075 : 0.26, 1.78, 0.22, brand(o, C.red), g, x, 0.95, 0.28, { r: 0.025 });
    for (const [y, h] of [[0.27, 0.54], [1.72, 0.35]]) k.box(0.86, h, 0.22, brand(o, C.red), g, 0, y, 0.28, soft);
    k.box(0.72, 0.19, 0.025, lit(k, C.cream), g, 0, 1.7, 0.386, { r: 0.03 });
    k.box(0.57, 0.97, 0.025, C.black, g, -0.08, 1.04, 0.19, { r: 0.025 });
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        k.cyl(0.055, 0.055, 0.18, colors[(row + col) % 5], g, -0.26 + col * 0.18, 0.74 + row * 0.29, 0.3);
      }
      k.box(0.53, 0.04, 0.08, C.metal, g, -0.08, 0.63 + row * 0.29, 0.35);
    }
    k.box(0.56, 0.94, 0.012, C.glass, g, -0.08, 1.04, 0.394, glass);
    for (const y of [1.25, 1.05, 0.85]) k.box(0.1, 0.1, 0.025, lit(k, C.teal), g, 0.32, y, 0.386, soft);
    k.box(0.62, 0.2, 0.025, C.black, g, 0, 0.28, 0.386, soft);
    k.box(0.48, 0.05, 0.02, C.metal, g, 0, 0.38, 0.39);
  }),
  reception: prop([2.8, 0.9, 1.1], (k, g, o) => {
    k.box(2.65, 0.96, 0.78, C.paleWood, g, 0, 0.48, 0, { r: 0.12 });
    k.box(2.8, 0.12, 0.9, C.white, g, 0, 1.02, 0, { r: 0.06 });
    k.box(2.4, 0.12, 0.045, lit(k, brand(o)), g, 0, 0.61, 0.405, soft);
    k.box(1.1, 0.17, 0.035, C.darkWood, g, 0, 0.34, 0.4, { r: 0.025 });
    for (const x of [-0.3, 0, 0.3]) k.box(0.13, 0.09, 0.02, C.gold, g, x, 0.34, 0.425);
  }),
  meeting_table: prop([3.4, 2.6, 0.9], (k, g, o) => {
    for (const x of [-0.8, 0.8]) k.box(0.16, 0.66, 0.64, C.dark, g, x, 0.33, 0, soft);
    k.box(2.55, 0.12, 1.18, C.paleWood, g, 0, 0.72, 0, { r: 0.16 });
    for (const x of [-0.9, 0, 0.9]) {
      chair(k, g, x, -0.99, 0, brand(o, C.blue));
      chair(k, g, x, 0.99, Math.PI, brand(o, C.blue));
    }
    k.box(0.36, 0.025, 0.24, C.purple, g, 0.55, 0.795, 0.13);
  }),
  arcade: prop([0.8, 0.8, 1.8], (k, g) => {
    k.box(0.73, 0.82, 0.7, C.purple, g, 0, 0.41, 0, soft);
    k.box(0.72, 0.8, 0.43, C.purple, g, 0, 1.2, -0.12, soft);
    k.box(0.78, 0.23, 0.57, C.purple, g, 0, 1.685, -0.07, soft);
    k.box(0.63, 0.13, 0.025, lit(k, C.yellow), g, 0, 1.69, 0.225, { r: 0.02 });
    k.box(0.6, 0.48, 0.04, C.black, g, 0, 1.28, 0.115, { r: 0.04 });
    k.box(0.47, 0.35, 0.025, lit(k, '#234c74'), g, 0, 1.28, 0.143, { r: 0.025 });
    for (const [x, y, color] of [[-0.13, 1.33, C.teal], [0.05, 1.36, C.yellow], [0.13, 1.22, C.red]])
      k.box(0.09, 0.09, 0.02, lit(k, color), g, x, y, 0.16);
    k.box(0.76, 0.12, 0.41, C.teal, g, 0, 0.92, 0.18, { r: 0.04 });
    k.cyl(0.03, 0.03, 0.12, C.dark, g, -0.2, 1.03, 0.22);
    k.ball(0.065, C.red, g, -0.2, 1.105, 0.22);
    for (const x of [0.07, 0.23]) k.cyl(0.055, 0.055, 0.035, C.yellow, g, x, 0.997, 0.25);
    k.box(0.23, 0.1, 0.025, C.black, g, 0, 0.43, 0.359, soft);
    k.box(0.11, 0.025, 0.02, C.metal, g, 0, 0.44, 0.378);
  }),
  fridge: prop([0.8, 0.7, 1.8], (k, g) => {
    k.box(0.78, 1.78, 0.65, '#d1e7dc', g, 0, 0.89, -0.02, { r: 0.1 });
    for (const [y, h] of [[0.61, 1.12], [1.48, 0.55]]) k.box(0.75, h, 0.08, C.white, g, 0, y, 0.286, soft);
    for (const y of [0.99, 1.39]) k.box(0.065, 0.22, 0.07, C.metal, g, -0.25, y, 0.315, { r: 0.025 });
    for (let i = 0; i < 7; i++) k.box(0.14, 0.16, 0.015, [C.yellow, C.teal, '#ff9eb5'][i % 3], g,
      -0.09 + (i % 2) * 0.24, 0.55 + Math.floor(i / 2) * 0.27, 0.335, { rz: (i % 3 - 1) * 0.16 });
    k.box(0.2, 0.08, 0.02, C.red, g, 0.13, 1.61, 0.336, { r: 0.02 });
  }),
  standing_lamp: prop([0.4, 0.4, 1.7], (k, g) => {
    k.cyl(0.18, 0.19, 0.08, C.dark, g, 0, 0.04, 0);
    k.cyl(0.03, 0.03, 1.25, C.gold, g, 0, 0.7, 0, gold);
    k.cyl(0.12, 0.2, 0.32, lit(k, C.cream), g, 0, 1.51, 0);
    k.ball(0.065, C.gold, g, 0, 1.635, 0, gold);
  }),
  rug: prop([2.4, 1.6, 0.03], (k, g, o) => {
    const base = new k.THREE.Color(brand(o, C.purple));
    const light = base.clone().lerp(new k.THREE.Color(C.white), 0.4);
    const dark = base.clone().multiplyScalar(0.62);
    k.box(2.4, 0.018, 1.6, dark.getHex(), g, 0, 0.009, 0, { r: 0.009 });
    k.box(2.22, 0.008, 1.42, base.getHex(), g, 0, 0.022, 0);
    for (const x of [-0.9, -0.68, 0.68, 0.9]) k.box(0.1, 0.004, 1.42, light.getHex(), g, x, 0.028, 0);
  }),
  phone_booth: prop([1.1, 1.1, 2.2], (k, g, o) => {
    for (const y of [0.07, 2.1]) k.box(1.1, 0.14, 1.1, brand(o, C.teal), g, 0, y, 0, soft);
    for (const x of [-0.49, 0.49]) for (const z of [-0.49, 0.49]) k.box(0.1, 1.96, 0.1, brand(o), g, x, 1.08, z, { r: 0.025 });
    k.box(0.88, 1.8, 0.035, C.glass, g, 0, 1.08, -0.49, glass);
    for (const x of [-0.49, 0.49]) k.box(0.035, 1.8, 0.88, C.glass, g, x, 1.08, 0, glass);
    k.box(0.86, 1.79, 0.035, C.glass, g, 0, 1.08, 0.49, glass);
    k.box(0.06, 0.3, 0.07, C.gold, g, 0.32, 1.04, 0.5, { r: 0.025 });
    k.box(0.72, 0.1, 0.33, C.paleWood, g, 0, 0.98, -0.27, soft);
    k.box(0.16, 0.33, 0.09, C.dark, g, 0, 1.32, -0.4, soft);
    k.box(0.08, 0.24, 0.09, C.white, g, -0.11, 1.34, -0.34, soft);
    k.cyl(0.2, 0.2, 0.1, C.orange, g, 0, 0.55, 0.12);
    k.cyl(0.04, 0.1, 0.37, C.metal, g, 0, 0.325, 0.12);
    k.box(0.5, 0.05, 0.4, lit(k, C.cream), g, 0, 2.01, 0);
  }),
  bean_bag: prop([0.9, 0.9, 0.7], (k, g, o) => {
    oval(k, g, brand(o, C.orange), 0, 0.27, 0.02, 0.45, 0.27, 0.43);
    oval(k, g, brand(o, C.orange), 0, 0.43, -0.19, 0.36, 0.27, 0.24, { rx: -0.22 });
    const seatColor = new k.THREE.Color(brand(o, C.orange)).lerp(new k.THREE.Color(C.cream), 0.25).getHex();
    oval(k, g, seatColor, 0, 0.505, 0.14, 0.27, 0.04, 0.23, { rx: 0.1 });
    k.box(0.08, 0.1, 0.025, C.white, g, 0.34, 0.24, 0.26, { rz: -0.2 });
  }),
  trophy_case: prop([1.4, 0.4, 1.8], (k, g) => {
    k.box(1.4, 0.25, 0.4, C.darkWood, g, 0, 0.125, 0, soft);
    k.box(1.4, 0.1, 0.4, C.darkWood, g, 0, 1.75, 0, { r: 0.025 });
    for (const x of [-0.65, 0.65]) k.box(0.1, 1.48, 0.36, C.wood, g, x, 1, 0);
    for (const y of [0.27, 0.88, 1.43]) k.box(1.2, 0.05, 0.34, C.paleWood, g, 0, y, 0);
    for (const [x, y, s] of [[-0.32, 0.3, 1.1], [0.32, 0.3, 0.9], [-0.32, 0.91, 1], [0.32, 0.91, 1.15]]) trophy(k, g, x, y, 0, s);
    k.box(1.18, 1.4, 0.02, C.glass, g, 0, 1, 0.19, glass);
    k.box(1.18, 1.4, 0.02, C.glass, g, 0, 1, -0.19, glass);
    k.box(1.1, 0.05, 0.07, lit(k, C.cream), g, 0, 1.68, 0.09);
  }),
  statue_founder: prop([1.2, 1.2, 2.8], (k, g) => {
    k.box(1.16, 0.14, 1.12, C.white, g, 0, 0.07, 0, soft);
    k.box(0.94, 0.49, 0.86, '#d8dfdf', g, 0, 0.385, 0, soft);
    k.box(1.05, 0.12, 0.98, C.white, g, 0, 0.69, 0, soft);
    k.box(0.42, 0.18, 0.03, C.gold, g, 0, 0.4, 0.442, gold);
    for (const x of [-0.17, 0.17]) {
      k.box(0.22, 0.12, 0.36, C.gold, g, x, 0.81, 0.07, { ...gold, r: 0.06 });
      bar(k, g, C.gold, [x, 0.85, 0], [x * 0.8, 1.35, 0], 0.105, gold);
    }
    oval(k, g, C.gold, 0, 1.57, 0, 0.31, 0.38, 0.23, gold);
    oval(k, g, C.gold, 0, 1.99, -0.045, 0.255, 0.29, 0.23, gold);
    oval(k, g, '#f3d574', 0, 2.01, 0.13, 0.18, 0.2, 0.13, gold);
    k.ball(0.065, C.gold, g, 0, 2.01, 0.26, gold);
    k.box(0.27, 0.13, 0.06, C.gold, g, 0, 1.42, 0.217, { ...gold, r: 0.04 });
    for (const x of [-0.065, 0.065]) bar(k, g, '#ffe6a5', [x, 1.83, 0.2], [x, 1.65, 0.235], 0.025, gold);
    bar(k, g, C.gold, [-0.25, 1.75, 0], [-0.4, 1.43, 0.02], 0.095, gold);
    k.ball(0.105, C.gold, g, -0.4, 1.37, 0.04, gold);
    bar(k, g, C.gold, [0.24, 1.79, 0], [0.41, 2.1, 0], 0.095, gold);
    bar(k, g, C.gold, [0.41, 2.1, 0], [0.37, 2.41, 0], 0.085, gold);
    k.ball(0.095, C.gold, g, 0.37, 2.43, 0, gold);
    // The solemn monument's sacred object: an open, entirely gold laptop.
    k.box(0.58, 0.055, 0.4, C.gold, g, 0.27, 2.51, 0.02, { ...gold, r: 0.025 });
    k.box(0.58, 0.26, 0.05, C.gold, g, 0.27, 2.665, -0.16, { ...gold, r: 0.025 });
    k.box(0.45, 0.16, 0.015, '#9c7525', g, 0.27, 2.665, -0.128, gold);
    k.box(0.39, 0.012, 0.19, '#ba9238', g, 0.27, 2.544, 0.045, gold);
  }),
  atrium_tree: prop([2.2, 2.2, 4.2], (k, g) => {
    k.cyl(1.05, 1.05, 0.27, C.white, g, 0, 0.135, 0);
    k.cyl(0.72, 0.72, 0.03, C.darkWood, g, 0, 0.285, 0);
    k.torus(0.87, 0.17, C.wood, g, 0, 0.37, 0, { rx: Math.PI / 2 });
    bar(k, g, C.darkWood, [0, 0.28, 0], [-0.07, 2.9, 0], 0.16);
    for (const [x, y, z] of [[-0.5, 2.8, 0], [0.45, 3.15, 0.2], [0, 3.55, -0.3]]) {
      bar(k, g, C.wood, [0, 2.1, 0], [x, y, z], 0.095);
      oval(k, g, x < 0 ? C.leafDark : C.leaf, x, y + 0.05, z, 0.59, 0.58, 0.65, { seg: 10 });
    }
    oval(k, g, '#87ce70', -0.12, 3.62, 0.15, 0.65, 0.55, 0.65, { seg: 10 });
  }),
  pingpong: prop([2.8, 1.6, 0.9], (k, g) => {
    feet(k, g, 2.1, 1.05, 0.66, C.dark, 0, 0.09);
    k.box(2.76, 0.08, 1.56, C.blue, g, 0, 0.7, 0, { r: 0.025 });
    for (const z of [-0.72, 0, 0.72]) k.box(2.68, 0.012, 0.035, C.white, g, 0, 0.746, z);
    for (const x of [-1.31, 1.31]) k.box(0.035, 0.012, 1.45, C.white, g, x, 0.746, 0);
    for (const z of [-0.74, 0.74]) k.box(0.05, 0.15, 0.05, C.dark, g, 0, 0.815, z);
    k.box(0.02, 0.12, 1.43, C.white, g, 0, 0.81, 0, { alpha: 0.55 });
    k.box(0.035, 0.025, 1.5, C.white, g, 0, 0.885, 0);
    for (const x of [-0.85, 0.85]) {
      k.cyl(0.13, 0.13, 0.035, x < 0 ? C.red : C.black, g, x, 0.77, 0.32);
      k.box(0.07, 0.04, 0.16, C.wood, g, x, 0.77, 0.5, soft);
    }
    k.ball(0.035, C.white, g, 0.61, 0.79, -0.26);
  }),
  foosball: prop([1.4, 0.8, 0.9], (k, g) => {
    feet(k, g, 1, 0.48, 0.62, C.dark, 0, 0.1);
    k.box(1.32, 0.16, 0.62, C.wood, g, 0, 0.68, 0, soft);
    k.box(1.18, 0.04, 0.5, C.leafDark, g, 0, 0.77, 0);
    for (const z of [-0.29, 0.29]) k.box(1.35, 0.08, 0.07, C.paleWood, g, 0, 0.85, z);
    for (const x of [-0.64, 0.64]) k.box(0.07, 0.08, 0.58, C.paleWood, g, x, 0.85, 0);
    for (const x of [-0.4, -0.13, 0.13, 0.4]) {
      bar(k, g, C.metal, [x, 0.85, -0.39], [x, 0.85, 0.39], 0.025);
      for (const z of [-0.15, 0.15]) {
        k.box(0.07, 0.095, 0.07, x < 0 ? C.red : C.blue, g, x, 0.822, z, { r: 0.02 });
        k.ball(0.025, C.paleWood, g, x, 0.874, z);
      }
    }
    k.box(0.025, 0.008, 0.49, C.white, g, 0, 0.794, 0);
    k.ball(0.03, C.white, g, 0.24, 0.82, 0);
  }),
  kombucha: prop([0.6, 0.6, 1.3], (k, g) => {
    feet(k, g, 0.32, 0.3, 0.25, C.darkWood);
    k.cyl(0.25, 0.25, 0.75, C.wood, g, 0, 0.63, 0);
    for (const y of [0.32, 0.93]) k.cyl(0.265, 0.265, 0.09, C.dark, g, 0, y, 0);
    k.cyl(0.24, 0.24, 0.07, C.paleWood, g, 0, 1.04, 0);
    k.box(0.27, 0.25, 0.025, C.cream, g, 0, 0.75, 0.253, soft);
    oval(k, g, C.leafDark, 0, 0.75, 0.274, 0.06, 0.09, 0.015, { rz: -0.4 });
    bar(k, g, C.metal, [0, 0.49, 0.23], [0, 0.49, 0.29], 0.045);
    k.box(0.07, 0.15, 0.07, C.black, g, 0, 0.57, 0.265, { r: 0.025 });
    k.box(0.08, 0.12, 0.08, C.darkWood, g, 0, 1.13, 0);
    k.box(0.39, 0.16, 0.06, C.teal, g, 0, 1.22, 0, { r: 0.025 });
  }),
  skateboard: prop([0.8, 0.25, 0.15], (k, g) => {
    for (const x of [-0.25, 0.25]) {
      bar(k, g, C.metal, [x, 0.045, -0.09], [x, 0.045, 0.09], 0.025);
      for (const z of [-0.09, 0.09]) k.cyl(0.043, 0.043, 0.06, C.yellow, g, x, 0.043, z, { rx: Math.PI / 2 });
    }
    k.box(0.79, 0.05, 0.24, C.purple, g, 0, 0.115, 0, { r: 0.025 });
    k.box(0.42, 0.008, 0.17, C.black, g, 0, 0.146, 0, { r: 0.004 });
  }),
  surfboard: prop([0.5, 0.3, 2.1], (k, g) => {
    const p = k.group(g, 0, 1.02, 0); p.rotation.x = -0.075;
    oval(k, p, C.cream, 0, 0, 0, 0.245, 1.02, 0.065);
    oval(k, p, C.teal, 0, 0, 0.057, 0.075, 0.9, 0.015);
    k.box(0.3, 0.13, 0.025, C.orange, p, 0, -0.27, 0.059, { rz: -0.25 });
    k.box(0.1, 0.22, 0.1, C.dark, p, 0, -0.65, -0.075, { r: 0.02 });
  }),
  bicycle: prop([1.7, 0.5, 1], (k, g) => bicycle(k, g, C.red)),
  garage_shelf: prop([1.6, 0.5, 1.9], (k, g) => {
    for (const x of [-0.74, 0.74]) for (const z of [-0.2, 0.2]) k.box(0.08, 1.9, 0.08, C.dark, g, x, 0.95, z);
    for (const y of [0.12, 0.72, 1.32, 1.85]) k.box(1.56, 0.08, 0.48, C.metal, g, 0, y, 0);
    k.box(0.68, 0.3, 0.34, C.red, g, -0.31, 0.91, 0, soft);
    k.box(0.72, 0.06, 0.36, C.dark, g, -0.31, 1.09, 0, { r: 0.025 });
    k.torus(0.09, 0.025, C.dark, g, -0.31, 1.13, 0);
    k.box(0.09, 0.1, 0.025, C.metal, g, -0.31, 1.04, 0.185);
    for (const x of [-0.43, 0, 0.43]) {
      k.cyl(0.14, 0.14, 0.3, x === 0 ? C.yellow : C.white, g, x, 0.31, 0);
      k.cyl(0.145, 0.145, 0.04, C.metal, g, x, 0.48, 0);
    }
    oval(k, g, C.orange, 0.33, 1.52, 0, 0.25, 0.18, 0.2);
    k.box(0.49, 0.06, 0.42, C.orange, g, 0.33, 1.39, 0.01, { r: 0.03 });
    k.box(0.07, 0.08, 0.32, C.yellow, g, 0.33, 1.65, 0, soft);
  }),
  car: prop([4.2, 1.9, 1.5], (k, g, o) => {
    // A short, chubby city car. Keep its nose +Z within the shallow parking envelope.
    k.box(1.72, 0.55, 1.75, brand(o, C.teal), g, 0, 0.57, 0, { r: 0.22 });
    k.box(1.35, 0.64, 1.14, brand(o, C.teal), g, 0, 1.08, -0.2, { r: 0.2 });
    k.box(1.05, 0.36, 0.045, '#25435c', g, 0, 1.115, 0.37, { r: 0.09 });
    k.box(0.07, 0.39, 0.06, brand(o), g, 0, 1.115, 0.38);
    k.box(1.02, 0.32, 0.045, '#25435c', g, 0, 1.12, -0.765, { r: 0.08 });
    for (const x of [-0.67, 0.67]) {
      k.box(0.04, 0.32, 0.7, '#25435c', g, x, 1.11, -0.18, { r: 0.07 });
      k.box(0.055, 0.35, 0.06, brand(o), g, x, 1.11, -0.17);
      k.box(0.055, 0.05, 0.17, C.metal, g, x * 1.26, 0.78, -0.18, { r: 0.02 });
    }
    for (const x of [-0.83, 0.83]) for (const z of [-0.54, 0.54]) {
      k.cyl(0.3, 0.3, 0.19, C.black, g, x, 0.3, z, { rz: Math.PI / 2, seg: 16 });
      k.cyl(0.16, 0.16, 0.205, C.metal, g, x, 0.3, z, { rz: Math.PI / 2, seg: 16 });
    }
    for (const x of [-0.57, 0.57]) {
      k.box(0.3, 0.2, 0.07, lit(k, C.cream), g, x, 0.69, 0.84, soft);
      k.box(0.24, 0.15, 0.07, C.red, g, x, 0.68, -0.84, soft);
      k.box(0.2, 0.13, 0.18, brand(o), g, x * 1.37, 1, 0.23, soft);
    }
    k.box(1.32, 0.11, 0.09, C.metal, g, 0, 0.38, 0.88, soft);
    k.box(0.7, 0.12, 0.05, C.black, g, 0, 0.57, 0.87, soft);
    k.box(0.39, 0.15, 0.025, C.white, g, 0, 0.4, 0.935, { r: 0.02 });
  }),
  tea_table: prop([1.8, 1, 0.8], (k, g) => {
    feet(k, g, 0.77, 0.54, 0.52, C.darkWood, 0, 0.11);
    k.box(1.02, 0.1, 0.85, C.wood, g, 0, 0.57, 0, soft);
    k.box(0.7, 0.06, 0.48, C.darkWood, g, 0, 0.65, 0, { r: 0.03 });
    k.box(0.6, 0.02, 0.38, C.paleWood, g, 0, 0.69, 0);
    oval(k, g, C.pot, -0.08, 0.738, -0.02, 0.1, 0.06, 0.085);
    k.cyl(0.065, 0.065, 0.025, C.pot, g, -0.08, 0.786, -0.02);
    k.torus(0.045, 0.02, C.pot, g, -0.18, 0.734, -0.02);
    bar(k, g, C.pot, [-0.01, 0.73, -0.02], [0.08, 0.765, -0.02], 0.03);
    for (const [x, z] of [[-0.21, 0.13], [0, 0.14], [0.21, 0.1], [0.2, -0.12]])
      k.cyl(0.045, 0.03, 0.065, C.pot, g, x, 0.738, z);
    for (const x of [-0.71, 0.71]) {
      k.cyl(0.17, 0.14, 0.36, C.darkWood, g, x, 0.18, 0);
      k.cyl(0.18, 0.18, 0.08, C.wood, g, x, 0.4, 0);
    }
  }),
  money_tree: prop([0.7, 0.7, 1.6], (k, g) => {
    pot(k, g, 0.25, 0.37);
    for (let stem = 0; stem < 2; stem++) for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + stem * Math.PI, b = a + Math.PI / 2;
      bar(k, g, stem ? C.darkWood : C.wood, [Math.cos(a) * 0.07, 0.38 + i * 0.17, Math.sin(a) * 0.07],
        [Math.cos(b) * 0.07, 0.55 + i * 0.17, Math.sin(b) * 0.07], 0.04);
    }
    for (const [x, y, z] of [[-0.15, 1.18, 0], [0.15, 1.2, 0.04], [0, 1.4, -0.05], [0, 1.21, 0.15]])
      oval(k, g, x < 0 ? C.leafDark : C.leaf, x, y, z, 0.19, 0.2, 0.17);
    for (const x of [-0.09, 0.09]) oval(k, g, C.red, x, 0.76, 0.1, 0.1, 0.055, 0.035, { rz: x * 3 });
    k.box(0.07, 0.23, 0.035, C.red, g, 0.06, 0.65, 0.12, { rz: 0.2 });
  }),
  lucky_cat: prop([0.45, 0.4, 0.6], (k, g) => {
    k.box(0.4, 0.06, 0.34, C.red, g, 0, 0.03, 0, soft);
    oval(k, g, C.white, 0, 0.24, 0, 0.155, 0.19, 0.13);
    oval(k, g, C.white, 0, 0.44, 0, 0.16, 0.13, 0.135);
    for (const x of [-0.11, 0.11]) {
      k.cone(0.065, 0.13, C.white, g, x, 0.53, 0, { seg: 4 });
      k.box(0.05, 0.05, 0.025, C.pot, g, x, 0.54, 0.04, { rz: Math.PI / 4 });
      oval(k, g, C.white, x * 0.8, 0.11, 0.1, 0.065, 0.055, 0.07);
    }
    for (const x of [-0.065, 0.065]) k.box(0.05, 0.025, 0.025, C.black, g, x, 0.457, 0.124, { rz: x > 0 ? -0.2 : 0.2 });
    k.ball(0.025, C.red, g, 0, 0.419, 0.14);
    k.box(0.23, 0.055, 0.08, C.red, g, 0, 0.335, 0.08, { r: 0.025 });
    k.ball(0.04, C.gold, g, 0, 0.315, 0.14, gold);
    oval(k, g, C.gold, -0.05, 0.22, 0.135, 0.075, 0.095, 0.025, gold);
    k.box(0.035, 0.11, 0.02, C.darkWood, g, -0.05, 0.22, 0.16);
    const arm = dynamic(k, g, 'waving-paw', 0.142, 0.29, 0.015);
    oval(k, arm, C.white, 0.018, 0.09, 0, 0.055, 0.12, 0.06);
    k.ball(0.058, C.white, arm, 0.018, 0.19, 0);
    k.ball(0.028, C.pot, arm, 0.018, 0.2, 0.048);
    g.userData.tick = t => { arm.rotation.x = -0.35 + Math.sin(t * 3) * 0.55; };
  }),
  camp_bed: prop([1.9, 0.75, 0.45], (k, g) => {
    for (const x of [-0.65, 0.65]) for (const sign of [-1, 1]) bar(k, g, C.metal, [x, 0.025, sign * 0.31], [x, 0.3, -sign * 0.31], 0.025);
    for (const z of [-0.34, 0.34]) k.box(1.9, 0.06, 0.06, C.dark, g, 0, 0.3, z);
    k.box(1.84, 0.08, 0.63, '#59816a', g, 0, 0.31, 0, { r: 0.04 });
    k.box(0.35, 0.1, 0.48, C.white, g, -0.63, 0.4, 0, soft);
    k.box(0.48, 0.09, 0.6, C.orange, g, 0.45, 0.395, 0, { r: 0.04 });
    k.box(0.1, 0.012, 0.58, C.cream, g, 0.45, 0.444, 0);
  }),
  rice_cooker: prop([0.6, 0.5, 0.9], (k, g) => {
    k.box(0.58, 0.44, 0.48, C.paleWood, g, 0, 0.22, 0, soft);
    k.box(0.42, 0.28, 0.02, C.wood, g, 0, 0.23, 0.24, { r: 0.025 });
    k.box(0.13, 0.05, 0.04, C.darkWood, g, 0, 0.3, 0.23);
    k.cyl(0.2, 0.18, 0.21, C.white, g, 0, 0.555, 0);
    oval(k, g, C.white, 0, 0.66, 0, 0.2, 0.055, 0.19);
    k.box(0.18, 0.07, 0.08, C.dark, g, 0, 0.715, 0, soft);
    for (const x of [-0.22, 0.22]) k.box(0.1, 0.065, 0.13, C.dark, g, x, 0.61, 0, soft);
    k.box(0.12, 0.07, 0.025, C.dark, g, 0, 0.55, 0.188, soft);
    k.ball(0.026, lit(k, C.orange), g, 0, 0.56, 0.207);
    const steam = [];
    for (let i = 0; i < 3; i++) { const p = dynamic(k, g, `steam-${i}`); k.ball(0.04, C.white, p, 0, 0, 0, { alpha: 0.5, cast: false }); steam.push(p); }
    g.userData.tick = t => { for (let i = 0; i < 3; i++) { const phase = (t * 0.5 + i / 3) % 1; const m = steam[i]; m.position.set(Math.sin(phase * 5 + i) * 0.035, 0.75 + phase * 0.11, -0.07); m.scale.setScalar(0.5 + Math.sin(phase * Math.PI) * 0.5); } };
  }),
  bunk_bed: prop([2, 1, 1.8], (k, g) => {
    for (const x of [-0.94, 0.94]) for (const z of [-0.44, 0.44]) k.box(0.08, 1.8, 0.08, C.dark, g, x, 0.9, z, { r: 0.025 });
    for (const y of [0.32, 1.25]) {
      k.box(1.92, 0.1, 0.88, C.metal, g, 0, y, 0, soft);
      k.box(1.8, 0.12, 0.81, C.white, g, 0, y + 0.11, 0, soft);
      k.box(0.95, 0.055, 0.82, y < 1 ? C.blue : C.teal, g, 0.35, y + 0.19, 0, { r: 0.025 });
      k.box(0.34, 0.12, 0.57, C.cream, g, -0.63, y + 0.22, 0, soft);
      for (const x of [-0.94, 0.94]) k.box(0.07, 0.09, 0.88, C.dark, g, x, y + 0.38, 0);
    }
    k.box(1.85, 0.07, 0.07, C.dark, g, 0, 1.65, -0.44);
    k.box(1.05, 0.07, 0.07, C.dark, g, -0.34, 1.65, 0.44);
    for (const x of [0.42, 0.8]) k.box(0.06, 1.55, 0.06, C.metal, g, x, 0.775, 0.46);
    for (const y of [0.25, 0.55, 0.85, 1.15, 1.45]) k.box(0.39, 0.06, 0.06, C.metal, g, 0.61, y, 0.46);
  }),
  clothes_rack: prop([1.5, 0.4, 1.7], (k, g) => {
    for (const x of [-0.68, 0.68]) {
      k.box(0.11, 0.07, 0.4, C.dark, g, x, 0.035, 0, soft);
      k.cyl(0.035, 0.035, 1.58, C.metal, g, x, 0.86, 0);
    }
    bar(k, g, C.metal, [-0.7, 1.65, 0], [0.7, 1.65, 0]);
    for (let i = 0; i < 3; i++) {
      const x = -0.43 + i * 0.43, color = [C.red, C.white, C.blue][i];
      k.torus(0.055, 0.025, C.wood, g, x, 1.59, 0, { arc: Math.PI * 1.6 });
      bar(k, g, C.wood, [x, 1.54, 0], [x - 0.15, 1.43, 0], 0.025);
      bar(k, g, C.wood, [x, 1.54, 0], [x + 0.15, 1.43, 0], 0.025);
      k.box(0.27, 0.5, 0.11, color, g, x, 1.17, 0, soft);
      for (const sign of [-1, 1]) k.box(0.13, 0.24, 0.11, color, g, x + sign * 0.16, 1.32, 0, { r: 0.035, rz: sign * 0.5 });
      k.box(0.075, 0.07, 0.02, C.dark, g, x, 1.41, 0.062, { r: 0.025 });
    }
  }),
  water_dispenser: prop([0.4, 0.4, 1.1], (k, g) => {
    k.box(0.36, 0.7, 0.36, C.white, g, 0, 0.35, 0, soft);
    k.box(0.25, 0.25, 0.012, C.dark, g, 0, 0.49, 0.184, { r: 0.025 });
    for (const [x, color] of [[-0.075, C.blue], [0.075, C.red]]) k.box(0.06, 0.07, 0.03, color, g, x, 0.56, 0.184);
    k.box(0.27, 0.045, 0.06, C.metal, g, 0, 0.36, 0.17);
    k.cyl(0.1, 0.1, 0.08, C.blue, g, 0, 0.73, 0);
    k.cyl(0.14, 0.1, 0.1, C.blue, g, 0, 0.79, 0, { alpha: 0.75 });
    k.cyl(0.14, 0.14, 0.2, C.blue, g, 0, 0.94, 0, { alpha: 0.75 });
    oval(k, g, C.blue, 0, 1.04, 0, 0.14, 0.05, 0.14, { alpha: 0.75 });
    for (const y of [0.87, 1.01]) k.torus(0.14, 0.015, '#8ccaff', g, 0, y, 0, { rx: Math.PI / 2 });
  }),
  e_bike: prop([1.7, 0.6, 1.1], (k, g) => bicycle(k, g, C.teal, true)),
  fish_tank: prop([1, 0.4, 1.3], (k, g) => {
    k.box(0.95, 0.62, 0.38, C.darkWood, g, 0, 0.31, 0, soft);
    for (const x of [-0.23, 0.23]) k.box(0.38, 0.44, 0.02, C.wood, g, x, 0.32, 0.189, { r: 0.025 });
    for (const y of [0.66, 1.26]) k.box(1, 0.08, 0.4, C.dark, g, 0, y, 0, { r: 0.025 });
    k.box(0.91, 0.055, 0.32, C.paleWood, g, 0, 0.72, 0);
    k.box(0.91, 0.45, 0.31, C.blue, g, 0, 0.97, 0, { alpha: 0.13, cast: false });
    for (const z of [-0.19, 0.19]) k.box(0.96, 0.53, 0.02, C.glass, g, 0, 0.96, z, glass);
    for (const x of [-0.48, 0.48]) k.box(0.02, 0.53, 0.36, C.glass, g, x, 0.96, 0, glass);
    for (let i = 0; i < 3; i++) oval(k, g, C.leafDark, -0.34 + i * 0.06, 0.83 + (i % 2) * 0.05, -0.07, 0.035, 0.12, 0.035, { rz: (i - 1) * 0.3 });
    oval(k, g, C.metal, 0.28, 0.78, 0.02, 0.11, 0.055, 0.09);
    const fish = dynamic(k, g, 'fish', 0, 1.01, 0);
    oval(k, fish, C.red, 0, 0, 0, 0.12, 0.065, 0.055);
    k.cone(0.065, 0.09, C.orange, fish, -0.125, 0, 0, { rz: -Math.PI / 2, seg: 3 });
    for (const z of [-0.047, 0.047]) k.ball(0.025, C.black, fish, 0.065, 0.02, z);
    k.box(0.73, 0.025, 0.08, lit(k, C.cream), g, 0, 1.21, 0);
    g.userData.tick = t => { const phase = t * 0.75; fish.position.x = Math.sin(phase) * 0.2; fish.position.y = 1.01 + Math.sin(t * 1.5) * 0.025; fish.rotation.y = Math.atan2(Math.sin(phase) * 0.2, Math.cos(phase)); };
  }),
  // The one wall-mounted exception: its origin is the banner's centre.
  scroll: prop([1.2, 0.08, 0.6], (k, g) => {
    k.box(1.1, 0.53, 0.025, C.red, g, 0, 0, 0);
    k.box(1.02, 0.42, 0.012, C.cream, g, 0, 0, 0.019);
    for (const y of [-0.265, 0.265]) k.cyl(0.035, 0.035, 1.2, C.darkWood, g, 0, y, 0, { rz: Math.PI / 2 });
    for (let i = 0; i < 4; i++) {
      const x = -0.38 + i * 0.25;
      k.box(0.06, 0.25, 0.012, C.black, g, x, 0, 0.031, { rz: -0.15 + i * 0.12 });
      k.box(0.16, 0.05, 0.012, C.black, g, x + 0.01, 0.06, 0.031, { rz: 0.14 });
      k.box(0.12, 0.05, 0.012, C.black, g, x + 0.03, -0.08, 0.031, { rz: -0.45 });
    }
  }),
  tree_round: prop([1.6, 1.6, 3.2], (k, g) => {
    k.cyl(0.13, 0.22, 1.9, C.wood, g, 0, 0.95, 0);
    bar(k, g, C.darkWood, [0, 1.35, 0], [-0.35, 2.1, 0], 0.08);
    oval(k, g, C.leafDark, 0, 2.35, 0, 0.78, 0.75, 0.78, { seg: 10 });
    oval(k, g, C.leaf, -0.18, 2.69, 0.08, 0.55, 0.5, 0.55, { seg: 10 });
    oval(k, g, '#88cd70', 0.3, 2.42, 0.25, 0.45, 0.45, 0.46, { seg: 10 });
  }),
  tree_palm: prop([1.4, 1.4, 5], (k, g) => {
    k.cyl(0.105, 0.19, 4.2, C.wood, g, 0, 2.1, 0, { seg: 10 });
    for (const y of [0.45, 1.12, 1.79, 2.46, 3.13, 3.8]) k.cyl(0.14, 0.15, 0.12, C.darkWood, g, 0, y, 0, { seg: 10 });
    for (let i = 0; i < 7; i++) {
      const p = k.group(g, 0, 4.26, 0, i * Math.PI * 2 / 7);
      oval(k, p, i % 2 ? C.leaf : C.leafDark, 0.33, 0.13, 0, 0.36, 0.105, 0.13, { rz: 0.32 });
      oval(k, p, i % 2 ? C.leaf : C.leafDark, 0.55, -0.08, 0, 0.12, 0.27, 0.1, { rz: 0.3 });
    }
    for (const x of [-0.11, 0.11]) k.ball(0.11, C.darkWood, g, x, 4.13, 0.1);
    oval(k, g, C.leaf, 0, 4.58, 0, 0.12, 0.4, 0.1, { rz: -0.15 });
  }),
  bush: prop([0.9, 0.9, 0.6], (k, g) => {
    k.cyl(0.28, 0.3, 0.1, C.darkWood, g, 0, 0.05, 0);
    for (const [x, y, z, r] of [[-0.18, 0.27, 0, 0.26], [0.18, 0.28, 0.08, 0.26], [0, 0.32, -0.17, 0.27], [0, 0.38, 0.15, 0.22]])
      k.ball(r, x < 0 ? C.leafDark : C.leaf, g, x, y, z, { seg: 10 });
    for (const [x, y, z] of [[-0.18, 0.48, 0.1], [0.21, 0.45, 0.23], [0.05, 0.53, -0.12]]) k.ball(0.04, C.yellow, g, x, y, z);
  }),
  street_lamp: prop([0.4, 0.4, 3.6], (k, g) => {
    k.cyl(0.14, 0.19, 0.23, C.dark, g, 0, 0.115, 0);
    k.cyl(0.045, 0.075, 2.82, C.dark, g, 0, 1.62, 0);
    k.cyl(0.16, 0.12, 0.36, lit(k, C.cream), g, 0, 3.18, 0, { seg: 6 });
    k.cyl(0.19, 0.19, 0.06, C.dark, g, 0, 2.98, 0, { seg: 6 });
    k.cone(0.2, 0.2, C.dark, g, 0, 3.46, 0, { seg: 6 });
    for (const x of [-0.12, 0.12]) for (const z of [-0.08, 0.08]) bar(k, g, C.dark, [x, 3, z], [x, 3.37, z], 0.025);
  }),
  bench: prop([1.6, 0.5, 0.8], (k, g) => {
    feet(k, g, 1.2, 0.3, 0.37, C.dark, 0, 0.07);
    for (const z of [-0.16, 0, 0.16]) k.box(1.6, 0.08, 0.14, C.wood, g, 0, 0.41, z, { r: 0.025 });
    for (const x of [-0.6, 0.6]) k.box(0.06, 0.36, 0.06, C.dark, g, x, 0.61, -0.2);
    for (const y of [0.57, 0.74]) k.box(1.6, 0.12, 0.065, C.paleWood, g, 0, y, -0.21, { r: 0.025 });
  }),
  fire_hydrant: prop([0.35, 0.35, 0.7], (k, g) => {
    k.cyl(0.15, 0.17, 0.07, C.dark, g, 0, 0.035, 0);
    k.cyl(0.105, 0.12, 0.47, C.red, g, 0, 0.305, 0);
    oval(k, g, C.red, 0, 0.56, 0, 0.13, 0.1, 0.13);
    k.cyl(0.05, 0.05, 0.07, C.gold, g, 0, 0.665, 0, { seg: 6 });
    k.cyl(0.07, 0.07, 0.34, C.red, g, 0, 0.41, 0, { rz: Math.PI / 2 });
    for (const x of [-0.15, 0.15]) k.cyl(0.08, 0.08, 0.04, C.gold, g, x, 0.41, 0, { rz: Math.PI / 2, seg: 6 });
    k.cyl(0.08, 0.08, 0.08, C.gold, g, 0, 0.29, 0.125, { rx: Math.PI / 2, seg: 6 });
  }),
  shared_bike: prop([1.7, 0.5, 1], (k, g) => bicycle(k, g, C.yellow, false, true)),
  traffic_cone: prop([0.35, 0.35, 0.5], (k, g) => {
    k.box(0.35, 0.055, 0.35, C.dark, g, 0, 0.0275, 0, { r: 0.025 });
    k.cyl(0.025, 0.135, 0.44, C.orange, g, 0, 0.275, 0, { seg: 12 });
    k.cyl(0.065, 0.09, 0.1, C.white, g, 0, 0.295, 0, { seg: 12 });
  }),
  mailbox: prop([0.5, 0.4, 1.1], (k, g) => {
    k.box(0.3, 0.07, 0.3, C.dark, g, 0, 0.035, 0, soft);
    k.box(0.09, 0.57, 0.09, C.dark, g, 0, 0.35, 0, soft);
    k.box(0.47, 0.43, 0.35, C.blue, g, 0, 0.835, 0, { r: 0.09 });
    k.box(0.31, 0.055, 0.025, C.black, g, 0, 0.92, 0.181, { r: 0.02 });
    k.box(0.22, 0.14, 0.015, C.white, g, 0, 0.76, 0.182, { r: 0.015 });
    for (const sign of [-1, 1]) k.box(0.13, 0.025, 0.012, C.blue, g, sign * 0.05, 0.79, 0.194, { rz: sign * 0.5 });
    k.box(0.04, 0.27, 0.07, C.red, g, 0.23, 0.91, 0);
    k.box(0.04, 0.12, 0.18, C.red, g, 0.23, 1.04, 0.055);
  }),
  parcels: prop([1, 0.8, 0.7], (k, g) => {
    carton(k, g, -0.23, 0, 0.05, 0.5, 0.32, 0.6);
    carton(k, g, 0.26, 0, 0.11, 0.43, 0.23, 0.51, C.paleWood);
    carton(k, g, -0.21, 0.333, -0.02, 0.43, 0.31, 0.43, C.pot);
    carton(k, g, 0.27, 0.243, 0.11, 0.35, 0.13, 0.4, C.cream);
  }),
};

// ── Botanical silhouettes: branching trunks and layered, asymmetric crowns ──
function leaf(k, g, x, y, z, length, width, angle, color = C.leaf) {
  const p = k.group(g, x, y, z, angle);
  // A folded, curved blade with an actual ridge, not an ellipsoid leaf.
  const key = `prop-leaf-${length}-${width}`;
  const geo = k.geo(key, () => {
    const a = [], uv = [], idx = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6, w = Math.sin(t * Math.PI) * width;
      for (const side of [-1, 0, 1]) { a.push(side * w, length * (t * 0.65 - t * t * 0.32) + (side === 0 ? w * 0.22 : 0), t * length); uv.push((side + 1) / 2, t); }
    }
    for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) { const n = i * 3 + j; idx.push(n, n + 3, n + 1, n + 1, n + 3, n + 4); }
    const b = new k.THREE.BufferGeometry(); b.setAttribute('position', new k.THREE.Float32BufferAttribute(a, 3)); b.setAttribute('uv', new k.THREE.Float32BufferAttribute(uv, 2)); b.setIndex(idx); b.computeVertexNormals(); return b;
  });
  k.put(geo, material(k, color, 'foliage', 0.83, 0, { side: true }), p);
  bar(k, p, C.leafDark, [0, 0, 0], [0, length * 0.33, length], 0.006);
}
function crown(k, g, x, y, z, radius, seed = 0, sy = 1, paletteSeed = seed) {
  const greens = [
    ['#285b3a', '#438452', '#6c9f59'],
    ['#3a6142', '#618653', '#8ba36b'],
    ['#294f43', '#487665', '#6b9676'],
  ][(paletteSeed >>> 0) % 3];
  for (let i = 0; i < 17; i++) {
    const a = i * 2.39996, ring = i < 5 ? 0.48 : 0.64;
    const h = (i < 5 ? 0.28 : i < 11 ? -0.12 : 0.02) * radius;
    const r = radius * (0.35 + hash(seed, i) * 0.17);
    oval(k, g, material(k, greens[i % 3], 'foliage', 0.92), x + Math.cos(a) * radius * ring, y + h * sy, z + Math.sin(a) * radius * ring, r, r * sy, r * 0.88, { seg: 12 });
  }
  oval(k, g, material(k, greens[2], 'foliage', 0.92), x, y + radius * 0.4 * sy, z, radius * 0.5, radius * 0.4 * sy, radius * 0.5);
}
function tree(k, g, w, h, o, street = false) {
  const seed = o.seed | 0, trunk = material(k, seed % 2 ? '#797164' : '#8a7456', 'wood', 0.94);
  k.cyl(w * 0.047, w * 0.08, h * 0.64, trunk, g, 0, h * 0.32, 0);
  for (let i = 0; i < 5; i++) {
    const a = i * 2.4 + hash(seed, 30), bx = Math.cos(a) * w * 0.24, bz = Math.sin(a) * w * 0.24;
    bar(k, g, trunk, [0, h * 0.4, 0], [bx, h * 0.72, bz], w * 0.025);
    bar(k, g, trunk, [bx, h * 0.72, bz], [bx * 1.3, h * 0.83, bz * 1.3], w * 0.012);
    bar(k, g, trunk, [0, 0.16, 0], [Math.cos(a) * w * 0.19, w * 0.025, Math.sin(a) * w * 0.19], w * 0.025);
    if (street && !(seed % 2)) bar(k, g, trunk, [bx, h * 0.66, bz], [bx * 0.95, h * (0.36 + hash(seed, i) * 0.12), bz], 0.014);
  }
  crown(k, g, 0, h * (street && seed % 2 ? 0.79 : 0.77), 0, w * 0.45, seed, h * (street && seed % 2 ? 0.24 : 0.26) / (w * 0.45));
  if (street && !(seed % 2)) for (const dx of [-0.08, 0.07]) bar(k, g, trunk, [dx, 0.06, 0.05], [dx * 2, h * 0.57, -0.04], 0.04);
  if (street) {
    k.box(1.35, 0.035, 1.35, material(k, '#777d79', 'metal', 0.75, 0.6), g, 0, 0.018, 0);
    for (let i = -7; i <= 7; i++) for (const s of [-1, 1]) k.box(0.022, 0.008, 0.43, C.black, g, i * 0.075, 0.038, s * 0.43);
    for (const x of [-0.48, 0.48]) { bar(k, g, C.wood, [x, 0, 0], [x * 0.6, 1.2, 0], 0.035); bar(k, g, C.dark, [x * 0.6, 1.12, 0], [0, 1.12, 0], 0.012); }
  }
}
const legacySizes = Object.fromEntries(Object.entries(PROPS).map(([n, p]) => [n, [...p.size]]));
PROPS.tree_round = prop(legacySizes.tree_round, (k, g, o) => tree(k, g, 1.6, 3.2, o));
PROPS.tree_street = prop([2.4, 2.4, 4.6], (k, g, o) => tree(k, g, 2.4, 4.6, o, true));
PROPS.atrium_tree = prop(legacySizes.atrium_tree, (k, g, o) => {
  k.cyl(1.05, 1.05, 0.25, material(k, '#d6d1c3', 'stone'), g, 0, 0.125, 0);
  k.cyl(0.72, 0.72, 0.03, C.darkWood, g, 0, 0.26, 0);
  for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12; k.box(0.21, 0.08, 0.28, C.wood, g, Math.sin(a) * 0.88, 0.29, Math.cos(a) * 0.88, { ry: a, r: 0.015 }); }
  const p = k.group(g, 0, 0.28, 0); tree(k, p, 1.94, 3.92, o);
});
PROPS.bush = prop(legacySizes.bush, (k, g, o) => {
  k.cyl(0.3, 0.32, 0.07, material(k, '#62513b', 'stone'), g, 0, 0.035, 0);
  crown(k, g, 0, 0.31, 0, 0.4, o.seed, 0.64);
  for (let i = 0; i < 6; i++) k.ball(0.023, C.cream, g, Math.cos(i * 2.4) * 0.25, 0.42 + hash(o.seed, i) * 0.08, Math.sin(i * 2.4) * 0.25);
});
PROPS.tree_palm = prop(legacySizes.tree_palm, (k, g) => {
  k.cyl(0.075, 0.16, 4.25, material(k, '#987958', 'wood', 0.92), g, 0, 2.125, 0);
  for (let i = 0; i < 24; i++) k.cyl(0.086 + (24 - i) * 0.0025, 0.09 + (24 - i) * 0.0025, 0.035, C.darkWood, g, 0, 0.2 + i * 0.165, 0);
  for (let i = 0; i < 9; i++) {
    const p = k.group(g, 0, 4.3, 0, i * Math.PI * 2 / 9);
    k.tube([[0, 0, 0], [0, 0.3, 0.25], [0, 0.22, 0.47], [0, -0.12, 0.64]], 0.012, C.leafDark, p, 0, 0, 0);
    for (let j = 0; j < 7; j++) for (const s of [-1, 1]) leaf(k, p, 0, 0.25 * Math.sin(j / 7 * Math.PI), 0.07 + j * 0.074, 0.21 - j * 0.015, 0.028, s * 0.95, i % 2 ? C.leaf : C.leafDark);
  }
  for (let i = 0; i < 4; i++) leaf(k, g, 0, 4.47, 0, 0.45, 0.06, i * 1.57);
  for (const x of [-0.09, 0.09]) oval(k, g, C.darkWood, x, 4.2, 0.07, 0.08, 0.1, 0.075);
});
for (const [name, r, ph, h] of [['plant_small', 0.19, 0.25, 0.8], ['plant_tall', 0.23, 0.39, 1.7], ['money_tree', 0.25, 0.37, 1.6]]) {
  PROPS[name] = prop(legacySizes[name], (k, g, o) => {
    pot(k, g, r, ph);
    k.torus(r * 0.78, 0.012, C.paleWood, g, 0, 0.035, 0, { rx: Math.PI / 2 });
    for (let i = 0; i < 9; i++) { const a = i * 2.4; k.ball(0.022, material(k, '#78654d', 'stone'), g, Math.cos(a) * r * 0.65, ph + 0.02, Math.sin(a) * r * 0.65, { sy: 0.5 }); }
    if (name === 'money_tree') {
      for (const phase of [0, Math.PI]) k.tube(Array.from({ length: 9 }, (_, i) => [Math.cos(i * 1.4 + phase) * 0.045, ph + i * 0.085, Math.sin(i * 1.4 + phase) * 0.045]), 0.024, C.wood, g, 0, 0, 0);
      crown(k, g, 0, 1.32, 0, 0.29, o.seed, 0.8);
      k.torus(0.07, 0.017, C.red, g, 0, 0.68, 0, { rx: Math.PI / 2 });
      for (const s of [-1, 1]) k.box(0.04, 0.22, 0.015, material(k, C.red, 'fabric'), g, s * 0.045, 0.59, 0.06, { rz: s * 0.3 });
    } else {
      bar(k, g, C.leafDark, [0, ph, 0], [0, h * 0.92, 0], 0.012);
      for (let i = 0; i < 11; i++) {
        const y = ph + (h - ph) * (0.14 + i / 14), a = i * 2.4 + hash(o.seed, 1);
        leaf(k, g, 0, y, 0, r * (0.8 + hash(o.seed, i) * 0.2), r * 0.3, a, i % 3 ? C.leaf : C.leafDark);
      }
    }
  });
}
PROPS.tree_cypress = prop([1, 1, 5], (k, g, o) => {
  k.cyl(0.06, 0.13, 3.9, C.darkWood, g, 0, 1.95, 0);
  for (let i = 0; i < 12; i++) {
    const y = 0.7 + i * 0.35, r = 0.4 * (1 - i / 14);
    oval(k, g, material(k, i % 3 ? '#2c5940' : '#477651', 'foliage', 0.95), Math.sin(i * 2.4) * 0.045, y, Math.cos(i * 2.4) * 0.045, r, 0.46, r, { seg: 12 });
  }
});

// ── Office components ──
function monitor(k, root, o, x, y, z, width = 0.55, facing = Math.PI) {
  const p = k.group(root, x, y, z, facing);
  k.box(width * 0.43, 0.018, 0.19, C.dark, p, 0, 0.009, 0.035);
  k.box(0.045, 0.14, 0.045, C.metal, p, 0, 0.08, -0.015);
  k.box(width, width * 0.61, 0.044, C.black, p, 0, 0.28, 0, { r: 0.014 });
  const m = face(k, root, o, 'screen', width - 0.035, width * 0.61 - 0.04, x, y + 0.28, z + Math.cos(facing) * 0.024, facing);
  k.box(0.1, 0.018, 0.007, brand(o), p, 0, 0.29, -0.026);
  const back = k.group(p, 0, 0.2, -0.031, Math.PI);
  grille(k, back, 0, 0, 0, width * 0.5, 0.04, 3);
  k.tube([[0, 0.24, -0.04], [0.04, 0.14, -0.06], [0.01, 0.025, -0.1]], 0.007, C.black, p, 0, 0, 0);
  k.ball(0.006, lit(k, C.teal), p, width * 0.4, 0.125, 0.024);
  return m;
}
function desk(k, g, o, standing = false) {
  const top = standing ? 1.02 : 0.74;
  const woods = ['#bea17c', '#e1d7c6', '#765846'];
  const timber = material(k, woods[(o.seed >>> 0) % 3], 'wood', 0.52);
  k.box(1.5, 0.045, 0.75, timber, g, 0, top - 0.0225, 0, { r: 0.015 });
  for (const x of [-0.59, 0.59]) {
    k.box(0.09, top - 0.08, 0.08, C.white, g, x, (top - 0.08) / 2 + 0.03, 0.04);
    k.box(0.065, top * 0.45, 0.06, C.metal, g, x, top * 0.64, 0.04);
    k.box(0.12, 0.035, 0.62, C.dark, g, x, 0.035, 0);
    for (const z of [-0.26, 0.26]) k.cyl(0.035, 0.035, 0.02, C.black, g, x, 0.01, z);
  }
  k.box(1.18, 0.08, 0.06, C.dark, g, 0, top - 0.16, 0.12);
  k.box(0.7, 0.08, 0.16, C.dark, g, 0, top - 0.12, 0.23);
  k.tube([[0.19, top - 0.05, 0.24], [0.28, 0.4, 0.25], [0.43, 0.07, 0.23]], 0.012, C.black, g, 0, 0, 0);
  const mode = (o.seed >>> 0) % 3;
  monitor(k, g, o, mode ? 0.25 : 0, top, 0.15, mode === 1 ? 0.55 : 0.62);
  if (mode === 1) monitor(k, g, o, -0.33, top, 0.15, 0.55);
  if (mode === 2) {
    k.box(0.36, 0.018, 0.24, C.metal, g, -0.34, top + 0.012, -0.1);
    k.box(0.36, 0.23, 0.018, C.dark, g, -0.34, top + 0.13, 0.02);
    face(k, g, o, 'screen', 0.33, 0.2, -0.34, top + 0.13, 0.008, Math.PI);
  }
  const keyboard = material(k, '#dddcd4', 'plastic', 0.7);
  k.box(0.42, 0.019, 0.14, C.dark, g, 0.07, top + 0.01, -0.2);
  for (let row = 0; row < 4; row++) for (let col = 0; col < 12; col++) k.box(0.025, 0.006, 0.023, keyboard, g, -0.107 + col * 0.032, top + 0.023, -0.245 + row * 0.03, { r: 0.002 });
  k.box(0.18, 0.003, 0.2, material(k, '#34464d', 'fabric'), g, 0.42, top + 0.003, -0.18);
  oval(k, g, C.white, 0.42, top + 0.022, -0.17, 0.032, 0.022, 0.05);
  cup(k, g, -0.59, top, -0.22, material(k, brand(o), 'plastic', 0.18, 0, { clear: 0.6 }), 0.65);
  if (mode === 0) { const p = k.group(g, 0.57, top, 0.2); p.scale.setScalar(0.25); PROPS.plant_small.build(k, o).children.slice().forEach(c => p.add(c)); }
  if (mode === 1) {
    k.torus(0.065, 0.012, C.black, g, 0.59, top + 0.016, -0.1, { rx: Math.PI / 2, arc: Math.PI * 1.6 });
    for (const x of [0.53, 0.65]) k.box(0.03, 0.035, 0.055, C.dark, g, x, top + 0.02, -0.065);
  }
  if (mode === 2) { k.cyl(0.025, 0.025, 0.12, material(k, brand(o), 'metal', 0.3, 0.7), g, 0.59, top + 0.06, 0.19); k.cyl(0.023, 0.023, 0.006, C.metal, g, 0.59, top + 0.123, 0.19); }
  k.box(0.11, 0.002, 0.09, material(k, C.yellow, 'paper'), g, -0.58, top + 0.004, 0.03, { ry: 0.2 });
  if ((o.seed | 0) & 1) {
    const toy = k.group(g, 0.62, top, -0.22);
    k.cyl(0.042, 0.045, 0.012, C.dark, toy, 0, 0.006, 0);
    k.box(0.045, 0.06, 0.035, brand(o), toy, 0, 0.044, 0, { r: 0.012 });
    k.box(0.065, 0.045, 0.045, C.white, toy, 0, 0.095, 0, { r: 0.014 });
    for (const dx of [-0.018, 0.018]) k.ball(0.006, C.black, toy, dx, 0.096, -0.023, { seg: 8 });
    bar(k, toy, C.metal, [0, 0.115, 0], [0, 0.14, 0], 0.004);
    k.ball(0.008, brand(o), toy, 0, 0.14, 0, { seg: 8 });
  }
  if ((o.seed | 0) & 2) {
    const carton = material(k, '#c4a274', 'paper', 0.92);
    k.box(0.19, 0.045, 0.14, carton, g, -0.58, top + 0.027, 0.03, { r: 0.009 });
    k.box(0.2, 0.009, 0.15, carton, g, -0.58, top + 0.055, 0.03, { r: 0.005 });
    k.box(0.035, 0.002, 0.151, C.red, g, -0.58, top + 0.061, 0.03, { r: 0 });
    for (const dx of [-0.01, 0.01]) k.box(0.004, 0.004, 0.2, C.paleWood, g, -0.53 + dx, top + 0.065, 0.03, { ry: 0.25, r: 0 });
  }
  if (!standing) { k.box(0.18, 0.37, 0.34, C.black, g, 0.46, 0.21, 0.1); grille(k, g, 0.46, 0.24, 0.276, 0.13, 0.23, 9); k.ball(0.009, lit(k, brand(o)), g, 0.49, 0.36, 0.284); }
  else { k.box(0.12, 0.024, 0.04, C.black, g, 0.55, top - 0.048, -0.32); labelLines(k, g, 0.55, top - 0.045, -0.296, 0.06, 1, C.white); }
}
PROPS.desk_set = prop([1.5, 0.75, 1.25], (k, g, o) => desk(k, g, o));
PROPS.standing_desk = prop([1.5, 0.75, 1.5], (k, g, o) => desk(k, g, o, true));
PROPS.office_chair = prop([0.65, 0.65, 1.05], (k, g, o) => {
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5, x = Math.cos(a) * 0.27, z = Math.sin(a) * 0.27;
    bar(k, g, C.metal, [0, 0.15, 0], [x, 0.075, z], 0.025);
    for (const dx of [-0.018, 0.018]) k.cyl(0.035, 0.035, 0.018, C.black, g, x + dx, 0.035, z, { rz: Math.PI / 2 });
  }
  k.cyl(0.035, 0.045, 0.28, C.metal, g, 0, 0.26, 0);
  const fabric = material(k, '#3e4e52', 'fabric', 0.95);
  k.box(0.49, 0.09, 0.46, fabric, g, 0, 0.46, 0.025, { r: 0.035 });
  k.box(0.44, 0.44, 0.045, C.dark, g, 0, 0.75, -0.2, { r: 0.02, rx: -0.1 });
  for (let i = 0; i < 16; i++) k.box(0.008, 0.39, 0.012, fabric, g, -0.18 + i * 0.024, 0.75, -0.167, { r: 0 });
  for (let i = 0; i < 12; i++) k.box(0.39, 0.008, 0.012, material(k, '#71817e', 'fabric'), g, 0, 0.57 + i * 0.032, -0.158, { r: 0 });
  k.box(0.32, 0.05, 0.06, material(k, brand(o), 'fabric'), g, 0, 0.65, -0.14);
  k.box(0.24, 0.1, 0.08, fabric, g, 0, 0.995, -0.22, { r: 0.03 });
  for (const x of [-0.28, 0.28]) { bar(k, g, C.dark, [x * 0.7, 0.4, 0], [x, 0.64, 0], 0.018); k.box(0.065, 0.035, 0.23, C.black, g, x, 0.65, 0.02, { r: 0.015 }); }
  bar(k, g, C.metal, [0.1, 0.39, 0], [0.25, 0.4, 0.1], 0.009);
  k.box(0.06, 0.02, 0.03, C.black, g, 0.25, 0.4, 0.1);
});
PROPS.desk_lamp = prop([0.3, 0.3, 0.5], (k, g, o) => {
  k.cyl(0.115, 0.13, 0.035, C.dark, g, 0, 0.0175, 0);
  for (const z of [-0.015, 0.015]) { bar(k, g, C.metal, [0, 0.04, z], [-0.07, 0.26, z], 0.008); bar(k, g, C.metal, [-0.07, 0.26, z], [0.025, 0.42, z], 0.008); }
  for (const [x, y] of [[0, 0.06], [-0.07, 0.26], [0.025, 0.42]]) k.cyl(0.02, 0.02, 0.045, C.dark, g, x, y, 0, { rx: Math.PI / 2 });
  k.lathe([[0.075, 0], [0.075, 0.015], [0.033, 0.07], [0.015, 0.075]], material(k, brand(o), 'metal', 0.35, 0.7), g, 0.055, 0.415, 0.015);
  k.disc(0.064, lit(k, '#fff0c5'), g, 0.055, 0.416, 0.015, { rx: Math.PI / 2 });
  k.tube([[0, 0.03, 0], [-0.09, 0.25, -0.015], [0.025, 0.42, -0.02]], 0.005, C.black, g, 0, 0, 0);
});
PROPS.server_rack = prop([0.7, 1, 2.1], (k, g, o) => {
  const frame = material(k, '#263239', 'metal', 0.42, 0.7);
  k.box(0.7, 0.09, 1, frame, g, 0, 0.045, 0);
  k.box(0.7, 0.07, 1, frame, g, 0, 2.005, 0);
  for (const x of [-0.325, 0.325]) { k.box(0.05, 1.92, 0.97, frame, g, x, 1.035, 0); for (let j = 0; j < 21; j++) k.box(0.014, 0.014, 0.015, C.metal, g, x, 0.16 + j * 0.087, 0.491); }
  const leds = dynamic(k, g, 'leds');
  g.userData.own = [];
  for (let row = 0; row < 12; row++) {
    const y = 0.19 + row * 0.15;
    k.box(0.57, 0.13, 0.78, row % 3 ? C.dark : C.metal, g, 0, y, -0.01, { r: row % 3 ? 0.004 : 0.008 });
    for (let disk = 0; disk < 4; disk++) {
      const x = -0.19 + disk * 0.125;
      k.box(0.108, 0.09, 0.014, frame, g, x, y, 0.39, { r: 0.004 });
      for (let j = 0; j < 4; j++) k.box(0.066, 0.004, 0.006, C.black, g, x, y - 0.025 + j * 0.016, 0.402, { r: 0 });
    }
    for (const x of [-0.27, 0.27]) { k.box(0.013, 0.08, 0.035, C.metal, g, x, y, 0.412); screw(k, g, x, y + 0.045, 0.421, 0.006); }
    for (let j = 0; j < 2; j++) {
      const source = lit(k, j ? '#65dcb8' : '#e8b34b'), m = source.clone();
      m.onBeforeCompile = source.onBeforeCompile; m.customProgramCacheKey = source.customProgramCacheKey;
      g.userData.own.push(m); k.nightMats.push([m, 0.18, 2.6]);
      k.box(0.012, 0.008, 0.008, m, leds, 0.19 + j * 0.025, y, 0.425);
    }
  }
  // Open metal lattice door: actual holes instead of opaque faux perforations.
  for (let i = 0; i < 28; i++) k.box(0.004, 1.84, 0.006, frame, g, -0.285 + i * 0.021, 1.02, 0.47, { r: 0 });
  for (let i = 0; i < 48; i++) k.box(0.58, 0.003, 0.006, frame, g, 0, 0.115 + i * 0.038, 0.472, { r: 0 });
  k.box(0.023, 0.22, 0.035, C.metal, g, 0.27, 1, 0.493);
  for (let i = 0; i < 4; i++) k.tube([[-0.16 + i * 0.09, 1.92, -0.34], [-0.16 + i * 0.09, 2.06, -0.3], [0.21, 2.06, -0.1 + i * 0.04]], 0.012, [C.blue, C.yellow, C.black, C.teal][i], g, 0, 0, 0);
});
PROPS.rack_cooling = prop([0.7, 1, 2.1], (k, g, o) => {
  k.box(0.68, 2.1, 0.98, C.dark, g, 0, 1.05, 0, { r: 0.018 });
  grille(k, g, 0, 0.94, 0.493, 0.55, 1.55, 25, C.metal);
  k.box(0.3, 0.16, 0.016, C.black, g, 0, 1.9, 0.5);
  face(k, g, o, 'screen', 0.23, 0.1, 0, 1.9, 0.511);
  for (const y of [0.14, 1.75]) for (const x of [-0.29, 0.29]) screw(k, g, x, y, 0.504);
  k.box(0.018, 0.24, 0.03, C.metal, g, 0.29, 1.45, 0.511);
});
PROPS.whiteboard = prop([1.8, 0.5, 1.9], (k, g, o) => {
  for (const x of [-0.73, 0.73]) {
    k.box(0.04, 1.64, 0.04, C.metal, g, x, 0.9, 0);
    k.box(0.075, 0.04, 0.44, C.dark, g, x, 0.085, 0);
    for (const z of [-0.19, 0.19]) k.cyl(0.045, 0.045, 0.04, C.black, g, x, 0.045, z, { rz: Math.PI / 2 });
  }
  k.box(1.8, 1.2, 0.055, C.metal, g, 0, 1.29, 0, { r: 0.018 });
  k.box(1.73, 1.13, 0.012, material(k, '#f3f3e8', 'paint', 0.22, 0, { clear: 0.4 }), g, 0, 1.29, 0.034);
  k.box(1.3, 0.025, 0.12, C.metal, g, 0, 0.7, 0.05);
  for (const x of [-0.5, 0, 0.5]) { k.box(0.28, 0.18, 0.003, material(k, '#d2e5e0', 'paper'), g, x, 1.59, 0.043); labelLines(k, g, x, 1.62, 0.047, 0.19, 3, '#286462'); }
  for (const x of [-0.25, 0.25]) { bar(k, g, '#356566', [x - 0.09, 1.59, 0.046], [x + 0.09, 1.59, 0.046], 0.006); bar(k, g, '#356566', [x + 0.04, 1.63, 0.046], [x + 0.09, 1.59, 0.046], 0.006); }
  for (let i = 0; i < 7; i++) { k.box(0.1, 0.14 + i * 0.028, 0.003, [C.teal, C.blue, C.orange][i % 3], g, -0.64 + i * 0.15, 0.98 + i * 0.014, 0.043); }
  k.tube([[-0.72, 1.16, 0.046], [-0.39, 1.23, 0.046], [-0.15, 1.18, 0.046], [0.24, 1.38, 0.046]], 0.007, C.red, g, 0, 0, 0);
  for (let i = 0; i < 3; i++) { k.box(0.16, 0.15, 0.004, material(k, [C.yellow, C.pot, C.teal][i], 'paper'), g, 0.57, 1.33 - i * 0.2, 0.045, { rz: (hash(o.seed, i) - 0.5) * 0.18 }); labelLines(k, g, 0.57, 1.35 - i * 0.2, 0.049, 0.1, 3); }
  for (let i = 0; i < 3; i++) k.cyl(0.009, 0.009, 0.14, colors[i], g, -0.3 + i * 0.18, 0.725, 0.06, { rz: Math.PI / 2 });
});
PROPS.tv_wall = prop([2.2, 0.15, 1.3], (k, g, o) => {
  k.box(1.3, 0.7, 0.04, C.dark, g, 0, 0.65, 0.02);
  k.box(2.2, 1.3, 0.09, C.black, g, 0, 0.65, 0.095, { r: 0.02 });
  face(k, g, o, 'screen', 2.13, 1.21, 0, 0.665, 0.142);
  k.box(0.12, 0.012, 0.005, C.metal, g, 0, 0.027, 0.145);
  k.ball(0.006, lit(k, C.red), g, 0.96, 0.024, 0.144);
});
PROPS.poster_frame = prop([0.9, 0.05, 1.2], (k, g, o) => {
  k.box(0.9, 1.2, 0.04, material(k, '#907448', 'metal', 0.35, 0.7), g, 0, 0.6, 0.02);
  k.box(0.85, 1.15, 0.004, material(k, '#eee9da', 'paper'), g, 0, 0.6, 0.042);
  face(k, g, o, 'art', 0.74, 1.04, 0, 0.6, 0.046);
});
PROPS.pendant_lamp = prop([0.5, 0.5, 1.2], (k, g, o) => {
  k.cyl(0.075, 0.075, 0.03, C.dark, g, 0, -0.015, 0);
  k.cyl(0.008, 0.008, 0.87, C.black, g, 0, -0.455, 0);
  k.lathe([[0.24, 0], [0.24, 0.025], [0.2, 0.1], [0.08, 0.23], [0.04, 0.24]], material(k, brand(o, '#365958'), 'metal', 0.35, 0.6, { side: true }), g, 0, -1.17, 0);
  k.disc(0.223, lit(k, '#ffe2ad'), g, 0, -1.169, 0, { rx: Math.PI / 2 });
  k.ball(0.05, lit(k, '#fff2c7'), g, 0, -1.15, 0);
});
PROPS.wall_clock = prop([0.4, 0.06, 0.4], (k, g) => {
  k.cyl(0.2, 0.2, 0.045, C.dark, g, 0, 0.2, 0, { rx: Math.PI / 2 });
  k.disc(0.181, material(k, '#ecebdc', 'paper'), g, 0, 0.2, 0.024);
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; k.box(0.008, i % 3 ? 0.016 : 0.025, 0.002, C.black, g, Math.sin(a) * 0.158, 0.2 + Math.cos(a) * 0.158, 0.026, { rz: -a, r: 0 }); }
  bar(k, g, C.dark, [0, 0.2, 0.027], [-0.07, 0.24, 0.027], 0.006);
  bar(k, g, C.dark, [0, 0.2, 0.027], [0.05, 0.3, 0.027], 0.004);
  k.cyl(0.01, 0.01, 0.004, C.red, g, 0, 0.2, 0.027, { rx: Math.PI / 2 });
});
PROPS.fire_extinguisher = prop([0.25, 0.2, 0.6], (k, g) => {
  k.cyl(0.08, 0.084, 0.36, material(k, '#bd3731', 'paint', 0.3, 0.4), g, -0.025, 0.22, 0);
  oval(k, g, C.red, -0.025, 0.405, 0, 0.08, 0.055, 0.08);
  k.cyl(0.082, 0.082, 0.035, C.black, g, -0.025, 0.0175, 0);
  k.cyl(0.024, 0.03, 0.06, C.gold, g, -0.025, 0.47, 0);
  k.box(0.13, 0.018, 0.035, C.dark, g, 0.01, 0.52, 0, { rz: 0.12 });
  k.tube([[0.01, 0.49, -0.03], [0.09, 0.51, -0.03], [0.095, 0.25, -0.03], [0.08, 0.2, 0.01]], 0.013, C.black, g, 0, 0, 0);
  k.cyl(0.026, 0.026, 0.015, C.metal, g, -0.025, 0.48, 0.04, { rx: Math.PI / 2 });
  k.disc(0.021, C.white, g, -0.025, 0.48, 0.049);
  k.box(0.085, 0.14, 0.004, material(k, C.white, 'paper'), g, -0.025, 0.27, 0.081);
  labelLines(k, g, -0.025, 0.31, 0.084, 0.06, 5);
});
PROPS.ac_split = prop([0.9, 0.25, 0.3], (k, g) => {
  k.box(0.9, 0.3, 0.25, C.white, g, 0, 0.15, 0, { r: 0.025 });
  grille(k, g, 0, 0.065, 0.12, 0.76, 0.065, 4, C.white);
  k.box(0.06, 0.012, 0.003, lit(k, '#91cfca'), g, 0.31, 0.2, 0.127);
  for (const x of [-0.4, 0.4]) screw(k, g, x, 0.05, 0.128, 0.006);
});
PROPS.locker = prop([1.2, 0.5, 1.9], (k, g, o) => {
  k.box(1.2, 1.9, 0.49, C.dark, g, 0, 0.95, 0);
  for (let col = 0; col < 3; col++) for (let row = 0; row < 2; row++) {
    const x = (col - 1) * 0.39, y = 0.49 + row * 0.93;
    k.box(0.375, 0.9, 0.022, material(k, col === 1 ? brand(o) : '#c1cbc5', 'paint', 0.5, 0.5), g, x, y, 0.246);
    grille(k, g, x, y + 0.3, 0.26, 0.23, 0.09, 4);
    k.box(0.025, 0.13, 0.02, C.metal, g, x + 0.11, y, 0.266);
    k.box(0.075, 0.035, 0.004, C.white, g, x, y + 0.2, 0.262);
    labelLines(k, g, x, y + 0.203, 0.265, 0.04, 1);
    for (const dy of [-0.3, 0.3]) k.box(0.014, 0.06, 0.025, C.metal, g, x - 0.174, y + dy, 0.25);
  }
});
PROPS.glass_room = prop([4.2, 3.2, 2.6], (k, g, o) => {
  const glassMat = material(k, '#bbd5d6', 'plastic', 0.08, 0.12, { alpha: 0.16, side: true });
  for (const y of [0.025, 2.565]) {
    for (const z of [-1.57, 1.57]) k.box(4.2, 0.05, 0.06, C.dark, g, 0, y, z);
    for (const x of [-2.07, 2.07]) k.box(0.06, 0.05, 3.08, C.dark, g, x, y, 0);
  }
  for (const z of [-1.57, 1.57]) for (let i = 0; i < 5; i++) k.box(0.035, 2.56, 0.04, C.dark, g, -2.065 + i * 1.0325, 1.3, z);
  for (const x of [-2.07, 2.07]) for (const z of [-0.52, 0.52]) k.box(0.04, 2.56, 0.035, C.dark, g, x, 1.3, z);
  for (const z of [-1.57, 1.57]) for (let i = 0; i < 4; i++) k.plane(1.005, 2.49, glassMat, g, -1.549 + i * 1.0325, 1.3, z);
  for (const x of [-2.07, 2.07]) k.plane(3.08, 2.49, glassMat, g, x, 1.3, 0, { ry: Math.PI / 2 });
  for (const z of [-1.575, 1.575]) for (let i = 0; i < 12; i++) k.box(0.19, 0.025, 0.004, C.white, g, -1.9 + i * 0.34, 1.2, z, { r: 0 });
  k.box(0.025, 0.35, 0.065, C.metal, g, 1.18, 1.12, 1.59);
  const table = PROPS.meeting_table.build(k, o); table.scale.set(0.94, 1, 0.9); g.add(table);
  k.box(1.15, 0.67, 0.04, C.black, g, 0, 1.74, -1.5);
  face(k, g, o, 'screen', 1.1, 0.61, 0, 1.74, -1.475);
  for (const x of [-0.62, 0.62]) k.box(0.3, 0.025, 0.21, C.white, g, x, 0.8, 0);
});
PROPS.pantry = prop([2.6, 0.7, 2.1], (k, g, o) => {
  k.box(2.6, 2.1, 0.035, material(k, '#e2e0d4', 'plaster'), g, 0, 1.05, -0.33);
  k.box(2.55, 0.75, 0.58, C.wood, g, 0, 0.375, -0.01);
  for (let i = 0; i < 4; i++) { const x = -0.96 + i * 0.64; k.box(0.61, 0.67, 0.025, C.paleWood, g, x, 0.4, 0.295); k.box(0.17, 0.018, 0.028, C.dark, g, x, 0.65, 0.315); }
  k.box(2.6, 0.055, 0.69, material(k, '#ddd6c7', 'stone', 0.3), g, 0, 0.7775, 0);
  k.box(0.58, 0.012, 0.4, C.metal, g, -0.65, 0.81, 0);
  k.box(0.49, 0.008, 0.31, C.dark, g, -0.65, 0.818, 0);
  k.tube([[-0.65, 0.8, -0.21], [-0.65, 1.1, -0.21], [-0.65, 1.1, -0.04], [-0.65, 1.02, -0.04]], 0.017, C.metal, g, 0, 0, 0);
  for (const x of [-0.87, -0.65, -0.43]) k.box(0.025, 0.008, 0.12, C.metal, g, x, 0.823, 0);
  for (const x of [-0.82, 0]) { k.box(0.79, 0.56, 0.3, C.paleWood, g, x, 1.8, -0.16); k.box(0.12, 0.02, 0.02, C.dark, g, x, 1.58, 0.004); }
  k.box(0.52, 0.32, 0.37, C.dark, g, 0.75, 0.97, -0.05);
  k.box(0.41, 0.23, 0.012, C.black, g, 0.71, 0.98, 0.142); grille(k, g, 0.71, 0.98, 0.151, 0.32, 0.16, 8);
  k.box(0.023, 0.16, 0.025, C.metal, g, 0.92, 0.98, 0.16);
  k.box(0.33, 0.4, 0.3, C.white, g, 0.06, 1.01, -0.06);
  k.box(0.26, 0.2, 0.02, C.black, g, 0.06, 0.99, 0.096);
  k.cyl(0.04, 0.04, 0.025, C.metal, g, 0.06, 1.125, 0.112, { rx: Math.PI / 2 }); cup(k, g, 0.06, 0.82, 0.12, C.white, 0.65);
  for (const y of [1.32, 1.65, 1.98]) {
    k.box(0.65, 0.025, 0.25, C.wood, g, 0.88, y, -0.17);
    for (let i = 0; i < 4; i++) { k.box(0.1, 0.19, 0.08, material(k, colors[i], 'paper'), g, 0.64 + i * 0.15, y + 0.11, -0.14); k.box(0.055, 0.05, 0.003, C.cream, g, 0.64 + i * 0.15, y + 0.12, -0.097); }
  }
  k.box(1.5, 0.012, 0.05, lit(k, '#fff2cc'), g, -0.43, 1.51, -0.05);
});
PROPS.gong = prop([1, 0.5, 1.5], (k, g) => {
  for (const x of [-0.44, 0.44]) { k.box(0.08, 1.44, 0.08, C.darkWood, g, x, 0.75, 0); k.box(0.15, 0.06, 0.5, C.darkWood, g, x, 0.03, 0); }
  k.box(1, 0.07, 0.1, C.darkWood, g, 0, 1.465, 0);
  const bronze = material(k, '#b18a44', 'bronze', 0.4, 0.86);
  k.cyl(0.33, 0.33, 0.025, bronze, g, 0, 0.96, 0, { rx: Math.PI / 2 });
  for (const r of [0.12, 0.21, 0.31]) k.torus(r, 0.008, bronze, g, 0, 0.96, 0.018);
  oval(k, g, bronze, 0, 0.96, 0.025, 0.11, 0.11, 0.035);
  for (const x of [-0.18, 0.18]) bar(k, g, C.black, [x, 1.43, 0], [x, 1.23, 0], 0.007);
  bar(k, g, C.wood, [0.36, 0.65, 0.15], [0.36, 1.13, 0.15], 0.018);
  k.ball(0.055, material(k, '#cfa67b', 'fabric'), g, 0.36, 1.13, 0.15);
});
PROPS.neon_slogan = prop([2.4, 0.12, 0.6], (k, g, o) => {
  k.box(2.4, 0.6, 0.04, C.black, g, 0, 0.3, 0.02);
  const neon = lit(k, brand(o));
  for (let i = 0; i < 7; i++) { const x = -1.05 + i * 0.32; k.tube([[x, 0.12, 0.075], [x + 0.06, 0.39, 0.075], [x + 0.17, 0.46, 0.075], [x + 0.19, 0.22, 0.075], [x + 0.07, 0.22, 0.075], [x + 0.25, 0.13, 0.075]], 0.012, neon, g, 0, 0, 0); }
  for (const x of [-1.14, 1.14]) for (const y of [0.06, 0.54]) screw(k, g, x, y, 0.044, 0.014);
});

// ── Vehicles: +Z nose, suspension-height hubs, independently retained wheels ──
function roadWheel(k, g, x, z, radius, width) {
  const p = dynamic(k, g, 'wheel', x, radius, z);
  const rubber = material(k, '#20252a', 'rubber', 0.94), rim = material(k, '#b4bdc0', 'metal', 0.24, 0.88);
  k.cyl(radius, radius, width, rubber, p, 0, 0, 0, { rz: Math.PI / 2, seg: 24 });
  for (const side of [-1, 1]) {
    const q = k.group(p, side * (width / 2 + 0.002), 0, 0); q.rotation.y = Math.PI / 2;
    k.torus(radius * 0.72, 0.018, rim, q, 0, 0, 0);
    k.disc(radius * 0.62, C.dark, q, 0, 0, 0, { side: true });
    for (let j = 0; j < 5; j++) { const a = j * Math.PI * 2 / 5; bar(k, q, rim, [0, 0, 0.005], [Math.sin(a) * radius * 0.63, Math.cos(a) * radius * 0.63, 0.005], 0.013); }
    k.cyl(radius * 0.18, radius * 0.18, 0.018, rim, q, 0, 0, 0.009, { rx: Math.PI / 2 });
  }
  for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; k.box(width * 0.65, 0.006, radius * 0.12, C.dark, p, 0, Math.cos(a) * radius * 0.996, Math.sin(a) * radius * 0.996, { rx: a, r: 0 }); }
  return p;
}
function legacyVehicle(k, g, o, type, w, d, h) {
  const van = type === 'food', suv = type === 'suv';
  const wheelR = van ? 0.32 : 0.27;
  const paint = material(k, brand(o, '#528e88'), 'paint', 0.35, 0.35, { clear: 0.8 });
  const glassMat = k.mat('#192f3e', { rough: 0.08, metal: 0.4, clear: 0.7 });
  const chrome = material(k, '#a9b3b8', 'metal', 0.24, 0.85);
  const bodyH = van ? 0.7 : 0.5, bodyY = wheelR + bodyH * 0.46;
  k.box(w * 0.91, bodyH, d * 0.96, paint, g, 0, bodyY, 0, { r: 0.075 });
  k.box(w * 0.72, 0.1, d * 0.8, C.black, g, 0, wheelR * 0.7, 0, { r: 0.02 });
  const roof = h - 0.03;
  const cabinBase = bodyY + bodyH * 0.36, cabD = van ? d * 0.9 : type === 'sedan' ? d * 0.54 : d * 0.64;
  const cabZ = van ? -d * 0.01 : -d * 0.09;
  k.box(w * 0.79, roof - cabinBase, cabD, paint, g, 0, (roof + cabinBase) / 2, cabZ, { r: 0.055 });
  const windowH = (roof - cabinBase) * 0.68, windowY = roof - windowH * 0.59 - 0.06;
  k.box(w * 0.68, windowH, 0.018, glassMat, g, 0, windowY, cabZ + cabD / 2 + 0.003, { r: 0.018, rx: van ? -0.08 : -0.17 });
  k.box(w * 0.66, windowH * 0.83, 0.016, glassMat, g, 0, windowY, cabZ - cabD / 2 - 0.003, { r: 0.018, rx: 0.12 });
  const windowCount = van ? 1 : 2;
  for (const s of [-1, 1]) {
    for (let j = 0; j < windowCount; j++) {
      const wz = van ? d * 0.31 : cabZ + (j - 0.5) * cabD * 0.47;
      k.box(0.018, windowH, van ? d * 0.16 : cabD * 0.42, glassMat, g, s * w * 0.398, windowY, wz, { r: 0.014 });
      k.box(0.012, 0.022, 0.12, chrome, g, s * w * 0.46, bodyY + bodyH * 0.32, wz - 0.12);
      k.box(0.005, bodyH * 0.76, 0.008, C.dark, g, s * w * 0.457, bodyY, wz - (van ? 0.34 : cabD * 0.23), { r: 0 });
    }
    k.box(0.02, 0.04, d * 0.73, chrome, g, s * w * 0.455, wheelR + 0.06, 0);
    k.box(w * 0.085, 0.085, 0.16, paint, g, s * w * 0.46, windowY - 0.05, cabZ + cabD * 0.4, { r: 0.025 });
    k.box(0.018, 0.055, 0.11, chrome, g, s * w * 0.505, windowY - 0.05, cabZ + cabD * 0.4);
  }
  const frontZ = d * 0.485, rearZ = -d * 0.485;
  k.box(w * 0.48, 0.15, 0.018, C.black, g, 0, bodyY - 0.02, frontZ);
  for (let j = 0; j < 5; j++) k.box(w * 0.44, 0.009, 0.012, chrome, g, 0, bodyY - 0.075 + j * 0.028, frontZ + 0.01);
  for (const z of [frontZ, rearZ]) { k.box(w * 0.83, 0.06, 0.04, chrome, g, 0, wheelR + 0.02, z); k.box(0.27, 0.095, 0.012, C.white, g, 0, bodyY - 0.12, z + Math.sign(z) * 0.02); }
  const frontLamp = k.mat('#fff4d6', { rough: 0.2, metal: 0, tex: 'plastic', glow: '#fff4d6', glowK: 0.2, night: 3.2 });
  const tailLamp = k.mat('#a52d2c', { rough: 0.2, metal: 0, tex: 'plastic', glow: '#ff2a2a', glowK: 0.3, night: 2.4 });
  for (const s of [-1, 1]) {
    k.box(w * 0.22, 0.11, 0.03, frontLamp, g, s * w * 0.31, bodyY + bodyH * 0.19, frontZ, { r: 0.014 });
    k.box(w * 0.16, 0.12, 0.028, tailLamp, g, s * w * 0.34, bodyY + bodyH * 0.18, rearZ, { r: 0.014 });
    k.box(w * 0.14, 0.018, 0.033, C.orange, g, s * w * 0.34, bodyY + bodyH * 0.07, rearZ);
    bar(k, g, C.black, [s * 0.1, cabinBase + 0.06, cabZ + cabD / 2 + 0.025], [s * w * 0.29, cabinBase + 0.09, cabZ + cabD / 2 + 0.025], 0.008);
  }
  g.userData.wheels = [];
  for (const x of [-w * 0.43, w * 0.43]) for (const z of [-d * 0.31, d * 0.31]) {
    g.userData.wheels.push(roadWheel(k, g, x, z, wheelR, w * 0.115));
    // Trim arch above each tire; open below, so the wheel remains visible.
    k.torus(wheelR * 1.1, 0.025, C.dark, g, x, wheelR, z, { ry: Math.PI / 2, arc: Math.PI });
  }
  if (suv) for (const x of [-w * 0.28, w * 0.28]) k.box(0.035, 0.035, cabD * 0.85, chrome, g, x, roof + 0.01, cabZ);
  if (van) {
    for (const x of [-w * 0.401, w * 0.401]) { k.box(0.012, 0.3, d * 0.47, paint, g, x, 1.28, -0.55); k.box(0.018, 0.04, d * 0.44, chrome, g, x, 0.99, -0.52); }
    for (const x of [-0.34, 0.34]) { k.box(0.014, 1.05, 0.015, chrome, g, x, 1.17, -d * 0.466); k.box(0.1, 0.03, 0.03, C.dark, g, x, 1.03, -d * 0.47); }
  }
}
const coachwork = {
  pickup: { belt: .83, roofGap: .035, cabin: [-.105, .255, -.094, .136], widths: [.443, .381], crown: .038 },
  taxi: { belt: .69, roofGap: .155, cabin: [-.355, .25, -.19, .08], widths: [.445, .348], crown: .045 },
  robotaxi: { belt: .72, roofGap: .30, cabin: [-.442, .431, -.218, .188], widths: [.458, .357], crown: .07 },
  van: { belt: .90, roofGap: .15, cabin: [-.465, .35, -.455, .219], widths: [.453, .413], crown: .046 },
  bus: { belt: .98, roofGap: .22, cabin: [-.467, .468, -.459, .451], widths: [.456, .443], crown: .05 },
};

function vehiclePanel(k, parent, mat, corners, normals) {
  const geometry = k.geo('vehicle-panel|' + JSON.stringify([corners,normals]), () => {
    const geo = new k.THREE.BufferGeometry();
    geo.setAttribute('position', new k.THREE.Float32BufferAttribute(corners.flat(), 3));
    geo.setAttribute('uv', new k.THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    if(normals) geo.setAttribute('normal',new k.THREE.Float32BufferAttribute(normals.flat(),3));
    else geo.computeVertexNormals();
    return geo;
  });
  return k.put(geometry, mat, parent, 0, 0, 0, { cast: !mat.transparent });
}

function coachWheel(k, parent, x, z, radius, width, m) {
  const hub = dynamic(k, parent, 'wheel', x, radius, z), outward = Math.sign(x);
  const axle = k.group(hub); axle.rotation.z = -outward * Math.PI / 2;
  const profile = [[.56,-.49],[.83,-.49],[.96,-.40],[1,-.26],[1,.26],[.96,.4],[.83,.49],[.59,.49],[.56,.43],[.56,-.49]];
  k.lathe(profile.map(([r, offset]) => [r * radius, offset * width]), m.trim, axle, 0, 0, 0, { seg: 36 });
  const faceY = width * .40;
  k.lathe([[radius*.58,width*.50],[radius*.59,width*.535],[radius*.67,width*.535],[radius*.69,width*.48]].reverse(), m.rim, axle, 0, 0, 0, { seg: 36 });
  k.cyl(radius*.59, radius*.59, .01, m.trim, axle, 0, faceY+.004, 0, { seg: 32 });
  for (let spoke = 0; spoke < 6; spoke++) {
    const angle = spoke * Math.PI / 3, carrier = k.group(axle, 0, faceY+.013, 0, angle);
    k.extrude([[-.067,.08],[.081,.08],[.20,.57],[.091,.62]], .016, m.rim, carrier, 0, 0, 0, { rx: -Math.PI/2, sx: radius, sy: radius });
  }
  k.cyl(radius*.23, radius*.27, .026, m.rim, axle, 0, faceY+.022, 0, { seg: 20 });
  return hub;
}

function buildCoachwork(k, g, type, w, d, radius, m, box) {
  const {belt} = coachwork[type], sill = radius*.69, half = w*.449, bevel = .035, gap = radius + .066;
  const sidePart = (profile, lo, hi, mat, rounding = 0) => k.extrude(profile.map(([z,y]) => [-z,y]), hi-lo, mat, g, lo, 0, 0, { ry: Math.PI/2, bevel: rounding });
  const arch = (axle, r) => Array.from({length:19}, (_, index) => {
    const angle = Math.PI * (1-index/18); return [axle + r*Math.cos(angle), radius + r*Math.sin(angle)];
  });
  const lip = (axle, r) => [[axle-r,sill], ...arch(axle,r), [axle+r,sill]];
  const nose = .466*d, tail = -.466*d, pickup = type === 'pickup', pod = type === 'robotaxi';
  const noseY = belt - (type === 'bus' ? .03 : pickup ? .11 : .12), tailY = belt - (pod ? .09 : .04);
  const front = [[nose-.03,noseY],[nose,noseY-.046],[nose,sill+.07],[nose-.043,sill]];
  const back = [[tail+.05,sill],[tail,sill+.065],[tail,tailY-.047],[tail+.035,tailY]];
  const frontArch = lip(d*.31,gap).reverse(), rearArch = lip(-d*.31,gap).reverse();
  if (pickup) {
    const split = -d*.117;
    sidePart([[split,belt],[d*.255,belt],[d*.39,belt-.041],...front,...frontArch,[split,sill]], -half, half, m.paint, bevel);
    const bed = [[split-.091,belt+.015],[split-.091,sill],...rearArch,...back,[tail+.046,belt+.015]];
    for (const sign of [-1,1]) {
      const edge=sign*half; sidePart(bed, Math.min(edge,edge-sign*.064),Math.max(edge,edge-sign*.064),m.paint,bevel);
      box(.096,.037,split-tail-.12,m.trim,edge-sign*.028,belt+.058,(split+tail-.047)/2,.016);
      box(.25,.24,.81,m.trim,sign*(half-.15),.515,-d*.31,.085);
    }
    const bedLength = split-tail-.13, center = (split+tail-.066)/2;
    box(half*2-.11,.08,bedLength,m.trim,0,.45,center,.018);
    for (let rib=-4;rib<=4;rib++) box(.03,.025,bedLength-.09,m.trim,rib*w*.067,.497,center,.009);
    box(half*2-.09,.39,.062,m.paint,0,.657,split-.09,.018);
    box(half*2-.07,belt-sill,.064,m.paint,0,(belt+sill)/2,tail,.018);
    box(.23,.054,.018,m.trim,0,belt-.08,tail-.039,.008);
    bar(k,g,m.trim,[0,sill+.02,tail+.09],[0,sill-.044,tail-.074],.037);
    k.ball(.035,m.rim,g,0,sill-.019,tail-.082);
  } else {
    const shoulder = pod ? [[tail+.07,tailY+.035],[-d*.40,belt],[d*.36,belt],[d*.427,belt-.042]]
      : [[tail+.09,tailY],[d*-.31,belt],[d*.20,belt],[d*.36,belt-.022]];
    sidePart([...shoulder,...front,...frontArch,...rearArch,...back],-half,half,m.paint,bevel);
  }
  box(w*.70,.10,d*.87,m.trim,0,sill+.008,0,.03);
  g.userData.wheels = [];
  for (const sign of [-1,1]) {
    const side = sign*(half+bevel+.002);
    for (const axle of [-d*.31,d*.31]) {
      g.userData.wheels.push(coachWheel(k,g,sign*w*.43,axle,radius,w*.105,m));
      const rim = [...lip(axle,gap-.032),...lip(axle,gap+.006).reverse()];
      sidePart(rim,Math.min(side,side-sign*.032),Math.max(side,side-sign*.032),m.trim);
      sidePart(lip(axle,gap-.023), sign*w*.35-.012,sign*w*.35+.012,m.trim);
      box(.12,.105,.032,m.trim,side-sign*.072,sill-.008,axle-gap,.006);
    }
    box(.038,.056,d*.62-2*gap-.03,m.trim,side-sign*.011,sill+.012,0,.012);
  }
  return { nose:nose+bevel, tail:tail-bevel, noseY, tailY, side:half+bevel, sill, gap };
}

function buildGreenhouse(k, g, type, w, d, roof, m) {
  const {belt,cabin,widths,crown} = coachwork[type], pod = type === 'robotaxi', bus = type === 'bus';
  const mix = (a,b,t) => a+(b-a)*t;
  const ring = (level) => {
    const curve = pod ? level**1.65 : level, half = mix(widths[0],widths[1],curve)*w;
    const front = mix(cabin[1],cabin[3],curve)*d, back = mix(cabin[0],cabin[2],curve)*d;
    const cut = bus ? .07 : pod ? .14 : .077, height = mix(belt+.019,roof-crown,level);
    return [[-half+cut,front],[half-cut,front],[half,front-cut],[half,back+cut],[half-cut,back],[-half+cut,back],[-half,back+cut],[-half,front-cut]].map(([x,z]) => [x,height,z]);
  };
  const low = ring(0), high = ring(1), levels = pod ? Array.from({length:13},(_,i)=>i/12) : [0,1];
  const normal = (edge,t) => {
    const next=(edge+1)%8,row=ring(t),a=ring(Math.max(0,t-.001)),b=ring(Math.min(1,t+.001));
    const heading=new k.THREE.Vector3(...row[next]).sub(new k.THREE.Vector3(...row[edge]));
    return heading.cross(new k.THREE.Vector3(...b[edge]).sub(new k.THREE.Vector3(...a[edge]))).normalize().toArray();
  };
  const smooth = (edge,lo,hi) => {if(pod){const a=normal(edge,lo),b=normal(edge,hi);return [a,a,b,b];}};
  const skin = (from,to,mat,lo,hi) => from.forEach((pt,i) => {
    const j=(i+1)%8;vehiclePanel(k,g,mat,[pt,from[j],to[j],to[i]],lo===undefined?undefined:smooth(i,lo,hi));
  });
  for (let i=1;i<levels.length;i++) skin(ring(levels[i-1]),ring(levels[i]),type==='van'||type==='pickup'?m.paint:m.frame,levels[i-1],levels[i]);
  const under = low.map(([x,y,z])=>[x*.99,y-.06,z]); skin(under,low,m.paint);
  const dome = high.map(([x,y,z])=>[x*.936,y+crown*.72,z*.983]);
  const cap = dome.map(([x,y,z])=>[x*.93,y+crown*.28,z*.986]); skin(high,dome,m.roof);skin(dome,cap,m.roof);
  for (let i=1;i<cap.length/2;i++) vehiclePanel(k,g,m.roof,[cap[8-i],cap[i-1],cap[i],cap[7-i]]);
  // Each pane follows the same loft as its frame, including the pod's curved header.
  const point = (edge,u,level,offset=.004) => {
    const band = levels.findIndex(t=>t>=level), top = levels[Math.max(1,band)], bottom = levels[Math.max(0,band-1)];
    const sample = t => {const row=ring(t),a=row[edge],b=row[(edge+1)%8];return a.map((v,i)=>mix(v,b[i],u));};
    const a=sample(bottom), b=sample(top), result=a.map((v,i)=>mix(v,b[i],(level-bottom)/(top-bottom)));
    if(edge===0||edge===4) result[2]+=edge===0?offset:-offset; else result[0]+=edge===2?offset:-offset;
    return result;
  };
  const pane = (edge,start,end,bottom,top) => {
    const cuts = [bottom,...levels.filter(t=>t>bottom&&t<top),top];
    for(let i=1;i<cuts.length;i++) vehiclePanel(k,g,m.glass,[point(edge,start,cuts[i-1]),point(edge,end,cuts[i-1]),point(edge,end,cuts[i]),point(edge,start,cuts[i])],smooth(edge,cuts[i-1],cuts[i]));
  };
  pane(0,.018,.982,.045,bus ? .77 : .94);
  const panes = type==='pickup'?3:type==='van'?2:1;
  for(let i=0;i<panes;i++) pane(4,(i+.035)/panes,(i+.965)/panes,type==='van' ? .41 : .10,.91);
  for(const edge of [2,6]) {
    const windows = bus?8:type==='van'?1:2;
    for(let i=0;i<windows;i++) {
      let start=(i+.033)/windows, end=(i+.967)/windows;
      if(type==='van') {start=.016;end=.235;}
      if(type==='pickup' && i===0) end=.63;
      if(type==='pickup' && i===1) start=.65;
      if(edge===6) [start,end]=[1-end,1-start];
      pane(edge,start,end,.057,.93);
    }
  }
  for(const start of [.11,.53]) {
    bar(k,g,m.trim,point(0,start+.14,.027,.010),point(0,start+.20,.12,.010),.008);
    bar(k,g,m.trim,point(0,start,.072,.012),point(0,start+.32,.15,.012),bus ? .014 : .010);
  }
  return {point,low,high};
}

function vehicleFascias(k,g,type,w,m,body,box) {
  const {nose,tail,noseY,tailY,sill} = body, bus=type==='bus',pod=type==='robotaxi',truck=type==='pickup';
  const at = box;
  for(const sign of [1,-1]) {
    const front=sign===1, z=front?nose:tail, y=(front?noseY:tailY)-.119;
    at(w*(pod ? .68 : .84),.095,.058,m.trim,0,sill+.091,z-sign*.012,.022);
    at(w*.77,.018,.018,m.rim,0,sill+.109,z+sign*.018,.004);
    at(.265,.087,.021,m.plate,0,sill+.12,z+sign*.036,.008);
    for(const side of [-1,1]) {
      const x=side*w*.323, width=w*(truck ? .211 : .197),height=truck ? .153 : pod ? .065 : .115;
      const outline=[[-.49,-.26],[-.37,-.49],[.30,-.49],[.50,-.25],[.50,.32],[.35,.50],[-.45,.50],[-.50,.33]];
      const lens=(scale,mat,offset,raised=0)=>{
        const points=outline.map(([u,v])=>[u*width*scale*side,v*height*scale]);
        k.extrude(points,.012,mat,g,x,y+raised,z+sign*offset,{ry:front?0:Math.PI,bevel:.004});
      };
      lens(1.12,m.rim,-.007);lens(1,m.frame,.007);
      if(front && !pod) {
        for(const shift of [-.21,.19]) k.cyl(height*.245,height*.245,.016,m.head,g,x+width*shift,y+.007,z+.027,{rx:Math.PI/2,seg:18});
      } else at(width*.76,height*.30,.016,front?m.head:m.tail,x,y+.007,z+sign*.027,.006);
      at(width*.78,.016,.015,front?m.head:m.plate,x,y-height*.31,z+sign*.027,.005);
      if(pod) {
        k.cyl(.045,.049,.025,m.trim,g,side*w*.416,y-.079,z,{rx:sign*Math.PI/2,seg:20});
        k.disc(.029,m.glass,g,side*w*.416,y-.079,z+sign*.014,{ry:front?0:Math.PI,seg:20});
      }
    }
    if(pod) at(w*.49,.027,.024,front?m.status:m.tail,0,y+.007,z+sign*.028,.009);
  }
  const gy=noseY-.142, gh=truck ? .205:type==='van' ? .235 : .124;
  at(w*.403,gh,.032,pod||bus?m.paint:m.trim,0,gy,nose+.003,.015);
  if(!pod&&!bus) {
    const rows=truck?3:type==='van'?2:5;
    for(let i=0;i<rows;i++) at(w*.38,truck ? .023 : .009,.012,m.rim,0,gy+gh*((i+.5)/rows-.5)*.93,nose+.023,.003);
    if(type==='taxi') for(let i=-5;i<=5;i++) at(.007,gh*.85,.009,m.rim,i*w*.031,gy,nose+.024,.002);
  }
  if(!pod&&!bus) {
    k.cyl(.038,.048,.092,m.rim,g,-w*.29,sill-.014,tail+.009,{rx:Math.PI/2,seg:18});
    k.disc(.027,m.trim,g,-w*.29,sill-.014,tail-.039,{ry:Math.PI,seg:18});
  }
}

function hoodStamp(k,g,type,w,d,m) {
  const {belt,cabin}=coachwork[type], pickup=type==='pickup';
  const stations=pickup ? [[.255,belt],[.39,belt-.041],[.466-.03/d,belt-.11]]
    : [[.20,belt],[.36,belt-.022],[.466-.03/d,belt-.12]];
  const sheet=(z,width,lift)=>{
    const index=stations[1][0]>z?0:1, [a,ya]=stations[index], [b,yb]=stations[index+1];
    const y=ya+(yb-ya)*(z-a)/(b-a)+.036;
    return [-1,-.87,.87,1].map((t,i)=>[t*width*w,y+(i===1||i===2?lift:0),d*z]);
  };
  const rows=[sheet(cabin[1]+.009,.364,.003),sheet(stations[1][0],.358,pickup ? .033 : .020),sheet(.447,.31,.002)];
  for(let row=1;row<rows.length;row++) for(let i=0;i<3;i++) vehiclePanel(k,g,m.paint,[rows[row-1][i],rows[row-1][i+1],rows[row][i+1],rows[row][i]].reverse());
  for(const col of [0,3]) for(let i=1;i<rows.length;i++) bar(k,g,m.frame,rows[i-1][col],rows[i][col],.004);
}

function coachDoors(k,g,type,w,d,m,body,cab,box) {
  const {belt} = coachwork[type], bus=type==='bus';
  for(const sign of [-1,1]) {
    const x=sign*(body.side+.003), edge=sign>0?2:6;
    const pillar = u => cab.point(edge,sign>0?u:1-u,0)[2];
    const mirror=cab.point(edge,sign>0 ? .043 : .957,bus ? .80 : .19);
    const mount=[sign*w*.468,mirror[1]+(bus ? .035 : 0),mirror[2]+.04], head=[sign*(w*.5-.050),mirror[1]-(bus ? .16 : .014),mirror[2]+.06];
    bar(k,g,m.trim,mirror,mount,.018);bar(k,g,m.trim,mount,head,.016);
    box(.092,bus ? .19 : .082,type==='robotaxi' ? .094 : .135,m.roof,...head,.029);
    box(.063,bus ? .145 : .05,.010,m.frame,head[0],head[1],head[2]-(type==='robotaxi' ? .048 : .068),.005);
    if(bus) continue;
    const ends=type==='van'?[.235]:type==='pickup'?[.64,.985]:[.50,.98];
    for(const end of ends) {
      const z=pillar(end),handleZ=z+.099, knee=belt-.042, axle=Math.sign(z)*.31*d;
      const notch=body.gap+.011, radial=notch**2-(z-axle)**2;
      const bottom=radial>0 ? (type==='van' ? .32 : .27)+Math.sqrt(radial) : body.sill+.063;
      if(bottom<knee) bar(k,g,m.frame,[x,knee,z],[x,bottom,z],.007);
      const handleY=Math.abs(handleZ-axle)<body.gap ? belt-.031 : belt-.078;
      box(.027,.036,.135,m.rim,x,handleY,handleZ,.009);
    }
  }
}

function taxiEquipment(k,g,w,d,roof,m,body,box) {
  const center=-.095;
  box(.46,.033,.185,m.trim,0,roof+.011,center,.014);
  box(.422,.110,.157,m.head,0,roof+.079,center,.025);
  const glyphs=[['111','010','010','010','010'],['010','101','111','101','101'],['101','101','010','101','101'],['111','010','010','010','111']];
  for(const sign of [-1,1]) {
    glyphs.forEach((rows,index)=>rows.forEach((row,y)=>[...row].forEach((pixel,x)=>{
      if(pixel==='1') box(.018,.015,.006,m.trim,sign*(index*4+x-7)*.018,roof+.080+(2-y)*.015,center+sign*.080,0);
    })));
    const length=.62*d-body.gap*2-.035,x=sign*(body.side+.005);
    box(.014,.17,length,m.frame,x,body.sill+.133,0,.004);
    const tile=length/20;
    for(let i=0;i<20;i++) box(.006,tile*.5,tile,m.plate,x+sign*.009,body.sill+.17+(i%2-.5)*tile*.5,(i-9.5)*tile,0);
  }
}

function vanEquipment(k,g,w,d,roof,m,body,cab,box) {
  const {point} = cab;
  for(const edge of [2,6]) {
    const sign=edge===2?1:-1, surface=(u,t)=>point(edge,sign>0?u:1-u,t,.007);
    for(const u of [.255,.715,.97]) bar(k,g,m.frame,surface(u,.03),surface(u,.87),.008);
    bar(k,g,m.frame,surface(.255,.87),surface(.97,.87),.008);
    if(sign>0) {
      for(const u of [.255,.715]) {const [,y,z]=surface(u,.03);bar(k,g,m.frame,[body.side+.004,y-.07,z],[body.side+.004,body.sill+.12,z],.009);}
      bar(k,g,m.trim,surface(.39,.20),surface(.94,.20),.025);
      bar(k,g,m.rim,surface(.40,.21),surface(.93,.21),.010);
      const handle=surface(.29,.12);box(.03,.04,.158,m.trim,...handle,.012);
    }
    const back=(u,t)=>point(4,u,t,.012);
    for(const ht of [.13,.73]) box(.098,.045,.030,m.rim,...back(sign>0 ? .07 : .93,ht),.008);
    box(.09,.032,.031,m.trim,...back(sign>0 ? .41 : .59,.33),.008);
    if(sign>0) {
      const start=point(4,.5,0);bar(k,g,m.frame,[0,body.sill+.04,body.tail-.004],[0,start[1]-.05,body.tail-.004],.009);
      bar(k,g,m.frame,back(.5,.01),back(.5,.96),.009);
    }
    box(.054,.058,d*.47,m.trim,sign*w*.289,roof+.062,-d*.10,.02);
    for(const z of [-d*.285,d*.096]) box(.075,.078,.115,m.frame,sign*w*.289,roof+.022,z,.014);
  }
  for(const z of [-d*.285,-d*.10,d*.096]) box(w*.631,.030,.045,m.rim,0,roof+.10,z,.01);
}

function busEquipment(k,g,o,w,d,roof,m,body,cab,box) {
  const {point} = cab;
  for(const sign of [-1,1]) {
    const edge=sign>0?2:6, x=sign*(body.side+.005);
    for(let i=0;i<3;i++) {
      const z=-d*(.178+i*.018), band=[[z,.49],[z+.060,.49],[z+.26,.74],[z+.20,.74]].map(([z,y])=>[x,y,z]);
      vehiclePanel(k,g,m.roof,sign>0?band.reverse():band);
    }
    for(const u of [.06,.49,.94]) box(.018,.028,.081,m.head,...point(edge,u,.968,.012),.006);
    for(let pillar=1;pillar<8;pillar++) {
      const u=pillar/8;bar(k,g,m.rim,point(edge,u,.07,.006),point(edge,u,.92,.006),.014);
    }
    const base=point(edge,.02,.06),end=point(edge,.98,.06);bar(k,g,m.rim,base,end,.010);
  }
  for(const [center,width] of [[.409*d,.109*d],[-.115*d,.134*d]]) {
    const x=body.side+.012, left=center-width/2, right=center+width/2, bottom=body.sill+.055, join=coachwork.bus.belt+.02;
    const pane=(lo,hi,y0,y1,mat,offset)=>vehiclePanel(k,g,mat,[[x+offset,y0,hi],[x+offset,y0,lo],[x+offset,y1,lo],[x+offset,y1,hi]]);
    pane(left,right,bottom,join,m.frame,0);
    const span=cab.low[2][2]-cab.low[3][2], u=z=>(cab.low[2][2]-z)/span;
    const upper=(lo,hi,y0,y1,mat,offset)=>vehiclePanel(k,g,mat,[point(2,u(hi),y0,offset),point(2,u(lo),y0,offset),point(2,u(lo),y1,offset),point(2,u(hi),y1,offset)]);
    upper(left,right,0,.96,m.frame,.013);
    for(const mid of [center-width/4,center+width/4]) {
      const lo=mid-width*.205,hi=mid+width*.205;
      pane(lo,hi,bottom+.12,join-.017,m.glass,.005);upper(lo,hi,.018,.88,m.glass,.018);
      bar(k,g,m.rim,[x+.014,join-.21,mid],[x+.014,join-.07,mid],.011);
    }
    box(.05,.037,width,m.plate,x-.01,bottom+.012,center,.007);
  }
  const y=roof-.208, z=point(0,.5,.865,.026)[2];
  box(w*.77,.209,.066,m.frame,0,y,z,.022);
  face(k,g,{...o,screen:o.screen||lit(k,'#ffc85c')},'screen',w*.717,.149,0,y,z+.035);
  box(w*.60,.152,d*.306,m.roof,0,roof+.059,-d*.165,.06);
  box(w*.53,.133,d*.168,m.roof,0,roof+.054,d*.162,.045);
  for(const z of [d*.125,d*.196]) {
    k.cyl(.207,.218,.019,m.frame,g,0,roof+.126,z,{seg:24});
    for(let i=-2;i<=2;i++) box(.35-Math.abs(i)*.045,.009,.017,m.rim,0,roof+.14,z+i*.058,.003);
  }
  for(let i=-2;i<=2;i++) box(w*.53,.012,.019,m.rim,0,roof+.138,-d*.165+i*.35,.004);
}

function vehicle(k,g,o,type,w,d,h) {
  const spec=coachwork[type]; if(!spec) return legacyVehicle(k,g,o,type,w,d,h);
  const pod=type==='robotaxi', taxi=type==='taxi', radius=type==='bus' ? .42:type==='van' ? .32 : .27;
  const roof=h-spec.roofGap, color=brand(o, taxi ? '#e5b739' : pod ? '#f1eee3' : '#528e88');
  const paint=color=>material(k,color,'paint',.29,.38,{clear:.82});
  const m={paint:paint(color),roof:paint(type==='bus'?'#e3e8df':color),frame:material(k,'#253339','paint',.46,.16),
    trim:material(k,'#262c31','rubber',.84),rim:material(k,'#c1cbcc','metal',.28,.74),plate:material(k,'#f1e9ce','paint',.40),
    glass:k.mat('#192f3e',{rough:.23,metal:.21,clear:.26,env:.52,alpha:.89}),head:lit(k,'#fff2cc',.27),tail:lit(k,'#d33138',.34)};
  const box=(width,height,depth,mat,x,y,z,r=.012)=>k.box(width,height,depth,mat,g,x,y,z,{r});
  if(pod) m.status=lit(k,'#54d7c8',.54);
  const body=buildCoachwork(k,g,type,w,d,radius,m,box), cab=buildGreenhouse(k,g,type,w,d,roof,m);
  if(type==='pickup'||taxi||type==='van') hoodStamp(k,g,type,w,d,m);
  vehicleFascias(k,g,type,w,m,body,box);coachDoors(k,g,type,w,d,m,body,cab,box);
  if(taxi) taxiEquipment(k,g,w,d,roof,m,body,box);
  if(type==='van') vanEquipment(k,g,w,d,roof,m,body,cab,box);
  if(type==='bus') busEquipment(k,g,o,w,d,roof,m,body,cab,box);
  if(pod) {
    box(.54,.081,.45,m.frame,0,roof+.027,-.2,.033);
    const sensor=dynamic(k,g,'lidar',0,roof+.16,-.2);
    k.cyl(.147,.18,.17,m.paint,sensor,0,0,0,{seg:32});
    k.cyl(.164,.176,.078,m.frame,sensor,0,-.006,0,{seg:32});
    k.cyl(.049,.049,.015,m.glass,sensor,0,-.005,.164,{rx:Math.PI/2,seg:20});
    g.userData.tick = t => { sensor.rotation.y = t * 1.5; };
  }
}

const vehicleSpecs = {
  car_sedan: [1.5, 3.3, 1.2, 'sedan'], car_suv: [1.6, 3.5, 1.45, 'suv'], car_hatch: [1.45, 2.9, 1.25, 'hatch'], car_pickup: [1.7, 4, 1.5, 'pickup'],
  car_taxi: [1.5, 3.3, 1.35, 'taxi'], robotaxi: [1.6, 3.5, 1.75, 'robotaxi'], van_delivery: [1.7, 4.2, 2.1, 'van'], bus_city: [2.2, 8, 2.6, 'bus'],
};
for (const [name, [w, d, h, type]] of Object.entries(vehicleSpecs)) PROPS[name] = prop([w, d, h], (k, g, o) => vehicle(k, g, o, type, w, d, h));
PROPS.car = prop(legacySizes.car, (k, g, o) => {
  // Preserve the legacy allocation and +Z nose. Same hatch drawing, shorter wheelbase.
  vehicle(k, g, o, 'hatch', 1.75, 1.87, 1.45);
});
PROPS.scooter_delivery = prop([0.7, 1.7, 1.5], (k, g, o) => {
  const color = (o.seed | 0) % 2 ? '#419ddd' : '#e8bc32', paint = material(k, color, 'paint', 0.35, 0.3, { clear: 0.8 });
  g.userData.wheels = [roadWheel(k, g, 0, -0.53, 0.22, 0.09), roadWheel(k, g, 0, 0.58, 0.22, 0.09)];
  k.box(0.29, 0.11, 0.82, C.dark, g, 0, 0.29, 0);
  k.box(0.3, 0.38, 0.24, paint, g, 0, 0.47, 0.46, { r: 0.04, rx: -0.2 });
  k.box(0.31, 0.08, 0.48, material(k, '#363b3b', 'leather'), g, 0, 0.61, -0.19, { r: 0.035 });
  for (const x of [-0.11, 0.11]) bar(k, g, C.metal, [x, 0.21, 0.58], [x, 0.76, 0.42], 0.017);
  bar(k, g, C.dark, [-0.28, 0.82, 0.4], [0.28, 0.82, 0.4], 0.023);
  k.box(0.16, 0.08, 0.04, lit(k, '#fff4d6'), g, 0, 0.74, 0.55);
  k.box(0.5, 0.41, 0.45, material(k, color, 'fabric', 0.85), g, 0, 0.93, -0.53, { r: 0.035 });
  k.box(0.52, 0.035, 0.47, paint, g, 0, 1.145, -0.53);
  k.box(0.27, 0.12, 0.008, C.white, g, 0, 0.95, -0.76);
  const cloth = material(k, color, 'fabric', 0.9), pants = material(k, '#263743', 'fabric', 0.9);
  oval(k, g, cloth, 0, 0.93, -0.04, 0.18, 0.27, 0.14);
  for (const s of [-1, 1]) {
    bar(k, g, pants, [s * 0.12, 0.65, -0.07], [s * 0.16, 0.5, 0.21], 0.065);
    bar(k, g, pants, [s * 0.16, 0.5, 0.21], [s * 0.16, 0.34, 0.14], 0.05);
    k.box(0.11, 0.065, 0.19, C.black, g, s * 0.16, 0.34, 0.17, { r: 0.025 });
    bar(k, g, cloth, [s * 0.15, 1.06, 0], [s * 0.23, 0.84, 0.4], 0.045);
    k.ball(0.045, material(k, '#c58c67', 'plastic'), g, s * 0.23, 0.84, 0.4);
  }
  k.ball(0.145, material(k, '#dba47e', 'plastic'), g, 0, 1.26, 0.02);
  oval(k, g, paint, 0, 1.33, 0.015, 0.165, 0.14, 0.17);
  k.box(0.23, 0.08, 0.03, k.mat('#253946', { rough: 0.08, metal: 0.4 }), g, 0, 1.3, 0.165, { r: 0.015 });
});

// ── Streets and civic furniture ──
PROPS.street_lamp = prop(legacySizes.street_lamp, (k, g) => {
  const steel = material(k, '#48585d', 'metal', 0.45, 0.7);
  k.box(0.28, 0.035, 0.28, steel, g, 0, 0.0175, 0);
  k.cyl(0.055, 0.085, 3.37, steel, g, 0, 1.72, -0.045);
  for (const x of [-0.09, 0.09]) for (const z of [-0.09, 0.09]) k.cyl(0.015, 0.015, 0.015, C.metal, g, x, 0.042, z, { seg: 6 });
  k.box(0.12, 0.035, 0.2, steel, g, 0, 3.39, 0.025);
  k.box(0.34, 0.06, 0.31, steel, g, 0, 3.45, 0.025, { r: 0.018 });
  k.box(0.27, 0.012, 0.24, lit(k, '#fff0cf'), g, 0, 3.414, 0.025);
  for (let i = 0; i < 6; i++) k.box(0.27, 0.012, 0.012, C.metal, g, 0, 3.486, -0.08 + i * 0.04);
  k.box(0.045, 0.24, 0.006, C.dark, g, 0, 0.6, 0.018);
  screw(k, g, 0, 0.68, 0.023, 0.007);
});
PROPS.traffic_light = prop([0.5, 2.6, 4.2], (k, g) => {
  k.box(0.34, 0.06, 0.34, C.dark, g, 0, 0.03, -1.05);
  k.cyl(0.06, 0.09, 4.06, C.dark, g, 0, 2.09, -1.05);
  bar(k, g, C.dark, [0, 4.06, -1.05], [0, 4.06, 1.09], 0.045);
  bar(k, g, C.dark, [0, 3.67, -1.05], [0, 4.06, -0.3], 0.025);
  k.box(0.35, 1.03, 0.19, C.black, g, 0, 3.48, 1.08, { r: 0.025 });
  const lamps = [], sources = [];
  for (let i = 0; i < 3; i++) {
    const color = ['#f03832', '#ffb82c', '#43cf91'][i];
    const m = k.mat(color, { rough: 0.22, metal: 0, tex: 'plastic', glow: color, glowK: 0.1, night: 3 }).clone();
    // Cloning loses kit shader hooks in THREE; restore them for owned materials.
    const source = k.mat(color, { rough: 0.22, metal: 0, tex: 'plastic', glow: color, glowK: 0.1, night: 3 });
    m.onBeforeCompile = source.onBeforeCompile; m.customProgramCacheKey = source.customProgramCacheKey;
    lamps.push(m); sources.push(source); k.nightMats.push([m, 0.1, 3]);
    const p = dynamic(k, g, `signal-${i}`, 0, 3.8 - i * 0.31, 1.19);
    k.disc(0.105, m, p, 0, 0, 0);
    k.torus(0.112, 0.015, C.dark, p, 0, 0, 0);
    k.box(0.24, 0.025, 0.11, C.black, p, 0, 0.12, 0.015);
  }
  g.userData.own = lamps;
  g.userData.tick = t => { const p = ((t % 13.5) + 13.5) % 13.5, on = p < 6 ? 2 : p < 7.5 ? 1 : 0; lamps.forEach((m, i) => { m.emissiveIntensity = i === on ? sources[i].emissiveIntensity : 0.005; }); };
});
function advertisement(k, g, o, roof = false) {
  const y = roof ? 1.87 : 3.85;
  if (!roof) {
    k.box(1.3, 0.16, 0.58, C.dark, g, 0, 0.08, 0);
    k.cyl(0.21, 0.25, 3.55, C.dark, g, 0, 1.92, 0);
    for (const x of [-1.3, 1.3]) bar(k, g, C.dark, [0, 2.1, 0], [x, 2.64, 0], 0.075);
  } else {
    for (const x of [-2.15, 2.15]) {
      k.box(0.6, 0.08, 0.96, C.dark, g, x, 0.04, 0);
      bar(k, g, C.metal, [x, 0.08, -0.43], [x, 2.91, 0.05], 0.035);
      bar(k, g, C.metal, [x, 0.08, 0.4], [x, 2.91, 0.05], 0.035);
    }
    for (let i = 0; i < 5; i++) bar(k, g, C.metal, [-2.15 + i * 0.86, 0.12, -0.4], [-1.29 + i * 0.86, 1.1, -0.2], 0.022);
  }
  k.box(5.88, 2.56, 0.16, C.dark, g, 0, y, 0.04, { r: 0.025 });
  face(k, g, o, 'art', 5.6, 2.4, 0, y, 0.124);
  for (let i = 0; i < 6; i++) {
    const x = -2.5 + i;
    bar(k, g, C.dark, [x, y + 1.25, 0.04], [x, y + 1.29, 0.24], 0.017);
    k.box(0.22, 0.09, 0.13, C.dark, g, x, y + 1.29, 0.24, { r: 0.012 });
    k.box(0.18, 0.012, 0.1, lit(k, '#fff2cf'), g, x, y + 1.24, 0.24);
  }
  for (const x of [-2.83, 2.83]) for (const dy of [-1.18, 1.18]) screw(k, g, x, y + dy, 0.13, 0.018);
}
PROPS.billboard = prop([6, 0.6, 5.2], (k, g, o) => advertisement(k, g, o));
PROPS.billboard_roof = prop([6, 1, 3.2], (k, g, o) => advertisement(k, g, o, true));
PROPS.bus_stop = prop([3.6, 1.5, 2.6], (k, g, o) => {
  for (const x of [-1.65, 1.65]) for (const z of [-0.57, 0.57]) { k.box(0.09, 2.43, 0.09, C.dark, g, x, 1.215, z); k.box(0.18, 0.035, 0.18, C.metal, g, x, 0.0175, z); }
  k.box(3.6, 0.09, 1.5, C.dark, g, 0, 2.48, 0, { r: 0.025 });
  k.box(3.4, 0.018, 1.32, k.mat('#a6c1cb', { rough: 0.08, metal: 0.2, alpha: 0.4, clear: 0.7 }), g, 0, 2.54, 0);
  k.box(2.38, 2.1, 0.025, C.glass, g, -0.48, 1.3, -0.58, { ...glass });
  for (const x of [-1.3, -0.2]) k.box(0.08, 0.4, 0.35, C.dark, g, x, 0.2, -0.18);
  for (let i = 0; i < 4; i++) k.box(2.05, 0.045, 0.085, C.wood, g, -0.62, 0.44, -0.33 + i * 0.1);
  for (const y of [0.69, 0.85]) k.box(2.05, 0.12, 0.04, C.wood, g, -0.62, y, -0.43);
  k.box(0.76, 1.95, 0.12, C.dark, g, 1.17, 1.22, -0.52);
  k.box(0.69, 1.85, 0.018, lit(k, '#fff1d7'), g, 1.17, 1.22, -0.452);
  face(k, g, o, 'art', 0.61, 1.72, 1.17, 1.22, -0.438);
  k.box(2.4, 0.025, 0.04, lit(k, '#fff3d0'), g, -0.4, 2.424, 0);
  k.box(0.44, 0.65, 0.035, C.white, g, -1.37, 1.7, -0.545);
  for (let i = 0; i < 5; i++) { k.ball(0.014, brand(o), g, -1.5, 1.92 - i * 0.1, -0.519); labelLines(k, g, -1.33, 1.92 - i * 0.1, -0.521, 0.19, 2); }
});
PROPS.neon_sign = prop([0.9, 0.3, 3.2], (k, g, o) => {
  for (const y of [0.5, 2.7]) k.box(0.28, 0.06, 0.12, C.dark, g, 0.14, y, 0);
  k.box(0.67, 3.05, 0.24, C.dark, g, 0.55, 1.525, 0, { r: 0.025 });
  for (const z of [-0.125, 0.125]) {
    k.box(0.57, 2.94, 0.008, lit(k, brand(o)), g, 0.55, 1.525, z);
    for (let i = 0; i < 5; i++) { const y = 0.48 + i * 0.54; k.box(0.32, 0.045, 0.012, C.cream, g, 0.55, y, z * 1.07); k.box(0.04, 0.3, 0.012, C.cream, g, 0.5, y + 0.08, z * 1.07, { rz: 0.2 }); k.box(0.22, 0.04, 0.012, C.cream, g, 0.6, y + 0.2, z * 1.07, { rz: -0.3 }); }
  }
});
PROPS.shop_awning = prop([3, 1.1, 0.9], (k, g, o) => {
  const color = [brand(o), '#b75245', '#d3a858', '#3d668c'][(o.seed >>> 0) % 4];
  k.box(3, 0.08, 0.08, C.dark, g, 0, -0.04, 0.04);
  for (let i = 0; i < 12; i++) {
    const fabric = material(k, i % 2 ? '#efe5cc' : color, 'fabric', 0.9, 0, { side: true });
    k.box(0.25, 0.018, 1.06, fabric, g, -1.375 + i * 0.25, -0.25, 0.53, { rx: 0.42, r: 0.006 });
    k.box(0.248, 0.18, 0.02, fabric, g, -1.375 + i * 0.25, -0.54, 1.014, { r: 0.012 });
  }
  for (const x of [-1.38, 1.38]) bar(k, g, C.dark, [x, -0.78, 0.04], [x, -0.45, 1.02], 0.018);
});
PROPS.bollard = prop([0.2, 0.2, 0.8], (k, g) => {
  k.cyl(0.095, 0.1, 0.04, C.dark, g, 0, 0.02, 0);
  k.cyl(0.064, 0.064, 0.72, C.dark, g, 0, 0.4, 0);
  for (const y of [0.57, 0.64]) k.cyl(0.067, 0.067, 0.035, material(k, '#e6e1bc', 'paint', 0.3), g, 0, y, 0);
  oval(k, g, C.metal, 0, 0.76, 0, 0.064, 0.035, 0.064);
});
PROPS.trash_public = prop([0.6, 0.5, 1], (k, g) => {
  k.box(0.59, 0.06, 0.49, C.dark, g, 0, 0.03, 0);
  for (const x of [-0.15, 0.15]) {
    const c = x < 0 ? '#477c98' : '#4e8373';
    k.box(0.275, 0.76, 0.45, material(k, c, 'paint', 0.5, 0.45), g, x, 0.43, 0);
    k.box(0.28, 0.13, 0.47, C.dark, g, x, 0.89, 0);
    k.box(0.19, 0.065, 0.013, C.black, g, x, 0.89, 0.241);
    k.box(0.12, 0.12, 0.004, C.white, g, x, 0.62, 0.23);
    for (let i = 0; i < 3; i++) k.box(0.06, 0.012, 0.005, c, g, x, 0.62, 0.235, { rz: i * Math.PI * 2 / 3 });
    for (let i = 0; i < 6; i++) k.box(0.004, 0.29, 0.004, C.dark, g, x - 0.1 + i * 0.04, 0.28, 0.231, { r: 0 });
  }
});
PROPS.parking_meter = prop([0.25, 0.25, 1.3], (k, g, o) => {
  k.cyl(0.09, 0.11, 0.04, C.dark, g, 0, 0.02, 0);
  k.cyl(0.035, 0.035, 0.93, C.metal, g, 0, 0.49, 0);
  k.box(0.24, 0.39, 0.18, C.dark, g, 0, 1.105, 0, { r: 0.025 });
  face(k, g, o, 'screen', 0.15, 0.09, 0, 1.19, 0.092);
  k.box(0.1, 0.013, 0.012, C.black, g, 0, 1.08, 0.097);
  for (const x of [-0.045, 0.045]) k.cyl(0.02, 0.02, 0.012, x < 0 ? C.teal : C.blue, g, x, 1.015, 0.096, { rx: Math.PI / 2 });
});
PROPS.manhole = prop([0.8, 0.8, 0.03], (k, g) => {
  const iron = material(k, '#626861', 'metal', 0.9, 0.6);
  k.cyl(0.4, 0.4, 0.015, C.dark, g, 0, 0.0075, 0);
  k.cyl(0.365, 0.365, 0.012, iron, g, 0, 0.019, 0);
  for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) if (i * i + j * j < 30) k.box(0.038, 0.004, 0.012, iron, g, i * 0.06, 0.027, j * 0.06, { ry: Math.PI / 4, r: 0 });
  for (const x of [-0.24, 0.24]) k.box(0.065, 0.003, 0.025, C.black, g, x, 0.028, 0);
});
PROPS.utility_pole = prop([1.8, 0.4, 7.5], (k, g) => {
  k.cyl(0.085, 0.15, 7.4, material(k, '#8a7154', 'wood', 0.92), g, 0, 3.7, 0);
  for (const y of [5.9, 7.05]) {
    k.box(1.8, 0.12, 0.16, C.wood, g, 0, y, 0);
    for (const x of [-0.75, -0.35, 0.35, 0.75]) { k.cyl(0.024, 0.024, 0.22, C.metal, g, x, y + 0.14, 0); for (let j = 0; j < 4; j++) k.cyl(0.055, 0.055, 0.025, material(k, '#a6b6ac', 'plastic', 0.22), g, x, y + 0.12 + j * 0.045, 0); }
    for (const x of [-0.6, 0.6]) bar(k, g, C.metal, [0, y - 0.55, 0.05], [x, y - 0.05, 0.05], 0.012);
  }
  k.cyl(0.16, 0.16, 0.7, C.metal, g, 0.25, 5.25, 0);
  for (const y of [4.94, 5.56]) k.torus(0.16, 0.012, C.dark, g, 0.25, y, 0, { rx: Math.PI / 2 });
  k.tube([[0.25, 5.6, 0], [0.42, 5.85, 0], [0.75, 6.2, 0]], 0.012, C.black, g, 0, 0, 0);
  for (let i = 0; i < 10; i++) k.box(0.23, 0.025, 0.06, C.metal, g, (i % 2 ? -1 : 1) * 0.12, 1 + i * 0.4, 0.05);
});
PROPS.power_box = prop([1, 0.5, 1.4], (k, g, o) => {
  k.box(0.98, 0.13, 0.48, material(k, '#a3aaa3', 'concrete'), g, 0, 0.065, 0);
  k.box(0.94, 1.23, 0.44, material(k, '#83958e', 'paint', 0.65, 0.45), g, 0, 0.745, 0);
  k.box(0.99, 0.045, 0.49, C.dark, g, 0, 1.3825, 0);
  for (const x of [-0.23, 0.23]) { k.box(0.44, 1.13, 0.016, material(k, '#96a69c', 'paint', 0.65, 0.4), g, x, 0.74, 0.228); grille(k, g, x, 0.32, 0.24, 0.33, 0.2, 7); k.box(0.02, 0.1, 0.015, C.dark, g, x + 0.13, 0.81, 0.248); }
  for (let i = 0; i < 5; i++) {
    const x = -0.31 + hash(o.seed, i) * 0.6, y = 0.65 + hash(o.seed, i + 7) * 0.52;
    k.box(0.13, 0.16, 0.003, material(k, i % 2 ? '#ebe3bd' : '#d8e2d8', 'paper'), g, x, y, 0.249 + i * 0.001, { rz: (hash(o.seed, i + 17) - 0.5) * 0.3 }); labelLines(k, g, x, y + 0.04, 0.257, 0.09, 4);
  }
});
PROPS.bike_rack = prop([3.2, 1.8, 1.1], (k, g, o) => {
  for (let i = 0; i < 5; i++) {
    const x = -1.25 + i * 0.62;
    k.tube([[x - 0.16, 0.015, -0.38], [x - 0.16, 0.6, -0.38], [x + 0.16, 0.6, -0.38], [x + 0.16, 0.015, -0.38]], 0.02, C.metal, g, 0, 0, 0);
    const p = k.group(g, x, 0, 0, -Math.PI / 2);
    // These thin tires use 24 sides; the standalone bikes retain their finer rims.
    const bk = { ...k,
      box: (w, h, d, c, parent, px, py, pz, options = {}) => k.box(w, h, d, c, parent, px, py, pz, { ...options, r: Math.min(options.r ?? 0.008, 0.02) }),
      torus: (r, tube, c, parent, px, py, pz, options = {}) => k.put(k.geo(`rack-torus-${r}-${tube}`, () => new k.THREE.TorusGeometry(r, tube, 6, 16)), c, parent, px, py, pz, options),
    };
    bicycle(bk, p, [C.teal, C.yellow, C.blue][(o.seed >>> 0) % 3], false, true);
  }
});
PROPS.planter_box = prop([1.6, 0.6, 0.9], (k, g, o) => {
  const m = material(k, (o.seed | 0) % 2 ? '#b5b8ab' : '#947455', (o.seed | 0) % 2 ? 'concrete' : 'wood', 0.82);
  k.box(1.56, 0.46, 0.56, m, g, 0, 0.23, 0, { r: 0.018 });
  k.box(1.43, 0.012, 0.43, C.darkWood, g, 0, 0.465, 0);
  for (const z of [-0.287, 0.287]) for (let i = 0; i < 4; i++) k.box(1.53, 0.008, 0.004, C.darkWood, g, 0, 0.09 + i * 0.1, z, { r: 0 });
  for (let i = 0; i < 4; i++) crown(k, g, -0.55 + i * 0.367, 0.65, 0, 0.245, (o.seed | 0) + i, 0.75, o.seed);
  for (let i = 0; i < 9; i++) k.ball(0.033, i % 2 ? '#e4b55d' : '#bd6d7a', g, -0.62 + i * 0.155, 0.8, Math.sin(i * 2.4) * 0.12, { sy: 0.6 });
});
PROPS.flower_bed = prop([2.4, 1.2, 0.5], (k, g, o) => {
  k.box(2.4, 0.14, 1.2, material(k, '#b3aa97', 'stone'), g, 0, 0.07, 0, { r: 0.018 });
  k.box(2.23, 0.02, 1.03, material(k, '#514937', 'stone', 1), g, 0, 0.15, 0);
  for (let i = 0; i < 32; i++) {
    const x = -1.02 + (i % 8) * 0.29, z = -0.37 + Math.floor(i / 8) * 0.245, y = 0.28 + hash(o.seed, i) * 0.12;
    bar(k, g, C.leafDark, [x, 0.16, z], [x, y, z], 0.009);
    leaf(k, g, x, 0.2, z, 0.12, 0.035, i * 2.4);
    const c = material(k, ['#cf6a80', '#ddb955', '#a9b9dc'][i % 3], 'foliage', 0.85);
    for (let j = 0; j < 5; j++) { const a = j * Math.PI * 2 / 5; k.disc(0.024, c, g, x + Math.cos(a) * 0.027, y, z + Math.sin(a) * 0.027, { rx: -Math.PI / 2 + 0.2, seg: 8, side: true }); }
    k.cyl(0.013, 0.015, 0.012, C.gold, g, x, y + 0.006, z, { seg: 8 });
  }
});
function steamPuffs(k, g, x, y, z, height = 0.32) {
  const steam = [];
  for (let i = 0; i < 3; i++) { const p = dynamic(k, g, `steam-${i}`, x, y, z); k.ball(0.055, k.mat('#eeeae0', { rough: 1, metal: 0, alpha: 0.28 }), p, 0, 0, 0, { cast: false, seg: 10 }); steam.push(p); }
  return t => { steam.forEach((p, i) => { const f = (t * 0.35 + i / 3) % 1; p.position.set(x + Math.sin(f * 6 + i) * 0.04, y + f * height, z); p.scale.setScalar(Math.sin(f * Math.PI) * 0.7 + 0.2); }); };
}
PROPS.food_cart = prop([1.8, 1.2, 2.2], (k, g, o) => {
  const paint = material(k, brand(o, '#aa4e3c'), 'paint', 0.45, 0.5);
  k.box(1.55, 0.55, 0.79, paint, g, 0, 0.62, 0);
  k.box(1.7, 0.06, 0.92, C.metal, g, 0, 0.925, 0, { r: 0.018 });
  for (const x of [-0.55, 0.55]) { const p = k.group(g, x, 0.23, 0); k.cyl(0.23, 0.23, 0.08, C.black, p, 0, 0, 0, { rx: Math.PI / 2 }); k.torus(0.16, 0.015, C.metal, p, 0, 0, 0.05); }
  k.cyl(0.16, 0.16, 0.07, C.black, g, -0.72, 0.16, 0.36, { rx: Math.PI / 2 });
  for (const x of [-0.7, 0.7]) k.box(0.035, 1.1, 0.035, C.dark, g, x, 1.45, -0.3);
  k.cyl(0.018, 0.018, 1.2, C.metal, g, 0, 1.48, -0.25);
  // Radial fabric panels share the same canopy profile and alternate warm stripes.
  for (let i = 0; i < 12; i++) {
    const geo = k.geo(`cart-canopy-${i}`, () => { const a = i * Math.PI / 6, b = (i + 1) * Math.PI / 6; const geom = new k.THREE.BufferGeometry(); geom.setAttribute('position', new k.THREE.Float32BufferAttribute([0, 2.15, 0, Math.cos(a) * 0.89, 1.91, Math.sin(a) * 0.57, Math.cos(b) * 0.89, 1.91, Math.sin(b) * 0.57], 3)); geom.setAttribute('uv', new k.THREE.Float32BufferAttribute([0.5, 1, 0, 0, 1, 0], 2)); geom.computeVertexNormals(); return geom; });
    k.put(geo, material(k, i % 2 ? '#e9d7ad' : '#b5543d', 'fabric', 0.9, 0, { side: true }), g);
  }
  for (let j = 0; j < 3; j++) {
    k.cyl(0.21, 0.21, 0.11, C.wood, g, -0.3, 1.01 + j * 0.11, 0.03);
    k.torus(0.205, 0.012, C.darkWood, g, -0.3, 1.065 + j * 0.11, 0.03, { rx: Math.PI / 2 });
  }
  k.cone(0.21, 0.07, C.paleWood, g, -0.3, 1.365, 0.03);
  for (let i = 0; i < 7; i++) k.box(0.014, 0.008, 0.3, C.darkWood, g, -0.39 + i * 0.03, 1.396, 0.03);
  for (const x of [0.22, 0.38, 0.54]) { k.cyl(0.035, 0.035, 0.17, [C.red, C.cream, C.gold][Math.round((x - 0.22) / 0.16)], g, x, 1.04, 0.11); k.cyl(0.02, 0.03, 0.04, C.dark, g, x, 1.145, 0.11); }
  k.box(0.72, 0.3, 0.018, C.cream, g, 0, 0.63, 0.406); labelLines(k, g, 0, 0.7, 0.42, 0.5, 5, '#984d37');
  for (const x of [-0.65, 0.65]) { bar(k, g, C.black, [x, 1.94, 0], [x, 1.72, 0], 0.005); k.ball(0.035, lit(k, '#ffdea1'), g, x, 1.7, 0); }
  g.userData.tick = steamPuffs(k, g, -0.3, 1.43, 0.03, 0.29);
});
PROPS.food_truck = prop([2.4, 5.2, 3], (k, g, o) => {
  // The working side window faces +X; the driving direction remains +Z.
  vehicle(k, g, { ...o, brand: brand(o, '#c56942') }, 'food', 2.15, 5.1, 2.36);
  k.box(0.025, 0.73, 2.02, C.dark, g, 0.872, 1.6, -0.42);
  k.box(0.03, 0.53, 1.8, C.black, g, 0.892, 1.62, -0.42);
  k.box(0.36, 0.04, 2.12, C.metal, g, 1.025, 1.22, -0.42);
  k.box(0.42, 0.035, 2.16, material(k, '#e8cf8e', 'fabric'), g, 1.005, 2.04, -0.42, { rz: -0.2 });
  for (const z of [-1.4, 0.56]) bar(k, g, C.metal, [0.89, 1.61, z], [1.18, 2.0, z], 0.013);
  for (let i = 0; i < 6; i++) { k.box(0.005, 0.025, 0.55 - (i % 2) * 0.12, C.cream, g, 0.918, 1.82 - i * 0.075, -0.89); }
  for (let i = 0; i < 3; i++) k.cyl(0.045, 0.045, 0.1, [C.red, C.gold, C.teal][i], g, 1.04, 1.29, 0.08 + i * 0.14);
  const burrito = k.group(g, 0, 2.68, -0.2); burrito.rotation.z = Math.PI / 2;
  k.capsule(0.25, 0.85, material(k, '#d9b783', 'paper', 0.8), burrito, 0, 0, 0);
  k.cyl(0.254, 0.254, 0.45, material(k, '#a9afb0', 'metal', 0.6, 0.85), burrito, 0, -0.28, 0);
  for (let i = 0; i < 7; i++) oval(k, burrito, ['#719254', '#b74e39', '#e6d095'][i % 3], Math.sin(i * 2.4) * 0.14, 0.59, Math.cos(i * 2.4) * 0.14, 0.06, 0.045, 0.05, { seg: 8 });
  for (const x of [-0.4, 0.4]) k.box(0.04, 0.2, 0.06, C.dark, g, x, 2.4, -0.2);
});
PROPS.kiosk = prop([2, 2, 2.6], (k, g, o) => {
  const paint = material(k, brand(o, '#437c78'), 'paint', 0.55, 0.3);
  k.box(1.88, 0.12, 1.88, C.dark, g, 0, 0.06, 0);
  k.box(1.82, 0.88, 1.82, paint, g, 0, 0.56, 0);
  k.box(1.82, 1.48, 0.06, C.paleWood, g, 0, 1.7, -0.86);
  for (const x of [-0.87, 0.87]) for (const z of [-0.87, 0.87]) k.box(0.08, 1.45, 0.08, C.dark, g, x, 1.7, z);
  for (const x of [-0.87, 0.87]) k.box(0.025, 0.85, 1.67, C.glass, g, x, 1.57, 0, glass);
  k.box(1.98, 0.1, 1.98, C.dark, g, 0, 2.45, 0, { r: 0.02 });
  k.box(1.7, 0.23, 0.04, lit(k, '#efe0b5'), g, 0, 2.23, 0.89);
  labelLines(k, g, 0, 2.26, 0.913, 0.98, 3, '#3a5b54');
  k.box(1.99, 0.06, 0.42, C.paleWood, g, 0, 1.02, 0.76);
  for (let i = 0; i < 5; i++) { k.cyl(0.044, 0.033, 0.15, C.cream, g, -0.55 + i * 0.2, 1.125, 0.7); k.cyl(0.048, 0.048, 0.012, C.dark, g, -0.55 + i * 0.2, 1.207, 0.7); bar(k, g, C.red, [-0.55 + i * 0.2, 1.2, 0.7], [-0.53 + i * 0.2, 1.3, 0.7], 0.005); }
  for (let row = 0; row < 3; row++) for (let i = 0; i < 4; i++) { k.box(0.28, 0.22, 0.025, material(k, colors[(row + i) % 5], 'paper'), g, -0.55 + i * 0.37, 1.24 + row * 0.3, -0.8); labelLines(k, g, -0.55 + i * 0.37, 1.27 + row * 0.3, -0.783, 0.18, 3, C.cream); }
  for (let i = 0; i < 12; i++) k.box(0.012, 0.62, 0.01, C.paleWood, g, -0.78 + i * 0.14, 0.56, 0.918);
});
PROPS.scaffold = prop([4, 1.2, 6], (k, g) => {
  const steel = material(k, '#a7aaa0', 'metal', 0.6, 0.75);
  for (const x of [-1.92, 0, 1.92]) for (const z of [-0.53, 0.53]) {
    bar(k, g, steel, [x, 0.04, z], [x, 5.96, z], 0.025);
    k.box(0.15, 0.04, 0.15, C.dark, g, x, 0.02, z);
    for (let y = 0.4; y < 6; y += 1.8) k.cyl(0.04, 0.04, 0.06, C.dark, g, x, y, z);
  }
  for (const y of [0.4, 2.2, 4, 5.8]) {
    for (const z of [-0.53, 0.53]) bar(k, g, steel, [-1.95, y, z], [1.95, y, z], 0.025);
    for (let i = 0; i < 4; i++) k.box(3.86, 0.035, 0.23, material(k, '#a39376', 'wood', 0.9), g, 0, y + 0.035, -0.37 + i * 0.245);
  }
  for (const z of [-0.54, 0.54]) for (let row = 0; row < 3; row++) for (let col = 0; col < 2; col++) {
    const x = -1.92 + col * 1.92, y = 0.4 + row * 1.8;
    bar(k, g, steel, [x, y, z], [x + 1.92, y + 1.8, z], 0.017); bar(k, g, steel, [x + 1.92, y, z], [x, y + 1.8, z], 0.017);
  }
  k.plane(3.85, 5.5, material(k, '#43856c', 'fabric', 1, 0, { alpha: 0.26, side: true }), g, 0, 3.1, 0.58);
  for (let i = 0; i < 35; i++) k.box(0.004, 5.45, 0.004, '#39765a', g, -1.87 + i * 0.11, 3.1, 0.587, { r: 0 });
  for (let i = 0; i < 48; i++) k.box(3.8, 0.004, 0.004, '#39765a', g, 0, 0.45 + i * 0.112, 0.587, { r: 0 });
  for (const x of [1.33, 1.63]) bar(k, g, steel, [x, 0.04, -0.44], [x, 5.8, -0.44], 0.015);
  for (let i = 0; i < 20; i++) bar(k, g, steel, [1.33, 0.2 + i * 0.28, -0.44], [1.63, 0.2 + i * 0.28, -0.44], 0.012);
});
PROPS.crane_tower = prop([14, 3, 30], (k, g, o) => {
  const yellow = material(k, '#d7a946', 'paint', 0.55, 0.6), steel = material(k, '#505c60', 'metal', 0.55, 0.7);
  for (const x of [-0.9, 0.9]) for (const z of [-0.9, 0.9]) k.box(0.9, 0.55, 0.9, material(k, '#a2a398', 'concrete'), g, x, 0.275, z);
  for (const x of [-0.55, 0.55]) for (const z of [-0.55, 0.55]) bar(k, g, yellow, [x, 0.55, z], [x, 26.5, z], 0.055);
  for (let row = 0; row < 17; row++) {
    const y = 0.65 + row * 1.5;
    for (const z of [-0.55, 0.55]) { bar(k, g, yellow, [-0.55, y, z], [0.55, y, z], 0.035); bar(k, g, yellow, [-0.55, y, z], [0.55, y + 1.5, z], 0.026); bar(k, g, yellow, [0.55, y, z], [-0.55, y + 1.5, z], 0.026); }
    for (const x of [-0.55, 0.55]) { bar(k, g, yellow, [x, y, -0.55], [x, y, 0.55], 0.035); bar(k, g, yellow, [x, y, -0.55], [x, y + 1.5, 0.55], 0.026); }
  }
  for (const x of [-0.16, 0.16]) bar(k, g, steel, [x, 0.6, -0.25], [x, 26.4, -0.25], 0.016);
  for (let i = 0; i < 86; i++) bar(k, g, steel, [-0.16, 0.8 + i * 0.3, -0.25], [0.16, 0.8 + i * 0.3, -0.25], 0.01);
  const arm = dynamic(k, g, 'jib', 0, 26.5, 0);
  k.cyl(0.72, 0.72, 0.27, steel, arm, 0, 0, 0);
  for (const x of [-6.8, 6.8]) for (const z of [-0.43, 0.43]) bar(k, arm, yellow, [0, 0.2, z], [x, 0.2, z], 0.045);
  bar(k, arm, yellow, [-6.8, 1.15, 0], [6.8, 1.15, 0], 0.045);
  for (let i = 0; i < 17; i++) {
    const x = -6.8 + i * 0.8;
    for (const z of [-0.43, 0.43]) { bar(k, arm, yellow, [x, 0.2, z], [x + 0.4, 1.15, 0], 0.025); bar(k, arm, yellow, [x + 0.4, 1.15, 0], [x + 0.8, 0.2, z], 0.025); }
  }
  for (const z of [-0.36, 0.36]) { bar(k, arm, yellow, [-0.4, 0.3, z], [0, 3.25, 0], 0.045); bar(k, arm, steel, [0, 3.25, 0], [6.4, 1.15, z], 0.014); bar(k, arm, steel, [0, 3.25, 0], [-5.8, 1.15, z], 0.014); }
  for (let i = 0; i < 4; i++) k.box(0.43, 1.1, 1.02, material(k, '#777e79', 'concrete'), arm, -5.7 + i * 0.47, -0.16, 0);
  k.box(0.92, 1.25, 1.1, yellow, arm, 0.9, -0.25, 0);
  k.box(0.8, 0.85, 0.02, k.mat('#2b4854', { rough: 0.08, metal: 0.4 }), arm, 0.9, -0.11, 0.56);
  k.box(0.7, 0.2, 0.65, steel, arm, 4.2, 0.1, 0);
  for (const x of [4.1, 4.3]) bar(k, arm, steel, [x, 0.05, 0], [x, -9.5, 0], 0.012);
  k.box(0.35, 0.45, 0.23, yellow, arm, 4.2, -9.65, 0);
  k.torus(0.18, 0.045, steel, arm, 4.2, -10, 0, { arc: Math.PI * 1.6 });
  g.userData.tick = t => { arm.rotation.y = Math.sin(t * 0.045) * 0.075; };
});

// ── Rooftop services ──
function fan(k, root, x, y, z, r, horizontal = false) {
  const carrier = k.group(root, x, y, z); if (horizontal) carrier.rotation.x = -Math.PI / 2;
  k.disc(r * 1.08, C.black, carrier, 0, 0, 0);
  const rotor = dynamic(k, carrier, 'fan');
  for (let i = 0; i < 5; i++) { const p = k.group(rotor, 0, 0, 0); p.rotation.z = i * Math.PI * 2 / 5; k.extrude([[0.02, 0], [r * 0.65, r * 0.1], [r * 0.93, r * 0.38], [r * 0.35, r * 0.36]], 0.012, C.metal, p, 0, 0, 0.015, { bevel: 0 }); }
  k.cyl(r * 0.18, r * 0.18, 0.035, C.dark, rotor, 0, 0, 0.02, { rx: Math.PI / 2 });
  for (const f of [0.35, 0.6, 0.85, 1.04]) k.torus(r * f, 0.006, C.metal, carrier, 0, 0, 0.05);
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; bar(k, carrier, C.metal, [0, 0, 0.053], [Math.cos(a) * r * 1.05, Math.sin(a) * r * 1.05, 0.053], 0.005); }
  return rotor;
}
PROPS.ac_unit = prop([1, 0.45, 0.8], (k, g) => {
  const enamel = material(k, '#d7d8cb', 'paint', 0.5, 0.4);
  for (const x of [-0.34, 0.34]) k.box(0.09, 0.08, 0.42, C.dark, g, x, 0.04, 0);
  k.box(0.98, 0.69, 0.41, enamel, g, 0, 0.425, 0, { r: 0.018 });
  const rotor = fan(k, g, -0.15, 0.43, 0.192, 0.255);
  grille(k, g, 0.34, 0.43, 0.212, 0.18, 0.48, 14, enamel);
  for (const x of [-0.45, 0.45]) for (const y of [0.13, 0.72]) screw(k, g, x, y, 0.214);
  k.box(0.12, 0.055, 0.004, C.white, g, 0.3, 0.7, 0.218); labelLines(k, g, 0.3, 0.71, 0.221, 0.08, 2);
  g.userData.tick = t => { rotor.rotation.z = -t * 3.4; };
});
function tankStand(k, g, width, h) {
  for (const x of [-width / 2, width / 2]) for (const z of [-width / 2, width / 2]) {
    k.box(0.08, h, 0.08, C.dark, g, x, h / 2, z);
    k.box(0.2, 0.04, 0.2, C.metal, g, x, 0.02, z);
  }
  for (const z of [-width / 2, width / 2]) { bar(k, g, C.metal, [-width / 2, 0.1, z], [width / 2, h, z], 0.02); bar(k, g, C.metal, [width / 2, 0.1, z], [-width / 2, h, z], 0.02); }
}
function ladder(k, g, x, z, h, width = 0.3, start = 0.1) {
  for (const dx of [-width / 2, width / 2]) bar(k, g, C.metal, [x + dx, start, z], [x + dx, h, z], 0.014);
  for (let y = start + 0.15; y < h; y += 0.23) bar(k, g, C.metal, [x - width / 2, y, z], [x + width / 2, y, z], 0.012);
}
PROPS.water_tank = prop([1.6, 1.6, 2.4], (k, g) => {
  tankStand(k, g, 0.96, 0.55);
  const steel = material(k, '#b6c2c2', 'metal', 0.27, 0.9);
  k.lathe([[0, 0], [0.5, 0], [0.68, 0.12], [0.7, 0.27], [0.7, 1.4], [0.65, 1.54], [0.35, 1.65], [0, 1.65]], steel, g, 0, 0.53, 0, { seg: 40 });
  for (let i = 0; i < 7; i++) k.torus(0.7, 0.018, steel, g, 0, 0.8 + i * 0.18, 0, { rx: Math.PI / 2 });
  k.cyl(0.21, 0.22, 0.055, C.dark, g, 0, 2.2, 0);
  k.cyl(0.24, 0.24, 0.035, steel, g, 0, 2.245, 0);
  k.tube([[0.56, 0.75, 0.06], [0.73, 0.75, 0.06], [0.73, 0.15, 0.06]], 0.025, steel, g, 0, 0, 0);
  k.torus(0.055, 0.01, C.red, g, 0.74, 0.56, 0.1);
  ladder(k, g, 0, 0.765, 2.33, 0.3);
});
PROPS.water_tower_wood = prop([2, 2, 3.4], (k, g) => {
  tankStand(k, g, 1.25, 1.1);
  const wood = material(k, '#987449', 'wood', 0.86);
  k.cyl(0.84, 0.82, 1.7, wood, g, 0, 1.95, 0, { seg: 40 });
  for (let i = 0; i < 32; i++) { const a = i * Math.PI / 16; bar(k, g, C.darkWood, [Math.cos(a) * 0.837, 1.14, Math.sin(a) * 0.837], [Math.cos(a) * 0.845, 2.76, Math.sin(a) * 0.845], 0.008); }
  for (const y of [1.22, 1.72, 2.25, 2.7]) k.torus(0.846, 0.025, C.dark, g, 0, y, 0, { rx: Math.PI / 2 });
  k.cone(0.94, 0.53, material(k, '#6b7975', 'metal', 0.72, 0.6), g, 0, 3.065, 0, { seg: 32 });
  k.cyl(0.06, 0.06, 0.07, C.metal, g, 0, 3.365, 0);
  ladder(k, g, 0, 0.94, 2.9, 0.34);
});
PROPS.roof_vent = prop([0.8, 0.8, 0.9], (k, g) => {
  k.box(0.78, 0.05, 0.78, C.metal, g, 0, 0.025, 0);
  k.cyl(0.22, 0.24, 0.46, C.metal, g, 0, 0.28, 0);
  k.cyl(0.32, 0.32, 0.21, C.dark, g, 0, 0.59, 0);
  for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; k.box(0.12, 0.24, 0.02, C.metal, g, Math.cos(a) * 0.29, 0.6, Math.sin(a) * 0.29, { ry: -a + 0.6, rz: 0.15 }); }
  k.cone(0.38, 0.17, C.metal, g, 0, 0.795, 0);
  for (const x of [-0.31, 0.31]) for (const z of [-0.31, 0.31]) k.cyl(0.018, 0.018, 0.01, C.dark, g, x, 0.057, z, { seg: 6 });
});
PROPS.roof_hvac = prop([2.6, 1.6, 1.4], (k, g) => {
  for (const x of [-0.9, 0.9]) k.box(0.15, 0.16, 1.55, C.dark, g, x, 0.08, 0);
  k.box(2.55, 1.02, 1.5, material(k, '#b7c0b7', 'paint', 0.65, 0.5), g, 0, 0.67, 0, { r: 0.025 });
  const fans = [-0.62, 0.62].map(x => fan(k, g, x, 1.19, 0, 0.42, true));
  for (const x of [-0.72, 0.72]) { grille(k, g, x, 0.7, 0.755, 1.08, 0.72, 17, C.metal); for (const dx of [-0.56, 0.56]) screw(k, g, x + dx, 1.12, 0.766); }
  k.box(0.3, 0.07, 0.004, C.white, g, 0, 0.32, 0.762); labelLines(k, g, 0, 0.34, 0.766, 0.22, 3);
  g.userData.tick = t => { fans.forEach((f, i) => { f.rotation.z = t * (2.3 + i * 0.4); }); };
});
PROPS.solar_array = prop([3.2, 2, 0.8], (k, g) => {
  for (const x of [-1.35, 1.35]) {
    k.box(0.12, 0.045, 1.8, C.dark, g, x, 0.0225, 0);
    bar(k, g, C.metal, [x, 0.04, -0.7], [x, 0.66, -0.7], 0.025);
    bar(k, g, C.metal, [x, 0.04, 0.7], [x, 0.66, -0.7], 0.025);
  }
  const p = k.group(g, 0, 0.41, 0); p.rotation.x = 0.31;
  const blue = k.mat('#193d64', { rough: 0.24, metal: 0.35, tex: 'paint', clear: 0.6 });
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 1.055;
    k.box(1.035, 0.035, 1.86, C.metal, p, x, 0, 0);
    k.box(0.99, 0.008, 1.8, blue, p, x, 0.022, 0);
    for (let j = 0; j < 6; j++) k.box(0.005, 0.003, 1.78, C.metal, p, x - 0.415 + j * 0.166, 0.028, 0, { r: 0 });
    for (let j = 0; j < 10; j++) k.box(0.98, 0.003, 0.005, C.metal, p, x, 0.028, -0.81 + j * 0.18, { r: 0 });
  }
});
PROPS.sat_dish = prop([1.2, 1.2, 1.3], (k, g) => {
  k.box(0.65, 0.05, 0.65, C.dark, g, 0, 0.025, 0);
  k.cyl(0.04, 0.07, 0.57, C.metal, g, 0, 0.32, 0);
  const p = k.group(g, 0, 0.7, 0); p.rotation.x = Math.PI * 0.27;
  k.lathe([[0, 0], [0.15, 0.01], [0.3, 0.055], [0.45, 0.14], [0.56, 0.23]], material(k, '#d1d4c9', 'metal', 0.4, 0.5, { side: true }), p, 0, 0, 0, { seg: 36 });
  k.torus(0.56, 0.014, C.metal, p, 0, 0.23, 0, { rx: Math.PI / 2 });
  bar(k, p, C.dark, [0, 0.18, 0.52], [0, 0.61, 0.12], 0.019);
  k.cyl(0.045, 0.06, 0.12, C.white, p, 0, 0.6, 0.12);
  k.tube([[0, 0.6, 0.14], [0.02, 0.19, 0.5], [0.04, -0.1, 0.1]], 0.008, C.black, p, 0, 0, 0);
});
PROPS.antenna_mast = prop([0.6, 0.6, 6], (k, g) => {
  k.box(0.52, 0.08, 0.52, C.dark, g, 0, 0.04, 0);
  k.cyl(0.025, 0.065, 5.79, C.metal, g, 0, 2.975, 0);
  for (let i = 0; i < 6; i++) {
    const y = 3.9 + i * 0.28;
    bar(k, g, C.metal, [-0.28 + i * 0.025, y, 0], [0.28 - i * 0.025, y, 0], 0.011);
  }
  for (const x of [-0.23, 0.23]) bar(k, g, C.dark, [x, 0.06, 0.19], [0, 3.1, 0], 0.006);
  const beacon = dynamic(k, g, 'beacon', 0, 5.9, 0);
  const base = lit(k, '#f04736'), m = base.clone(); m.onBeforeCompile = base.onBeforeCompile; m.customProgramCacheKey = base.customProgramCacheKey;
  g.userData.own = [m]; k.nightMats.push([m, 0.18, 3]);
  k.cyl(0.045, 0.045, 0.09, m, beacon, 0, 0, 0);
  k.cyl(0.055, 0.055, 0.014, C.dark, beacon, 0, 0.052, 0);
  g.userData.tick = t => { m.emissiveIntensity = base.emissiveIntensity * (0.05 + Math.pow(0.5 + 0.5 * Math.sin(t * 1.9), 4) * 0.95); };
});
PROPS.roof_garden = prop([4, 3, 2.4], (k, g, o) => {
  for (let i = 0; i < 18; i++) k.box(3.98, 0.055, 0.157, material(k, i % 3 ? '#9e805b' : '#b3946c', 'wood', 0.8), g, 0, 0.0275, -1.41 + i * 0.166, { r: 0.006 });
  for (const x of [-1.81, 1.81]) for (const z of [-1.3, 1.3]) k.box(0.075, 2.28, 0.075, C.dark, g, x, 1.195, z);
  for (const x of [-1.81, 1.81]) k.box(0.075, 0.09, 2.75, C.dark, g, x, 2.31, 0);
  for (let i = 0; i < 14; i++) k.box(0.11, 0.06, 2.75, C.paleWood, g, -1.75 + i * 0.27, 2.365, 0);
  for (const x of [-1.09, 1.09]) { const p = PROPS.planter_box.build(k, o); p.position.set(x, 0.055, -1.04); p.scale.set(0.88, 0.85, 0.9); g.add(p); }
  for (const x of [-0.8, 0.8]) {
    const p = k.group(g, x, 0.055, 0.3, x < 0 ? 0.3 : -0.3);
    feet(k, p, 0.45, 0.5, 0.4, C.dark, 0, 0.035);
    for (let i = 0; i < 5; i++) k.box(0.55, 0.035, 0.08, C.paleWood, p, 0, 0.43, -0.2 + i * 0.1);
    for (const y of [0.6, 0.72, 0.84]) k.box(0.55, 0.09, 0.035, C.paleWood, p, 0, y, -0.24);
    for (const dx of [-0.23, 0.23]) k.box(0.03, 0.47, 0.03, C.dark, p, dx, 0.64, -0.24);
  }
  k.cyl(0.3, 0.3, 0.04, C.paleWood, g, 0, 0.51, 0.65); k.cyl(0.035, 0.14, 0.47, C.dark, g, 0, 0.29, 0.65); cup(k, g, 0, 0.53, 0.65, C.cream, 0.7);
});
PROPS.helipad = prop([7, 7, 0.1], (k, g) => {
  k.cyl(3.5, 3.5, 0.065, material(k, '#536c62', 'concrete', 0.95), g, 0, 0.0325, 0, { seg: 64 });
  const white = material(k, '#e5e0c2', 'paint', 0.85);
  for (let i = 0; i < 64; i++) { const a = i * Math.PI / 32; k.box(0.26, 0.006, 0.12, white, g, Math.sin(a) * 2.65, 0.069, Math.cos(a) * 2.65, { ry: a, r: 0 }); }
  for (const x of [-0.65, 0.65]) k.box(0.22, 0.006, 2.1, white, g, x, 0.069, 0, { r: 0 });
  k.box(1.3, 0.006, 0.22, white, g, 0, 0.069, 0, { r: 0 });
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; k.cyl(0.055, 0.065, 0.022, lit(k, '#9fd4b5'), g, Math.sin(a) * 3.25, 0.079, Math.cos(a) * 3.25); }
});
PROPS.laundry_line = prop([2.4, 0.6, 1.9], (k, g, o) => {
  for (const x of [-1.12, 1.12]) { k.box(0.18, 0.045, 0.58, C.dark, g, x, 0.0225, 0); bar(k, g, C.metal, [x, 0.04, 0], [x, 1.88, 0], 0.02); bar(k, g, C.metal, [x, 1.86, -0.25], [x, 1.86, 0.25], 0.018); }
  for (const z of [-0.2, 0.2]) k.tube([[-1.12, 1.85, z], [0, 1.79, z], [1.12, 1.85, z]], 0.006, C.dark, g, 0, 0, 0);
  for (let i = 0; i < 5; i++) {
    const x = -0.83 + i * 0.41, fabric = material(k, ['#d9d5c3', '#759cab', '#bd887d', '#d6b86c', '#8f9d8a'][(i + (o.seed >>> 0)) % 5], 'fabric', 0.93);
    const p = k.group(g, x, 1.76, i % 2 ? -0.2 : 0.2);
    k.extrude([[-0.12, 0], [-0.22, -0.06], [-0.2, -0.19], [-0.12, -0.15], [-0.13, -0.56], [0.13, -0.56], [0.12, -0.15], [0.2, -0.19], [0.22, -0.06], [0.12, 0], [0.05, -0.05], [-0.05, -0.05]], 0.018, fabric, p, 0, 0, 0);
    for (const dx of [-0.09, 0.09]) k.box(0.018, 0.075, 0.03, C.wood, p, dx, 0.01, 0);
    for (const dx of [-0.07, 0.035]) bar(k, p, fabric, [dx, -0.16, 0.02], [dx + 0.015, -0.51, 0.02], 0.006);
    k.box(0.22, 0.006, 0.004, C.cream, p, 0, -0.53, 0.022, { r: 0 });
  }
});

// ── Finish pass on the inherited drawings: details are chosen per object ──
function legacyFinish(k, g, name, o) {
  const metal = material(k, '#b0b8b7', 'metal', 0.33, 0.8), paper = material(k, '#e9e3d3', 'paper', 0.9);
  switch (name) {
    case 'coffee_bar':
      for (const x of [-0.57, -0.42, -0.27]) { k.cyl(0.022, 0.022, 0.012, metal, g, x, 1.015, 0.114, { rx: Math.PI / 2 }); k.ball(0.008, lit(k, C.teal), g, x, 1.056, 0.112); }
      for (let i = 0; i < 9; i++) k.box(0.018, 0.005, 0.14, metal, g, -0.6 + i * 0.045, 0.785, 0.1, { r: 0 });
      k.tube([[-0.64, 0.98, 0.07], [-0.68, 0.9, 0.17], [-0.63, 0.83, 0.17]], 0.012, metal, g, 0, 0, 0);
      break;
    case 'water_cooler': case 'water_dispenser':
      if (name === 'water_cooler') {
        for (const n of g.children.slice()) if (n.isMesh && n.position.y === 1.05) g.remove(n);
        face(k, g, o, 'screen', 0.2, 0.1, 0, 1.05, 0.193);
      }
      for (const x of [-0.075, 0.075]) { bar(k, g, metal, [x, name === 'water_cooler' ? 0.81 : 0.53, 0.19], [x, name === 'water_cooler' ? 0.75 : 0.47, 0.19], 0.011); }
      for (let i = 0; i < 7; i++) k.box(0.012, 0.004, 0.047, metal, g, -0.105 + i * 0.035, name === 'water_cooler' ? 0.619 : 0.386, 0.174, { r: 0 });
      break;
    case 'printer':
      for (const n of g.children.slice()) if (n.isMesh && n.position.x === 0.22 && n.position.y === 0.75) g.remove(n);
      face(k, g, o, 'screen', 0.11, 0.06, 0.22, 0.75, 0.226);
      for (let i = 0; i < 4; i++) k.box(0.023, 0.016, 0.007, i ? C.dark : C.teal, g, 0.15 + i * 0.035, 0.72, 0.219);
      grille(k, g, -0.23, 0.72, 0.216, 0.13, 0.08, 5);
      for (let i = 0; i < 5; i++) k.box(0.22, 0.002, 0.006, C.dark, g, -0.02, 0.67 - i * 0.017, 0.195 + i * 0.012, { rx: 0.95, r: 0 });
      break;
    case 'sofa':
      for (const x of [-0.39, 0.39]) {
        k.tube([[x - 0.32, 0.48, -0.18], [x - 0.32, 0.49, 0.31], [x + 0.32, 0.49, 0.31], [x + 0.32, 0.48, -0.18]], 0.005, material(k, '#bdd0da', 'fabric'), g, 0, 0, 0);
        for (const dx of [-0.15, 0.15]) k.ball(0.012, '#5b769a', g, x + dx, 0.65, -0.226, { sz: 0.3 });
      }
      break;
    case 'coffee_table':
      for (let i = 0; i < 6; i++) k.box(0.22, 0.001, 0.003, paper, g, -0.15, 0.295 + i * 0.004, 0.14, { r: 0 });
      k.box(0.18, 0.002, 0.05, paper, g, -0.15, 0.339, 0.025, { ry: 0.2, r: 0 }); break;
    case 'bookshelf':
      for (let row = 0; row < 3; row++) for (let i = 0; i < (row === 2 ? 3 : 6); i++) { const x = -0.49 + i * 0.18, y = 0.28 + row * 0.59; labelLines(k, g, x, y, 0.143, 0.075, 3, C.cream); k.box(0.095, 0.009, 0.003, C.gold, g, x, y - 0.08, 0.144); } break;
    case 'boxes': case 'parcels':
      for (const m of g.children.slice()) if (m.isMesh && m.geometry.parameters?.height > 0.12 && m.geometry.parameters?.depth > 0.1) {
        const b = m.geometry.parameters, x = m.position.x, y = m.position.y, z = m.position.z + b.depth / 2 + 0.009;
        for (let i = 0; i < 9; i++) k.box(i % 3 ? 0.004 : 0.008, 0.055, 0.002, C.black, g, x - 0.05 + i * 0.012, y, z, { r: 0 });
      } break;
    case 'trash_bin':
      for (const x of [-0.12, 0.12]) k.box(0.016, 0.12, 0.026, metal, g, x, 0.32, 0.105);
      k.box(0.065, 0.015, 0.02, C.dark, g, 0, 0.27, 0.163, { rz: 0.5 }); break;
    case 'vending':
      for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
        const x = -0.26 + col * 0.18, y = 0.74 + row * 0.29;
        k.cyl(0.055, 0.055, 0.006, metal, g, x, y + 0.092, 0.3); k.box(0.05, 0.08, 0.003, paper, g, x, y, 0.355);
      }
      k.box(0.09, 0.014, 0.013, C.black, g, 0.32, 0.66, 0.401); labelLines(k, g, 0, 1.73, 0.402, 0.45, 3); break;
    case 'reception':
      for (let i = 0; i < 32; i++) k.box(0.012, 0.67, 0.014, C.wood, g, -1.23 + i * 0.079, 0.43, 0.39);
      break;
    case 'meeting_table':
      k.box(0.22, 0.008, 0.1, C.dark, g, 0, 0.785, 0);
      for (const x of [-0.07, 0, 0.07]) k.box(0.035, 0.003, 0.04, C.black, g, x, 0.791, 0);
      for (const x of [-0.9, 0.9]) { cup(k, g, x, 0.785, 0.26, C.white, 0.55); k.box(0.23, 0.008, 0.17, paper, g, x, 0.788, -0.2); }
      break;
    case 'arcade': {
      // Replace the old thick screen and pixel ornaments with a single UV plane.
      for (const m of g.children.slice()) if (m.isMesh && m.position.z >= 0.14 && m.position.z <= 0.17 && m.position.y > 1.1 && m.position.y < 1.5) g.remove(m);
      face(k, g, o, 'screen', 0.47, 0.35, 0, 1.28, 0.141);
      grille(k, g, 0, 0.28, 0.358, 0.4, 0.15, 6);
      for (const x of [-0.3, 0.3]) screw(k, g, x, 0.75, 0.358); break;
    }
    case 'fridge':
      for (let i = 0; i < 7; i++) labelLines(k, g, -0.09 + (i % 2) * 0.24, 0.58 + Math.floor(i / 2) * 0.27, 0.346, 0.08, 4);
      grille(k, g, 0, 0.06, 0.31, 0.56, 0.065, 3); break;
    case 'standing_lamp':
      for (let i = 0; i < 20; i++) { const a = i * Math.PI / 10; bar(k, g, material(k, '#dfcfaa', 'fabric'), [Math.cos(a) * 0.199, 1.35, Math.sin(a) * 0.199], [Math.cos(a) * 0.12, 1.67, Math.sin(a) * 0.12], 0.003); }
      k.tube([[0, 0.1, 0], [0.13, 0.015, 0.04], [0.16, 0.015, 0.12]], 0.006, C.black, g, 0, 0, 0); break;
    case 'rug':
      for (let i = 0; i < 45; i++) for (const x of [-1.16, 1.16]) k.box(0.065, 0.003, 0.007, material(k, '#dfd6ba', 'fabric'), g, x, 0.021, -0.73 + i * 0.033, { r: 0 }); break;
    case 'phone_booth':
      for (let i = 0; i < 12; i++) k.box(0.017, 0.017, 0.006, C.white, g, -0.04 + i % 3 * 0.038, 1.37 - Math.floor(i / 3) * 0.04, -0.35);
      k.tube([[-0.11, 1.27, -0.31], [-0.14, 1.1, -0.3], [-0.02, 1.11, -0.3], [0, 1.21, -0.35]], 0.008, C.black, g, 0, 0, 0);
      break;
    case 'bean_bag':
      k.tube([[-0.33, 0.15, 0.2], [-0.4, 0.29, 0.06], [-0.3, 0.49, -0.18], [-0.13, 0.66, -0.2]], 0.005, material(k, '#d7bd9f', 'fabric'), g, 0, 0, 0); break;
    case 'trophy_case':
      for (const y of [0.23, 0.84]) for (const x of [-0.32, 0.32]) { k.box(0.19, 0.045, 0.007, C.gold, g, x, y, 0.201); labelLines(k, g, x, y + 0.009, 0.207, 0.12, 2); }
      for (const x of [-0.04, 0.04]) k.box(0.012, 0.17, 0.02, metal, g, x, 1.03, 0.21); break;
    case 'statue_founder':
      for (const x of [-0.08, 0.08]) k.torus(0.053, 0.012, C.gold, g, x, 2.04, 0.255);
      labelLines(k, g, 0, 0.44, 0.46, 0.3, 4, '#725125');
      for (let i = 0; i < 6; i++) k.box(0.045, 0.004, 0.015, '#9c7525', g, 0.12 + i * 0.06, 2.553, 0.08); break;
    case 'pingpong':
      for (let i = 0; i < 24; i++) k.box(0.006, 0.1, 0.004, C.dark, g, 0.013, 0.81, -0.69 + i * 0.06, { r: 0 });
      for (const y of [0.78, 0.81, 0.84]) k.box(0.005, 0.003, 1.41, C.dark, g, 0.013, y, 0, { r: 0 });
      for (const x of [-1.05, 1.05]) bar(k, g, metal, [x, 0.18, -0.52], [x, 0.61, 0.52], 0.018); break;
    case 'foosball':
      for (const x of [-0.4, -0.13, 0.13, 0.4]) k.cyl(0.035, 0.035, 0.11, C.black, g, x, 0.85, 0.34, { rx: Math.PI / 2 });
      k.torus(0.13, 0.006, C.white, g, 0, 0.797, 0, { rx: Math.PI / 2 });
      for (const x of [-0.55, 0.55]) for (let i = 0; i < 5; i++) k.ball(0.015, i < 2 ? C.red : C.white, g, x, 0.892, -0.2 + i * 0.04); break;
    case 'kombucha':
      for (let i = 0; i < 18; i++) { const a = i * Math.PI / 9; bar(k, g, C.darkWood, [Math.cos(a) * 0.252, 0.31, Math.sin(a) * 0.252], [Math.cos(a) * 0.252, 0.98, Math.sin(a) * 0.252], 0.004); }
      labelLines(k, g, 0, 0.84, 0.27, 0.17, 2); break;
    case 'skateboard':
      for (const x of [-0.25, 0.25]) for (const z of [-0.05, 0.05]) k.cyl(0.006, 0.006, 0.004, metal, g, x, 0.151, z, { seg: 6 }); break;
    case 'surfboard':
      k.tube([[0.03, 0.12, -0.03], [0.16, 0.1, 0.04], [0.17, 0.03, 0.05], [0.08, 0.04, 0.06]], 0.005, C.black, g, 0, 0, 0);
      k.box(0.005, 1.48, 0.005, C.gold, g, 0, 1.05, 0.069, { rx: -0.075 }); break;
    case 'garage_shelf':
      for (const x of [-0.74, 0.74]) for (let i = 0; i < 18; i++) k.box(0.015, 0.023, 0.005, C.black, g, x, 0.15 + i * 0.095, 0.243, { r: 0 });
      for (const x of [-0.43, 0, 0.43]) { k.torus(0.1, 0.006, metal, g, x, 0.41, 0, { arc: Math.PI }); k.box(0.12, 0.12, 0.006, paper, g, x, 0.32, 0.14); labelLines(k, g, x, 0.35, 0.145, 0.08, 3); } break;
    case 'tea_table':
      for (let i = 0; i < 16; i++) k.box(0.012, 0.005, 0.33, C.darkWood, g, -0.27 + i * 0.036, 0.703, 0, { r: 0 });
      for (const x of [-0.71, 0.71]) k.torus(0.13, 0.008, C.gold, g, x, 0.443, 0, { rx: Math.PI / 2 }); break;
    case 'lucky_cat':
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) bar(k, g, C.gold, [s * 0.08, 0.405 - i * 0.016, 0.121], [s * 0.13, 0.412 - i * 0.02, 0.116], 0.003);
      break;
    case 'camp_bed': case 'bunk_bed':
      for (let i = 0; i < 12; i++) k.box(0.006, 0.004, name === 'camp_bed' ? 0.5 : 0.68, C.cream, g, (name === 'camp_bed' ? 0.24 : -0.07) + i * 0.035, name === 'camp_bed' ? 0.443 : 1.468, 0, { r: 0 }); break;
    case 'rice_cooker':
      k.torus(0.193, 0.006, metal, g, 0, 0.661, 0, { rx: Math.PI / 2 });
      labelLines(k, g, 0, 0.535, 0.205, 0.06, 2, C.white); break;
    case 'clothes_rack':
      for (let i = 0; i < 3; i++) { const x = -0.43 + i * 0.43; for (let j = 0; j < 5; j++) k.ball(0.005, C.cream, g, x, 1.3 - j * 0.065, 0.058, { seg: 8 }); k.box(0.23, 0.006, 0.004, C.cream, g, x, 0.95, 0.058, { r: 0 }); } break;
    case 'fish_tank':
      for (let i = 0; i < 18; i++) oval(k, g, material(k, i % 2 ? '#b9a88a' : '#8e9689', 'stone'), -0.4 + hash(o.seed, i) * 0.8, 0.76, -0.11 + hash(o.seed, i + 40) * 0.22, 0.025, 0.012, 0.018, { seg: 8 });
      k.box(0.065, 0.29, 0.07, C.black, g, 0.37, 1.06, -0.1); k.tube([[0.37, 1.19, -0.1], [0.3, 1.21, -0.1], [0.3, 1.16, -0.07]], 0.012, metal, g, 0, 0, 0); break;
    case 'scroll':
      for (const x of [-0.5, 0.5]) k.tube([[x, 0.26, -0.015], [x * 0.6, 0.29, -0.02], [0, 0.29, -0.02]], 0.003, C.gold, g, 0, 0, 0);
      k.box(0.065, 0.065, 0.002, C.red, g, 0.43, -0.15, 0.032); break;
    case 'bench':
      for (const x of [-0.6, 0.6]) for (const y of [0.57, 0.74]) screw(k, g, x, y, -0.174);
      for (const x of [-0.69, 0.69]) k.tube([[x, 0.43, -0.17], [x, 0.63, -0.14], [x, 0.63, 0.17], [x, 0.43, 0.17]], 0.018, C.dark, g, 0, 0, 0); break;
    case 'fire_hydrant':
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; k.cyl(0.012, 0.012, 0.009, metal, g, Math.cos(a) * 0.13, 0.075, Math.sin(a) * 0.13, { seg: 6 }); }
      k.tube([[-0.13, 0.4, 0], [-0.12, 0.21, 0.1], [0, 0.23, 0.14]], 0.006, metal, g, 0, 0, 0); break;
    case 'traffic_cone':
      for (const x of [-0.13, 0.13]) for (const z of [-0.13, 0.13]) k.cyl(0.012, 0.012, 0.005, C.black, g, x, 0.057, z, { seg: 8 }); break;
    case 'mailbox':
      labelLines(k, g, 0, 0.74, 0.195, 0.14, 3); k.cyl(0.018, 0.018, 0.007, metal, g, 0.16, 0.71, 0.183, { rx: Math.PI / 2 });
      k.box(0.41, 0.004, 0.005, C.dark, g, 0, 0.65, 0.181, { r: 0 }); break;
    case 'bicycle': case 'shared_bike': case 'e_bike':
      for (const x of [-0.5, 0.5]) {
        const r = name === 'e_bike' ? 0.24 : 0.31, y = r + 0.035;
        for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; bar(k, g, metal, [x, y, 0.025], [x + Math.cos(a) * (r - 0.05), y + Math.sin(a) * (r - 0.05), 0.025], 0.003); }
        k.cyl(0.035, 0.035, 0.08, metal, g, x, y, 0, { rx: Math.PI / 2 });
      }
      k.tube([[0.32, 0.91, 0.03], [0.5, 0.8, 0.06], [0.37, 0.48, 0.04]], 0.005, C.black, g, 0, 0, 0);
      k.torus(0.065, 0.009, metal, g, -0.08, 0.29, 0.05); break;
  }
}
// Material context changes fabric without changing wood or structural metal.
const rebuiltLegacy = new Set(['car', 'plant_small', 'plant_tall', 'money_tree', 'tree_round', 'tree_palm', 'bush', 'atrium_tree', 'street_lamp']);
for (const name of Object.keys(legacySizes)) if (!rebuiltLegacy.has(name)) {
  const original = PROPS[name].build;
  PROPS[name].build = (k, o = {}) => { const sk = surfaceKit(k, name), g = original(sk, o); legacyFinish(sk, g, name, o); return g; };
}
// Starting-location miniatures. Keep these separate from the legacy drawings.
function ownedGlow(k, g, color) {
  const source = lit(k, color), m = source.clone();
  m.onBeforeCompile = source.onBeforeCompile; m.customProgramCacheKey = source.customProgramCacheKey;
  (g.userData.own ||= []).push(m); k.nightMats.push([m, .18, 2.6]);
  return { source, m };
}
PROPS.workbench = prop([1.8, .7, 1.9], (k, g, o) => {
  const wood = material(k, '#ba8756', 'wood', .65), steel = material(k, '#555d61', 'metal', .42, .75);
  feet(k, g, 1.62, .54, .82, steel, 0, .07);
  k.box(1.8, .09, .7, wood, g, 0, .855, 0, { r: .018 });
  k.box(1.74, .91, .045, wood, g, 0, 1.435, -.32);
  for (let row = 0; row < 8; row++) for (let col = 0; col < 18; col++)
    k.disc(.009, C.black, g, -.79 + col * .093, 1.06 + row * .106, -.295, { seg: 8 });
  for (let i = 0; i < 4; i++) {
    const x = -.62 + i * .4;
    k.box(.37, .24, .5, wood, g, x, .66, 0);
    k.box(.15, .025, .025, steel, g, x, .69, .265);
  }
  k.box(1.65, .045, .55, steel, g, 0, .17, 0);
  k.box(.53, .25, .32, C.red, g, -.35, .32, .06, { r: .022 });
  k.box(.55, .045, .34, C.red, g, -.35, .46, .06);
  k.tube([[-.46, .49, .06], [-.46, .55, .06], [-.24, .55, .06], [-.24, .49, .06]], .012, steel, g, 0, 0, 0);
  for (const x of [-.52, -.18]) k.box(.028, .07, .015, C.metal, g, x, .43, .235);
  // Vise: fixed jaw, sliding jaw, screw and cross handle.
  k.box(.25, .06, .2, steel, g, -.67, .93, .17);
  for (const z of [.08, .28]) k.box(.23, .12, .045, steel, g, -.67, 1.01, z);
  bar(k, g, C.metal, [-.67, .96, .08], [-.67, .96, .34], .018);
  bar(k, g, C.metal, [-.78, .96, .335], [-.56, .96, .335], .009);
  // Hanging wrench, hammer, screwdriver, cable reel and drill.
  k.box(.035, .24, .025, steel, g, -.68, 1.52, -.25);
  k.torus(.043, .014, steel, g, -.68, 1.66, -.25, { arc: Math.PI * 1.55, rz: -.85 });
  k.box(.035, .26, .035, C.darkWood, g, -.4, 1.49, -.25);
  k.box(.16, .06, .06, steel, g, -.4, 1.64, -.25);
  k.box(.045, .12, .04, brand(o), g, -.15, 1.44, -.25);
  bar(k, g, C.metal, [-.15, 1.5, -.25], [-.15, 1.72, -.25], .009);
  for (let i = 0; i < 3; i++) k.torus(.105 + i * .012, .009, C.black, g, .17, 1.55, -.25 + i * .01);
  k.box(.2, .1, .09, brand(o), g, .56, 1.6, -.23, { r: .02 });
  k.box(.07, .15, .08, brand(o), g, .59, 1.5, -.23, { rz: -.2 });
  bar(k, g, C.metal, [.45, 1.6, -.23], [.35, 1.6, -.23], .013);
  k.box(.32, .016, .2, '#2d8655', g, -.16, .909, .13);
  for (let i = 0; i < 5; i++) { k.box(.035, .025, .045, C.black, g, -.27 + i * .055, .93, .12); k.box(.003, .002, .16, C.gold, g, -.27 + i * .055, .919, .13); }
  bar(k, g, C.black, [.09, .925, .19], [.26, .925, .12], .022);
  bar(k, g, C.metal, [.26, .925, .12], [.35, .925, .08], .008);
  k.ball(.009, lit(k, C.orange, .08), g, .35, .925, .08, { seg: 8 });
  k.box(.28, .025, .18, C.cream, g, .59, .916, -.06);
  k.box(.055, .12, .06, C.cream, g, .59, .98, -.12);
  k.box(.43, .32, .19, '#b6b19c', g, .59, 1.17, -.12, { r: .025 });
  k.plane(.35, .24, lit(k, '#567b66', .06), g, .59, 1.18, -.021);
});
PROPS.basketball_hoop = prop([1.2, 1.3, 3.2], (k, g) => {
  const steel = material(k, '#697481', 'metal', .4, .75);
  k.box(.85, .2, .64, C.black, g, 0, .1, -.32, { r: .025 });
  k.cyl(.045, .045, .015, C.dark, g, .22, .207, -.32);
  bar(k, g, steel, [0, .19, -.42], [0, 2.98, -.12], .055);
  for (const x of [-.3, .3]) bar(k, g, steel, [x, .18, -.12], [0, 1.25, -.31], .025);
  k.box(1.16, .72, .035, k.mat(C.glass, { ...glass, metal: .1 }), g, 0, 2.82, -.05);
  for (const x of [-.58, .58]) k.box(.035, .75, .05, C.red, g, x, 2.82, -.025);
  for (const y of [2.46, 3.18]) k.box(1.18, .035, .05, C.red, g, 0, y, -.025);
  for (const x of [-.2, .2]) k.box(.018, .23, .008, C.white, g, x, 2.7, -.025);
  for (const y of [2.585, 2.815]) k.box(.4, .018, .008, C.white, g, 0, y, -.025);
  k.box(.13, .045, .18, C.orange, g, 0, 2.52, .06);
  k.torus(.23, .018, C.orange, g, 0, 2.52, .35, { rx: Math.PI / 2 });
  for (let i = 0; i < 10; i++) {
    const a = i * Math.PI / 5, b = a + .25;
    bar(k, g, C.white, [Math.cos(a) * .22, 2.5, .35 + Math.sin(a) * .22], [Math.cos(b) * .13, 2.19, .35 + Math.sin(b) * .13], .005);
  }
  k.torus(.13, .005, C.white, g, 0, 2.19, .35, { rx: Math.PI / 2 });
});
PROPS.picket_fence = prop([2, .12, .9], (k, g) => {
  const paint = material(k, '#eeeade', 'wood', .7);
  for (const x of [-.95, .95]) k.box(.1, .9, .12, paint, g, x, .45, 0);
  for (const y of [.22, .6]) k.box(2, .075, .04, paint, g, 0, y, -.035);
  for (let i = 0; i < 11; i++) {
    const x = -.83 + i * .166;
    k.extrude([[-.055, .04], [.055, .04], [.055, .74], [0, .85], [-.055, .74]], .025, paint, g, x, 0, .015, { bevel: .006 });
  }
});
PROPS.lemon_tree = prop([1.6, 1.6, 2.6], (k, g, o) => {
  const bark = material(k, '#796444', 'wood', .92), leaves = ['#3e7543', '#568a42', '#71994a'].map(c => material(k, c, 'foliage', .92));
  k.cyl(.075, .14, 1.35, bark, g, 0, .675, 0, { seg: 10 });
  for (let i = 0; i < 7; i++) {
    const a = i * Math.PI * 2 / 7 + hash(o.seed, 0), r = .27 + hash(o.seed, i + 1) * .12;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, y = 1.75 + hash(o.seed, i + 20) * .3;
    bar(k, g, bark, [0, .95, 0], [x, y, z], .035);
    oval(k, g, leaves[i % 3], x, y, z, .34 + hash(o.seed, i + 40) * .07, .44, .35);
    for (let j = 0; j < 2; j++) {
      const b = a + (j ? .8 : -.8);
      oval(k, g, C.yellow, x + Math.cos(b) * .3, y - .16 - j * .12, z + Math.sin(b) * .3, .045, .064, .045, { seg: 8 });
    }
  }
  oval(k, g, leaves[2], .03, 2.17, -.03, .36, .39, .35);
});
PROPS.road_barrier = prop([1.6, .5, 1.1], (k, g) => {
  const steel = material(k, '#7b8183', 'metal', .55, .65);
  for (const x of [-.59, .59]) for (const z of [-.21, .21]) bar(k, g, steel, [x, .02, z], [x, .83, 0], .025);
  for (const y of [.4, .79]) {
    k.box(1.6, .18, .07, C.white, g, 0, y, .015);
    for (let i = 0; i < 5; i++) k.box(.155, .17, .006, C.orange, g, -.66 + i * .32, y, .054, { rz: -.15 });
  }
  k.box(.17, .055, .13, C.black, g, .55, .915, 0);
  const p = dynamic(k, g, 'warning-lamp', .55, 1.005, 0), { m, source } = ownedGlow(k, g, '#ffb43e');
  k.cyl(.062, .07, .12, m, p, 0, 0, 0);
  g.userData.tick = t => { m.emissiveIntensity = source.emissiveIntensity * (Math.sin(t * Math.PI * 2) > 0 ? 1 : .06); };
});
PROPS.news_rack = prop([.5, .45, 1.2], (k, g, o) => {
  const paint = material(k, [C.red, C.blue, C.yellow, C.teal][Math.floor(hash(o.seed, 3) * 4)], 'paint', .4, .35);
  k.box(.42, .045, .38, paint, g, 0, .0225, 0);
  k.box(.13, .48, .16, paint, g, 0, .285, -.03);
  // Hollow cabinet: the stack is visible through the front glazing.
  k.box(.49, .68, .025, paint, g, 0, .86, -.2025);
  for (const x of [-.2325, .2325]) k.box(.025, .68, .43, paint, g, x, .86, 0);
  for (const y of [.535, 1.185]) k.box(.49, .03, .43, paint, g, 0, y, 0);
  k.box(.44, .15, .025, paint, g, 0, 1.11, .2);
  for (const x of [-.207, .207]) k.box(.025, .49, .025, paint, g, x, .79, .2);
  const paper = material(k, '#e4ddcb', 'paper', .95);
  for (let i = 0; i < 6; i++) k.box(.34, .019, .27, paper, g, 0, .57 + i * .024, .035);
  k.box(.31, .27, .008, paper, g, 0, .87, .19);
  labelLines(k, g, 0, .96, .197, .25, 7);
  k.plane(.39, .46, k.mat(C.glass, { ...glass, alpha: .2 }), g, 0, .8, .217, { cast: false });
  k.box(.16, .014, .008, C.black, g, .06, 1.115, .214);
  k.box(.07, .023, .02, C.metal, g, .17, .82, .215);
});
PROPS.manhole_steam = prop([.8, .8, 1.8], (k, g) => {
  const iron = material(k, '#515655', 'metal', .86, .65);
  k.cyl(.39, .39, .03, iron, g, 0, .015, 0, { seg: 24 });
  k.torus(.35, .008, C.black, g, 0, .032, 0, { rx: Math.PI / 2 });
  for (let i = -3; i <= 3; i++) { const w = 2 * Math.sqrt(.31 ** 2 - (i * .08) ** 2); k.box(w, .009, .018, C.dark, g, 0, .034, i * .08); }
  const vapor = material(k, '#eef3ef', 'plastic', 1, 0, { alpha: .25 });
  const puffs = Array.from({ length: 4 }, (_, i) => {
    const p = dynamic(k, g, `steam-${i}`);
    oval(k, p, vapor, 0, 0, 0, .16, .22, .16, { seg: 10, cast: false }); return p;
  });
  g.userData.tick = t => puffs.forEach((p, i) => {
    const u = ((t * .17 + i / 4) % 1 + 1) % 1;
    p.position.set(Math.sin(u * 5 + i) * .06, .24 + u * 1.32, Math.cos(u * 4 + i) * .06);
    // Expand, then shrink out at the top; opacity stays shared and immutable.
    p.scale.setScalar((.55 + u) * Math.min(1, (1 - u) * 6));
  });
});
PROPS.kick_scooter = prop([.45, 1.1, 1.15], (k, g, o) => {
  const paint = material(k, ['#b4d746', C.orange, C.white][Math.floor(hash(o.seed, 2) * 3)], 'paint', .35, .3);
  k.box(.19, .055, .72, paint, g, 0, .16, -.06, { r: .018 });
  k.box(.15, .008, .53, C.black, g, 0, .193, -.08);
  for (const z of [-.43, .43]) {
    k.cyl(.115, .115, .06, C.black, g, 0, .115, z, { rz: Math.PI / 2, seg: 16 });
    k.cyl(.055, .055, .065, C.metal, g, 0, .115, z, { rz: Math.PI / 2, seg: 12 });
  }
  bar(k, g, paint, [0, .12, .43], [0, 1.08, .31], .027);
  bar(k, g, C.dark, [-.21, 1.1, .31], [.21, 1.1, .31], .025);
  for (const x of [-.16, .16]) k.cyl(.03, .03, .1, C.black, g, x, 1.1, .31, { rz: Math.PI / 2 });
  k.disc(.023, lit(k, '#fff1cc'), g, 0, .99, .353);
  bar(k, g, C.dark, [-.06, .16, -.05], [-.18, .01, -.12], .012);
  k.tube([[.1, 1.08, .3], [.08, .8, .36], [.03, .33, .39]], .005, C.black, g, 0, 0, 0);
});
PROPS.fire_escape = prop([2.2, .9, 2.8], (k, g) => {
  const iron = material(k, '#283c35', 'metal', .65, .6);
  // The rear half is a landing; the front half is an open stairwell.
  for (const z of [.025, .43, .875]) k.box(2.2, .05, .05, iron, g, 0, .025, z);
  for (let i = 0; i < 22; i++) k.box(.035, .025, .4, iron, g, -1.05 + i * .1, .05, .23);
  for (const x of [-1.07, 1.07]) k.box(.05, .05, .85, iron, g, x, .025, .45);
  for (let i = 0; i < 12; i++) bar(k, g, iron, [-1.06 + i * .193, .06, .875], [-1.06 + i * .193, .96, .875], .013);
  bar(k, g, iron, [-1.08, .97, .875], [1.08, .97, .875], .022);
  for (const x of [-1.07, 1.07]) {
    bar(k, g, iron, [x, .97, .03], [x, .97, .875], .022);
    for (const z of [.04, .22, .4]) bar(k, g, iron, [x, .05, z], [x, .97, z], .014);
  }
  // Both stringers terminate at the next module's y=.05 platform plane.
  for (const z of [.48, .83]) bar(k, g, iron, [-.96, .07, z], [.96, 2.8, z], .025);
  for (let i = 0; i <= 14; i++) k.box(.16, .035, .35, iron, g, -.96 + i * 1.92 / 14, .07 + i * 2.73 / 14, .655);
  // Top landing shares its edge with the next identical module (spacing 2.8).
  k.box(.2, .035, .42, iron, g, .96, 2.8, .65);
  for (const x of [-1.04, 1.04]) k.box(.12, .16, .025, iron, g, x, .12, .0125);
});
PROPS.guitar_stand = prop([.5, .4, 1.1], (k, g) => {
  for (const x of [-.2, .2]) bar(k, g, C.dark, [x, .015, .14], [0, .65, -.14], .016);
  bar(k, g, C.dark, [0, .015, -.18], [0, .65, -.14], .016);
  const wood = material(k, '#be8442', 'wood', .43, 0, { clear: .3 });
  oval(k, g, wood, 0, .29, .015, .22, .23, .085);
  oval(k, g, wood, 0, .49, .005, .16, .17, .075);
  k.box(.055, .42, .045, C.darkWood, g, 0, .79, -.01);
  k.box(.085, .12, .05, wood, g, 0, 1.03, -.01, { rz: -.08 });
  k.disc(.057, C.black, g, 0, .45, .08);
  k.torus(.061, .005, C.cream, g, 0, .45, .081);
  k.box(.1, .025, .015, C.darkWood, g, 0, .24, .098);
  for (let i = 0; i < 6; i++) {
    bar(k, g, C.metal, [-.018 + i * .007, .25, .105], [-.018 + i * .007, 1.05, .023], .0015);
    k.ball(.012, C.metal, g, i % 2 ? .054 : -.054, .995 + Math.floor(i / 2) * .033, -.01, { seg: 8 });
  }
  for (let i = 0; i < 9; i++) k.box(.056, .002, .004, C.metal, g, 0, .61 + i * .04, .014, { r: 0 });
});
PROPS.pizza_stack = prop([.5, .5, .35], (k, g, o) => {
  const cardboard = material(k, '#c5a178', 'paper', .9), cheese = material(k, '#edc15b', 'plastic', .75);
  for (let i = 0; i < 4; i++) {
    const p = k.group(g, 0, i * .048, 0, (hash(o.seed, i) - .5) * .055);
    k.box(.46, .044, .46, cardboard, p, 0, .022, 0);
    k.box(.12, .025, .003, i % 2 ? C.red : brand(o), p, .08, .025, .232);
  }
  k.box(.46, .025, .46, cardboard, g, 0, .2045, 0);
  const halfPizza = radius => Array.from({ length: 13 }, (_, i) => [Math.cos(i * Math.PI / 12) * radius, -Math.sin(i * Math.PI / 12) * radius]);
  k.extrude(halfPizza(.198), .018, C.darkWood, g, 0, .217, 0, { rx: -Math.PI / 2, bevel: .003 });
  k.extrude(halfPizza(.18), .009, cheese, g, 0, .236, 0, { rx: -Math.PI / 2, bevel: .002 });
  for (let i = 0; i < 5; i++) { const a = (i + .5) * Math.PI / 5; k.cyl(.025, .025, .005, C.red, g, Math.cos(a) * .12, .248, Math.sin(a) * .12, { seg: 8 }); }
  // Short opening angle keeps this half-open lid within the stacked footprint.
  const lid = k.group(g, 0, .22, -.225); lid.rotation.x = -.23;
  k.box(.46, .012, .46, cardboard, lid, 0, 0, .225);
  k.box(.2, .003, .13, brand(o), lid, 0, .008, .22);
});
PROPS.string_lights = prop([3, .12, .5], (k, g, o) => {
  const wire = material(k, '#43463f', 'rubber', .8), warm = lit(k, '#ffe1a3'), accent = lit(k, brand(o));
  // Two parabolic swags join at the central wall hook.
  const sag = u => -.008 - .3 * 4 * u * (1 - u);
  for (let half = 0; half < 2; half++) {
    const x0 = -1.49 + half * 1.49;
    k.tube(Array.from({ length: 5 }, (_, i) => [x0 + i * 1.49 / 4, sag(i / 4), .025]), .007, wire, g, 0, 0, 0);
    for (let i = 0; i < 6; i++) {
      const u = (i + .5) / 6, x = x0 + u * 1.49, y = sag(u);
      bar(k, g, wire, [x, y, .025], [x, y - .06, .025], .005);
      k.cyl(.018, .018, .028, C.dark, g, x, y - .068, .025);
      oval(k, g, i === 2 ? accent : warm, x, y - .108, .05, .027, .038, .027, { seg: 10 });
    }
  }
});
PROPS.bulletin_board = prop([1.6, .4, 2], (k, g, o) => {
  const timber = material(k, '#947047', 'wood', .75), cork = material(k, '#b6945d', 'wood', .98);
  for (const x of [-.66, .66]) k.box(.09, 1.94, .1, timber, g, x, .97, -.05);
  k.box(1.46, 1.15, .08, timber, g, 0, 1.23, -.04);
  k.box(1.34, 1.03, .018, cork, g, 0, 1.23, .012);
  for (const z of [-.095, .095]) k.box(1.6, .045, .22, timber, g, 0, 1.94, z, { rx: z > 0 ? .2 : -.2 });
  const papers = [C.cream, '#d1e1da', '#d9b3ab', '#b8cce3'].map(c => material(k, c, 'paper', .9));
  for (let i = 0; i < 12; i++) {
    const p = k.group(g, -.48 + i % 4 * .32, 1.57 - Math.floor(i / 4) * .3, .03 + i % 2 * .006);
    p.rotation.z = (hash(o.seed, i) - .5) * .17;
    k.box(.22 + hash(o.seed, i + 20) * .05, .24, .004, papers[i % 4], p, 0, 0, 0);
    labelLines(k, p, 0, .065, .004, .16, 5);
    k.ball(.009, C.red, p, 0, .1, .008, { seg: 8 });
  }
  for (const x of [-.4, .12]) {
    k.box(.31, .12, .005, papers[0], g, x, .75, .05);
    for (let j = 0; j < 7; j++) k.box(.031, .1, .005, papers[0], g, x - .13 + j * .043, .65, .05);
  }
});
PROPS.info_totem = prop([.7, .3, 2.4], (k, g, o) => {
  const steel = material(k, '#69767a', 'metal', .4, .75);
  k.box(.7, .07, .3, steel, g, 0, .035, 0);
  k.box(.57, 2.32, .2, steel, g, 0, 1.23, 0, { r: .02 });
  k.plane(.48, 1.47, lit(k, '#dfebe2', .12), g, 0, 1.57, .102);
  k.box(.47, .11, .008, brand(o), g, 0, 2.22, .108);
  for (let i = 0; i < 5; i++) {
    const y = 2.02 - i * .24;
    labelLines(k, g, -.045, y, .11, .23, 2);
    k.extrude([[0, -.035], [.05, 0], [0, .035], [0, .012], [-.045, .012], [-.045, -.012], [0, -.012]], .004, C.dark, g, .17, y, .109);
  }
});
PROPS.flag_row = prop([2.4, .5, 4.2], (k, g, o) => {
  k.box(2.4, .14, .5, material(k, '#969b98', 'stone', .92), g, 0, .07, 0);
  const steel = material(k, '#c9d0d0', 'metal', .27, .9), flags = [];
  for (let i = 0; i < 3; i++) {
    const x = -.99 + i * .76;
    k.cyl(.025, .04, 4, steel, g, x, 2.14, 0);
    k.ball(.045, steel, g, x, 4.15, 0);
    const p = dynamic(k, g, `flag-${i}`, x, 3.98, 0);
    k.box(.6, .4, .012, material(k, [brand(o), C.white, C.blue][i], 'fabric', .93), p, .31, -.2, 0);
    flags.push(p);
    bar(k, g, C.cream, [x + .035, .45, 0], [x + .035, 4.05, 0], .003);
  }
  g.userData.tick = t => flags.forEach((p, i) => { p.rotation.y = Math.sin(t * 1.3 + i) * .17; p.scale.x = .95 + Math.sin(t * 1.7 + i) * .05; });
});
PROPS.standing_banner = prop([.8, .4, 2], (k, g, o) => {
  k.box(.8, .075, .22, C.metal, g, 0, .0375, .04, { r: .018 });
  for (const x of [-.27, .27]) k.box(.045, .025, .4, C.dark, g, x, .0125, 0);
  bar(k, g, C.metal, [0, .07, -.08], [0, 1.97, -.025], .012);
  k.box(.76, 1.84, .012, material(k, brand(o), 'fabric', .85), g, 0, 1.025, .025);
  for (const y of [.1, 1.96]) k.box(.79, .035, .045, C.metal, g, 0, y, .025);
  if (o.art) face(k, g, o, 'art', .74, 1.82, 0, 1.025, .033);
  else {
    k.box(.58, .38, .005, C.cream, g, 0, 1.54, .036);
    for (let i = 0; i < 3; i++) k.box(.15, .15, .005, [C.blue, C.gold, C.white][i], g, -.21 + i * .21, 1.16, .036);
    labelLines(k, g, 0, .9, .037, .55, 10, C.white);
  }
});
PROPS.display_counter = prop([1.6, .6, 1], (k, g) => {
  const alu = material(k, '#b3c0c6', 'metal', .28, .8), pane = k.mat(C.glass, { ...glass, alpha: .18, metal: .12 });
  k.box(1.6, .35, .6, C.white, g, 0, .175, 0);
  for (const x of [-.77, .77]) for (const z of [-.27, .27]) k.box(.035, .53, .035, alu, g, x, .615, z);
  for (const y of [.37, .61, .87]) {
    k.box(1.55, .018, .55, y === .37 ? alu : pane, g, 0, y, 0, { cast: y === .37 });
    for (const z of [-.28, .28]) k.box(1.6, .025, .025, alu, g, 0, y, z);
  }
  k.box(1.51, .47, .008, pane, g, 0, .62, .286, { cast: false });
  for (const x of [-.78, .78]) k.box(.008, .47, .54, pane, g, x, .62, 0, { cast: false });
  for (let i = 0; i < 6; i++) {
    const x = -.62 + i * .245;
    k.box(.12, .025, .21, C.black, g, x, .635, .02);
    k.box(.1, .003, .17, i % 2 ? '#477a8b' : '#849ca0', g, x, .65, .02);
  }
  for (const x of [-.49, -.12]) {
    k.box(.3, .035, .17, '#396e53', g, x, .4, .02);
    for (const dx of [-.075, .075]) { k.cyl(.055, .055, .025, C.black, g, x + dx, .43, .02, { seg: 12 }); k.cyl(.017, .017, .028, alu, g, x + dx, .433, .02); }
  }
  for (let i = 0; i < 3; i++) carton(k, g, .3 + i * .15, .38, -.01, .13, .12, .19);
  for (const x of [-.48, .05, .53]) { k.box(.21, .075, .006, [C.yellow, C.red, C.blue][Math.round((x + .48) / .5)], g, x, .23, .304); labelLines(k, g, x, .25, .309, .14, 2); }
  k.box(.19, .035, .19, C.dark, g, -.55, .9, .04);
  k.box(.13, .006, .04, '#a2b792', g, -.55, .921, -.015);
  for (let i = 0; i < 12; i++) k.box(.026, .008, .022, C.white, g, -.6 + i % 3 * .047, .925, .027 + Math.floor(i / 3) * .027);
  k.box(.14, .06, .2, C.black, g, .03, .915, .02);
  k.box(.1, .005, .065, lit(k, '#91c5b7', .08), g, .03, .949, -.025);
  k.box(.35, .115, .045, C.black, g, .53, .935, -.1);
  for (let i = 0; i < 5; i++) labelLines(k, g, .41 + i * .06, .97, -.075, .035, 4, lit(k, '#ff6444'));
});
PROPS.hand_truck = prop([.6, .7, 1.3], (k, g) => {
  const steel = material(k, '#6f8586', 'metal', .47, .65);
  for (const x of [-.245, .245]) {
    k.cyl(.13, .13, .085, C.black, g, x, .13, -.22, { rz: Math.PI / 2 });
    k.cyl(.055, .055, .09, C.metal, g, x, .13, -.22, { rz: Math.PI / 2 });
  }
  k.box(.5, .035, .57, steel, g, 0, .08, .025);
  for (const x of [-.21, .21]) bar(k, g, steel, [x, .12, -.24], [x, 1.26, -.29], .023);
  bar(k, g, C.black, [-.21, 1.26, -.29], [.21, 1.26, -.29], .027);
  for (const y of [.4, .8]) k.box(.43, .04, .035, steel, g, 0, y, -.26);
  for (let i = 0; i < 3; i++) carton(k, g, i === 1 ? .025 : 0, .1 + i * .3, .035, .43 - i * .025, .285, .43 - i * .035);
  const strap = material(k, '#478b52', 'fabric', .87);
  k.box(.05, .91, .008, strap, g, .055, .55, .258);
  k.box(.05, .012, .46, strap, g, .055, 1.009, .03);
  k.box(.05, .91, .008, strap, g, .055, .55, -.204);
});
PROPS.led_ticker = prop([2.4, .12, .35], (k, g) => {
  k.box(2.4, .35, .106, material(k, '#24292b', 'metal', .5, .55), g, 0, .175, .053);
  k.box(2.29, .25, .006, C.black, g, 0, .175, .109);
  const bands = Array.from({ length: 3 }, (_, i) => {
    const p = dynamic(k, g, `pixels-${i}`), red = ownedGlow(k, g, '#f84c36'), green = ownedGlow(k, g, '#52da77');
    for (let col = 0; col < 14; col++) for (let row = 0; row < 5; row++) {
      // Broken strokes suggest abstract glyphs, never literal brand lettering.
      if ((col + row * 2) % 5 === 3 || (col % 5 === 4)) continue;
      k.box(.026, .026, .005, col > 10 ? green.m : red.m, p, -1.09 + (i * 14 + col) * .053, .08 + row * .047, .115, { r: .002 });
    }
    return [red, green];
  });
  g.userData.tick = t => bands.forEach((pair, i) => pair.forEach(({ m, source }) => { m.emissiveIntensity = source.emissiveIntensity * (Math.floor(t * 2.5) % 3 === i ? 1 : .16); }));
});
PROPS.parts_shelf = prop([1.4, .45, 1.9], (k, g) => {
  const steel = material(k, '#7d8b8e', 'metal', .48, .7);
  feet(k, g, 1.32, .37, 1.9, steel, 0, .04);
  for (const y of [.08, .44, .8, 1.16, 1.52]) k.box(1.38, .035, .44, steel, g, 0, y, 0);
  const bins = [C.blue, C.red, C.teal].map(c => material(k, c, 'plastic', .6));
  for (let row = 0; row < 2; row++) for (let i = 0; i < 6; i++) {
    const x = -.56 + i * .224, y = .12 + row * .36;
    k.box(.2, .25, .32, bins[(i + row) % 3], g, x, y + .125, 0);
    k.box(.11, .045, .007, C.white, g, x, y + .16, .164);
    k.box(.06, .017, .02, C.dark, g, x, y + .08, .171);
  }
  for (const x of [-.44, 0, .44]) {
    k.cyl(.115, .115, .2, C.black, g, x, .93, 0, { rx: Math.PI / 2, seg: 16 });
    for (const z of [-.115, .115]) k.cyl(.135, .135, .025, C.wood, g, x, .93, z, { rx: Math.PI / 2, seg: 16 });
    k.disc(.035, C.dark, g, x, .93, .129);
  }
  for (const x of [-.42, 0, .42]) carton(k, g, x, 1.18, 0, .36, .28, .34);
  const foil = material(k, '#78848a', 'metal', .36, .6);
  for (let i = 0; i < 6; i++) { k.box(.42, .025, .3, foil, g, -.33, 1.55 + i * .031, 0); k.box(.18, .003, .11, C.white, g, -.33, 1.565 + i * .031, 0); }
  carton(k, g, .34, 1.54, 0, .44, .26, .34);
});
PROPS.plastic_stools = prop([1.6, 1.6, .8], (k, g) => {
  const steel = material(k, '#999e9d', 'metal', .4, .7);
  k.box(.75, .04, .75, material(k, '#c8ba99', 'plastic', .6), g, 0, .6, 0, { r: .018 });
  for (const x of [-.25, .25]) for (const s of [-1, 1]) bar(k, g, steel, [x, .015, s * .27], [x, .58, -s * .27], .018);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2, p = k.group(g, Math.cos(a) * .6, 0, Math.sin(a) * .6);
    const plastic = material(k, i % 2 ? C.blue : C.red, 'plastic', .38);
    feet(k, p, .22, .22, .32, plastic, 0, .045);
    k.box(.32, .055, .32, plastic, p, 0, .345, 0, { r: .025 });
    k.box(.1, .004, .025, C.dark, p, 0, .374, 0);
  }
  const ceramic = material(k, '#eae5d8', 'paint', .25, 0, { clear: .5 });
  for (const x of [-.2, .2]) {
    k.lathe([[.05, 0], [.065, .01], [.105, .085], [.1, .09], [.087, .065]], ceramic, g, x, .62, .11, { seg: 14 });
    k.cyl(.087, .087, .008, '#bb8d45', g, x, .69, .11, { seg: 14 });
    for (let j = 0; j < 3; j++) k.tube([[x - .05, .699, .08 + j * .02], [x, .7, .095 + j * .02], [x + .05, .699, .08 + j * .02]], .004, C.cream, g, 0, 0, 0);
    bar(k, g, C.darkWood, [x - .07, .72, .06], [x + .09, .72, .18], .004);
  }
  for (const x of [-.24, -.08, .23]) {
    const beer = x !== .23, bottle = material(k, beer ? '#416942' : '#483322', 'plastic', .2, 0, { clear: .6 });
    k.cyl(.025, .03, .1, bottle, g, x, .67, -.2);
    k.cyl(.012, .023, .055, bottle, g, x, .7475, -.2);
    k.cyl(.013, .013, .01, beer ? C.gold : C.red, g, x, .78, -.2);
    k.box(.035, .04, .003, C.cream, g, x, .67, -.17);
  }
  k.cyl(.045, .045, .1, C.white, g, .08, .67, -.16);
  k.box(.035, .045, .008, material(k, C.white, 'paper', .95), g, .08, .735, -.16, { rz: .15 });
});
PROPS.shoe_rack = prop([.8, .3, .9], (k, g) => {
  const steel = material(k, '#929d9d', 'metal', .5, .65);
  feet(k, g, .57, .24, .72, steel, 0, .025);
  for (const y of [.06, .29, .52]) for (const z of [-.1, -.03, .04, .11]) k.box(.62, .015, .025, steel, g, -.025, y, z);
  for (const x of [-.2, -.08, .08, .2]) {
    oval(k, g, x < 0 ? C.blue : C.red, x, .085, .005, .045, .018, .11, { seg: 8 });
    k.torus(.034, .01, x < 0 ? C.blue : C.red, g, x, .11, .045, { arc: Math.PI });
    oval(k, g, C.white, x, .32, 0, .048, .025, .11, { seg: 8 });
    oval(k, g, C.dark, x, .345, -.015, .043, .04, .08, { seg: 8 });
    for (let j = 0; j < 3; j++) k.box(.055, .004, .006, C.white, g, x, .38, -.02 + j * .019);
  }
  for (const x of [-.15, .04]) {
    oval(k, g, '#527053', x, .56, .015, .065, .035, .11);
    k.cyl(.05, .06, .21, '#527053', g, x, .665, -.03);
    k.cyl(.039, .039, .008, C.black, g, x, .773, -.03);
  }
  const umbrella = k.group(g, .345, .025, 0); umbrella.rotation.z = -.035;
  bar(k, umbrella, C.metal, [0, 0, 0], [0, .76, 0], .008);
  k.cone(.036, .56, material(k, '#514b68', 'fabric', .9), umbrella, 0, .34, 0, { seg: 8 });
  k.torus(.035, .01, C.dark, umbrella, -.035, .8, 0, { arc: Math.PI * 1.5, rz: -Math.PI / 2 });
});
PROPS.chat_sign = prop([1.1, .35, 1.6], (k, g, o) => {
  k.box(.63, .07, .35, C.dark, g, 0, .035, 0);
  k.box(.055, .47, .055, C.metal, g, 0, .28, 0);
  const glow = lit(k, brand(o));
  k.box(1.08, 1.03, .15, glow, g, 0, 1.07, 0, { r: .12 });
  k.box(.96, .91, .016, C.cream, g, 0, 1.07, .082, { r: .1 });
  k.extrude([[-.35, .66], [-.39, .4], [-.08, .62]], .13, glow, g, 0, 0, -.065, { bevel: .008 });
  const dots = [-.26, 0, .26].map((x, i) => { const p = dynamic(k, g, `chat-dot-${i}`, x, 1.06, .105); k.disc(.064, C.dark, p, 0, 0, 0); return p; });
  g.userData.tick = t => dots.forEach((p, i) => { p.position.y = 1.06 + Math.max(0, Math.sin(t * 3.2 - i * .8)) * .055; });
});
PROPS.rubber_duck = prop([.8, .9, .9], (k, g) => {
  const rubber = material(k, '#f4c934', 'plastic', .32, 0, { clear: .5 });
  oval(k, g, rubber, 0, .29, -.07, .35, .29, .34);
  oval(k, g, rubber, 0, .65, .06, .23, .22, .22);
  for (const x of [-.28, .28]) oval(k, g, rubber, x, .32, -.04, .1, .13, .22);
  oval(k, g, C.orange, 0, .59, .28, .15, .055, .12);
  for (const x of [-.105, .105]) { oval(k, g, C.black, x, .7, .25, .022, .03, .012); k.ball(.006, C.white, g, x - .006, .71, .262, { seg: 8 }); }
  k.torus(.24, .027, C.black, g, 0, .63, .05, { arc: Math.PI });
  for (const x of [-.235, .235]) oval(k, g, C.dark, x, .64, .05, .052, .092, .085);
  k.box(.48, .04, .2, C.dark, g, 0, .02, .34, { r: .015 });
  for (let row = 0; row < 3; row++) for (let col = 0; col < 8; col++) k.box(.043, .012, .04, C.white, g, -.196 + col * .056, .046, .28 + row * .056);
});
PROPS.plush_bear = prop([.9, .8, 1.1], (k, g, o) => {
  const fur = material(k, '#ae835d', 'fabric', .98), light = material(k, '#dcc4a0', 'fabric', .98), scarf = material(k, brand(o), 'fabric', .92);
  oval(k, g, fur, 0, .4, -.04, .31, .35, .25);
  for (const x of [-.24, .24]) { oval(k, g, fur, x, .13, .14, .17, .13, .22); oval(k, g, light, x, .14, .325, .11, .085, .03); }
  oval(k, g, fur, 0, .81, -.025, .3, .26, .24);
  for (const x of [-.235, .235]) { oval(k, g, fur, x, 1, -.025, .105, .1, .07); oval(k, g, light, x, 1, .035, .062, .06, .02); }
  oval(k, g, light, 0, .75, .198, .14, .085, .07);
  oval(k, g, C.black, 0, .79, .263, .04, .025, .018);
  for (const x of [-.105, .105]) k.ball(.018, C.black, g, x, .86, .192, { seg: 10 });
  k.torus(.19, .045, scarf, g, 0, .61, -.015, { rx: Math.PI / 2 });
  k.box(.09, .23, .035, scarf, g, -.13, .49, .22, { rz: -.18 });
  // Beveled heart outline with two rounded fabric lobes.
  k.extrude([[0, -.2], [.2, -.01], [.2, .1], [.11, .17], [0, .09], [-.11, .17], [-.2, .1], [-.2, -.01]], .09, scarf, g, 0, .36, .22, { bevel: .025 });
  for (const x of [-.11, .11]) oval(k, g, scarf, x, .45, .27, .115, .11, .08);
  for (const x of [-.28, .28]) oval(k, g, fur, x, .42, .18, .12, .19, .12);
});
PROPS.film_set = prop([1.9, 1.3, 2], (k, g) => {
  const steel = material(k, '#5d6870', 'metal', .45, .7);
  for (const x of [-.8, .8]) {
    bar(k, g, steel, [x, .025, -.48], [x, 1.97, -.48], .019);
    k.box(.27, .035, .25, C.dark, g, x, .0175, -.48);
  }
  bar(k, g, steel, [-.85, 1.97, -.48], [.85, 1.97, -.48], .025);
  k.box(1.52, 1.72, .015, material(k, '#32994f', 'fabric', .95), g, 0, 1.07, -.48);
  const camera = k.group(g, -.15, 0, .34);
  for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; bar(k, camera, steel, [Math.cos(a) * .23, .015, Math.sin(a) * .23], [0, .93, 0], .018); }
  k.box(.28, .19, .29, C.black, camera, 0, 1.05, 0);
  k.cyl(.07, .085, .15, C.dark, camera, 0, 1.06, -.2, { rx: Math.PI / 2 });
  k.disc(.06, k.mat('#456477', { rough: .08, metal: .4, clear: .6 }), camera, 0, 1.06, -.278, { ry: Math.PI });
  k.box(.1, .075, .1, C.black, camera, 0, 1.18, .04);
  bar(k, camera, C.dark, [.09, .97, .08], [.22, .92, .22], .012);
  const light = k.group(g, .65, 0, .16);
  for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; bar(k, light, steel, [Math.cos(a) * .22, .015, Math.sin(a) * .22], [0, 1.3, 0], .013); }
  k.box(.45, .39, .15, C.black, light, 0, 1.49, 0, { r: .02 });
  k.plane(.41, .35, lit(k, '#fff0d7'), light, 0, 1.49, -.077, { ry: Math.PI });
  const slate = k.group(g, -.64, .025, .27); slate.rotation.x = -Math.PI / 2;
  k.box(.35, .24, .025, C.black, slate, 0, 0, 0);
  for (let i = 0; i < 6; i++) k.box(.05, .035, .005, i % 2 ? C.black : C.white, slate, -.145 + i * .058, .091, .017, { rz: -.15 });
  labelLines(k, slate, 0, .03, .016, .25, 5, C.white);
});
// Public metadata helps galleries and diagnostics without changing the interface.
const roofNames = new Set(['ac_unit', 'water_tank', 'water_tower_wood', 'roof_vent', 'roof_hvac', 'solar_array', 'sat_dish', 'antenna_mast', 'roof_garden', 'helipad', 'laundry_line']);
const streetNames = new Set(['street_lamp', 'traffic_light', 'bus_stop', 'billboard', 'billboard_roof', 'neon_sign', 'shop_awning', 'food_cart', 'food_truck', 'kiosk', 'bike_rack', 'planter_box', 'bollard', 'trash_public', 'parking_meter', 'manhole', 'utility_pole', 'power_box', 'scaffold', 'crane_tower', 'bench', 'fire_hydrant', 'traffic_cone', 'mailbox', 'parcels']);
const plantNames = new Set(['plant_small', 'plant_tall', 'money_tree', 'tree_round', 'tree_palm', 'tree_street', 'tree_cypress', 'bush', 'atrium_tree', 'flower_bed']);
for (const name of ['basketball_hoop', 'picket_fence', 'road_barrier', 'news_rack', 'manhole_steam', 'kick_scooter', 'fire_escape', 'bulletin_board', 'info_totem', 'flag_row', 'hand_truck', 'led_ticker', 'plastic_stools']) streetNames.add(name);
plantNames.add('lemon_tree');
for (const [name, spec] of Object.entries(PROPS)) {
  spec.category = roofNames.has(name) ? 'Rooftop' : plantNames.has(name) ? 'Botanical' : streetNames.has(name) ? 'Street' : /^(car|robotaxi|van_|bus_city|scooter|bicycle|e_bike|shared_bike)/.test(name) ? 'Vehicles' : 'Office';
}
// Batch *inside* movable assemblies once, preserving their group pivots. Cached
// geometry remains kit-owned; unlike bake(), no per-instance geometry is leaked.
function compactAssembly(k, root) {
  if (root.name === 'leds' || root.children.length < 2) return;
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert(), buckets = new Map(), meshes = [];
  root.traverse(n => {
    if (!n.isMesh) return;
    for (let p = n.parent; p && p !== root; p = p.parent) if (p.userData.dynamic) return;
    const key = `${n.material.uuid}|${n.castShadow}|${n.receiveShadow}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ n, matrix: new k.THREE.Matrix4().multiplyMatrices(inv, n.matrixWorld) }); meshes.push(n);
  });
  if (meshes.length <= buckets.size) return;
  for (const parts of buckets.values()) {
    const key = 'prop-assembly|' + parts.map(({ n, matrix }) => n.geometry.uuid + ':' + matrix.elements.map(v => Math.round(v * 1e6) / 1e6).join(',')).join('|');
    const geo = k.geo(key, () => {
      const copies = parts.map(({ n, matrix }) => { const c = n.geometry.index ? n.geometry.toNonIndexed() : n.geometry.clone(); c.applyMatrix4(matrix); return c; });
      const result = mergeGeometries(copies, false); copies.forEach(c => c.dispose()); return result;
    });
    const { n } = parts[0]; k.put(geo, n.material, root, 0, 0, 0, { cast: n.castShadow, receive: n.receiveShadow });
  }
  meshes.forEach(n => n.removeFromParent());
}
for (const spec of Object.values(PROPS)) {
  const build = spec.build;
  spec.build = (k, o = {}) => {
    const g = build(k, o), assemblies = [];
    g.traverse(n => { if (n.isGroup && n.userData.dynamic) assemblies.push(n); });
    for (const p of assemblies.reverse()) compactAssembly(k, p);
    return g;
  };
}

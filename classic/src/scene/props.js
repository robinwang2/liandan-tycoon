// Tiny, texture-free office stories. Coordinates are metres; the front is +Z.
// Shared shapes and materials belong to the caller's kit, never to a prop.
const C = {
  wood: '#c99a6b', darkWood: '#8a623f', paleWood: '#e6c9a0',
  metal: '#aeb6c2', dark: '#4a5160', white: '#f7f5ef', black: '#22252d',
  leaf: '#5fbf6a', leafDark: '#3f9a55', pot: '#d9805a', red: '#e5484d',
  gold: '#e2b84a', teal: '#2ec4a6', blue: '#4aa8ff', purple: '#7b5cff',
  orange: '#ff9736', yellow: '#ffd23f', glass: '#bfe3f2', cream: '#ffe6a5',
};
const colors = [C.blue, C.red, C.gold, C.teal, C.purple];
const soft = { r: 0.06 };
const gold = { metal: 0.55, rough: 0.32 };
const glass = { alpha: 0.35, rough: 0.15, cast: false };
const lit = (k, color, strength = 0.6) => k.mat(color, { glow: color, glowK: strength });
const brand = (o, fallback = C.teal) => o.brand || fallback;

function prop(size, draw) {
  return { size, build(k, o = {}) { const g = k.group(); draw(k, g, o); return g; } };
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
  k.cyl(0.065 * s, 0.052 * s, 0.13 * s, color, g, x, y + 0.065 * s, z);
  k.cyl(0.051 * s, 0.051 * s, 0.012 * s, C.darkWood, g, x, y + 0.132 * s, z);
  k.torus(0.046 * s, 0.018 * s, color, g, x + 0.075 * s, y + 0.075 * s, z);
}
function pot(k, g, radius, height) {
  k.cyl(radius, radius * 0.72, height, C.pot, g, 0, height / 2, 0);
  k.cyl(radius * 1.05, radius * 1.05, 0.07, C.pot, g, 0, height - 0.035, 0);
  k.cyl(radius * 0.85, radius * 0.85, 0.025, C.darkWood, g, 0, height, 0);
}
function trophy(k, g, x, y, z, s = 1) {
  const p = k.group(g, x, y, z); p.scale.setScalar(s);
  k.box(0.24, 0.07, 0.2, C.darkWood, p, 0, 0.035, 0, { r: 0.02 });
  k.cyl(0.035, 0.07, 0.14, C.gold, p, 0, 0.14, 0, gold);
  k.cyl(0.13, 0.055, 0.18, C.gold, p, 0, 0.28, 0, gold);
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
    const arm = k.group(g, 0.142, 0.29, 0.015);
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
    for (let i = 0; i < 3; i++) steam.push(k.ball(0.04, C.white, g, 0, 0.78, -0.07, { alpha: 0.5, cast: false }));
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
    const fish = k.group(g, 0, 1.01, 0);
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

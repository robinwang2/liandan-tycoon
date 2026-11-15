import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makeKit } from './kit.js';
import { PROPS } from './props.js';

const canvas = document.querySelector('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#edf1ed');
const camera = new THREE.OrthographicCamera(-30, 30, 24, -24, 0.1, 200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minZoom = 0.55;
controls.maxZoom = 35;
controls.maxPolarAngle = Math.PI / 2 - 0.04;
const k = makeKit();
const ambient = new THREE.HemisphereLight('#e9f5ff', '#a9b394', 2.4);
scene.add(ambient);
const sun = new THREE.DirectionalLight('#fff0d8', 3.2);
sun.position.set(-18, 33, 19);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 95 });
sun.shadow.bias = -0.00015;
sun.shadow.normalBias = 0.035;
sun.shadow.radius = 3;
scene.add(sun);

const entries = Object.entries(PROPS);
const rows = Math.ceil(entries.length / 8);
const spacingX = 5.2, spacingZ = 5.5;
const floor = k.box(8 * spacingX + 2.5, 0.18, rows * spacingZ + 2.5, '#dce5da', scene, 0, -0.11, 0, { r: 0.08 });
floor.castShadow = false;
const animated = [], items = [], emissive = new Map(), labelTextures = [], labelMaterials = [];
const selector = document.querySelector('#prop');
const detail = document.querySelector('#detail');
let selected = -1, night = false;

function label(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffffed'; ctx.beginPath(); ctx.roundRect(4, 10, 504, 76, 24); ctx.fill();
  ctx.fillStyle = '#314b42'; ctx.font = '600 30px ui-monospace, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 49);
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, depthWrite: false, toneMapped: false });
  const sprite = new THREE.Sprite(material); sprite.scale.set(2.65, 0.497, 1);
  labelTextures.push(texture); labelMaterials.push(material); return sprite;
}

// Kept on the page for review, including the centred wall-mount exception.
const report = [];
for (let i = 0; i < entries.length; i++) {
  const [key, spec] = entries[i];
  const x = (i % 8 - 3.5) * spacingX, z = (Math.floor(i / 8) - (rows - 1) / 2) * spacingZ;
  const group = spec.build(k, { brand: '#2aaf9b' });
  group.name = key;
  group.userData.tick?.(0, 0);
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group, true);
  const [w, d, h] = spec.size;
  const epsilon = 0.006, minY = key === 'scroll' ? -h / 2 : 0, maxY = key === 'scroll' ? h / 2 : h;
  const fits = bounds.min.x >= -w / 2 - epsilon && bounds.max.x <= w / 2 + epsilon &&
    bounds.min.z >= -d / 2 - epsilon && bounds.max.z <= d / 2 + epsilon &&
    bounds.min.y >= minY - epsilon && bounds.max.y <= maxY + epsilon;
  let meshes = 0;
  group.traverse(node => { if (node.isMesh) { meshes++; if (node.material.emissive?.getHex()) emissive.set(node.material, node.material.emissiveIntensity); } });
  report.push({ key, meshes, fits, size: spec.size, min: bounds.min.toArray(), max: bounds.max.toArray() });
  group.position.set(x, key === 'scroll' ? 1.2 : 0, z);
  scene.add(group);
  if (group.userData.tick) animated.push(group);
  const tile = k.box(4.7, 0.012, 4.75, (Math.floor(i / 8) + i % 8) % 2 ? '#e8ede3' : '#eef0e7', scene, x, -0.009, z, { r: 0.006, cast: false });
  const tag = label(key); tag.position.set(x, 0.27, z + 2.08); scene.add(tag);
  // Wall-mounted scroll gets a neutral presentation easel only in the gallery.
  let stand;
  if (key === 'scroll') {
    stand = k.group(scene, x, 0, z - 0.11);
    k.box(1.4, 0.09, 0.55, '#b9c9bd', stand, 0, 0.045, 0, softOptions());
    k.box(0.08, 1.16, 0.08, '#b9c9bd', stand, 0, 0.65, -0.03);
    k.box(1.35, 0.78, 0.08, '#d3dfd2', stand, 0, 1.2, 0);
  }
  const option = document.createElement('option'); option.value = key; option.textContent = `${String(i + 1).padStart(2, '0')} · ${key}`; selector.append(option);
  items.push({ group, tile, tag, stand, x, z, key, spec, meshes, fits });
}
function softOptions() { return { r: 0.03 }; }

function updateDetail() {
  if (selected < 0) {
    const issues = report.filter(r => !r.fits).length;
    detail.innerHTML = `<strong>51 props. Eight columns. One little world.</strong><br>${issues ? `${issues} bounds issue(s)` : 'All footprints checked'} · ${animated.length} animated props · choose a miniature to look closer`;
  } else {
    const item = items[selected];
    detail.innerHTML = `<strong>${item.key}</strong><br>${item.spec.size.join(' × ')} m (width × depth × height) · ${item.meshes} meshes · ${item.fits ? 'within footprint' : 'check footprint'}${item.group.userData.tick ? ' · animated' : ''}${item.key === 'scroll' ? ' · centred wall mount; display stand excluded' : ''}`;
  }
}
function focus(index) {
  selected = index;
  for (let i = 0; i < items.length; i++) {
    const item = items[i], visible = index < 0 || i === index;
    item.group.visible = visible; item.tile.visible = visible; item.tag.visible = index < 0;
    if (item.stand) item.stand.visible = visible;
  }
  if (index < 0) {
    controls.target.set(0, 0.5, 0);
    camera.position.set(32, 42, 48);
    camera.zoom = 1;
    selector.value = '';
  } else {
    const item = items[index], height = item.key === 'scroll' ? 1.6 : item.spec.size[2];
    controls.target.set(item.x, height * 0.45, item.z);
    camera.position.copy(controls.target).add(new THREE.Vector3(7, 8, 11));
    camera.zoom = Math.min(30, 40 / Math.max(height + 0.65, item.spec.size[0] * 1.25, item.spec.size[1] * 1.4, 1.4));
    selector.value = item.key;
  }
  camera.updateProjectionMatrix(); controls.update(); updateDetail();
}

function setNight(value) {
  night = value; document.body.classList.toggle('night', night);
  scene.background.set(night ? '#162b37' : '#edf1ed');
  ambient.intensity = night ? 0.32 : 2.4;
  sun.intensity = night ? 0.5 : 3.2;
  sun.color.set(night ? '#a4beff' : '#fff0d8');
  renderer.toneMappingExposure = night ? 1.35 : 1.18;
  for (const [material, initial] of emissive) material.emissiveIntensity = night ? initial * 3.5 : initial;
  const button = document.querySelector('#day-night');
  button.textContent = night ? '☀ Day' : '☾ Night'; button.setAttribute('aria-pressed', String(night));
}
document.querySelector('#day-night').addEventListener('click', () => setNight(!night));
document.querySelector('#overview').addEventListener('click', () => focus(-1));
selector.addEventListener('change', () => focus(entries.findIndex(([key]) => key === selector.value)));
const step = delta => focus((selected + delta + items.length) % items.length);
document.querySelector('#previous').addEventListener('click', () => step(-1));
document.querySelector('#next').addEventListener('click', () => step(1));
window.addEventListener('keydown', e => {
  if (e.target.matches('select, button, input')) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  if (e.key === 'Escape') focus(-1);
});
function resize() {
  const w = window.innerWidth, h = window.innerHeight, aspect = w / h;
  const halfH = Math.max(26, 33 / aspect);
  camera.left = -halfH * aspect; camera.right = halfH * aspect;
  camera.top = halfH; camera.bottom = -halfH;
  camera.updateProjectionMatrix(); renderer.setSize(w, h);
}
window.addEventListener('resize', resize); resize();
const query = new URLSearchParams(location.search);
focus(entries.findIndex(([key]) => key === query.get('prop')));
if (query.get('night') === '1') setNight(true);

let previous = performance.now(), elapsed = 0;
renderer.setAnimationLoop(now => {
  const dt = Math.min((now - previous) / 1000, 0.1); previous = now; elapsed += dt;
  for (const group of animated) group.userData.tick(elapsed, dt);
  controls.update(); renderer.render(scene, camera);
});
// Read-only diagnostics for a reviewer; the library itself has no DOM dependency.
window.propsDemo = { report, count: entries.length, animated: animated.map(g => g.name) };
window.addEventListener('pagehide', () => {
  renderer.setAnimationLoop(null); controls.dispose();
  for (const texture of labelTextures) texture.dispose();
  for (const material of labelMaterials) material.dispose();
  k.dispose(); renderer.dispose();
}, { once: true });

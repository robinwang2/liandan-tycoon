import * as THREE from 'three';
import { createCity, loopPos } from '../../src/scene3a/city.js';
import { startKind } from '../../src/scene3a/office.js';

// Sample the web rounded rectangle at uniform travel distances, including the seam.
function lane(a, b, radius) {
  const length = 4 * (a + b - 2 * radius) + 2 * Math.PI * radius;
  const count = Math.ceil(length / .4), points = [];
  for (let i = 0; i <= count; i++) {
    const [x, z, yaw] = loopPos(i % count * length / count, a, b, radius);
    points.push(...[x, -z, -yaw * 180 / Math.PI].map(v => +v.toFixed(4)));
  }
  return { length, halfDepth:b, points };
}

export function streetSnapshot(kit, props, art, region, level, district, L, store) {
  let tick;
  const stage = {
    scene: new THREE.Scene(),
    st: { az: Math.PI / 4, el: .6, mode: 'play' },
    onFrame(fn) { tick = fn; return () => {}; },
  };

  // The web city detaches upper stories into BatchedMesh. A temporary indexed
  // triangle lets its own camera cutaway select which original groups to keep.
  const markerGeometry = new THREE.PlaneGeometry(1, 1);
  const markers = new Map();
  const city = createCity(stage, {
    ...kit,
    bake(group) {
      const marker = new THREE.Mesh(markerGeometry, new THREE.MeshBasicMaterial());
      markers.set(marker.material, marker);
      group.add(marker);
      return group;
    },
  }, props, art);
  city.build({ region, level, L, hood: startKind(region, district), detail: 0 });
  tick(1, 0, { wet: 0, night: 0 });

  const root = city.root, upper = [];
  root.traverse(node => {
    if (!node.isBatchedMesh) return;
    const marker = markers.get(node.material);
    if (marker && node.getVisibleAt(0)) upper.push(marker.parent);
    node.visible = false;
  });
  for (const marker of markers.values()) {
    marker.removeFromParent();
    marker.material.dispose();
  }
  markerGeometry.dispose();
  root.add(...upper);
  root.updateMatrixWorld(true);

  // Keep the streets bordering the office. Distant blocks lie outside the
  // fixed game camera and otherwise dominate the mesh archive.
  const limit = level >= 5 ? 48 : 35;
  const nearby = p => Math.abs(p.x) < limit && Math.abs(p.z) < limit;
  const position = new THREE.Vector3(), matrix = new THREE.Matrix4(), tint = new THREE.Color();
  const expanded = [];
  // At web detail 0 only the four ring-road vehicles are direct prop children.
  // Parked vehicles belong to the baked street and stay where the web placed them.
  const cars = root.children.filter(n => n.userData.placement);
  if (cars.length !== 4) throw Error('City ring traffic changed');
  for (const car of cars) car.removeFromParent();
  const pedestrians = root.children.filter(n => n.isInstancedMesh && n.instanceColor &&
    ['CapsuleGeometry', 'SphereGeometry'].includes(n.geometry.type));
  if (pedestrians.length !== 2) throw Error('City pedestrian meshes changed');
  const walkers = Array.from({length:pedestrians[0].count}, (_,i) => {
    const person = new THREE.Group();
    for (const batch of pedestrians) {
      const mat = batch.material.clone();
      batch.getColorAt(i, tint); mat.color.multiply(tint);
      const mesh = new THREE.Mesh(batch.geometry, mat);
      mesh.position.y = batch.geometry.type === 'CapsuleGeometry' ? .45 : 1;
      person.add(mesh);
    }
    return store.model(person);
  });
  for (const batch of pedestrians) batch.removeFromParent();
  const hx = L.W / 2 + 3.4, hz = L.D / 2 + 3.4;
  const lanes = [1.3,-1.5].map(off => lane(hx+3.8+off, hz+3.8+off, 2.2));
  for (const off of [0,.5,1]) lanes.push(lane(hx+8.8+off,hz+8.8+off,1.2));
  root.traverse(node => {
    if (node.isBatchedMesh) return;
    if (node.isInstancedMesh) {
      node.visible = false;
      for (let i = 0; i < node.count; i++) {
        node.getMatrixAt(i, matrix);
        matrix.premultiply(node.matrixWorld);
        if (!nearby(position.setFromMatrixPosition(matrix))) continue;
        let mat = node.material;
        if (node.instanceColor) {
          mat = mat.clone();
          node.getColorAt(i, tint);
          mat.color.multiply(tint);
        }
        const mesh = new THREE.Mesh(node.geometry, mat);
        matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
        expanded.push(mesh);
      }
    } else if (node.isMesh || node.userData.placement) {
      if (!nearby(node.getWorldPosition(position))) node.visible = false;
    }
  });
  for (const mesh of expanded) root.add(mesh);
  root.updateMatrixWorld(true);
  return { root, cars, walkers, lanes, dispose: () => city.destroy() };
}

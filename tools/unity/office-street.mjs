import * as THREE from 'three';
import { createCity } from '../../src/scene3a/city.js';
import { startKind } from '../../src/scene3a/office.js';

export function streetSnapshot(kit, props, art, region, level, district, L) {
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
  return { root, dispose: () => city.destroy() };
}

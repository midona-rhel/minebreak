import * as THREE from 'three';
import {
  bake,
  createMossBoulder,
  createTaperedBranch,
  disposeObjects,
} from './asset-kit.ts';
import { applyDioramaSurface } from './surface-material.ts';

export function createSeagrass(seed = 11) {
  const group = new THREE.Group();
  group.name = 'seagrass';
  for (let i = 0; i < 9; i++) {
    const angle = i * 2.399 + seed,
      height = 0.48 + (Math.sin(i * 7.3 + seed) * 0.5 + 0.5) * 0.48;
    const points: number[] = [],
      indices: number[] = [];
    for (let j = 0; j <= 7; j++) {
      const t = j / 7,
        width = 0.038 * Math.sin(Math.PI * (t * 0.85 + 0.08));
      const bend = Math.sin(t * 2.4) * 0.16;
      const x = Math.cos(angle) * (0.07 + bend),
        z = Math.sin(angle) * (0.07 + bend);
      points.push(
        x - Math.cos(angle) * width,
        t * height,
        z - Math.sin(angle) * width,
        x + Math.cos(angle) * width,
        t * height,
        z + Math.sin(angle) * width,
      );
      if (j < 7) {
        const k = j * 2;
        indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(points, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = applyDioramaSurface(
      new THREE.MeshStandardMaterial({
        color: i % 2 ? 0x477b51 : 0x71945a,
        side: THREE.DoubleSide,
        roughness: 0.9,
      }),
    );
    const blade = new THREE.Mesh(geometry, material);
    blade.castShadow = blade.receiveShadow = true;
    group.add(blade);
  }
  return bake(group);
}

export function createReefCoral(seed = 23) {
  const group = new THREE.Group();
  group.name = 'reef-coral';
  const color = seed % 2 ? 0xb97863 : 0x609f98;
  for (let i = 0; i < 5; i++) {
    const a = i * 1.7,
      h = 0.36 + (i % 3) * 0.15;
    const stem = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(Math.cos(a) * 0.12, h * 0.5, Math.sin(a) * 0.12),
      new THREE.Vector3(Math.cos(a) * 0.27, h, Math.sin(a) * 0.27),
    ];
    group.add(createTaperedBranch(stem, 0.065, 0.025, color));
    for (const sign of [-1, 1])
      group.add(
        createTaperedBranch(
          [
            stem[1],
            new THREE.Vector3(
              stem[2].x + sign * 0.15,
              h * 0.85,
              stem[2].z + 0.08,
            ),
          ],
          0.036,
          0.012,
          color,
        ),
      );
  }
  return bake(group);
}

/** Small authored reef groups, planted by raycast on the actual lagoon floor. */
export function createUnderwaterScenery(floor: THREE.Mesh, seed = 17) {
  const group = new THREE.Group();
  group.name = 'underwater-reef-and-ruins';
  const staticProps = new THREE.Group();
  staticProps.name = 'submerged-rock-and-coral';
  group.add(staticProps);
  const plants: THREE.Group[] = [],
    ray = new THREE.Raycaster();
  floor.updateWorldMatrix(true, false);
  const place = (
    object: THREE.Object3D,
    x: number,
    z: number,
    owner: THREE.Group = staticProps,
  ) => {
    ray.set(new THREE.Vector3(x, -2.7, z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(floor, false)[0];
    if (!hit) {
      disposeObjects(object);
      return;
    }
    object.position.set(x, hit.point.y + 0.012, z);
    owner.add(object);
  };
  const sites = [
    [-7.7, 4.8],
    [7.4, 5.9],
    [-7.9, -1.4],
    [8, -2.5],
    [3.7, 9.2],
    [-2, 9.7],
  ];
  sites.forEach(([x, z], i) => {
    const offset = Math.sin(seed + i * 7) * 0.32;
    place(createMossBoulder(seed + i, 1.15, 0.86, 0.6), x + offset, z);
    const coral = createReefCoral(seed + i);
    coral.scale.setScalar(0.75 + (i % 3) * 0.12);
    place(coral, x + 0.6, z + 0.38);
    for (let j = 0; j < 3; j++) {
      const grass = createSeagrass(seed + i * 3 + j);
      grass.scale.setScalar(0.65 + j * 0.15);
      place(grass, x - 0.48 + j * 0.22, z + 0.35 + j * 0.23, group);
      plants.push(grass);
    }
  });
  // A broken column and scattered drums provide a recognizable submerged ruin.
  for (let i = 0; i < 4; i++) {
    const material = applyDioramaSurface(
      new THREE.MeshStandardMaterial({ color: 0x9e9c82, roughness: 0.85 }),
    );
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.26, 0.6 + i * 0.09, 8),
      material,
    );
    column.geometry.translate(0, (0.6 + i * 0.09) * 0.5, 0);
    column.castShadow = column.receiveShadow = true;
    column.rotation.z = i % 2 ? 0.65 : 0;
    place(column, 6.9 + i * 0.39, 7.1 + Math.sin(i) * 0.35);
  }
  bake(staticProps);
  return {
    group,
    update(time: number) {
      plants.forEach((plant, i) => {
        plant.rotation.z = Math.sin(time * 0.72 + i * 1.7) * 0.055;
        plant.rotation.x = Math.cos(time * 0.58 + i) * 0.04;
      });
    },
    dispose: () => disposeObjects(group),
  };
}

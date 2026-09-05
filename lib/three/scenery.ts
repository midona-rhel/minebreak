import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  bake,
  createBridge,
  createCrystal,
  createFoliage,
  createLantern,
  createMossBoulder,
  createMushroomPatch,
  createRuneWaystone,
  createTaperedBranch,
  createTree,
  fracturedRock,
} from './asset-kit.ts';
import { TERRAIN } from './terrain.ts';

function place<T extends THREE.Object3D>(
  owner: THREE.Object3D,
  object: T,
  x: number,
  y: number,
  z: number,
  scale = 1,
  yaw = 0,
): T {
  object.position.set(x, y, z);
  object.scale.setScalar(scale);
  object.rotation.y = yaw;
  owner.add(object);
  return object;
}

/** Fit the visible root to the actual cliff, from the trunk down to its fine tip. */
export function attachCliffRoots(tree: THREE.Group, cliff: THREE.Mesh) {
  tree.updateWorldMatrix(true, false);
  cliff.updateWorldMatrix(true, false);
  const origin = tree.getWorldPosition(new THREE.Vector3());
  const out = new THREE.Vector3(0, 0, 1).transformDirection(tree.matrixWorld);
  const tangent = new THREE.Vector3(out.z, 0, -out.x);
  const ray = new THREE.Raycaster();
  const roots = new THREE.Group();
  roots.name = 'trunk-to-cliff-roots';
  for (let strand = 0; strand < 3; strand++) {
    const lateral = (strand - 1) * 0.23;
    const start = origin.clone().add(new THREE.Vector3(0, 0.12, 0));
    const points = [start];
    // Outside-in horizontal raycasts follow the rock's real ledges at each height.
    for (let step = 0; step < 13; step++) {
      const y = TERRAIN.topY - 0.04 - step * 0.13;
      const drift =
        lateral * Math.min(1, step * 0.4) +
        Math.sin(step * 0.4 + strand) * 0.035;
      const from = origin
        .clone()
        .addScaledVector(out, 3)
        .addScaledVector(tangent, drift);
      from.y = y;
      ray.set(from, out.clone().negate());
      const hit = ray.intersectObject(cliff, false)[0];
      if (!hit) continue;
      const thickness = 0.045 * (1 - step / 15);
      const p = hit.point.clone().addScaledVector(out, thickness);
      if (step === 0) {
        const soil = origin.clone().lerp(p, 0.52);
        soil.y = origin.y + 0.015;
        points.push(soil);
      }
      points.push(p);
    }
    const local = points.map((p) => tree.worldToLocal(p.clone()));
    const branch = createTaperedBranch(
      local,
      strand === 1 ? 0.12 : 0.075,
      0.003,
      strand === 1 ? 0x75512f : 0x866139,
    );
    branch.name = 'cliff-root-strand';
    branch.userData.rootPath = local.map((p) => p.toArray());
    roots.add(branch);
  }
  tree.add(roots);
}

/** Authored arrangements, with every planted prop grounded at the same terrain datum. */
export function createScenery(cliff: THREE.Mesh) {
  const scenery = new THREE.Group();
  scenery.name = 'mossbound-island-scenery';
  const ground = TERRAIN.topY;
  const landmark = (name: string) => {
    const g = new THREE.Group();
    g.name = name;
    scenery.add(g);
    return g;
  };
  const shoulders = landmark('rock-and-moss-rim');
  // Irregular spacing and stretches of bare ground leave breathing room between
  // the four compositions. Shoulder meshes stay outside the board's +/-4 bounds.
  const shoulderPoses = [
    [-4.62, -3.7, 0.76, 0.71],
    [-4.65, -2.9, 0.64, 0.64],
    [-4.69, -1.98, 0.73, 0.76],
    [-4.77, -0.84, 0.58, 0.84],
    [-4.74, 0.25, 0.68, 0.72],
    [-4.68, 1.22, 0.73, 0.67],
    [-4.65, 2.23, 0.71, 0.82],
    [-4.54, 3.43, 0.83, 0.77],
    [-3.37, -4.63, 0.85, 0.73],
    [-2.34, -4.71, 0.79, 0.61],
    [-1.37, -4.68, 0.8, 0.72],
    [-0.18, -4.79, 0.83, 0.58],
    [1.01, -4.67, 0.87, 0.77],
    [2.16, -4.71, 0.69, 0.63],
    [3.33, -4.57, 0.76, 0.81],
    [4.62, -3.24, 0.73, 0.9],
    [4.65, -2.23, 0.8, 0.83],
    [4.7, -1.04, 0.61, 0.84],
    [4.7, 0.09, 0.69, 0.79],
    [4.71, 1.24, 0.72, 0.74],
    [4.64, 2.42, 0.82, 0.78],
    [4.56, 3.49, 0.73, 0.69],
    [-3.44, 4.61, 0.77, 0.77],
    [-2.27, 4.65, 0.82, 0.74],
    [-1.1, 4.69, 0.85, 0.74],
    [0.02, 4.63, 0.67, 0.79],
    [3.57, 4.57, 0.8, 0.77],
  ];
  shoulderPoses.forEach(([x, z, w, d], i) =>
    place(
      shoulders,
      createMossBoulder(i, w, d, 0.3 + (i % 4) * 0.07),
      x,
      ground,
      z,
      1,
      Math.sin(i * 2.7) * 0.09,
    ),
  );

  const grove = landmark('01-lantern-grove');
  const oak = place(
    grove,
    createTree(7),
    -4.69,
    ground,
    -3.23,
    0.98,
    -Math.PI / 2,
  );
  attachCliffRoots(oak, cliff);
  place(grove, createLantern(), -3.76, ground, -4.68, 1.45);
  place(grove, createCrystal(0x159fc6), -2.25, ground, -4.61, 0.48, 0.2);
  place(grove, createMushroomPatch(5), -4.48, ground + 0.01, -1.42, 0.74);
  place(grove, createFoliage(11), -4.46, ground + 0.03, -2.22, 1.1, 2.1);
  place(grove, createFoliage(18), -2.78, ground, -4.43, 0.82, 0.3);
  // Low ruined wall under the lantern provides a recognizable architectural base.
  for (let i = 0; i < 3; i++)
    place(
      grove,
      createMossBoulder(70 + i, 0.58, 0.49, 0.46),
      -3.8 + i * 0.68,
      ground,
      -4.78,
      0.85,
    );

  const sanctum = landmark('02-amethyst-outcrop');
  // One monumental cluster, with a small echo belonging to the same outcrop.
  place(
    sanctum,
    createMossBoulder(21, 1.5, 1.45, 0.85),
    4.81,
    ground - 0.25,
    -4.1,
  );
  const crystal = place(
    sanctum,
    createCrystal(),
    4.84,
    ground + 0.15,
    -4.1,
    1.02,
    0.4,
  );
  crystal.name = 'amethyst-hero-cluster';
  place(sanctum, createFoliage(29), 4.45, ground, -2.82, 0.96, 2.6);
  place(sanctum, createMushroomPatch(31), 3.3, ground, -4.45, 0.58);
  place(sanctum, createFoliage(44), 4.56, ground, -4.57, 0.8, 1.9);

  const cove = landmark('03-root-and-fern-cove');
  const coastalTree = place(
    cove,
    createTree(46),
    -2.9,
    ground,
    4.72,
    0.62,
    0.04,
  );
  attachCliffRoots(coastalTree, cliff);
  place(
    cove,
    createMossBoulder(83, 1.45, 1.25, 0.6),
    -4.82,
    ground - 0.15,
    3.88,
  );
  place(cove, createCrystal(), -4.87, ground + 0.08, 3.91, 1, -0.35);
  place(cove, createCrystal(0x159fc6), -3.87, ground + 0.02, 4.72, 0.46, 0.6);
  place(cove, createFoliage(52), -4.53, ground, 2.79, 1.08, 0.5);
  place(cove, createFoliage(56), -2.32, ground, 4.4, 0.78, 2);

  const crossing = landmark('04-watchstone-crossing');
  const waystone = place(
    crossing,
    createRuneWaystone(31),
    4.48,
    ground,
    2.83,
    0.93,
    -Math.PI / 2,
  );
  waystone.name = 'crossing-waystone';
  place(crossing, createLantern(), 3.56, ground, 4.48, 0.88);
  place(crossing, createFoliage(65), 4.49, ground, 1.98, 1.05, -1.7);
  const bridge = place(crossing, createBridge(), 1.8, ground + 0.025, 4.87, 1);
  bridge.scale.z = 1.15;
  // Stone landing at the far end and timber piles turn the bridge into a real
  // crossing. Its cap is exactly level with the first/last deck planks.
  const landing = landmark('crossing-sea-stack');
  place(
    landing,
    fracturedRock(2.08, 3.5, 1.95, 401, 0x55565d),
    1.8,
    -1.88,
    7.72,
  );
  const cap = new THREE.Mesh(
    new RoundedBoxGeometry(1.85, 0.23, 1.43, 2, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x958362, roughness: 0.93 }),
  );
  cap.castShadow = cap.receiveShadow = true;
  place(landing, cap, 1.8, ground - 0.095, 7.62);
  place(landing, createLantern(), 2.36, ground + 0.02, 7.95, 0.58);
  place(landing, createFoliage(72), 1.15, ground + 0.03, 7.91, 0.53, 0.7);
  for (const x of [1.19, 2.41]) {
    const support = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.095, 2.9, 7),
      new THREE.MeshStandardMaterial({ color: 0x65472e, roughness: 1 }),
    );
    support.castShadow = true;
    place(crossing, support, x, -1.68, 6.02);
  }
  bake(shoulders);
  return scenery;
}

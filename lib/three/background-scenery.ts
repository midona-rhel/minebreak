import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  bake,
  createFoliage,
  createLantern,
  createMossBoulder,
  disposeObjects,
} from './asset-kit.ts';
import { applyDioramaSurface } from './surface-material.ts';
import type { SurfObstacle } from './ocean.ts';

export const BACKGROUND_PRESETS = [
  { id: 'archipelago', label: 'Ancient archipelago' },
  { id: 'arches', label: 'Stone arch coast' },
  { id: 'watchtower', label: 'Watchtower cliffs' },
] as const;
export type BackgroundPreset = (typeof BACKGROUND_PRESETS)[number]['id'];
const random = (seed: number) => () =>
  (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

function stone(geometry: THREE.BufferGeometry, color = 0x8e8169) {
  const material = applyDioramaSurface(
    new THREE.MeshStandardMaterial({ color, roughness: 0.82 }),
  );
  const object = new THREE.Mesh(geometry, material);
  object.castShadow = object.receiveShadow = true;
  return object;
}
function block(
  owner: THREE.Group,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  color = 0x8e8169,
) {
  const object = stone(new RoundedBoxGeometry(w, h, d, 2, 0.055), color);
  object.position.set(x, y, z);
  owner.add(object);
  return object;
}

/** A genuinely open, individually jointed stone arch, supported at both ends. */
export function createStoneArch(seed = 17) {
  const group = new THREE.Group();
  group.name = 'stone-arch';
  const rand = random(seed),
    inner = 1.18,
    outer = 1.78,
    spring = 1.03;
  for (const x of [-1.48, 1.48]) {
    for (let row = 0; row < 3; row++)
      block(
        group,
        0.72,
        0.35,
        0.86,
        x,
        0.17 + row * 0.35,
        0,
        row % 2 ? 0x817761 : 0x9a8a71,
      );
    block(group, 0.91, 0.16, 1.04, x, 0.04, 0, 0x716a59);
  }
  for (let i = 0; i < 11; i++) {
    const a = (i * Math.PI) / 11 + 0.009,
      b = ((i + 1) * Math.PI) / 11 - 0.009;
    const shape = new THREE.Shape();
    shape.moveTo(Math.cos(a) * inner, Math.sin(a) * inner + spring);
    shape.lineTo(Math.cos(a) * outer, Math.sin(a) * outer + spring);
    shape.lineTo(Math.cos(b) * outer, Math.sin(b) * outer + spring);
    shape.lineTo(Math.cos(b) * inner, Math.sin(b) * inner + spring);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.76,
      bevelEnabled: true,
      bevelSize: 0.025,
      bevelThickness: 0.025,
      bevelSegments: 2,
      steps: 1,
    });
    geometry.translate(0, 0, -0.38);
    const wedge = stone(
      geometry,
      new THREE.Color(0x9c8d72).multiplyScalar(0.87 + rand() * 0.22).getHex(),
    );
    group.add(wedge);
  }
  for (const [x, y, z, scale] of [
    [-1.5, 0.03, 0.4, 0.65],
    [1.65, 0.01, -0.3, 0.7],
    [-0.65, 2.62, 0, 0.46],
  ]) {
    const moss = createFoliage(seed + Math.round(x * 5));
    moss.position.set(x, y, z);
    moss.scale.setScalar(scale);
    group.add(moss);
  }
  return bake(group);
}

/** Small ruined watchtower with masonry courses, a dark doorway and battlements. */
export function createWatchtower(seed = 31) {
  const group = new THREE.Group();
  group.name = 'watchtower';
  const rand = random(seed);
  const core = stone(new THREE.CylinderGeometry(0.79, 0.96, 3.2, 12), 0x665e52);
  core.position.y = 1.6;
  group.add(core);
  for (let row = 0; row < 7; row++)
    for (let side = 0; side < 12; side++) {
      const angle = ((side + (row % 2) * 0.5) * Math.PI) / 6;
      const radius = 0.94 - row * 0.025;
      const brick = block(
        group,
        0.49,
        0.425,
        0.23,
        Math.sin(angle) * radius,
        0.23 + row * 0.45,
        Math.cos(angle) * radius,
        new THREE.Color(0x93836a).multiplyScalar(0.83 + rand() * 0.23).getHex(),
      );
      brick.rotation.y = angle;
    }
  // The doorway is outside the solid core, with its own deep inset and stone jambs.
  const door = stone(new THREE.PlaneGeometry(0.49, 0.89), 0x242936);
  door.position.set(0, 0.52, 1.085);
  group.add(door);
  block(group, 0.16, 1.05, 0.24, -0.32, 0.52, 1.02);
  block(group, 0.16, 1.05, 0.24, 0.32, 0.52, 1.02);
  block(group, 0.79, 0.19, 0.3, 0, 1.1, 1.02);
  const crown = stone(
    new THREE.CylinderGeometry(1.04, 1.03, 0.23, 12),
    0x9d8c73,
  );
  crown.position.y = 3.25;
  group.add(crown);
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const merlon = block(
      group,
      0.42,
      0.47,
      0.36,
      Math.sin(angle) * 0.9,
      3.56,
      Math.cos(angle) * 0.9,
      0x8b7d65,
    );
    merlon.rotation.y = angle;
  }
  const lantern = createLantern();
  lantern.scale.setScalar(0.64);
  lantern.position.set(0, 3.37, 0);
  group.add(lantern);
  for (const [x, z] of [
    [-0.85, 0.5],
    [0.7, -0.5],
  ]) {
    const foliage = createFoliage(seed + 4);
    foliage.position.set(x, 0, z);
    foliage.scale.setScalar(0.7);
    group.add(foliage);
  }
  return bake(group);
}

/** Watertight outcrop with a broad planted cap and cliffs extending below sea. */
export function createBackdropCliff(
  seed = 41,
  width = 4.6,
  depth = 3.2,
  height = 2.6,
) {
  const group = new THREE.Group();
  group.name = 'backdrop-cliff';
  const rand = random(seed),
    segments = 20,
    positions: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const radial = Array.from({ length: segments }, () => 0.9 + rand() * 0.12);
  const rings = [
    { y: 0, r: 0.93, c: 0x7d852a },
    { y: -0.22, r: 1, c: 0x95836b },
    { y: -height * 0.82, r: 0.86, c: 0x4e5260 },
    { y: -height, r: 0.68, c: 0x394554 },
  ];
  rings.forEach((ring, row) => {
    for (let i = 0; i < segments; i++) {
      const a = (i * Math.PI * 2) / segments,
        radius = radial[i] * ring.r;
      positions.push(
        Math.cos(a) * width * 0.5 * radius,
        ring.y,
        Math.sin(a) * depth * 0.5 * radius,
      );
      const color = new THREE.Color(ring.c).multiplyScalar(i % 2 ? 0.94 : 1.05);
      colors.push(color.r, color.g, color.b);
      if (row < rings.length - 1) {
        const a0 = row * segments + i,
          b = row * segments + ((i + 1) % segments);
        indices.push(a0, b, a0 + segments, b, b + segments, a0 + segments);
      }
    }
  });
  const top = positions.length / 3;
  positions.push(0, 0, 0);
  colors.push(...new THREE.Color(0x7d852a).toArray());
  const bottom = positions.length / 3;
  positions.push(0, -height, 0);
  colors.push(...new THREE.Color(0x394554).toArray());
  for (let i = 0; i < segments; i++)
    indices.push(
      top,
      (i + 1) % segments,
      i,
      bottom,
      60 + i,
      60 + ((i + 1) % segments),
    );
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const cliff = stone(geometry, 0xffffff);
  cliff.material.vertexColors = true;
  cliff.material.flatShading = true;
  cliff.material.userData.surfaceKind = 2;
  group.add(cliff);
  for (let i = 0; i < 5; i++) {
    const angle = rand() * Math.PI * 2;
    const rock = createMossBoulder(seed + i, 0.6, 0.5, 0.28);
    rock.position.set(
      Math.cos(angle) * width * 0.35,
      0,
      Math.sin(angle) * depth * 0.34,
    );
    group.add(rock);
  }
  return bake(group);
}

/** Scene recipes are data, so new combinations do not require rebuilding the board. */
export function createBackgroundScenery(
  preset: BackgroundPreset = 'archipelago',
  seed = 17,
) {
  const group = new THREE.Group();
  group.name = `background-${preset}`;
  const rand = random(seed),
    shorelines: SurfObstacle[] = [];
  const layout =
    preset === 'arches'
      ? [
          { x: -9, z: -7, kind: 'arch', scale: 0.82 },
          { x: 8, z: -9, kind: 'arch', scale: 0.72 },
          { x: 12, z: -3, kind: 'cliff', scale: 0.9 },
        ]
      : preset === 'watchtower'
        ? [
            { x: -9, z: -7, kind: 'tower', scale: 0.78 },
            { x: 8, z: -9, kind: 'cliff', scale: 1.05 },
            { x: 12, z: -3, kind: 'cliff', scale: 0.8 },
          ]
        : [
            { x: -9, z: -7, kind: 'arch', scale: 0.82 },
            { x: 8, z: -9, kind: 'tower', scale: 0.72 },
            { x: 12, z: -3, kind: 'cliff', scale: 0.9 },
          ];
  layout.forEach((pose, i) => {
    const x = pose.x + (rand() - 0.5) * 2,
      z = pose.z + (rand() - 0.5) * 2,
      scale = pose.scale * (0.94 + rand() * 0.12);
    const land = createBackdropCliff(
      seed + i * 19,
      pose.kind === 'arch' ? 5.2 : 4.5,
      3.6,
      16,
    );
    land.position.set(x, -0.35, z);
    land.scale.setScalar(scale);
    land.rotation.y = (rand() - 0.5) * 0.35;
    group.add(land);
    const prop =
      pose.kind === 'arch'
        ? createStoneArch(seed + i)
        : pose.kind === 'tower'
          ? createWatchtower(seed + i)
          : null;
    if (prop) {
      prop.position.copy(land.position);
      prop.scale.setScalar(scale);
      prop.rotation.y = land.rotation.y;
      group.add(prop);
    } else {
      const pinnacle = createBackdropCliff(seed + i + 33, 2.4, 2.2, 2.4);
      pinnacle.position.set(x + 0.3, 1.1, z - 0.3);
      pinnacle.scale.setScalar(scale);
      group.add(pinnacle);
    }
    shorelines.push({
      x,
      z,
      radiusX: (pose.kind === 'arch' ? 2.45 : 2.12) * scale,
      radiusZ: 1.69 * scale,
    });
  });
  return { group, shorelines, dispose: () => disposeObjects(group) };
}

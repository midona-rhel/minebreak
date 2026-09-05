import * as THREE from 'three';
import { applyDioramaSurface } from './surface-material.ts';

/** Shared measurements keep the shore, surf, props and game board aligned. */
export const TERRAIN = Object.freeze({
  seaLevel: -2.65,
  topY: -0.23,
  topHalfExtent: 5.15,
  bottomY: -3.3,
  beachInnerHalfExtent: 4.6,
  beachOuterHalfExtent: 6.65,
  shoreHalfExtent: 5.66,
  sectionWidth: 2,
});

function noise(t: number, seed = 0) {
  return (
    Math.sin(t * 2.7 + seed) * 0.5 +
    Math.sin(t * 7.3 + seed * 1.31) * 0.3 +
    Math.sin(t * 13.1 - seed) * 0.2
  );
}

function roundedSquareRadius(angle: number, halfExtent: number) {
  return (
    halfExtent /
    Math.pow(
      Math.abs(Math.cos(angle)) ** 6 + Math.abs(Math.sin(angle)) ** 6,
      1 / 6,
    )
  );
}

/** World-space ocean contact line; the outer sand apron continues underwater. */
export function shorelineRadius(angle: number) {
  return (
    roundedSquareRadius(angle, TERRAIN.shoreHalfExtent) *
    (1 + Math.sin(angle * 7) * 0.012 + Math.sin(angle * 13) * 0.006)
  );
}

const cliffRings = [
  { y: -0.23, extent: 5.15, tint: 0x788022 },
  { y: -0.48, extent: 5.2, tint: 0x96806a },
  { y: -0.76, extent: 5.15, tint: 0x746454 },
  { y: -2.3, extent: 4.75, tint: 0x454855 },
  { y: -3.3, extent: 4.14, tint: 0x303b4c },
] as const;

function finishGeometry(
  positions: number[],
  colors: number[],
  indices: number[],
) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function rockMaterial() {
  const material = applyDioramaSurface(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.97,
      flatShading: true,
    }),
  );
  material.userData.surfaceKind = 2;
  return material;
}

/** A single indexed, watertight landform: no overlapping pillar seams or holes. */
export function createIslandCliff() {
  // Thirty-two broad stone columns, each bounded by a narrow recessed joint.
  const segments = 128;
  const positions: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  // Correlated irregular stone sectors stagger the horizontal fracture heights.
  // The same shift follows each vertical buttress, keeping all rings ordered.
  const sectorCount = segments / 4;
  const hash = (sector: number, salt: number) => {
    const value =
      Math.sin(((sector + sectorCount) % sectorCount) * 127.1 + salt * 311.7) *
      43758.5453;
    return value - Math.floor(value);
  };
  const warpEnvelope = [0, 0.5, 1, 1, 0];
  cliffRings.forEach((ring, layer) => {
    for (let i = 0; i < segments; i++) {
      const sector = Math.floor(i / 4),
        atJoint = i % 4 === 0;
      // Narrow recessed joints and broad, nearly planar column faces.
      const phase = [0, 0.14, 0.5, 0.86][i % 4];
      const a = ((sector + phase) / sectorCount) * Math.PI * 2;
      const sectorSample = (salt: number) =>
        atJoint
          ? (hash(sector - 1, salt) + hash(sector, salt)) * 0.5
          : hash(sector, salt);
      const yShift = (sectorSample(2) - 0.5) * 0.48;
      // Correlated projections carry the same fracture down each vertical face.
      const sectorProjection = (sectorSample(1) - 0.5) * 0.3;
      const reliefEnvelope =
        layer === 0
          ? 0
          : layer === 1
            ? 0.8
            : layer === 2
              ? 1
              : layer === cliffRings.length - 1
                ? 0.3
                : 1;
      const fracture =
        reliefEnvelope * (sectorProjection + (atJoint ? -0.24 : 0.12));
      const radius = roundedSquareRadius(a, ring.extent) + fracture;
      const y = ring.y + yShift * warpEnvelope[layer];
      positions.push(Math.cos(a) * radius, y, Math.sin(a) * radius);
      const tone = layer < 2 ? 1 : 0.88 + sectorSample(3) * 0.22;
      const jointOcclusion = atJoint && layer > 0 ? 0.58 : 1;
      const tint = new THREE.Color(ring.tint).multiplyScalar(
        tone * jointOcclusion,
      );
      colors.push(tint.r, tint.g, tint.b);
      if (layer < cliffRings.length - 1) {
        const next = (i + 1) % segments,
          u = layer * segments + i,
          v = layer * segments + next;
        // Alternating diagonals avoid long, mechanically repeated columns.
        if ((i + layer) % 2)
          indices.push(u, v, u + segments, v, v + segments, u + segments);
        else indices.push(u, v, v + segments, u, v + segments, u + segments);
      }
    }
  });
  const topCenter = positions.length / 3;
  positions.push(0, TERRAIN.topY, 0);
  const moss = new THREE.Color(0x758027);
  colors.push(moss.r, moss.g, moss.b);
  const bottomCenter = positions.length / 3;
  positions.push(0, TERRAIN.bottomY, 0);
  const base = new THREE.Color(0x374b53);
  colors.push(base.r, base.g, base.b);
  const last = (cliffRings.length - 1) * segments;
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    indices.push(topCenter, next, i, bottomCenter, last + i, last + next);
  }
  const mesh = new THREE.Mesh(
    finishGeometry(positions, colors, indices),
    rockMaterial(),
  );
  mesh.name = 'island-cliff-continuous';
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.userData = {
    segments,
    rings: cliffRings.length,
    watertight: true,
    deckY: TERRAIN.topY,
    playableHalfExtent: 4,
  };
  return mesh;
}

/** Clockwise side profile. Every section's end edges match exactly at x ±1. */
export const cliffSectionProfile: readonly (readonly [number, number])[] = [
  [-0.23, 0],
  [-0.36, 0.05],
  [-0.55, -0.08],
  [-0.83, -0.03],
  [-1.02, -0.12],
  [-1.47, -0.16],
  [-1.64, -0.27],
  [-2.15, -0.33],
  [-2.34, -0.46],
  [-2.75, -0.59],
  [-3.3, -0.8],
  [-3.3, -1.35],
  [-0.23, -1.35],
];

/** Tile by translating x by sectionWidth; rotation creates other straight walls. */
export function createCliffSection(seed = 17) {
  const divisions = 12,
    n = cliffSectionProfile.length;
  const positions: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  for (let column = 0; column <= divisions; column++) {
    const x =
      (column / divisions) * TERRAIN.sectionWidth - TERRAIN.sectionWidth / 2;
    const envelope =
      column === 0 || column === divisions
        ? 0
        : Math.sin((column / divisions) * Math.PI);
    cliffSectionProfile.forEach(([y, z], row) => {
      const perturb = envelope * noise(x * 4 + row, seed) * 0.06;
      positions.push(
        x,
        y + (row === 0 || row >= 10 ? 0 : perturb * 0.5),
        z + (row >= 11 ? 0 : perturb),
      );
      const tint = new THREE.Color(
        cliffRings[Math.min(row, cliffRings.length - 1)].tint,
      ).multiplyScalar(0.94 + noise(x * 3 + row, seed) * 0.07);
      colors.push(tint.r, tint.g, tint.b);
      if (column < divisions) {
        const a = column * n + row,
          b = column * n + ((row + 1) % n);
        indices.push(a, b, a + n, b, b + n, a + n);
      }
    });
  }
  // Interior centroids close each end without introducing detached surfaces.
  for (const column of [0, divisions]) {
    const index = positions.length / 3;
    positions.push(column === 0 ? -1 : 1, -1.7, -0.9);
    const tint = new THREE.Color(0x686255);
    colors.push(tint.r, tint.g, tint.b);
    for (let i = 0; i < n; i++) {
      const a = column * n + i,
        b = column * n + ((i + 1) % n);
      if (column === 0) indices.push(index, b, a);
      else indices.push(index, a, b);
    }
  }
  const mesh = new THREE.Mesh(
    finishGeometry(positions, colors, indices),
    rockMaterial(),
  );
  mesh.name = 'cliff-section';
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.userData = {
    sectionWidth: TERRAIN.sectionWidth,
    divisions,
    profileVertices: n,
  };
  return mesh;
}

/** Terraced sand apron fades from dry gold to submerged blue-grey wet sand. */
export function createBeach() {
  const segments = 160;
  const rings = [
    [4.54, -2.34, 0xbfac79],
    [4.92, -2.35, 0xd3bd86],
    [5.28, -2.43, 0xe0c794],
    [5.48, -2.54, 0xd2bd92],
    [5.66, -2.65, 0xb5ad8d],
    [5.95, -2.89, 0x788e85],
    [6.25, -3.24, 0xb5a77f],
    [6.65, -3.95, 0xa59977],
  ];
  const positions: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  rings.forEach(([extent, height, color], row) => {
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const radius =
        roundedSquareRadius(angle, extent) *
        (1 + Math.sin(angle * 7) * 0.012 + Math.sin(angle * 13) * 0.006);
      const ripple = row === 4 ? 0 : Math.sin(angle * 31 + row * 1.8) * 0.018;
      positions.push(
        Math.cos(angle) * radius,
        height + ripple,
        Math.sin(angle) * radius,
      );
      const tint = new THREE.Color(color).multiplyScalar(
        0.98 + Math.sin(angle * 53 + row * 7) * 0.026,
      );
      colors.push(tint.r, tint.g, tint.b);
      if (row < rings.length - 1) {
        const a = row * segments + i,
          b = row * segments + ((i + 1) % segments);
        indices.push(a, b, a + segments, b, b + segments, a + segments);
      }
    }
  });
  const mesh = new THREE.Mesh(
    finishGeometry(positions, colors, indices),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 1,
    }),
  );
  mesh.name = 'beach-sand';
  mesh.receiveShadow = true;
  return mesh;
}

/** A continuous submerged sand slope meeting a broad lagoon floor 2.5 m down.
 * The plane extends beyond the camera range, so no seabed edge can be exposed.
 */
export function createSeabed() {
  const segments = 160,
    positions: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const rings = [
    [6.65, -3.95, 0xa59977],
    [7.6, -4.7, 0xb2a17a],
    [9.4, -5.15, 0xac9e79],
    [13, -5.15, 0xa79b78],
    [25, -5.15, 0x9c9476],
    [2000, -5.15, 0x9c9476],
  ];
  rings.forEach(([extent, y, color], row) => {
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const radius =
        roundedSquareRadius(angle, extent) *
        (1 + Math.sin(angle * 7) * 0.012 + Math.sin(angle * 13) * 0.006);
      // Match beach ring 7, including its tiny vertical sand undulation.
      const ripple =
        row === 0
          ? Math.sin(angle * 31 + 7 * 1.8) * 0.018
          : row < 2
            ? Math.sin(angle * 13 + row) * 0.045
            : 0;
      positions.push(
        Math.cos(angle) * radius,
        y + ripple,
        Math.sin(angle) * radius,
      );
      const tint = new THREE.Color(color).multiplyScalar(
        row === 0 ? 0.98 + Math.sin(angle * 53 + 7 * 7) * 0.026 : 1,
      );
      colors.push(tint.r, tint.g, tint.b);
      if (row < rings.length - 1) {
        const a = row * segments + i,
          b = row * segments + ((i + 1) % segments);
        indices.push(a, b, a + segments, b, b + segments, a + segments);
      }
    }
  });
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 1,
  });
  const floor = new THREE.Mesh(
    finishGeometry(positions, colors, indices),
    material,
  );
  floor.name = 'submerged-sand-slope';
  floor.receiveShadow = true;
  return floor;
}

/** Distant fragments stay outside the playable island, rendered in one draw call. */
export function createFloatingRocks(seed = 918) {
  let state = seed >>> 0;
  const rand = () =>
    (state = (state * 1664525 + 1013904223) >>> 0) / 4294967296;
  const formations = [
    [-9.8, -2.6, 0.72, 1.6],
    [-10.9, -3.35, 0.34, 0.35],
    [-9.45, -4.15, 0.22, -0.15],
    [8.8, -6.1, 0.58, 1.05],
    [10.05, -5.55, 0.28, 0.18],
    [9.55, -7.05, 0.2, -0.28],
    [8.15, 7.65, 0.48, 0.72],
    [9.3, 7.05, 0.24, -0.1],
    [7.35, 8.6, 0.17, 0.05],
    [-8.6, 7.35, 0.4, 0.82],
    [-9.55, 8.2, 0.21, 0.03],
    [-7.7, 8.7, 0.16, -0.2],
  ] as const;
  const count = formations.length;
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      y = positions.getY(i),
      z = positions.getZ(i);
    const variation = 1 + Math.sin(x * 13 + y * 19 + z * 11) * 0.16;
    positions.setXYZ(i, x * variation, y * variation, z * variation);
  }
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.94,
    flatShading: true,
  });
  const rocks = new THREE.InstancedMesh(geometry, material, count);
  rocks.name = 'floating-rock-fragments';
  rocks.castShadow = rocks.receiveShadow = true;
  const poses: {
    position: THREE.Vector3;
    scale: THREE.Vector3;
    rotation: THREE.Euler;
    phase: number;
    speed: number;
  }[] = [];
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const [x, z, size, height] = formations[i];
    const position = new THREE.Vector3(
      x + (rand() - 0.5) * 0.12,
      height + (rand() - 0.5) * 0.2,
      z + (rand() - 0.5) * 0.12,
    );
    poses.push({
      position,
      scale: new THREE.Vector3(
        size * (0.72 + rand() * 0.35),
        size * (1.2 + rand() * 1.1),
        size * 0.8,
      ),
      rotation: new THREE.Euler(rand(), rand() * Math.PI, rand() * 0.7),
      phase: rand() * Math.PI * 2,
      speed: 0.24 + rand() * 0.3,
    });
    rocks.setColorAt(
      i,
      new THREE.Color(i % 3 === 0 ? 0x8f8174 : 0x626970).multiplyScalar(
        0.8 + rand() * 0.4,
      ),
    );
  }
  rocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // Four sparse formations frame the island; they read as landmarks instead of
  // a mechanically even ring of debris.
  const update = (time: number) => {
    poses.forEach((pose, i) => {
      dummy.position.copy(pose.position);
      dummy.position.y += Math.sin(time * pose.speed + pose.phase) * 0.15;
      dummy.scale.copy(pose.scale);
      dummy.rotation.copy(pose.rotation);
      dummy.rotation.y += Math.sin(time * 0.12 + pose.phase) * 0.07;
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
    });
    rocks.instanceMatrix.needsUpdate = true;
  };
  update(0);
  rocks.computeBoundingSphere();
  rocks.boundingSphere!.radius += 0.25;
  const group = new THREE.Group();
  group.name = 'floating-rocks';
  group.add(rocks);
  return { group, update };
}

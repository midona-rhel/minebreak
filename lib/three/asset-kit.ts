import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const palette = {
  grass: 0x7a8c13,
  grassLight: 0xa5b132,
  stone: 0xbaaa88,
  rock: 0x55515b,
  wood: 0x795032,
  flag: 0xe84829,
  crystal: 0x9331ca,
  blue: 0x169ebf,
  portal: 0x27eee1,
};
function random(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const mat = (color: number, glow = 0) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: 0.88,
    flatShading: true,
    emissive: glow ? color : 0,
    emissiveIntensity: glow,
  });
function mesh(
  geometry: THREE.BufferGeometry,
  color: number,
  x = 0,
  y = 0,
  z = 0,
  glow = 0,
) {
  const o = new THREE.Mesh(geometry, mat(color, glow));
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}
function block(
  w: number,
  h: number,
  d: number,
  color: number,
  x = 0,
  y = 0,
  z = 0,
  r = 0.03,
) {
  return mesh(new RoundedBoxGeometry(w, h, d, 1, r), color, x, y, z);
}

/** Merge opaque detailing into one vertex-colored draw call per reusable asset. */
function bake(group: THREE.Group) {
  group.updateMatrixWorld(true);
  const pieces: THREE.BufferGeometry[] = [],
    remove: THREE.Mesh[] = [];
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) return;
    const material = child.material as THREE.MeshStandardMaterial;
    if (
      !(material instanceof THREE.MeshStandardMaterial) ||
      material.transparent ||
      (material instanceof THREE.MeshPhysicalMaterial &&
        material.transmission > 0) ||
      child.userData.assetAnimation
    )
      return;
    if (
      material.emissiveIntensity > 0 &&
      !material.emissive.equals(new THREE.Color(0))
    )
      return;
    const g = child.geometry.index
      ? child.geometry.toNonIndexed()
      : child.geometry.clone();
    g.applyMatrix4(child.matrixWorld);
    for (const name of Object.keys(g.attributes))
      if (!['position', 'normal', 'color'].includes(name))
        g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.color) {
      const colors = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3) {
        colors[i] = material.color.r;
        colors[i + 1] = material.color.g;
        colors[i + 2] = material.color.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    pieces.push(g);
    remove.push(child);
  });
  if (pieces.length) {
    const merged = mergeGeometries(pieces);
    if (merged) {
      for (const o of remove) {
        o.removeFromParent();
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
      const material = mat(0xffffff);
      material.vertexColors = true;
      material.side = THREE.DoubleSide;
      const combined = new THREE.Mesh(merged, material);
      combined.castShadow = true;
      combined.receiveShadow = true;
      group.add(combined);
    }
    pieces.forEach((g) => g.dispose());
  }
  return group;
}
function chippedSlab(
  w: number,
  d: number,
  h: number,
  color: number,
  seed: number,
  y: number,
) {
  const r = random(seed),
    c = 0.07;
  const shape = new THREE.Shape();
  const points = [
    [-w / 2 + c, -d / 2],
    [w / 2 - c, -d / 2],
    [w / 2, -d / 2 + c],
    [w / 2, d / 2 - c],
    [w / 2 - c, d / 2],
    [-w / 2 + c, d / 2],
    [-w / 2, d / 2 - c],
    [-w / 2, -d / 2 + c],
  ];
  points.forEach(([x, z], i) => {
    x += (r() - 0.5) * 0.026;
    z += (r() - 0.5) * 0.026;
    if (i === 0) shape.moveTo(x, z);
    else shape.lineTo(x, z);
  });
  shape.closePath();
  const o = mesh(
    new THREE.ExtrudeGeometry(shape, {
      depth: h,
      bevelEnabled: true,
      bevelThickness: 0.027,
      bevelSize: 0.024,
      bevelSegments: 1,
      steps: 1,
    }),
    color,
    0,
    y,
    0,
  );
  o.rotation.x = -Math.PI / 2;
  return o;
}
function path(points: THREE.Vector3[], radius: number, color: number) {
  return mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points),
      Math.max(8, points.length * 5),
      radius,
      5,
      false,
    ),
    color,
  );
}
/** A closed, tapered organic branch using the curve's transported tube frames. */
export function createTaperedBranch(
  points: THREE.Vector3[],
  startRadius: number,
  endRadius: number,
  color: number,
) {
  const curve = new THREE.CatmullRomCurve3(points);
  const segments = Math.max(16, points.length * 6),
    sides = 8;
  const tube = new THREE.TubeGeometry(curve, segments, 1, sides, false);
  const geometry = new THREE.BufferGeometry().copy(tube);
  const positions = geometry.getAttribute('position');
  for (let ring = 0; ring <= segments; ring++) {
    const t = ring / segments;
    const center = curve.getPointAt(t);
    // Slowly narrowing shoulders and a fine tip, never an abruptly cut pipe.
    const radius =
      endRadius + (startRadius - endRadius) * Math.pow(1 - t, 1.25);
    for (let side = 0; side <= sides; side++) {
      const i = ring * (sides + 1) + side;
      positions.setXYZ(
        i,
        center.x + (positions.getX(i) - center.x) * radius,
        center.y + (positions.getY(i) - center.y) * radius,
        center.z + (positions.getZ(i) - center.z) * radius,
      );
    }
  }
  // Close both ends; buried roots and branches also remain valid standalone assets.
  const values = Array.from(positions.array);
  const firstCenter = positions.count,
    lastCenter = firstCenter + 1;
  values.push(
    ...curve.getPointAt(0).toArray(),
    ...curve.getPointAt(1).toArray(),
  );
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(values, 3),
  );
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  const indices = Array.from(geometry.index!.array);
  const lastRing = segments * (sides + 1);
  for (let side = 0; side < sides; side++) {
    indices.push(firstCenter, side, side + 1);
    indices.push(lastCenter, lastRing + side + 1, lastRing + side);
  }
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  tube.dispose();
  const branch = mesh(geometry, color);
  branch.name = 'tapered-branch';
  return branch;
}
function leaf(length: number, width: number, color: number) {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        0,
        0,
        0,
        -width,
        0.12 * length,
        length * 0.5,
        0,
        0.26 * length,
        length * 0.6,
        0,
        0,
        0,
        0,
        0.26 * length,
        length * 0.6,
        width,
        0.12 * length,
        length * 0.5,
        -width,
        0.12 * length,
        length * 0.5,
        0,
        0.08 * length,
        length,
        0,
        0.26 * length,
        length * 0.6,
        0,
        0.26 * length,
        length * 0.6,
        0,
        0.08 * length,
        length,
        width,
        0.12 * length,
        length * 0.5,
      ],
      3,
    ),
  );
  g.computeVertexNormals();
  const m = mesh(g, color);
  m.material.side = THREE.DoubleSide;
  return m;
}
function mossPatch(
  group: THREE.Group,
  x: number,
  y: number,
  z: number,
  size: number,
  color: number,
) {
  const patch = mesh(new THREE.DodecahedronGeometry(size, 0), color, x, y, z);
  patch.scale.set(1, 0.15, 0.8);
  patch.rotation.y = x * 17;
  group.add(patch);
}
export function createTile(covered = true, variant = 0) {
  const group = new THREE.Group();
  group.name = covered ? 'tile-moss' : 'tile-stone';
  const r = random(variant * 19 + 117);
  group.add(
    chippedSlab(
      0.87,
      0.87,
      covered ? 0.27 : 0.23,
      covered ? 0x615235 : 0x87735d,
      variant + 3,
      -0.29,
    ),
  );
  group.add(
    chippedSlab(
      0.875,
      0.875,
      covered ? 0.135 : 0.035,
      covered ? palette.grass : palette.stone,
      variant * 13 + 8,
      covered ? 0.015 : -0.04,
    ),
  );
  if (covered) {
    for (let i = 0; i < 24; i++) {
      const x = (r() - 0.5) * 0.78,
        z = (r() - 0.5) * 0.78,
        size = 0.025 + r() * 0.06;
      mossPatch(
        group,
        x,
        0.177 + size * 0.1,
        z,
        size,
        [0x869618, 0x9baa27, 0x708211, 0xb0b43b][i % 4],
      );
    }
    for (let i = 0; i < 7; i++) {
      const a = r() * Math.PI * 2;
      const x = Math.cos(a) * 0.4,
        z = Math.sin(a) * 0.4;
      mossPatch(group, x, 0.143, z, 0.045 + r() * 0.035, 0x82931d);
    }
    // Tiny paired leaves are confined to the tile edges to leave its state readable.
    for (let i = 0; i < 3; i++) {
      const a = r() * Math.PI * 2;
      const l = leaf(0.09, 0.025, 0xa3b33c);
      l.position.set(Math.cos(a) * 0.32, 0.176, Math.sin(a) * 0.32);
      l.rotation.y = a;
      group.add(l);
    }
    for (let i = 0; i < 4; i++) {
      const stone = mesh(
        new THREE.DodecahedronGeometry(0.027, 0),
        0xaca16c,
        (r() - 0.5) * 0.72,
        0.184,
        (r() - 0.5) * 0.72,
      );
      stone.scale.y = 0.45;
      group.add(stone);
    }
  } else {
    // Etched edge cracks and corner chips do not cross the number area.
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const crack = path(
        [
          new THREE.Vector3(0.28, 0.023, 0.41),
          new THREE.Vector3(0.26, 0.023, 0.34),
          new THREE.Vector3(0.31, 0.023, 0.29),
        ],
        0.007,
        0x80715c,
      );
      crack.rotation.y = a;
      group.add(crack);
    }
    for (let i = 0; i < 7; i++) {
      const a = r() * Math.PI * 2;
      mossPatch(
        group,
        Math.cos(a) * 0.39,
        0.021,
        Math.sin(a) * 0.39,
        0.018,
        0xd3c5a4,
      );
    }
  }
  return bake(group);
}
export function createFlag() {
  const group = new THREE.Group();
  group.name = 'flag-coral';
  group.add(
    mesh(
      new THREE.CylinderGeometry(0.115, 0.145, 0.055, 8),
      0x82603c,
      0,
      0.195,
      0,
    ),
  );
  group.add(
    mesh(
      new THREE.CylinderGeometry(0.027, 0.032, 0.72, 7),
      0x88552d,
      0,
      0.577,
      0,
    ),
  );
  group.add(mesh(new THREE.SphereGeometry(0.044, 6, 4), 0xe0ad52, 0, 0.98, 0));
  const plane = new THREE.PlaneGeometry(0.39, 0.3, 24, 12);
  // Export full attributes rather than PlaneGeometry's parameter-only JSON.
  const geometry = new THREE.BufferGeometry().copy(plane);
  plane.dispose();
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + 0.195,
      y = pos.getY(i);
    pos.setXYZ(i, x, y * (1 - x * 0.28), 0);
  }
  // The custom attribute survives ObjectLoader export, so shared flags animate too.
  geometry.setAttribute('restPosition', pos.clone());
  if (pos instanceof THREE.BufferAttribute)
    pos.setUsage(THREE.DynamicDrawUsage);
  const flag = mesh(geometry, palette.flag, 0.025, 0.79, 0);
  flag.name = 'flag-cloth';
  flag.userData.assetAnimation = 'cloth';
  flag.material.flatShading = false;
  flag.material.roughness = 0.73;
  flag.material.side = THREE.DoubleSide;
  group.add(flag);
  for (const y of [0.7, 0.91]) {
    const tie = mesh(
      new THREE.TorusGeometry(0.033, 0.009, 6, 12),
      0xd7b575,
      0,
      y,
      0,
    );
    tie.rotation.x = Math.PI / 2;
    group.add(tie);
  }
  const result = bake(group);
  updateAssetAnimations(result, 0);
  return result;
}
/** Call once per frame with elapsed seconds; cloth remains pinned along its pole. */
export function updateAssetAnimations(
  root: THREE.Object3D,
  time: number,
  phase = 0,
) {
  root.traverse((child) => {
    if (
      !(child instanceof THREE.Mesh) ||
      child.userData.assetAnimation !== 'cloth'
    )
      return;
    const geometry = child.geometry;
    const rest = geometry.getAttribute('restPosition');
    const position = geometry.getAttribute('position');
    if (!rest || !position) return;
    for (let i = 0; i < position.count; i++) {
      const x = rest.getX(i),
        y = rest.getY(i);
      const free = x / 0.39;
      const wave = Math.sin(x * 17 - time * 3.5 + phase + y * 4);
      const ripple = Math.sin(x * 30 - time * 5.1 + phase + y * 9);
      position.setXYZ(
        i,
        x - free * (0.014 + 0.009 * Math.sin(time * 2.2 + phase)),
        y - free * free * 0.019 + wave * free * 0.008,
        free * (wave * 0.052 + ripple * 0.009),
      );
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  });
}
function crystalPrism(radius: number, height: number, color: number) {
  const n = 6,
    points: number[] = [],
    colors: number[] = [];
  const base = new THREE.Color(color);
  const v = (i: number, y: number, r: number) =>
    new THREE.Vector3(
      Math.cos((i / n) * Math.PI * 2) * r,
      y,
      Math.sin((i / n) * Math.PI * 2) * r,
    );
  for (let i = 0; i < n; i++) {
    const a = v(i, 0, radius * 0.7),
      b = v(i + 1, 0, radius * 0.7),
      c = v(i + 1, height * 0.7, radius),
      d = v(i, height * 0.7, radius),
      tip = new THREE.Vector3(-radius * 0.14, height, radius * 0.05);
    for (const triangle of [
      [a, d, b],
      [b, d, c],
      [d, tip, c],
      [a, b, new THREE.Vector3(0, 0, 0)],
    ]) {
      const tint = base
        .clone()
        .lerp(new THREE.Color(0xffffff), 0.22)
        .multiplyScalar([0.9, 1.02, 0.95, 1.08, 0.98, 1][i]);
      for (const p of triangle) {
        points.push(p.x, p.y, p.z);
        colors.push(tint.r, tint.g, tint.b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(points, 3),
  );
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    flatShading: true,
    roughness: 0.095,
    metalness: 0,
    transmission: 0.62,
    thickness: radius * 2.5,
    ior: 1.52,
    clearcoat: 1,
    clearcoatRoughness: 0.07,
    attenuationColor: new THREE.Color(color).lerp(
      new THREE.Color(0xffffff),
      0.35,
    ),
    attenuationDistance: 1.6,
    dispersion: 0.35,
    emissive: color,
    emissiveIntensity: 0.85,
    envMapIntensity: 1.35,
  });
  const prism = new THREE.Mesh(geometry, material);
  prism.castShadow = true;
  prism.receiveShadow = true;
  return prism;
}
export function createCrystal(color = palette.crystal) {
  const group = new THREE.Group();
  group.name = 'crystal-cluster';
  const r = random(541);
  const crystals = [
    [0, 0, 1.5, 0.235, 0],
    [-0.37, 0.05, 0.96, 0.145, 0.3],
    [0.31, 0.2, 0.84, 0.14, 0.33],
    [-0.18, -0.36, 0.65, 0.12, 0.4],
    [0.1, 0.43, 0.52, 0.11, 0.43],
  ];
  const up = new THREE.Vector3(0, 1, 0);
  const orientOutward = (
    crystal: THREE.Mesh,
    x: number,
    z: number,
    tilt: number,
  ) => {
    const radial = new THREE.Vector3(x, 0, z).normalize();
    const direction = new THREE.Vector3(
      radial.x * tilt,
      1,
      radial.z * tilt,
    ).normalize();
    crystal.quaternion.setFromUnitVectors(up, direction);
    crystal.position.set(x, -0.045, z);
  };
  for (const [x, z, h, w, tilt] of crystals) {
    const c = crystalPrism(w, h, color);
    c.name = tilt ? 'crystal-satellite' : 'crystal-hero';
    orientOutward(c, x, z, tilt);
    group.add(c);
  }
  // Smaller shards share the same mineral color and radiate from the same socket.
  for (const [x, z, height, radius, tilt] of [
    [0.39, -0.29, 0.69, 0.115, 0.32],
    [0.57, -0.03, 0.51, 0.09, 0.45],
    [0.2, -0.52, 0.46, 0.085, 0.45],
  ]) {
    const c = crystalPrism(radius, height, color);
    c.name = 'crystal-satellite';
    orientOutward(c, x, z, tilt);
    group.add(c);
  }
  // A broad, closed level socket buries even the outward-leaning base caps.
  const socket = mesh(
    new THREE.CylinderGeometry(0.73, 0.67, 0.13, 7),
    0x5d5657,
    0.03,
    -0.055,
    -0.015,
  );
  socket.scale.z = 0.9;
  group.add(socket);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.16;
    const rock = mesh(
      new THREE.DodecahedronGeometry(0.1 + r() * 0.05, 0),
      i % 2 ? 0x74675d : 0x85776c,
      Math.cos(a) * 0.4,
      -0.035,
      Math.sin(a) * 0.35,
    );
    rock.scale.y = 0.6;
    group.add(rock);
    mossPatch(
      group,
      Math.cos(a) * 0.4,
      -0.005,
      Math.sin(a) * 0.35,
      0.1,
      0x6d7f28,
    );
  }
  const glow = new THREE.PointLight(
    new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.22),
    3.0,
    2.8,
    2,
  );
  glow.position.set(0, 0.55, 0);
  group.add(glow);
  // A soft optical halo preserves readable glass facets instead of overexposing them.
  const aura = new THREE.Mesh(
    new THREE.PlaneGeometry(1.55, 1.95),
    new THREE.ShaderMaterial({
      uniforms: { tint: { value: new THREE.Color(color).multiplyScalar(1.8) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader:
        'varying vec2 vUv; void main(){vUv=uv;vec4 center=modelViewMatrix*vec4(0.,.62,0.,1.);vec2 scale=vec2(length(modelMatrix[0].xyz),length(modelMatrix[1].xyz));center.xy+=position.xy*scale;gl_Position=projectionMatrix*center;}',
      fragmentShader:
        'varying vec2 vUv;uniform vec3 tint;void main(){vec2 p=(vUv-.5)*2.;float a=exp(-dot(p,p)*4.)*.17*(1.-smoothstep(.65,1.,length(p)));gl_FragColor=vec4(tint,a);}',
    }),
  );
  aura.name = 'crystal-glow';
  aura.userData.noDofDepth = true;
  group.add(aura);
  return bake(group);
}
export function createLantern() {
  const group = new THREE.Group();
  group.name = 'lantern-stone';
  group.add(block(0.64, 0.14, 0.6, 0x6e6451, 0, 0.04, 0));
  // Continuous mortar core behind a running-bond stone facing.
  group.add(block(0.425, 0.64, 0.425, 0x665c49, 0, 0.42, 0, 0.008));
  for (let row = 0; row < 4; row++) {
    const y = 0.18 + row * 0.16;
    for (const offset of [-0.116, 0.116]) {
      const b = block(
        row % 2 ? 0.45 : 0.225,
        0.148,
        row % 2 ? 0.225 : 0.45,
        row % 2 ? 0x8b7959 : 0x9c8661,
        row % 2 ? 0 : offset,
        y,
        row % 2 ? offset : 0,
        0.026,
      );
      group.add(b);
    }
  }
  group.add(block(0.56, 0.1, 0.51, 0x524837, 0, 0.79, 0));
  group.add(
    mesh(new THREE.BoxGeometry(0.29, 0.38, 0.27), 0xffa61f, 0, 1.015, 0, 1.6),
  );
  for (const x of [-0.18, 0.18])
    for (const z of [-0.17, 0.17])
      group.add(block(0.055, 0.43, 0.055, 0x554333, x, 1.015, z, 0.008));
  for (const z of [-0.175, 0.175])
    group.add(block(0.36, 0.035, 0.03, 0x554333, 0, 1.01, z, 0.006));
  group.add(block(0.58, 0.13, 0.56, 0x74604b, 0, 1.28, 0));
  group.add(block(0.43, 0.1, 0.4, 0x948065, 0, 1.39, 0));
  for (const z of [-0.15, 0.12])
    mossPatch(group, 0.24, 0.124, z, 0.17, 0x7c8520);
  const light = new THREE.PointLight(0xffb037, 4, 3.5);
  light.position.y = 1.0;
  group.add(light);
  return bake(group);
}
export function createPortal() {
  const group = new THREE.Group();
  group.name = 'portal-teal';
  group.add(
    mesh(
      new THREE.CylinderGeometry(0.43, 0.4, 0.27, 24, 1, true),
      0x163239,
      0,
      -0.11,
      0,
    ),
  );
  group.add(
    mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 0.025, 24),
      0x163239,
      0,
      -0.24,
      0,
    ),
  );
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const blockMesh = block(
      0.18,
      0.22,
      0.18,
      i % 2 ? 0x5b7976 : 0x72938b,
      Math.cos(a) * 0.41,
      -0.04,
      Math.sin(a) * 0.41,
    );
    blockMesh.rotation.y = -a;
    group.add(blockMesh);
  }
  for (const [radius, y] of [
    [0.13, -0.07],
    [0.24, -0.02],
    [0.35, 0.04],
  ]) {
    const ring = mesh(
      new THREE.TorusGeometry(radius, 0.017, 5, 48),
      palette.portal,
      0,
      y,
      0,
      2,
    );
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
  }
  group.add(
    mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.02, 24),
      0x80fff1,
      0,
      -0.06,
      0,
      2,
    ),
  );
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const mote = mesh(
      new THREE.OctahedronGeometry(0.026, 0),
      0x40fff0,
      Math.cos(a) * 0.23,
      0.1 + i * 0.038,
      Math.sin(a) * 0.23,
      2,
    );
    group.add(mote);
  }
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 1.6),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { tint: { value: new THREE.Color(0x21f6e8) } },
      vertexShader:
        'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:
        'varying vec2 vUv; uniform vec3 tint; void main(){float d=length(vUv-.5)*2.; float a=pow(max(0.,1.-d),2.)*.52;gl_FragColor=vec4(tint,a);}',
    }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.13;
  group.add(halo);
  const glow = new THREE.PointLight(0x22eacb, 1.6, 2);
  glow.position.y = 0.25;
  group.add(glow);
  return bake(group);
}
function fracturedRock(
  w: number,
  h: number,
  d: number,
  seed: number,
  color: number,
) {
  const r = random(seed),
    geo = new THREE.IcosahedronGeometry(1, 1),
    p = geo.attributes.position;
  // Deform equal vertices identically, preserving a closed faceted silhouette.
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const shift = 1 + Math.sin(x * 17 + y * 21 + z * 19 + seed) * 0.12;
    p.setXYZ(i, x * w * 0.5 * shift, y * h * 0.5 * shift, z * d * 0.5 * shift);
  }
  geo.computeVertexNormals();
  const colors = [];
  const c = new THREE.Color(color);
  for (let i = 0; i < p.count; i += 3) {
    const face = c.clone().multiplyScalar(0.79 + r() * 0.35);
    for (let j = 0; j < 3; j++) colors.push(face.r, face.g, face.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const m = mat(0xffffff);
  m.vertexColors = true;
  const rock = new THREE.Mesh(geo, m);
  rock.castShadow = true;
  rock.receiveShadow = true;
  return rock;
}
export function createCliff(variant = 0) {
  const group = new THREE.Group();
  group.name = 'cliff-block';
  const r = random(variant * 77 + 37);
  for (let layer = 0; layer < 3; layer++) {
    const rock = fracturedRock(
      1.32 - layer * 0.13,
      0.97 + layer * 0.08,
      1.16,
      variant * 5 + layer,
      [0x716554, 0x5c5455, 0x424654][layer],
    );
    rock.position.set(
      (r() - 0.5) * 0.23,
      -0.36 - layer * 0.63,
      (r() - 0.5) * 0.18,
    );
    rock.rotation.y = (r() - 0.5) * 0.8;
    group.add(rock);
  }
  group.add(chippedSlab(0.97, 0.92, 0.055, 0x6f7722, variant * 11 + 5, -0.1));
  for (let i = 0; i < 9; i++) {
    mossPatch(
      group,
      (r() - 0.5) * 0.97,
      0.0,
      (r() - 0.5) * 0.86,
      0.08 + r() * 0.09,
      i % 2 ? 0x899127 : 0x747f20,
    );
  }
  for (let i = 0; i < 3; i++) {
    const shard = fracturedRock(0.32, 0.6, 0.4, variant + i, 0x6c6258);
    shard.position.set((r() - 0.5) * 0.9, -0.18, (r() - 0.5) * 0.85);
    group.add(shard);
  }
  return bake(group);
}
export function createFoliage(variant = 0) {
  const group = new THREE.Group();
  group.name = 'foliage';
  const r = random(variant + 77);
  for (let i = 0; i < 10; i++) {
    const l = leaf(
      0.22 + r() * 0.28,
      0.045 + r() * 0.035,
      [0x607624, 0x859531, 0x9caa40][i % 3],
    );
    l.rotation.y = i * 2.4;
    l.rotation.x = -(0.1 + r() * 0.7);
    l.position.set((r() - 0.5) * 0.19, 0, (r() - 0.5) * 0.2);
    group.add(l);
  }
  return bake(group);
}
export function createRoots(variant = 0) {
  const group = new THREE.Group();
  group.name = 'roots';
  const sway = Math.sin(variant * 1.7) * 0.06;
  const main = [
    new THREE.Vector3(-0.35, 0.03, -0.2),
    new THREE.Vector3(0.08, -0.12, 0.08),
    new THREE.Vector3(0.3, -0.48, 0.18),
    new THREE.Vector3(0.14 + sway, -0.9, 0.19),
    new THREE.Vector3(0.05 + sway, -1.3, 0.2),
    new THREE.Vector3(0.13 + sway, -1.75, 0.18),
  ];
  const curve = new THREE.CatmullRomCurve3(main);
  group.add(createTaperedBranch(main, 0.105, 0.006, 0x765027));
  const fork = curve.getPointAt(0.4);
  const branch = [
    fork,
    fork.clone().add(new THREE.Vector3(0.17, -0.15, 0.01)),
    fork.clone().add(new THREE.Vector3(0.29, -0.4, 0.02)),
    fork.clone().add(new THREE.Vector3(0.3, -0.63, 0)),
  ];
  group.add(createTaperedBranch(branch, 0.043, 0.003, 0x93703a));
  for (let i = 0; i < 3; i++) {
    const t = 0.2 + i * 0.18;
    const radius = 0.006 + 0.099 * Math.pow(1 - t, 1.25);
    const l = leaf(0.13, 0.045, i % 2 ? 0x718724 : 0x92a039);
    l.position.copy(curve.getPointAt(t));
    l.position.z += radius * 0.7;
    l.rotation.set(-0.3, i % 2 ? 0.8 : -0.8, 0);
    group.add(l);
  }
  return bake(group);
}
/** Compact sculpted tree: approximately 1.4 wide and 2.5 high, rooted at y=0. */
export function createTree(variant = 0) {
  const group = new THREE.Group();
  group.name = 'tree-mossbound';
  const r = random(variant * 151 + 901);
  const lean = (r() - 0.5) * 0.16;
  const trunk = [
    new THREE.Vector3(0, -0.02, 0),
    new THREE.Vector3(-0.06, 0.35, 0.015),
    new THREE.Vector3(lean, 0.84, -0.025),
    new THREE.Vector3(lean + 0.07, 1.3, 0.03),
    new THREE.Vector3(lean - 0.03, 1.83, 0),
  ];
  const trunkCurve = new THREE.CatmullRomCurve3(trunk);
  group.add(createTaperedBranch(trunk, 0.17, 0.025, 0x695035));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.2;
    group.add(
      createTaperedBranch(
        [
          trunkCurve.getPointAt(0.08),
          new THREE.Vector3(Math.cos(a) * 0.19, 0.025, Math.sin(a) * 0.19),
          new THREE.Vector3(
            Math.cos(a + 0.22) * 0.38,
            -0.025,
            Math.sin(a + 0.22) * 0.38,
          ),
        ],
        0.063 + r() * 0.012,
        0.004,
        i % 2 ? 0x85633c : 0x725036,
      ),
    );
  }
  const crownColors =
    variant % 3 === 2
      ? [0x547333, 0x72913c, 0x8da545, 0xa2b653]
      : [0x587e31, 0x739439, 0x91aa46, 0xa2b94f];
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4 + variant;
    const reach = i === 6 ? 0 : 0.29 + r() * 0.12;
    const y = i === 6 ? 2.12 : 1.44 + (i % 3) * 0.23;
    const x = lean + Math.cos(a) * reach;
    const z = Math.sin(a) * reach;
    if (i < 6) {
      group.add(
        createTaperedBranch(
          [
            trunkCurve.getPointAt(0.42 + i * 0.047),
            new THREE.Vector3(x * 0.65, y - 0.35, z * 0.7),
            new THREE.Vector3(x, y - 0.05, z),
          ],
          0.052 - (i % 3) * 0.006,
          0.01,
          i % 2 ? 0x7a5837 : 0x62492f,
        ),
      );
    }
    const crown = fracturedRock(
      0.83 + r() * 0.13,
      0.66 + r() * 0.1,
      0.76 + r() * 0.1,
      variant * 13 + i + 44,
      crownColors[i % 4],
    );
    crown.position.set(x, y, z);
    crown.rotation.y = a;
    group.add(crown);
    // Small clustered lobes give each silhouette leafy edges rather than spheres.
    for (let j = 0; j < 3; j++) {
      const angle = a + j * 2.1;
      const lobe = fracturedRock(
        0.32,
        0.28,
        0.32,
        i * 31 + j + variant,
        crownColors[(i + j + 1) % 4],
      );
      lobe.position.set(
        x + Math.cos(angle) * 0.29,
        y + 0.12 + r() * 0.11,
        z + Math.sin(angle) * 0.27,
      );
      group.add(lobe);
    }
  }
  for (let i = 0; i < 8; i++) {
    const a = i * 2.4;
    mossPatch(
      group,
      Math.cos(a) * 0.23,
      0.02,
      Math.sin(a) * 0.23,
      0.055 + r() * 0.055,
      crownColors[i % 4],
    );
  }
  return bake(group);
}
export function createBridge() {
  const group = new THREE.Group();
  group.name = 'bridge-wood';
  const r = random(224);
  for (let i = 0; i < 9; i++) {
    const z = i * 0.25,
      y = -0.04 - Math.sin((i / 8) * Math.PI) * 0.13;
    const plank = block(
      1.13,
      0.13,
      0.225,
      i % 2 ? 0x95602f : 0xb37a38,
      (r() - 0.5) * 0.07,
      y,
      z,
      0.025,
    );
    plank.rotation.z = (r() - 0.5) * 0.045;
    group.add(plank);
    for (const x of [-0.4, 0.4])
      plank.add(
        mesh(
          new THREE.CylinderGeometry(0.017, 0.017, 0.012, 6),
          0x503c2b,
          x,
          0.066,
          0,
        ),
      );
    for (let n = 0; n < 2; n++)
      plank.add(
        path(
          [
            new THREE.Vector3(-0.42, 0.066, -0.055 + n * 0.1),
            new THREE.Vector3(-0.12, 0.067, -0.04 + n * 0.1),
            new THREE.Vector3(0.38, 0.066, -0.056 + n * 0.1),
          ],
          0.0045,
          0x674020,
        ),
      );
  }
  const deckY = (z: number) => -0.04 - Math.sin((z * Math.PI) / 2) * 0.13;
  for (const x of [-0.61, 0.61]) {
    for (const z of [0, 1, 2]) {
      const surface = deckY(z);
      group.add(block(0.13, 0.7, 0.13, 0x76502a, x, surface + 0.28, z, 0.014));
      group.add(block(0.17, 0.08, 0.17, 0xb58244, x, surface + 0.67, z, 0.025));
      for (const y of [surface + 0.4, surface + 0.45, surface + 0.5]) {
        const tie = mesh(
          new THREE.TorusGeometry(0.1, 0.019, 4, 9),
          0xd0a55b,
          x,
          y,
          z,
        );
        tie.rotation.x = Math.PI / 2;
        group.add(tie);
      }
    }
    group.add(
      path(
        [
          new THREE.Vector3(x, deckY(0) + 0.5, 0),
          new THREE.Vector3(x, deckY(0.5) + 0.46, 0.5),
          new THREE.Vector3(x, deckY(1) + 0.5, 1),
          new THREE.Vector3(x, deckY(1.5) + 0.46, 1.5),
          new THREE.Vector3(x, deckY(2) + 0.5, 2),
        ],
        0.031,
        0xbd8d47,
      ),
    );
  }
  for (const x of [-0.48, 0.48]) {
    group.add(
      path(
        [0, 0.5, 1, 1.5, 2].map(
          (z) => new THREE.Vector3(x, deckY(z) - 0.086, z),
        ),
        0.031,
        0x76552f,
      ),
    );
  }
  return bake(group);
}
export function disposeObjects(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>();
  root.traverse((o) => {
    if (
      o instanceof THREE.Mesh ||
      o instanceof THREE.Points ||
      o instanceof THREE.Line
    ) {
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        materials.add(m);
        // Collect all material texture slots, including physical transmission maps.
        for (const value of Object.values(m)) {
          if (value instanceof THREE.Texture) textures.add(value);
        }
        if (m instanceof THREE.ShaderMaterial) {
          for (const uniform of Object.values(m.uniforms)) {
            if (uniform.value instanceof THREE.Texture)
              textures.add(uniform.value);
            if (Array.isArray(uniform.value)) {
              for (const value of uniform.value) {
                if (value instanceof THREE.Texture) textures.add(value);
              }
            }
          }
        }
      }
      if (o instanceof THREE.InstancedMesh) o.dispose();
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
}

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
      material.transparent
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
      0.23,
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
        0.187,
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
      l.position.set(Math.cos(a) * 0.32, 0.18, Math.sin(a) * 0.32);
      l.rotation.y = a;
      group.add(l);
    }
    for (let i = 0; i < 4; i++) {
      const stone = mesh(
        new THREE.DodecahedronGeometry(0.027, 0),
        0xaca16c,
        (r() - 0.5) * 0.72,
        0.19,
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
      0.22,
      0,
    ),
  );
  group.add(
    mesh(
      new THREE.CylinderGeometry(0.027, 0.032, 0.72, 7),
      0x88552d,
      0,
      0.59,
      0,
    ),
  );
  group.add(mesh(new THREE.SphereGeometry(0.044, 6, 4), 0xe0ad52, 0, 0.98, 0));
  const geometry = new THREE.PlaneGeometry(0.37, 0.3, 5, 3);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + 0.185,
      y = pos.getY(i);
    pos.setXYZ(i, x, y * (1 - x * 0.75), Math.sin(x * 13 + y * 5) * x * 0.22);
  }
  geometry.computeVertexNormals();
  const flag = mesh(geometry, palette.flag, 0.025, 0.79, 0);
  flag.material.side = THREE.DoubleSide;
  group.add(flag);
  for (const y of [0.7, 0.91])
    group.add(
      mesh(new THREE.TorusGeometry(0.034, 0.01, 4, 8), 0xd7b575, 0, y, 0),
    );
  return bake(group);
}
function crystalPrism(radius: number, height: number, color: number) {
  const n = 5,
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
    ]) {
      const tint = base
        .clone()
        .multiplyScalar([0.64, 1.08, 0.83, 1.28, 0.95][i]);
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
  const material = mat(0xffffff);
  material.vertexColors = true;
  material.roughness = 0.27;
  const prism = new THREE.Mesh(geometry, material);
  prism.castShadow = true;
  prism.receiveShadow = true;
  return prism;
}
export function createCrystal() {
  const group = new THREE.Group();
  group.name = 'crystal-cluster';
  const r = random(541);
  const crystals = [
    [-0.02, 0, 1.5, 0.25, 0],
    [-0.38, 0.1, 0.88, 0.16, -0.32],
    [0.31, 0.13, 0.98, 0.18, 0.35],
    [0.46, -0.23, 0.58, 0.15, 0.5],
    [-0.14, 0.31, 0.57, 0.13, -0.17],
  ];
  for (const [x, z, h, w, tilt] of crystals) {
    const c = crystalPrism(w, h, palette.crystal);
    c.position.set(x, 0, z);
    c.rotation.z = tilt;
    group.add(c);
  }
  for (let i = 0; i < 3; i++) {
    const c = crystalPrism(0.11, 0.4 + i * 0.13, palette.blue);
    c.position.set(0.5 + i * 0.14, 0, -0.2 + i * 0.12);
    c.rotation.z = -0.14 + i * 0.19;
    group.add(c);
  }
  for (let i = 0; i < 12; i++) {
    const a = r() * Math.PI * 2;
    const rock = mesh(
      new THREE.DodecahedronGeometry(0.12 + r() * 0.08, 0),
      i % 2 ? 0x74675d : 0x85776c,
      Math.cos(a) * 0.5,
      -0.035,
      Math.sin(a) * 0.4,
    );
    rock.scale.y = 0.6;
    group.add(rock);
    mossPatch(
      group,
      Math.cos(a) * 0.5,
      0.015,
      Math.sin(a) * 0.5,
      0.15,
      0x6d7f28,
    );
  }
  return bake(group);
}
export function createLantern() {
  const group = new THREE.Group();
  group.name = 'lantern-stone';
  group.add(block(0.64, 0.14, 0.6, 0x6e6451, 0, 0.04, 0));
  for (let row = 0; row < 4; row++) {
    const y = 0.18 + row * 0.16;
    for (const x of [-0.12, 0.12]) {
      const b = block(
        0.225,
        0.148,
        0.4,
        row % 2 ? 0x8b7959 : 0x9c8661,
        x,
        y,
        0,
        0.026,
      );
      b.rotation.y = row % 2 ? Math.PI / 2 : 0;
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
    mossPatch(group, 0.24, 0.14, z, 0.17, 0x7c8520);
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
      new THREE.CylinderGeometry(0.43, 0.4, 0.27, 16),
      0x163239,
      0,
      -0.11,
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
  const r = random(variant + 18);
  const main = [
    new THREE.Vector3(-0.35, 0.03, -0.2),
    new THREE.Vector3(0.08, -0.12, 0.08),
    new THREE.Vector3(0.3, -0.48, 0.18),
    new THREE.Vector3(0.14, -0.9, 0.19),
    new THREE.Vector3(-0.04, -1.3, 0.23),
    new THREE.Vector3(0.16, -1.75, 0.2),
  ];
  group.add(path(main, 0.067, 0x765027));
  const branch = main
    .slice(0, 3)
    .concat([
      new THREE.Vector3(0.57, -0.76, 0.25),
      new THREE.Vector3(0.65, -1.1, 0.3),
    ]);
  group.add(path(branch, 0.034, 0x93703a));
  for (let i = 0; i < 5; i++) {
    const l = leaf(0.17, 0.06, i % 2 ? 0x718724 : 0x92a039);
    l.position.set(0.12 + r() * 0.12, -0.15 - i * 0.2, 0.25);
    l.rotation.set(-0.6, 1 + i, 0);
    group.add(l);
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
      group.add(
        mesh(
          new THREE.CylinderGeometry(0.017, 0.017, 0.012, 6),
          0x503c2b,
          x,
          y + 0.073,
          z,
        ),
      );
    for (let n = 0; n < 2; n++)
      group.add(
        path(
          [
            new THREE.Vector3(-0.42, y + 0.074, z - 0.055 + n * 0.1),
            new THREE.Vector3(-0.12, y + 0.077, z - 0.04 + n * 0.1),
            new THREE.Vector3(0.38, y + 0.074, z - 0.056 + n * 0.1),
          ],
          0.0045,
          0x674020,
        ),
      );
  }
  for (const x of [-0.64, 0.64]) {
    for (const z of [0, 1, 2]) {
      group.add(block(0.13, 0.7, 0.13, 0x76502a, x, 0.22, z, 0.014));
      group.add(block(0.17, 0.08, 0.17, 0xb58244, x, 0.61, z, 0.025));
      for (const y of [0.28, 0.35, 0.42]) {
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
          new THREE.Vector3(x, 0.46, 0),
          new THREE.Vector3(x, 0.33, 0.5),
          new THREE.Vector3(x, 0.46, 1),
          new THREE.Vector3(x, 0.33, 1.5),
          new THREE.Vector3(x, 0.46, 2),
        ],
        0.031,
        0xbd8d47,
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
    if (o instanceof THREE.Mesh) {
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        materials.add(m);
        if (m.map) textures.add(m.map);
      }
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
}

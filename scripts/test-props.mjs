import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  createCrystal,
  createFlag,
  createRoots,
  createTaperedBranch,
  createTree,
  disposeObjects,
  updateAssetAnimations,
} from '../lib/three/asset-kit.ts';

const pointKey = (point) =>
  point
    .toArray()
    .map((value) => Math.round(value * 1e6))
    .join(',');
function assertClosedOutward(geometry) {
  const triangles = geometry.index ? geometry.toNonIndexed() : geometry;
  const positions = triangles.getAttribute('position');
  const edges = new Map();
  let volume = 0;
  for (let i = 0; i < positions.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(positions, i);
    const b = new THREE.Vector3().fromBufferAttribute(positions, i + 1);
    const c = new THREE.Vector3().fromBufferAttribute(positions, i + 2);
    assert.ok(
      new THREE.Vector3()
        .subVectors(b, a)
        .cross(new THREE.Vector3().subVectors(c, a))
        .length() > 1e-10,
    );
    volume += a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
    for (const [from, to] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const ak = pointKey(from),
        bk = pointKey(to);
      const key = [ak, bk].sort((a, b) => a.localeCompare(b)).join('|');
      const record = edges.get(key) ?? { count: 0, direction: 0 };
      record.count++;
      record.direction += ak < bk ? 1 : -1;
      edges.set(key, record);
    }
  }
  for (const edge of edges.values()) {
    assert.equal(
      edge.count,
      2,
      'every welded edge must have exactly two faces',
    );
    assert.equal(
      edge.direction,
      0,
      'neighboring faces must have consistent outward winding',
    );
  }
  assert.ok(volume > 0, 'solid must have outward-facing normals');
  if (triangles !== geometry) triangles.dispose();
}

test('crystal composition has one hero and six closed outward-radiating shards', () => {
  const cluster = createCrystal();
  const hero = cluster.getObjectByName('crystal-hero');
  assert.ok(hero);
  const shards = cluster.children.filter(
    (child) => child.name === 'crystal-satellite',
  );
  assert.equal(shards.length, 6);
  for (const crystal of [hero, ...shards]) {
    assertClosedOutward(crystal.geometry);
    assert.ok(crystal.material.isMeshPhysicalMaterial);
    assert.ok(
      crystal.material.transmission >= 0.8,
      'crystals must transmit the scene, not just reflect it',
    );
    assert.ok(
      crystal.material.roughness <= 0.12,
      'transmitted detail must remain visible',
    );
    assert.ok(
      crystal.material.emissiveIntensity >= 0.3,
      'the mineral has an internal glow',
    );
    assert.equal(
      crystal.material.emissive.getHex(),
      hero.material.emissive.getHex(),
      'one cluster must share one mineral color',
    );
    assert.equal(
      crystal.material.attenuationColor.getHex(),
      hero.material.attenuationColor.getHex(),
    );
    crystal.geometry.computeBoundingBox();
    if (crystal === hero) continue;
    const outward = new THREE.Vector3(
      crystal.position.x,
      0,
      crystal.position.z,
    ).normalize();
    const growth = new THREE.Vector3(0, 1, 0).applyQuaternion(
      crystal.quaternion,
    );
    assert.ok(
      growth.dot(outward) > 0.2,
      'satellite growth must lean away from hero in x/z',
    );
    assert.ok(growth.y > 0.85, 'shards should grow upward, not sideways');
    assert.ok(
      crystal.geometry.boundingBox.max.y < hero.geometry.boundingBox.max.y,
    );
  }
  assert.ok(cluster.getObjectByName('crystal-spill-light').intensity >= 2);
  // No radial satellite can re-enter the main hero's envelope as it grows.
  for (const shard of shards) {
    const growth = new THREE.Vector3(0, 1, 0).applyQuaternion(shard.quaternion);
    const baseDistance = Math.hypot(shard.position.x, shard.position.z);
    for (const t of [0.25, 0.5, 0.75, 1]) {
      const p = shard.position.clone().addScaledVector(growth, t);
      assert.ok(Math.hypot(p.x, p.z) > baseDistance);
    }
  }
  disposeObjects(cluster);
});

test('organic branches narrow continuously along transported frames and have closed tips', () => {
  const points = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.2, -0.4, 0.1),
    new THREE.Vector3(0.1, -1.1, 0.2),
    new THREE.Vector3(0.2, -1.7, 0.15),
  ];
  const curve = new THREE.CatmullRomCurve3(points);
  const branch = createTaperedBranch(points, 0.105, 0.006, 0x765027);
  assertClosedOutward(branch.geometry);
  const positions = branch.geometry.getAttribute('position');
  const segments = points.length * 6;
  let previous = Infinity;
  for (let ring = 0; ring <= segments; ring++) {
    const center = curve.getPointAt(ring / segments);
    let meanRadius = 0;
    for (let side = 0; side < 8; side++) {
      meanRadius +=
        new THREE.Vector3()
          .fromBufferAttribute(positions, ring * 9 + side)
          .distanceTo(center) / 8;
    }
    assert.ok(
      meanRadius < previous + 1e-6,
      'root profile must never become thicker toward tip',
    );
    previous = meanRadius;
    if (ring === 0) assert.ok(Math.abs(meanRadius - 0.105) < 1e-6);
  }
  assert.ok(Math.abs(previous - 0.006) < 1e-6);
  disposeObjects(branch);
  const roots = createRoots();
  assert.equal(roots.children.filter((child) => child.isMesh).length, 1);
  const bounds = new THREE.Box3().setFromObject(roots);
  assert.ok(bounds.min.y < -1.5 && bounds.max.y < 0.25);
  disposeObjects(roots);
});

test('exported cloth stays pinned and animates continuously without nonfinite vertices', () => {
  const original = createFlag();
  const flag = new THREE.ObjectLoader().parse(original.toJSON());
  const cloth = flag.getObjectByName('flag-cloth');
  const position = cloth.geometry.getAttribute('position');
  const rest = cloth.geometry.getAttribute('restPosition');
  assert.ok(position.count >= 300);
  assert.equal(cloth.material.flatShading, false);
  let previous;
  let moved = false;
  for (let frame = 0; frame < 120; frame++) {
    updateAssetAnimations(flag, frame / 60, 0.6);
    const current = position.array.slice();
    for (let i = 0; i < current.length; i++) {
      assert.ok(Number.isFinite(current[i]));
      if (previous) {
        const delta = Math.abs(current[i] - previous[i]);
        assert.ok(delta < 0.006, '60fps cloth motion should have no jumps');
        moved ||= delta > 0.0001;
      }
    }
    for (let i = 0; i < position.count; i++) {
      if (Math.abs(rest.getX(i)) > 1e-7) continue;
      assert.ok(Math.abs(position.getX(i)) < 1e-7);
      assert.ok(Math.abs(position.getY(i) - rest.getY(i)) < 1e-7);
      assert.ok(Math.abs(position.getZ(i)) < 1e-7);
    }
    previous = current;
  }
  assert.ok(moved);
  disposeObjects(original);
  disposeObjects(flag);
});

test('tree variants stay grounded, finite, compact and batched', () => {
  for (let variant = 0; variant < 8; variant++) {
    const tree = createTree(variant);
    assert.equal(tree.children.filter((child) => child.isMesh).length, 1);
    const bounds = new THREE.Box3().setFromObject(tree);
    const size = bounds.getSize(new THREE.Vector3());
    assert.ok(bounds.min.y < 0 && bounds.min.y > -0.2);
    assert.ok(size.x < 2.25 && size.z < 2.25 && size.y > 2.2 && size.y < 3.05);
    tree.traverse((child) => {
      if (!child.isMesh) return;
      for (const coordinate of child.geometry.getAttribute('position').array)
        assert.ok(Number.isFinite(coordinate));
    });
    disposeObjects(tree);
  }
});

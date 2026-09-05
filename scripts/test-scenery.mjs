import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  createIslandCliff,
  createBeach,
  createSeabed,
  TERRAIN,
} from '../lib/three/terrain.ts';
import { createScenery } from '../lib/three/scenery.ts';
import {
  createOcean,
  sampleWave,
  sampleWaveNormal,
  SEA_LEVEL,
  createOceanNormalMap,
} from '../lib/three/ocean.ts';
import {
  BACKGROUND_PRESETS,
  createBackgroundScenery,
  createStoneArch,
} from '../lib/three/background-scenery.ts';
import { disposeObjects } from '../lib/three/asset-kit.ts';
import { createUnderwaterScenery } from '../lib/three/underwater-scenery.ts';

test('underwater scenery stays submerged and seagrass is planted on the seabed', () => {
  const floor = createSeabed(),
    reef = createUnderwaterScenery(floor);
  const plants = reef.group.children.filter((o) => o.name === 'seagrass');
  assert.equal(plants.length, 18);
  const ray = new THREE.Raycaster();
  for (const plant of plants) {
    ray.set(
      new THREE.Vector3(plant.position.x, SEA_LEVEL, plant.position.z),
      new THREE.Vector3(0, -1, 0),
    );
    const hit = ray.intersectObject(floor, false)[0];
    assert.ok(hit);
    assert.ok(Math.abs(plant.position.y - hit.point.y - 0.012) < 1e-6);
  }
  for (const time of [0, 1, 10, 60]) {
    reef.update(time);
    reef.group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(reef.group);
    assert.ok(bounds.max.y < SEA_LEVEL - 0.5);
    reef.group.traverse((o) => {
      if (!o.isMesh) return;
      assert.ok(
        Array.from(o.geometry.attributes.position.array).every(Number.isFinite),
      );
    });
  }
  reef.dispose();
  disposeObjects(floor);
});

test('beach continues into a matching deep seabed without an exposed outer edge', () => {
  const beach = createBeach(),
    floor = createSeabed();
  const edge = beach.geometry.attributes.position,
    join = floor.geometry.attributes.position;
  const a = new THREE.Vector3(),
    b = new THREE.Vector3();
  for (let i = 0; i < 160; i++) {
    a.fromBufferAttribute(edge, edge.count - 160 + i);
    b.fromBufferAttribute(join, i);
    assert.ok(a.distanceTo(b) < 1e-6);
  }
  floor.geometry.computeBoundingBox();
  assert.ok(
    Math.abs(floor.geometry.boundingBox.min.y - (SEA_LEVEL - 2.5)) < 0.01,
  );
  assert.ok(floor.geometry.boundingBox.max.x > 1900);
  disposeObjects(beach);
  disposeObjects(floor);
});

test('stone arch has an open passage and supported stone on either side', () => {
  const arch = createStoneArch();
  arch.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  ray.set(new THREE.Vector3(0, 1.2, 4), new THREE.Vector3(0, 0, -1));
  assert.equal(ray.intersectObject(arch, true).length, 0);
  for (const [x, y] of [
    [-1.48, 0.5],
    [1.48, 0.5],
    [0, 2.5],
  ]) {
    ray.set(new THREE.Vector3(x, y, 4), new THREE.Vector3(0, 0, -1));
    assert.ok(ray.intersectObject(arch, true).length > 0);
  }
  disposeObjects(arch);
});

test('background presets are reproducible, variable, finite and outside the playable island', () => {
  for (const preset of BACKGROUND_PRESETS) {
    const first = createBackgroundScenery(preset.id, 17),
      same = createBackgroundScenery(preset.id, 17),
      next = createBackgroundScenery(preset.id, 18);
    assert.deepEqual(first.shorelines, same.shorelines);
    assert.notDeepEqual(first.shorelines, next.shorelines);
    assert.equal(first.shorelines.length, 3);
    first.group.updateMatrixWorld(true);
    const point = new THREE.Vector3();
    first.group.traverse((object) => {
      if (!object.isMesh) return;
      const positions = object.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        point
          .fromBufferAttribute(positions, i)
          .applyMatrix4(object.matrixWorld);
        assert.ok(point.toArray().every(Number.isFinite));
        assert.ok(
          Math.abs(point.x) > 5.4 || Math.abs(point.z) > 5.4,
          'backdrop must stay off the main island',
        );
      }
    });
    first.dispose();
    same.dispose();
    next.dispose();
  }
});

test('three ocean normal fields differ and decode to normalized upward-facing normals', () => {
  const maps = [11, 29, 47].map(createOceanNormalMap);
  assert.notDeepEqual(maps[0].image.data, maps[1].image.data);
  assert.notDeepEqual(maps[1].image.data, maps[2].image.data);
  for (const texture of maps) {
    assert.equal(texture.wrapS, THREE.RepeatWrapping);
    const data = texture.image.data;
    for (let i = 0; i < data.length; i += 4 * 127) {
      const x = (data[i] / 255) * 2 - 1,
        z = (data[i + 1] / 255) * 2 - 1,
        y = (data[i + 2] / 255) * 2 - 1;
      assert.ok(y > 0.5);
      assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 0.014);
    }
    texture.dispose();
  }
});

test('composed scenery never enters the playable board volume', () => {
  const cliff = createIslandCliff(),
    scene = createScenery(cliff);
  scene.updateMatrixWorld(true);
  const violations = [];
  scene.traverse((o) => {
    if (!o.isMesh || o.userData.noDofDepth) return;
    const p = o.geometry.attributes.position,
      v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      if (
        Math.abs(v.x) < 4.025 &&
        Math.abs(v.z) < 4.025 &&
        v.y > TERRAIN.topY + 0.025
      ) {
        violations.push({
          owner: o.parent.name,
          object: o.name,
          point: v.toArray(),
        });
        break;
      }
    }
  });
  assert.deepEqual(violations, [], 'scenery intrudes into a cell');
  disposeObjects(scene);
  disposeObjects(cliff);
});

test('cliff roots belong to trees and remain fitted to the actual cliff surface', () => {
  const cliff = createIslandCliff(),
    scene = createScenery(cliff);
  scene.updateMatrixWorld(true);
  cliff.updateMatrixWorld(true);
  let count = 0;
  const ray = new THREE.Raycaster();
  scene.traverse((o) => {
    if (o.name !== 'trunk-to-cliff-roots') return;
    count++;
    const tree = o.parent;
    assert.equal(tree.name, 'tree-mossbound');
    const trunk = tree.getWorldPosition(new THREE.Vector3());
    const out = new THREE.Vector3(0, 0, 1).transformDirection(tree.matrixWorld);
    for (const strand of o.children) {
      const points = strand.userData.rootPath.map((p) =>
        tree.localToWorld(new THREE.Vector3(...p)),
      );
      assert.ok(
        points[0].distanceTo(trunk) < 0.15,
        'root must originate in trunk',
      );
      for (const p of points.slice(2)) {
        const start = p.clone().addScaledVector(out, 2);
        ray.set(start, out.clone().negate());
        const hit = ray.intersectObject(cliff, false)[0];
        assert.ok(hit);
        assert.ok(
          p.distanceTo(hit.point) < 0.07,
          'root cannot hang away from cliff',
        );
      }
    }
  });
  assert.equal(count, 2);
  disposeObjects(scene);
  disposeObjects(cliff);
});

test('ocean spans beyond all permitted camera views and normals match its displacement', () => {
  const ocean = createOcean();
  const surface = ocean.group.getObjectByName('analytic-wave-surface');
  surface.geometry.computeBoundingBox();
  assert.ok(surface.geometry.boundingBox.max.x >= 1999);
  assert.ok(surface.geometry.boundingBox.max.z >= 1999);
  for (const t of [0, 0.3, 1.1, 6, 18])
    for (const [x, z] of [
      [-7, 2],
      [8, 9],
      [38, 17],
    ]) {
      const eps = 0.001;
      const nx =
        (sampleWave(x + eps, z, t) - sampleWave(x - eps, z, t)) / (2 * eps);
      const nz =
        (sampleWave(x, z + eps, t) - sampleWave(x, z - eps, t)) / (2 * eps);
      const numeric = new THREE.Vector3(-nx, 1, -nz).normalize();
      assert.ok(numeric.distanceTo(sampleWaveNormal(x, z, t)) < 1e-6);
      assert.ok(Math.abs(sampleWave(x, z, t) - SEA_LEVEL) < 0.25);
    }
  ocean.dispose();
});

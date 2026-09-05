import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { restoreDioramaSurfaces } from '../lib/three/surface-material.ts';

const directory = new URL('../public/assets/shared/', import.meta.url);
const files = (await readdir(directory)).filter((name) =>
  name.endsWith('.json'),
);
test('shared kit contains all twenty-two intended assets', () =>
  assert.equal(files.length, 22));
for (const file of files) {
  test(`${file} loads with ObjectLoader and has usable geometry`, async () => {
    const source = JSON.parse(await readFile(new URL(file, directory), 'utf8'));
    const object = new THREE.ObjectLoader().parse(source);
    restoreDioramaSurfaces(object);
    let meshes = 0;
    object.traverse((child) => {
      if (!child.isMesh) return;
      meshes++;
      for (const material of Array.isArray(child.material)
        ? child.material
        : [child.material]) {
        if (material.userData.dioramaSurface) {
          assert.equal(
            material.customProgramCacheKey(),
            'minebreak-crafted-surface-v2',
          );
          assert.equal(material.roughness, 0.72);
        }
      }
      assert.ok(child.geometry.attributes.position.count > 0);
      for (const v of child.geometry.attributes.position.array)
        assert.ok(Number.isFinite(v));
    });
    assert.ok(meshes > 0);
    assert.ok(
      meshes <= 12,
      'detail should be batched into a small number of draw calls',
    );
    const bounds = new THREE.Box3().setFromObject(object);
    assert.ok(!bounds.isEmpty());
    assert.ok(bounds.getSize(new THREE.Vector3()).length() < 20);
    assert.equal(object.name, file.replace('.json', ''));
  });
}

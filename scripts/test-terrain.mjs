import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  createIslandCliff,
  createCliffSection,
  createBeach,
  createFloatingRocks,
  shorelineRadius,
  TERRAIN,
} from '../lib/three/terrain.ts';

function assertFiniteGeometry(mesh) {
  const { geometry } = mesh;
  for (const value of geometry.attributes.position.array)
    assert.ok(Number.isFinite(value));
  const box = new THREE.Box3().setFromBufferAttribute(
    geometry.attributes.position,
  );
  assert.ok(!box.isEmpty());
}

function assertClosed(geometry) {
  const edges = new Map(),
    connections = new Map();
  const indices = geometry.index.array;
  const positions = geometry.attributes.position;
  const a3 = new THREE.Vector3(),
    b3 = new THREE.Vector3(),
    c3 = new THREE.Vector3();
  let volume = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = [indices[i], indices[i + 1], indices[i + 2]];
    assert.equal(new Set(triangle).size, 3, 'no degenerate indexed triangle');
    a3.fromBufferAttribute(positions, triangle[0]);
    b3.fromBufferAttribute(positions, triangle[1]);
    c3.fromBufferAttribute(positions, triangle[2]);
    volume += a3.dot(b3.cross(c3)) / 6;
    for (let j = 0; j < 3; j++) {
      const a = triangle[j],
        b = triangle[(j + 1) % 3],
        key = `${Math.min(a, b)},${Math.max(a, b)}`;
      const edge = edges.get(key) ?? { count: 0, direction: 0 };
      edge.count++;
      edge.direction += a < b ? 1 : -1;
      edges.set(key, edge);
      if (!connections.has(a)) connections.set(a, []);
      connections.get(a).push(b);
    }
  }
  for (const edge of edges.values()) {
    assert.equal(edge.count, 2, 'each edge belongs to precisely two faces');
    assert.equal(edge.direction, 0, 'adjacent face winding agrees');
  }
  const visited = new Set(),
    queue = [0];
  while (queue.length) {
    const vertex = queue.pop();
    if (visited.has(vertex)) continue;
    visited.add(vertex);
    queue.push(...connections.get(vertex));
  }
  assert.equal(
    visited.size,
    geometry.attributes.position.count,
    'one connected mesh',
  );
  assert.ok(volume > 0, 'outward-facing winding encloses positive volume');
}

test('island is one finite watertight indexed cliff with a board-safe top', () => {
  const cliff = createIslandCliff();
  assertFiniteGeometry(cliff);
  assertClosed(cliff.geometry);
  assert.equal(cliff.children.length, 0);
  assert.ok(Math.abs(cliff.geometry.boundingBox.max.y - TERRAIN.topY) < 1e-6);
  assert.ok(
    Math.abs(cliff.geometry.boundingBox.min.y - TERRAIN.bottomY) < 1e-6,
  );
  assert.ok(cliff.geometry.boundingBox.max.x > 5);
  assert.ok(
    cliff.geometry.boundingBox.max.y < -0.12,
    'no cliff vertex intrudes into tile playing surfaces',
  );
});

test('flat cliff cap supports the full board through ±4 with no top-plane penetrations', () => {
  const cliff = createIslandCliff();
  cliff.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  for (let x = -4; x <= 4; x += 0.5) {
    for (let z = -4; z <= 4; z += 0.5) {
      raycaster.set(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0));
      const hit = raycaster.intersectObject(cliff, false)[0];
      assert.ok(hit, `board point (${x},${z}) must have supporting ground`);
      assert.ok(
        Math.abs(hit.point.y - TERRAIN.topY) < 1e-6,
        'deck is one flat level, without protruding rock tips',
      );
      assert.ok(
        hit.point.y < 0.022 - 0.14,
        'clear separation below revealed stone surfaces',
      );
    }
  }
});

test('cliff sections are closed and neighboring sections have identical seams across seeds', () => {
  const left = createCliffSection(17),
    right = createCliffSection(71);
  assertFiniteGeometry(left);
  assertClosed(left.geometry);
  assertClosed(right.geometry);
  const n = left.userData.profileVertices,
    end = left.userData.divisions * n;
  const a = left.geometry.attributes.position,
    b = right.geometry.attributes.position;
  for (let i = 0; i < n; i++) {
    assert.equal(a.getX(end + i), b.getX(i) + TERRAIN.sectionWidth);
    assert.equal(a.getY(end + i), b.getY(i));
    assert.equal(a.getZ(end + i), b.getZ(i));
  }
});

test('sand meets the shared wave shoreline at sea level and slopes underwater', () => {
  const beach = createBeach();
  assertFiniteGeometry(beach);
  const p = beach.geometry.attributes.position;
  for (let i = 0; i < 160; i++) {
    const index = 4 * 160 + i;
    assert.ok(Math.abs(p.getY(index) - TERRAIN.seaLevel) < 1e-6);
    assert.ok(
      Math.abs(
        Math.hypot(p.getX(index), p.getZ(index)) -
          shorelineRadius((i / 160) * Math.PI * 2),
      ) < 1e-6,
    );
  }
  assert.ok(beach.geometry.boundingBox.min.y < TERRAIN.seaLevel);
  assert.ok(beach.geometry.boundingBox.max.y > TERRAIN.seaLevel);
  assert.ok(
    beach.geometry.boundingBox.max.y < -2.3,
    'sand cannot protrude through upper cliff or game deck',
  );
});

test('twelve deterministic rocks form four sparse groups outside gameplay', () => {
  const a = createFloatingRocks(5),
    b = createFloatingRocks(5);
  const rockA = a.group.children[0],
    rockB = b.group.children[0];
  assert.equal(rockA.count, 12);
  assert.deepEqual(rockA.instanceMatrix.array, rockB.instanceMatrix.array);
  const before = [...rockA.instanceMatrix.array];
  a.update(2);
  assert.notDeepEqual([...rockA.instanceMatrix.array], before);
  const m = new THREE.Matrix4(),
    p = new THREE.Vector3();
  for (let i = 0; i < rockA.count; i++) {
    rockA.getMatrixAt(i, m);
    p.setFromMatrixPosition(m);
    assert.ok(Math.max(Math.abs(p.x), Math.abs(p.z)) > 6.7);
    for (const value of m.elements) assert.ok(Number.isFinite(value));
  }
});

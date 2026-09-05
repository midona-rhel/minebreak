import { mkdir, writeFile } from 'node:fs/promises';
import {
  createTile,
  createFlag,
  createCrystal,
  createLantern,
  createPortal,
  createCliff,
  createBridge,
  createFoliage,
  createRoots,
  createTree,
  disposeObjects,
} from '../lib/three/asset-kit.ts';
import {
  createIslandCliff,
  createCliffSection,
  createBeach,
} from '../lib/three/terrain.ts';

// Three.js ObjectLoader JSON: portable geometry/materials, no texture dependencies.
const output = new URL('../public/assets/shared/', import.meta.url);
await mkdir(output, { recursive: true });
const assets = {
  'tile-moss': createTile(true),
  'tile-stone': createTile(false),
  'flag-coral': createFlag(),
  'crystal-cluster': createCrystal(),
  'lantern-stone': createLantern(),
  'portal-teal': createPortal(),
  'cliff-block': createCliff(),
  'bridge-wood': createBridge(),
  foliage: createFoliage(),
  roots: createRoots(),
  'tree-mossbound': createTree(),
  'island-cliff': createIslandCliff(),
  'cliff-section': createCliffSection(),
  'beach-sand': createBeach(),
};
for (const [name, asset] of Object.entries(assets)) {
  asset.name = name;
  // Serialize custom rounded boxes as standard BufferGeometry for ObjectLoader.
  asset.traverse((o) => {
    if (o.isMesh && o.geometry.type === 'RoundedBoxGeometry') {
      const previous = o.geometry;
      o.geometry = previous.clone();
      o.geometry.type = 'BufferGeometry';
      delete o.geometry.parameters;
      previous.dispose();
    }
  });
  await writeFile(
    new URL(`${name}.json`, output),
    JSON.stringify(asset.toJSON()),
  );
  disposeObjects(asset);
}
console.log(`Exported ${Object.keys(assets).length} Three.js assets.`);

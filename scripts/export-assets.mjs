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
  createMushroomPatch,
  createMossBoulder,
  createRoots,
  createRuneWaystone,
  createTree,
  disposeObjects,
} from '../lib/three/asset-kit.ts';
import {
  createIslandCliff,
  createCliffSection,
  createBeach,
} from '../lib/three/terrain.ts';
import {
  createStoneArch,
  createWatchtower,
  createBackdropCliff,
} from '../lib/three/background-scenery.ts';
import {
  createSeagrass,
  createReefCoral,
} from '../lib/three/underwater-scenery.ts';

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
  'mushroom-patch': createMushroomPatch(),
  'moss-boulder': createMossBoulder(),
  roots: createRoots(),
  'rune-waystone': createRuneWaystone(),
  'tree-mossbound': createTree(),
  'island-cliff': createIslandCliff(),
  'cliff-section': createCliffSection(),
  'beach-sand': createBeach(),
  'stone-arch': createStoneArch(),
  watchtower: createWatchtower(),
  'backdrop-cliff': createBackdropCliff(),
  seagrass: createSeagrass(),
  'reef-coral': createReefCoral(),
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

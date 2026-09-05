# Shared assets

Harness/assets maintainers provide reusable visuals. Minigame developers own any game-specific requests and integration.

## Direction

The reference direction is a colorful fantasy diorama: chunky stone, mossy grass, faceted crystals, coral flags, teal portals, warm light, and cool shadows. The overworld now uses the first procedural kit in a real Three.js scene. Parchment and wood-styled interface surfaces match it. See `docs/art-direction.md` for studies and palette.

## Available now

Concept images are in `public/concepts/`. They are visual references, not ready-to-use tile textures, sprites, or 3D models. Do not present them as a completed runtime asset pack.

The runtime kit is authored in `lib/three/asset-kit.ts` and `lib/three/terrain.ts`. Fourteen portable ObjectLoader JSON exports are in `public/assets/shared/`: `tile-moss`, `tile-stone`, `flag-coral`, `crystal-cluster`, `lantern-stone`, `portal-teal`, `cliff-block`, `bridge-wood`, `foliage`, `roots`, `tree-mossbound`, `island-cliff`, `cliff-section`, and `beach-sand`. The old `cliff-block` remains for compatibility; the overworld uses the new continuous cliff.

All fourteen are original procedural geometry authored for this project; no downloaded models or textures are embedded. Project licensing applies (no separate asset license has been granted). The reference guides style, not copied mesh or texture content.

Coordinates are Y-up. One grid tile occupies 1 world unit, with its center at X/Z origin and the ground near Y=0. Flag height is approximately 1 unit, crystal clusters and lanterns 1.5 units, and the bridge about 1.5 × 2.3 units including railings. Cliff blocks and roots extend below the ground. Tiles include irregular beveled edges, moss patches, leaves and etched stone cracks; scenery includes layered fractured rocks, prism crystals, masonry lanterns and a rope bridge with woodgrain and fasteners.

Opaque geometry is batched into one vertex-colored mesh per asset; glass, emissive surfaces and animated cloth remain separate. Each exported model stays within twelve meshes. Crystals use closed six-sided physical-transmission prisms, a shared color per cluster and outward growth directions. Flags keep smooth 24×12 cloth separate from the pole. Roots, trunks and branches taper to their tips. Seeded tile and cliff variants keep a repeatable layout without identical surface detailing.

```ts
import { ObjectLoader } from 'three';
const asset = await new ObjectLoader().loadAsync(
  '/assets/shared/crystal-cluster.json',
);
scene.add(asset);
```

For procedural use, import a `create*` factory from `lib/three/asset-kit.ts`. Each call owns its resources; dispose geometries, materials, and textures when removing the complete owner. Lanterns, crystals and portals include point lights; crystals and portals include texture-free glow shaders. Call `updateAssetAnimations(flag, elapsedSeconds)` for exported cloth animation; its rest-position attribute survives ObjectLoader loading. Crystal refraction needs a scene environment; the overworld generates one with PMREM and uses restrained bloom.

Terrain uses Y-up with a board foundation exactly at Y=-0.23 and sea level Y=-2.65. The single watertight island mesh supports the full 8×8 grid without protruding into tiles. `createCliffSection(seed)` creates a closed two-unit-wide module with matching left/right boundaries; adjacent variants can tile along X. Trees are approximately 1.5×2.6×1.5 units. Place border prop ground baselines at the terrain top, not at tile-cover height.

`lib/three/ocean.ts` supplies animated analytic waves, matching wave normals, shoreline foam, 144 crest-synchronized splash droplets, and bounded raymarched sunlight/mist. Its shoreline shares the terrain's beach contour. `lib/three/scene-effects.ts` supplies environment reflections, bloom and distant depth of field with a sharp focal band around the playable board. `createFloatingRocks()` batches 44 hovering fragments. These animated scene factories return update/disposal functions rather than static asset exports.

Run `npm run assets:export` after changing the kit and `npm run assets:test` to verify the exported assets load correctly. Three.js JSON was chosen for a texture-free starter handoff; the kit does not yet include GLB exports.

## Asset handoff

Put shared runtime assets under `public/assets/shared/` and module-specific assets under `public/assets/minigames/<module-id>/`. Use descriptive stable filenames. For each delivered asset, record its path, purpose, source or creator, usage rights, and scale/dimensions. Prefer GLB for 3D models and PNG/WebP for raster assets.

Further asset work can add hand-painted textures or GLB variants. These are shared visuals, not minigame mechanics or assignments.

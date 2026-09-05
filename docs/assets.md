# Shared assets

Harness/assets maintainers provide reusable visuals. Minigame developers own any game-specific requests and integration.

## Direction

The reference direction is a colorful fantasy diorama: chunky stone, mossy grass, faceted crystals, coral flags, teal portals, warm light, and cool shadows. The overworld now uses the first procedural kit in a real Three.js scene. Parchment and wood-styled interface surfaces match it. See `docs/art-direction.md` for studies and palette.

## Available now

Concept images are in `public/concepts/`. They are visual references, not ready-to-use tile textures, sprites, or 3D models. Do not present them as a completed runtime asset pack.

The runtime kit is authored in `lib/three/asset-kit.ts`, `lib/three/terrain.ts`, `lib/three/background-scenery.ts`, and `lib/three/underwater-scenery.ts`; `lib/three/scenery.ts` composes its grounded landmarks. Twenty-two portable ObjectLoader JSON exports are in `public/assets/shared/`: `tile-moss`, `tile-stone`, `flag-coral`, `crystal-cluster`, `lantern-stone`, `portal-teal`, `cliff-block`, `bridge-wood`, `foliage`, `mushroom-patch`, `moss-boulder`, `roots`, `rune-waystone`, `tree-mossbound`, `island-cliff`, `cliff-section`, `beach-sand`, `stone-arch`, `watchtower`, `backdrop-cliff`, `seagrass`, and `reef-coral`. The old `cliff-block` remains for compatibility; the overworld uses the new continuous cliff.

All twenty-two models are original procedural geometry authored for this project; no downloaded models are embedded. The separate `diorama-material-atlas.png` is AI-generated moss, limestone, slate and oak surface artwork. Its provenance and exact built-in imagegen prompt are recorded in `docs/material-atlas.md`. Project licensing applies (no separate asset license has been granted). The reference guides style, not copied mesh or texture content.

Coordinates are Y-up. One grid tile occupies 1 world unit, with its center at X/Z origin and the ground near Y=0. Flag height is approximately 1 unit, crystal clusters and lanterns 1.5 units, and the bridge about 1.5 × 2.3 units including railings. Cliff blocks and roots extend below the ground. Tiles include irregular beveled edges, moss patches, leaves and etched stone cracks; scenery includes layered fractured rocks, prism crystals, masonry lanterns and a rope bridge with woodgrain and fasteners.

Opaque geometry is batched into one vertex-colored mesh per asset while preserving authored bevel normals; glass, emissive surfaces and animated cloth remain separate. Each exported model stays within twelve meshes. Crystals use closed hexagonal physical-transmission prisms with additional narrow chamfer faces, a shared color per cluster and outward growth directions. Flags keep smooth 24×12 cloth separate from the pole. Roots, trunks and branches taper to their tips. Seeded tile and cliff variants keep a repeatable layout without identical surface detailing.

```ts
import { ObjectLoader } from 'three';
const asset = await new ObjectLoader().loadAsync(
  '/assets/shared/crystal-cluster.json',
);
scene.add(asset);
```

For the full runtime surface treatment, call `restoreDioramaSurfaces(asset)` and `bindDioramaAtlas(asset, atlasTexture)` from `lib/three/surface-material.ts`. Load the atlas once with `TextureLoader`, assign `SRGBColorSpace`, and share it among assets. Plain ObjectLoader still supplies all geometry and base vertex colors; custom shader hooks must be restored explicitly because Three.js JSON does not serialize functions. Dispose the shared atlas only when its final owner is removed.

For procedural use, import a `create*` factory from `lib/three/asset-kit.ts`. Each call owns its resources; dispose geometries, materials, and textures when removing the complete owner. Lanterns, crystals and portals include point lights; crystals and portals include texture-free glow shaders. Call `updateAssetAnimations(flag, elapsedSeconds)` for exported cloth animation; its rest-position attribute survives ObjectLoader loading. Crystal refraction needs a scene environment; the overworld generates one with PMREM and uses restrained bloom.

Terrain uses Y-up with a board foundation exactly at Y=-0.23 and sea level Y=-2.65. The single watertight island mesh supports the full 8×8 grid without protruding into tiles. `createCliffSection(seed)` creates a closed two-unit-wide module with matching left/right boundaries; adjacent variants can tile along X. Trees are approximately 1.5×2.6×1.5 units. Place border prop ground baselines at the terrain top, not at tile-cover height.

`lib/three/ocean.ts` supplies five-direction animated analytic waves, three independently moving noise-normal maps, planar scene reflections, depth-aware scene-color refraction and Beer–Lambert water absorption, broken shoreline foam, crest-gated splash droplets, and bounded raymarched sunlight/mist. Its shoreline shares the terrain's beach contour and accepts additional backdrop shorelines. This is an analytic water shader, not a fluid simulation. `lib/three/scene-effects.ts` supplies environment reflections, short-range GTAO contact shading, bloom and distant depth of field with a sharp focal band around the playable board. Transparent optical effects are excluded from the AO and focus depth passes. `createFloatingRocks()` batches twelve fragments into four sparse formations. These animated scene factories return update/disposal functions rather than static asset exports.

`createSeabed()` joins the beach's outer ring exactly and slopes to a broad sandy floor at Y=-5.15, 2.5 world units beneath the mean water surface. `createUnderwaterScenery(seabed, seed)` raycasts onto that floor to plant six rock/coral groups, eighteen gently swaying seagrass patches, and four broken column drums. Call its `update(seconds)` each frame, or pass zero for reduced motion. Seagrass is about 0.5–1 unit tall; coral is about 0.7 units tall. Both also have standalone reusable exports. The large seabed and complete underwater composition are runtime-only factories.

`createBackgroundScenery(preset, seed)` supplies Ancient archipelago, Stone arch coast, and Watchtower cliffs compositions. Arches have open passages and beveled masonry; towers have stacked brick courses and a lantern crown. Backdrop pillars continue below the seabed. The overworld uses Ancient archipelago with seed 17; the scenery selector and shuffle overlay have been removed. Other presets remain available through the reusable factory. Identical seeds reproduce placements.

Run `npm run assets:export` after changing the kit and `npm run assets:test` to verify the exported assets load correctly. Three.js JSON was chosen for a texture-free starter handoff; the kit does not yet include GLB exports.

## Asset handoff

Put shared runtime assets under `public/assets/shared/` and module-specific assets under `public/assets/minigames/<module-id>/`. Use descriptive stable filenames. For each delivered asset, record its path, purpose, source or creator, usage rights, and scale/dimensions. Prefer GLB for 3D models and PNG/WebP for raster assets.

Further asset work can add hand-painted textures or GLB variants. These are shared visuals, not minigame mechanics or assignments.

The current renderer also uses a warm area light for broad bevel highlights, a 4096-pixel directional shadow map, tinted environment reflections, multisampled scene targets, and one short-range screen-space diffuse bounce. This indirect-light pass gathers visible neighboring surfaces using the GTAO depth/normal buffer; it is not full path-traced GI and cannot account for offscreen geometry.

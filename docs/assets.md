# Shared assets

Harness/assets maintainers provide reusable visuals. Minigame developers own any game-specific requests and integration.

## Direction

The reference direction is a colorful fantasy diorama: chunky stone, mossy grass, faceted crystals, coral flags, teal portals, warm light, and cool shadows. See `docs/art-direction.md` for board studies and palette. The existing dark interface is a temporary harness skin; the fantasy art has not yet been implemented in the renderer.

## Available now

Concept images are in `public/concepts/`. They are visual references, not ready-to-use tile textures, sprites, or 3D models. Do not present them as a completed runtime asset pack.

## Asset handoff

Put shared runtime assets under `public/assets/shared/` and module-specific assets under `public/assets/minigames/<module-id>/`. Use descriptive stable filenames. For each delivered asset, record its path, purpose, source or creator, usage rights, and scale/dimensions. Prefer GLB for 3D models and PNG/WebP for raster assets.

Planned shared kit: covered/revealed tiles, flags, portal, cliff border, crystals, grass, and lanterns. These describe reusable assets, not minigame mechanics or developer assignments.

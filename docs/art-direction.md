# Minebreak art direction

## Board silhouette

The current direction follows the fantasy diorama reference: a miniature island in a scenic ocean, with chunky moss-covered tiles, continuous fractured cliffs, sand, trees, single-color refractive crystal clusters, coral cloth flags, glowing teal portals, lanterns, and a wooden bridge. A restrained perspective camera can orbit and zoom; distant water softens outside the board's focal band. Earlier top-down studies remain reference alternatives. The playable grid stays clear of border decoration.

## Achievable Three.js build

- Build cells from chipped, beveled slabs with raised moss cover and recessed stone reveal. Add seeded moss clumps, tiny leaves, edge cracks and stone flecks without obscuring the numbers.
- Use a shared flat-shaded `MeshStandardMaterial` palette, warm directional light, and cool ambient/rim lighting.
- Render numbers as flat sprite or signed-distance-field text slightly above revealed cells.
- Each asset uses an independent group for reuse and export, with opaque detail merged into a vertex-colored mesh. Consider instancing repeated parts after profiling larger boards.
- Keep the board between 8×8 and 10×10 cells so it remains readable on mobile.
- Frame the grid with layered fractured stone. Restrict roots, crystal clusters, grass tufts and lanterns to the border so the playable cells stay clear.
- A triggered mine replaces its tile with a stone well, three emissive rings, floating motes, a radial glow shader and a turquoise point light.
- Use an orbitable perspective camera, warm key light, soft shadows, cool rim light, environment reflections, restrained bloom and depth of field. Keep the entire game board within a sharp focal band.
- Tiles, props and water must have deliberate surface ordering: flat foundation -0.23, tile tops above it, beach at the rock base, sea -2.65. Validate closed cliff topology, matching module seams, and top clearance before adding decoration.
- Crystal shards lean away from the cluster center; all pieces share one mineral color. Roots and branches taper, and animated cloth remains pinned along the pole.

## Gameplay readability

- Covered: moss green, raised, soft highlight.
- Revealed: warm stone, recessed, dark inset border.
- Flagged: coral pennant with a strong triangular silhouette.
- Triggered: teal or enemy-colored glow from below.
- Hovered: pale outline and a small vertical lift.
- Disabled: lower saturation and no glow.

## Palette

| Role    | Color     |
| ------- | --------- |
| Grass   | `#8DAA20` |
| Stone   | `#B9A27B` |
| Portal  | `#18D9D0` |
| Warning | `#F04E3E` |
| Crystal | `#AE55E8` |
| Shadow  | `#1D2741` |

Studies are stored at `public/concepts/`. Runtime source assets live in `lib/three/asset-kit.ts` with portable exports in `public/assets/shared/`.

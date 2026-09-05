# Minebreak art direction

## Board silhouette

The current direction follows the fantasy diorama reference: a floating island seen through an angled orthographic camera, with chunky moss-covered tiles, warm stone, faceted crystals, coral flags, glowing teal portals, lanterns, and a wooden bridge. Earlier top-down studies remain reference alternatives. The playable grid stays clear of border decoration.

## Achievable Three.js build

- Build cells from chipped, beveled slabs with raised moss cover and recessed stone reveal. Add seeded moss clumps, tiny leaves, edge cracks and stone flecks without obscuring the numbers.
- Use a shared flat-shaded `MeshStandardMaterial` palette, warm directional light, and cool ambient/rim lighting.
- Render numbers as flat sprite or signed-distance-field text slightly above revealed cells.
- Each asset uses an independent group for reuse and export, with opaque detail merged into a vertex-colored mesh. Consider instancing repeated parts after profiling larger boards.
- Keep the board between 8×8 and 10×10 cells so it remains readable on mobile.
- Frame the grid with layered fractured stone. Restrict roots, crystal clusters, grass tufts and lanterns to the border so the playable cells stay clear.
- A triggered mine replaces its tile with a stone well, three emissive rings, floating motes, a radial glow shader and a turquoise point light.
- Use an angled orthographic camera, a warm key light, soft shadows, and a cool rim light.

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

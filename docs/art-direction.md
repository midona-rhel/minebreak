# Minebreak art direction

## Board silhouette

The minefield is a flat square board shown from a fixed 90-degree top-down orthographic camera. It should read like clean 2D game art even though the tiles use simple 3D geometry. The grid fills the view and decoration never obscures a cell.

## Achievable Three.js build

- Build each cell from one shallow beveled box with two states: raised grass cover and recessed stone reveal.
- Use a shared `MeshToonMaterial` palette with one shadow step and one highlight step.
- Render numbers as flat sprite or signed-distance-field text slightly above revealed cells.
- Use instanced meshes for covered cells, revealed cells, flags, and repeated cliff blocks.
- Keep the board between 8×8 and 10×10 cells so it remains readable on mobile.
- Frame the grid with a reusable dark-stone border kit. Restrict roots, crystal clusters, grass tufts, and one lantern to the border so the playable cells stay clear.
- A triggered mine removes its tile top and reveals a circular portal made from two emissive rings and a simple particle emitter.
- Use one orthographic camera, one directional light, and short uniform shadows cast toward the lower right.

## Gameplay readability

- Covered: moss green, raised, soft highlight.
- Revealed: warm stone, recessed, dark inset border.
- Flagged: coral pennant with a strong triangular silhouette.
- Triggered: teal or enemy-colored glow from below.
- Hovered: pale outline and a small vertical lift.
- Disabled: lower saturation and no glow.

## Palette

| Role | Color |
| --- | --- |
| Grass | `#8DAA20` |
| Stone | `#B9A27B` |
| Portal | `#18D9D0` |
| Warning | `#F04E3E` |
| Crystal | `#AE55E8` |
| Shadow | `#1D2741` |

The current balanced top-down concept is stored at `public/concepts/minebreak-board-v3-balanced.png`. The simpler top-down study and earlier isometric exploration remain beside it for comparison.

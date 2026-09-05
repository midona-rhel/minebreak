# Minebreak

Minebreak is a browser-based Minesweeper roguelike. This repository provides the shared harness and asset foundation. Developers independently choose, design, and implement their minigames.

The harness currently includes a board, encounter lifecycle, basic run state, and local progress. No finished minigames are bundled. Until a developer registers a module, a mine opens test controls for success, failure, and cancellation.

## Direction

- Classic grid deduction as the main game loop
- Different mine types launch different minigames
- Run-based health, upgrades, floors, and risk/reward decisions
- Persistent unlocks between runs
- Three.js for the 3D game presentation
- React and Node tooling for a lightweight browser build

## Local development

```bash
npm install
npm run dev
```

Open the local URL printed by the development server.

## Collaboration

Work is organized through GitHub issues and short feature branches. Keep each pull request focused on one issue and include a brief test note.

## Ownership

- Harness/assets maintainers own startup, the shared board and state, module integration, and common assets.
- Each minigame developer owns their concept, mechanics, implementation, balance, and tests.
- Developers define their own minigame issues. The harness does not prescribe titles, genres, mechanics, or individual assignments.

See [the harness contract](docs/harness.md) for integration and [the asset guide](docs/assets.md) for shared visual resources.

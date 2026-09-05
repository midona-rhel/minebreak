# Minebreak

Minebreak is a browser-based Minesweeper roguelike. The minefield is the overworld: when a player triggers a mine, it launches one of several combat minigames. Surviving encounters grants upgrades that carry through the current run, while long-term progress is saved between runs.

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

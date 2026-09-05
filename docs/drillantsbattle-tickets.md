# Drillantsbattle tickets

Owner/reviewer: main Codex agent. Implementation is delegated within this task;
returned work is reviewed before acceptance. No external ticket service is used.

## Agreed rules

Fantasy ants spin on their stingers, carry at most six weapons, and fight in a
concave gladiator arena. Cursor following has momentum, tangential movement
relative to body rotation affects speed, and inward travel is faster than outward
travel. Spin regenerates on inward spirals opposite body rotation after a hit-free
delay. Higher spin favors a flatter recovery spiral. Zero spin loses;
losing the last weapon leaves the ant alive until its next hit. Kills drop loot.
Regular enemies have lower spin and avoid one another while pursuing the player.
Collisions hurt both ants simultaneously using pre-impact spin and relative
velocity. Total damage is combined spin times a tunable factor and impact term;
inverse spin shares favor the stronger ant. Fixed weapon modifiers then modify
damage dealt/received; sufficiently greater spin can outweigh weapon disadvantage.
Weapon loss is a separate random roll biased by resulting damage.

Formats: boss 1v1 with telegraphed special attacks; elimination reaches a kill
quota; survival reaches a kill quota then survives a countdown.

Initial tunable defaults: clockwise spin, pre-battle six-slot loadout, automatic
pickup into free slots. Shield > sword > whip > axe > shield; other pairs neutral.

## DB-01 — Simulation and combat (GPT-6 Astra)
Status: reviewed and accepted. Files: simulation.ts, simulation.test.ts.
Acceptance: deterministic seeded simulation; movement/slope/spin rules;
simultaneous collision formula; weapon matchups and random loss; next-hit unarmed
death; loot; meaningful invariant tests. Export createBattle(seed, format,
loadout, floor), stepBattle(state, target, dt), CONFIG, weaponAdvantage.

## DB-02 — Arena and game interface (GPT-5.6 Sol)
Status: reviewed and accepted. Files: index.tsx, arena.ts, drillantsbattle.module.css.
Acceptance: six-slot loadout and format selection; distinctive canvas concave pit
with spectator seating, six-limbed fantasy ants and readable weapons; pointer
following; spin/weapon/objective HUD; completion through MinigameProps; cleanup,
resizing and touch/keyboard alternative. Consume shared types and simulation API.

## DB-03 — Battle formats and opponent AI (GPT-6 Astra)
Status: reviewed and accepted. File: opponents.ts.
Acceptance: timed arrivals; enemy separation/player pursuit; boss telegraphed
dash; elimination quota; survival timer starts on kills; no boss reinforcements.
Export updateOpponents(state, dt), updateObjectives(state), spawnEnemy(state).
All use types.ts. Simulation owns movement integration, collisions and deaths;
opponents sets enemy velocities and schedules spawning/objectives.

## DB-04 — Integration, review and validation (main agent)
Status: reviewed and accepted. Register module; review every returned ticket against agreed
rules; fix defects; run simulation tests, type checking and production build.
Record results and remaining limitations here. No acceptance based only on an
agent's completion claim.

## Review results — 2026-09-05

- DB-01: Reviewed simultaneous pre-hit spin snapshots, kit modifiers, directional
  movement, loot and next-hit unarmed defeat. Revised impact to distinguish
  normal approach from glancing motion. Added configurable passive spin drain.
- DB-02: Reviewed lifecycle cleanup, pointer/touch/keyboard input and result
  reporting. Revised the visual stinger pivot, weapon footprint, typing, focus,
  instructions and unarmed warning.
- DB-03: Reviewed timed overlapping arrivals, separation, boss target lock,
  kill-triggered countdown and failure precedence; six persistent tests pass.
- DB-04: Fixed survival expiry racing a fatal collision in the same simulation
  step; added regression coverage. All 26 minigame tests pass. TypeScript passes; lint
  passes for the minigame and registry. Production build succeeds, with a
  non-blocking bundle-size warning. Existing host placeholder autoFocus triggers
  the repository accessibility lint rule; that pre-existing line was not changed.
- Merged origin/main at 80803ae into minigame/drillantsbattle without conflicts.
  The player-stat context and optional result patches remain compatible;
  all 17 harness player-stat tests also passed after the merge.
- Updated recovery and movement to share an inward spiral opposite body rotation.
  Tangential assistance scales with spin; tests cover both directions and power levels.
- Local page responds HTTP 200. Browser smoke checks confirmed board interaction,
  encounter setup, battle launch and cancellation back to the board. Full gameplay
  balance and every format's browser completion path remain for further playtesting.

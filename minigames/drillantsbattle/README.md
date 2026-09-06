# Drillants Battle

The module implements `MinigameProps`. The harness supplies the encounter seed,
floor and cell ID, and owns board health, rewards and persistence. The battle
reports one success/failure result; cancelling remains the host's responsibility.

## Tuning

Enemies primarily loop around the arena and make staggered attack adjustments.
RP strongly scales travel speed and steering response; low RP adds deterministic
wobble. Contact produces knockback with a short steering recovery window.
Dropped weapons expire after 10 seconds. RP at or below 0.5 exhausts an ant and
snaps to zero before regeneration. Deaths emit splats, moving ants emit bounded
dust particles, and wind visualizes RP and the actual recovery rate.

`simulation.ts` exports `CONFIG` for motion, directional slope effects, spin,
collision damage, weapon-loss rolls, pickup delay and objectives.
`opponents.ts` exports `OPPONENT_CONFIG` for enemy spin, arrivals, population,
steering and boss telegraphs/dashes. Initial values are playtest defaults.

Collision damage uses a snapshot of both ants' spin and movement before either
hit is applied. The combined spin is multiplied by a collision factor and impact
term, then each ant receives the fraction represented by its opponent's spin.
Weapon matchup multipliers modify the resulting damage: advantage 1.25,
disadvantage 0.8, neutral 1. Matchups are averaged across the two equipped kits.
Thus a fixed weapon multiplier can be outweighed by a large spin difference.
Each ant then rolls separately to lose one equipped weapon, biased by damage.

The cycle is shield > sword > whip > axe > shield; other pairings are neutral.
Losing the last weapon does not kill immediately: the next collision does,
unless a replacement weapon has been collected. Zero spin is immediately fatal.

## Checks

With Node 24 or another Node release supporting type stripping and registerHooks:

```sh
node --import ./minigames/drillantsbattle/test-loader.mjs --test minigames/drillantsbattle/simulation.test.ts minigames/drillantsbattle/opponents.test.ts
npx tsc --noEmit --incremental false
npm run build
```

Recovery follows an inward spiral opposite the ant's body rotation. Its inward
weight is fixed while its tangential weight increases with current spin fraction,
so low-spin ants must cut inward more sharply. Gain depends on actual velocity
alignment, requires inward and opposite-spin travel, and respects the hit delay.
Movement speed projects that same flow onto the cursor heading: aligned spirals
are fastest, stronger spin adds tangential assistance (and opposing resistance),
and the slope still makes inward movement faster than outward movement.
`spinDirection` is +1 clockwise or -1 counterclockwise; current loadouts start +1.

Playtest each format from a mine encounter. Check cursor momentum, spiral
regeneration, inward/outward speed, weapon pickup, dash avoidance, and returning
to the board after winning, losing or cancelling. Balance still needs human
playtesting; deterministic tests cannot judge how combat feels.

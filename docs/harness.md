# Minigame harness

Each developer decides what their minigame is. The common interface governs entering, returning final player stats, and leaving it.

## Register a module

Create `minigames/<your-id>/index.tsx` exporting a React component that accepts `MinigameProps` from `minigames/contract.ts`. Import it into `minigames/registry.ts` and add `{ id, title, Component }` to the `minigames` array. IDs must be unique.

The host mounts the component when a mine triggers. Selection is deterministic from the encounter seed. An empty registry opens a development placeholder, not an assigned game concept.

## Runtime contract

- `context` supplies `seed`, `floor`, `cellId`, and `player`. All fields, including nested player fields, are read-only and frozen at runtime.
- Call `complete({ outcome: 'success' })` or `complete({ outcome: 'failure' })` when finished.
- Call `cancel()` to return without rewards or damage; the triggering cell is hidden again.
- Only the first valid completion or cancellation is accepted. Calls after unmount are ignored.
- The host owns health, rewards, persistence, and board transitions. Modules must not mutate them directly.
- Render errors show a return-to-board fallback. Modules handle their own asynchronous errors.

Use effect cleanup to stop animation frames, timers, input handlers, audio, and dispose Three.js resources when unmounted. Work within the container provided by the host and support resizing. Minigames may use Three.js, canvas, or React controls as their developer chooses.

## Read main-loop player stats

The harness captures `context.player` when the mine triggers and keeps the same snapshot for the entire encounter. It is not a live subscription: subsequent board rewards/damage appear in the next encounter's snapshot. Cancelling and launching again captures fresh state.

| Field                           | Meaning                                                   |
| ------------------------------- | --------------------------------------------------------- |
| `health`, `maxHealth`           | Current and maximum run health                            |
| `xp`                            | Total run XP                                              |
| `level`                         | One-based run level, currently `Math.floor(xp / 100) + 1` |
| `upgrades.armor/repair/salvage` | Acquired upgrade counts for this run                      |
| `profile.shards`                | Persistent shard balance                                  |
| `profile.bestFloor`             | Highest unlocked floor across runs                        |
| `profile.totalDisarmed`         | Lifetime successfully completed mine encounters           |

```tsx
import type { MinigameProps } from '@/minigames/contract';

export default function YourMinigame({
  context,
  complete,
  cancel,
}: MinigameProps) {
  const { health, maxHealth, level, upgrades } = context.player;
  return (
    <section>
      <p>
        Health {health}/{maxHealth} · Level {level} · Armor {upgrades.armor}
      </p>
      {/* Your own mechanics may read these stats; never modify context.player. */}
      <button onClick={() => complete({ outcome: 'success' })}>Finish</button>
      <button onClick={cancel}>Return to board</button>
    </section>
  );
}
```

No state setters, storage handles, or board contents are exposed. Manage encounter-local stats within your component and optionally return their final values using `complete`, as below. Test fixtures that construct `MinigameProps` must include `context.player`; the harness helper `createEncounterContext` builds a complete frozen context.

## Return updated player stats

`complete` accepts optional `playerStats`: a partial set of **final absolute values**, not deltas. The snapshot stays read-only; the harness validates and applies the submitted values once when the encounter ends.

```tsx
complete({
  outcome: 'success',
  playerStats: {
    health: Math.max(0, localHealth),
    xp: context.player.xp + earnedXP,
    upgrades: { armor: context.player.upgrades.armor + 1 },
  },
});
```

- Supply only the fields your minigame owns. An explicit `health` replaces normal failure damage; an explicit `xp` replaces normal success XP. They are not applied twice.
- Omitted or invalid fields keep the normal outcome behavior: success grants the harness reward; failure deals armor-adjusted damage. Other stats stay unchanged.
- Writable integer ranges: `health` 0–100, `maxHealth` 1–100, `xp` 0–1,000,000,000, and each `upgrades.armor/repair/salvage` 0–100. Strings, fractions, non-finite numbers, out-of-range values, and malformed containers are ignored independently. Zero is valid except for `maxHealth`.
- Health is clamped to the final maximum. Zero health ends the run even with a successful outcome. Level is always derived from final XP.
- `profile`, `level`, and unknown keys cannot be changed through this API. A success still increments the harness-owned lifetime completion count.
- `cancel()` discards local changes. Repeated completion/cancellation and callbacks after unmount remain ignored by the host.

## Integration check

Start with `npm run dev`. Trigger a mine, then exercise success, failure, and cancellation. Confirm the board resumes, rewards/damage apply once, and starting a new run stops the previous module. Run `npm run build` before opening a pull request.

Run `npm run test:player-stats` for snapshots, level boundaries, mutation protection, result overrides, validation, and default-outcome checks.

Current health/reward values are provisional harness defaults, not minigame design requirements.

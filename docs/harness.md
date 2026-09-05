# Minigame harness

Each developer decides what their minigame is. The common interface only governs entering and leaving it.

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

| Field | Meaning |
| --- | --- |
| `health`, `maxHealth` | Current and maximum run health |
| `xp` | Total run XP |
| `level` | One-based run level, currently `Math.floor(xp / 100) + 1` |
| `upgrades.armor/repair/salvage` | Acquired upgrade counts for this run |
| `profile.shards` | Persistent shard balance |
| `profile.bestFloor` | Highest unlocked floor across runs |
| `profile.totalDisarmed` | Lifetime successfully completed mine encounters |

```tsx
import type { MinigameProps } from '@/minigames/contract';

export default function YourMinigame({ context, complete, cancel }: MinigameProps) {
  const { health, maxHealth, level, upgrades } = context.player;
  return <section>
    <p>Health {health}/{maxHealth} · Level {level} · Armor {upgrades.armor}</p>
    {/* Your own mechanics may read these stats; never modify context.player. */}
    <button onClick={() => complete({ outcome: 'success' })}>Finish</button>
    <button onClick={cancel}>Return to board</button>
  </section>;
}
```

No state setters, storage handles, or board contents are exposed. If your minigame has local damage or rewards, manage those within your component; report only the final outcome to the harness. Test fixtures that construct `MinigameProps` must now include `context.player`; the harness helper `createEncounterContext` builds a complete frozen context.

## Integration check

Start with `npm run dev`. Trigger a mine, then exercise success, failure, and cancellation. Confirm the board resumes, rewards/damage apply once, and starting a new run stops the previous module. Run `npm run build` before opening a pull request.

Run `npm run test:player-stats` for snapshot, level-boundary, and mutation-protection checks.

Current health/reward values are provisional harness defaults, not minigame design requirements.

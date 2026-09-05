# Minigame harness

Each developer decides what their minigame is. The common interface only governs entering and leaving it.

## Register a module

Create `minigames/<your-id>/index.tsx` exporting a React component that accepts `MinigameProps` from `minigames/contract.ts`. Import it into `minigames/registry.ts` and add `{ id, title, Component }` to the `minigames` array. IDs must be unique.

The host mounts the component when a mine triggers. Selection is deterministic from the encounter seed. An empty registry opens a development placeholder, not an assigned game concept.

## Runtime contract

- `context` supplies `seed`, `floor`, and `cellId`. Treat it as read-only.
- Call `complete({ outcome: 'success' })` or `complete({ outcome: 'failure' })` when finished.
- Call `cancel()` to return without rewards or damage; the triggering cell is hidden again.
- Only the first valid completion or cancellation is accepted. Calls after unmount are ignored.
- The host owns health, rewards, persistence, and board transitions. Modules must not mutate them directly.
- Render errors show a return-to-board fallback. Modules handle their own asynchronous errors.

Use effect cleanup to stop animation frames, timers, input handlers, audio, and dispose Three.js resources when unmounted. Work within the container provided by the host and support resizing. Minigames may use Three.js, canvas, or React controls as their developer chooses.

## Integration check

Start with `npm run dev`. Trigger a mine, then exercise success, failure, and cancellation. Confirm the board resumes, rewards/damage apply once, and starting a new run stops the previous module. Run `npm run build` before opening a pull request.

Current health/reward values are provisional harness defaults, not minigame design requirements.

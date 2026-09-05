import type { MinigameDefinition } from './contract';
import MineDuel from './mine-duel';

/** Developers register their own modules here. No prescribed game designs. */
export const minigames: readonly MinigameDefinition[] = [
  { id: 'mine-duel', title: 'Mine Duel', Component: MineDuel },
];

export function selectMinigame(seed: number): MinigameDefinition | undefined {
  return minigames.length ? minigames[(seed >>> 0) % minigames.length] : undefined;
}

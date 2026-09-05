import type { MinigameDefinition } from './contract';

/** Developers register their own modules here. No prescribed game designs. */
export const minigames: readonly MinigameDefinition[] = [];

export function selectMinigame(seed: number): MinigameDefinition | undefined {
  return minigames.length ? minigames[(seed >>> 0) % minigames.length] : undefined;
}

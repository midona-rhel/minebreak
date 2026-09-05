import type { MinigameDefinition } from './contract';
import DrillantsBattle from './drillantsbattle';
import Wackdonalds from './eeron36';

/** Developers register their own modules here. No prescribed game designs. */
export const minigames: readonly MinigameDefinition[] = [
  { id: 'drillantsbattle', title: 'Drillants Battle', Component: DrillantsBattle },
  { id: 'eeron36', title: 'Wackdonalds', Component: Wackdonalds },
];

export function selectMinigame(seed: number): MinigameDefinition | undefined {
  return minigames.length ? minigames[(seed >>> 0) % minigames.length] : undefined;
}

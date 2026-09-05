import type { ComponentType } from 'react';

export type EncounterResult = { outcome: 'success' | 'failure' };

/** Read-only encounter-start snapshot. The harness remains the state owner. */
export interface PlayerStats {
  readonly health: number;
  readonly maxHealth: number;
  /** Total XP in this run, not the progress within the current level. */
  readonly xp: number;
  /** One-based; currently 1 + floor(xp / 100). */
  readonly level: number;
  /** Number of times each run upgrade has been acquired. */
  readonly upgrades: Readonly<{ armor: number; repair: number; salvage: number }>;
  /** Persistent progress retained between runs. */
  readonly profile: Readonly<{ shards: number; bestFloor: number; totalDisarmed: number }>;
}

export interface EncounterContext {
  readonly seed: number;
  readonly floor: number;
  readonly cellId: number;
  readonly player: PlayerStats;
}

export interface MinigameProps {
  /** Stable for this encounter; use for repeatable generation. */
  context: EncounterContext;
  /** Reports an outcome. The harness owns rewards and health changes. */
  complete: (result: EncounterResult) => void;
  /** Returns to the board without rewards or damage. */
  cancel: () => void;
}

export interface MinigameDefinition {
  id: string;
  title: string;
  Component: ComponentType<MinigameProps>;
}

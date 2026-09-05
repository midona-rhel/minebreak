import type { ComponentType } from 'react';

/** Final absolute run-stat values; omitted fields use normal outcome defaults. */
export interface PlayerStatsPatch {
  readonly health?: number;
  readonly maxHealth?: number;
  readonly xp?: number;
  readonly upgrades?: Readonly<
    Partial<{ armor: number; repair: number; salvage: number }>
  >;
}

export type EncounterResult = {
  outcome: 'success' | 'failure';
  /** Validated and applied once by the harness. Never mutate context.player. */
  playerStats?: PlayerStatsPatch;
};

/** Read-only encounter-start snapshot. The harness remains the state owner. */
export interface PlayerStats {
  readonly health: number;
  readonly maxHealth: number;
  /** Total XP in this run, not the progress within the current level. */
  readonly xp: number;
  /** One-based; currently 1 + floor(xp / 100). */
  readonly level: number;
  /** Number of times each run upgrade has been acquired. */
  readonly upgrades: Readonly<{
    armor: number;
    repair: number;
    salvage: number;
  }>;
  /** Persistent progress retained between runs. */
  readonly profile: Readonly<{
    shards: number;
    bestFloor: number;
    totalDisarmed: number;
  }>;
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
  /** Reports an outcome and optional final run stats; the harness validates/applies them. */
  complete: (result: EncounterResult) => void;
  /** Returns to the board without rewards or damage. */
  cancel: () => void;
}

export interface MinigameDefinition {
  id: string;
  title: string;
  Component: ComponentType<MinigameProps>;
}

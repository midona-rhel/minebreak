import type { ComponentType } from 'react';

export type EncounterResult = {
  outcome: 'success' | 'failure';
  /** Damage sustained in overworld-heart units (fractional values are allowed). The harness rounds up and applies it once. */
  damageTaken?: number;
};

export interface MinigameProps {
  /** Stable for this encounter; use for repeatable generation. */
  context: Readonly<{ seed: number; floor: number; cellId: number }>;
  /** Health snapshot supplied by the harness; minigames must not mutate it. */
  player: Readonly<{ currentHp: number; maxHp: number }>;
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

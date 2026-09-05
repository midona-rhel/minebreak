import type { ComponentType } from 'react';

export type EncounterResult = { outcome: 'success' | 'failure' };

export interface MinigameProps {
  /** Stable for this encounter; use for repeatable generation. */
  context: Readonly<{ seed: number; floor: number; cellId: number }>;
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

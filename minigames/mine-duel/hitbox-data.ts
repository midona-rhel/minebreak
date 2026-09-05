import type { MoveKey } from './frame-data';

export type HitboxPoint = { x: number; y: number };
export type HitboxDefinition = { connect: HitboxPoint; corners: readonly [HitboxPoint, HitboxPoint, HitboxPoint, HitboxPoint] };

/** Shared fighter hurtbox size in stage-percent units; customize per character later. */
export const FIGHTER_BOX_SIZE = { width: 7, height: 23 } as const;

/**
 * Coordinates are stage-percent units relative to the fighter's facing side.
 * `connect` is the point attached to the fighter; corners are offsets from it.
 */
export const HITBOX_DATA: Record<MoveKey, HitboxDefinition> = {
  U: { connect: { x: 3.5, y: 20 }, corners: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 9 }, { x: 0, y: 9 }] },
  I: { connect: { x: 3.5, y: 20 }, corners: [{ x: 0, y: 0 }, { x: 14, y: 0 }, { x: 14, y: 11 }, { x: 0, y: 11 }] },
  O: { connect: { x: 3.5, y: 20 }, corners: [{ x: 0, y: 0 }, { x: 28, y: 0 }, { x: 28, y: 18 }, { x: 0, y: 18 }] },
  crouchU: { connect: { x: 3.5, y: 13 }, corners: [{ x: 0, y: 0 }, { x: 18, y: 0 }, { x: 18, y: 8 }, { x: 0, y: 8 }] },
  crouchI: { connect: { x: 3.5, y: 13 }, corners: [{ x: 0, y: 0 }, { x: 25, y: 0 }, { x: 25, y: 10 }, { x: 0, y: 10 }] },
  crouchO: { connect: { x: 3.5, y: 13 }, corners: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 9 }, { x: 0, y: 9 }] },
  airU: { connect: { x: 3.5, y: 24 }, corners: [{ x: 0, y: 0 }, { x: 18, y: 0 }, { x: 18, y: 12 }, { x: 0, y: 12 }] },
  airI: { connect: { x: 3.5, y: 25 }, corners: [{ x: 0, y: 0 }, { x: 25, y: 0 }, { x: 25, y: 16 }, { x: 0, y: 16 }] },
  airO: { connect: { x: 3.5, y: 22 }, corners: [{ x: 0, y: 0 }, { x: 32, y: 0 }, { x: 32, y: 22 }, { x: 0, y: 22 }] },
  fireball: { connect: { x: 3.5, y: 28 }, corners: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }] },
  uppercut: { connect: { x: 3.5, y: 20 }, corners: [{ x: 0, y: 0 }, { x: 22, y: 0 }, { x: 22, y: 25 }, { x: 0, y: 25 }] },
};

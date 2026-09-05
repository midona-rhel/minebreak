/**
 * Editable move tuning for Mine Duel.
 * Advantage values are intentionally not stored here; the game derives them
 * from startup, active, recovery, and the opponent's stun values.
 */
export type Attack = 'U' | 'I' | 'O';
export type MoveKey = Attack | 'crouchU' | 'crouchI' | 'crouchO' | 'airU' | 'airI' | 'airO' | 'fireball' | 'uppercut';

export const FRAME_DATA: Record<MoveKey, {
  damage: number; startup: number; active: number; recovery: number;
  blockstun: number; hitstun: number; range: number; height: number; label: string;
}> = {
  U: { damage: 40, startup: 5, active: 3, recovery: 14, blockstun: 18, hitstun: 20, range: 10, height: 9, label: 'LIGHT' },
  I: { damage: 70, startup: 9, active: 4, recovery: 22, blockstun: 13, hitstun: 26, range: 14, height: 11, label: 'MEDIUM' },
  O: { damage: 100, startup: 14, active: 5, recovery: 42, blockstun: 17, hitstun: 26, range: 28, height: 18, label: 'HEAVY' },
  crouchU: { damage: 40, startup: 6, active: 3, recovery: 16, blockstun: 17, hitstun: 20, range: 18, height: 8, label: 'CROUCH LIGHT' },
  crouchI: { damage: 70, startup: 10, active: 4, recovery: 24, blockstun: 13, hitstun: 26, range: 25, height: 10, label: 'CROUCH MEDIUM' },
  crouchO: { damage: 100, startup: 15, active: 5, recovery: 45, blockstun: 16, hitstun: 27, range: 40, height: 9, label: 'CROUCH HEAVY' },
  airU: { damage: 45, startup: 6, active: 4, recovery: 12, blockstun: 12, hitstun: 18, range: 18, height: 12, label: 'AIR LIGHT' },
  airI: { damage: 75, startup: 8, active: 5, recovery: 18, blockstun: 15, hitstun: 23, range: 25, height: 16, label: 'AIR MEDIUM' },
  airO: { damage: 110, startup: 11, active: 6, recovery: 28, blockstun: 18, hitstun: 30, range: 32, height: 22, label: 'AIR HEAVY' },
  fireball: { damage: 65, startup: 12, active: 1, recovery: 24, blockstun: 11, hitstun: 16, range: 0, height: 0, label: 'FIREBALL' },
  uppercut: { damage: 115, startup: 8, active: 6, recovery: 73, blockstun: 18, hitstun: 76, range: 22, height: 25, label: 'RISING STRIKE' },
};

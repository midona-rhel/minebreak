export type Weapon = 'shield' | 'sword' | 'axe' | 'whip';
export type BattleFormat = 'boss' | 'survival' | 'elimination';
export interface Vec { x: number; y: number }
export interface Ant {
  id: number; player: boolean; boss: boolean; pos: Vec; vel: Vec;
  angle: number; spinDirection: 1 | -1; spin: number; maxSpin: number; weapons: (Weapon | null)[];
  radius: number; lastHit: number; alive: boolean; dashUntil: number;
  nextDash: number; telegraphUntil: number; dashTarget: Vec;
}
export interface Drop { id: number; pos: Vec; weapon: Weapon; availableAt: number }
export interface BattleState {
  time: number; ants: Ant[]; drops: Drop[]; kills: number; spawned: number;
  nextSpawn: number; survivalStarted: number | null;
  outcome: 'success' | 'failure' | null; format: BattleFormat;
  targetKills: number; survivalDuration: number; seed: number; nextId: number;
  contacts: Record<string, number>;
}

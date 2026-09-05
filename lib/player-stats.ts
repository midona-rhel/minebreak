import type { EncounterContext, PlayerStats } from '../minigames/contract';

/** Internal harness input; level is derived from the same XP used by the HUD. */
export type PlayerStatsSource = Omit<PlayerStats, 'level'>;

export function createPlayerStatsSnapshot(source: PlayerStatsSource): PlayerStats {
  return Object.freeze({
    health: source.health,
    maxHealth: source.maxHealth,
    xp: source.xp,
    level: Math.floor(source.xp / 100) + 1,
    upgrades: Object.freeze({
      armor: source.upgrades.armor,
      repair: source.upgrades.repair,
      salvage: source.upgrades.salvage,
    }),
    profile: Object.freeze({
      shards: source.profile.shards,
      bestFloor: source.profile.bestFloor,
      totalDisarmed: source.profile.totalDisarmed,
    }),
  });
}

/** Capture on launch, not during render: rerenders cannot change active stats. */
export function createEncounterContext(
  location: Omit<EncounterContext, 'player'>,
  player: PlayerStatsSource,
): EncounterContext {
  return Object.freeze({
    seed: location.seed,
    floor: location.floor,
    cellId: location.cellId,
    player: createPlayerStatsSnapshot(player),
  });
}

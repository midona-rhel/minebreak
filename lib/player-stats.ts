import type {
  EncounterContext,
  EncounterResult,
  PlayerStats,
} from '../minigames/contract';

/** Internal harness input; level is derived from the same XP used by the HUD. */
export type PlayerStatsSource = Omit<PlayerStats, 'level'>;

export type RunPlayerStats = Pick<
  PlayerStats,
  'health' | 'maxHealth' | 'xp' | 'upgrades'
>;

/** Shared caps for encounter returns, board rewards, and floor upgrades. */
export const RUN_STAT_LIMITS = Object.freeze({
  health: 100,
  xp: 1_000_000_000,
  upgrade: 100,
});

/** Internal harness rewards use the same XP cap on every transition. */
export function awardRunXP(currentXP: number, reward: number): number {
  return Math.min(RUN_STAT_LIMITS.xp, currentXP + reward);
}

export function applyFloorUpgrade(
  current: RunPlayerStats,
  upgrade: keyof RunPlayerStats['upgrades'],
): RunPlayerStats {
  const maxHealth =
    upgrade === 'armor'
      ? Math.min(RUN_STAT_LIMITS.health, current.maxHealth + 1)
      : current.maxHealth;
  const healing = upgrade === 'armor' ? 1 : upgrade === 'repair' ? 2 : 0;
  return {
    health: Math.min(maxHealth, current.health + healing),
    maxHealth,
    xp: current.xp,
    upgrades: {
      ...current.upgrades,
      [upgrade]: Math.min(
        RUN_STAT_LIMITS.upgrade,
        current.upgrades[upgrade] + 1,
      ),
    },
  };
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function integer(
  patch: Record<string, unknown>,
  key: string,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  const value = Object.hasOwn(patch, key) ? patch[key] : undefined;
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : fallback;
}

/**
 * Normal outcome defaults first, then valid absolute overrides (not deltas).
 * Persistent profile and derived level are deliberately not writable here.
 */
export function resolveEncounterStats(
  current: RunPlayerStats,
  result: EncounterResult,
  defaultRewardXP: number,
): RunPlayerStats {
  const patch = record(
    Object.hasOwn(result, 'playerStats') ? result.playerStats : undefined,
  );
  const upgrades = record(
    Object.hasOwn(patch, 'upgrades') ? patch.upgrades : undefined,
  );
  const maxHealth = integer(
    patch,
    'maxHealth',
    1,
    RUN_STAT_LIMITS.health,
    current.maxHealth,
  );
  const defaultHealth =
    result.outcome === 'failure'
      ? Math.max(0, current.health - Math.max(1, 2 - current.upgrades.armor))
      : current.health;
  const defaultXP =
    result.outcome === 'success'
      ? awardRunXP(current.xp, defaultRewardXP)
      : current.xp;
  return {
    health: Math.min(
      maxHealth,
      integer(patch, 'health', 0, RUN_STAT_LIMITS.health, defaultHealth),
    ),
    maxHealth,
    xp: integer(patch, 'xp', 0, RUN_STAT_LIMITS.xp, defaultXP),
    upgrades: {
      armor: integer(
        upgrades,
        'armor',
        0,
        RUN_STAT_LIMITS.upgrade,
        current.upgrades.armor,
      ),
      repair: integer(
        upgrades,
        'repair',
        0,
        RUN_STAT_LIMITS.upgrade,
        current.upgrades.repair,
      ),
      salvage: integer(
        upgrades,
        'salvage',
        0,
        RUN_STAT_LIMITS.upgrade,
        current.upgrades.salvage,
      ),
    },
  };
}

export function createPlayerStatsSnapshot(
  source: PlayerStatsSource,
): PlayerStats {
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

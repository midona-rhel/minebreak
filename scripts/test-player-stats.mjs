import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyFloorUpgrade,
  awardRunXP,
  createEncounterContext,
  createPlayerStatsSnapshot,
  resolveEncounterStats,
} from '../lib/player-stats.ts';

test('capped encounter health survives plating and a subsequent preserve-health failure', () => {
  const completed = resolveEncounterStats(
    source(),
    {
      outcome: 'success',
      playerStats: { health: 100, maxHealth: 100 },
    },
    40,
  );
  const descended = applyFloorUpgrade(completed, 'armor');
  assert.equal(descended.health, 100);
  assert.equal(descended.maxHealth, 100);
  const context = createEncounterContext(
    { seed: 42, floor: 2, cellId: 3 },
    {
      ...descended,
      profile: source().profile,
    },
  );
  const next = resolveEncounterStats(
    descended,
    {
      outcome: 'failure',
      playerStats: { health: context.player.health },
    },
    45,
  );
  assert.equal(next.health, context.player.health);
});

test('safe-cell XP rewards and subsequent encounter wins never reduce XP at the cap', () => {
  for (const xp of [999_999_999, 1_000_000_000]) {
    const completed = resolveEncounterStats(
      source(),
      {
        outcome: 'success',
        playerStats: { xp },
      },
      40,
    );
    const revealed = { ...completed, xp: awardRunXP(completed.xp, 2) };
    assert.equal(revealed.xp, 1_000_000_000);
    const next = resolveEncounterStats(revealed, { outcome: 'success' }, 40);
    assert.equal(next.xp, revealed.xp);
  }
});

test('all floor upgrade counts stop at the encounter limit and healing respects max health', () => {
  for (const upgrade of ['armor', 'repair', 'salvage']) {
    let current = resolveEncounterStats(
      source(),
      {
        outcome: 'success',
        playerStats: {
          health: 98,
          maxHealth: 99,
          upgrades: { armor: 99, repair: 99, salvage: 99 },
        },
      },
      40,
    );
    for (let floor = 0; floor < 3; floor += 1) {
      current = applyFloorUpgrade(current, upgrade);
    }
    assert.equal(current.upgrades[upgrade], 100);
    assert.equal(current.maxHealth, upgrade === 'armor' ? 100 : 99);
    assert.equal(
      current.health,
      upgrade === 'salvage' ? 98 : current.maxHealth,
    );
    const next = resolveEncounterStats(
      current,
      {
        outcome: 'failure',
        playerStats: current,
      },
      40,
    );
    assert.deepEqual(next, current);
  }
});

test('ordinary board rewards and each floor upgrade retain their effects below the caps', () => {
  const current = createPlayerStatsSnapshot(source());
  assert.equal(awardRunXP(current.xp, 2), 142);
  for (const [upgrade, health, maxHealth] of [
    ['armor', 4, 7],
    ['repair', 5, 6],
    ['salvage', 3, 6],
  ]) {
    assert.deepEqual(applyFloorUpgrade(current, upgrade), {
      health,
      maxHealth,
      xp: 140,
      upgrades: {
        ...current.upgrades,
        [upgrade]: current.upgrades[upgrade] + 1,
      },
    });
  }
});

const source = () => ({
  health: 3,
  maxHealth: 6,
  xp: 140,
  upgrades: { armor: 1, repair: 2, salvage: 3 },
  profile: { shards: 24, bestFloor: 4, totalDisarmed: 8 },
});

test('copies every main-loop stat and derives the displayed level', () => {
  assert.deepEqual(createPlayerStatsSnapshot(source()), {
    ...source(),
    level: 2,
  });
});

test('level follows the HUD formula at XP boundaries', () => {
  for (const [xp, level] of [
    [0, 1],
    [99, 1],
    [100, 2],
    [199, 2],
    [200, 3],
  ]) {
    assert.equal(createPlayerStatsSnapshot({ ...source(), xp }).level, level);
  }
});

test('captures independent state, preserves encounter identity, and recaptures on relaunch', () => {
  const player = source();
  const location = { seed: 14022, floor: 3, cellId: 12 };
  const first = createEncounterContext(location, player);
  player.health = 2;
  player.upgrades.armor = 4;
  player.profile.shards = 99;
  location.floor = 4;
  assert.equal(first.floor, 3);
  assert.equal(first.seed, 14022);
  assert.equal(first.cellId, 12);
  assert.equal(first.player.health, 3);
  assert.equal(first.player.upgrades.armor, 1);
  assert.equal(first.player.profile.shards, 24);
  const second = createEncounterContext(location, player);
  assert.equal(second.player.health, 2);
  assert.equal(second.player.upgrades.armor, 4);
  assert.equal(second.player.profile.shards, 99);
  assert.equal(second.floor, 4);
  assert.notEqual(first.player, second.player);
});

test('context and all nested player objects reject mutation', () => {
  const context = createEncounterContext(
    { seed: 1, floor: 1, cellId: 0 },
    source(),
  );
  for (const object of [
    context,
    context.player,
    context.player.upgrades,
    context.player.profile,
  ]) {
    assert.ok(Object.isFrozen(object));
  }
  assert.throws(() => {
    context.floor = 50;
  }, TypeError);
  assert.throws(() => {
    context.player.health = 99;
  }, TypeError);
  assert.throws(() => {
    context.player.upgrades.armor = 99;
  }, TypeError);
  assert.throws(() => {
    context.player.profile.shards = 99;
  }, TypeError);
});

test('legacy outcome-only completion keeps normal rewards and armor-adjusted damage', () => {
  const current = source();
  assert.deepEqual(resolveEncounterStats(current, { outcome: 'success' }, 40), {
    health: 3,
    maxHealth: 6,
    xp: 180,
    upgrades: current.upgrades,
  });
  assert.deepEqual(resolveEncounterStats(current, { outcome: 'failure' }, 40), {
    health: 2,
    maxHealth: 6,
    xp: 140,
    upgrades: current.upgrades,
  });
  assert.equal(
    resolveEncounterStats(
      { ...current, upgrades: { ...current.upgrades, armor: 0 } },
      { outcome: 'failure' },
      40,
    ).health,
    1,
  );
});

test('partial overrides retain default rewards and untouched upgrade levels', () => {
  const next = resolveEncounterStats(
    source(),
    {
      outcome: 'success',
      playerStats: { health: 2, upgrades: { repair: 5 } },
    },
    40,
  );
  assert.deepEqual(next, {
    health: 2,
    maxHealth: 6,
    xp: 180,
    upgrades: { armor: 1, repair: 5, salvage: 3 },
  });
});

test('full overrides use final values without applying damage or XP a second time', () => {
  const playerStats = {
    health: 4,
    maxHealth: 8,
    xp: 500,
    upgrades: { armor: 4, repair: 5, salvage: 6 },
  };
  for (const outcome of ['success', 'failure']) {
    assert.deepEqual(
      resolveEncounterStats(source(), { outcome, playerStats }, 40),
      playerStats,
    );
  }
});

test('zero is a valid explicit value, including lethal success', () => {
  const next = resolveEncounterStats(
    source(),
    {
      outcome: 'success',
      playerStats: {
        health: 0,
        xp: 0,
        upgrades: { armor: 0, repair: 0, salvage: 0 },
      },
    },
    40,
  );
  assert.deepEqual(next, {
    health: 0,
    maxHealth: 6,
    xp: 0,
    upgrades: { armor: 0, repair: 0, salvage: 0 },
  });
});

test('health is clamped after max-health overrides, and default lethal damage stops at zero', () => {
  assert.equal(
    resolveEncounterStats(
      source(),
      { outcome: 'success', playerStats: { maxHealth: 1 } },
      40,
    ).health,
    1,
  );
  assert.equal(
    resolveEncounterStats(
      source(),
      { outcome: 'success', playerStats: { health: 100, maxHealth: 10 } },
      40,
    ).health,
    10,
  );
  assert.equal(
    resolveEncounterStats(
      { ...source(), health: 1, upgrades: { armor: 0, repair: 0, salvage: 0 } },
      { outcome: 'failure' },
      40,
    ).health,
    0,
  );
});

test('malformed patch containers and invalid fields are ignored independently', () => {
  const baseline = resolveEncounterStats(source(), { outcome: 'success' }, 40);
  for (const playerStats of [null, [], 0, false, 'bad']) {
    assert.deepEqual(
      resolveEncounterStats(source(), { outcome: 'success', playerStats }, 40),
      baseline,
    );
  }
  for (const value of [NaN, Infinity, -Infinity, -1, 1.5, '2', true, null]) {
    assert.deepEqual(
      resolveEncounterStats(
        source(),
        {
          outcome: 'success',
          playerStats: {
            health: value,
            maxHealth: value,
            xp: value,
            upgrades: { armor: value, repair: value, salvage: value },
          },
        },
        40,
      ),
      baseline,
    );
  }
  assert.deepEqual(
    resolveEncounterStats(
      source(),
      {
        outcome: 'success',
        playerStats: {
          health: 101,
          maxHealth: 0,
          xp: 1_000_000_001,
          upgrades: { armor: 101 },
        },
      },
      40,
    ),
    baseline,
  );
  for (const upgrades of [null, [], 'bad']) {
    assert.deepEqual(
      resolveEncounterStats(
        source(),
        { outcome: 'success', playerStats: { upgrades } },
        40,
      ),
      baseline,
    );
  }
  const mixed = resolveEncounterStats(
    source(),
    {
      outcome: 'failure',
      playerStats: { health: NaN, xp: 42, upgrades: { armor: '4', repair: 0 } },
    },
    40,
  );
  assert.equal(mixed.health, 2);
  assert.equal(mixed.xp, 42);
  assert.deepEqual(mixed.upgrades, { armor: 1, repair: 0, salvage: 3 });
});

test('inherited patch and upgrade fields are ignored', () => {
  const baseline = resolveEncounterStats(source(), { outcome: 'success' }, 40);
  const inheritedResult = Object.create({
    playerStats: { health: 0, xp: 0, upgrades: { armor: 100 } },
  });
  inheritedResult.outcome = 'success';
  assert.deepEqual(
    resolveEncounterStats(source(), inheritedResult, 40),
    baseline,
  );
  const inheritedPatch = Object.create({
    health: 0,
    xp: 0,
    upgrades: { armor: 100 },
  });
  assert.deepEqual(
    resolveEncounterStats(
      source(),
      { outcome: 'success', playerStats: inheritedPatch },
      40,
    ),
    baseline,
  );
  const inheritedUpgrades = Object.create({
    armor: 100,
    repair: 100,
    salvage: 100,
  });
  assert.deepEqual(
    resolveEncounterStats(
      source(),
      {
        outcome: 'success',
        playerStats: { upgrades: inheritedUpgrades },
      },
      40,
    ),
    baseline,
  );
});

test('upper limits are accepted and ordinary XP rewards stop at the same cap', () => {
  const next = resolveEncounterStats(
    source(),
    {
      outcome: 'success',
      playerStats: {
        health: 100,
        maxHealth: 100,
        xp: 1_000_000_000,
        upgrades: { armor: 100, repair: 100, salvage: 100 },
      },
    },
    40,
  );
  assert.equal(next.health, 100);
  assert.equal(next.maxHealth, 100);
  assert.equal(next.xp, 1_000_000_000);
  assert.equal(next.upgrades.armor, 100);
  assert.equal(
    resolveEncounterStats(
      { ...source(), xp: 999_999_999 },
      { outcome: 'success' },
      40,
    ).xp,
    1_000_000_000,
  );
});

test('ignores profile, level, and unknown keys; never mutates the snapshot or patch', () => {
  const current = createPlayerStatsSnapshot(source());
  const playerStats = Object.freeze({
    health: 4,
    level: 999,
    profile: { shards: 999 },
    upgrades: Object.freeze({ armor: 2, unknown: 999 }),
  });
  const next = resolveEncounterStats(
    current,
    { outcome: 'success', playerStats },
    40,
  );
  assert.deepEqual(Object.keys(next).sort(), [
    'health',
    'maxHealth',
    'upgrades',
    'xp',
  ]);
  assert.deepEqual(next.upgrades, { armor: 2, repair: 2, salvage: 3 });
  assert.equal(current.health, 3);
  assert.equal(current.upgrades.armor, 1);
  assert.equal(current.profile.shards, 24);
  assert.equal(playerStats.health, 4);
  assert.equal(
    createPlayerStatsSnapshot({ ...next, profile: current.profile }).level,
    2,
  );
});

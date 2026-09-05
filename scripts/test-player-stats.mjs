import assert from 'node:assert/strict';
import test from 'node:test';
import { createEncounterContext, createPlayerStatsSnapshot } from '../lib/player-stats.ts';

const source = () => ({
  health: 3,
  maxHealth: 6,
  xp: 140,
  upgrades: { armor: 1, repair: 2, salvage: 3 },
  profile: { shards: 24, bestFloor: 4, totalDisarmed: 8 },
});

test('copies every main-loop stat and derives the displayed level', () => {
  assert.deepEqual(createPlayerStatsSnapshot(source()), { ...source(), level: 2 });
});

test('level follows the HUD formula at XP boundaries', () => {
  for (const [xp, level] of [[0, 1], [99, 1], [100, 2], [199, 2], [200, 3]]) {
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
  const context = createEncounterContext({ seed: 1, floor: 1, cellId: 0 }, source());
  for (const object of [context, context.player, context.player.upgrades, context.player.profile]) {
    assert.ok(Object.isFrozen(object));
  }
  assert.throws(() => { context.floor = 50; }, TypeError);
  assert.throws(() => { context.player.health = 99; }, TypeError);
  assert.throws(() => { context.player.upgrades.armor = 99; }, TypeError);
  assert.throws(() => { context.player.profile.shards = 99; }, TypeError);
});

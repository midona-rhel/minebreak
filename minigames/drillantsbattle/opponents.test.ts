import assert from 'node:assert/strict';
import test from 'node:test';
import { OPPONENT_CONFIG, spawnEnemy, updateObjectives, updateOpponents } from './opponents';
import type { Ant, BattleFormat, BattleState } from './types';

function fixture(format: BattleFormat = 'elimination'): BattleState {
  const player: Ant = {
    id: 0, player: true, boss: false, pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 },
    angle: 0, spinDirection: 1, spin: 100, maxSpin: 100, weapons: Array(6).fill('sword'),
    radius: 0.045, lastHit: -10, alive: true, dashUntil: 0, nextDash: Infinity,
    telegraphUntil: 0, dashTarget: { x: 0, y: 0 },
  };
  return {
    time: 0, ants: [player], drops: [], kills: 0, spawned: 0, nextSpawn: 0,
    survivalStarted: null, outcome: null, format, targetKills: 6,
    survivalDuration: 20, seed: 42, nextId: 1, contacts: {},
  };
}

void test('arrivals are deterministic, timed, overlapping, and bounded', () => {
  const state = fixture();
  const replay = fixture();
  spawnEnemy(state);
  spawnEnemy(replay);
  assert.deepEqual(state, replay);
  assert.ok(state.ants[1].spin < state.ants[0].maxSpin);
  assert.ok(Math.hypot(state.ants[1].pos.x, state.ants[1].pos.y) < 1 - state.ants[1].radius);
  state.time = state.nextSpawn - 0.001;
  updateOpponents(state, 0.01);
  assert.equal(state.spawned, 1);
  state.time = state.nextSpawn;
  updateOpponents(state, 0.01);
  assert.equal(state.spawned, 2);
  for (let i = 0; i < 10; i++) {
    state.time += 4;
    updateOpponents(state, 0.01);
  }
  assert.equal(state.ants.filter((ant) => !ant.player && ant.alive).length, OPPONENT_CONFIG.maxLiveEnemies);
});

void test('pursuit changes velocity, separates coincident opponents, and does not integrate positions', () => {
  const state = fixture();
  spawnEnemy(state);
  spawnEnemy(state);
  state.ants[0].pos = { x: 0.5, y: 0 };
  state.ants[1].pos = { x: 0, y: 0 };
  state.ants[2].pos = { x: 0, y: 0 };
  const before = state.ants.map((ant) => ({ ...ant.pos }));
  updateOpponents(state, 0.1);
  assert.deepEqual(state.ants.map((ant) => ant.pos), before);
  assert.ok(state.ants[1].vel.x < 0);
  assert.ok(state.ants[2].vel.x > 0);
  assert.equal(state.ants[1].spin, state.ants[1].maxSpin);
});

void test('elimination requires actual kills and stops arrivals at its quota', () => {
  const state = fixture();
  state.spawned = state.targetKills;
  state.kills = state.targetKills - 1;
  updateObjectives(state);
  assert.equal(state.outcome, null);
  spawnEnemy(state);
  assert.equal(state.spawned, state.targetKills);
  state.kills++;
  updateObjectives(state);
  assert.equal(state.outcome, 'success');
});

void test('survival starts on kill quota and keeps spawning during the full countdown', () => {
  const state = fixture('survival');
  state.time = 100;
  state.spawned = state.targetKills;
  state.kills = state.targetKills - 1;
  updateObjectives(state);
  assert.equal(state.survivalStarted, null);
  state.kills++;
  updateObjectives(state);
  assert.equal(state.survivalStarted, 100);
  assert.equal(state.outcome, null);
  updateOpponents(state, 0.01);
  assert.equal(state.spawned, state.targetKills + 1);
  state.time = 119.99;
  updateObjectives(state);
  assert.equal(state.survivalStarted, 100);
  assert.equal(state.outcome, null);
  state.time = 120;
  updateObjectives(state);
  assert.equal(state.outcome, 'success');
});

void test('boss telegraphs a fixed target, dashes toward it, and never gains reinforcements', () => {
  const state = fixture('boss');
  spawnEnemy(state);
  const boss = state.ants[1];
  state.time = boss.nextDash;
  updateOpponents(state, 0.01);
  assert.ok(boss.telegraphUntil > state.time);
  assert.ok(boss.dashUntil <= state.time);
  const target = { ...boss.dashTarget };
  const expected = { x: target.x - boss.pos.x, y: target.y - boss.pos.y };
  state.ants[0].pos = { x: 0.8, y: 0.8 };
  state.time += OPPONENT_CONFIG.bossTelegraphDuration / 2;
  updateOpponents(state, 0.01);
  assert.deepEqual(boss.dashTarget, target);
  state.time = boss.telegraphUntil;
  updateOpponents(state, 0.01);
  assert.ok(boss.dashUntil > state.time);
  assert.ok(Math.abs(Math.hypot(boss.vel.x, boss.vel.y) - OPPONENT_CONFIG.bossDashSpeed) < 1e-10);
  assert.ok(boss.vel.x * expected.x + boss.vel.y * expected.y > 0);
  assert.ok(Math.abs(boss.vel.x * expected.y - boss.vel.y * expected.x) < 1e-10);
  state.time += 10;
  spawnEnemy(state);
  assert.equal(state.spawned, 1);
  boss.alive = false;
  spawnEnemy(state);
  assert.equal(state.spawned, 1);
  updateObjectives(state);
  assert.equal(state.outcome, 'success');
});

void test('player defeat takes precedence over every objective and failure remains final', () => {
  for (const format of ['boss', 'elimination', 'survival'] as const) {
    const state = fixture(format);
    state.spawned = 1;
    state.kills = state.targetKills;
    state.survivalStarted = 0;
    state.time = state.survivalDuration;
    state.ants[0].alive = false;
    updateObjectives(state);
    assert.equal(state.outcome, 'failure');
    state.ants[0].alive = true;
    updateObjectives(state);
    assert.equal(state.outcome, 'failure');
  }
  const spinDefeat = fixture();
  spinDefeat.kills = spinDefeat.targetKills;
  spinDefeat.ants[0].spin = 0;
  updateObjectives(spinDefeat);
  assert.equal(spinDefeat.outcome, 'failure');
});

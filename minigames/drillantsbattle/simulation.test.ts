import assert from 'node:assert/strict';
import test from 'node:test';
import { CONFIG, createBattle, recoveryHeading, stepBattle, weaponAdvantage } from './simulation';
import { updateObjectives, updateOpponents } from './opponents';
import type { BattleState, Weapon } from './types';

const KIT: Weapon[] = ['sword', 'shield', 'axe', 'whip', 'sword', 'shield'];
const EPSILON = 0.00001;

void test('a fatal collision on the survival timer boundary takes precedence over victory', () => {
  const { state, player, enemy } = fixture();
  state.format = 'survival';
  state.kills = state.targetKills;
  state.survivalStarted = 0;
  state.time = state.survivalDuration - 1 / 240;
  player.weapons.fill(null);
  enemy.pos = { ...player.pos };
  stepBattle(state, player.pos, 1 / 120);
  assert.equal(state.outcome, 'failure');
  assert.equal(player.alive, false);
});

function fixture() {
  const state = createBattle(42, 'boss', KIT, 1);
  const player = state.ants[0];
  const enemy = state.ants[1];
  player.pos = { x: 0, y: 0 };
  enemy.pos = { x: 0.8, y: 0 };
  enemy.telegraphUntil = Infinity;
  state.nextSpawn = Infinity;
  return { state, player, enemy };
}

function run(state: BattleState, target: { x: number; y: number }, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 120); i++) stepBattle(state, target, 1 / 120);
}

function near(actual: number, expected: number, tolerance = 1e-5) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
}

void test('same seed and inputs reproduce complete battle state', () => {
  const a = createBattle(8192, 'survival', KIT, 2);
  const b = createBattle(8192, 'survival', KIT, 2);
  for (let i = 0; i < 600; i++) {
    const target = { x: Math.cos(i / 30) * 0.65, y: Math.sin(i / 30) * 0.65 };
    stepBattle(a, target, 1 / 60);
    stepBattle(b, target, 1 / 60);
  }
  assert.deepEqual(a, b);
  assert.notDeepEqual(createBattle(1, 'boss', KIT, 1), createBattle(2, 'boss', KIT, 1));
});

void test('loadouts are copied and capped at six slots', () => {
  const kit: Weapon[] = ['sword'];
  const state = createBattle(1, 'boss', kit, 1);
  kit[0] = 'axe';
  assert.deepEqual(state.ants[0].weapons, ['sword', null, null, null, null, null]);
  assert.equal(createBattle(1, 'boss', Array(10).fill('shield'), 1).ants[0].weapons.length, 6);
});

void test('weapon cycle is directional, with neutral opposite pairs', () => {
  for (const [winner, loser] of [['shield', 'sword'], ['sword', 'whip'], ['whip', 'axe'], ['axe', 'shield']] as const) {
    assert.ok(weaponAdvantage(winner, loser) > 1);
    assert.ok(weaponAdvantage(loser, winner) < 1);
    assert.equal(weaponAdvantage(winner, winner), 1);
  }
  assert.equal(weaponAdvantage('sword', 'axe'), 1);
  assert.equal(weaponAdvantage('shield', 'whip'), 1);
});

void test('opposite-rotation and inward movement are faster and preserve inertia', () => {
  function speed(target: { x: number; y: number }) {
    const { state, player } = fixture();
    player.pos = { x: 0.4, y: 0 };
    stepBattle(state, target, 1 / 120);
    return { state, player, speed: Math.hypot(player.vel.x, player.vel.y) };
  }
  assert.ok(speed({ x: 0.4, y: -0.5 }).speed > speed({ x: 0.4, y: 0.5 }).speed);
  assert.ok(speed({ x: -0.1, y: 0 }).speed > speed({ x: 0.9, y: 0 }).speed);
  const moving = speed({ x: 0.4, y: 0.5 });
  const before = moving.player.vel.y;
  stepBattle(moving.state, { ...moving.player.pos }, 1 / 120);
  assert.ok(moving.player.vel.y > 0 && moving.player.vel.y < before);
});

void test('movement favors the recovery spiral, mirrors spin direction, and scales tangential speed with spin', () => {
  function travel(spin: number, direction: 1 | -1, heading: { x: number; y: number }) {
    const { state, player } = fixture();
    player.pos = { x: 0.4, y: 0 };
    player.spin = spin;
    player.spinDirection = direction;
    player.lastHit = state.time;
    stepBattle(state, { x: player.pos.x + heading.x, y: player.pos.y + heading.y }, 1 / 120);
    return Math.hypot(player.vel.x, player.vel.y);
  }
  const { player } = fixture();
  player.pos = { x: 0.4, y: 0 };
  for (const spin of [15, 90]) {
    player.spin = spin;
    const ideal = recoveryHeading(player);
    const best = travel(spin, 1, ideal);
    for (const heading of [{ x: -1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }, { x: 1, y: 0 }]) {
      assert.ok(best > travel(spin, 1, heading));
    }
    near(best, travel(spin, -1, { x: ideal.x, y: -ideal.y }));
  }
  assert.ok(travel(90, 1, { x: 0, y: -1 }) > travel(15, 1, { x: 0, y: -1 }));
  for (const heading of [{ x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }]) {
    assert.ok(travel(90, 1, heading) > travel(15, 1, heading) * 2,
      'high RP must improve speed in every direction, including against the flow');
  }
});

void test('spin regenerates only on favorable travel after hit-free delay', () => {
  const { state, player } = fixture();
  player.pos = { x: 0.4, y: 0 };
  player.spin = 50;
  player.lastHit = state.time;
  stepBattle(state, { x: 0.1, y: -0.6 }, 0.2);
  near(player.spin, 50 - CONFIG.playerSpinDrain * 0.2);
  player.lastHit = state.time - CONFIG.regenerationDelay;
  stepBattle(state, { x: 0.1, y: -0.6 }, 0.2);
  assert.ok(player.spin > 50 && player.spin <= player.maxSpin);
  player.vel = { x: 0, y: 0 };
  const before = player.spin;
  stepBattle(state, { ...player.pos }, 0.1);
  near(player.spin, before - CONFIG.playerSpinDrain * 0.1);
});

void test('recovery spirals reverse with body rotation and flatten as spin increases', () => {
  const { player } = fixture();
  player.pos = { x: 0.5, y: 0 };
  player.spin = 15;
  const low = recoveryHeading(player);
  player.spin = 90;
  const high = recoveryHeading(player);
  assert.ok(low.x < 0 && low.y < 0);
  assert.ok(high.x < 0 && high.y < 0);
  assert.ok(Math.abs(high.x) < Math.abs(low.x));
  player.spinDirection = -1;
  const reversed = recoveryHeading(player);
  near(reversed.x, high.x);
  near(reversed.y, -high.y);
  player.pos = { x: 0, y: 0 };
  assert.deepEqual(recoveryHeading(player), { x: 0, y: 0 });
});

void test('only opposite-spin inward travel regenerates, for both spin directions', () => {
  for (const direction of [1, -1] as const) {
    for (const path of ['optimal', 'same-spin', 'outward', 'circular'] as const) {
      const { state, player } = fixture();
      player.pos = { x: 0.5, y: 0 };
      player.spin = 50;
      player.spinDirection = direction;
      const optimal = recoveryHeading(player);
      const heading = path === 'optimal' ? optimal
        : path === 'same-spin' ? { x: optimal.x, y: -optimal.y }
        : path === 'outward' ? { x: -optimal.x, y: optimal.y }
        : { x: 0, y: -direction };
      player.vel = { x: heading.x * 0.3, y: heading.y * 0.3 };
      const target = { x: player.pos.x + heading.x, y: player.pos.y + heading.y };
      stepBattle(state, target, CONFIG.maximumStep);
      assert.equal(player.spin > 50, path === 'optimal', `${direction}: ${path}`);
      assert.equal(Math.sign(player.angle), direction);
    }
  }
});

void test('collision damage uses both pre-hit spins and inverse shares', () => {
  const { state, player, enemy } = fixture();
  enemy.pos = { x: 0.05, y: 0 };
  player.spin = 100;
  enemy.spin = 50;
  player.weapons = Array(6).fill('shield');
  enemy.weapons = Array(6).fill('shield');
  stepBattle(state, { ...player.pos }, EPSILON);
  const factor = CONFIG.collisionFactor * CONFIG.impactBase;
  near(player.spin, 100 - 50 * factor);
  near(enemy.spin, 50 - 100 * factor);
});

void test('damage is simultaneous regardless of ant array order and spin can beat weapon disadvantage', () => {
  function hit(reverse: boolean) {
    const { state, player, enemy } = fixture();
    enemy.pos = { x: 0.05, y: 0 };
    player.spin = 100;
    enemy.spin = 30;
    player.weapons = ['sword'];
    enemy.weapons = ['shield'];
    if (reverse) state.ants.reverse();
    stepBattle(state, { ...player.pos }, EPSILON);
    return { playerLoss: 100 - player.spin, enemyLoss: 30 - enemy.spin };
  }
  assert.deepEqual(hit(false), hit(true));
  assert.ok(hit(false).enemyLoss > hit(false).playerLoss);
});

void test('head-on impact exceeds a glancing hit, which exceeds matched velocity', () => {
  function damage(velocity: { x: number; y: number }) {
    const { state, player, enemy } = fixture();
    enemy.pos = { x: 0.05, y: 0 };
    player.weapons = enemy.weapons = Array(6).fill('shield');
    player.vel = velocity;
    stepBattle(state, { ...player.pos }, EPSILON);
    return 100 - player.spin;
  }
  const headOn = damage({ x: 1, y: 0 });
  const glancing = damage({ x: 0, y: 1 });
  const matched = damage({ x: 0, y: 0 });
  assert.ok(headOn > glancing);
  assert.ok(glancing > matched);
});

void test('last weapon loss is survivable, next hit kills and contact cooldown prevents repeat hits', () => {
  const { state, player, enemy } = fixture();
  state.seed = 0; // First LCG draw is below this collision's damage-biased loss probability.
  player.weapons = ['shield', null, null, null, null, null];
  enemy.weapons = Array(6).fill('shield');
  enemy.pos = { x: 0.05, y: 0 };
  stepBattle(state, { ...player.pos }, EPSILON);
  assert.ok(player.alive);
  assert.ok(player.weapons.every(weapon => weapon === null));
  assert.ok(player.spin > 0);
  const spin = player.spin;
  enemy.pos = { ...player.pos };
  stepBattle(state, { ...player.pos }, EPSILON);
  near(player.spin, spin - CONFIG.playerSpinDrain * EPSILON);
  assert.ok(player.alive);
  state.time += CONFIG.hitCooldown;
  enemy.pos = { ...player.pos };
  stepBattle(state, { ...player.pos }, EPSILON);
  assert.equal(player.alive, false);
  assert.equal(state.outcome, 'failure');
});

void test('enemy death counts a kill and drops every remaining weapon', () => {
  const { state, enemy } = fixture();
  enemy.spin = 0;
  enemy.weapons = ['axe', 'whip', null, null, null, null];
  stepBattle(state, { x: 0, y: 0 }, EPSILON);
  assert.equal(state.kills, 1);
  assert.deepEqual(state.drops.map(drop => drop.weapon), ['axe', 'whip']);
  assert.equal(state.outcome, 'success');
});

void test('loot fills only free player slots after availability delay', () => {
  const { state, player } = fixture();
  player.weapons = ['sword', 'sword', 'sword', 'sword', 'sword', null];
  state.drops = ['axe', 'whip'].map((weapon, i) => ({
    id: 100 + i, pos: { ...player.pos }, weapon: weapon as Weapon, availableAt: 0.1,
  }));
  stepBattle(state, { ...player.pos }, 0.05);
  assert.equal(player.weapons[5], null);
  stepBattle(state, { ...player.pos }, 0.1);
  assert.equal(player.weapons[5], 'axe');
  assert.equal(state.drops.length, 1);
  assert.equal(state.drops[0].weapon, 'whip');
});

void test('arena bounds, finite numbers, spin bounds and slot limits survive long simulation', () => {
  const state = createBattle(65535, 'survival', KIT, 1);
  for (let i = 0; i < 3600 && !state.outcome; i++) {
    stepBattle(state, { x: Math.cos(i / 100) * 4, y: Math.sin(i / 100) * 4 }, 1 / 60);
    for (const ant of state.ants) {
      assert.ok(Number.isFinite(ant.pos.x + ant.pos.y + ant.vel.x + ant.vel.y + ant.spin));
      assert.ok(Math.hypot(ant.pos.x, ant.pos.y) <= CONFIG.arenaRadius - ant.radius + 1e-7);
      assert.ok(ant.spin >= 0 && ant.spin <= ant.maxSpin);
      assert.equal(ant.weapons.length, 6);
    }
  }
});

void test('invalid time is ignored, oversized frames are bounded, and terminal battles freeze', () => {
  const { state, player } = fixture();
  for (const dt of [NaN, Infinity, -1, 0]) stepBattle(state, { x: 1, y: 1 }, dt);
  assert.equal(state.time, 0);
  stepBattle(state, { x: NaN, y: Infinity }, 99);
  near(state.time, CONFIG.maximumFrameTime);
  assert.ok(Number.isFinite(player.pos.x + player.pos.y));
  state.outcome = 'success';
  const before = structuredClone(state);
  stepBattle(state, { x: 1, y: 1 }, 0.1);
  assert.deepEqual(state, before);
});

void test('elimination uses quota; survival starts its countdown only at quota', () => {
  const elimination = createBattle(1, 'elimination', KIT, 1);
  elimination.kills = elimination.targetKills - 1;
  updateObjectives(elimination);
  assert.equal(elimination.outcome, null);
  elimination.kills++;
  updateObjectives(elimination);
  assert.equal(elimination.outcome, 'success');
  const survival = createBattle(1, 'survival', KIT, 1);
  survival.time = 99;
  updateObjectives(survival);
  assert.equal(survival.survivalStarted, null);
  survival.kills = survival.targetKills;
  updateObjectives(survival);
  assert.equal(survival.survivalStarted, 99);
  assert.equal(survival.outcome, null);
  survival.time += survival.survivalDuration;
  updateObjectives(survival);
  assert.equal(survival.outcome, 'success');
  survival.ants[0].alive = false;
  updateObjectives(survival);
  assert.equal(survival.outcome, 'failure');
});

void test('boss has no reinforcements and telegraphs before a locked-direction dash', () => {
  const state = createBattle(1, 'boss', KIT, 1);
  const boss = state.ants[1];
  state.time = boss.nextDash;
  updateOpponents(state, 1 / 120);
  assert.ok(boss.telegraphUntil > state.time);
  assert.equal(boss.dashUntil, 0);
  const lockedTarget = { ...boss.dashTarget };
  state.ants[0].pos = { x: 0.8, y: 0.8 };
  state.time = boss.telegraphUntil;
  updateOpponents(state, 1 / 120);
  assert.ok(boss.dashUntil > state.time);
  near(boss.vel.x / boss.vel.y,
    (lockedTarget.x - boss.pos.x) / (lockedTarget.y - boss.pos.y));
  assert.equal(state.spawned, 1);
  assert.equal(state.ants.length, 2);
});

void test('substeps produce the same result as individual fixed steps', () => {
  const a = fixture();
  const b = fixture();
  const target = { x: -0.5, y: -0.2 };
  stepBattle(a.state, target, 0.1);
  run(b.state, target, 0.1);
  near(a.player.pos.x, b.player.pos.x);
  near(a.player.pos.y, b.player.pos.y);
  near(a.state.time, b.state.time);
});

void test('low RP weakens control and adds reproducible wobble independent of combat randomness', () => {
  function control(spin: number) {
    const { state, player } = fixture();
    player.spin = spin;
    player.vel = { x: 0.3, y: 0 };
    stepBattle(state, { ...player.pos }, CONFIG.maximumStep);
    return player.vel.x;
  }
  assert.ok(control(10) > control(100), 'low RP must respond more slowly to a stop command');
  function wobble(seed: number, spin: number) {
    const { state, player } = fixture();
    state.seed = seed;
    state.time = 1;
    player.spin = spin;
    stepBattle(state, { x: 1, y: 0 }, CONFIG.maximumStep);
    return Math.atan2(player.vel.y, player.vel.x);
  }
  const low = wobble(123, 10);
  assert.ok(Math.abs(low) > 0.05, 'low RP must visibly drift off the commanded heading');
  assert.ok(Math.abs(wobble(123, 100)) < 0.000001);
  assert.equal(low, wobble(123, 10));
  assert.equal(low, wobble(2147483648, 10));
});

void test('effectively zero RP snaps to death before favorable movement can regenerate', () => {
  for (const spin of [0, 0.1, CONFIG.minimumViableSpin]) {
    const { state, player } = fixture();
    player.pos = { x: 0.4, y: 0 };
    player.spin = spin;
    player.vel = { x: -0.2, y: -0.2 };
    player.regenRate = 7;
    stepBattle(state, { x: 0, y: -0.5 }, EPSILON);
    assert.equal(player.spin, 0);
    assert.equal(player.regenRate, 0);
    assert.equal(player.alive, false);
    assert.equal(state.outcome, 'failure');
    assert.ok(state.effects?.some(effect => effect.kind === 'splat' && effect.player));
  }
  const { state, player, enemy } = fixture();
  player.spin = 0.6;
  enemy.spin = 1;
  player.weapons = Array(6).fill('shield');
  enemy.weapons = Array(6).fill('shield');
  enemy.pos = { x: 0.05, y: 0 };
  stepBattle(state, { ...player.pos }, EPSILON);
  assert.equal(player.alive, false, 'a hit leaving fractional near-zero RP must kill immediately');
  assert.equal(player.spin, 0);
});

void test('hits cancel closing motion, separate both ants, and preserve the push during recovery', () => {
  const { state, player, enemy } = fixture();
  enemy.pos = { x: 0.05, y: 0 };
  player.vel = { x: 1, y: 0 };
  enemy.vel = { x: -1, y: 0 };
  player.weapons = Array(6).fill('shield');
  enemy.weapons = Array(6).fill('shield');
  stepBattle(state, { x: 1, y: 0 }, EPSILON);
  assert.ok(player.vel.x < -CONFIG.collisionImpulse);
  assert.ok(enemy.vel.x > CONFIG.collisionImpulse);
  assert.ok((player.knockbackUntil ?? 0) > state.time);
  assert.ok((enemy.knockbackUntil ?? 0) > state.time);
  const separation = enemy.pos.x - player.pos.x;
  const playerPush = player.vel.x;
  const enemyPush = enemy.vel.x;
  stepBattle(state, { x: 1, y: 0 }, CONFIG.maximumStep);
  assert.ok(enemy.pos.x - player.pos.x > separation);
  near(player.vel.x, playerPush);
  near(enemy.vel.x, enemyPush);
  assert.equal(player.regenRate, 0);
});

void test('collision deaths emit directional splats and contact impacts', () => {
  const { state, player, enemy } = fixture();
  enemy.weapons.fill(null);
  enemy.pos = { x: 0.05, y: 0 };
  stepBattle(state, { ...player.pos }, EPSILON);
  const splats = state.effects!.filter(item => item.kind === 'splat');
  assert.equal(splats.length, CONFIG.splatParticles);
  assert.ok(splats.every(item => !item.player && item.vel.x > 0));
  assert.ok(state.effects!.some(item => item.kind === 'impact'));
  assert.ok(state.effects!.every(item => item.id < 0));
});

void test('dust is sparse and bounded and cosmetic events do not consume gameplay IDs or RNG', () => {
  const { state, player } = fixture();
  const seed = state.seed;
  const nextId = state.nextId;
  player.vel = { x: 0.3, y: 0 };
  stepBattle(state, { x: 0.6, y: 0 }, 0.25);
  const dust = state.effects!.filter(item => item.kind === 'dust');
  assert.ok(dust.length >= 1 && dust.length <= 3);
  assert.equal(state.seed, seed);
  assert.equal(state.nextId, nextId);
  assert.ok(new Set(state.effects!.map(item => item.id)).size === state.effects!.length);
  const bornAt = state.time;
  state.effects = Array.from({ length: CONFIG.maximumEffects }, (_, i) => ({
    id: -i - 1, kind: 'dust', pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 },
    bornAt, duration: 0.01, player: true, size: 0.01,
  }));
  stepBattle(state, { x: 0.6, y: 0 }, 0.1);
  assert.ok(state.effects!.length <= CONFIG.maximumEffects);
  assert.ok(state.effects!.every(item => item.bornAt + item.duration > state.time));
});

void test('drops expire after ten seconds and expired drops cannot fill an empty slot', () => {
  const { state, player } = fixture();
  player.weapons[0] = null;
  state.drops.push({ id: 1000, pos: { ...player.pos }, weapon: 'axe', availableAt: 0, expiresAt: 0.01 });
  state.time = 0.01;
  stepBattle(state, { ...player.pos }, EPSILON);
  assert.equal(player.weapons[0], null);
  assert.equal(state.drops.length, 0);
  const death = fixture();
  death.enemy.spin = 0;
  stepBattle(death.state, { ...death.player.pos }, EPSILON);
  assert.ok(death.state.drops.length > 0);
  for (const drop of death.state.drops) near(drop.expiresAt!, death.state.time + CONFIG.dropLifetime);
});

void test('regenRate reports actual recovery, clears without recovery, and respects the RP cap', () => {
  const { state, player } = fixture();
  player.pos = { x: 0.4, y: 0 };
  player.spin = 50;
  const heading = recoveryHeading(player);
  player.vel = { x: heading.x * 0.3, y: heading.y * 0.3 };
  const before = player.spin;
  stepBattle(state, { x: player.pos.x + heading.x, y: player.pos.y + heading.y }, CONFIG.maximumStep);
  const recovered = player.spin - before + CONFIG.playerSpinDrain * CONFIG.maximumStep;
  near(player.regenRate!, recovered / CONFIG.maximumStep);
  assert.ok(player.regenRate! > 0);
  player.lastHit = state.time;
  stepBattle(state, { x: 0, y: -1 }, CONFIG.maximumStep);
  assert.equal(player.regenRate, 0);
  player.lastHit = -Infinity;
  player.spin = player.maxSpin;
  const atCap = recoveryHeading(player);
  player.vel = { x: atCap.x * 0.3, y: atCap.y * 0.3 };
  stepBattle(state, { x: player.pos.x + atCap.x, y: player.pos.y + atCap.y }, CONFIG.maximumStep);
  assert.equal(player.spin, player.maxSpin);
  near(player.regenRate!, CONFIG.playerSpinDrain);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { awardRunXP, createEncounterContext, resolveEncounterStats, RUN_STAT_LIMITS } from '../../lib/player-stats.ts';
import { advanceShift, createShiftReceipt, stopShiftMotion, shiftEarnings, FOODS_TO_FULL_SIZE, GROWTH_SPEED, MOVE_SPEED, CATCH_Y, characterGeometry, createShift, HORIZON_Y, ITEM_RADIUS, THROW_MIN, THROW_MAX, MIN_THROW_STEP, MAX_THROW_STEP, LAST_THROW, MAX_SIZE, MIN_SIZE, projectDrop, SHIFT_SECONDS, targetSize, TARGET_SCORE, WIDTH } from './engine.ts';

const SAMPLE_AIMS = [THROW_MIN, 270, 400, 530, THROW_MAX];
const quiet = (overrides = {}) => ({ ...createShift(42), nextDrop: Infinity, bagAt: null, ...overrides });
const incoming = (kind, id = 0, x = WIDTH / 2) => ({ id, kind, x, progress: 0.99, travel: 1 });
const catchOne = (state, kind) => advanceShift({ ...state, drops: [incoming(kind, state.nextId)] , nextId: state.nextId + 1 }, 0.02, 0);

test('same encounter seed gives identical throws, timing and outcomes', () => {
  const run = () => {
    let state = createShift(14021);
    for (let i = 0; i < 1800; i++) state = advanceShift(state, 1 / 60, i % 240 < 120 ? -1 : 1);
    return state;
  };
  assert.deepEqual(run(), run());
  assert.notDeepEqual(createShift(42), createShift(43));
});

test('meal needs three different foods, awards +6 and resets without bonus growth', () => {
  let state = quiet();
  for (const kind of ['burger', 'burger', 'fries', 'shake']) state = catchOne(state, kind);
  assert.equal(state.score, 14);
  assert.equal(state.eaten, 4);
  assert.equal(state.meals, 1);
  assert.deepEqual(state.tray, { burger: false, fries: false, shake: false });
  assert.equal(catchOne(state, 'shake').meals, 1);
});

test('third plant ends shift immediately', () => {
  let state = quiet();
  for (const kind of ['apple', 'broccoli', 'salad']) state = catchOne(state, kind);
  assert.equal(state.strikes, 3);
  assert.equal(state.eaten, 0);
  assert.equal(state.outcome, 'failure');
});

test('bag payday adds25 without growth and still requires survival', () => {
  const state = catchOne(quiet({ score: TARGET_SCORE - 25, bagBomb: false }), 'mystery');
  assert.equal(state.score, TARGET_SCORE);
  assert.equal(state.eaten, 0);
  assert.equal(state.outcome, null);
  assert.equal(advanceShift(state, 30, 0).outcome, 'success');
});

test('bomb is instant failure even above the score target', () => {
  const state = catchOne(quiet({ score: TARGET_SCORE + 10, bagBomb: true }), 'mystery');
  assert.equal(state.outcome, 'failure');
  assert.match(state.message, /PROMOTED TO CUSTOMER/);
});

test('missed food, plants and bags have no penalty and disappear once', () => {
  const state = advanceShift(quiet({ drops: ['burger', 'apple', 'mystery'].map((kind, id) => incoming(kind, id, SAMPLE_AIMS[0])) }), 0.1, 0);
  assert.equal(state.score, 0);
  assert.equal(state.strikes, 0);
  assert.equal(state.drops.length, 0);
  assert.equal(state.bite, null);
});

test('timeout decides success by target while earlier points do not end play', () => {
  assert.equal(advanceShift(quiet(), 30, 0).outcome, 'failure');
  const state = quiet({ score: TARGET_SCORE });
  assert.equal(advanceShift(state, 10, 0).outcome, null);
  assert.equal(advanceShift(state, 30, 0).outcome, 'success');
});

test('terminal state is inert and earlier state is not mutated', () => {
  const state = quiet({ drops: [incoming('burger')] });
  const snapshot = structuredClone(state);
  assert.equal(advanceShift(state, 0.02, 0).score, 2);
  assert.deepEqual(state, snapshot);
  const finished = catchOne(quiet({ bagBomb: true }), 'mystery');
  assert.strictEqual(advanceShift(finished, 1, 1), finished);
});

test('first terminal collision prevents later score events in same step', () => {
  const state = advanceShift(quiet({ strikes: 2, drops: [incoming('apple'), incoming('burger', 1)] }), 0.02, 0);
  assert.equal(state.outcome, 'failure');
  assert.equal(state.score, 0);
});

test('growth remains bounded and keeps mouth at fixed arrival line', () => {
  assert.equal(targetSize(0), MIN_SIZE);
  assert.equal(targetSize(FOODS_TO_FULL_SIZE / 2), (MIN_SIZE + MAX_SIZE) / 2);
  assert.equal(targetSize(99), MAX_SIZE);
  for (const size of [MIN_SIZE, 200, MAX_SIZE]) {
    assert.equal(characterGeometry({ player: 400, size }).y, CATCH_Y);
  }
  const growing = advanceShift(quiet({ eaten: 99 }), 0.1, 0);
  assert.ok(Math.abs(growing.size - MIN_SIZE - GROWTH_SPEED * 0.1) < 1e-8);
  assert.equal(advanceShift(growing, 5, 0).size, MAX_SIZE);
});

test('larger mouth catches food and plants equally at the same arrival time', () => {
  for (const kind of ['burger', 'apple']) {
    const drop = incoming(kind, 0, 400 + 85);
    assert.equal(advanceShift(quiet({ drops: [drop] }), 0.02, 0).drops.length, 0);
    assert.equal(advanceShift(quiet({ drops: [drop] }), 0.02, 0).bite, null);
    const large = advanceShift(quiet({ size: MAX_SIZE, eaten: FOODS_TO_FULL_SIZE, drops: [drop] }), 0.02, 0);
    assert.equal(large.score, kind === 'burger' ? 2 : 0);
    assert.equal(large.strikes, kind === 'apple' ? 1 : 0);
  }
});

test('growth never catches food before it reaches the foreground', () => {
  const item = { ...incoming('burger'), progress: 0, travel: 2.5 };
  for (const size of [MIN_SIZE, MAX_SIZE]) {
    const state = advanceShift(quiet({ size, eaten: FOODS_TO_FULL_SIZE, drops: [item] }), 2.4, 0);
    assert.equal(state.score, 0);
    assert.equal(state.drops.length, 1);
    assert.equal(advanceShift(state, 0.11, 0).score, 2);
  }
});

test('edge and interior landing points are reachable at maximum size', () => {
  const half = characterGeometry({ player: 400, size: MAX_SIZE }).mouthHalfWidth + ITEM_RADIUS;
  for (const x of SAMPLE_AIMS) {
    assert.ok(x >= MAX_SIZE / 2 && x <= WIDTH - MAX_SIZE / 2);
    for (const neighbour of SAMPLE_AIMS.filter(other => other !== x)) {
      assert.ok(Math.abs(neighbour - x) > half);
      const state = advanceShift(quiet({ player: x, size: MAX_SIZE, eaten: FOODS_TO_FULL_SIZE, drops: [incoming('apple', 0, neighbour)] }), 0.02, 0);
      assert.equal(state.strikes, 0);
    }
  }
});

test('growth at walls stays on-screen and steering speed stays constant', () => {
  for (const player of [MIN_SIZE / 2, WIDTH - MIN_SIZE / 2]) {
    const grown = advanceShift(quiet({ player, eaten: FOODS_TO_FULL_SIZE }), 5, 0);
    assert.ok(grown.player >= MAX_SIZE / 2 && grown.player <= WIDTH - MAX_SIZE / 2);
  }
  assert.equal(advanceShift(quiet(), 0.1, 1).player, advanceShift(quiet({ size: MAX_SIZE, eaten: FOODS_TO_FULL_SIZE }), 0.1, 1).player);
});

test('projection converges at the far end and matches actual catch positions', () => {
  assert.equal(projectDrop(400, 0).y, HORIZON_Y);
  for (const x of SAMPLE_AIMS) {
    const distant = projectDrop(x, 0);
    const middle = projectDrop(x, 0.5);
    const arrival = projectDrop(x, 1);
    assert.equal(arrival.x, x);
    assert.equal(arrival.y, CATCH_Y);
    assert.equal(arrival.scale, 1.25);
    assert.ok(Math.abs(distant.x - 416) <= Math.abs(middle.x - 416));
    assert.ok(distant.scale < middle.scale && middle.scale < arrival.scale);
  }
});

test('large time steps still resolve an arrival exactly once', () => {
  const state = advanceShift(quiet({ drops: [{ ...incoming('burger'), progress: 0, travel: 0.002 }] }), 1, 0);
  assert.equal(state.score, 2);
  assert.equal(state.eaten, 1);
  assert.equal(state.drops.length, 0);
});

test('throw and bite timestamps are stable with zero elapsed time and reset on remount', () => {
  const thrown = advanceShift(createShift(42), 0.7, 0);
  assert.equal(thrown.wave, 1);
  assert.ok(thrown.lastThrow > 0);
  const caught = catchOne(quiet(), 'burger');
  assert.equal(caught.bite.points, 2);
  assert.equal(caught.bite.kind, 'burger');
  assert.strictEqual(advanceShift(caught, 0, 0), caught);
  assert.equal(createShift(42).bite, null);
  assert.equal(createShift(42).lastThrow, -1);
});

test('free throws have safe warmup, bounded movement and no late deliveries', () => {
  for (let seed = 0; seed < 100; seed++) {
    let state = createShift(seed); let lastAim = 400; let lastWave = 0;
    for (let i = 0; i < SHIFT_SECONDS * 120; i++) {
      // Inspect the entire schedule independently of stationary-player strike or bomb losses.
      state = advanceShift({ ...state, strikes: 0, bagBomb: false }, 1 / 120, 0);
      if (state.wave !== lastWave) {
        assert.ok(Math.abs(state.aim - lastAim) <= MAX_THROW_STEP + 1e-8);
        assert.ok(Math.abs(state.aim - lastAim) >= MIN_THROW_STEP - 1e-8);
        assert.ok(state.aim >= THROW_MIN && state.aim <= THROW_MAX);
        assert.ok(state.lastThrow <= LAST_THROW);
        const newest = state.drops.filter(drop => drop.progress < 0.01);
        assert.ok(newest.every(drop => state.lastThrow + drop.travel < SHIFT_SECONDS));
        if (state.wave <= 4) assert.ok(newest.every(drop => ['burger', 'fries', 'shake'].includes(drop.kind)));
        if (newest.length === 2) assert.notEqual(newest[0].x, newest[1].x);
        lastAim = state.aim; lastWave = state.wave;
      }
    }
    assert.ok(state.wave >= 28);
    assert.equal(state.drops.length, 0);
  }
});

test('bag is rare, can be either outcome and is thrown at most once', () => {
  let bags = 0; let bombs = 0;
  for (let seed = 0; seed < 1000; seed++) {
    let state = createShift(seed); const ids = new Set();
    if (state.bagAt !== null) { bags++; if (state.bagBomb) bombs++; }
    for (let i = 0; i < 300; i++) {
      // Stand outside all lanes to inspect all scheduled throws without eating bags.
      state = advanceShift({ ...state, player: MIN_SIZE / 2, strikes: 0, outcome: null }, 0.1, 0);
      for (const drop of state.drops) if (drop.kind === 'mystery') ids.add(drop.id);
    }
    assert.ok(ids.size <= 1);
  }
  assert.ok(bags > 250 && bags < 450);
  assert.ok(bombs / bags > 0.15 && bombs / bags < 0.25);
});

test('invalid elapsed time and movement cannot corrupt the game', () => {
  const state = quiet();
  for (const time of [0, -1, Infinity, NaN]) assert.strictEqual(advanceShift(state, time, 0), state);
  assert.equal(advanceShift(state, 1, NaN).player, 400);
});


test('landing points are continuous and paired plants remain avoidable at full size', () => {
  let state = createShift(95); const targets = new Set();
  const maxReach = characterGeometry({ player: 400, size: MAX_SIZE }).mouthHalfWidth + ITEM_RADIUS;
  for (let i = 0; i < 300; i++) {
    state = advanceShift({ ...state, strikes: 0 }, 0.1, 0);
    targets.add(state.aim);
    for (const food of state.drops.filter(drop => ['burger', 'fries', 'shake'].includes(drop.kind))) {
      const paired = state.drops.find(drop => ['apple', 'broccoli', 'salad'].includes(drop.kind) && drop.travel === food.travel);
      if (paired) assert.ok(Math.abs(food.x - paired.x) > maxReach);
    }
  }
  assert.ok(targets.size > 20);
  assert.ok([...targets].some(x => x !== Math.round(x)));
});

test('free throws start at the hand and stay visible inside the zoomed camera', () => {
  for (const target of [THROW_MIN, 400, THROW_MAX]) {
    assert.equal(projectDrop(target, 0).x, 416);
    assert.equal(projectDrop(target, 0).y, HORIZON_Y);
    let previousY = -Infinity;
    for (let p = 0; p <= 1; p += 0.02) {
      const image = projectDrop(target, p);
      const half = 64 * image.scale / 2;
      assert.ok(image.x - half >= 100 && image.x + half <= 700);
      assert.ok(image.y >= previousY);
      previousY = image.y;
    }
  }
});


test('movement accelerates quickly without an instant velocity jump', () => {
  const start = quiet();
  const moving = advanceShift(start, 0.025, 1);
  assert.ok(moving.velocity > 0 && moving.velocity < MOVE_SPEED);
  assert.ok(moving.player > start.player && moving.player < start.player + MOVE_SPEED * 0.025);
  assert.ok(Math.abs(advanceShift(start, 0.1, 1).velocity - MOVE_SPEED) < 1e-8);
});

test('releasing input brakes promptly to exact zero without creeping', () => {
  const moving = quiet({ velocity: MOVE_SPEED });
  const stopped = advanceShift(moving, 0.08, 0);
  assert.equal(stopped.velocity, 0);
  assert.ok(stopped.player - moving.player > 0 && stopped.player - moving.player < 20);
  assert.equal(advanceShift(stopped, 1, 0).player, stopped.player);
});

test('direction reversal starts turning within80ms with bounded overshoot', () => {
  const moving = quiet({ velocity: MOVE_SPEED });
  const turning = advanceShift(moving, 0.08, -1);
  assert.ok(turning.velocity < 0);
  assert.ok(turning.player - moving.player < 22);
  assert.equal(advanceShift(moving, 0.25, -1).velocity, -MOVE_SPEED);
});

test('walls remove outward velocity and allow immediate movement back in', () => {
  const boundary = quiet({ player: WIDTH - MIN_SIZE / 2 - 1, velocity: MOVE_SPEED });
  const touched = advanceShift(boundary, 0.025, 1);
  assert.equal(touched.player, WIDTH - MIN_SIZE / 2);
  assert.equal(touched.velocity, 0);
  assert.ok(advanceShift(touched, 0.025, -1).player < touched.player);
});

test('focus loss clears momentum without resetting shift time, position or events', () => {
  const moving = advanceShift(quiet(), 0.1, 1);
  const stopped = stopShiftMotion(moving);
  assert.equal(stopped.velocity, 0);
  assert.equal(stopped.elapsed, moving.elapsed);
  assert.equal(stopped.player, moving.player);
  assert.equal(stopped.bite, moving.bite);
  assert.notEqual(moving.velocity, 0);
  assert.strictEqual(stopShiftMotion(stopped), stopped);
  assert.equal(advanceShift(stopped, 0.1, 0).player, stopped.player);
});

test('successful shifts bank the floor reward with a capped extra-food bonus', () => {
  const pay = (score, floor = 1) => shiftEarnings({ score, outcome: 'success' }, floor);
  assert.equal(pay(48), 40);
  assert.equal(pay(49), 40);
  assert.equal(pay(50), 41);
  assert.equal(pay(68), 50);
  assert.equal(pay(88), 60);
  assert.equal(pay(200), 60);
  assert.equal(pay(48, 3), 50);
  assert.equal(pay(88, 3), 70);
});

test('unfinished, timed-out and bombed shifts pay nothing even with a high score', () => {
  assert.equal(shiftEarnings(quiet({ score: 100 }), 1), 0);
  assert.equal(shiftEarnings(advanceShift(quiet({ score: 47 }), 30, 0), 1), 0);
  const bombed = catchOne(quiet({ score: 100, bagBomb: true }), 'mystery');
  assert.equal(shiftEarnings(bombed, 1), 0);
  const thirdPlant = catchOne(quiet({ score: 100, strikes: 2 }), 'apple');
  assert.equal(shiftEarnings(thirdPlant, 1), 0);
});

test('reported earnings replace default XP once and preserve normal health rules', () => {
  const context = createEncounterContext({ seed: 42, floor: 1, cellId: 2 }, {
    health: 5, maxHealth: 5, xp: 90,
    upgrades: { armor: 1, repair: 0, salvage: 0 },
    profile: { shards: 0, bestFloor: 1, totalDisarmed: 0 },
  });
  const before = structuredClone(context);
  for (const outcome of ['success', 'failure']) {
    const earnings = shiftEarnings({ score: 68, outcome }, context.floor);
    const result = { outcome, playerStats: { xp: awardRunXP(context.player.xp, earnings) } };
    const stats = resolveEncounterStats(context.player, result, 40);
    assert.equal(stats.xp, outcome === 'success' ? 140 : 90);
    assert.equal(stats.health, outcome === 'success' ? 5 : 4);
    assert.deepEqual(stats.upgrades, context.player.upgrades);
  }
  const cappedPlayer = { ...context.player, xp: RUN_STAT_LIMITS.xp - 5 };
  const capped = resolveEncounterStats(cappedPlayer, {
    outcome: 'success', playerStats: { xp: awardRunXP(cappedPlayer.xp, 60) },
  }, 40);
  assert.equal(capped.xp, RUN_STAT_LIMITS.xp);
  assert.deepEqual(context, before);
});

test('a long background-frame gap advances to shift end instead of granting a break', () => {
  const state = quiet({ score: 68, elapsed: 5, velocity: MOVE_SPEED });
  const finished = advanceShift(stopShiftMotion(state), 60, 0);
  assert.equal(finished.elapsed, SHIFT_SECONDS);
  assert.equal(finished.outcome, 'success');
  assert.equal(finished.player, state.player);
  assert.equal(shiftEarnings(finished, 1), 50);
  const unpaid = advanceShift(stopShiftMotion(quiet({ elapsed: 5 })), 60, 0);
  assert.equal(unpaid.outcome, 'failure');
  assert.equal(shiftEarnings(unpaid, 1), 0);
});

test('receipt records the completed shift without recalculating or inflating actual earnings', () => {
  const shift = quiet({ outcome: 'success', score: 88, meals: 5, strikes: 2, elapsed: 30 });
  const receipt = createShiftReceipt(shift, 60, 0);
  assert.deepEqual(receipt, { outcome: 'success', score: 88, meals: 5, strikes: 2, xp: 60, healthLost: 0, seconds: 30 });
  shift.score = 900;
  shift.meals = 90;
  assert.equal(receipt.score, 88);
  assert.equal(receipt.meals, 5);
  assert.ok(Object.isFrozen(receipt));
});

test('bomb and timeout receipts preserve earned food but report zero pay and actual damage', () => {
  const bomb = catchOne(quiet({ score: 80, meals: 4, bagBomb: true, elapsed: 14 }), 'mystery');
  const bombReceipt = createShiftReceipt(bomb, 0, 2);
  assert.equal(bombReceipt.outcome, 'failure');
  assert.equal(bombReceipt.score, 80);
  assert.equal(bombReceipt.meals, 4);
  assert.equal(bombReceipt.xp, 0);
  assert.equal(bombReceipt.healthLost, 2);
  assert.equal(bombReceipt.seconds, 15);
  const timedOut = advanceShift(quiet({ score: 47 }), 30, 0);
  assert.equal(createShiftReceipt(timedOut, 0, 1).seconds, 30);
  assert.equal(createShiftReceipt(timedOut, 0, 1).healthLost, 1);
});

test('receipt uses the capped XP delta and cancellation or a fresh shift has no receipt', () => {
  const player = { health: 1, maxHealth: 5, xp: RUN_STAT_LIMITS.xp - 3, upgrades: { armor: 0, repair: 0, salvage: 0 } };
  const shift = quiet({ outcome: 'success', score: 88, elapsed: 30 });
  const final = resolveEncounterStats(player, {
    outcome: shift.outcome, playerStats: { xp: awardRunXP(player.xp, shiftEarnings(shift, 1)) },
  }, 40);
  assert.equal(createShiftReceipt(shift, final.xp - player.xp, player.health - final.health).xp, 3);
  assert.equal(createShiftReceipt(quiet({ score: 80 }), 0, 0), null);
  assert.equal(createShiftReceipt(createShift(123), 0, 0), null);
});

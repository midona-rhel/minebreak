/** Seeded food-toss rules. The host applies reported XP and owns health. */
export const SHIFT_SECONDS = 30;
export const TARGET_SCORE = 48;
export const WIDTH = 800;
export const HEIGHT = 480;
export const HORIZON_Y = 76;
export const MOVE_SPEED = 600;
export const ACCELERATION = 6000;
export const BRAKING = 10000;
export const REVERSAL = 9000;
export const CATCH_Y = 352;
export const MIN_SIZE = 160;
export const MAX_SIZE = 240;
export const FOODS_TO_FULL_SIZE = 12;
export const GROWTH_SPEED = 24;
export const ITEM_SIZE = 64;
export const ITEM_RADIUS = 32;
export const THROW_MIN = 140;
export const THROW_MAX = 660;
export const MIN_THROW_STEP = 130;
export const MAX_THROW_STEP = 260;
export const LAST_THROW = 27;
export type Food = 'burger' | 'fries' | 'shake';
export type ItemKind = Food | 'broccoli' | 'apple' | 'salad' | 'mystery';
export type Drop = { id: number; kind: ItemKind; x: number; progress: number; travel: number };
export type Shift = {
  seed: number; elapsed: number; nextDrop: number; nextId: number; wave: number; aim: number; lastThrow: number;
  player: number; velocity: number; size: number; eaten: number; score: number; strikes: number; meals: number;
  tray: Record<Food, boolean>; drops: Drop[]; bagAt: number | null; bagBomb: boolean;
  bite: { id: number; at: number; kind: ItemKind; points: number } | null;
  outcome: 'success' | 'failure' | null; message: string;
};

export function targetSize(eaten: number): number {
  return MIN_SIZE + (MAX_SIZE - MIN_SIZE) * Math.min(1, Math.max(0, eaten) / FOODS_TO_FULL_SIZE);
}

export function characterGeometry(state: Pick<Shift, 'player' | 'size'>) {
  return { x: state.player, y: CATCH_Y, size: state.size, mouthHalfWidth: state.size * 0.28 };
}

/** Every toss starts near the worker hand and arrives at its actual catch coordinate. */
export function projectDrop(x: number, progress: number) {
  const depth = Math.max(0, progress);
  const scale = 0.6 + 0.65 * depth;
  return { x: WIDTH * 0.52 + (x - WIDTH * 0.52) * depth,
    y: HORIZON_Y + (CATCH_Y - HORIZON_Y) * depth - Math.sin(Math.PI * Math.min(1, depth)) * 40, scale };
}

function random(state: Shift): number {
  state.seed = (state.seed + 0x6d2b79f5) >>> 0;
  let value = state.seed;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

export function createShift(seed: number): Shift {
  const state: Shift = {
    seed: seed >>> 0, elapsed: 0, nextDrop: 0.6, nextId: 0, wave: 0, aim: WIDTH / 2, lastThrow: -1,
    player: WIDTH / 2, velocity: 0, size: MIN_SIZE, eaten: 0, score: 0, strikes: 0, meals: 0,
    tray: { burger: false, fries: false, shake: false }, drops: [], bagAt: null, bagBomb: false, bite: null,
    outcome: null, message: 'NOW WORK.',
  };
  if (random(state) < 0.35) state.bagAt = 11 + random(state) * 7;
  state.bagBomb = random(state) < 0.2;
  return state;
}

function catchDrop(state: Shift, drop: Drop) {
  const kind = drop.kind;
  const oldScore = state.score;
  if (kind === 'mystery') {
    if (state.bagBomb) { state.outcome = 'failure'; state.message = 'YOU HAVE BEEN PROMOTED TO CUSTOMER.'; }
    else { state.score += 25; state.message = 'PAYDAY. +25'; }
  } else if (kind === 'broccoli' || kind === 'apple' || kind === 'salad') {
    state.strikes += 1;
    state.message = state.strikes >= 3 ? 'CLOCK OUT.' : 'THAT’S A PLANT.';
    if (state.strikes >= 3) state.outcome = 'failure';
  } else {
    state.eaten += 1;
    state.score += kind === 'burger' ? 2 : kind === 'shake' ? 3 : 1;
    state.tray[kind] = true;
    state.message = state.eaten === FOODS_TO_FULL_SIZE ? 'MAXIMUM EMPLOYEE.' : 'NOM.';
    if (state.tray.burger && state.tray.fries && state.tray.shake) {
      state.score += 6;
      state.meals += 1;
      state.tray = { burger: false, fries: false, shake: false };
      state.message = 'ORDER UP! +6';
    }
  }
  state.bite = { id: drop.id, at: state.elapsed, kind, points: state.score - oldScore };
}

function throwWave(state: Shift) {
  const previousAim = state.aim;
  const canLeft = previousAim - THROW_MIN >= MIN_THROW_STEP;
  const canRight = THROW_MAX - previousAim >= MIN_THROW_STEP;
  const goRight = canRight && (!canLeft || random(state) >= 0.5);
  const available = goRight ? THROW_MAX - previousAim : previousAim - THROW_MIN;
  const distance = MIN_THROW_STEP + random(state) * (Math.min(MAX_THROW_STEP, available) - MIN_THROW_STEP);
  state.aim = previousAim + (goRight ? distance : -distance);
  const foods: Food[] = ['burger', 'fries', 'shake'];
  const isBag = state.bagAt !== null && state.elapsed >= state.bagAt;
  const kind: ItemKind = isBag ? 'mystery' : foods[Math.floor(random(state) * foods.length)];
  // Shared travel time prevents a later wave overtaking an earlier one.
  const travel = 2.8 - 0.65 * state.elapsed / SHIFT_SECONDS;
  state.drops.push({ id: state.nextId++, kind, x: state.aim, progress: 0, travel });
  if (isBag) state.bagAt = null;
  // First four deliveries are safe. Later every third delivery offers food beside a plant.
  // Every landing point is reachable at full size; the paired plant is safely separated.
  if (!isBag && state.wave >= 4 && state.wave % 3 === 1) {
    const plants: ItemKind[] = ['broccoli', 'apple', 'salad'];
    state.drops.push({ id: state.nextId++, kind: plants[Math.floor(random(state) * plants.length)],
      x: previousAim, progress: 0, travel });
  }
  state.wave += 1;
  state.lastThrow = state.elapsed;
}

/** Drop stale momentum when focus is lost; the shift clock still advances. */
export function stopShiftMotion(state: Shift): Shift {
  return state.velocity === 0 ? state : { ...state, velocity: 0 };
}

/** Advance elapsed shift time, including catch-up after hidden or throttled frames. */
export function advanceShift(previous: Shift, seconds: number, direction: number): Shift {
  if (previous.outcome || !Number.isFinite(seconds) || seconds <= 0) return previous;
  const state: Shift = { ...previous, tray: { ...previous.tray }, drops: previous.drops.map(drop => ({ ...drop })) };
  const movement = Number.isFinite(direction) ? Math.max(-1, Math.min(1, direction)) : 0;
  let remaining = Math.min(seconds, SHIFT_SECONDS - state.elapsed);
  while (remaining > 0 && !state.outcome) {
    const dt = Math.min(remaining, 1 / 120);
    remaining -= dt;
    state.elapsed = Math.min(SHIFT_SECONDS, state.elapsed + dt);
    state.size = Math.min(targetSize(state.eaten), state.size + GROWTH_SPEED * dt);
    const previousX = state.player;
    const previousVelocity = state.velocity;
    const desiredVelocity = movement * MOVE_SPEED;
    const rate = movement === 0 ? BRAKING : state.velocity * movement < 0 ? REVERSAL : ACCELERATION;
    const difference = desiredVelocity - state.velocity;
    state.velocity += Math.sign(difference) * Math.min(Math.abs(difference), rate * dt);
    const position = state.player + (previousVelocity + state.velocity) * 0.5 * dt;
    state.player = Math.max(state.size / 2, Math.min(WIDTH - state.size / 2, position));
    if (state.player !== position
      || (state.player >= WIDTH - state.size / 2 && state.velocity > 0)
      || (state.player <= state.size / 2 && state.velocity < 0)) state.velocity = 0;
    const body = characterGeometry(state);
    state.nextDrop -= dt;
    if (state.nextDrop <= 0 && state.elapsed <= LAST_THROW) {
      throwWave(state);
      state.nextDrop += 0.98 - 0.2 * state.elapsed / SHIFT_SECONDS;
    }
    const alive: Drop[] = [];
    for (const drop of state.drops) {
      const before = drop.progress;
      drop.progress += dt / drop.travel;
      if (drop.progress >= 1) {
        const fraction = Math.max(0, Math.min(1, (1 - before) / (drop.progress - before)));
        const catchX = previousX + (state.player - previousX) * fraction;
        if (!state.outcome && Math.abs(drop.x - catchX) <= body.mouthHalfWidth + ITEM_RADIUS) catchDrop(state, drop);
      } else alive.push(drop);
    }
    state.drops = alive;
    if (!state.outcome && state.elapsed >= SHIFT_SECONDS - 0.000001) {
      state.elapsed = SHIFT_SECONDS;
      state.outcome = state.score >= TARGET_SCORE ? 'success' : 'failure';
      state.message = state.outcome === 'success' ? 'SHIFT OVER. COME BACK TOMORROW.' : 'NOT ENOUGH FOOD. CLOCK OUT.';
    }
  }
  return state;
}

/** Win to bank the normal floor reward plus a bounded bonus for extra food. */
export function shiftEarnings(state: Pick<Shift, 'score' | 'outcome'>, floor: number): number {
  if (state.outcome !== 'success') return 0;
  const extraFood = Math.max(0, state.score - TARGET_SCORE);
  return 35 + floor * 5 + Math.min(20, Math.floor(extraFood / 2));
}

import type { Ant, BattleState, Vec, Weapon } from './types';

export const OPPONENT_CONFIG = {
  enemySpinMin: 45,
  enemySpinMax: 65,
  enemySpeed: 0.26,
  enemyRadius: 0.045,
  bossSpin: 135,
  bossSpeed: 0.22,
  bossRadius: 0.065,
  steeringResponse: 2.4,
  separationDistance: 0.16,
  separationStrength: 1.8,
  spawnInterval: 3.6,
  survivalSpawnInterval: 2.8,
  maxLiveEnemies: 3,
  spawnRadius: 0.84,
  bossFirstDash: 3,
  bossDashCooldown: 4.5,
  bossTelegraphDuration: 0.95,
  bossDashDuration: 0.48,
  bossDashSpeed: 0.95,
} as const;

const WEAPONS: Weapon[] = ['shield', 'sword', 'axe', 'whip'];

function random(state: BattleState): number {
  state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
  return state.seed / 0x100000000;
}

function unit(x: number, y: number): Vec {
  const distance = Math.hypot(x, y);
  return distance > 0.00001 ? { x: x / distance, y: y / distance } : { x: 0, y: 0 };
}

/** Create one arrival. The simulation remains responsible for movement and deaths. */
export function spawnEnemy(state: BattleState): void {
  const player = state.ants.find((ant) => ant.player);
  if (state.outcome || !player?.alive || player.spin <= 0) return;
  const enemies = state.ants.filter((ant) => !ant.player && ant.alive);
  const boss = state.format === 'boss';
  if (boss ? state.spawned > 0 : enemies.length >= OPPONENT_CONFIG.maxLiveEnemies) return;
  if (state.format === 'elimination' && state.spawned >= state.targetKills) return;

  // Pick the clearest of several seeded entry points, avoiding arrivals on the player.
  const offset = random(state) * Math.PI * 2;
  let pos: Vec = { x: 0, y: 0 };
  let bestClearance = -1;
  for (let i = 0; i < 8; i++) {
    const angle = offset + (i * Math.PI * 2) / 8;
    const candidate = {
      x: Math.cos(angle) * OPPONENT_CONFIG.spawnRadius,
      y: Math.sin(angle) * OPPONENT_CONFIG.spawnRadius,
    };
    const clearance = Math.min(...[player, ...enemies].map((ant) =>
      Math.hypot(ant.pos.x - candidate.x, ant.pos.y - candidate.y)));
    if (clearance > bestClearance) {
      pos = candidate;
      bestClearance = clearance;
    }
  }

  const spin = boss ? OPPONENT_CONFIG.bossSpin :
    OPPONENT_CONFIG.enemySpinMin + random(state) *
    (OPPONENT_CONFIG.enemySpinMax - OPPONENT_CONFIG.enemySpinMin);
  const weapons: (Weapon | null)[] = Array(6).fill(null);
  const weaponCount = boss ? 6 : 2 + Math.floor(random(state) * 3);
  for (let i = 0; i < weaponCount; i++) weapons[i] = WEAPONS[Math.floor(random(state) * WEAPONS.length)];

  state.ants.push({
    id: state.nextId++, player: false, boss, pos, vel: { x: 0, y: 0 },
    angle: random(state) * Math.PI * 2, spinDirection: 1, spin, maxSpin: spin, weapons,
    radius: boss ? OPPONENT_CONFIG.bossRadius : OPPONENT_CONFIG.enemyRadius,
    lastHit: state.time, alive: true, dashUntil: 0,
    nextDash: boss ? state.time + OPPONENT_CONFIG.bossFirstDash : Infinity,
    telegraphUntil: 0, dashTarget: { ...player.pos },
  });
  state.spawned++;
  state.nextSpawn = state.time + (state.survivalStarted !== null
    ? OPPONENT_CONFIG.survivalSpawnInterval : OPPONENT_CONFIG.spawnInterval);
}

function bossVelocity(ant: Ant, player: Ant, state: BattleState, dt: number): boolean {
  if (ant.dashUntil > state.time) {
    const direction = unit(ant.dashTarget.x - ant.pos.x, ant.dashTarget.y - ant.pos.y);
    // dashTarget is a distant point on the original attack ray, never a moving player.
    ant.vel = { x: direction.x * OPPONENT_CONFIG.bossDashSpeed, y: direction.y * OPPONENT_CONFIG.bossDashSpeed };
    return true;
  }
  if (ant.telegraphUntil > 0) {
    if (state.time >= ant.telegraphUntil) {
      const direction = unit(ant.dashTarget.x - ant.pos.x, ant.dashTarget.y - ant.pos.y);
      ant.dashTarget = { x: ant.pos.x + direction.x * 4, y: ant.pos.y + direction.y * 4 };
      ant.telegraphUntil = 0;
      ant.dashUntil = state.time + OPPONENT_CONFIG.bossDashDuration;
      ant.nextDash = ant.dashUntil + OPPONENT_CONFIG.bossDashCooldown;
      ant.vel = { x: direction.x * OPPONENT_CONFIG.bossDashSpeed, y: direction.y * OPPONENT_CONFIG.bossDashSpeed };
    } else {
      const friction = Math.exp(-12 * dt);
      ant.vel.x *= friction;
      ant.vel.y *= friction;
    }
    return true;
  }
  if (state.time >= ant.nextDash) {
    ant.telegraphUntil = state.time + OPPONENT_CONFIG.bossTelegraphDuration;
    ant.dashTarget = { ...player.pos };
    const friction = Math.exp(-12 * dt);
    ant.vel.x *= friction;
    ant.vel.y *= friction;
    return true;
  }
  return false;
}

/** Set velocities only; stepBattle integrates every ant exactly once per step. */
export function updateOpponents(state: BattleState, dt: number): void {
  const player = state.ants.find((ant) => ant.player);
  if (state.outcome || !player?.alive || player.spin <= 0 || !Number.isFinite(dt) || dt <= 0) return;
  if (state.time >= state.nextSpawn) spawnEnemy(state);
  const enemies = state.ants.filter((ant) => !ant.player && ant.alive);
  const blend = 1 - Math.exp(-OPPONENT_CONFIG.steeringResponse * dt);

  for (const ant of enemies) {
    if (ant.boss && bossVelocity(ant, player, state, dt)) continue;
    const pursuit = unit(player.pos.x - ant.pos.x, player.pos.y - ant.pos.y);
    let steerX = pursuit.x;
    let steerY = pursuit.y;
    for (const other of enemies) {
      if (other.id === ant.id) continue;
      const dx = ant.pos.x - other.pos.x;
      const dy = ant.pos.y - other.pos.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= OPPONENT_CONFIG.separationDistance) continue;
      const away = distance > 0.00001 ? unit(dx, dy) : { x: ant.id < other.id ? -1 : 1, y: 0 };
      const pressure = (1 - distance / OPPONENT_CONFIG.separationDistance) * OPPONENT_CONFIG.separationStrength;
      steerX += away.x * pressure;
      steerY += away.y * pressure;
    }
    const radialDistance = Math.hypot(ant.pos.x, ant.pos.y);
    if (radialDistance > 0.85) {
      const inward = unit(-ant.pos.x, -ant.pos.y);
      const pressure = (radialDistance - 0.85) * 8;
      steerX += inward.x * pressure;
      steerY += inward.y * pressure;
    }
    const heading = unit(steerX, steerY);
    const speed = ant.boss ? OPPONENT_CONFIG.bossSpeed : OPPONENT_CONFIG.enemySpeed;
    ant.vel.x += (heading.x * speed - ant.vel.x) * blend;
    ant.vel.y += (heading.y * speed - ant.vel.y) * blend;
  }
}

/** Call after collisions so simultaneous defeat always takes precedence. */
export function updateObjectives(state: BattleState): void {
  if (state.outcome === 'failure') return;
  const player = state.ants.find((ant) => ant.player);
  if (!player?.alive || player.spin <= 0) {
    state.outcome = 'failure';
    return;
  }
  if (state.outcome) return;
  if (state.format === 'boss') {
    if (state.spawned > 0 && !state.ants.some((ant) => !ant.player && ant.alive)) state.outcome = 'success';
  } else if (state.format === 'elimination') {
    if (state.kills >= state.targetKills) state.outcome = 'success';
  } else {
    if (state.survivalStarted === null && state.kills >= state.targetKills) state.survivalStarted = state.time;
    if (state.survivalStarted !== null && state.time - state.survivalStarted >= state.survivalDuration) {
      state.outcome = 'success';
    }
  }
}

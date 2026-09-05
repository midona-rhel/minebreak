import type { Ant, BattleFormat, BattleState, Vec, Weapon } from './types';
import { spawnEnemy, updateObjectives, updateOpponents } from './opponents';

/** Arena units are normalized: the rim is radius 1 and time is seconds. */
export const CONFIG = {
  slots: 6,
  arenaRadius: 1,
  playerRadius: 0.045,
  playerSpin: 100,
  playerSpeed: 0.46,
  movementResponse: 4.2,
  arrivalDistance: 0.13,
  movementFlowStrength: 0.22,
  minimumMovementFactor: 0.35,
  regenerationDelay: 1.8,
  regenerationRate: 7,
  regenerationMinimumSpeed: 0.035,
  regenerationAlignment: 0.35,
  recoveryInwardWeight: 0.65,
  recoveryTangentBase: 0.15,
  recoveryTangentSpinWeight: 2,
  playerSpinDrain: 0.6,
  enemySpinDrain: 0.08,
  rotationRate: 0.085,
  collisionFactor: 0.17,
  impactBase: 0.65,
  impactSpeed: 0.65,
  tangentialImpactFactor: 0.25,
  maximumImpact: 2.4,
  weaponAdvantageMultiplier: 1.25,
  weaponDisadvantageMultiplier: 0.8,
  hitCooldown: 0.55,
  collisionImpulse: 0.13,
  weaponLossBaseChance: 0.12,
  weaponLossDamageBias: 0.9,
  maximumWeaponLossChance: 0.8,
  dropPickupDelay: 0.55,
  pickupDistance: 0.075,
  maximumStep: 1 / 120,
  maximumFrameTime: 0.25,
  killQuota: 6,
  killsPerFloor: 2,
  survivalSeconds: 20,
  survivalSecondsPerFloor: 2,
  maximumDifficultyFloor: 10,
};

const BEATS: Record<Weapon, Weapon> = {
  shield: 'sword', sword: 'whip', whip: 'axe', axe: 'shield',
};
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function weaponAdvantage(a: Weapon, b: Weapon): number {
  if (BEATS[a] === b) return CONFIG.weaponAdvantageMultiplier;
  if (BEATS[b] === a) return CONFIG.weaponDisadvantageMultiplier;
  return 1;
}

function random(state: BattleState): number {
  state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
  return state.seed / 4294967296;
}

export function createBattle(
  seed: number, format: BattleFormat, loadout: Weapon[], floor: number,
): BattleState {
  const difficulty = clamp(Number.isFinite(floor) ? Math.floor(floor) : 1, 1, CONFIG.maximumDifficultyFloor) - 1;
  const player: Ant = {
    id: 0, player: true, boss: false, pos: { x: 0, y: 0.3 }, vel: { x: 0, y: 0 },
    angle: 0, spinDirection: 1, spin: CONFIG.playerSpin, maxSpin: CONFIG.playerSpin,
    weapons: Array.from({ length: CONFIG.slots }, (_, i) => loadout[i] ?? null),
    radius: CONFIG.playerRadius, lastHit: -Infinity, alive: true,
    dashUntil: 0, nextDash: 0, telegraphUntil: 0, dashTarget: { x: 0, y: 0 },
  };
  const state: BattleState = {
    time: 0, ants: [player], drops: [], kills: 0, spawned: 0, nextSpawn: 0,
    survivalStarted: null, outcome: null, format,
    targetKills: format === 'boss' ? 1 : CONFIG.killQuota + difficulty * CONFIG.killsPerFloor,
    survivalDuration: CONFIG.survivalSeconds + difficulty * CONFIG.survivalSecondsPerFloor,
    seed: seed >>> 0, nextId: 1, contacts: {},
  };
  spawnEnemy(state);
  return state;
}

/** Shared slope/spin flow for travel speed and recovery, in canvas coordinates. */
function spiralFlow(ant: Ant): Vec {
  const radius = Math.hypot(ant.pos.x, ant.pos.y);
  if (radius < 1e-8) return { x: 0, y: 0 };
  const rx = ant.pos.x / radius;
  const ry = ant.pos.y / radius;
  const tangent = CONFIG.recoveryTangentBase + CONFIG.recoveryTangentSpinWeight
    * clamp(ant.spin / ant.maxSpin, 0, 1);
  const x = ry * ant.spinDirection * tangent - rx * CONFIG.recoveryInwardWeight;
  const y = -rx * ant.spinDirection * tangent - ry * CONFIG.recoveryInwardWeight;
  return { x, y };
}

/** Optimal inward recovery heading, opposite body rotation (canvas y points down). */
export function recoveryHeading(ant: Ant): Vec {
  const flow = spiralFlow(ant);
  const length = Math.hypot(flow.x, flow.y);
  return length > 0 ? { x: flow.x / length, y: flow.y / length } : flow;
}

function movePlayer(player: Ant, target: Vec, dt: number, time: number): void {
  const dx = target.x - player.pos.x;
  const dy = target.y - player.pos.y;
  const distance = Math.hypot(dx, dy);
  const radius = Math.hypot(player.pos.x, player.pos.y);
  const ux = distance > 1e-8 ? dx / distance : 0;
  const uy = distance > 1e-8 ? dy / distance : 0;
  const rx = radius > 1e-8 ? player.pos.x / radius : 0;
  const ry = radius > 1e-8 ? player.pos.y / radius : 0;
  // Project the same recovery flow onto cursor travel. Higher spin strengthens
  // opposite-rotation tangential assistance; the inward slope contribution stays fixed.
  const flow = spiralFlow(player);
  const movementFactor = Math.max(CONFIG.minimumMovementFactor,
    1 + CONFIG.movementFlowStrength * (flow.x * ux + flow.y * uy));
  const speed = CONFIG.playerSpeed * movementFactor
    * Math.min(1, distance / CONFIG.arrivalDistance);
  const response = 1 - Math.exp(-CONFIG.movementResponse * dt);
  player.vel.x += (ux * speed - player.vel.x) * response;
  player.vel.y += (uy * speed - player.vel.y) * response;

  const actualSpeed = Math.hypot(player.vel.x, player.vel.y);
  const heading = recoveryHeading(player);
  const alignment = actualSpeed > 1e-8
    ? (heading.x * player.vel.x + heading.y * player.vel.y) / actualSpeed : 0;
  const inwardTravel = -(rx * player.vel.x + ry * player.vel.y);
  const oppositeTravel = (ry * player.vel.x - rx * player.vel.y) * player.spinDirection;
  if (time - player.lastHit >= CONFIG.regenerationDelay
    && actualSpeed >= CONFIG.regenerationMinimumSpeed
    && inwardTravel > 0 && oppositeTravel > 0
    && alignment >= CONFIG.regenerationAlignment) {
    player.spin = Math.min(player.maxSpin,
      player.spin + CONFIG.regenerationRate * alignment ** 4 * dt);
  }
}

function integrate(ant: Ant, dt: number): void {
  ant.pos.x += ant.vel.x * dt;
  ant.pos.y += ant.vel.y * dt;
  ant.angle = (ant.angle + ant.spinDirection * ant.spin * CONFIG.rotationRate * dt) % (Math.PI * 2);
  contain(ant);
}

function contain(ant: Ant): void {
  const distance = Math.hypot(ant.pos.x, ant.pos.y);
  const limit = CONFIG.arenaRadius - ant.radius;
  if (distance <= limit || distance === 0) return;
  const nx = ant.pos.x / distance;
  const ny = ant.pos.y / distance;
  ant.pos.x = nx * limit;
  ant.pos.y = ny * limit;
  const outward = Math.max(0, ant.vel.x * nx + ant.vel.y * ny);
  ant.vel.x -= outward * nx;
  ant.vel.y -= outward * ny;
}

function equipped(ant: Ant): Weapon[] {
  return ant.weapons.filter((weapon): weapon is Weapon => weapon !== null);
}

function kitAdvantage(attacker: Weapon[], defender: Weapon[]): number {
  if (!attacker.length || !defender.length) return 1;
  let total = 0;
  for (const a of attacker) for (const b of defender) total += weaponAdvantage(a, b);
  return total / (attacker.length * defender.length);
}

function dropWeapon(state: BattleState, ant: Ant, weapon: Weapon): void {
  state.drops.push({
    id: state.nextId++, pos: { ...ant.pos }, weapon,
    availableAt: state.time + CONFIG.dropPickupDelay,
  });
}

function kill(state: BattleState, ant: Ant): void {
  if (!ant.alive) return;
  ant.alive = false;
  ant.spin = 0;
  ant.vel = { x: 0, y: 0 };
  if (!ant.player) state.kills++;
  for (const weapon of equipped(ant)) dropWeapon(state, ant, weapon);
  ant.weapons.fill(null);
}

function receiveHit(state: BattleState, ant: Ant, damage: number, wasUnarmed: boolean): void {
  ant.lastHit = state.time;
  ant.spin = Math.max(0, ant.spin - damage);
  if (wasUnarmed || ant.spin <= 0) {
    kill(state, ant);
    return;
  }
  const chance = Math.min(CONFIG.maximumWeaponLossChance,
    CONFIG.weaponLossBaseChance + CONFIG.weaponLossDamageBias * damage / ant.maxSpin);
  if (random(state) >= chance) return;
  const slots = ant.weapons.flatMap((weapon, index) => weapon === null ? [] : [index]);
  if (!slots.length) return;
  const slot = slots[Math.floor(random(state) * slots.length)];
  dropWeapon(state, ant, ant.weapons[slot]!);
  ant.weapons[slot] = null;
  // Losing the final weapon is survivable. The next distinct hit is fatal.
}

function collide(state: BattleState, a: Ant, b: Ant): void {
  const dx = b.pos.x - a.pos.x;
  const dy = b.pos.y - a.pos.y;
  const distance = Math.hypot(dx, dy);
  const touchingDistance = a.radius + b.radius;
  if (distance > touchingDistance) return;
  const nx = distance > 1e-8 ? dx / distance : (a.id < b.id ? 1 : -1);
  const ny = distance > 1e-8 ? dy / distance : 0;
  const overlap = (touchingDistance - distance + 1e-5) / 2;
  a.pos.x -= nx * overlap;
  a.pos.y -= ny * overlap;
  b.pos.x += nx * overlap;
  b.pos.y += ny * overlap;
  contain(a);
  contain(b);
  const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
  if (state.time - (state.contacts[key] ?? -Infinity) < CONFIG.hitCooldown) return;
  state.contacts[key] = state.time;

  // Snapshot both sides before applying either hit: damage must not depend on order.
  const spinA = a.spin;
  const spinB = b.spin;
  const kitA = equipped(a);
  const kitB = equipped(b);
  const combinedSpin = spinA + spinB;
  const relativeX = a.vel.x - b.vel.x;
  const relativeY = a.vel.y - b.vel.y;
  const approachingSpeed = Math.max(0, relativeX * nx + relativeY * ny);
  const glancingSpeed = Math.abs(relativeX * ny - relativeY * nx);
  const impact = Math.min(CONFIG.maximumImpact, CONFIG.impactBase
    + (approachingSpeed + glancingSpeed * CONFIG.tangentialImpactFactor) / CONFIG.impactSpeed);
  const totalDamage = combinedSpin * CONFIG.collisionFactor * impact;
  const damageA = combinedSpin > 0
    ? totalDamage * (spinB / combinedSpin) * kitAdvantage(kitB, kitA) : 0;
  const damageB = combinedSpin > 0
    ? totalDamage * (spinA / combinedSpin) * kitAdvantage(kitA, kitB) : 0;
  receiveHit(state, a, damageA, kitA.length === 0);
  receiveHit(state, b, damageB, kitB.length === 0);
  if (a.alive) {
    a.vel.x -= nx * CONFIG.collisionImpulse;
    a.vel.y -= ny * CONFIG.collisionImpulse;
  }
  if (b.alive) {
    b.vel.x += nx * CONFIG.collisionImpulse;
    b.vel.y += ny * CONFIG.collisionImpulse;
  }
}

function pickup(state: BattleState, player: Ant): void {
  if (!player.alive) return;
  state.drops = state.drops.filter(drop => {
    const slot = player.weapons.indexOf(null);
    if (slot < 0 || drop.availableAt > state.time
      || Math.hypot(drop.pos.x - player.pos.x, drop.pos.y - player.pos.y) > CONFIG.pickupDistance) return true;
    player.weapons[slot] = drop.weapon;
    return false;
  });
}

/** Mutates a battle using bounded substeps, including after slow animation frames. */
export function stepBattle(state: BattleState, target: Vec, dt: number): void {
  if (state.outcome || !Number.isFinite(dt) || dt <= 0) return;
  const player = state.ants.find(ant => ant.player);
  if (!player) { state.outcome = 'failure'; return; }
  const safeTarget = Number.isFinite(target.x) && Number.isFinite(target.y) ? target : player.pos;
  let remaining = Math.min(dt, CONFIG.maximumFrameTime);
  while (remaining > 1e-8 && !state.outcome) {
    const delta = Math.min(remaining, CONFIG.maximumStep);
    remaining -= delta;
    state.time += delta;
    for (const ant of state.ants) {
      if (!ant.alive) continue;
      ant.spin = Math.max(0, ant.spin - (ant.player ? CONFIG.playerSpinDrain : CONFIG.enemySpinDrain) * delta);
      if (ant.spin <= 0) kill(state, ant);
    }
    // Resolve fatal drain now, but defer victories until this step's hits finish.
    if (!player.alive) { state.outcome = 'failure'; break; }
    movePlayer(player, safeTarget, delta, state.time);
    updateOpponents(state, delta);
    for (const ant of state.ants) if (ant.alive) integrate(ant, delta);
    for (let i = 0; i < state.ants.length; i++) {
      for (let j = i + 1; j < state.ants.length; j++) {
        if (state.ants[i].alive && state.ants[j].alive) collide(state, state.ants[i], state.ants[j]);
      }
    }
    pickup(state, player);
    updateObjectives(state);
    for (const key of Object.keys(state.contacts)) {
      if (state.time - state.contacts[key] > CONFIG.hitCooldown * 2) delete state.contacts[key];
    }
    // Keep the player available to the HUD; dead opponents are represented by loot.
    state.ants = state.ants.filter(ant => ant.player || ant.alive);
  }
}

import type { Ant, BattleEffect, BattleFormat, BattleState, Vec, Weapon } from './types';
import { spawnEnemy, updateObjectives, updateOpponents } from './opponents';

/** Arena units are normalized: the rim is radius 1 and time is seconds. */
export const CONFIG = {
  slots: 6,
  arenaRadius: 1,
  playerRadius: 0.065,
  playerSpin: 100,
  playerSpeed: 0.46,
  movementResponse: 4.2,
  spinSpeedReference: 100,
  minimumSpinSpeedFactor: 0.22,
  maximumSpinSpeedRatio: 1.5,
  minimumSpinControlFactor: 0.22,
  lowSpinWobbleAngle: 0.42,
  wobbleFrequency: 7,
  minimumViableSpin: 0.5,
  arrivalDistance: 0.13,
  movementFlowStrength: 0.22,
  minimumMovementFactor: 0.35,
  regenerationDelay: 1.8,
  regenerationRate: 7,
  regenerationMinimumSpeed: 0.035,
  regenerationAlignment: 0.35,
  regenerationMinimumComponent: 0.04,
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
  collisionImpulse: 0.26,
  collisionImpactImpulse: 0.18,
  knockbackRecovery: 0.2,
  knockbackImpactRecovery: 0.06,
  weaponLossBaseChance: 0.12,
  weaponLossDamageBias: 0.9,
  maximumWeaponLossChance: 0.8,
  dropPickupDelay: 0.55,
  dropLifetime: 10,
  pickupDistance: 0.075,
  maximumEffects: 140,
  dustInterval: 0.1,
  dustMinimumSpeed: 0.045,
  dustDuration: 0.55,
  dustSize: 0.013,
  impactDuration: 0.25,
  splatDuration: 1.1,
  splatParticles: 7,
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
    regenRate: 0, knockbackUntil: 0,
  };
  const state: BattleState = {
    time: 0, ants: [player], drops: [], kills: 0, spawned: 0, nextSpawn: 0,
    survivalStarted: null, outcome: null, format,
    targetKills: format === 'boss' ? 1 : CONFIG.killQuota + difficulty * CONFIG.killsPerFloor,
    survivalDuration: CONFIG.survivalSeconds + difficulty * CONFIG.survivalSecondsPerFloor,
    seed: seed >>> 0, nextId: 1, contacts: {}, effects: [],
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
  player.regenRate = 0;
  if ((player.knockbackUntil ?? 0) > time) return;
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
  const spinRatio = clamp(player.spin / CONFIG.spinSpeedReference, 0, CONFIG.maximumSpinSpeedRatio);
  const controlRatio = Math.min(1, spinRatio);
  const spinSpeed = CONFIG.minimumSpinSpeedFactor + (1 - CONFIG.minimumSpinSpeedFactor) * spinRatio;
  const control = CONFIG.minimumSpinControlFactor + (1 - CONFIG.minimumSpinControlFactor) * controlRatio;
  const speed = CONFIG.playerSpeed * movementFactor * spinSpeed
    * Math.min(1, distance / CONFIG.arrivalDistance);
  const phase = player.id * 2.39996;
  const wobble = CONFIG.lowSpinWobbleAngle * (1 - controlRatio) ** 2
    * Math.sin(time * CONFIG.wobbleFrequency + phase);
  const steerX = ux * Math.cos(wobble) - uy * Math.sin(wobble);
  const steerY = ux * Math.sin(wobble) + uy * Math.cos(wobble);
  const response = 1 - Math.exp(-CONFIG.movementResponse * control * dt);
  player.vel.x += (steerX * speed - player.vel.x) * response;
  player.vel.y += (steerY * speed - player.vel.y) * response;

  const actualSpeed = Math.hypot(player.vel.x, player.vel.y);
  const heading = recoveryHeading(player);
  const alignment = actualSpeed > 1e-8
    ? (heading.x * player.vel.x + heading.y * player.vel.y) / actualSpeed : 0;
  const inwardTravel = -(rx * player.vel.x + ry * player.vel.y);
  const oppositeTravel = (ry * player.vel.x - rx * player.vel.y) * player.spinDirection;
  if (time - player.lastHit >= CONFIG.regenerationDelay
    && actualSpeed >= CONFIG.regenerationMinimumSpeed
    && inwardTravel > actualSpeed * CONFIG.regenerationMinimumComponent
    && oppositeTravel > actualSpeed * CONFIG.regenerationMinimumComponent
    && alignment >= CONFIG.regenerationAlignment) {
    const before = player.spin;
    player.spin = Math.min(player.maxSpin,
      before + CONFIG.regenerationRate * alignment ** 4 * dt);
    player.regenRate = (player.spin - before) / dt;
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
    expiresAt: state.time + CONFIG.dropLifetime,
  });
}

function kill(state: BattleState, ant: Ant): void {
  if (!ant.alive) return;
  ant.alive = false;
  ant.spin = 0;
  ant.regenRate = 0;
  ant.vel = { x: 0, y: 0 };
  if (!ant.player) state.kills++;
  for (const weapon of equipped(ant)) dropWeapon(state, ant, weapon);
  ant.weapons.fill(null);
}

function receiveHit(state: BattleState, ant: Ant, damage: number, wasUnarmed: boolean): void {
  ant.lastHit = state.time;
  ant.spin = Math.max(0, ant.spin - damage);
  ant.regenRate = 0;
  if (wasUnarmed || ant.spin <= CONFIG.minimumViableSpin) {
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

function effect(state: BattleState, kind: BattleEffect['kind'], ant: Ant,
  pos: Vec, vel: Vec, duration: number, size: number): void {
  const effects = state.effects ??= [];
  // Cosmetic events never consume gameplay IDs or the combat/spawn random stream.
  const id = (effects[effects.length - 1]?.id ?? 0) - 1;
  effects.push({ id, kind, player: ant.player,
    pos: { ...pos }, vel: { ...vel }, bornAt: state.time, duration, size });
  if (effects.length > CONFIG.maximumEffects) effects.splice(0, effects.length - CONFIG.maximumEffects);
}

function splat(state: BattleState, ant: Ant, direction: Vec, impact: number): void {
  for (let i = 0; i < CONFIG.splatParticles; i++) {
    const angle = (i / Math.max(1, CONFIG.splatParticles - 1) - 0.5) * 1.3;
    const speed = (0.12 + impact * 0.11) * (0.65 + (i % 3) * 0.2);
    effect(state, 'splat', ant, ant.pos, {
      x: (direction.x * Math.cos(angle) - direction.y * Math.sin(angle)) * speed,
      y: (direction.x * Math.sin(angle) + direction.y * Math.cos(angle)) * speed,
    }, CONFIG.splatDuration, ant.radius * (0.16 + (i % 3) * 0.05));
  }
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
  effect(state, 'impact', a, { x: (a.pos.x + b.pos.x) / 2, y: (a.pos.y + b.pos.y) / 2 },
    { x: 0, y: 0 }, CONFIG.impactDuration, 0.025 + impact * 0.025);
  if (!a.alive) splat(state, a, { x: -nx, y: -ny }, impact);
  if (!b.alive) splat(state, b, { x: nx, y: ny }, impact);
  const push = CONFIG.collisionImpulse + impact * CONFIG.collisionImpactImpulse;
  const recoveryUntil = state.time + CONFIG.knockbackRecovery + impact * CONFIG.knockbackImpactRecovery;
  if (a.alive) {
    const change = Math.min(0, -push - (a.vel.x * nx + a.vel.y * ny));
    a.vel.x += nx * change;
    a.vel.y += ny * change;
    a.knockbackUntil = Math.max(a.knockbackUntil ?? 0, recoveryUntil);
  }
  if (b.alive) {
    const change = Math.max(0, push - (b.vel.x * nx + b.vel.y * ny));
    b.vel.x += nx * change;
    b.vel.y += ny * change;
    b.knockbackUntil = Math.max(b.knockbackUntil ?? 0, recoveryUntil);
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
    state.drops = state.drops.filter(drop => (drop.expiresAt ?? Infinity) > state.time);
    state.effects = (state.effects ?? []).filter(item => item.bornAt + item.duration > state.time);
    for (const ant of state.ants) {
      ant.regenRate = 0;
      if (!ant.alive) continue;
      ant.spin = Math.max(0, ant.spin - (ant.player ? CONFIG.playerSpinDrain : CONFIG.enemySpinDrain) * delta);
      if (ant.spin <= CONFIG.minimumViableSpin) {
        const heading = Math.atan2(ant.vel.y, ant.vel.x);
        kill(state, ant);
        splat(state, ant, { x: Math.cos(heading), y: Math.sin(heading) }, 0.6);
      }
    }
    // Resolve fatal drain now, but defer victories until this step's hits finish.
    if (!player.alive) { state.outcome = 'failure'; break; }
    movePlayer(player, safeTarget, delta, state.time);
    updateOpponents(state, delta);
    for (const ant of state.ants) if (ant.alive) integrate(ant, delta);
    if (Math.floor(state.time / CONFIG.dustInterval) > Math.floor((state.time - delta) / CONFIG.dustInterval)) {
      for (const ant of state.ants) {
        if (!ant.alive || Math.hypot(ant.vel.x, ant.vel.y) < CONFIG.dustMinimumSpeed) continue;
        const phase = ant.id * 2.39996 + state.time * 3;
        effect(state, 'dust', ant, ant.pos, {
          x: -ant.vel.x * 0.15 + Math.cos(phase) * 0.02,
          y: -ant.vel.y * 0.15 + Math.sin(phase) * 0.02,
        }, CONFIG.dustDuration, CONFIG.dustSize);
      }
    }
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

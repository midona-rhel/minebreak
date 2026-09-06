import type { Ant, BattleEffect, BattleState, Vec, Weapon } from './types';

export interface ArenaViewport {
  cx: number;
  cy: number;
  radius: number;
}

const TAU = Math.PI * 2;
const WEAPON_COLORS: Record<Weapon, string> = {
  shield: '#70e8cf',
  sword: '#f7e6ae',
  axe: '#ffad68',
  whip: '#d59cff',
};
const windPhases = new WeakMap<Ant, { at: number; wind: number; regen: number }>();

export function getArenaViewport(width: number, height: number): ArenaViewport {
  return {
    cx: width / 2,
    cy: height * 0.515,
    radius: Math.max(1, Math.min(width * 0.43, height * 0.43)),
  };
}

export function screenToArena(x: number, y: number, width: number, height: number): Vec {
  const view = getArenaViewport(width, height);
  return {
    x: Math.max(-1.18, Math.min(1.18, (x - view.cx) / view.radius)),
    y: Math.max(-1.18, Math.min(1.18, (y - view.cy) / view.radius)),
  };
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
}

function drawPit(ctx: CanvasRenderingContext2D, width: number, height: number, state: BattleState, visualTime: number) {
  const { cx, cy, radius } = getArenaViewport(width, height);
  const glow = state.outcome === 'failure' ? '#e95158' : state.outcome === 'success' ? '#e9bd56' : '#d9873e';
  const background = ctx.createRadialGradient(cx, cy, radius * 0.08, cx, cy, radius * 1.55);
  background.addColorStop(0, '#382315');
  background.addColorStop(0.5, '#17130f');
  background.addColorStop(1, '#090a09');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(cx, cy);
  for (let tier = 8; tier >= 1; tier -= 1) {
    const rr = radius * (1 + tier * 0.075);
    ctx.fillStyle = tier % 2 ? '#33271d' : '#271e18';
    ctx.strokeStyle = tier === 1 ? glow : 'rgba(231, 177, 106, .18)';
    ctx.lineWidth = tier === 1 ? 3 : 1;
    ring(ctx, 0, 0, rr);
    ctx.fill();
    ctx.stroke();
  }

  for (let i = 0; i < 32; i += 1) {
    const a = (i / 32) * TAU;
    const inner = radius * 1.02;
    const outer = radius * 1.6;
    ctx.strokeStyle = i % 4 === 0 ? 'rgba(242, 184, 106, .25)' : 'rgba(0, 0, 0, .3)';
    ctx.lineWidth = i % 4 === 0 ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
    ctx.stroke();
  }

  for (let i = 0; i < 84; i += 1) {
    const a = (i / 84) * TAU + Math.sin(i * 9.31) * 0.018;
    const row = i % 3;
    const rr = radius * (1.12 + row * 0.105);
    const bob = Math.sin(visualTime * (1.4 + (i % 5) * 0.09) + i) * 1.3;
    ctx.fillStyle = i % 9 === 0 ? '#c45e38' : i % 7 === 0 ? '#b6934b' : '#12110f';
    ring(ctx, Math.cos(a) * rr, Math.sin(a) * rr + bob, Math.max(1.7, radius * 0.013));
    ctx.fill();
  }

  const sand = ctx.createRadialGradient(0, 0, radius * 0.12, 0, 0, radius);
  sand.addColorStop(0, '#6d4a28');
  sand.addColorStop(0.7, '#4c321e');
  sand.addColorStop(1, '#211710');
  ctx.fillStyle = sand;
  ctx.shadowColor = '#000';
  ctx.shadowBlur = radius * 0.12;
  ring(ctx, 0, 0, radius);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = '#e1b26d';
  ctx.lineWidth = 1;
  for (let i = 0; i < 22; i += 1) {
    const a = i * 2.39996;
    const rr = radius * Math.sqrt((i + 2) / 25) * 0.88;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, radius * (0.025 + (i % 4) * 0.008), 0.2, 2.4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWeapon(ctx: CanvasRenderingContext2D, weapon: Weapon, size: number) {
  ctx.save();
  ctx.strokeStyle = WEAPON_COLORS[weapon];
  ctx.fillStyle = WEAPON_COLORS[weapon];
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.4, size * 0.13);
  if (weapon === 'shield') {
    ctx.beginPath();
    ctx.moveTo(-size * 0.42, -size * 0.42);
    ctx.quadraticCurveTo(size * 0.52, -size * 0.5, size * 0.42, size * 0.16);
    ctx.quadraticCurveTo(0, size * 0.6, -size * 0.42, size * 0.16);
    ctx.closePath();
    ctx.fillStyle = '#17483f';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.34);
    ctx.lineTo(0, size * 0.35);
    ctx.stroke();
  } else if (weapon === 'sword') {
    ctx.beginPath();
    ctx.moveTo(-size * 0.5, 0);
    ctx.lineTo(size * 0.55, 0);
    ctx.lineTo(size * 0.33, -size * 0.13);
    ctx.moveTo(-size * 0.27, -size * 0.28);
    ctx.lineTo(-size * 0.27, size * 0.28);
    ctx.stroke();
  } else if (weapon === 'axe') {
    ctx.beginPath();
    ctx.moveTo(-size * 0.55, 0);
    ctx.lineTo(size * 0.5, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(size * 0.12, -size * 0.46);
    ctx.quadraticCurveTo(size * 0.58, -size * 0.42, size * 0.48, 0);
    ctx.quadraticCurveTo(size * 0.25, -size * 0.12, size * 0.12, 0);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(-size * 0.5, 0);
    ctx.bezierCurveTo(-size * 0.05, -size * 0.62, size * 0.2, size * 0.55, size * 0.55, -size * 0.18);
    ctx.stroke();
    ring(ctx, size * 0.56, -size * 0.19, size * 0.11);
    ctx.fill();
  }
  ctx.restore();
}

function drawWind(ctx: CanvasRenderingContext2D, ant: Ant, radius: number, visualTime: number, color: string) {
  const ratio = Math.max(0, Math.min(1, ant.spin / Math.max(ant.maxSpin, 1)));
  if (ratio <= 0) return;
  const direction = ant.spinDirection;
  const previous = windPhases.get(ant) ?? { at: visualTime, wind: ant.angle, regen: ant.angle };
  const elapsed = Number.isFinite(visualTime) ? Math.max(0, Math.min(0.1, visualTime - previous.at)) : 0;
  const regen = Math.max(0, ant.regenRate ?? 0);
  const phases = {
    at: Number.isFinite(visualTime) ? visualTime : previous.at,
    wind: previous.wind + elapsed * direction * (1.4 + ratio * 7.5),
    regen: previous.regen + elapsed * (0.7 + Math.min(2.4, regen * 0.18)),
  };
  windPhases.set(ant, phases);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.12 + ratio * 0.45;
  ctx.lineWidth = 0.8 + ratio * 1.3;
  const rotation = phases.wind;
  for (let i = 0; i < 3; i += 1) {
    const ringRadius = radius * (1.08 + i * 0.22);
    const start = rotation + i * 2.03;
    ctx.beginPath();
    ctx.arc(0, 0, ringRadius, start, start + direction * (0.55 + ratio * 0.65), direction < 0);
    ctx.stroke();
  }

  if (regen > 0) {
    ctx.fillStyle = '#d7fff2';
    ctx.globalAlpha = Math.min(0.9, 0.35 + regen * 0.07);
    for (let i = 0; i < 9; i += 1) {
      const travel = (phases.regen + i / 9) % 1;
      const particleRadius = radius * (1.8 - travel * 1.38);
      const angle = direction * (phases.regen * 1.9 + i * 2.19 + travel * 4.7);
      ring(ctx, Math.cos(angle) * particleRadius, Math.sin(angle) * particleRadius, 0.8 + travel * 1.3);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawEmptySocket(ctx: CanvasRenderingContext2D, size: number) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 214, 157, .43)';
  ctx.lineWidth = Math.max(1, size * 0.1);
  ctx.setLineDash([size * 0.25, size * 0.18]);
  ring(ctx, 0, 0, size * 0.38);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(-size * 0.21, -size * 0.21);
  ctx.lineTo(size * 0.21, size * 0.21);
  ctx.moveTo(size * 0.21, -size * 0.21);
  ctx.lineTo(-size * 0.21, size * 0.21);
  ctx.stroke();
  ctx.restore();
}

function drawAnt(ctx: CanvasRenderingContext2D, ant: Ant, view: ArenaViewport, visualTime: number) {
  if (!ant.alive) return;
  const x = view.cx + ant.pos.x * view.radius;
  const y = view.cy + ant.pos.y * view.radius;
  const collisionRadius = Math.max(6, ant.radius * view.radius);
  const base = collisionRadius * (ant.boss ? 1.04 : 0.92);
  const armor = ant.player ? '#35d6b4' : ant.boss ? '#e04d4b' : '#d47a38';
  const shell = ant.player ? '#123d38' : ant.boss ? '#481719' : '#49291a';
  const spinRatio = Math.max(0, ant.spin / Math.max(ant.maxSpin, 1));

  ctx.save();
  ctx.translate(x, y);
  drawWind(ctx, ant, collisionRadius, visualTime, armor);
  if (ant.player || ant.boss) {
    ctx.strokeStyle = ant.player ? 'rgba(95, 255, 216, .35)' : 'rgba(255, 88, 76, .42)';
    ctx.lineWidth = Math.max(1, base * 0.08);
    ctx.setLineDash([base * 0.35, base * 0.2]);
    ctx.lineDashOffset = -ant.angle * base;
    ring(ctx, 0, 0, Math.max(base * 1.45, ant.radius * view.radius));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.rotate(ant.angle);

  // The gold point stays exactly on the physics position; the ant's raised,
  // foreshortened body turns around it like a living spinning top.
  ctx.fillStyle = 'rgba(0, 0, 0, .42)';
  ctx.beginPath();
  ctx.ellipse(0, base * 0.18, base * 0.7, base * 0.34, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#f8cf72';
  ctx.shadowColor = '#f8b94e';
  ctx.shadowBlur = base * 0.8;
  ring(ctx, 0, 0, Math.max(2, base * 0.2));
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = armor;
  ctx.lineWidth = Math.max(1.25, base * 0.12);
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * TAU;
    const rootX = Math.cos(angle) * base * 0.38;
    const rootY = Math.sin(angle) * base * 0.38;
    const elbowX = Math.cos(angle + ant.spinDirection * 0.19) * base * 0.66;
    const elbowY = Math.sin(angle + ant.spinDirection * 0.19) * base * 0.66;
    const endX = Math.cos(angle) * collisionRadius * 0.7;
    const endY = Math.sin(angle) * collisionRadius * 0.7;
    ctx.beginPath();
    ctx.moveTo(rootX, rootY);
    ctx.lineTo(elbowX, elbowY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    const weapon = ant.weapons[i];
    ctx.save();
    ctx.translate(endX, endY);
    ctx.rotate(angle);
    if (weapon) drawWeapon(ctx, weapon, collisionRadius * 0.9);
    else drawEmptySocket(ctx, collisionRadius * 0.66);
    ctx.restore();
  }

  ctx.shadowColor = armor;
  ctx.shadowBlur = base * 0.65;
  ctx.fillStyle = shell;
  ctx.strokeStyle = armor;
  ctx.beginPath();
  ctx.ellipse(-base * 0.24, 0, base * 0.48, base * 0.39, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(base * 0.42, 0, base * 0.48, base * 0.43, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = armor;
  ring(ctx, base * 0.58, -base * 0.16, base * 0.08);
  ctx.fill();
  ring(ctx, base * 0.58, base * 0.16, base * 0.08);
  ctx.fill();

  ctx.fillStyle = '#f4c86c';
  ctx.beginPath();
  ctx.moveTo(-base * 0.61, -base * 0.17);
  ctx.lineTo(-base * 0.88, 0);
  ctx.lineTo(-base * 0.61, base * 0.17);
  ctx.lineTo(-base * 0.52, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const barWidth = Math.max(34, base * 2.5);
  const barY = y - base * 2;
  ctx.fillStyle = 'rgba(4, 7, 6, .82)';
  ctx.fillRect(x - barWidth / 2, barY, barWidth, 4);
  ctx.fillStyle = spinRatio > 0.28 ? armor : '#ff4d53';
  ctx.fillRect(x - barWidth / 2, barY, barWidth * spinRatio, 4);
  if (ant.player || ant.boss) {
    ctx.fillStyle = '#fff4da';
    ctx.font = `700 ${Math.max(8, view.radius * 0.034)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(ant.player ? 'YOU' : 'BOSS', x, barY - 5);
  }
}

function drawTelegraphs(ctx: CanvasRenderingContext2D, state: BattleState, view: ArenaViewport, visualTime: number) {
  for (const ant of state.ants) {
    if (!ant.alive || !ant.boss || ant.telegraphUntil <= state.time) continue;
    const sx = view.cx + ant.pos.x * view.radius;
    const sy = view.cy + ant.pos.y * view.radius;
    const tx = view.cx + ant.dashTarget.x * view.radius;
    const ty = view.cy + ant.dashTarget.y * view.radius;
    const pulse = 0.45 + Math.sin(visualTime * 24) * 0.2;
    ctx.save();
    ctx.strokeStyle = `rgba(255, 75, 63, ${pulse + 0.3})`;
    ctx.fillStyle = `rgba(255, 52, 44, ${pulse * 0.16})`;
    ctx.lineWidth = Math.max(5, view.radius * 0.035);
    ctx.setLineDash([view.radius * 0.08, view.radius * 0.045]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.setLineDash([]);
    ring(ctx, tx, ty, view.radius * 0.1);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff1df';
    ctx.font = `900 ${Math.max(11, view.radius * 0.045)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('DASH!', (sx + tx) / 2, (sy + ty) / 2 - 12);
    ctx.restore();
  }
}

function drawDrops(ctx: CanvasRenderingContext2D, state: BattleState, view: ArenaViewport, visualTime: number) {
  for (const drop of state.drops) {
    const x = view.cx + drop.pos.x * view.radius;
    const y = view.cy + drop.pos.y * view.radius;
    const size = Math.max(10, view.radius * 0.05);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(visualTime * 2.2 + drop.id) * 0.25);
    ctx.shadowColor = WEAPON_COLORS[drop.weapon];
    ctx.shadowBlur = size;
    ctx.fillStyle = 'rgba(12, 10, 7, .75)';
    ring(ctx, 0, 0, size * 0.9);
    ctx.fill();
    drawWeapon(ctx, drop.weapon, size);
    ctx.restore();
  }
}

function effectPoint(effect: BattleEffect, age: number, view: ArenaViewport) {
  return {
    x: view.cx + (effect.pos.x + effect.vel.x * age) * view.radius,
    y: view.cy + (effect.pos.y + effect.vel.y * age) * view.radius,
  };
}

function drawEffects(ctx: CanvasRenderingContext2D, state: BattleState, view: ArenaViewport, visualTime: number) {
  for (const effect of state.effects ?? []) {
    const age = visualTime - effect.bornAt;
    if (age < 0 || age > effect.duration) continue;
    const progress = Math.min(1, age / Math.max(effect.duration, 0.001));
    const point = effectPoint(effect, age, view);
    const seed = effect.id * 12.9898;
    ctx.save();
    ctx.globalAlpha = (1 - progress) * (effect.kind === 'dust' ? 0.32 : 0.88);
    if (effect.kind === 'dust') {
      ctx.fillStyle = '#d4a464';
      for (let i = 0; i < 4; i += 1) {
        const a = seed + i * 2.31;
        const drift = view.radius * progress * (0.012 + i * 0.004);
        ring(ctx, point.x + Math.cos(a) * drift, point.y + Math.sin(a) * drift, Math.max(0.7, effect.size * view.radius * (0.16 + progress * 0.18)));
        ctx.fill();
      }
    } else if (effect.kind === 'impact') {
      ctx.strokeStyle = effect.player ? '#a1ffe3' : '#ffc46f';
      ctx.lineWidth = Math.max(1.2, effect.size * view.radius * 0.14 * (1 - progress));
      for (let i = 0; i < 8; i += 1) {
        const a = seed + (i / 8) * TAU;
        const inner = effect.size * view.radius * progress * 0.18;
        const outer = effect.size * view.radius * progress * (0.7 + (i % 3) * 0.18);
        ctx.beginPath();
        ctx.moveTo(point.x + Math.cos(a) * inner, point.y + Math.sin(a) * inner);
        ctx.lineTo(point.x + Math.cos(a) * outer, point.y + Math.sin(a) * outer);
        ctx.stroke();
      }
    } else {
      const velocityAngle = Math.atan2(effect.vel.y, effect.vel.x);
      ctx.fillStyle = effect.player ? '#41e0bc' : '#b93539';
      ctx.strokeStyle = effect.player ? '#b5ffea' : '#ff9b6b';
      ctx.lineWidth = Math.max(1, effect.size * view.radius * 0.1 * (1 - progress));
      for (let i = 0; i < 11; i += 1) {
        const spread = (i - 5) * 0.19 + Math.sin(seed + i) * 0.15;
        const a = velocityAngle + spread;
        const distance = effect.size * view.radius * progress * (0.45 + (i % 4) * 0.24);
        const px = point.x + Math.cos(a) * distance;
        const py = point.y + Math.sin(a) * distance;
        ctx.beginPath();
        ctx.moveTo(point.x + Math.cos(a) * distance * 0.42, point.y + Math.sin(a) * distance * 0.42);
        ctx.lineTo(px, py);
        ctx.stroke();
        ring(ctx, px, py, Math.max(1, effect.size * view.radius * (0.15 - progress * 0.07)));
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

function drawTarget(ctx: CanvasRenderingContext2D, target: Vec, view: ArenaViewport) {
  const x = view.cx + target.x * view.radius;
  const y = view.cy + target.y * view.radius;
  ctx.save();
  ctx.strokeStyle = 'rgba(132, 246, 210, .75)';
  ctx.lineWidth = 1.5;
  ring(ctx, x, y, 8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 12, y);
  ctx.lineTo(x + 12, y);
  ctx.moveTo(x, y - 12);
  ctx.lineTo(x, y + 12);
  ctx.stroke();
  ctx.restore();
}

export function renderArena(
  ctx: CanvasRenderingContext2D,
  state: BattleState,
  target: Vec,
  width: number,
  height: number,
  visualTime = state.time,
) {
  ctx.clearRect(0, 0, width, height);
  drawPit(ctx, width, height, state, visualTime);
  const view = getArenaViewport(width, height);
  drawTelegraphs(ctx, state, view, visualTime);
  drawDrops(ctx, state, view, visualTime);
  for (const ant of state.ants.filter((candidate) => !candidate.player)) drawAnt(ctx, ant, view, visualTime);
  for (const ant of state.ants.filter((candidate) => candidate.player)) drawAnt(ctx, ant, view, visualTime);
  drawEffects(ctx, state, view, visualTime);
  drawTarget(ctx, target, view);

  if (state.outcome) {
    const shade = ctx.createRadialGradient(view.cx, view.cy, view.radius * 0.25, view.cx, view.cy, view.radius);
    shade.addColorStop(0, 'rgba(8, 7, 5, .12)');
    shade.addColorStop(1, 'rgba(8, 7, 5, .68)');
    ctx.fillStyle = shade;
    ring(ctx, view.cx, view.cy, view.radius);
    ctx.fill();
  }
}

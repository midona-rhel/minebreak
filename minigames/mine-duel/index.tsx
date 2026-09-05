'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MinigameProps } from '@/minigames/contract';
import { FRAME_DATA, type Attack, type MoveKey } from './frame-data';
import { FIGHTER_BOX_SIZE, HITBOX_DATA } from './hitbox-data';

type Fighter = { x: number; hp: number; action: number; stun: number; block: boolean; attack?: MoveKey; connected: boolean; invincible: boolean; facing: number; jump: number; jumpVelocity: number; jumpDirection: number };
type Projectile = { owner: 'player' | 'mine'; x: number; dir: number };
type View = { player: Fighter; mine: Fighter; projectiles: Projectile[]; note: string };

const moves = FRAME_DATA;
const fighterWidth = FIGHTER_BOX_SIZE.width;
const copy = (fighter: Fighter): Fighter => ({ ...fighter });
function worldHitbox(fighter: Fighter, move: MoveKey) {
  const data = HITBOX_DATA[move];
  const points = data.corners.map((corner) => ({ x: fighter.x + fighter.facing * (data.connect.x + corner.x), y: fighter.jump + data.connect.y + corner.y }));
  return { left: Math.min(...points.map((point) => point.x)), right: Math.max(...points.map((point) => point.x)), bottom: Math.min(...points.map((point) => point.y)), top: Math.max(...points.map((point) => point.y)) };
}

export default function MineDuel({ context, complete }: MinigameProps) {
  const player = { currentHp: context.player.health, maxHp: context.player.maxHealth };
  const game = useRef<{ player: Fighter; mine: Fighter; projectiles: Projectile[]; cpuDelay: number; ended: boolean }>({
    player: { x: 27, hp: player.currentHp * 100, action: 0, stun: 0, block: false, connected: false, invincible: false, facing: 1, jump: 0, jumpVelocity: 0, jumpDirection: 0 },
    mine: { x: 73, hp: 500, action: 0, stun: 0, block: false, connected: false, invincible: false, facing: -1, jump: 0, jumpVelocity: 0, jumpDirection: 0 }, projectiles: [], cpuDelay: 45, ended: false,
  });
  const held = useRef(new Set<string>());
  const [view, setView] = useState<View>({ player: copy(game.current.player), mine: copy(game.current.mine), projectiles: [], note: 'FIGHT!' });

  const beginAttack = useCallback((fighter: Fighter, attack: MoveKey) => {
    if (fighter.action || fighter.stun || (fighter.jump > 0 && !attack.startsWith('air'))) return;
    fighter.attack = attack; fighter.action = moves[attack].startup + moves[attack].active + moves[attack].recovery; fighter.connected = false; fighter.block = false;
  }, []);
  const finish = useCallback((outcome: 'success' | 'failure', hp: number) => {
    if (game.current.ended) return;
    game.current.ended = true;
    const reportedDamage = Math.max(0, Math.min(player.currentHp, Math.ceil((player.currentHp * 100 - hp) / 100)));
    const damage = Math.max(0, reportedDamage - context.player.upgrades.armor);
    complete({ outcome, playerStats: { health: player.currentHp - damage } });
  }, [complete, player.currentHp, context.player.upgrades.armor]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'u', 'i', 'o'].includes(key)) event.preventDefault();
      held.current.add(key);
      if (key === 'w' && !event.repeat) {
        const p = game.current.player; const m = game.current.mine;
        p.facing = p.x < m.x ? 1 : -1;
        if (!p.action && !p.stun && p.jump === 0) {
          const right = held.current.has('d'); const left = held.current.has('a');
          // A/D are screen-space axes: D always jumps right and A always jumps left.
          p.jump = 0.1; p.jumpVelocity = 3; p.jumpDirection = right && !left ? 0.42 : left && !right ? -0.28 : 0;
        }
      }
      if (!event.repeat && (key === 'u' || key === 'i' || key === 'o')) {
        const attack = key.toUpperCase() as Attack;
        const p = game.current.player; const m = game.current.mine;
        if (p.jump > 0) {
          beginAttack(p, `air${attack}` as MoveKey);
          return;
        }
        const forward = (p.x < m.x && held.current.has('d')) || (p.x > m.x && held.current.has('a'));
        const crouching = held.current.has('s') && p.jump === 0;
        const grounded = p.jump === 0;
        beginAttack(p, crouching ? `crouch${attack}` as MoveKey : grounded && forward && attack === 'U' ? 'fireball' : grounded && forward && attack === 'I' ? 'uppercut' : attack);
      }
    };
    const up = (event: KeyboardEvent) => held.current.delete(event.key.toLowerCase());
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [beginAttack]);

  useEffect(() => {
    let frame = 0; let accumulator = 0; let last = performance.now();
    const resolveAttack = (attacker: Fighter, defender: Fighter, note: { value: string }) => {
      if (!attacker.attack || attacker.connected) return;
      const move = moves[attacker.attack];
      if (attacker.attack === 'fireball') return;
      const elapsed = move.startup + move.active + move.recovery - attacker.action;
      if (elapsed < move.startup || elapsed >= move.startup + move.active) return;
      if (Math.sign(defender.x - attacker.x) !== attacker.facing) return;
      const hitbox = worldHitbox(attacker, attacker.attack);
      if (defender.x + fighterWidth / 2 < hitbox.left || defender.x - fighterWidth / 2 > hitbox.right) return;
      const attackBottom = hitbox.bottom; const attackTop = hitbox.top;
      const defenderBottom = defender.jump + 13; const defenderTop = defenderBottom + FIGHTER_BOX_SIZE.height;
      if (attackTop < defenderBottom || attackBottom > defenderTop) return;
      attacker.connected = true;
      if (defender.invincible) return;
      if (defender.block) { defender.stun = move.blockstun; note.value = 'BLOCKED'; }
      else { defender.hp = Math.max(0, defender.hp - move.damage); defender.stun = move.hitstun; note.value = `${move.label} HIT`; }
    };
    const simulate = () => {
      const { player: p, mine: m } = game.current; const note = { value: '' };
      const backHeld = (p.x < m.x && held.current.has('a')) || (p.x > m.x && held.current.has('d'));
      const forwardHeld = (p.x < m.x && held.current.has('d')) || (p.x > m.x && held.current.has('a'));
      // Street Fighter-style blocking: back or down-back only, never while attacking or stunned.
      p.block = Boolean(backHeld && !forwardHeld && !p.action && !p.stun && p.jump === 0);
      const distance = Math.abs(p.x - m.x);
      m.block = Boolean(!m.action && !m.stun && distance < 21 && (p.action > 0 || game.current.cpuDelay % 90 < 20));
      if (!p.action && !p.stun) {
        p.facing = p.x < m.x ? 1 : -1;
        // A/D are always screen-space movement: A left, D right, even after a cross-up.
        const direction = (held.current.has('d') ? 1 : 0) - (held.current.has('a') ? 1 : 0);
        if (direction && !held.current.has('s') && p.jump === 0) p.x = Math.max(4, Math.min(96, p.x + direction * .24));
      }
      if (p.jump > 0) { p.jump += p.jumpVelocity; p.jumpVelocity -= 0.075; p.x = Math.max(4, Math.min(96, p.x + p.jumpDirection)); if (p.jump <= 0) { p.jump = 0; p.jumpVelocity = 0; p.jumpDirection = 0; } }
      if (!m.action && !m.stun) {
        if (distance > 17) m.x += Math.sign(p.x - m.x) * .16;
        else if (p.action && !m.block) m.x += Math.sign(m.x - p.x) * .12;
      }
      // Body collision: each box stops at the other instead of passing through it.
      if (p.jump === 0 && m.jump === 0 && Math.abs(p.x - m.x) < fighterWidth * 2) {
        const midpoint = (p.x + m.x) / 2;
        p.x = p.x < m.x ? midpoint - fighterWidth : midpoint + fighterWidth;
        m.x = m.x < p.x ? midpoint - fighterWidth : midpoint + fighterWidth;
      }
      p.x = Math.max(4, Math.min(96, p.x)); m.x = Math.max(4, Math.min(96, m.x));
      if (!m.action && !m.stun) {
        game.current.cpuDelay -= 1;
        if (game.current.cpuDelay <= 0 && distance < 40) {
          const choice = distance > 28 && Math.random() < .35 ? 'fireball' : distance < 18 && Math.random() < .3 ? 'uppercut' : distance < 14 ? 'U' : Math.random() > .5 ? 'I' : 'O';
          m.facing = m.x < p.x ? 1 : -1;
          beginAttack(m, choice); game.current.cpuDelay = 42 + Math.floor(Math.random() * 55);
        }
      }
      for (const fighter of [p, m]) {
        fighter.invincible = Boolean(fighter.attack === 'uppercut' && fighter.action && (moves.uppercut.startup + moves.uppercut.active + moves.uppercut.recovery - fighter.action) < moves.uppercut.startup + moves.uppercut.active);
        if (fighter.attack === 'fireball' && !fighter.connected) {
          const fireballFrame = moves.fireball.startup + moves.fireball.active + moves.fireball.recovery - fighter.action;
          if (fireballFrame >= moves.fireball.startup) { fighter.connected = true; game.current.projectiles.push({ owner: fighter === p ? 'player' : 'mine', x: fighter.x + fighter.facing * fighterWidth / 2, dir: fighter.facing }); }
        }
      }
      resolveAttack(p, m, note); resolveAttack(m, p, note);
      const projectiles = game.current.projectiles;
      for (const projectile of projectiles) projectile.x += projectile.dir * 1.2;
      for (let i = projectiles.length - 1; i >= 0; i -= 1) {
        const projectile = projectiles[i];
        const opposing = projectiles.findIndex((other, index) => index !== i && other.owner !== projectile.owner && Math.abs(other.x - projectile.x) < 5);
        if (opposing >= 0) { projectiles.splice(Math.max(i, opposing), 1); projectiles.splice(Math.min(i, opposing), 1); note.value = 'FIREBALLS FIZZLE'; continue; }
        const defender = projectile.owner === 'player' ? m : p;
        if (Math.abs(projectile.x - defender.x) < fighterWidth / 2 + 3 && !defender.invincible) {
          if (defender.block) { defender.stun = moves.fireball.blockstun; note.value = 'FIREBALL BLOCKED'; }
          else { defender.hp = Math.max(0, defender.hp - moves.fireball.damage); defender.stun = moves.fireball.hitstun; note.value = 'FIREBALL HIT'; }
          projectiles.splice(i, 1);
        } else if (projectile.x < 2 || projectile.x > 98) projectiles.splice(i, 1);
      }
      for (const fighter of [p, m]) { if (fighter.action) fighter.action -= 1; if (fighter.stun) fighter.stun -= 1; if (!fighter.action) { fighter.attack = undefined; fighter.invincible = false; } }
      if (m.hp <= 0) finish('success', p.hp); else if (p.hp <= 0) finish('failure', 0);
      setView({ player: copy(p), mine: copy(m), projectiles: projectiles.map((projectile) => ({ ...projectile })), note: note.value || (p.stun ? (p.block ? 'BLOCK STUN' : 'HIT STUN') : p.block ? 'BLOCKING' : 'FIGHT!') });
    };
    const tick = (now: number) => { accumulator += now - last; last = now; while (accumulator >= 1000 / 60) { simulate(); accumulator -= 1000 / 60; } frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [beginAttack, finish]);

  const playerFacingRight = view.player.facing === 1;
  const mineFacingRight = view.mine.facing === 1;
  const health = player.maxHp ? view.player.hp / (player.maxHp * 100) * 100 : 0;
  const playerAttack = view.player.attack && view.player.attack !== 'fireball' ? moves[view.player.attack] : undefined;
  const mineAttack = view.mine.attack && view.mine.attack !== 'fireball' ? moves[view.mine.attack] : undefined;
  return <section className="box-duel" aria-label="Mine Duel fighting game">
    <div className="box-duel-top"><div className="box-card"><b>OPERATOR</b><div className="box-health"><i style={{ width: `${health}%` }} /></div><small>{view.player.hp} / {player.maxHp * 100} HP</small></div><div className="box-round">MINE<br /><em>DUEL</em></div><div className="box-card enemy"><b>HEAD MINE</b><div className="box-health"><i style={{ width: `${view.mine.hp / 5}%` }} /></div><small>{view.mine.hp} / 500 HP</small></div></div>
    <div className="box-stage"><div className="box-grid" />
      <div className={`fighter-box player-box ${view.player.block ? 'blocking' : ''} ${view.player.stun ? 'stunned' : ''}`} style={{ left: `${view.player.x}%`, bottom: `${13 + view.player.jump}%`, width: `${FIGHTER_BOX_SIZE.width}%`, height: `${FIGHTER_BOX_SIZE.height}%`, willChange: 'left, bottom' }}><b>YOU</b><small>{view.player.block ? 'BLOCK' : view.player.stun ? 'STUN' : view.player.jump ? 'AIR' : ''}</small></div>
      {playerAttack && <div className="hit-box player-hit" style={{ left: `${worldHitbox(view.player, view.player.attack!).left}%`, bottom: `${worldHitbox(view.player, view.player.attack!).bottom}%`, width: `${worldHitbox(view.player, view.player.attack!).right - worldHitbox(view.player, view.player.attack!).left}%`, height: `${worldHitbox(view.player, view.player.attack!).top - worldHitbox(view.player, view.player.attack!).bottom}%`, willChange: 'left, bottom' }}><span>{playerAttack.label}</span></div>}
      <div className={`fighter-box mine-box ${view.mine.block ? 'blocking' : ''} ${view.mine.stun ? 'stunned' : ''}`} style={{ left: `${view.mine.x}%`, bottom: `${13 + view.mine.jump}%`, width: `${FIGHTER_BOX_SIZE.width}%`, height: `${FIGHTER_BOX_SIZE.height}%`, willChange: 'left, bottom' }}><b>MINE</b><small>{view.mine.block ? 'BLOCK' : view.mine.stun ? 'STUN' : view.mine.jump ? 'AIR' : ''}</small></div>
      {mineAttack && <div className="hit-box mine-hit" style={{ left: `${worldHitbox(view.mine, view.mine.attack!).left}%`, bottom: `${worldHitbox(view.mine, view.mine.attack!).bottom}%`, width: `${worldHitbox(view.mine, view.mine.attack!).right - worldHitbox(view.mine, view.mine.attack!).left}%`, height: `${worldHitbox(view.mine, view.mine.attack!).top - worldHitbox(view.mine, view.mine.attack!).bottom}%`, willChange: 'left, bottom' }}><span>{mineAttack.label}</span></div>}
      {view.projectiles.map((projectile, index) => <div key={index} className={`fireball ${projectile.owner === 'mine' ? 'mine-fireball' : ''}`} style={{ left: `${projectile.x}%`, position: 'absolute', zIndex: 4, bottom: '28%', width: 30, height: 30, border: '3px solid #fff4b0', borderRadius: 0, background: projectile.owner === 'mine' ? '#ef476f' : '#f4d35e', boxShadow: projectile.owner === 'mine' ? '0 0 20px #ef476f' : '0 0 20px #f4d35e' }} />)}
      <output>{view.note}</output>
    </div>
    <div className="box-help"><span><b>A / D</b> Left / right · <b>W</b> jump · hold away to block</span><span><b>U / I / O</b> Normals · forward+U/I specials · air = air move</span></div>
    <div className="box-buttons"><button onClick={() => beginAttack(game.current.player, 'U')}>U <small>LIGHT</small></button><button onClick={() => beginAttack(game.current.player, 'I')}>I <small>MEDIUM</small></button><button onClick={() => beginAttack(game.current.player, 'O')}>O <small>HEAVY</small></button></div>
  </section>;
}

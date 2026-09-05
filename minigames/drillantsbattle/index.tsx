'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from 'react';

import type { MinigameProps } from '@/minigames/contract';
import { createBattle, stepBattle } from './simulation';
import { renderArena, screenToArena } from './arena';
import type { BattleFormat, BattleState, Vec, Weapon } from './types';
import styles from './drillantsbattle.module.css';

const FIXED_STEP = 1 / 120;
const LOADOUT_SIZE = 6;
const WEAPONS: readonly Weapon[] = ['shield', 'sword', 'axe', 'whip'];
const DEFAULT_LOADOUT: Weapon[] = ['shield', 'sword', 'axe', 'whip', 'sword', 'shield'];
const WEAPON_MARK: Record<Weapon, string> = { shield: '⬡', sword: '†', axe: '◆', whip: '∿' };
const emptySlots = (): (Weapon | null)[] => Array.from({ length: LOADOUT_SIZE }, () => null);
const FORMAT_COPY: Record<BattleFormat, { name: string; eyebrow: string; copy: string }> = {
  boss: { name: 'Crown Duel', eyebrow: '1 vs 1', copy: 'Read the warning line, then slip past the royal ant’s charge.' },
  elimination: { name: 'Pit Sweep', eyebrow: 'Kill quota', copy: 'Break the required number of rivals before your spin runs dry.' },
  survival: { name: 'Last Ant', eyebrow: 'Quota + timer', copy: 'Earn your quota, then hold the sand until the final bell.' },
};

interface HudState {
  spin: number;
  maxSpin: number;
  weapons: (Weapon | null)[];
  kills: number;
  targetKills: number;
  survivalRemaining: number | null;
  bossSpin: number | null;
  bossMaxSpin: number | null;
  telegraph: boolean;
  outcome: BattleState['outcome'];
}

function readHud(state: BattleState): HudState {
  const player = state.ants.find((ant) => ant.player);
  const boss = state.ants.find((ant) => ant.boss && ant.alive);
  const survivalRemaining = state.survivalStarted === null
    ? null
    : Math.max(0, state.survivalDuration - (state.time - state.survivalStarted));
  return {
    spin: player?.spin ?? 0,
    maxSpin: player?.maxSpin ?? 1,
    weapons: player?.weapons.slice(0, LOADOUT_SIZE) ?? emptySlots(),
    kills: state.kills,
    targetKills: state.targetKills,
    survivalRemaining,
    bossSpin: boss?.spin ?? null,
    bossMaxSpin: boss?.maxSpin ?? null,
    telegraph: Boolean(boss && boss.telegraphUntil > state.time),
    outcome: state.outcome,
  };
}

function weaponName(weapon: Weapon | null) {
  return weapon ? weapon[0].toUpperCase() + weapon.slice(1) : 'Broken';
}

function nudgeTarget(target: RefObject<Vec>, x: number, y: number) {
  const next = { x: target.current.x + x, y: target.current.y + y };
  const distance = Math.hypot(next.x, next.y);
  if (distance > 0.98) {
    next.x = (next.x / distance) * 0.98;
    next.y = (next.y / distance) * 0.98;
  }
  target.current = next;
}

export default function DrillAntsBattle({ context, complete }: MinigameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const battleRef = useRef<BattleState | null>(null);
  const targetRef = useRef<Vec>({ x: 0, y: 0 });
  const [phase, setPhase] = useState<'setup' | 'battle' | 'result'>('setup');
  const [format, setFormat] = useState<BattleFormat>('boss');
  const [loadout, setLoadout] = useState<Weapon[]>(DEFAULT_LOADOUT);
  const [hud, setHud] = useState<HudState | null>(null);

  const cycleWeapon = (index: number) => {
    setLoadout((current) => current.map((weapon, slot) => {
      if (slot !== index) return weapon;
      return WEAPONS[(WEAPONS.indexOf(weapon) + 1) % WEAPONS.length];
    }));
  };

  const startBattle = () => {
    const state = createBattle(context.seed, format, loadout.slice(), context.floor);
    battleRef.current = state;
    const player = state.ants.find((ant) => ant.player);
    targetRef.current = player ? { ...player.pos } : { x: 0, y: 0 };
    setHud(readHud(state));
    setPhase(state.outcome ? 'result' : 'battle');
  };

  const aimAtPointer = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (phase !== 'battle') return;
    const rect = event.currentTarget.getBoundingClientRect();
    targetRef.current = screenToArena(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height);
    if (event.type === 'pointerdown') {
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.focus();
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== 'battle') return;
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const vectors: Record<string, Vec> = {
        arrowleft: { x: -0.11, y: 0 }, a: { x: -0.11, y: 0 },
        arrowright: { x: 0.11, y: 0 }, d: { x: 0.11, y: 0 },
        arrowup: { x: 0, y: -0.11 }, w: { x: 0, y: -0.11 },
        arrowdown: { x: 0, y: 0.11 }, s: { x: 0, y: 0.11 },
      };
      const vector = vectors[key];
      if (!vector) return;
      event.preventDefault();
      nudgeTarget(targetRef, vector.x, vector.y);
    };
    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'battle') return;
    const canvas = canvasRef.current;
    const state = battleRef.current;
    if (!canvas || !state) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.focus();

    let width = 1;
    let height = 1;
    let frame = 0;
    let last = performance.now();
    let accumulator = 0;
    let lastHud = 0;
    let ended = false;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const onVisibility = () => {
      last = performance.now();
      accumulator = 0;
    };
    document.addEventListener('visibilitychange', onVisibility);

    const tick = (now: number) => {
      if (!document.hidden) {
        accumulator += Math.min(0.1, Math.max(0, (now - last) / 1000));
        let steps = 0;
        while (accumulator >= FIXED_STEP && steps < 12 && !state.outcome) {
          stepBattle(state, targetRef.current, FIXED_STEP);
          accumulator -= FIXED_STEP;
          steps += 1;
        }
        renderArena(ctx, state, targetRef.current, width, height);
        if (now - lastHud > 80 || state.outcome) {
          setHud(readHud(state));
          lastHud = now;
        }
        if (state.outcome && !ended) {
          ended = true;
          setPhase('result');
          return;
        }
      }
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [phase]);

  const outcome = hud?.outcome;
  const spinPercent = Math.max(0, Math.min(100, ((hud?.spin ?? 0) / Math.max(hud?.maxSpin ?? 1, 1)) * 100));
  const objective = format === 'boss'
    ? `Royal spin ${Math.ceil(hud?.bossSpin ?? 0)}`
    : hud?.survivalRemaining !== null && hud?.survivalRemaining !== undefined
      ? `Hold ${hud.survivalRemaining.toFixed(1)}s`
      : `${hud?.kills ?? 0} / ${hud?.targetKills ?? 0} defeated`;

  const continueResult = () => {
    if (outcome) complete({ outcome });
  };

  return (
    <div className={styles.root}>
      {phase === 'setup' ? (
        <section className={styles.setup} aria-labelledby="drillants-title">
          <header className={styles.intro}>
            <span className={styles.kicker}>THE AMBER COLISEUM</span>
            <h2 id="drillants-title">Choose your trial</h2>
            <p>Your ant spins clockwise. Spiral counterclockwise toward the center to rebuild spin. Higher spin lets you take a flatter spiral.</p>
          </header>

          <div className={styles.formatGrid} aria-label="Battle format">
            {(Object.keys(FORMAT_COPY) as BattleFormat[]).map((id) => {
              const item = FORMAT_COPY[id];
              return (
                <button key={id} type="button" className={format === id ? styles.formatActive : styles.format} onClick={() => setFormat(id)} aria-pressed={format === id}>
                  <small>{item.eyebrow}</small>
                  <strong>{item.name}</strong>
                  <span>{item.copy}</span>
                </button>
              );
            })}
          </div>

          <div className={styles.armory}>
            <div className={styles.sectionHeading}>
              <span><small>ARMORY</small><strong>Six-limb loadout</strong></span>
              <em>Click a slot to cycle</em>
            </div>
            <div className={styles.loadout}>
              {loadout.map((weapon, index) => (
                <button key={index} type="button" onClick={() => cycleWeapon(index)} aria-label={`Slot ${index + 1}: ${weaponName(weapon)}. Click to change.`}>
                  <small>{String(index + 1).padStart(2, '0')}</small>
                  <b data-weapon={weapon}>{WEAPON_MARK[weapon]}</b>
                  <span>{weaponName(weapon)}</span>
                </button>
              ))}
            </div>
            <p className={styles.matchups}>Shield › Sword › Whip › Axe › Shield. Greater spin can still break a bad matchup.</p>
          </div>

          <button type="button" className={styles.fight} onClick={startBattle}>
            <span>Enter the pit</span>
            <small>{FORMAT_COPY[format].name} · floor {context.floor}</small>
          </button>
        </section>
      ) : (
        <section className={styles.battle}>
          <div className={styles.topHud}>
            <div className={styles.spinGauge} style={{ '--spin': `${spinPercent * 3.6}deg` } as CSSProperties}>
              <span><b>{Math.ceil(hud?.spin ?? 0)}</b><small>SPIN</small></span>
            </div>
            <div className={styles.objective}>
              <small>{FORMAT_COPY[format].name}</small>
              <strong>{objective}</strong>
              <span>{format === 'boss' ? 'Dodge the crimson charge line' : hud?.survivalRemaining === null ? 'Collect dropped arms automatically' : 'Quota met — endure'}</span>
            </div>
            <div className={styles.killCount}><b>{hud?.kills ?? 0}</b><small>KILLS</small></div>
          </div>

          <div className={styles.canvasWrap}>
            <canvas
              ref={canvasRef}
              className={styles.canvas}
              tabIndex={0}
              aria-label="Drill Ants battle arena. Move the pointer, drag on touch, or use arrow keys and WASD to steer."
              onPointerDown={aimAtPointer}
              onPointerMove={aimAtPointer}
            />
            {hud?.telegraph && <output className={styles.warning}>ROYAL DASH — CLEAR THE LINE</output>}
            {hud?.weapons.every((weapon) => weapon === null) && !outcome && (
              <output className={styles.unarmed}>UNARMED — NEXT HIT DEFEATS YOU</output>
            )}
            <div className={styles.steering} aria-label="Steering controls">
              <button type="button" aria-label="Steer up" onPointerDown={() => nudgeTarget(targetRef, 0, -0.16)}>↑</button>
              <button type="button" aria-label="Steer left" onPointerDown={() => nudgeTarget(targetRef, -0.16, 0)}>←</button>
              <span aria-hidden="true">◎</span>
              <button type="button" aria-label="Steer right" onPointerDown={() => nudgeTarget(targetRef, 0.16, 0)}>→</button>
              <button type="button" aria-label="Steer down" onPointerDown={() => nudgeTarget(targetRef, 0, 0.16)}>↓</button>
            </div>
            {phase === 'result' && outcome && (
              <dialog className={styles.result} open aria-labelledby="battle-result-title">
                <small>{outcome === 'success' ? 'THE CROWD ERUPTS' : 'YOUR STINGER FALLS SILENT'}</small>
                <h2 id="battle-result-title">{outcome === 'success' ? 'Pit conquered' : 'Spin extinguished'}</h2>
                <p>{outcome === 'success' ? `You leave the sand with ${hud.kills} confirmed defeat${hud.kills === 1 ? '' : 's'}.` : 'Every champion falls. The board awaits your report.'}</p>
                <button type="button" autoFocus onClick={continueResult}>{outcome === 'success' ? 'Claim victory' : 'Accept defeat'}</button>
              </dialog>
            )}
          </div>

          <div className={styles.bottomHud}>
            <div className={styles.battleLoadout} aria-label="Current weapons">
              {(hud?.weapons ?? emptySlots()).map((weapon, index) => (
                <div key={index} className={weapon ? styles.weaponLive : styles.weaponBroken} title={weaponName(weapon)}>
                  <small>{index + 1}</small>
                  <b data-weapon={weapon ?? undefined}>{weapon ? WEAPON_MARK[weapon] : '×'}</b>
                  <span>{weaponName(weapon)}</span>
                </div>
              ))}
            </div>
            <p><b>STEER</b> pointer / touch / WASD <i /> <b>RECOVER</b> spiral counterclockwise inward <i /> <b>LOOT</b> pass over drops</p>
          </div>
          <div className={styles.srStatus} aria-live="assertive">
            {hud?.telegraph ? 'Boss dash warning.' : outcome ? `Battle ${outcome}.` : ''}
          </div>
        </section>
      )}
    </div>
  );
}

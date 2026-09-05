'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Image from 'next/image';
import type { EncounterResult, MinigameProps } from '../contract';
import { awardRunXP, resolveEncounterStats } from '../../lib/player-stats';
import { advanceShift, characterGeometry, createShift, createShiftReceipt, FOODS_TO_FULL_SIZE, HEIGHT, HORIZON_Y, ITEM_SIZE, projectDrop, stopShiftMotion, shiftEarnings, SHIFT_SECONDS, TARGET_SCORE, WIDTH, type ItemKind, type GameMode, type ShiftReceipt } from './engine';
import { createShiftAudio, type ShiftAudio } from './audio';
import './wackdonalds.css';

const art: Record<ItemKind, { label: string; column: number; row: number }> = {
  burger: { label: 'Burger', column: 0, row: 0 },
  fries: { label: 'Fries', column: 1, row: 0 },
  shake: { label: 'Milkshake', column: 2, row: 0 },
  broccoli: { label: 'Broccoli', column: 3, row: 0 },
  apple: { label: 'Apple', column: 0, row: 1 },
  salad: { label: 'Salad', column: 1, row: 1 },
  mystery: { label: 'Mystery bag', column: 2, row: 1 },

};

function Sprite({ kind }: { kind: ItemKind }) {
  const sprite = art[kind];
  return <span className="wack-sprite"><Image unoptimized width={1774} height={887} src="/assets/minigames/eeron36/food-sprites.png" alt={sprite.label} draggable={false} style={{ left: `${-sprite.column * 100}%`, top: `${-sprite.row * 100}%` }} /></span>;
}

function CharacterFrame({ frame }: { frame: number }) {
  return <span className="wack-animation-sprite"><Image unoptimized width={1254} height={1254}
    src="/assets/minigames/eeron36/animation-sprites.png" alt="" draggable={false}
    style={{ left: `${-(frame % 2) * 100}%`, top: `${-Math.floor(frame / 2) * 100}%` }} /></span>;
}
function CharacterPose({ from, to, blend }: { from: number; to: number; blend: number }) {
  return <span className="wack-pose">
    <span style={{ opacity: 1 - blend }}><CharacterFrame frame={from} /></span>
    <span style={{ opacity: blend }}><CharacterFrame frame={to} /></span>
  </span>;
}

export default function Wackdonalds({ context, complete, onReceipt, mode = 'shift' }: MinigameProps & { mode?: GameMode; onReceipt?: (receipt: ShiftReceipt) => void }) {
  const [shift, setShift] = useState(() => createShift(context.seed, mode));
  const current = useRef(shift);
  const [started, setStarted] = useState(false);
  const startedAt = useRef(0);
  const [soundOn, setSoundOn] = useState(true);
  const soundEnabled = useRef(true);
  const sound = useRef<ShiftAudio | null>(null);
  useEffect(() => () => { sound.current?.dispose(); sound.current = null; }, []);

  function toggleSound() {
    const enabled = !soundEnabled.current;
    soundEnabled.current = enabled;
    setSoundOn(enabled);
    if (enabled && started && !sound.current) sound.current = createShiftAudio();
    sound.current?.setEnabled(enabled);
  }
  const root = useRef<HTMLDivElement>(null);
  const inputs = useRef(new Set<string>());
  const reported = useRef(false);
  const completeRef = useRef(complete);
  const receiptRef = useRef(onReceipt);
  useEffect(() => { receiptRef.current = onReceipt; }, [onReceipt]);
  useEffect(() => { completeRef.current = complete; }, [complete]);

  const stopMotion = useCallback(() => {
    inputs.current.clear();
    const stopped = stopShiftMotion(current.current);
    current.current = stopped;
    setShift(stopped);
  }, []);

  const play = () => { if (soundEnabled.current) sound.current = createShiftAudio(); stopMotion(); startedAt.current = performance.now(); setStarted(true); root.current?.focus(); };

  useEffect(() => {
    const heldInputs = inputs.current;
    const lostFocus = () => { stopMotion(); sound.current?.setEnabled(false); };
    const regainFocus = () => { if (!document.hidden) sound.current?.setEnabled(soundEnabled.current); };
    const visibility = () => { if (document.hidden) lostFocus(); else regainFocus(); };
    window.addEventListener('blur', lostFocus);
    window.addEventListener('focus', regainFocus);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('blur', lostFocus);
      window.removeEventListener('focus', regainFocus);
      document.removeEventListener('visibilitychange', visibility);
      heldInputs.clear();
    };
  }, [stopMotion]);

  useEffect(() => {
    if (!started || reported.current) return;
    const heldInputs = inputs.current;
    let frame = 0;
    let last = startedAt.current;
    let active = true;
    const tick = (time: number) => {
      if (!active) return;
      // Catch up after throttled frames without applying stale held keys.
      if (time - last > 250) stopMotion();
      const dt = Math.max(0, (time - last) / 1000);
      last = time;
      const left = inputs.current.has('ArrowLeft') || inputs.current.has('a') || inputs.current.has('pointer-left');
      const right = inputs.current.has('ArrowRight') || inputs.current.has('d') || inputs.current.has('pointer-right');
      const next = advanceShift(current.current, dt, Number(right) - Number(left));
      sound.current?.update(current.current, next);
      current.current = next;
      setShift(next);
      if (next.outcome) {
        reported.current = true;
        inputs.current.clear();
        // Settle immediately so cancelling cannot erase a bomb loss.
        const result: EncounterResult = {
          outcome: next.outcome,
          playerStats: { xp: awardRunXP(context.player.xp, shiftEarnings(next, context.floor)) },
        };
        const finalStats = resolveEncounterStats(context.player, result, 35 + context.floor * 5);
        const receipt = createShiftReceipt(next, finalStats.xp - context.player.xp, context.player.health - finalStats.health);
        completeRef.current(result);
        // Presentation follows settlement: a receipt cannot postpone or erase a loss.
        if (receipt) receiptRef.current?.(receipt);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { active = false; cancelAnimationFrame(frame); heldInputs.clear(); };
  }, [started, stopMotion, context]);

  function keyboard(event: KeyboardEvent, down: boolean) {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === 'm') { if (down && !event.repeat) { event.preventDefault(); toggleSound(); } return; }
    if (!['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(key)) return;
    if (!started || reported.current) return;
    event.preventDefault();
    if (down) inputs.current.add(key); else inputs.current.delete(key);
  }

  const endless = shift.mode === 'endless';
  const body = characterGeometry(shift);
  const targetMet = shift.score >= TARGET_SCORE;
  const failureHealth = resolveEncounterStats(context.player, { outcome: 'failure' }, 0).health;
  const healthPenalty = context.player.health - failureHealth;
  const feedback = endless ? shift.message : targetMet
    ? 'TARGET MET. SURVIVE FOR ' + shiftEarnings({ ...shift, outcome: 'success' }, context.floor) + ' XP.'
    : shift.elapsed >= SHIFT_SECONDS - 10
      ? (TARGET_SCORE - shift.score) + ' MORE POINTS OR LOSE ' + healthPenalty + ' HEALTH. NO PAY.'
      : shift.message;
  const sizePercent = Math.round(100 * Math.min(1, shift.eaten / FOODS_TO_FULL_SIZE));

  const biteAge = shift.bite ? shift.elapsed - shift.bite.at : Infinity;
  const throwAge = shift.lastThrow < 0 ? Infinity : shift.elapsed - shift.lastThrow;
  const throwing = throwAge < 0.36;
  const throwBlend = throwAge < 0.06 ? throwAge / 0.06 : throwAge < 0.18 ? 1 : Math.max(0, (0.36 - throwAge) / 0.18);
  const biteBlend = biteAge < 0.05 ? biteAge / 0.05 : biteAge < 0.13 ? 1 : Math.max(0, (0.3 - biteAge) / 0.17);


  // A keyboard-operated arcade surface intentionally receives focus and arrow-key events.
  // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex
  return <div className={`wack-game ${!started ? 'wack-stopped' : ''}`} role="application" aria-label="Wackdonalds catching game" ref={root} tabIndex={0}
    onKeyDown={event => keyboard(event, true)} onKeyUp={event => keyboard(event, false)}
    onBlur={event => { if (started && !event.currentTarget.contains(event.relatedTarget as Node | null)) stopMotion(); }}>
    <header className="wack-header">
      <div><span className="wack-eyebrow">EERON36 PRESENTS</span><h2>WACKDONALDS<span>*</span></h2></div>
      <span className="wack-shift-label">*TECHNICALLY LUNCH.</span>
    </header>
    <div className="wack-scoreboard" aria-label="Shift progress">
      <div><span>{endless ? 'FOOD SCORE' : targetMet ? 'GOAL MET' : 'FOOD GOAL'}</span><strong>{shift.score}{!endless && <small> / {TARGET_SCORE}</small>}</strong></div>
      <div><span>{endless ? 'TIME ALIVE' : 'SHIFT ENDS'}</span><strong>{endless ? Math.floor(shift.elapsed) : Math.max(0, Math.ceil(SHIFT_SECONDS - shift.elapsed))}<small> SEC</small></strong></div>
      <div><span>STRIKES</span><strong aria-label={`${shift.strikes} of 3 strikes`}>{shift.strikes}<small> / 3</small></strong></div>
    </div>
    <div className="wack-stage" aria-label="Food flies from the worker toward you. Move freely left and right to eat it when it reaches your mouth. Dodge plants.">
      <div className="wack-camera">
      <div className={`wack-thrower ${throwing ? 'wack-toss' : ''}`} style={{ top: `${HORIZON_Y / HEIGHT * 100}%` }} aria-hidden="true"><CharacterPose from={2} to={3} blend={throwBlend} /></div>
      {shift.drops.map(drop => {
        const bad = ['broccoli', 'apple', 'salad'].includes(drop.kind);
        const projected = projectDrop(drop.x, drop.progress);
        return <div key={drop.id} aria-hidden="true"
          className={`wack-drop ${bad ? 'wack-drop-bad' : ''} ${drop.kind === 'mystery' ? 'wack-drop-mystery' : ''}`}
          style={{ left: `${projected.x / WIDTH * 100}%`, top: `${projected.y / HEIGHT * 100}%`, width: `${ITEM_SIZE * projected.scale / WIDTH * 100}%`, zIndex: 20 + Math.floor(drop.progress * 10) }}>
          <Sprite kind={drop.kind} />{bad && <b className="wack-wrong">×</b>}{drop.kind === 'mystery' && <span className="wack-bag-label"><b>50/50</b><span>+25 / BOOM</span></span>}
        </div>;
      })}
      <div className="wack-character" aria-hidden="true" style={{ left: `${body.x / WIDTH * 100}%`, top: `${body.y / HEIGHT * 100}%`, width: `${body.size / WIDTH * 100}%` }}>
        <CharacterPose from={0} to={1} blend={biteBlend} />
      </div>
      {shift.bite && biteAge < 0.55 && <span key={shift.bite.id} className={`wack-bite ${shift.bite.points ? '' : 'wack-bite-bad'}`} aria-hidden="true"
        style={{ left: `${body.x / WIDTH * 100}%`, top: `${(body.y - body.size * 0.5) / HEIGHT * 100}%` }}>{shift.bite.points ? `NOM! +${shift.bite.points}` : 'PLANT!'}</span>}
      </div>
      {!started && <div className="wack-cover">
        <div className="wack-instructions">
          <p className="wack-eyebrow">WELCOME TO WACKDONALDS.</p>
          <h3>NOW WORK.</h3>
          <p>{endless ? 'He throws. You eat. Work until you drop. No breaks.' : 'He throws. You eat. Not salad. 30 seconds. No breaks.'}</p>
          {!started && <>
            <p>{endless ? 'Chase the highest food score. Three plants = fired.' : <>Survive with <b>at least {TARGET_SCORE} points</b>. Three plants = fired.</>}</p>
            {!endless && <p className="wack-penalty"><b>MISS {TARGET_SCORE}? NO PAY.</b><br />Any failure costs <b>{healthPenalty} health</b>{context.player.upgrades.armor > 0 ? ' with your armor' : ''}.</p>}
            <p className="wack-growth-rule">Line up your mouth. Eat. Grow. Dodge the plants.</p>
            <p className="wack-growth-rule">Burger + fries + shake = 6 bonus points.</p>
            {!endless && <p className="wack-growth-rule">Finish with {TARGET_SCORE} points: <b>{35 + context.floor * 5} XP</b>.<br />Every 2 extra points: +1 XP, up to +20.</p>}
            <div className="wack-risk"><Sprite kind="mystery" /><span><b>50/50 MYSTERY BAG</b><br /><b>50%: +25 POINTS</b><br /><b>50%: BOOM. RUN OVER.</b><br />You can just let it fall.</span></div>
          </>}
          <button className="wack-start" onClick={play}>CLOCK IN →</button>
          <p className="wack-key-hint">← → or A / D to move. Touch buttons work too. M toggles sound.</p>
        </div>
      </div>}
    </div>
    <output className="wack-feedback" aria-live="polite" aria-atomic="true">{feedback}</output>
    <div className="wack-growth"><span>{sizePercent === 100 ? 'MAXIMUM EMPLOYEE' : 'EMPLOYEE SIZE'}</span><meter min={0} max={FOODS_TO_FULL_SIZE} value={Math.min(FOODS_TO_FULL_SIZE, shift.eaten)} aria-label="Growth from food eaten" /><b>{sizePercent}%</b><span>{shift.score >= TARGET_SCORE ? 'TARGET MET. SURVIVE.' : 'KEEP EATING.'}</span></div>
    <div className="wack-bottom">
      <div className="wack-meal"><span>MEAL = +6</span><div>{(['burger', 'fries', 'shake'] as const).map(kind =>
        <span key={kind} className={shift.tray[kind] ? 'wack-collected' : ''} aria-label={`${art[kind].label}: ${shift.tray[kind] ? 'collected' : 'needed'}`}>
          <Sprite kind={kind} /><b aria-hidden="true">{shift.tray[kind] ? '✓' : '+'}</b>
        </span>)}</div></div>
      <div className="wack-controls">
        {(['left', 'right'] as const).map(direction => <button key={direction} aria-label={`Move ${direction}`}
          disabled={!started}
          onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); inputs.current.add(`pointer-${direction}`); }}
          onPointerUp={() => inputs.current.delete(`pointer-${direction}`)}
          onPointerCancel={() => inputs.current.delete(`pointer-${direction}`)}
          onLostPointerCapture={() => inputs.current.delete(`pointer-${direction}`)}>{direction === 'left' ? '←' : '→'}</button>)}
        <button className="wack-sound" onClick={toggleSound} aria-pressed={soundOn} aria-label="Music and sound effects">Sound {soundOn ? 'on' : 'off'}</button>

      </div>
    </div>
    <p className="wack-fine-print">Burger +2 · Fries +1 · Shake +3 · Plants = strike</p>
  </div>;
}

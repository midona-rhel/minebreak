'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import EncounterHost from '@/components/encounter-host';
import { createEncounterContext } from '@/lib/player-stats';
import type { MinigameProps } from '../contract';
import type { ShiftReceipt } from './engine';
import Wackdonalds from './index';
import styles from './free-play.module.css';

function freshShift(seed: number) {
  return createEncounterContext({ seed, floor: 1, cellId: 0 }, {
    health: 5, maxHealth: 5, xp: 0,
    upgrades: { armor: 0, repair: 0, salvage: 0 },
    profile: { shards: 0, bestFloor: 1, totalDisarmed: 0 },
  });
}

/** Standalone practice uses the real encounter host with disposable run stats. */
export default function FreePlay() {
  const [context, setContext] = useState(() => freshShift(14021));
  const [playing, setPlaying] = useState(true);
  const replayButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!playing) replayButton.current?.focus(); }, [playing]);
  const [receipt, setReceipt] = useState<ShiftReceipt | null>(null);
  const definition = useMemo(() => ({
    id: 'eeron36',
    title: 'Wackdonalds',
    Component: function PracticeShift(props: MinigameProps) {
      return <Wackdonalds {...props} onReceipt={setReceipt} />;
    },
  }), []);

  function replay() {
    setContext(freshShift(crypto.getRandomValues(new Uint32Array(1))[0]));
    setReceipt(null);
    setPlaying(true);
  }

  return <main className={styles.page}>
    <section className={styles.card} aria-label="Wackdonalds free play">
      <p className={styles.brand}>WACKDONALDS · FREE PLAY</p>
      <h1>{receipt ? receipt.outcome === 'success' ? 'SHIFT OVER.' : 'YOU’RE FIRED.' : 'MORE WORK?'}</h1>
      {receipt ? <section className={styles.receipt} aria-label="End-of-shift receipt">
        <h2>YOUR SHIFT RECEIPT</h2>
        <p className={styles.stamp}>{receipt.outcome === 'success' ? 'PAID. SOMEHOW.' : 'PAYMENT DENIED.'}</p>
        <dl>
          <div><dt>Food score</dt><dd>{receipt.score}</dd></div>
          <div><dt>Meals completed</dt><dd>{receipt.meals}</dd></div>
          <div><dt>Salad incidents</dt><dd>{receipt.strikes} / 3</dd></div>
          <div><dt>Time worked</dt><dd>{receipt.seconds} sec</dd></div>
          <div><dt>Health lost</dt><dd>{receipt.healthLost}</dd></div>
          <div className={styles.total}><dt>XP EARNED</dt><dd>+{receipt.xp}</dd></div>
        </dl>
        <p className={styles.management}>{receipt.strikes > 0
          ? 'MANAGEMENT IS WATCHING.'
          : receipt.outcome === 'success' ? 'NO SALAD. NO COMPLAINTS. GET BACK TO WORK.' : 'YOUR UNPAID EFFORT HAS BEEN NOTED.'}</p>
      </section> : <p>Burgers are still falling. Someone has to eat them.</p>}
      <button ref={replayButton} onClick={replay}>ANOTHER SHIFT →</button>
      <p className={styles.note}>Fresh health and new throws every shift. Practice earnings stay here.</p>
      <Link href="/">Back to Minebreak</Link>
    </section>
    {playing && <EncounterHost key={context.seed} definition={definition} context={context}
      complete={() => setPlaying(false)} cancel={() => { setPlaying(false); setReceipt(null); }} />}
  </main>;
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import Overworld from '@/components/overworld';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Flag,
  Heart,
  Pickaxe,
  RotateCcw,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Compass,
  Leaf,
  HelpCircle,
} from 'lucide-react';

import EncounterHost from '@/components/encounter-host';
import { selectMinigame } from '@/minigames/registry';
import type { EncounterResult } from '@/minigames/contract';
type Cell = {
  id: number;
  mine: boolean;
  nearby: number;
  open: boolean;
  flagged: boolean;
  disarmed: boolean;
};
type Profile = { shards: number; best: number; disarmed: number };
type Perk = 'armor' | 'repair' | 'salvage';

const SIZE = 8;
const PROFILE_KEY = 'minebreak-profile-v1';

function rng(seed: number) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function recount(cells: Cell[]) {
  return cells.map((cell) => {
    if (cell.mine) return { ...cell, nearby: 0 };
    const row = Math.floor(cell.id / SIZE);
    const col = cell.id % SIZE;
    let nearby = 0;
    for (let y = -1; y <= 1; y += 1)
      for (let x = -1; x <= 1; x += 1) {
        const r = row + y;
        const c = col + x;
        if (
          r >= 0 &&
          r < SIZE &&
          c >= 0 &&
          c < SIZE &&
          cells[r * SIZE + c]?.mine
        )
          nearby += 1;
      }
    return { ...cell, nearby };
  });
}

function makeBoard(floor: number, seed: number) {
  const random = rng(seed);
  const count = Math.min(9 + floor * 2, 18);
  const mineIds = new Set<number>();
  while (mineIds.size < count) mineIds.add(Math.floor(random() * SIZE * SIZE));
  return recount(
    Array.from({ length: SIZE * SIZE }, (_, id) => ({
      id,
      mine: mineIds.has(id),
      nearby: 0,
      open: false,
      flagged: false,
      disarmed: false,
    })),
  );
}

function floodOpen(source: Cell[], start: number) {
  const cells = source.map((cell) => ({ ...cell }));
  const queue = [start];
  const seen = new Set<number>();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const cell = cells[id];
    if (!cell || cell.mine || cell.flagged) continue;
    cell.open = true;
    if (cell.nearby) continue;
    const row = Math.floor(id / SIZE);
    const col = id % SIZE;
    for (let y = -1; y <= 1; y += 1)
      for (let x = -1; x <= 1; x += 1) {
        const r = row + y;
        const c = col + x;
        if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) queue.push(r * SIZE + c);
      }
  }
  return cells;
}

export default function MinebreakGame() {
  const [flagMode, setFlagMode] = useState(false);
  const [floor, setFloor] = useState(1);
  const [seed, setSeed] = useState(14021);
  const [cells, setCells] = useState(() => makeBoard(1, 14021));
  const [hp, setHp] = useState(5);
  const [maxHp, setMaxHp] = useState(5);
  const [xp, setXp] = useState(0);
  const [first, setFirst] = useState(true);
  const [encounter, setEncounter] = useState<{ id: number } | null>(null);
  const [phase, setPhase] = useState<'board' | 'reward' | 'dead'>('board');
  const [message, setMessage] = useState(
    'Uncover the stone path. Your first step is always safe.',
  );
  const [perks, setPerks] = useState({ armor: 0, repair: 0, salvage: 0 });
  const [profile, setProfile] = useState<Profile>({
    shards: 0,
    best: 1,
    disarmed: 0,
  });
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PROFILE_KEY);
      if (saved) setProfile(JSON.parse(saved));
    } catch {}
  }, []);
  const save = useCallback((next: Profile) => {
    setProfile(next);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  }, []);
  const safeLeft = cells.filter((c) => !c.mine && !c.open).length;
  const threats = cells.filter((c) => c.mine && !c.disarmed).length;
  const flags = cells.filter((c) => c.flagged).length;

  useEffect(() => {
    if (!safeLeft && phase === 'board' && !encounter) {
      const shards = 4 + floor * 2 + perks.salvage * 2;
      save({
        shards: profile.shards + shards,
        best: Math.max(profile.best, floor + 1),
        disarmed: profile.disarmed,
      });
      setMessage(`Island cleared. ${shards} shards recovered.`);
      setPhase('reward');
    }
  }, [safeLeft, phase, encounter, floor, perks.salvage, profile, save]);

  const open = (id: number) => {
    if (phase !== 'board' || encounter || cells[id].open || cells[id].flagged)
      return;
    let next = cells.map((c) => ({ ...c }));
    if (first && next[id].mine) {
      const safe = next.find((c) => !c.mine && c.id !== id)!;
      safe.mine = true;
      next[id].mine = false;
      next = recount(next);
    }
    setFirst(false);
    const target = next[id];
    if (target.mine) {
      target.open = true;
      setCells(next);
      setEncounter({ id });
      setMessage('A portal opens beneath your feet.');
    } else {
      setCells(floodOpen(next, id));
      setXp((value) => value + 2);
    }
  };
  const flag = (id: number) => {
    if (phase !== 'board' || encounter || cells[id].open) return;
    setCells((all) =>
      all.map((c) => (c.id === id ? { ...c, flagged: !c.flagged } : c)),
    );
  };
  const finish = useCallback(
    (result: EncounterResult) => {
      if (!encounter) return;
      setCells((all) =>
        all.map((c) =>
          c.id === encounter.id ? { ...c, open: true, disarmed: true } : c,
        ),
      );
      if (result.outcome === 'success') {
        setXp((v) => v + 35 + floor * 5);
        save({ ...profile, disarmed: profile.disarmed + 1 });
        setMessage('Encounter completed.');
      } else {
        const damage = Math.max(1, 2 - perks.armor);
        const health = hp - damage;
        setHp(health);
        setMessage(`Lost ${damage} hearts. Your journey continues.`);
        if (health <= 0) setPhase('dead');
      }
      setEncounter(null);
    },
    [encounter, floor, hp, perks.armor, profile, save],
  );
  const descend = (perk: Perk) => {
    const nextFloor = floor + 1;
    setPerks((p) => ({ ...p, [perk]: p[perk] + 1 }));
    if (perk === 'armor') {
      setMaxHp((v) => v + 1);
      setHp((v) => v + 1);
    }
    if (perk === 'repair') setHp((v) => Math.min(maxHp, v + 2));
    const nextSeed = Date.now() % 999999;
    setFloor(nextFloor);
    setSeed(nextSeed);
    setCells(makeBoard(nextFloor, nextSeed));
    setFirst(true);
    setPhase('board');
    setMessage(`Arrived at island ${nextFloor}.`);
  };
  const newRun = () => {
    const nextSeed = Date.now() % 999999;
    setFloor(1);
    setSeed(nextSeed);
    setCells(makeBoard(1, nextSeed));
    setHp(5);
    setMaxHp(5);
    setXp(0);
    setFirst(true);
    setEncounter(null);
    setPhase('board');
    setPerks({ armor: 0, repair: 0, salvage: 0 });
    setMessage('A new journey begins. Choose your first tile.');
  };

  return (
    <main className="fantasy-shell">
      <header className="game-header">
        <a className="wordmark" href="#world">
          <span className="brand-icon">
            <Pickaxe />
          </span>
          <span>
            MINEBREAK<small>A LITTLE DANGER. A GRAND ADVENTURE.</small>
          </span>
        </a>
        <div className="journey-badge">
          <Compass size={18} /> Journey {String(floor).padStart(2, '0')}
        </div>
        <button className="wood-button" onClick={newRun}>
          <RotateCcw size={16} /> New journey
        </button>
      </header>

      <div className="adventure-heading">
        <div>
          <p className="eyebrow">THE MOSSBOUND ISLES</p>
          <h1>Every step tells a story.</h1>
        </div>
        <span className="region-tag">
          <Leaf size={15} /> Verdant reach
        </span>
      </div>

      <div className="adventure-layout">
        <aside className="parchment traveler">
          <div className="panel-kicker">
            <Compass size={16} /> YOUR JOURNEY
          </div>
          <h2>The wanderer</h2>
          <div className="health-label">
            <span>Hearts</span>
            <b>
              {hp} / {maxHp}
            </b>
          </div>
          <div className="hearts" aria-label={`${hp} of ${maxHp} hearts`}>
            {Array.from({ length: maxHp }, (_, i) => (
              <Heart
                size={23}
                key={i}
                className={i < hp ? 'heart-filled' : ''}
              />
            ))}
          </div>
          <div className="experience-label">
            <span>Level {Math.floor(xp / 100) + 1}</span>
            <span>{xp % 100} / 100 XP</span>
          </div>
          <div className="experience-track">
            <span style={{ width: `${xp % 100}%` }} />
          </div>
          <div className="journal-divider" />
          <p className="panel-kicker">TRAVEL CHARMS</p>
          <div className="charm-row">
            <span className="charm-icon">
              <Shield size={19} />
            </span>
            <div>
              <b>Stoneguard</b>
              <small>Protection</small>
            </div>
            <em>+{perks.armor}</em>
          </div>
          <div className="charm-row">
            <span className="charm-icon green">
              <Leaf size={19} />
            </span>
            <div>
              <b>Wildroot</b>
              <small>Restoration</small>
            </div>
            <em>+{perks.repair}</em>
          </div>
          <div className="charm-row">
            <span className="charm-icon purple">
              <Sparkles size={19} />
            </span>
            <div>
              <b>Shardfinder</b>
              <small>Discovery</small>
            </div>
            <em>+{perks.salvage}</em>
          </div>
          <p className="journal-note">A curious heart goes a long way.</p>
        </aside>

        <section
          id="world"
          className="world-section"
          aria-label="Floating island minefield"
        >
          <div className="island-caption">
            <span>ISLAND {String(floor).padStart(2, '0')}</span>
            <h2>{floor === 1 ? 'The First Crossing' : `Crossing ${floor}`}</h2>
          </div>
          <Overworld
            cells={cells}
            locked={phase !== 'board' || Boolean(encounter)}
            flagMode={flagMode}
            reveal={open}
            flag={flag}
          />
          <div className="world-toolbar">
            <button
              className={!flagMode ? 'selected' : ''}
              aria-pressed={!flagMode}
              onClick={() => setFlagMode(false)}
            >
              <Pickaxe size={18} /> Explore
            </button>
            <button
              className={flagMode ? 'selected' : ''}
              aria-pressed={flagMode}
              onClick={() => setFlagMode(true)}
            >
              <Flag size={18} /> Place flag
            </button>
            <span className="toolbar-divider" />
            <span>
              <Flag size={15} />
              {flags} flags
            </span>
          </div>
          <output className="world-message" aria-live="polite">
            {message}
          </output>
          <p className="input-hint">
            Click to explore · Drag to orbit · Scroll to zoom · Right-click or F to flag
          </p>
        </section>

        <aside className="island-sidebar">
          <section className="parchment map-card">
            <div className="panel-kicker">
              <Leaf size={16} /> ISLAND NOTES
            </div>
            <h2>A path through the unknown</h2>
            <div className="island-counts">
              <div>
                <b>{safeLeft}</b>
                <span>safe tiles left</span>
              </div>
              <div>
                <b>{threats}</b>
                <span>hidden dangers</span>
              </div>
            </div>
            <div className="cleared-track">
              <i
                style={{
                  width: `${(1 - safeLeft / cells.filter((c) => !c.mine).length) * 100}%`,
                }}
              />
            </div>
            <p>
              Match the numbers to nearby dangers. Clear every safe tile to
              reach the next island.
            </p>
            <Dialog>
              <DialogTrigger className="text-button">
                <HelpCircle size={15} /> Field guide
              </DialogTrigger>
              <DialogContent className="fantasy-modal">
                <DialogTitle>Your field guide</DialogTitle>
                <DialogDescription>
                  Reveal all safe tiles to cross the island. Numbers count mines
                  in the eight surrounding tiles. Flag suspected mines with
                  right-click, the flag tool, or F when a tile has keyboard
                  focus. Your first reveal is safe. A mine opens an encounter;
                  the shared harness returns you to the island when it ends.
                </DialogDescription>
              </DialogContent>
            </Dialog>
          </section>
          <section className="treasure-card">
            <Sparkles size={26} />
            <p>YOUR KEEPSAKES</p>
            <strong>
              {profile.shards}
              <span>shards</span>
            </strong>
            <small>Saved between journeys</small>
            <div className="treasure-divider" />
            <span>
              Furthest island <b>{profile.best}</b>
            </span>
          </section>
        </aside>
      </div>

      {encounter && (
        <EncounterHost
          key={`${seed}:${floor}:${encounter.id}`}
          definition={selectMinigame(seed + floor * 101 + encounter.id)}
          context={{
            seed: seed + floor * 101 + encounter.id,
            floor,
            cellId: encounter.id,
          }}
          complete={finish}
          cancel={() => {
            setCells((all) =>
              all.map((c) =>
                c.id === encounter.id ? { ...c, open: false } : c,
              ),
            );
            setEncounter(null);
            setMessage('Returned to the island.');
          }}
        />
      )}
      <Dialog open={phase === 'reward'}>
        <DialogContent className="fantasy-modal" showCloseButton={false}>
          <DialogTitle>Something for the road</DialogTitle>
          <DialogDescription>
            Island cleared. Choose a charm for this journey.
          </DialogDescription>
          <div className="reward-options">
            <button onClick={() => descend('armor')}>
              <Shield />
              <span>
                <b>Stoneguard</b>
                <small>Take less damage. Gain one maximum heart.</small>
              </span>
            </button>
            <button onClick={() => descend('repair')}>
              <Leaf />
              <span>
                <b>Wildroot</b>
                <small>Restore two hearts.</small>
              </span>
            </button>
            <button onClick={() => descend('salvage')}>
              <Sparkles />
              <span>
                <b>Shardfinder</b>
                <small>Discover more shards on every island.</small>
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={phase === 'dead'}>
        <DialogContent className="fantasy-modal" showCloseButton={false}>
          <Skull className="modal-emblem" />
          <DialogTitle>Every journey leaves a story.</DialogTitle>
          <DialogDescription>
            You reached island {floor}. Your {profile.shards} shards are safely
            kept.
          </DialogDescription>
          <button className="wood-button" onClick={newRun}>
            <Swords size={18} /> Begin again
          </button>
        </DialogContent>
      </Dialog>
      <footer className="game-footer">
        <span>Follow the numbers. Trust your curiosity.</span>
        <span>Progress saved on this device</span>
      </footer>
    </main>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Activity, Flag, Heart, Pickaxe, Radar, RotateCcw, Shield, Skull, Sparkles, Swords, Zap } from 'lucide-react';

import EncounterHost from '@/components/encounter-host';
import { minigames, selectMinigame } from '@/minigames/registry';
import type { EncounterContext, EncounterResult } from '@/minigames/contract';
import { createEncounterContext } from '@/lib/player-stats';
type Cell = { id: number; mine: boolean; nearby: number; open: boolean; flagged: boolean; disarmed: boolean };
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
    for (let y = -1; y <= 1; y += 1) for (let x = -1; x <= 1; x += 1) {
      const r = row + y; const c = col + x;
      if (r >= 0 && r < SIZE && c >= 0 && c < SIZE && cells[r * SIZE + c]?.mine) nearby += 1;
    }
    return { ...cell, nearby };
  });
}

function makeBoard(floor: number, seed: number) {
  const random = rng(seed);
  const count = Math.min(9 + floor * 2, 18);
  const mineIds = new Set<number>();
  while (mineIds.size < count) mineIds.add(Math.floor(random() * SIZE * SIZE));
  return recount(Array.from({ length: SIZE * SIZE }, (_, id) => ({
    id,
    mine: mineIds.has(id),
    nearby: 0,
    open: false,
    flagged: false,
    disarmed: false,
  })));
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
    const row = Math.floor(id / SIZE); const col = id % SIZE;
    for (let y = -1; y <= 1; y += 1) for (let x = -1; x <= 1; x += 1) {
      const r = row + y; const c = col + x;
      if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) queue.push(r * SIZE + c);
    }
  }
  return cells;
}

function ThreeScene({ danger }: { danger: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const mount = ref.current;
    if (!mount) return;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 5.2, 10.5);
    camera.lookAt(0, 0, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0x7fe8dc, 0x06101b, 1.8));
    const point = new THREE.PointLight(danger ? 0xff325b : 0x2be1c2, danger ? 35 : 18, 18);
    point.position.set(1, 2, 2);
    scene.add(point);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.3, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x10202b, metalness: 0.7, roughness: 0.32 }));
    base.scale.z = 0.7; base.position.y = -1.8; scene.add(base);
    const grid = new THREE.GridHelper(13, 20, 0x2d7470, 0x173a3c);
    grid.position.y = -1.52; grid.scale.z = 0.72; scene.add(grid);
    const mine = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: danger ? 0xa91f3e : 0x17464b, emissive: danger ? 0x620719 : 0x073f39, emissiveIntensity: 1.7, metalness: 0.75, roughness: 0.22 });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), material); mine.add(core);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.07, 8, 48), new THREE.MeshStandardMaterial({ color: danger ? 0xff5d72 : 0x58ead5, emissive: danger ? 0x6b081c : 0x07564c }));
    ring.rotation.x = Math.PI / 2; mine.add(ring);
    for (let i = 0; i < 8; i += 1) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.75, 6), material);
      const a = i / 8 * Math.PI * 2;
      spike.position.set(Math.cos(a) * 1.28, 0, Math.sin(a) * 1.28); spike.rotation.z = Math.PI / 2; spike.rotation.y = -a; mine.add(spike);
    }
    mine.position.set(5, 0.2, -2); mine.scale.setScalar(0.72); scene.add(mine);
    const dustGeo = new THREE.BufferGeometry(); const dust: number[] = []; const random = rng(82);
    for (let i = 0; i < 120; i += 1) dust.push((random() - .5) * 17, random() * 7 - 1, (random() - .5) * 10);
    dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(dust, 3));
    const particles = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0x79ead9, size: .03, transparent: true, opacity: .45 })); scene.add(particles);
    const resize = () => { renderer.setSize(mount.clientWidth, mount.clientHeight, false); camera.aspect = mount.clientWidth / Math.max(mount.clientHeight, 1); camera.updateProjectionMatrix(); };
    const observer = new ResizeObserver(resize); observer.observe(mount); resize();
    let frame = 0; const clock = new THREE.Clock();
    const draw = () => { const t = clock.getElapsedTime(); mine.rotation.y = t * .28; mine.position.y = .2 + Math.sin(t * 1.4) * .16; ring.rotation.z = t * .8; particles.rotation.y = t * .015; point.intensity = (danger ? 34 : 17) + Math.sin(t * 3) * (danger ? 8 : 2); renderer.render(scene, camera); frame = requestAnimationFrame(draw); }; draw();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); scene.traverse((object) => { if (object instanceof THREE.Mesh || object instanceof THREE.Points) { object.geometry.dispose(); const mats = Array.isArray(object.material) ? object.material : [object.material]; mats.forEach((m) => m.dispose()); } }); renderer.dispose(); renderer.domElement.remove(); };
  }, [danger]);
  return <div className="mb-three" ref={ref} aria-hidden="true" />;
}

export default function MinebreakGame() {
  const [floor, setFloor] = useState(1); const [seed, setSeed] = useState(14021); const [cells, setCells] = useState(() => makeBoard(1, 14021));
  const [hp, setHp] = useState(5); const [maxHp, setMaxHp] = useState(5); const [xp, setXp] = useState(0); const [first, setFirst] = useState(true);
  const [encounter, setEncounter] = useState<{ id: number; context: EncounterContext } | null>(null); const [phase, setPhase] = useState<'board' | 'reward' | 'dead'>('board');
  const [message, setMessage] = useState('Trace a safe path through the field.'); const [perks, setPerks] = useState({ armor: 0, repair: 0, salvage: 0 });
  const [profile, setProfile] = useState<Profile>({ shards: 0, best: 1, disarmed: 0 });
  useEffect(() => { try { const saved = localStorage.getItem(PROFILE_KEY); if (saved) setProfile(JSON.parse(saved)); } catch {} }, []);
  const save = useCallback((next: Profile) => { setProfile(next); localStorage.setItem(PROFILE_KEY, JSON.stringify(next)); }, []);
  const safeLeft = cells.filter((c) => !c.mine && !c.open).length; const threats = cells.filter((c) => c.mine && !c.disarmed).length; const flags = cells.filter((c) => c.flagged).length;

  useEffect(() => { if (!safeLeft && phase === 'board' && !encounter) { const shards = 4 + floor * 2 + perks.salvage * 2; save({ shards: profile.shards + shards, best: Math.max(profile.best, floor + 1), disarmed: profile.disarmed }); setMessage(`Sector clear. ${shards} shards recovered.`); setPhase('reward'); } }, [safeLeft, phase, encounter, floor, perks.salvage, profile, save]);

  const open = (id: number) => {
    if (phase !== 'board' || encounter || cells[id].open || cells[id].flagged) return;
    let next = cells.map((c) => ({ ...c }));
    if (first && next[id].mine) { const safe = next.find((c) => !c.mine && c.id !== id)!; safe.mine = true; next[id].mine = false; next = recount(next); }
    setFirst(false); const target = next[id];
    if (target.mine) {
      target.open = true;
      setCells(next);
      setEncounter({
        id,
        context: createEncounterContext(
          { seed: seed + floor * 101 + id, floor, cellId: id },
          {
            health: hp,
            maxHealth: maxHp,
            xp,
            upgrades: perks,
            profile: { shards: profile.shards, bestFloor: profile.best, totalDisarmed: profile.disarmed },
          },
        ),
      });
      setMessage('Mine triggered. Hostile signal inbound.');
    }
    else { setCells(floodOpen(next, id)); setXp((value) => value + 2); }
  };
  const flag = (event: React.MouseEvent, id: number) => { event.preventDefault(); if (phase !== 'board' || encounter || cells[id].open) return; setCells((all) => all.map((c) => c.id === id ? { ...c, flagged: !c.flagged } : c)); };
  const finish = useCallback((result: EncounterResult) => { if (!encounter) return; setCells((all) => all.map((c) => c.id === encounter.id ? { ...c, open: true, disarmed: true } : c)); if (result.outcome === 'success') { setXp((v) => v + 35 + floor * 5); save({ ...profile, disarmed: profile.disarmed + 1 }); setMessage('Encounter completed.'); } else { const damage = Math.max(1, 2 - perks.armor); const health = hp - damage; setHp(health); setMessage(`System hit. Lost ${damage} integrity.`); if (health <= 0) setPhase('dead'); } setEncounter(null); }, [encounter, floor, hp, perks.armor, profile, save]);
  const descend = (perk: Perk) => { const nextFloor = floor + 1; setPerks((p) => ({ ...p, [perk]: p[perk] + 1 })); if (perk === 'armor') { setMaxHp((v) => v + 1); setHp((v) => v + 1); } if (perk === 'repair') setHp((v) => Math.min(maxHp, v + 2)); const nextSeed = Date.now() % 999999; setFloor(nextFloor); setSeed(nextSeed); setCells(makeBoard(nextFloor, nextSeed)); setFirst(true); setPhase('board'); setMessage(`Descending to sector ${nextFloor}.`); };
  const newRun = () => { const nextSeed = Date.now() % 999999; setFloor(1); setSeed(nextSeed); setCells(makeBoard(1, nextSeed)); setHp(5); setMaxHp(5); setXp(0); setFirst(true); setEncounter(null); setPhase('board'); setPerks({ armor: 0, repair: 0, salvage: 0 }); setMessage('New descent initialized.'); };

  return <main className="mb-shell"><ThreeScene danger={Boolean(encounter)} /><header className="mb-top"><div className="mb-brand"><span><Pickaxe /></span><b>MINE<i>BREAK</i></b><small>ROGUELIKE PROTOCOL</small></div><div className="sector"><i /> SECTOR {String(floor).padStart(2, '0')} <span>DEPTH {floor * 120}M</span></div><button onClick={newRun}><RotateCcw /> NEW RUN</button></header>
    <section className="mb-layout"><aside className="mb-panel stats"><h3><Activity /> RUN STATUS</h3><div className="integrity"><span>INTEGRITY</span><b>{hp}/{maxHp}</b></div><div className="hearts">{Array.from({ length: maxHp }, (_, i) => <Heart key={i} className={i < hp ? 'on' : ''} />)}</div><div className="xp"><span><Zap /> SIGNAL LVL {Math.floor(xp / 100) + 1}</span><b>{xp % 100}%</b><i><em style={{ width: `${xp % 100}%` }} /></i></div><div className="stat-pair"><span><small>THREATS</small><b>{threats}</b></span><span><small>FLAGS</small><b>{flags}</b></span></div><div className="modules"><small>ACTIVE MODULES</small><p><Shield /> Plating <b>+{perks.armor}</b></p><p><Radar /> Repair <b>+{perks.repair}</b></p><p><Sparkles /> Salvage <b>+{perks.salvage}</b></p></div></aside>
      <section className="mb-panel board-panel"><div className="board-title"><span><small>ACTIVE GRID</small><h1>Sector {String(floor).padStart(2, '0')}</h1></span><b><i /> LIVE</b></div><div className="grid-frame"><div className="mine-grid">{cells.map((cell) => <button key={cell.id} className={`${cell.open ? 'open' : ''} ${cell.flagged ? 'flagged' : ''} ${cell.mine && cell.open ? 'mine' : ''} n${cell.nearby}`} onClick={() => open(cell.id)} onContextMenu={(event) => flag(event, cell.id)} aria-label={cell.flagged ? 'Flagged' : cell.open ? cell.mine ? 'Disarmed mine' : `${cell.nearby} nearby mines` : 'Hidden cell'}>{cell.flagged ? <Flag /> : cell.mine && cell.open ? <span>{cell.disarmed ? '×' : '◇'}</span> : cell.open && cell.nearby ? cell.nearby : ''}</button>)}</div></div><output><small>{phase === 'board' ? 'MISSION' : 'STATUS'}</small>{message}</output><div className="controls"><span>CLICK <b>REVEAL</b></span><i /><span>RIGHT-CLICK <b>FLAG</b></span><i /><span>{safeLeft} SAFE NODES LEFT</span></div></section>
      <aside className="mb-panel intel"><h3><Radar /> FIELD INTEL</h3><div className="radar"><span><i /><i /><i /></span><b>{threats}</b><small>ACTIVE SIGNALS</small></div><div className="enemy-list"><div><p><b>{minigames.length} registered minigames</b><small>Each developer owns their module. Trigger a mine to test the shared encounter flow.</small></p></div></div><div className="legacy"><small>LEGACY CACHE</small><b><Sparkles /> {profile.shards} shards</b><span>Best sector {profile.best} · {profile.disarmed} disarmed</span></div></aside></section>
    {encounter && <EncounterHost key={`${seed}:${floor}:${encounter.id}`} definition={selectMinigame(encounter.context.seed)} context={encounter.context} complete={finish} cancel={() => { setCells(all => all.map(c => c.id === encounter.id ? { ...c, open: false } : c)); setEncounter(null); setMessage('Returned to board.'); }} />}
    {phase === 'reward' && <div className="mb-overlay"><section className="reward"><small>SECTOR CLEARED</small><h2>Choose one module</h2><p>Modules last until this run ends.</p><div><button onClick={() => descend('armor')}><Shield /><span><b>Reactive Plating</b><small>Reduce damage. +1 max integrity.</small></span></button><button onClick={() => descend('repair')}><Radar /><span><b>Repair Swarm</b><small>Restore 2 integrity.</small></span></button><button onClick={() => descend('salvage')}><Sparkles /><span><b>Deep Salvage</b><small>Gain more permanent shards.</small></span></button></div></section></div>}
    {phase === 'dead' && <div className="mb-overlay"><section className="death"><Skull /><small>RUN TERMINATED</small><h2>Signal lost at sector {floor}</h2><p>Your {profile.shards} legacy shards remain.</p><button onClick={newRun}><Swords /> DESCEND AGAIN</button></section></div>}
    <footer>MINEBREAK // ORIGINAL PROTOTYPE <i /> THREE.JS FIELD RENDERER <i /> LOCAL PROGRESS ENABLED</footer></main>;
}

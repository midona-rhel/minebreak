import type { Shift } from './engine';

const MELODY = [
  72, 0, 76, 79, 76, 0, 74, 72, 0, 67, 72, 74, 76, 0, 79, 0,
  69, 0, 72, 76, 72, 0, 71, 69, 0, 64, 69, 71, 72, 0, 76, 0,
  65, 0, 69, 72, 69, 0, 67, 65, 0, 69, 72, 74, 72, 0, 69, 0,
  67, 0, 71, 74, 71, 0, 69, 67, 0, 74, 77, 74, 71, 0, 74, 0,
];
const ROOTS = [48, 45, 41, 43];
const hz = (note: number) => 440 * 2 ** ((note - 69) / 12);

/** Original synthesized music and effects; no downloads or active background scheduler. */
export class ShiftAudio {
  private master: GainNode;
  private voices = new Set<OscillatorNode>();
  private enabled = true;
  private disposed = false;
  private finished = false;
  private lastBeat = -1;

  private context: AudioContext;

  constructor(context: AudioContext) {
    this.context = context;
    this.master = context.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(context.destination);
  }

  resume() {
    if (!this.disposed && this.context.state === 'suspended') void this.context.resume().catch(() => {});
  }

  setEnabled(enabled: boolean) {
    if (this.disposed) return;
    this.enabled = enabled;
    this.master.gain.setTargetAtTime(enabled ? 0.35 : 0, this.context.currentTime, 0.015);
    if (enabled) this.resume();
  }

  private tone(frequency: number, duration: number, volume: number, type: OscillatorType = 'sine', end = frequency, delay = 0) {
    if (this.disposed || !this.enabled || this.context.state !== 'running' || this.voices.size >= 32) return;
    const at = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    oscillator.frequency.exponentialRampToValueAtTime(end, at + duration);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    this.voices.add(oscillator);
    oscillator.onended = () => {
      this.voices.delete(oscillator);
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
  }

  update(previous: Shift, next: Shift) {
    if (this.disposed || this.finished) return;
    const fresh = next.elapsed - previous.elapsed <= 0.25;
    if (next.outcome) {
      this.finished = true;
      if (next.outcome === 'success') {
        [72, 76, 79, 84].forEach((note, i) => this.tone(hz(note), 0.16, 0.16, 'triangle', hz(note), i * 0.10));
      } else if (next.bite?.kind === 'mystery' && next.bite.points === 0) {
        this.tone(110, 0.55, 0.22, 'sawtooth', 32);
        this.tone(65, 0.50, 0.18, 'triangle', 28);
      } else {
        [62, 58, 53].forEach((note, i) => this.tone(hz(note), 0.18, 0.17, 'triangle', hz(note) * 0.8, i * 0.12));
      }
      return;
    }
    if (fresh && next.bite && next.bite.id !== previous.bite?.id) {
      if (!next.bite.points) this.tone(170, 0.20, 0.17, 'triangle', 65);
      else if (next.bite.kind === 'mystery' || next.meals > previous.meals) {
        [72, 76, 79, 84].forEach((note, i) => this.tone(hz(note), 0.10, 0.13, 'triangle', hz(note), i * 0.06));
      } else {
        const frequency = next.bite.kind === 'fries' ? 700 : next.bite.kind === 'shake' ? 850 : 520;
        this.tone(frequency, 0.10, 0.15, 'sine', frequency * 1.45);
      }
    } else if (fresh && next.wave !== previous.wave) {
      const bag = next.drops.some(drop => drop.kind === 'mystery' && drop.progress < 0.02);
      if (bag) {
        this.tone(660, 0.12, 0.10, 'triangle', 660);
        this.tone(466, 0.12, 0.10, 'triangle', 466, 0.13);
      } else this.tone(900, 0.05, 0.035, 'sine', 400);
    }
    const beat = Math.floor(next.elapsed / 0.18);
    if (beat !== this.lastBeat) {
      this.lastBeat = beat;
      // Play only the current beat after gaps; never replay a backlog of notes.
      const note = MELODY[beat % MELODY.length];
      if (note) this.tone(hz(note), 0.14, 0.075, 'triangle');
      if (beat % 4 === 0) {
        const root = ROOTS[Math.floor(beat / 16) % ROOTS.length];
        this.tone(hz(root + (beat % 8 === 4 ? 7 : 0)), 0.22, 0.10);
      }
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const close = () => {
      for (const voice of this.voices) {
        try { voice.stop(); } catch { /* Already ended. */ }
        voice.disconnect();
      }
      this.voices.clear();
      this.master.disconnect();
      if (this.context.state !== 'closed') void this.context.close().catch(() => {});
    };
    // Let the short ending cue ring after the encounter unmounts, then release everything.
    if (this.finished && this.enabled && this.context.state === 'running') setTimeout(close, 650);
    else close();
  }
}

/** Called only from a user gesture; unavailable or blocked audio never blocks play. */
export function createShiftAudio(): ShiftAudio | null {
  try {
    if (typeof AudioContext === 'undefined') return null;
    const audio = new ShiftAudio(new AudioContext());
    audio.resume();
    return audio;
  } catch {
    return null;
  }
}

/** Lanterns at Low Tide — an original chamber miniature, written for Minebreak.
 * Pitch and rhythm are authored below. No melody generation, borrowed tunes,
 * external samples, or reference MIDI are used. Time units in the notation are
 * eighth notes; a bar contains six. See docs/music.md for the form and harmony.
 */
export const TITLE = 'Lanterns at Low Tide';
export const DOTTED_QUARTER_BPM = 56;
export const EIGHTH = 60 / (DOTTED_QUARTER_BPM * 3);
export const BAR = 6 * EIGHTH;
export const BAR_COUNT = 56;
export const LOOP_SECONDS = 120;

export type Instrument =
  | 'recorder'
  | 'lute'
  | 'strings'
  | 'bass'
  | 'drum'
  | 'brush'
  | 'wood'
  | 'bell';
export type NoteEvent = Readonly<{
  instrument: Instrument;
  start: number;
  duration: number;
  midi: number;
  velocity: number;
  pan: number;
  seed: number;
}>;

export const SECTIONS = [
  { name: 'Harbor lights', bar: 0, bars: 4 },
  { name: 'Along the quay', bar: 4, bars: 12 },
  { name: 'Sails in the morning', bar: 16, bars: 12 },
  { name: 'The sheltered cove', bar: 28, bars: 8 },
  { name: 'Homeward lanterns', bar: 36, bars: 12 },
  { name: 'The turning tide', bar: 48, bars: 8 },
] as const;

export function pitch(name: string): number {
  const match = /^([A-G])([#b]?)([1-7])$/.exec(name);
  if (!match) throw new Error(`Invalid score pitch: ${name}`);
  const semitone = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1]]!;
  return (
    12 * (Number(match[3]) + 1) +
    semitone +
    (match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0)
  );
}

type Harmony = { bass: string; fifth: string; notes: readonly string[] };
const harmony: Record<string, Harmony> = {
  G: { bass: 'G2', fifth: 'D3', notes: ['G3', 'D4', 'B3', 'G4'] },
  GB: { bass: 'B2', fifth: 'D3', notes: ['G3', 'D4', 'B3', 'G4'] },
  GD: { bass: 'D3', fifth: 'G2', notes: ['G3', 'D4', 'B3', 'G4'] },
  D: { bass: 'D3', fifth: 'A2', notes: ['A3', 'D4', 'F#4', 'A4'] },
  DF: { bass: 'F#2', fifth: 'A2', notes: ['A3', 'D4', 'F#4', 'A4'] },
  Ds: { bass: 'D3', fifth: 'A2', notes: ['A3', 'D4', 'G4', 'A4'] },
  C: { bass: 'C3', fifth: 'G2', notes: ['G3', 'E4', 'C4', 'G4'] },
  CE: { bass: 'E2', fifth: 'G2', notes: ['G3', 'E4', 'C4', 'G4'] },
  Am: { bass: 'A2', fifth: 'E3', notes: ['A3', 'E4', 'C4', 'G4'] },
  Em: { bass: 'E2', fifth: 'B2', notes: ['G3', 'E4', 'B3', 'G4'] },
  Bm: { bass: 'B2', fifth: 'F#3', notes: ['F#3', 'D4', 'B3', 'F#4'] },
  B7: { bass: 'B2', fifth: 'F#3', notes: ['A3', 'D#4', 'B3', 'F#4'] },
};

// Each row is one section. Inversions keep the bass moving by step through
// G–F#–E and C–B–A; suspended dominants leave room for the breath at cadences.
export const CHORDS = [
  'G',
  'C',
  'GD',
  'D',
  'G',
  'DF',
  'Em',
  'C',
  'G',
  'Am',
  'Ds',
  'D',
  'Em',
  'C',
  'Ds',
  'G',
  'C',
  'GB',
  'Am',
  'D',
  'G',
  'Bm',
  'C',
  'D',
  'Em',
  'Am',
  'Ds',
  'D',
  'Em',
  'Bm',
  'C',
  'G',
  'Am',
  'B7',
  'Em',
  'D',
  'G',
  'DF',
  'Em',
  'C',
  'G',
  'Am',
  'Ds',
  'D',
  'Em',
  'C',
  'Ds',
  'G',
  'C',
  'GB',
  'Am',
  'D',
  'G',
  'C',
  'Ds',
  'D',
] as const;

// A 12-bar theme: two four-bar questions, then a softer four-bar answer.
// '-' is a written rest, including breaths; numbers are eighth-note lengths.
export const THEME = [
  'D5:1 G5:2 B5:1 A5:1 G5:1',
  'F#5:2 E5:1 D5:2 -:1',
  'E5:1 G5:1 B5:2 A5:1 G5:1',
  'E5:3 D5:1 E5:1 -:1',
  'G5:2 D5:1 B4:2 D5:1',
  'E5:2 G5:1 A5:2 -:1',
  'G5:2 E5:1 D5:2 A4:1',
  'F#5:3 -:2 D5:1',
  'E5:2 G5:1 B5:1 A5:1 G5:1',
  'E5:2 D5:1 C5:2 E5:1',
  'G5:2 A5:1 D5:2 F#5:1',
  'G5:4 -:2',
] as const;

const SAILS = [
  'G5:1 C6:2 B5:1 G5:1 E5:1',
  'D5:2 G5:1 B5:2 -:1',
  'A5:1 G5:1 E5:2 C5:1 E5:1',
  'F#5:3 A5:2 -:1',
  'B5:2 A5:1 G5:1 D5:1 G5:1',
  'F#5:2 D5:1 B4:2 -:1',
  'E5:1 G5:2 C6:1 B5:1 G5:1',
  'A5:3 F#5:2 -:1',
  'G5:2 B5:1 E6:1 D6:1 B5:1',
  'C6:2 B5:1 A5:2 G5:1',
  'G5:3 E5:1 D5:1 -:1',
  'F#5:3 -:3',
];
const COVE = [
  'B4:3 E5:2 -:1',
  'F#5:2 D5:1 B4:2 -:1',
  'C5:2 E5:1 G5:2 E5:1',
  'D5:4 -:2',
  'E5:2 C5:1 A4:2 C5:1',
  'F#5:2 D#5:1 B4:2 -:1',
  'E5:3 B4:2 -:1',
  'F#5:2 E5:1 D5:2 -:1',
];
const RETURN = [
  THEME[0],
  THEME[1],
  'E5:1 G5:1 B5:1 D6:1 B5:1 G5:1',
  'E5:3 G5:1 E5:1 -:1',
  THEME[4],
  THEME[5],
  'G5:2 A5:1 D6:2 A5:1',
  'F#5:3 -:1 A5:1 F#5:1',
  'G5:2 B5:1 E6:1 D6:1 B5:1',
  'C6:2 B5:1 G5:2 E5:1',
  'G5:2 A5:1 D5:2 F#5:1',
  'G5:4 -:2',
];
const TIDE = [
  'G5:2 E5:1 C5:2 -:1',
  'D5:2 G5:1 B4:2 -:1',
  'C5:2 E5:1 A4:2 C5:1',
  'D5:4 -:2',
  'B4:2 D5:1 G5:2 -:1',
  'E5:3 D5:2 -:1',
  'G5:2 E5:1 D5:2 -:1',
  'F#5:3 D5:2 -:1',
];

export function parseBar(notation: string) {
  let eighth = 0;
  const notes = notation.split(' ').map((token) => {
    const [name, length] = token.split(':');
    const duration = Number(length);
    if (!Number.isFinite(duration) || duration <= 0)
      throw new Error(`Invalid rhythm: ${token}`);
    const note = { midi: name === '-' ? null : pitch(name), eighth, duration };
    eighth += duration;
    return note;
  });
  if (eighth !== 6) throw new Error(`Bar has ${eighth} eighths: ${notation}`);
  return notes;
}

export function createScore(): NoteEvent[] {
  const events: NoteEvent[] = [];
  const add = (
    instrument: Instrument,
    bar: number,
    eighth: number,
    duration: number,
    midi: number,
    velocity: number,
    pan: number,
    offset = 0,
  ) => {
    events.push({
      instrument,
      start: bar * BAR + eighth * EIGHTH + offset,
      duration: duration * EIGHTH,
      midi,
      velocity,
      pan,
      seed: events.length + 17,
    });
  };
  const phrase = (
    bars: readonly string[],
    first: number,
    loudness: number,
    instrument: Instrument = 'recorder',
  ) => {
    bars.forEach((notation, index) => {
      const bar = first + index;
      // Four-bar dynamic arches, controlled articulation, up to 12ms of rubato.
      const shape = [0.91, 1, 1.04, 0.88][index % 4];
      parseBar(notation).forEach((note, n) => {
        if (note.midi === null) return;
        const accent = note.eighth === 0 ? 1.03 : note.eighth === 3 ? 1 : 0.93;
        const delay = [0.008, 0.012, 0.004, 0.01][(index + n) % 4];
        const gate = note.duration >= 3 ? 0.92 : 0.86;
        add(
          instrument,
          bar,
          note.eighth,
          note.duration * gate,
          note.midi,
          loudness * shape * accent,
          instrument === 'recorder' ? -0.08 : 0.28,
          delay,
        );
      });
    });
  };
  phrase(['-:3 D5:1 G5:1 A5:1'], 3, 0.48);
  phrase(THEME, 4, 0.73);
  phrase(SAILS, 16, 0.8);
  phrase(COVE, 28, 0.58);
  phrase(RETURN, 36, 0.86);
  phrase(TIDE, 48, 0.63);

  CHORDS.forEach((symbol, bar) => {
    const chord = harmony[symbol];
    const isCove = bar >= 28 && bar < 36;
    const energy =
      bar < 4
        ? 0.64
        : bar < 16
          ? 0.8
          : bar < 28
            ? 0.9
            : isCove
              ? 0.59
              : bar < 48
                ? 1
                : 0.74 - (bar - 48) * 0.014;
    // Thumb and fingers: a voiced pattern, never randomly selected pitches.
    const pattern = isCove || bar < 2 ? [0, 2, 1, 3] : [0, 1, 2, 3, 1, 2];
    const places = pattern.length === 4 ? [0, 2, 3, 5] : [0, 1, 2, 3, 4, 5];
    pattern.forEach((tone, i) => {
      const beat = places[i];
      const strength = [0.72, 0.46, 0.54, 0.64, 0.46, 0.5][beat];
      add(
        'lute',
        bar,
        beat,
        2.5,
        pitch(chord.notes[tone]),
        strength * energy,
        -0.36,
        [0, 0.009, 0.016, 0.003, 0.014, 0.019][beat],
      );
    });
    add(
      'bass',
      bar,
      0,
      isCove ? 5.4 : 2.8,
      pitch(chord.bass),
      0.7 * energy,
      0,
      0.003,
    );
    if (!isCove && bar > 1)
      add(
        'bass',
        bar,
        3,
        2.7,
        pitch(bar % 4 === 3 ? chord.bass : chord.fifth),
        0.53 * energy,
        0,
        0.009,
      );

    // A soft, two-part string bed enters after the introduction. Open texture
    // in the cove leaves space for the lower recorder register.
    if (bar >= 4 && (bar < 52 || bar % 2 === 0)) {
      [0, 2].forEach((tone, i) =>
        add(
          'strings',
          bar,
          0,
          5.75,
          pitch(chord.notes[tone]),
          (isCove ? 0.32 : 0.25) * energy,
          i === 0 ? 0.22 : 0.42,
          0.015 + i * 0.013,
        ),
      );
    }
    // Frame drum, soft brushed jingles and a wooden rim. Drop the beat for
    // the cove and pull percussion out of the final two bars.
    if (bar >= 4 && !isCove && bar < 54) {
      add('drum', bar, 0, 0.75, 48, 0.47 * energy, -0.1);
      if (bar % 4 !== 3)
        add('drum', bar, 3, 0.6, 48, 0.3 * energy, -0.1, 0.012);
      add('brush', bar, 3, 0.7, 72, 0.28 * energy, 0.45, 0.013);
      if (bar % 2 === 1)
        add('wood', bar, 5, 0.35, 72, 0.24 * energy, -0.48, 0.018);
      if (bar >= 36 && bar < 44)
        add('brush', bar, 1.5, 0.5, 72, 0.15 * energy, 0.45, 0.01);
    }
  });

  // A separately written lute answer between recorder breaths. It returns
  // with a small change when the main theme comes home.
  phrase(['-:2 B4:1 D5:1 E5:1 D5:1', '-:3 C5:1 B4:1 G4:1'], 10, 0.32, 'lute');
  phrase(['-:3 G4:1 B4:1 D5:1', '-:2 E5:1 D5:1 C5:1 A4:1'], 22, 0.35, 'lute');
  phrase(['-:2 B4:1 D5:1 G5:1 D5:1', '-:3 C5:1 B4:1 G4:1'], 42, 0.39, 'lute');
  // Bells mark only the larger structural arrivals; their tails wrap naturally.
  [
    [0, 'G5'],
    [16, 'C6'],
    [28, 'E5'],
    [36, 'G5'],
    [48, 'C6'],
  ].forEach(([bar, note]) => {
    add('bell', Number(bar), 0, 4, pitch(String(note)), 0.2, 0.38);
  });
  return events.sort((a, b) => a.start - b.start || a.seed - b.seed);
}

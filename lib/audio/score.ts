/** Lanterns After Dark — an original Minebreak dubstep arrangement.
 * Authored pitches and rhythms, half-time drums and two bass drops.
 * No external samples, reference MIDI, or borrowed melody. Eighth-note units.
 */
export const TITLE = 'Lanterns After Dark';
export const QUARTER_BPM = 144;
export const EIGHTH = 60 / (QUARTER_BPM * 2);
export const BAR = 8 * EIGHTH;
export const BAR_COUNT = 72;
export const LOOP_SECONDS = 120;
export type Instrument =
  | 'recorder'
  | 'lute'
  | 'strings'
  | 'bass'
  | 'bell'
  | 'sub'
  | 'growl'
  | 'kick'
  | 'snare'
  | 'hat'
  | 'riser'
  | 'impact';
export type NoteEvent = Readonly<{
  instrument: Instrument;
  start: number;
  duration: number;
  midi: number;
  velocity: number;
  pan: number;
  seed: number;
  wobble?: number;
}>;
export const SECTIONS = [
  { name: 'Lantern signal', bar: 0, bars: 8 },
  { name: 'Pressure rising', bar: 8, bars: 8 },
  { name: 'First bass drop', bar: 16, bars: 16 },
  { name: 'Suspended tide', bar: 32, bars: 8 },
  { name: 'Second build', bar: 40, bars: 8 },
  { name: 'Undertow drop', bar: 48, bars: 16 },
  { name: 'Lantern return', bar: 64, bars: 8 },
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
const HARMONY: Record<string, { bass: string; notes: readonly string[] }> = {
  Em: { bass: 'E2', notes: ['E3', 'B3', 'G4', 'B4'] },
  Bm: { bass: 'B2', notes: ['F#3', 'B3', 'D4', 'F#4'] },
  C: { bass: 'C3', notes: ['G3', 'C4', 'E4', 'G4'] },
  D: { bass: 'D3', notes: ['A3', 'D4', 'F#4', 'A4'] },
  Am: { bass: 'A2', notes: ['E3', 'A3', 'C4', 'E4'] },
  Ds: { bass: 'D3', notes: ['A3', 'D4', 'G4', 'A4'] },
  B7: { bass: 'B2', notes: ['F#3', 'A3', 'D#4', 'F#4'] },
};
const PROGRESSION = ['Em', 'Bm', 'C', 'D', 'Em', 'C', 'Am', 'D'];
const DROP = [
  'Em',
  'Em',
  'C',
  'D',
  'Em',
  'Em',
  'Am',
  'D',
  'Em',
  'Em',
  'C',
  'D',
  'Em',
  'C',
  'Am',
  'B7',
];
export const CHORDS = [
  ...PROGRESSION,
  ...PROGRESSION,
  ...DROP,
  ...PROGRESSION,
  ...PROGRESSION,
  ...DROP,
  'Em',
  'Bm',
  'C',
  'D',
  'Em',
  'C',
  'Ds',
  'B7',
];
export const THEME = [
  'B4:1 E5:2 G5:1 F#5:1 E5:1 D5:2',
  'B4:2 D5:1 F#5:1 E5:2 -:2',
  'G5:2 E5:1 D5:1 C5:2 E5:2',
  'F#5:2 A5:1 F#5:1 D5:2 -:2',
  'B4:1 E5:2 G5:1 B5:2 G5:2',
  'E5:2 G5:1 E5:1 C5:2 -:2',
  'E5:1 A5:1 G5:2 E5:1 C5:1 B4:2',
  'D5:2 E5:1 F#5:1 A5:2 -:2',
] as const;
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
  if (eighth !== 8) throw new Error(`Bar has ${eighth} eighths: ${notation}`);
  return notes;
}
// Four written call/response bass rhythms. Last value: filter cycles/quarter.
const BASS_PHRASES = [
  [
    [0, 3.2, 0, 2],
    [4.5, 1.15, 0, 4],
    [6, 1.65, 7, 1],
  ],
  [
    [0, 1.55, 0, 1],
    [2, 1.5, 12, 2],
    [4.5, 1.05, 0, 2],
    [6, 1.65, 0, 4],
  ],
  [
    [0, 2.75, 0, 1.5],
    [3, 0.62, 7, 4],
    [4.5, 3.1, 0, 2],
  ],
  [
    [0, 1.6, 0, 2],
    [2, 1.55, 0, 2],
    [4.5, 0.85, 0, 4],
    [5.5, 0.85, 12, 4],
    [6.5, 1.12, 0, 2],
  ],
] as const;
const KICKS = [
  [0, 3],
  [0, 2.5, 6.5],
  [0, 3.5],
  [0, 2.5, 5.5],
];
export function createScore(): NoteEvent[] {
  const events: NoteEvent[] = [];
  const add = (
    instrument: Instrument,
    bar: number,
    eighth: number,
    duration: number,
    midi: number,
    velocity: number,
    pan = 0,
    offset = 0,
    wobble?: number,
  ) => {
    events.push({
      instrument,
      start: bar * BAR + eighth * EIGHTH + offset,
      duration: duration * EIGHTH,
      midi,
      velocity,
      pan,
      seed: events.length + 17,
      wobble,
    });
  };
  const phrase = (bars: readonly string[], first: number, loudness: number) => {
    bars.forEach((notation, index) => {
      parseBar(notation).forEach((note, n) => {
        if (note.midi === null) return;
        add(
          'recorder',
          first + index,
          note.eighth,
          note.duration * (note.duration >= 3 ? 0.92 : 0.84),
          note.midi,
          loudness * [0.92, 1, 1.04, 0.87][index % 4] * (n === 0 ? 1 : 0.94),
          -0.1,
          0.007 + (n % 3) * 0.003,
        );
      });
    });
  };
  phrase(THEME, 0, 0.57);
  phrase(THEME.slice(0, 6), 8, 0.58);
  phrase(
    [
      'B4:3 E5:3 -:2',
      'F#5:3 D5:3 -:2',
      'E5:3 G5:3 -:2',
      'F#5:4 -:4',
      'B4:3 E5:3 -:2',
      'G5:3 E5:3 -:2',
      'E5:2 C5:2 A4:2 -:2',
      'F#5:4 -:4',
    ],
    32,
    0.48,
  );
  phrase(THEME.slice(0, 6), 40, 0.64);
  phrase(
    [...THEME.slice(0, 6), 'G5:2 E5:2 D5:2 -:2', 'F#5:2 D#5:2 B4:2 -:2'],
    64,
    0.51,
  );
  // Short melodic answers leave the bass drop clear.
  for (const bar of [19, 23, 27, 51, 55, 59])
    phrase(['-:4 B5:1 G5:1 E5:1 -:1'], bar, bar >= 48 ? 0.7 : 0.62);
  CHORDS.forEach((symbol, bar) => {
    const chord = HARMONY[symbol];
    const drop = (bar >= 16 && bar < 32) || (bar >= 48 && bar < 64);
    const build = (bar >= 8 && bar < 16) || (bar >= 40 && bar < 48);
    const relative = bar % 8;
    const lastBuild = bar === 15 || bar === 47;
    const secondDrop = bar >= 48 && bar < 64;
    const energy = drop
      ? secondDrop
        ? 1
        : 0.92
      : build
        ? 0.58 + relative * 0.035
        : bar < 8
          ? 0.55
          : 0.46;
    if (!drop) {
      [0, 2, 4, 6].forEach((beat, i) => {
        if (lastBuild && beat >= 4) return;
        add(
          'lute',
          bar,
          beat,
          2.2,
          pitch(chord.notes[[0, 2, 1, 3][i]]),
          energy * (i % 2 ? 0.38 : 0.58),
          -0.35,
          i * 0.004,
        );
      });
      if (!lastBuild) {
        add('bass', bar, 0, 7.4, pitch(chord.bass), energy * 0.65);
        [0, 2].forEach((tone, i) =>
          add(
            'strings',
            bar,
            0,
            7.2,
            pitch(chord.notes[tone]),
            energy * 0.3,
            i ? 0.4 : -0.25,
          ),
        );
      }
      if (bar < 8 || bar >= 64) {
        if (bar % 2 === 0) add('kick', bar, 0, 1.3, 36, 0.3);
        add('hat', bar, 4, 0.5, 70, 0.28, 0.3);
      }
    }
    if (build) {
      const spacing =
        relative < 4 ? 2 : relative < 6 ? 1 : relative === 6 ? 0.5 : 0.25;
      for (let beat = 0; beat < (lastBuild ? 6 : 8); beat += spacing)
        add(
          'snare',
          bar,
          beat,
          0.7,
          55 + relative,
          (0.22 + relative * 0.04) * (beat % 2 === 0 ? 1 : 0.75),
          beat % 1 ? 0.12 : -0.12,
        );
      if (relative < 6)
        [0, 2, 4, 6].forEach((beat) =>
          add('kick', bar, beat, 1.2, 36, 0.4 + relative * 0.035),
        );
    }
    if (drop) {
      const root = pitch(chord.bass);
      BASS_PHRASES[(bar - 16) % 4].forEach(
        ([beat, length, semitones, rate]) => {
          add(
            'growl',
            bar,
            beat,
            length,
            root + semitones,
            energy * 0.92,
            0,
            0.015,
            ((rate * QUARTER_BPM) / 60) *
              (secondDrop && bar % 4 === 2 ? 1.5 : 1),
          );
          add('sub', bar, beat, length, root - 12, energy * 0.83, 0, 0.015);
        },
      );
      KICKS[bar % 4].forEach((beat, i) =>
        add('kick', bar, beat, 1.6, 36, energy * (i ? 0.83 : 1)),
      );
      add('snare', bar, 4, 1.6, 50, energy, 0);
      for (let beat = 0; beat < 8; beat++)
        add(
          'hat',
          bar,
          beat,
          beat % 2 ? 0.8 : 0.35,
          70,
          energy * (beat % 2 ? 0.56 : 0.3),
          beat % 2 ? 0.34 : -0.25,
          beat % 2 ? 0.009 : 0,
        );
      if (secondDrop && bar % 4 === 3)
        [6, 6.5, 7, 7.5].forEach((beat) =>
          add('snare', bar, beat, 0.6, 52, 0.26 + (beat - 6) * 0.08, 0.1),
        );
    }
  });
  // A half-beat vacuum follows each rising sweep before the downbeat lands.
  add('riser', 8, 0, 62, 48, 0.76);
  add('riser', 40, 0, 62, 48, 0.9);
  add('impact', 16, 0, 6, 28, 0.85);
  add('impact', 48, 0, 6, 28, 1);
  for (const [bar, note] of [
    [0, 'E5'],
    [32, 'E5'],
    [64, 'E5'],
  ] as const)
    add('bell', bar, 0, 4, pitch(note), 0.2, 0.4);
  return events.sort((a, b) => a.start - b.start || a.seed - b.seed);
}

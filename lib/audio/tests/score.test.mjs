import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createScore,
  BAR,
  BAR_COUNT,
  CHORDS,
  EIGHTH,
  LOOP_SECONDS,
  SECTIONS,
  parseBar,
  pitch,
} from '../../../work/music-tests/score.js';
import {
  RollingSchedule,
  CHUNK_SECONDS,
  LOOKAHEAD_SECONDS,
  volumeGain,
} from '../../../work/music-tests/transport.js';
import {
  parsePreferences,
  getPreferences,
  updatePreferences,
} from '../../../work/music-tests/preferences.js';

test('the complete form fits a 120-second loop and the score has valid notes', () => {
  assert.equal(CHORDS.length, BAR_COUNT);
  assert.ok(Math.abs(BAR * BAR_COUNT - LOOP_SECONDS) < 1e-10);
  assert.equal(
    SECTIONS.reduce((bars, section) => bars + section.bars, 0),
    BAR_COUNT,
  );
  const score = createScore();
  assert.deepEqual(
    score,
    createScore(),
    'musical events must never be randomized',
  );
  for (const event of score) {
    assert.ok(event.start >= 0 && event.start < LOOP_SECONDS);
    assert.ok(event.duration > 0 && event.duration < 4);
    assert.ok(event.velocity > 0 && event.velocity <= 1);
    assert.ok(event.midi >= 28 && event.midi <= 88);
    assert.ok(Math.abs(event.pan) <= 0.5);
  }
  assert.throws(() => parseBar('G5:7'), /Bar has/);
  assert.throws(() => parseBar('H5:6'), /Invalid score pitch/);
  assert.throws(() => parseBar('G5:0'), /Invalid rhythm/);
});

test('the lead has breathing space, a clear reprise, and a quieter middle', () => {
  const score = createScore();
  const lead = score.filter((event) => event.instrument === 'recorder');
  for (let i = 1; i < lead.length; i++)
    assert.ok(
      lead[i].start >= lead[i - 1].start + lead[i - 1].duration,
      'recorder must be playable by one performer',
    );
  const inBars = (first, last) =>
    lead.filter((note) => note.start >= first * BAR && note.start < last * BAR);
  const opening = inBars(4, 6),
    reprise = inBars(36, 38);
  assert.deepEqual(
    opening.map((n) => n.midi),
    reprise.map((n) => n.midi),
  );
  assert.ok(
    inBars(28, 36).length < inBars(16, 24).length,
    'cove leaves more space',
  );
  assert.ok(
    lead.some((n) => n.midi === pitch('D#5')),
    'minor-key dominant is voiced intentionally',
  );
  assert.ok(lead.at(-1).start + lead.at(-1).duration < LOOP_SECONDS - EIGHTH);
  assert.equal(
    score.filter((n) => n.instrument === 'bell').length,
    5,
    'bells stay restrained',
  );
  assert.equal(
    score.filter(
      (n) =>
        n.instrument === 'drum' && n.start >= 28 * BAR && n.start < 36 * BAR,
    ).length,
    0,
  );
});

test('rolling chunks join exactly over hours, stay bounded, and never duplicate', () => {
  const schedule = new RollingSchedule(0.08, LOOP_SECONDS);
  const chunks = [];
  for (let now = 0; now < 7200; now += 0.25) {
    const next = schedule.take(now);
    assert.ok(next.length <= 3);
    for (const chunk of next) {
      assert.ok(chunk.when < now + LOOKAHEAD_SECONDS);
      assert.ok(chunk.when >= now);
      assert.ok(
        chunk.offset >= 0 && chunk.offset + chunk.duration <= LOOP_SECONDS,
      );
    }
    chunks.push(...next);
  }
  for (let i = 1; i < chunks.length; i++) {
    assert.ok(
      Math.abs(chunks[i].when - chunks[i - 1].when - chunks[i - 1].duration) <
        1e-9,
    );
    assert.equal(chunks[i].offset, (i * CHUNK_SECONDS) % LOOP_SECONDS);
  }
});

test('a stalled scheduler skips missed time without catch-up bursts', () => {
  const schedule = new RollingSchedule(0.08, LOOP_SECONDS);
  schedule.take(0);
  const late = schedule.take(86399.13);
  assert.ok(late.length > 0 && late.length <= 3);
  assert.ok(
    late.every(
      (chunk) =>
        chunk.when >= 86399.13 &&
        chunk.duration > 0 &&
        chunk.duration <= CHUNK_SECONDS,
    ),
  );
  assert.deepEqual(schedule.take(86399.13), []);
  assert.deepEqual(schedule.take(NaN), []);
  assert.throws(() => new RollingSchedule(0, 119));
});

test('volume and mute cannot amplify, become non-finite, or produce negative gain', () => {
  for (const value of [-100, 0, 0.2, 0.5, 1, 200, NaN, Infinity]) {
    assert.ok(volumeGain(value, false) >= 0 && volumeGain(value, false) <= 1);
    assert.equal(volumeGain(value, true), 0);
  }
});

test('invalid stored settings cannot mute unexpectedly or exceed safe volume', () => {
  assert.deepEqual(parsePreferences('bad json'), { volume: 55, muted: false });
  assert.deepEqual(parsePreferences('null'), { volume: 55, muted: false });
  assert.deepEqual(parsePreferences('{"volume":200,"muted":"false"}'), {
    volume: 100,
    muted: false,
  });
  assert.deepEqual(parsePreferences('{"volume":-20,"muted":true}'), {
    volume: 0,
    muted: true,
  });
});

test('volume still changes when storage is readable but writes are blocked', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => '{"volume":55,"muted":false}',
      setItem: () => {
        throw new Error('Storage is full');
      },
    },
  });
  try {
    updatePreferences({ volume: 34 });
    assert.deepEqual(parsePreferences(getPreferences()), {
      volume: 34,
      muted: false,
    });
    updatePreferences({ muted: true });
    assert.deepEqual(parsePreferences(getPreferences()), {
      volume: 34,
      muted: true,
    });
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});

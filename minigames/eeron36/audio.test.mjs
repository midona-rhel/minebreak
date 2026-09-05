import assert from 'node:assert/strict';
import test from 'node:test';
import { ShiftAudio, createShiftAudio } from './audio.ts';
import { createShift } from './engine.ts';

function fakeContext() {
  const oscillators = [];
  let closes = 0;
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {} });
  const context = {
    state: 'running', currentTime: 0, destination: {},
    createGain: () => ({ gain: param(), connect() {}, disconnect() {} }),
    createOscillator() {
      const voice = { type: 'sine', frequency: param(), connect() {}, disconnect() {}, start() {}, stop() {}, onended: null };
      oscillators.push(voice);
      return voice;
    },
    async resume() { context.state = 'running'; },
    async close() { closes++; context.state = 'closed'; },
  };
  return { context, oscillators, closes: () => closes };
}

test('unavailable browser audio leaves the game free to run silently', () => {
  assert.equal(createShiftAudio(), null);
});

test('muting prevents new sounds; unmuting resumes without replaying missed beats', () => {
  const fake = fakeContext();
  const audio = new ShiftAudio(fake.context);
  const start = createShift(42);
  audio.setEnabled(false);
  audio.update(start, { ...start, elapsed: 20 });
  assert.equal(fake.oscillators.length, 0);
  audio.setEnabled(true);
  audio.update(start, { ...start, elapsed: 90 });
  assert.ok(fake.oscillators.length <= 2);
  audio.dispose();
});

test('the same bite and music beat do not repeat on subsequent frames', () => {
  const fake = fakeContext();
  const audio = new ShiftAudio(fake.context);
  const start = createShift(42);
  const caught = { ...start, elapsed: 0.1, eaten: 1, score: 2, bite: { id: 1, at: 0.1, kind: 'burger', points: 2 } };
  audio.update(start, caught);
  const sounds = fake.oscillators.length;
  assert.ok(sounds > 0);
  audio.update(caught, { ...caught, elapsed: 0.11 });
  assert.equal(fake.oscillators.length, sounds);
  audio.dispose();
});

test('cancel cleanup closes audio exactly once and rejects later playback', () => {
  const fake = fakeContext();
  const audio = new ShiftAudio(fake.context);
  const start = createShift(42);
  audio.update(start, { ...start, elapsed: 0.1 });
  audio.dispose();
  audio.dispose();
  const count = fake.oscillators.length;
  audio.update(start, { ...start, elapsed: 10 });
  assert.equal(fake.closes(), 1);
  assert.equal(fake.oscillators.length, count);
});

test('ending audio has one bounded tail and the context closes afterward', t => {
  const timers = [];
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => { timers.push({ callback, delay }); return 1; });
  const fake = fakeContext();
  const audio = new ShiftAudio(fake.context);
  const start = createShift(42);
  audio.update(start, { ...start, outcome: 'failure', bite: { id: 1, at: 0, kind: 'mystery', points: 0 } });
  assert.ok(fake.oscillators.some(voice => voice.type === 'sawtooth'));
  audio.dispose();
  audio.dispose();
  assert.equal(timers.length, 1);
  assert.ok(timers[0].delay <= 700);
  timers[0].callback();
  assert.equal(fake.closes(), 1);
});

test('audio polyphony stays bounded even if ended callbacks are delayed', () => {
  const fake = fakeContext();
  const audio = new ShiftAudio(fake.context);
  let state = createShift(42);
  for (let i = 1; i <= 300; i++) {
    const next = { ...state, elapsed: i * 0.18 };
    audio.update(state, next);
    state = next;
  }
  assert.ok(fake.oscillators.length <= 32);
  audio.dispose();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import {
  createScore,
  LOOP_SECONDS,
  BAR,
  SECTIONS,
} from '../../../work/music-tests/score.js';
import {
  PEAK_CEILING,
  SAMPLE_RATE,
  renderMusic,
  synthesizeNote,
} from '../../../work/music-tests/synthesis.js';

test('instrument attacks/releases are smooth and synthesis is repeatable', () => {
  for (const instrument of [
    'recorder',
    'lute',
    'strings',
    'bass',
    'drum',
    'brush',
    'wood',
    'bell',
  ]) {
    const event = {
      instrument,
      midi: instrument === 'bass' ? 43 : 74,
      duration: 0.9,
      velocity: 0.7,
      seed: 91,
    };
    const pcm = synthesizeNote(event, SAMPLE_RATE);
    assert.deepEqual(pcm, synthesizeNote(event, SAMPLE_RATE));
    assert.equal(pcm[0], 0);
    assert.ok(Math.abs(pcm.at(-1)) < 1e-7);
    assert.ok(pcm.every(Number.isFinite));
    assert.ok(pcm.some((value) => Math.abs(value) > 0.001));
  }
});

test('the production render has headroom, dynamics, stereo space and a continuous seam', () => {
  const started = performance.now();
  const music = renderMusic(createScore(), LOOP_SECONDS);
  const renderMs = Math.round(performance.now() - started);
  const { left, right, sampleRate } = music;
  assert.equal(left.length, LOOP_SECONDS * SAMPLE_RATE);
  assert.equal(right.length, left.length);
  let peak = 0,
    differences = 0,
    mean = 0;
  for (let i = 0; i < left.length; i++) {
    assert.ok(Number.isFinite(left[i]) && Number.isFinite(right[i]));
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
    differences += (left[i] - right[i]) ** 2;
    mean += left[i] + right[i];
  }
  assert.ok(peak <= PEAK_CEILING + 1e-6 && peak > 0.1);
  assert.ok(Math.abs(mean / left.length) < 1e-6, 'no DC offset');
  assert.ok(
    Math.sqrt(differences / left.length) > 0.003,
    'audible stereo placement',
  );
  const rms = (start, end) => {
    let squares = 0;
    const first = Math.round(start * sampleRate),
      last = Math.round(end * sampleRate);
    for (let i = first; i < last; i++)
      squares +=
        (left[i % left.length] ** 2 + right[i % right.length] ** 2) / 2;
    return Math.sqrt(squares / (last - first));
  };
  const sections = SECTIONS.map((section) => ({
    name: section.name,
    rms: rms(section.bar * BAR, (section.bar + section.bars) * BAR),
  }));
  assert.ok(
    sections[4].rms > sections[3].rms * 1.2,
    'homecoming must lift above the cove',
  );
  const seamStep = Math.max(
    Math.abs(left[0] - left.at(-1)),
    Math.abs(right[0] - right.at(-1)),
  );
  assert.ok(seamStep < 0.008, `boundary discontinuity ${seamStep}`);
  assert.ok(
    rms(119.8, 120.2) > 0.004,
    'room and voice tails must cross the seam',
  );
  const metrics = {
    duration: LOOP_SECONDS,
    sampleRate,
    renderMs,
    peakDbfs: 20 * Math.log10(peak),
    rmsDbfs: 20 * Math.log10(music.rms),
    seamStep,
    sections,
  };
  console.log(JSON.stringify(metrics));
  if (process.env.MINEBREAK_RENDER_MUSIC === '1') {
    mkdirSync('work/music', { recursive: true });
    const wav = Buffer.alloc(44 + left.length * 4);
    wav.write('RIFF');
    wav.writeUInt32LE(wav.length - 8, 4);
    wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(2, 22);
    wav.writeUInt32LE(sampleRate, 24);
    wav.writeUInt32LE(sampleRate * 4, 28);
    wav.writeUInt16LE(4, 32);
    wav.writeUInt16LE(16, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(left.length * 4, 40);
    for (let i = 0; i < left.length; i++) {
      wav.writeInt16LE(Math.round(left[i] * 32767), 44 + i * 4);
      wav.writeInt16LE(Math.round(right[i] * 32767), 46 + i * 4);
    }
    writeFileSync('work/music/lanterns-at-low-tide.wav', wav);
    writeFileSync(
      'work/music/metrics.json',
      JSON.stringify(metrics, null, 2) + '\n',
    );
  }
});

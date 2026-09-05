import type { Instrument, NoteEvent } from './score.js';

export const SAMPLE_RATE = 32000;
export const PEAK_CEILING = 0.44; // -7.13 dBFS, including the complete reverb tail.
const TAU = Math.PI * 2;
const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));
const smooth = (n: number) => {
  const x = clamp(n, 0, 1);
  return x * x * (3 - 2 * x);
};

function noise(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 2147483648 - 1;
  };
}

const levels: Record<Instrument, number> = {
  recorder: 0.22,
  lute: 0.2,
  strings: 0.115,
  bass: 0.31,
  drum: 0.12,
  brush: 0.026,
  wood: 0.036,
  bell: 0.065,
};
const sends: Record<Instrument, number> = {
  recorder: 0.26,
  lute: 0.2,
  strings: 0.33,
  bass: 0.06,
  drum: 0.1,
  brush: 0.14,
  wood: 0.18,
  bell: 0.35,
};

/** Damped string modes: higher partials decay faster, and a pluck-position
 * comb gives a woody attack. These are original physical timbre models. */
function stringModes(
  frequency: number,
  seconds: number,
  sampleRate: number,
  bass: boolean,
): Float32Array {
  const count = Math.ceil(seconds * sampleRate);
  const output = new Float32Array(count);
  const partials = bass ? 7 : 12;
  for (let h = 1; h <= partials; h++) {
    const f =
      frequency * h * Math.sqrt(1 + (bass ? 0.000025 : 0.000065) * h * h);
    if (f > sampleRate * 0.42) break;
    const angle = (TAU * f) / sampleRate;
    const sinStep = Math.sin(angle),
      cosStep = Math.cos(angle);
    const decay = Math.exp(
      -1 /
        (sampleRate * ((bass ? 1.4 : 0.95) / (1 + h * (bass ? 0.22 : 0.37)))),
    );
    let sin = 0,
      cos = 1;
    let amplitude =
      Math.sin(h * Math.PI * (bass ? 0.23 : 0.19)) /
      Math.pow(h, bass ? 1.35 : 1.12);
    for (let i = 0; i < count; i++) {
      output[i] += sin * amplitude;
      const nextSin = sin * cosStep + cos * sinStep;
      cos = cos * cosStep - sin * sinStep;
      sin = nextSin;
      amplitude *= decay;
    }
  }
  return output;
}

export function synthesizeNote(
  event: NoteEvent,
  sampleRate: number,
): Float32Array {
  const { instrument, duration, seed } = event;
  const random = noise(seed * 7919);
  const frequency = 440 * 2 ** ((event.midi - 69) / 12);
  const tail =
    instrument === 'bell'
      ? 2.5
      : instrument === 'strings'
        ? 0.48
        : instrument === 'recorder'
          ? 0.12
          : 0.2;
  const seconds = duration + tail;
  const length = Math.ceil(seconds * sampleRate);
  const output =
    instrument === 'lute' || instrument === 'bass'
      ? stringModes(frequency, seconds, sampleRate, instrument === 'bass')
      : new Float32Array(length);
  let phase = 0,
    drift = 0,
    breath = 0,
    lowNoise = 0;
  const detune = 2 ** ((((seed % 7) - 3) * 0.8) / 1200);
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const release = 1 - smooth((t - duration) / tail);
    const end = Math.min(1, (length - 1 - i) / (sampleRate * 0.012));
    let value = 0;
    if (instrument === 'recorder') {
      // Delayed, shallow vibrato follows the breath instead of wobbling the
      // attack. Slight airflow and pressure changes keep held tones alive.
      const vibrato =
        smooth((t - 0.19) / 0.34) *
        (4.8 + (seed % 3)) *
        Math.sin(TAU * (4.65 + (seed % 5) * 0.09) * t);
      drift += (random() - drift) * 0.0008;
      phase +=
        (TAU *
          frequency *
          detune *
          2 ** ((vibrato + drift * 8 - 5 * Math.exp(-t * 35)) / 1200)) /
        sampleRate;
      breath += (random() - breath) * 0.18;
      const pressure =
        0.92 + 0.07 * Math.sin(Math.PI * clamp(t / duration, 0, 1));
      const air = breath * (0.02 + 0.025 * Math.exp(-t * 24));
      value =
        (Math.sin(phase) +
          0.19 * Math.sin(phase * 2) +
          0.07 * Math.sin(phase * 3) +
          0.022 * Math.sin(phase * 4) +
          air) *
        smooth(t / 0.035) *
        release *
        pressure *
        (1 + 0.012 * Math.sin(TAU * 3.1 * t));
    } else if (instrument === 'lute' || instrument === 'bass') {
      lowNoise += (random() - lowNoise) * 0.25;
      value =
        (output[i] + lowNoise * Math.exp(-t * 110) * 0.11) *
        smooth(t / 0.004) *
        release;
    } else if (instrument === 'strings') {
      // Two quiet bowed courses, with a soft spectral balance and no saw wave.
      phase += (TAU * frequency) / sampleRate;
      const bow = Math.sin(TAU * 4.8 * t) * 0.014;
      value =
        (Math.sin(phase * 0.9992 + bow) +
          Math.sin(phase * 1.0009 - bow) +
          0.22 * Math.sin(phase * 2) +
          0.11 * Math.sin(phase * 3) +
          0.04 * Math.sin(phase * 4)) *
        0.48 *
        smooth(t / 0.29) *
        release *
        (0.91 + 0.09 * Math.sin(Math.PI * clamp(t / duration, 0, 1)));
    } else if (instrument === 'bell') {
      value =
        (Math.sin(TAU * frequency * t) * Math.exp(-t * 1.7) +
          0.3 * Math.sin(TAU * frequency * 2 * t) * Math.exp(-t * 2.8) +
          0.14 * Math.sin(TAU * frequency * 3.01 * t) * Math.exp(-t * 4.6)) *
        smooth(t / 0.009);
    } else if (instrument === 'drum') {
      phase += (TAU * (84 + 48 * Math.exp(-t * 34))) / sampleRate;
      lowNoise += (random() - lowNoise) * 0.12;
      value =
        (Math.sin(phase) * Math.exp(-t * 16) +
          0.32 * Math.sin(phase * 1.59) * Math.exp(-t * 29) +
          lowNoise * Math.exp(-t * 55) * 0.18) *
        smooth(t / 0.003);
    } else if (instrument === 'brush') {
      const input = random();
      lowNoise += (input - lowNoise) * 0.28;
      breath += (lowNoise - breath) * 0.055;
      value = (lowNoise - breath) * Math.exp(-t * 19) * smooth(t / 0.009);
    } else {
      value =
        (Math.sin(TAU * 790 * t) + 0.35 * Math.sin(TAU * 1267 * t)) *
        Math.exp(-t * 66) *
        smooth(t / 0.002);
    }
    output[i] = value * Math.max(0, end) * event.velocity * levels[instrument];
  }
  return output;
}

export type RenderedMusic = {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  peak: number;
  rms: number;
};

/** A periodic render: voices and room reflections cross the loop boundary.
 * No fade to silence at the join. Only the transport fades on play/pause.
 * Runs in a dedicated worker in production; also used by the audio tests. */
export function renderMusic(
  events: readonly NoteEvent[],
  duration: number,
  sampleRate = SAMPLE_RATE,
  progress?: (fraction: number) => void,
): RenderedMusic {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 150)
    throw new Error('Invalid music duration');
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000)
    throw new Error('Invalid music sample rate');
  const frames = Math.round(duration * sampleRate);
  const left = new Float32Array(frames),
    right = new Float32Array(frames);
  const room = new Float32Array(frames);
  events.forEach((event, index) => {
    const voice = synthesizeNote(event, sampleRate);
    const start = Math.round(event.start * sampleRate);
    const pan = ((clamp(event.pan, -1, 1) + 1) * Math.PI) / 4;
    const l = Math.cos(pan),
      r = Math.sin(pan),
      send = sends[event.instrument];
    for (let i = 0; i < voice.length; i++) {
      const frame = (start + i) % frames;
      left[frame] += voice[i] * l;
      right[frame] += voice[i] * r;
      room[frame] += voice[i] * send;
    }
    if (index % 32 === 0) progress?.((index / events.length) * 0.7);
  });
  // Damped diffuse chamber. Irrationally spaced, alternating-polarity
  // reflections avoid a metallic comb or an obvious tempo-synced echo.
  // Circular filtering pre-rolls a whole loop for a steady-state seam.
  let damp = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < frames; i++) {
      damp += (room[i] - damp) * 0.24;
      if (pass === 1) room[i] = damp;
    }
  }
  const reflections = [
    0.031, 0.047, 0.073, 0.109, 0.151, 0.211, 0.283, 0.367, 0.463, 0.593, 0.719,
    0.887, 1.063, 1.279, 1.513, 1.793,
  ];
  reflections.forEach((delay, tap) => {
    const offset = Math.round(delay * sampleRate);
    const gain = Math.exp(-delay * 2.3) * 0.25 * (tap % 3 === 0 ? -1 : 1);
    const l = tap % 2 ? gain * 0.52 : gain;
    const r = tap % 2 ? gain : gain * 0.52;
    for (let i = 0; i < frames; i++) {
      const value = room[(i - offset + frames) % frames];
      left[i] += value * l;
      right[i] += value * r;
    }
    progress?.(0.7 + ((tap + 1) / reflections.length) * 0.22);
  });
  // Remove DC globally (preserves the periodic join), then apply one constant
  // gain to both channels. No brickwall distortion or per-section normalizing.
  let meanL = 0,
    meanR = 0;
  for (let i = 0; i < frames; i++) {
    meanL += left[i];
    meanR += right[i];
  }
  meanL /= frames;
  meanR /= frames;
  let peak = 0;
  for (let i = 0; i < frames; i++) {
    left[i] -= meanL;
    right[i] -= meanR;
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  const gain = peak > 0 ? PEAK_CEILING / peak : 1;
  let squares = 0;
  for (let i = 0; i < frames; i++) {
    left[i] *= gain;
    right[i] *= gain;
    squares += left[i] ** 2 + right[i] ** 2;
  }
  progress?.(1);
  return {
    left,
    right,
    sampleRate,
    peak: peak * gain,
    rms: Math.sqrt(squares / (frames * 2)),
  };
}

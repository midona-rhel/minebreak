export const CHUNK_SECONDS = 8;
export const LOOKAHEAD_SECONDS = 12;
export const TICK_MS = 250;
export const START_LEAD_SECONDS = 0.08;
export const JOIN_SECONDS = 0.012;

export type ScheduledChunk = { when: number; offset: number; duration: number };

/** Adjacent sources overlap the same PCM by 12ms with complementary linear
 * fades. This masks source-start resampler transients without a volume bump.
 * loop=true lets the last source read the opening samples during its tail. */
export function scheduleChunk(
  context: BaseAudioContext,
  buffer: AudioBuffer,
  destination: AudioNode,
  chunk: ScheduledChunk,
) {
  const source = context.createBufferSource();
  const envelope = context.createGain();
  source.buffer = buffer;
  source.loop = true;
  source.connect(envelope);
  envelope.connect(destination);
  const { when, offset, duration } = chunk;
  const fade = Math.min(JOIN_SECONDS, duration);
  envelope.gain.setValueAtTime(0, when);
  envelope.gain.linearRampToValueAtTime(1, when + fade);
  envelope.gain.setValueAtTime(1, when + duration);
  envelope.gain.linearRampToValueAtTime(0, when + duration + JOIN_SECONDS);
  const disconnect = () => {
    source.disconnect();
    envelope.disconnect();
  };
  try {
    source.start(when, offset, duration + JOIN_SECONDS);
  } catch (error) {
    disconnect();
    throw error;
  }
  return { source, disconnect };
}

/** Schedule against the audio clock, never by adding timer delays. Integer
 * chunk indices prevent cumulative drift. A stalled timer skips missed audio
 * instead of queuing a burst of old chunks. At most three sources are planned
 * in one call, regardless of how long the page was stalled. */
export class RollingSchedule {
  private nextChunk = 0;
  constructor(
    private epoch: number,
    private loopSeconds: number,
  ) {
    if (
      !Number.isFinite(epoch) ||
      !Number.isFinite(loopSeconds) ||
      loopSeconds <= 0 ||
      loopSeconds % CHUNK_SECONDS !== 0
    ) {
      throw new Error('The rendered loop must contain whole transport chunks');
    }
  }

  take(now: number): ScheduledChunk[] {
    if (!Number.isFinite(now)) return [];
    const safeNow = now + 0.025;
    const oldest = Math.max(
      0,
      Math.floor((safeNow - this.epoch) / CHUNK_SECONDS),
    );
    this.nextChunk = Math.max(this.nextChunk, oldest);
    const result: ScheduledChunk[] = [];
    while (result.length < 3) {
      const position = this.nextChunk * CHUNK_SECONDS;
      const start = this.epoch + position;
      if (start >= now + LOOKAHEAD_SECONDS) break;
      const skipped = Math.max(0, safeNow - start);
      const duration = CHUNK_SECONDS - skipped;
      this.nextChunk++;
      if (duration <= 0) continue;
      result.push({
        when: start + skipped,
        offset: (position % this.loopSeconds) + skipped,
        duration,
      });
    }
    return result;
  }
}

export function volumeGain(volume: number, muted: boolean) {
  return muted
    ? 0
    : Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 0)) ** 2;
}

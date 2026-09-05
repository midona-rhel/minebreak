import {
  RollingSchedule,
  START_LEAD_SECONDS,
  TICK_MS,
  volumeGain,
  scheduleChunk,
} from './transport.js';

export type MusicState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
export type MusicStatus = {
  state: MusicState;
  progress?: number;
  message?: string;
};
type RenderData = {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
};
type RenderMessage =
  | ({ type: 'ready' } & RenderData)
  | { type: 'progress'; progress: number }
  | { type: 'error' };

/** Dependencies are injectable for lifecycle tests. No browser resource is
 * created at import, construction, mount, mute or volume change. */
export type MusicEnvironment = {
  context: () => AudioContext;
  worker: () => Worker;
  interval: (
    callback: () => void,
    ms: number,
  ) => ReturnType<typeof setInterval>;
  clearInterval: (id: ReturnType<typeof setInterval>) => void;
  timeout: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (id: ReturnType<typeof setTimeout>) => void;
};

const browserEnvironment: MusicEnvironment = {
  context: () => {
    if (typeof AudioContext === 'undefined')
      throw new Error('Music needs a browser with Web Audio support.');
    return new AudioContext({ latencyHint: 'playback' });
  },
  worker: () =>
    new Worker(new URL('./render.worker.ts', import.meta.url), {
      type: 'module',
    }),
  interval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (id) => clearInterval(id),
  timeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (id) => clearTimeout(id),
};

export class MusicEngine {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private buffer: AudioBuffer | null = null;
  private worker: Worker | null = null;
  private schedule: RollingSchedule | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pauseTimer: ReturnType<typeof setTimeout> | null = null;
  private renderTimer: ReturnType<typeof setTimeout> | null = null;
  private sources = new Map<AudioBufferSourceNode, () => void>();
  private generation = 0;
  private disposed = false;
  private volume = 0.55;
  private muted = false;
  private state: MusicState = 'idle';
  private cancelRender: (() => void) | null = null;
  private suspending: Promise<void> | null = null;

  constructor(
    private notify: (status: MusicStatus) => void,
    private env: MusicEnvironment = browserEnvironment,
  ) {}

  private publish(state: MusicState, message?: string, progress?: number) {
    this.state = state;
    if (!this.disposed) this.notify({ state, message, progress });
  }

  setVolume(value: number) {
    this.volume = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
    this.updateGain();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.updateGain();
  }

  private updateGain() {
    if (!this.context || !this.gain) return;
    const now = this.context.currentTime;
    const param = this.gain.gain;
    param.cancelAndHoldAtTime(now);
    param.setTargetAtTime(
      this.state === 'playing' ? volumeGain(this.volume, this.muted) : 0,
      now,
      0.018,
    );
  }

  /** Must be called directly from a button/keyboard gesture. resume() happens
   * before any render await, preserving transient user activation on mobile. */
  async play(): Promise<void> {
    if (this.disposed || this.state === 'playing' || this.state === 'loading')
      return;
    const generation = ++this.generation;
    this.clearPauseTimer();
    this.publish('loading', undefined, this.buffer ? 1 : 0);
    try {
      if (!this.context) {
        this.context = this.env.context();
        this.gain = this.context.createGain();
        this.gain.gain.value = 0;
        this.gain.connect(this.context.destination);
        this.context.onstatechange = () => {
          if (this.context?.state !== 'running' && this.state === 'playing') {
            this.stopTimer();
            this.publish(
              'paused',
              'Music interrupted. Press play to continue.',
            );
            this.updateGain();
          }
        };
      }
      const context = this.context;
      // Start resume in the gesture even when a preceding suspend is settling.
      const resume = context.resume();
      if (this.suspending) await this.suspending;
      await resume;
      if (generation !== this.generation || this.disposed) return;
      if (context.state !== 'running')
        throw new Error('Audio was not allowed to start. Press play to retry.');
      if (!this.buffer) {
        const data = await this.render();
        if (generation !== this.generation || this.disposed) return;
        const buffer = context.createBuffer(
          2,
          data.left.length,
          data.sampleRate,
        );
        buffer.copyToChannel(data.left as Float32Array<ArrayBuffer>, 0);
        buffer.copyToChannel(data.right as Float32Array<ArrayBuffer>, 1);
        this.buffer = buffer;
      }
      if (generation !== this.generation || this.disposed) return;
      if (context.state !== 'running')
        throw new Error('Music was interrupted. Press play to retry.');
      this.schedule ??= new RollingSchedule(
        context.currentTime + START_LEAD_SECONDS,
        this.buffer.duration,
      );
      this.publish('playing');
      this.updateGain();
      if (this.tick())
        this.timer = this.env.interval(() => this.tick(), TICK_MS);
    } catch (error) {
      if (generation !== this.generation || this.disposed) return;
      this.releaseResources();
      this.publish(
        'error',
        error instanceof Error
          ? error.message
          : 'Music could not start. Press play to retry.',
      );
    }
  }

  private render(): Promise<RenderData> {
    return new Promise((resolve, reject) => {
      const worker = this.env.worker();
      this.worker = worker;
      const cleanup = () => {
        if (this.renderTimer !== null) this.env.clearTimeout(this.renderTimer);
        this.renderTimer = null;
        worker.onmessage = null;
        worker.onerror = null;
        worker.terminate();
        if (this.worker === worker) this.worker = null;
        this.cancelRender = null;
      };
      const fail = (message: string) => {
        cleanup();
        reject(new Error(message));
      };
      this.cancelRender = () => fail('Music loading cancelled.');
      this.renderTimer = this.env.timeout(
        () => fail('Music preparation timed out. Press play to retry.'),
        90000,
      );
      worker.onerror = () => fail('Music could not load. Press play to retry.');
      worker.onmessage = (event: MessageEvent<RenderMessage>) => {
        const data = event.data;
        if (data.type === 'progress')
          this.publish('loading', undefined, data.progress);
        else if (data.type === 'error')
          fail('Music could not be prepared. Press play to retry.');
        else if (data.type === 'ready') {
          cleanup();
          resolve(data);
        }
      };
      worker.postMessage({ type: 'render' });
    });
  }

  private tick(): boolean {
    if (
      this.state !== 'playing' ||
      !this.context ||
      !this.gain ||
      !this.buffer ||
      !this.schedule
    )
      return false;
    try {
      for (const chunk of this.schedule.take(this.context.currentTime)) {
        const { source, disconnect } = scheduleChunk(
          this.context,
          this.buffer,
          this.gain,
          chunk,
        );
        source.onended = () => {
          disconnect();
          this.sources.delete(source);
        };
        this.sources.set(source, disconnect);
      }
      return true;
    } catch {
      this.releaseResources();
      this.publish('error', 'Music playback stopped. Press play to retry.');
      return false;
    }
  }

  pause(message?: string, immediately = false) {
    if (this.disposed || (this.state !== 'playing' && this.state !== 'loading'))
      return;
    ++this.generation;
    this.stopTimer();
    if (this.cancelRender || !this.buffer) {
      this.releaseResources();
      this.publish('paused', message);
      return;
    }
    this.publish('paused', message);
    this.updateGain();
    const context = this.context;
    // Fade first, then freeze the audio clock and all scheduled sources. Keep
    // the PCM for immediate resume; never restart the composition on pause.
    const suspend = () => {
      this.pauseTimer = null;
      if (!context || context.state === 'closed') return;
      const pending = context.suspend().catch(() => undefined);
      this.suspending = pending;
      void pending.finally(() => {
        if (this.suspending === pending) this.suspending = null;
      });
    };
    if (immediately) suspend();
    else this.pauseTimer = this.env.timeout(suspend, 90);
  }

  private stopTimer() {
    if (this.timer !== null) this.env.clearInterval(this.timer);
    this.timer = null;
  }

  private clearPauseTimer() {
    if (this.pauseTimer !== null) this.env.clearTimeout(this.pauseTimer);
    this.pauseTimer = null;
  }

  private releaseResources() {
    this.stopTimer();
    this.clearPauseTimer();
    this.cancelRender?.();
    this.worker?.terminate();
    this.worker = null;
    for (const [source, disconnect] of this.sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        /* A source may already have finished. */
      }
      disconnect();
    }
    this.sources.clear();
    this.gain?.disconnect();
    if (this.context) {
      this.context.onstatechange = null;
      if (this.context.state !== 'closed')
        void this.context.close().catch(() => undefined);
    }
    this.context = null;
    this.gain = null;
    this.buffer = null;
    this.schedule = null;
    this.suspending = null;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    ++this.generation;
    this.releaseResources();
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { MusicEngine } from '../../../work/music-tests/engine.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));
const ready = {
  type: 'ready',
  left: new Float32Array(960000),
  right: new Float32Array(960000),
  sampleRate: 8000,
};

function harness() {
  const statuses = [],
    contexts = [],
    workers = [],
    intervals = new Map(),
    timeouts = new Map();
  let id = 0;
  class Context {
    state = 'suspended';
    currentTime = 0;
    destination = {};
    onstatechange = null;
    sources = [];
    resumeCalls = 0;
    suspendCalls = 0;
    closeCalls = 0;
    targets = [];
    startError = false;
    async resume() {
      this.resumeCalls++;
      this.state = 'running';
      this.onstatechange?.();
    }
    async suspend() {
      this.suspendCalls++;
      this.state = 'suspended';
      this.onstatechange?.();
    }
    async close() {
      this.closeCalls++;
      this.state = 'closed';
      this.onstatechange?.();
    }
    createGain() {
      return {
        gain: {
          value: 0,
          cancelAndHoldAtTime() {},
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          setTargetAtTime: (value) => this.targets.push(value),
        },
        connect() {},
        disconnect() {},
      };
    }
    createBuffer(channels, length, rate) {
      return { duration: length / rate, copyToChannel() {} };
    }
    createBufferSource() {
      const source = {
        buffer: null,
        onended: null,
        stopped: false,
        disconnected: false,
        args: null,
        connect() {},
        disconnect() {
          this.disconnected = true;
        },
        stop() {
          this.stopped = true;
        },
        start: (...args) => {
          if (this.startError) throw new Error('device lost');
          source.args = args;
        },
      };
      this.sources.push(source);
      return source;
    }
  }
  const env = {
    context() {
      const context = new Context();
      contexts.push(context);
      return context;
    },
    worker() {
      const worker = {
        onmessage: null,
        onerror: null,
        terminated: false,
        postMessage() {},
        terminate() {
          this.terminated = true;
        },
      };
      workers.push(worker);
      return worker;
    },
    interval(callback) {
      const key = ++id;
      intervals.set(key, callback);
      return key;
    },
    clearInterval(key) {
      intervals.delete(key);
    },
    timeout(callback, ms) {
      const key = ++id;
      timeouts.set(key, { callback, ms });
      return key;
    },
    clearTimeout(key) {
      timeouts.delete(key);
    },
  };
  const engine = new MusicEngine((status) => statuses.push(status), env);
  const runTimeouts = (ms) => {
    for (const [key, value] of timeouts)
      if (value.ms <= ms) {
        timeouts.delete(key);
        value.callback();
      }
  };
  const start = async () => {
    const pending = engine.play();
    await flush();
    workers.at(-1).onmessage({ data: ready });
    await pending;
  };
  return {
    engine,
    statuses,
    contexts,
    workers,
    intervals,
    timeouts,
    runTimeouts,
    start,
    env,
  };
}

test('import, construction, mute and volume are silent; play resumes before rendering', async () => {
  const h = harness();
  h.engine.setVolume(0.6);
  h.engine.setMuted(true);
  assert.equal(h.contexts.length, 0);
  assert.equal(h.workers.length, 0);
  const pending = h.engine.play();
  assert.equal(
    h.contexts[0].resumeCalls,
    1,
    'resume must occur synchronously in the user gesture',
  );
  assert.equal(h.workers.length, 0);
  await flush();
  h.workers[0].onmessage({ data: ready });
  await pending;
  assert.equal(h.statuses.at(-1).state, 'playing');
  assert.equal(h.contexts[0].targets.at(-1), 0);
  assert.equal(h.workers[0].terminated, true);
  assert.equal(h.timeouts.size, 0);
  h.engine.dispose();
});

test('duplicate play and rapid pause/play cannot duplicate contexts, workers or timers', async () => {
  const h = harness();
  const pending = h.engine.play();
  await h.engine.play();
  await flush();
  assert.equal(h.contexts.length, 1);
  assert.equal(h.workers.length, 1);
  h.workers[0].onmessage({ data: ready });
  await pending;
  const sourceCount = h.contexts[0].sources.length;
  for (let i = 0; i < 10; i++) {
    h.engine.pause();
    await h.engine.play();
  }
  assert.equal(h.contexts.length, 1);
  assert.equal(h.workers.length, 1);
  assert.equal(h.contexts[0].sources.length, sourceCount);
  assert.equal(h.timeouts.size, 0);
  assert.equal(h.intervals.size, 1);
  h.engine.dispose();
});

test('pause freezes scheduled audio and resume keeps the same score position', async () => {
  const h = harness();
  await h.start();
  const context = h.contexts[0];
  context.currentTime = 3.2;
  const original = context.sources.map((source) => source.args);
  h.engine.pause();
  assert.equal(h.intervals.size, 0);
  assert.equal(context.targets.at(-1), 0);
  h.runTimeouts(90);
  await flush();
  assert.equal(context.state, 'suspended');
  await h.engine.play();
  assert.equal(context.state, 'running');
  assert.deepEqual(
    context.sources.slice(0, original.length).map((source) => source.args),
    original,
  );
  assert.equal(h.workers.length, 1);
  h.engine.dispose();
});

test('hiding the page suspends immediately, without needing a background timer', async () => {
  const h = harness();
  await h.start();
  h.engine.pause('Paused while you were away.', true);
  assert.equal(h.contexts[0].suspendCalls, 1);
  assert.equal(h.intervals.size, 0);
  assert.equal(h.timeouts.size, 0);
  assert.equal(h.statuses.at(-1).state, 'paused');
  h.engine.dispose();
});

test('cancelling preparation terminates work; a later explicit play can retry', async () => {
  const h = harness();
  const pending = h.engine.play();
  await flush();
  h.engine.pause();
  await pending;
  assert.equal(h.workers[0].terminated, true);
  assert.equal(h.contexts[0].state, 'closed');
  assert.equal(h.timeouts.size, 0);
  assert.equal(h.intervals.size, 0);
  await h.start();
  assert.equal(h.statuses.at(-1).state, 'playing');
  h.engine.dispose();
});

test('worker failure and timeout both close audio and leave a retryable state', async () => {
  for (const failure of ['worker', 'timeout']) {
    const h = harness();
    const pending = h.engine.play();
    await flush();
    if (failure === 'worker') h.workers[0].onerror();
    else h.runTimeouts(90000);
    await pending;
    assert.equal(h.statuses.at(-1).state, 'error');
    assert.equal(h.contexts[0].state, 'closed');
    assert.equal(h.workers[0].terminated, true);
    assert.equal(h.timeouts.size, 0);
    await h.start();
    h.engine.dispose();
  }
});

test('device interruption during playback stops scheduling until another gesture', async () => {
  const h = harness();
  await h.start();
  const context = h.contexts[0];
  context.state = 'interrupted';
  context.onstatechange();
  assert.equal(h.statuses.at(-1).state, 'paused');
  assert.equal(h.intervals.size, 0);
  await h.engine.play();
  assert.equal(h.statuses.at(-1).state, 'playing');
  h.engine.dispose();
});

test('audio-node errors release sources and do not start a stray timer', async () => {
  const h = harness();
  const pending = h.engine.play();
  await flush();
  h.contexts[0].startError = true;
  h.workers[0].onmessage({ data: ready });
  await pending;
  assert.equal(h.statuses.at(-1).state, 'error');
  assert.equal(h.intervals.size, 0);
  assert.equal(h.contexts[0].closeCalls, 1);
  assert.ok(h.contexts[0].sources.every((source) => source.disconnected));
  h.engine.dispose();
});

test('dispose during preparation ignores late work and is safe to call twice', async () => {
  const h = harness();
  const pending = h.engine.play();
  await flush();
  const count = h.statuses.length;
  h.engine.dispose();
  h.engine.dispose();
  await pending;
  await h.engine.play();
  assert.equal(h.statuses.length, count);
  assert.equal(h.contexts[0].closeCalls, 1);
  assert.equal(h.workers[0].terminated, true);
  assert.equal(h.workers[0].onmessage, null);
  assert.equal(h.timeouts.size, 0);
  assert.equal(h.intervals.size, 0);
});

test('ended sources disconnect and final disposal releases every live source', async () => {
  const h = harness();
  await h.start();
  const first = h.contexts[0].sources[0];
  first.onended();
  assert.equal(first.disconnected, true);
  h.engine.dispose();
  assert.equal(h.contexts[0].sources[1].stopped, true);
  assert.equal(h.contexts[0].sources[1].disconnected, true);
  assert.equal(h.contexts[0].sources[1].onended, null);
  assert.equal(h.intervals.size, 0);
});

test('disposing while resume is pending cannot create a late worker or notify', async () => {
  const h = harness();
  const factory = h.env.context.bind(h.env);
  let releaseResume;
  h.env.context = () => {
    const context = factory();
    context.resume = () =>
      new Promise((resolve) => {
        releaseResume = resolve;
      });
    return context;
  };
  const pending = h.engine.play();
  h.engine.dispose();
  const count = h.statuses.length;
  releaseResume();
  await pending;
  assert.equal(h.statuses.length, count);
  assert.equal(h.workers.length, 0);
  assert.equal(h.contexts[0].state, 'closed');
});

test('interruption during rendering cannot report that silent audio is playing', async () => {
  const h = harness();
  const pending = h.engine.play();
  await flush();
  h.contexts[0].state = 'interrupted';
  h.workers[0].onmessage({ data: ready });
  await pending;
  assert.equal(h.statuses.at(-1).state, 'error');
  assert.equal(h.contexts[0].sources.length, 0);
  assert.equal(h.intervals.size, 0);
  h.engine.dispose();
});

import { createScore, LOOP_SECONDS } from './score.js';
import { renderMusic } from './synthesis.js';

// One request per short-lived worker. Transfer the PCM, avoiding a second
// structured-clone copy of the 30.7 MB stereo render.
self.onmessage = () => {
  try {
    const result = renderMusic(
      createScore(),
      LOOP_SECONDS,
      undefined,
      (progress) => {
        self.postMessage({ type: 'progress', progress });
      },
    );
    self.postMessage(
      { type: 'ready', ...result },
      { transfer: [result.left.buffer, result.right.buffer] },
    );
  } catch {
    self.postMessage({ type: 'error' });
  }
};

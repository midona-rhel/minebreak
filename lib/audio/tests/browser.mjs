/** Optional real Chromium WebAudio check. First run run.mjs --render, then:
 * node lib/audio/tests/browser.mjs /absolute/path/to/chrome
 * Uses a private headless profile and localhost; never plays audible audio.
 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

if (!process.argv[2])
  throw new Error('Pass a Chromium/Chrome executable path.');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const profile = resolve(root, 'work/music/browser-profile');
await mkdir(profile, { recursive: true });
const [wave, modules] = await Promise.all([
  readFile(resolve(root, 'work/music/lanterns-at-low-tide.wav')),
  Promise.all(
    ['transport', 'score', 'synthesis', 'render.worker'].map(async (name) => [
      '/' + name + '.js',
      [
        await readFile(resolve(root, 'work/music-tests/' + name + '.js')),
        'text/javascript',
      ],
    ]),
  ),
]);

const html = `<!doctype html><title>Offline music validation</title><script type="module">
import { scheduleChunk } from '/transport.js';
try {
  const worker = new Worker('/render.worker.js', { type: 'module' });
  const workerStarted = performance.now();
  const rendered = await new Promise((resolve, reject) => {
    worker.onerror = () => reject(new Error('The real render worker failed.'));
    worker.onmessage = ({ data }) => {
      if (data.type === 'ready') resolve(data);
      if (data.type === 'error') reject(new Error('The real render worker reported an error.'));
    };
    worker.postMessage({ type: 'render' });
  });
  worker.terminate();
  const workerMs = Math.round(performance.now() - workerStarted);
  if (rendered.left.length !== 3840000 || rendered.right.length !== 3840000 || rendered.sampleRate !== 32000 || rendered.peak > 0.441) throw new Error('Invalid PCM received from the worker.');
  const wav = new DataView(await (await fetch('/audio.wav')).arrayBuffer());
  const inputRate = wav.getUint32(24, true), frames = wav.getUint32(40, true) / 4;
  const channels = [new Float32Array(frames), new Float32Array(frames)];
  for (let i = 0; i < frames; i++) for (let c = 0; c < 2; c++) channels[c][i] = wav.getInt16(44 + i * 4 + c * 2, true) / 32768;
  const metrics = [];
  for (const rate of [44100, 48000]) {
    const render = async (chunked) => {
      const context = new OfflineAudioContext(2, 16 * rate, rate);
      const buffer = context.createBuffer(2, frames, inputRate);
      channels.forEach((data, c) => buffer.copyToChannel(data, c));
      if (chunked) {
        scheduleChunk(context, buffer, context.destination, { when: 0, offset: 112, duration: 8 });
        scheduleChunk(context, buffer, context.destination, { when: 8, offset: 0, duration: 8 });
      } else {
        const source = context.createBufferSource();
        source.buffer = buffer; source.loop = true; source.connect(context.destination); source.start(0, 112);
      }
      return context.startRendering();
    };
    const reference = await render(false), chunked = await render(true);
    let error = 0, peak = 0;
    for (let c = 0; c < 2; c++) {
      const a = reference.getChannelData(c), b = chunked.getChannelData(c);
      for (let i = Math.round(0.2 * rate); i < b.length - rate * 0.1; i++) {
        error = Math.max(error, Math.abs(a[i] - b[i]));
        peak = Math.max(peak, Math.abs(b[i]));
      }
    }
    metrics.push({ rate, maximumDifferenceFromNativeLoop: error, peak });
    if (error > 0.002 || peak > 0.45) throw new Error(JSON.stringify(metrics));
  }
  await fetch('/result', { method: 'POST', body: JSON.stringify({ passed: true, workerMs, metrics }) });
} catch (error) {
  await fetch('/result', { method: 'POST', body: JSON.stringify({ passed: false, error: String(error) }) });
}
</script>`;

let finish;
const result = new Promise((resolveResult) => {
  finish = resolveResult;
});
const server = createServer(async (request, response) => {
  if (request.url === '/result' && request.method === 'POST') {
    let body = '';
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 10000) {
        response.writeHead(413).end();
        return;
      }
    }
    response.end('ok');
    finish(JSON.parse(body));
    return;
  }
  const assets = {
    '/': [html, 'text/html'],
    '/audio.wav': [wave, 'audio/wav'],
    ...Object.fromEntries(modules),
  };
  const asset = assets[request.url];
  if (!asset) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'Content-Type': asset[1] });
  response.end(asset[0]);
});
await new Promise((resolveListen) =>
  server.listen(0, '127.0.0.1', resolveListen),
);
const browser = spawn(
  process.argv[2],
  [
    '--headless',
    '--disable-gpu',
    '--mute-audio',
    '--no-first-run',
    '--disable-background-networking',
    '--disable-extensions',
    '--user-data-dir=' + profile,
    'http://127.0.0.1:' + server.address().port,
  ],
  { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true },
);
let diagnostic = '';
browser.stderr.on('data', (chunk) => {
  diagnostic = (diagnostic + chunk).slice(-3000);
});
browser.on('error', (error) => finish({ passed: false, error: String(error) }));
browser.on('exit', (code) => {
  if (code) finish({ passed: false, error: diagnostic });
});
const timeout = setTimeout(
  () =>
    finish({
      passed: false,
      error: 'Browser audio test timed out. ' + diagnostic,
    }),
  60000,
);
try {
  const report = await result;
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  browser.kill();
  server.closeAllConnections();
  server.close();
}

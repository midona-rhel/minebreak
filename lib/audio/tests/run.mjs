import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = resolve(root, 'work/music-tests');
mkdirSync(output, { recursive: true });
const compile = spawnSync(
  process.execPath,
  [
    resolve(root, 'node_modules/typescript/bin/tsc'),
    ...[
      'score',
      'synthesis',
      'transport',
      'engine',
      'preferences',
      'render.worker',
    ].map((file) => resolve(root, `lib/audio/${file}.ts`)),
    '--outDir',
    output,
    '--target',
    'ES2022',
    '--module',
    'NodeNext',
    '--moduleResolution',
    'NodeNext',
    '--lib',
    'ES2022,DOM',
    '--types',
    'node',
    '--skipLibCheck',
  ],
  { cwd: root, stdio: 'inherit' },
);
if (compile.status !== 0) process.exit(compile.status ?? 1);
const result = spawnSync(
  process.execPath,
  [
    '--test',
    ...['score', 'audio', 'engine', 'layout'].map((file) =>
      resolve(root, `lib/audio/tests/${file}.test.mjs`),
    ),
  ],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      MINEBREAK_RENDER_MUSIC: process.argv.includes('--render') ? '1' : '0',
    },
  },
);
process.exit(result.status ?? 1);

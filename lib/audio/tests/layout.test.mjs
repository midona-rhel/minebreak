import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('root layout keeps one normal-flow music player and overrides the desktop scroll lock', () => {
  const layout = readFileSync(
    new URL('../../../app/layout.tsx', import.meta.url),
    'utf8',
  );
  const css = readFileSync(
    new URL('../../../app/layout.module.css', import.meta.url),
    'utf8',
  );
  assert.equal((layout.match(/<MusicPlayer\s*\/>/g) ?? []).length, 1);
  assert.match(layout, /styles\.page/);
  assert.ok(layout.indexOf('{children}') < layout.indexOf('<MusicPlayer'));
  assert.match(css, /\.page\s*\{\s*overflow-y:\s*auto;/);
  assert.doesNotMatch(css, /position:\s*(fixed|absolute)/);
});

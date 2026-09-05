import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Exercise the actual component handlers without a DOM or WebGL renderer.
function compile(file, require) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const fixture = { exports: {} };
  runInNewContext(output, {
    require,
    module: fixture,
    exports: fixture.exports,
    localStorage: { setItem() {} },
  });
  return fixture.exports;
}
function harness() {
  const values = [];
  let cursor = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in values))
        values[index] = typeof initial === 'function' ? initial() : initial;
      return [
        values[index],
        (next) => {
          values[index] =
            typeof next === 'function' ? next(values[index]) : next;
        },
      ];
    },
    useEffect() {},
    useCallback: (callback) => callback,
  };
  const stats = compile('../lib/player-stats.ts', () => {
    throw new Error('Unexpected stats import');
  });
  const jsx = (type, props) => ({ type, props });
  const Game = compile('../components/minebreak-game.tsx', (name) => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === '@/lib/player-stats') return stats;
    if (name === '@/minigames/registry')
      return { selectMinigame: (seed) => ({ seed }) };
    if (name === '@/components/overworld') return { default: 'Overworld' };
    if (name === '@/components/encounter-host')
      return { default: 'EncounterHost' };
    return new Proxy({}, { get: (_, key) => key });
  }).default;
  const render = () => {
    cursor = 0;
    return Game();
  };
  function find(type, node = render()) {
    if (!node || typeof node !== 'object') return;
    if (node.type === type) return node.props;
    for (const child of [node.props?.children].flat(Infinity)) {
      const match = find(type, child ?? null);
      if (match) return match;
    }
  }
  const trigger = () => {
    const board = find('Overworld');
    board.reveal(board.cells.find((cell) => cell.mine && !cell.open).id);
    return find('EncounterHost');
  };
  const board = find('Overworld');
  board.reveal(board.cells.find((cell) => !cell.mine).id);
  return { find, trigger };
}

test('fantasy board launches a frozen player snapshot and passes its identity to the minigame', () => {
  const h = harness(),
    encounter = h.trigger();
  assert.ok(Object.isFrozen(encounter.context.player));
  assert.equal(encounter.context.player.health, 5);
  assert.equal(encounter.context.player.xp, 2);
  assert.equal(encounter.definition.seed, encounter.context.seed);
  encounter.cancel();
  assert.equal(h.find('EncounterHost'), undefined);
  assert.equal(h.find('Overworld').cells[encounter.context.cellId].open, false);
});

test('encounter writebacks survive the fantasy board and the next encounter', () => {
  const h = harness();
  h.trigger().complete({
    outcome: 'success',
    playerStats: {
      health: 3,
      maxHealth: 8,
      xp: 199,
      upgrades: { armor: 2, repair: 1, salvage: 4 },
    },
  });
  const player = h.trigger().context.player;
  assert.equal(player.health, 3);
  assert.equal(player.maxHealth, 8);
  assert.equal(player.xp, 199);
  assert.deepEqual({ ...player.upgrades }, { armor: 2, repair: 1, salvage: 4 });
});

test('explicit zero health locks the board even on a successful encounter', () => {
  const h = harness();
  h.trigger().complete({ outcome: 'success', playerStats: { health: 0 } });
  assert.equal(h.find('Overworld').locked, true);
  assert.equal(h.find('EncounterHost'), undefined);
});

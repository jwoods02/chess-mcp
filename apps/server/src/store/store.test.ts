import { describe, expect, test } from 'vitest';
import { applyMove, createGame, resign } from '../chess/game.ts';
import { MemoryStore } from './memory.ts';
import { SqliteStore } from './sqlite.ts';
import type { GameStore } from './store.ts';

describe.each([
  ['memory', () => new MemoryStore()],
  ['sqlite', () => new SqliteStore(':memory:')],
])('%s store', (_name, makeStore: () => GameStore) => {
  test('creates and loads a game', async () => {
    const store = makeStore();
    const game = createGame({ white: 'human', black: 'llm' });
    await store.create(game);
    expect(await store.get(game.id)).toEqual(game);
    expect(await store.get('missing')).toBeUndefined();
  });

  test('only updates a game that is unchanged since it was loaded', async () => {
    const store = makeStore();
    const game = createGame({ white: 'human', black: 'llm' });
    await store.create(game);

    const afterE4 = applyMove(game, 'e4', 'human');
    expect(await store.update(afterE4, game)).toBe(true);
    // A second writer that also started from the original game loses.
    expect(await store.update(applyMove(game, 'd4', 'human'), game)).toBe(false);
    expect(await store.get(game.id)).toEqual(afterE4);
  });

  test('a change that keeps the same ply still blocks a stale write', async () => {
    const store = makeStore();
    const game = createGame({ white: 'human', black: 'llm' });
    await store.create(game);

    const resigned = resign(game, 'w');
    expect(await store.update(resigned, game)).toBe(true);
    expect(await store.update(applyMove(game, 'e4', 'human'), game)).toBe(false);
  });
});

import { describe, expect, test } from 'vitest';
import { applyMove, createGame, resign } from '../chess/game.ts';
import { SqliteStore } from './sqlite.ts';

const makeStore = () => new SqliteStore(':memory:');

describe('sqlite store', () => {
  test('creates and loads a game', async () => {
    const store = makeStore();
    const game = createGame({ white: 'human', black: 'llm' });
    await store.create(game);
    expect(await store.get(game.id)).toEqual(game);
    expect(await store.get('missing')).toBeUndefined();
  });

  test('only updates a game that is unchanged since it was loaded, even at the same ply', async () => {
    const store = makeStore();
    const game = createGame({ white: 'human', black: 'llm' });
    await store.create(game);

    const afterE4 = applyMove(game, 'e4', 'human');
    expect(await store.update(afterE4, game)).toBe(true);
    // A second writer that also started from the original game loses.
    expect(await store.update(applyMove(game, 'd4', 'human'), game)).toBe(false);

    // A resignation keeps the ply, but a move based on the game before it still loses.
    const resigned = resign(afterE4, 'w');
    expect(await store.update(resigned, afterE4)).toBe(true);
    expect(await store.update(applyMove(afterE4, 'e5', 'llm'), afterE4)).toBe(false);
    expect(await store.get(game.id)).toEqual(resigned);
  });
});

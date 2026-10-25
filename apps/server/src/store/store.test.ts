import Database from 'better-sqlite3';
import { describe, expect, test } from 'vitest';
import { applyMove, createGame, resign } from '../chess/game.ts';
import { D1Store, type D1Database } from './d1.ts';
import { SqliteStore } from './sqlite.ts';
import type { GameStore } from './store.ts';

/** Just enough of D1's API, over SQLite in memory, to run D1Store's SQL for real. */
function fakeD1(): D1Database {
  const db = new Database(':memory:');
  const statement = (sql: string, values: unknown[] = []) => ({
    bind: (...next: unknown[]) => statement(sql, next),
    first: async <T>() => (db.prepare(sql).get(...values) as T | undefined) ?? null,
    run: async () => ({ meta: { changes: db.prepare(sql).run(...values).changes } }),
  });
  return { prepare: (sql) => statement(sql) };
}

describe.each<[string, () => GameStore]>([
  ['sqlite', () => new SqliteStore(':memory:')],
  ['d1', () => new D1Store(fakeD1())],
])('%s store', (_name, makeStore) => {
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

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import type { Game } from '../chess/game.ts';
import type { GameStore } from './store.ts';

/** SQLite store: one row per game, the whole game as JSON. `ply` is kept as a column for updates. */
export class SqliteStore implements GameStore {
  #db: Database.Database;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.#db = new Database(path);
    this.#db.pragma('journal_mode = WAL');
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS games (
        id         TEXT PRIMARY KEY,
        ply        INTEGER NOT NULL,
        data       TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  }

  async get(id: string) {
    const row = this.#db.prepare('SELECT data FROM games WHERE id = ?').get(id) as
      | { data: string }
      | undefined;
    return row ? (JSON.parse(row.data) as Game) : undefined;
  }

  async create(game: Game) {
    this.#db
      .prepare('INSERT INTO games (id, ply, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(game.id, game.moves.length, JSON.stringify(game), game.createdAt, game.updatedAt);
  }

  async update(game: Game, expectedPly: number) {
    const { changes } = this.#db
      .prepare('UPDATE games SET ply = ?, data = ?, updated_at = ? WHERE id = ? AND ply = ?')
      .run(game.moves.length, JSON.stringify(game), game.updatedAt, game.id, expectedPly);
    return changes === 1;
  }

  close() {
    this.#db.close();
  }
}

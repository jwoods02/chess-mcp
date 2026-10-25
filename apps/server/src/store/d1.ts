import type { Game } from '../chess/game.ts';
import type { GameStore } from './store.ts';

/** The part of Cloudflare's D1 binding this store uses, so the server needn't take Workers' types. */
export interface D1Database {
  prepare(sql: string): D1Statement;
}
interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
}

/** D1 store for the hosted server: the same table and SQL as `SqliteStore`. */
export class D1Store implements GameStore {
  #db: D1Database;
  #ready = false;

  constructor(db: D1Database) {
    this.#db = db;
  }

  // Creating the table on first use keeps deploys to one command, with no migrations to run.
  // A flag rather than a shared promise: Workers don't let one request wait on another's I/O, and
  // two requests both running CREATE TABLE IF NOT EXISTS is harmless.
  async #table() {
    if (this.#ready) return;
    await this.#db
      .prepare(
        `CREATE TABLE IF NOT EXISTS games (
          id         TEXT PRIMARY KEY,
          ply        INTEGER NOT NULL,
          data       TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`,
      )
      .run();
    this.#ready = true;
  }

  async get(id: string) {
    await this.#table();
    const row = await this.#db
      .prepare('SELECT data FROM games WHERE id = ?')
      .bind(id)
      .first<{ data: string }>();
    return row ? (JSON.parse(row.data) as Game) : undefined;
  }

  async create(game: Game) {
    await this.#table();
    await this.#db
      .prepare('INSERT INTO games (id, ply, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .bind(game.id, game.moves.length, JSON.stringify(game), game.createdAt, game.updatedAt)
      .run();
  }

  async update(game: Game, previous: Game) {
    await this.#table();
    // Same conditional write as SqliteStore: it fails if anything changed the game since `previous`.
    const { meta } = await this.#db
      .prepare('UPDATE games SET ply = ?, data = ?, updated_at = ? WHERE id = ? AND data = ?')
      .bind(
        game.moves.length,
        JSON.stringify(game),
        game.updatedAt,
        game.id,
        JSON.stringify(previous),
      )
      .run();
    return meta.changes === 1;
  }
}

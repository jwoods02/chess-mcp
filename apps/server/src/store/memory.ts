import type { Game } from '../chess/game.ts';
import type { GameStore } from './store.ts';

/** In-memory store for tests. */
export class MemoryStore implements GameStore {
  #games = new Map<string, Game>();

  async get(id: string) {
    return this.#games.get(id);
  }

  async create(game: Game) {
    this.#games.set(game.id, game);
  }

  async update(game: Game, previous: Game) {
    if (JSON.stringify(this.#games.get(game.id)) !== JSON.stringify(previous)) return false;
    this.#games.set(game.id, game);
    return true;
  }
}

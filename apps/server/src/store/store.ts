import type { Game } from '../chess/game.ts';

/** Where games live. Async so a Redis/Postgres version can drop in later. */
export interface GameStore {
  get(id: string): Promise<Game | undefined>;
  create(game: Game): Promise<void>;
  /**
   * Saves `game` only if the stored game is still exactly `previous` (the version the change was
   * based on). Returns false if anything else changed it in the meantime.
   */
  update(game: Game, previous: Game): Promise<boolean>;
}

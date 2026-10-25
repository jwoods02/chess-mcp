import type { Game } from '../chess/game.ts';

/** Where games live. Async so a Redis/Postgres version can drop in later. */
export interface GameStore {
  get(id: string): Promise<Game | undefined>;
  create(game: Game): Promise<void>;
  /** Saves `game` only if the stored game is still at `expectedPly`. Returns false if it wasn't. */
  update(game: Game, expectedPly: number): Promise<boolean>;
}

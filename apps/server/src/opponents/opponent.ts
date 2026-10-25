import type { MoveMeta } from '../chess/game.ts';

/** A non-LLM opponent the server plays on its own, such as Jev. */
export interface Opponent {
  /**
   * Picks one of `legalMoves` (SAN) for the side to move in `fen`. `moves` is the game so far in
   * numbered notation ("1. e4 e5 2. Nf3"). chess.js produces both lists, so the choice is always legal.
   */
  chooseMove(position: {
    fen: string;
    moves: string;
    legalMoves: string[];
  }): Promise<{ move: string; meta?: MoveMeta }>;
}

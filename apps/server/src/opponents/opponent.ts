/** A non-LLM opponent the server plays on its own, such as Jev. */
export interface Opponent {
  /**
   * Picks a move (SAN) for the side to move in `fen`. `moves` is the game so far in numbered notation
   * ("1. e4 e5 2. Nf3"). The caller checks the move is legal.
   */
  chooseMove(position: { fen: string; moves: string }): Promise<{
    move: string;
    /** How likely the opponent rated each legal move (SAN), if it says. Lower levels draw from these. */
    probabilities?: Record<string, number>;
    latencyMs?: number;
  }>;
}

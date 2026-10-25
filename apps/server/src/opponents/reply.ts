import { applyMove, moveText, replay, seat, type Game } from '../chess/game.ts';
import type { Opponent } from './opponent.ts';

/**
 * If it's Jev's turn, asks Jev for a move and plays it. Retries once if Jev fails, times out or picks
 * an illegal move, then plays a random legal move (recorded in the move's meta) so the game can go on.
 */
export async function playJevReply(game: Game, jev: Opponent | undefined): Promise<Game> {
  if (game.status !== 'active') return game;
  const chess = replay(game);
  // Without a Jev on this server the game waits; the result text says why.
  if (seat(game, chess.turn()) !== 'jev' || !jev) return game;

  const legalMoves = chess.moves();
  const position = { fen: chess.fen(), moves: moveText(chess.pgn()), legalMoves };
  let lastError = 'no legal move returned';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { move, meta } = await jev.chooseMove(position);
      if (legalMoves.includes(move)) return applyMove(game, move, 'jev', meta);
      lastError = `illegal move ${move}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  console.error(`Jev failed (${lastError}); playing a random legal move`);
  const random = legalMoves[Math.floor(Math.random() * legalMoves.length)]!;
  return applyMove(game, random, 'jev', { fallback: `random move, Jev failed: ${lastError}` });
}

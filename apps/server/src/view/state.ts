import type { GameState } from '@chess-mcp/shared';
import { replay, seat, type Game } from '../chess/game.ts';

/** The game as clients see it: the position, the moves, whose turn it is and the settings. */
export function toState(game: Game): GameState {
  const chess = replay(game);
  chess.setHeader('White', game.white);
  chess.setHeader('Black', game.black);
  if (game.result) chess.setHeader('Result', game.result);

  const last = game.moves.at(-1);
  return {
    gameId: game.id,
    fen: chess.fen(),
    pgn: chess.pgn(),
    moves: game.moves.map((m) => m.san),
    ply: game.moves.length,
    turn: chess.turn(),
    toMove: game.status === 'finished' ? null : seat(game, chess.turn()),
    white: game.white,
    black: game.black,
    status: game.status,
    result: game.result,
    termination: game.termination,
    inCheck: chess.inCheck(),
    drawOffer: game.drawOffer,
    lastMove: last && {
      san: last.san,
      from: last.uci.slice(0, 2),
      to: last.uci.slice(2, 4),
      by: last.by,
      ...(last.by === 'jev' && {
        jev: { topMoves: last.meta?.probabilities ?? {}, fallback: last.meta?.fallback },
      }),
    },
    orientation: game.black === 'human' && game.white !== 'human' ? 'b' : 'w',
    coachingMode: game.coachingMode ?? 'play@1',
    opponentLevel: game.opponentLevel ?? 'best',
  };
}

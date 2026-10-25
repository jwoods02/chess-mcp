import { Chess, type Move } from 'chess.js';
import { experimental_decide as decide, type Experimental_DecisionModel } from 'ai';
import type { Opponent } from './opponent.ts';

// Jev answers in about 0.1-0.3s. Fail fast so the caller's single retry and random-move fallback
// still finish well inside the board's wait for a reply.
const TIMEOUT_MS = 2500;

const PIECES: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

/**
 * Jev, TypeSafe AI's decision model, called through the AI SDK. It isn't an LLM: it answers one
 * multiple-choice question whose options are every legal move, and returns a probability for each.
 */
export function createJev(model: Experimental_DecisionModel): Opponent {
  return {
    async chooseMove({ fen, moves, legalMoves }) {
      const chess = new Chess(fen);
      const side = chess.turn() === 'w' ? 'White' : 'Black';
      const options = chess.moves({ verbose: true }).filter((m) => legalMoves.includes(m.san));
      const started = Date.now();

      const result = await decide({
        model,
        state: {
          fen,
          sideToMove: side,
          movesSoFar: moves || '(none, this is the first move)',
          board: chess.ascii(),
        },
        questions: {
          move: {
            type: 'choice',
            instructions: `Pick the strongest move for ${side} in this chess position.`,
            criteria: Object.fromEntries(options.map((m) => [m.san, describeMove(m)])),
          },
        },
        maxRetries: 0, // the caller retries once, then falls back
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      });

      // Take the most probable legal move ourselves rather than trusting `choice` alone: with many
      // near-equal options, rounded probabilities can tie.
      const probabilities: Record<string, number> = result.answers.move.probabilities ?? {};
      const move = legalMoves.reduce(
        (best, san) => ((probabilities[san] ?? 0) > (probabilities[best] ?? 0) ? san : best),
        legalMoves.includes(result.answers.move.choice)
          ? result.answers.move.choice
          : legalMoves[0]!,
      );
      return {
        move,
        meta: { probabilities: topMoves(probabilities, 5), latencyMs: Date.now() - started },
      };
    },
  };
}

/** "Knight g1→f3, captures pawn, check": what the move does, so Jev has more to go on than SAN. */
function describeMove(move: Move): string {
  const piece = PIECES[move.piece]!;
  const parts = [`${piece[0]!.toUpperCase()}${piece.slice(1)} ${move.from}→${move.to}`];
  if (move.captured) parts.push(`captures ${PIECES[move.captured]}`);
  if (move.promotion) parts.push(`promotes to ${PIECES[move.promotion]}`);
  if (move.isKingsideCastle() || move.isQueensideCastle()) parts.push('castles');
  if (move.san.endsWith('#')) parts.push('checkmate');
  else if (move.san.endsWith('+')) parts.push('check');
  return parts.join(', ');
}

function topMoves(probabilities: Record<string, number>, count: number): Record<string, number> {
  return Object.fromEntries(
    Object.entries(probabilities)
      .sort(([, a], [, b]) => b - a)
      .slice(0, count)
      .map(([san, p]) => [san, Math.round(p * 100) / 100]),
  );
}

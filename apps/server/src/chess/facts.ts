import type { MoveFacts } from '@chess-mcp/shared';
import { Chess, type Square } from 'chess.js';
import { replay, type Game } from './game.ts';

// Pawns. The king's value only matters for picking the cheapest capturer, and it captures last.
const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const NAME: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

/** Facts about the human's move this round: their latest move, if it's one of the last two plies. */
export function humanMoveFacts(game: Game): MoveFacts | undefined {
  const index = game.moves.findLastIndex((m) => m.by === 'human');
  if (index < 0 || index < game.moves.length - 2) return undefined;
  return moveFacts(game, index);
}

/**
 * What the move at `index` captured, what it leaves hanging, and what it missed, judged right after
 * the move. If the opponent has replied since, the reply is included, because it may not have taken
 * what was hanging.
 */
export function moveFacts(game: Game, index: number): MoveFacts {
  const chess = replay({ ...game, moves: game.moves.slice(0, index) });
  const mover = chess.turn();
  const matesBefore = mates(chess);
  const best = bestCapture(chess);

  const played = chess.move(game.moves[index]!.san);
  const capturedValue = played.captured ? VALUE[played.captured]! : 0;
  // What the move itself wins: its capture, minus what the opponent then wins back on that square.
  const playedGain = capturedValue - exchangeGain(chess, played.to);
  const hanging = hangingPieces(chess, mover);
  const worst = Math.max(0, ...hanging.map((h) => h.loses));

  return {
    move: played.san,
    ...(played.captured && { captured: NAME[played.captured] }),
    hanging,
    loses: Math.max(0, worst - capturedValue),
    allowsMate: mates(chess),
    missedMate: played.san.endsWith('#') ? [] : matesBefore,
    ...(best && best.wins >= 2 && best.wins > playedGain && { missedWin: best }),
    material: material(chess),
    ...(game.moves[index + 1] && { reply: game.moves[index + 1]!.san }),
  };
}

/**
 * What the side to move wins by capturing on `square`, if both sides keep recapturing with their
 * cheapest piece and stop when it no longer pays (a static exchange). Only legal moves count, so a
 * pinned piece can't capture.
 */
function exchangeGain(chess: Chess, square: Square): number {
  const captures = chess
    .moves({ verbose: true })
    .filter((m) => m.to === square && m.captured && !m.isEnPassant());
  if (captures.length === 0) return 0;
  const cheapest = captures.reduce((a, b) => (VALUE[b.piece]! < VALUE[a.piece]! ? b : a));
  chess.move(cheapest);
  const gain = VALUE[cheapest.captured!]! - exchangeGain(chess, square);
  chess.undo();
  return Math.max(0, gain);
}

/** Pieces of `color` (not on the move) that the side to move can win. */
function hangingPieces(chess: Chess, color: string): MoveFacts['hanging'] {
  const hanging: MoveFacts['hanging'] = [];
  for (const piece of chess.board().flat()) {
    if (!piece || piece.color !== color || piece.type === 'k') continue;
    const loses = exchangeGain(chess, piece.square);
    if (loses > 0) hanging.push({ piece: NAME[piece.type]!, square: piece.square, loses });
  }
  return hanging.sort((a, b) => b.loses - a.loses);
}

/** The capture that wins the most material for the side to move, if any wins something. */
function bestCapture(chess: Chess): { move: string; wins: number } | undefined {
  let best: { move: string; wins: number } | undefined;
  for (const m of chess.moves({ verbose: true })) {
    if (!m.captured) continue;
    chess.move(m);
    const wins = VALUE[m.captured]! - exchangeGain(chess, m.to);
    chess.undo();
    if (wins > 0 && (!best || wins > best.wins)) best = { move: m.san, wins };
  }
  return best;
}

function mates(chess: Chess): string[] {
  return chess.moves().filter((san) => san.endsWith('#'));
}

/** White minus Black, in pawns. */
function material(chess: Chess): number {
  let total = 0;
  for (const piece of chess.board().flat()) {
    if (!piece || piece.type === 'k') continue;
    total += piece.color === 'w' ? VALUE[piece.type]! : -VALUE[piece.type]!;
  }
  return total;
}

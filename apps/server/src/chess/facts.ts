import type { MoveFacts, PositionFacts } from '@chess-mcp/shared';
import { Chess, type Square } from 'chess.js';
import { ending, replay, type Game } from './game.ts';
import { colorName, PIECE_NAMES } from './names.ts';

// Pawns. The king's value only matters for picking the cheapest capturer, and it captures last.
const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
/** Facts about the human's move this round: their latest move, if it's one of the last two plies. */
export function humanMoveFacts(game: Game): MoveFacts | undefined {
  const index = game.moves.findLastIndex((m) => m.by === 'human');
  if (index < 0 || index < game.moves.length - 2) return undefined;
  return moveFacts(game, index);
}

/**
 * What the move at `index` captured, what it leaves hanging, and what it missed, judged right after
 * the move. If the opponent has replied since, the reply is included, because it may not have taken
 * what was hanging, and the material balance is the one after it.
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
  const allowsMate = mates(chess);
  const reply = game.moves[index + 1]?.san;
  if (reply) chess.move(reply);

  return {
    move: played.san,
    ...(played.captured && { captured: PIECE_NAMES[played.captured] }),
    // A capturing piece that can be taken back for no more than it took is a trade, not hanging.
    hanging: hanging.filter((h) => h.square !== played.to || h.loses > capturedValue),
    loses: Math.max(0, worst - capturedValue),
    allowsMate,
    missedMate: played.san.endsWith('#') ? [] : matesBefore,
    ...(best && best.wins >= 2 && best.wins > playedGain && { missedWin: best }),
    material: materialText(material(chess)),
    ...(reply && { reply }),
  };
}

/**
 * What the side to move can do now: mates in one, its best capture, and its pieces under attack. In a
 * checkmate or a draw there's nothing to find, so it says how the game ended instead.
 */
export function positionFacts(game: Game): PositionFacts {
  const chess = replay(game);
  const side = chess.turn();
  const toMove = colorName(side) as PositionFacts['toMove'];
  const over = ending(chess);
  if (over) {
    return {
      toMove,
      inCheck: chess.inCheck(),
      over: over.termination,
      mateInOne: [],
      underAttack: [],
    };
  }
  const best = bestCapture(chess);
  return {
    toMove,
    inCheck: chess.inCheck(),
    mateInOne: mates(chess),
    ...(best && { bestCapture: best }),
    // In check there's no passing the move to ask what the opponent could take.
    underAttack: chess.inCheck() ? [] : hangingPieces(passTurn(chess), side),
  };
}

/** The same position with the other side to move, to ask what it could take. */
function passTurn(chess: Chess): Chess {
  const fields = chess.fen().split(' ');
  fields[1] = fields[1] === 'w' ? 'b' : 'w';
  fields[3] = '-';
  return new Chess(fields.join(' '), { skipValidation: true });
}

/**
 * What the side to move wins by capturing on `square`, if both sides keep recapturing with their
 * cheapest piece and stop when it no longer pays (a static exchange). Only legal moves count, so a
 * pinned piece can't capture.
 */
function exchangeGain(chess: Chess, square: Square): number {
  const options = captures(chess).filter((c) => c.to === square);
  if (options.length === 0) return 0;
  const cheapest = options.reduce((a, b) => (VALUE[b.piece]! < VALUE[a.piece]! ? b : a));
  chess.move(cheapest.san);
  const gain = VALUE[cheapest.captured]! - exchangeGain(chess, square);
  chess.undo();
  return Math.max(0, gain);
}

/** Pieces of `color` (not on the move) that the side to move can win. */
function hangingPieces(chess: Chess, color: string): MoveFacts['hanging'] {
  // Working out an exchange is slow, so only try the squares the side to move can capture on.
  const attacked = new Set(captures(chess).map((c) => c.to));
  const hanging: MoveFacts['hanging'] = [];
  for (const piece of chess.board().flat()) {
    if (!piece || piece.color !== color || piece.type === 'k' || !attacked.has(piece.square)) {
      continue;
    }
    const loses = exchangeGain(chess, piece.square);
    if (loses > 0) hanging.push({ piece: PIECE_NAMES[piece.type]!, square: piece.square, loses });
  }
  return hanging.sort((a, b) => b.loses - a.loses);
}

/** The capture that wins the most material for the side to move, if any wins something. */
function bestCapture(chess: Chess): { move: string; wins: number } | undefined {
  let best: { move: string; wins: number } | undefined;
  for (const c of captures(chess)) {
    chess.move(c.san);
    const wins = VALUE[c.captured]! - exchangeGain(chess, c.to);
    chess.undo();
    if (wins > 0 && (!best || wins > best.wins)) best = { move: c.san, wins };
  }
  return best;
}

/**
 * The side to move's captures, read from SAN because chess.js builds verbose moves about ten times
 * slower. En passant is left out: the pawn it takes isn't on the square it moves to.
 */
function captures(chess: Chess): { san: string; to: Square; piece: string; captured: string }[] {
  const found = [];
  for (const san of chess.moves()) {
    const to = /x([a-h][1-8])/.exec(san)?.[1] as Square | undefined;
    const target = to && chess.get(to);
    if (!to || !target) continue;
    const piece = /^[NBRQK]/.test(san) ? san[0]!.toLowerCase() : 'p';
    found.push({ san, to, piece, captured: target.type });
  }
  return found;
}

function mates(chess: Chess): string[] {
  return chess.moves().filter((san) => san.endsWith('#'));
}

/** "White is up 3 points", "Black is up 1 point" or "level". */
function materialText(balance: number): string {
  if (balance === 0) return 'level';
  const points = Math.abs(balance);
  return `${balance > 0 ? 'White' : 'Black'} is up ${points} ${points === 1 ? 'point' : 'points'}`;
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

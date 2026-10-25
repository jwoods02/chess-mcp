import type { Color, GameView, Player, Result, Termination } from '@chess-mcp/shared';
import { Chess, DEFAULT_POSITION, validateFen, type Square } from 'chess.js';

export interface Game {
  id: string;
  white: Player;
  black: Player;
  startFen: string;
  moves: Move[];
  status: 'active' | 'finished';
  result?: Result;
  termination?: Termination;
  drawOffer?: Color;
  createdAt: string;
  updatedAt: string;
}

export interface Move {
  san: string;
  uci: string;
  by: Player;
}

export type ErrorCode =
  | 'game_not_found'
  | 'game_over'
  | 'illegal_move'
  | 'not_your_turn'
  | 'stale_state'
  | 'invalid_fen'
  | 'invalid_undo'
  | 'invalid_draw_action';

export class ChessError extends Error {
  code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function createGame(input: { white: Player; black: Player; startFen?: string }): Game {
  const startFen = input.startFen?.trim() || DEFAULT_POSITION;
  const check = validateFen(startFen);
  if (!check.ok) throw new ChessError('invalid_fen', check.error ?? 'Invalid FEN');

  const now = new Date().toISOString();
  const game: Game = {
    id: crypto.randomUUID(),
    white: input.white,
    black: input.black,
    startFen,
    moves: [],
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  // A custom start position might already be checkmate or stalemate.
  return withStatus(game, replay(game));
}

/** Rebuilds the position by replaying every move. The only way chess.js can detect repetition. */
export function replay(game: Game): Chess {
  const chess = new Chess(game.startFen);
  for (const move of game.moves) chess.move(parseUci(move.uci)!);
  return chess;
}

/**
 * Plays `input` (SAN, UCI or a loose form like "nf3" / "0-0") for the side to move, which must be
 * controlled by `by`.
 */
export function applyMove(game: Game, input: string, by: Player): Game {
  assertActive(game);
  const chess = replay(game);
  const mover = chess.turn();
  if (seat(game, mover) !== by) {
    const side = colorName(mover);
    throw new ChessError(
      'not_your_turn',
      `It's ${side}'s move, and ${side} is played by the ${playerName(seat(game, mover))}.`,
    );
  }
  const played = tryMove(chess, input.trim());
  if (!played) {
    throw new ChessError('illegal_move', illegalMoveMessage(chess, input.trim()));
  }

  const move: Move = { san: played.san, uci: played.lan, by };
  // A move by the side a draw was offered to declines the offer.
  const drawOffer = game.drawOffer === mover ? game.drawOffer : undefined;
  return withStatus({ ...game, moves: [...game.moves, move], drawOffer }, chess);
}

/** Takes back up to `plies` half-moves (fewer if the game is shorter). Reopens a finished game. */
export function undo(game: Game, plies: number): Game {
  const count = Math.min(plies, game.moves.length);
  if (count < 1) throw new ChessError('invalid_undo', 'There are no moves to take back.');

  const reverted: Game = {
    ...game,
    moves: game.moves.slice(0, game.moves.length - count),
    status: 'active',
    result: undefined,
    termination: undefined,
    drawOffer: undefined,
  };
  return withStatus(reverted, replay(reverted));
}

export function resign(game: Game, color: Color): Game {
  assertActive(game);
  return finish(game, color === 'w' ? '0-1' : '1-0', 'resignation');
}

export function draw(game: Game, action: 'offer' | 'accept' | 'decline', color: Color): Game {
  assertActive(game);
  const side = colorName(color);

  if (action === 'offer') {
    if (game.drawOffer === color) {
      throw new ChessError('invalid_draw_action', `${side} has already offered a draw.`);
    }
    // Offering while the opponent's offer is pending is the same as accepting it.
    if (game.drawOffer) return finish(game, '1/2-1/2', 'draw_agreed');
    return touch({ ...game, drawOffer: color });
  }

  if (!game.drawOffer) {
    throw new ChessError('invalid_draw_action', 'There is no draw offer to respond to.');
  }
  if (game.drawOffer === color) {
    throw new ChessError('invalid_draw_action', `${side} cannot respond to their own draw offer.`);
  }
  if (action === 'accept') return finish(game, '1/2-1/2', 'draw_agreed');
  return touch({ ...game, drawOffer: undefined });
}

export function legalMoves(game: Game, square?: string): string[] {
  if (game.status === 'finished') return [];
  const chess = replay(game);
  if (!square) return chess.moves();
  return chess.moves({ square: square.toLowerCase() as Square });
}

export function toView(game: Game): GameView {
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
    },
    orientation: game.black === 'human' && game.white !== 'human' ? 'b' : 'w',
  };
}

export function seat(game: Game, color: Color): Player {
  return color === 'w' ? game.white : game.black;
}

export function colorName(color: Color): string {
  return color === 'w' ? 'White' : 'Black';
}

export function playerName(player: Player): string {
  return player === 'llm' ? 'assistant' : 'human';
}

// --- helpers ---

function assertActive(game: Game) {
  if (game.status === 'finished') {
    throw new ChessError('game_over', `The game is over (${game.result}, ${game.termination}).`);
  }
}

function touch(game: Game): Game {
  return { ...game, updatedAt: new Date().toISOString() };
}

function finish(game: Game, result: Result, termination: Termination): Game {
  return touch({ ...game, status: 'finished', result, termination, drawOffer: undefined });
}

/** Ends the game if the position on the board is checkmate or a draw. */
function withStatus(game: Game, chess: Chess): Game {
  if (chess.isCheckmate()) return finish(game, chess.turn() === 'w' ? '0-1' : '1-0', 'checkmate');
  if (chess.isStalemate()) return finish(game, '1/2-1/2', 'stalemate');
  if (chess.isInsufficientMaterial()) return finish(game, '1/2-1/2', 'insufficient_material');
  if (chess.isThreefoldRepetition()) return finish(game, '1/2-1/2', 'threefold_repetition');
  if (chess.isDrawByFiftyMoves()) return finish(game, '1/2-1/2', 'fifty_move');
  return touch(game);
}

function parseUci(input: string) {
  const m = /^([a-h][1-8])-?([a-h][1-8])([qrbn])?$/i.exec(input);
  if (!m) return undefined;
  return { from: m[1]!.toLowerCase(), to: m[2]!.toLowerCase(), promotion: m[3]?.toLowerCase() };
}

/** Tries the input as UCI, then as SAN with a few forgiving rewrites. Returns undefined if illegal. */
function tryMove(chess: Chess, input: string) {
  const uci = parseUci(input);
  const candidates = uci
    ? [uci]
    : [
        input,
        input.replace(/0/g, 'O').replace(/o/g, 'O'), // 0-0, o-o → O-O
        input.charAt(0).toUpperCase() + input.slice(1), // nf3 → Nf3
      ];
  for (const candidate of candidates) {
    try {
      return chess.move(candidate);
    } catch {
      // try the next form
    }
  }
  return undefined;
}

function illegalMoveMessage(chess: Chess, input: string): string {
  const legal = chess.moves();
  const uci = parseUci(input);
  const needsPromotion = chess
    .moves({ verbose: true })
    .some(
      (m) =>
        m.promotion && (uci ? m.from === uci.from && m.to === uci.to : m.san.startsWith(input)),
    );
  if (needsPromotion) {
    return `"${input}" promotes a pawn: say which piece, e.g. "${uci ? `${uci.from}${uci.to}q` : `${input}=Q`}".`;
  }
  return `"${input}" is not a legal move for ${colorName(chess.turn())}. Legal moves: ${legal.join(', ')}.`;
}

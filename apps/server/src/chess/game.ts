import type { Color, KeyMoment, Level, Player, Result, Termination } from '@chess-mcp/shared';
import { Chess, DEFAULT_POSITION, validateFen, type Square } from 'chess.js';
import { colorName, playerName } from './names.ts';
import { illegalMoveMessage, parseUci, tryMove } from './notation.ts';

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
  /** e.g. 'blunder_check@1'. Games from before coaching existed play as 'play@1'. */
  coachingMode?: string;
  /** How strongly the non-human side plays. Defaults to 'best'. */
  opponentLevel?: Level;
  /** The human's moves worth reviewing, worked out once when the game ends: it analyses every move. */
  keyMoments?: KeyMoment[];
  createdAt: string;
  updatedAt: string;
}

export interface Move {
  san: string;
  uci: string;
  by: Player;
  meta?: MoveMeta;
}

/** Extra detail recorded with an engine's move. */
export interface MoveMeta {
  /** Jev's most likely moves, SAN → probability. */
  probabilities?: Record<string, number>;
  /** Set when Jev failed and a random legal move was played instead. */
  fallback?: string;
  latencyMs?: number;
}

export type ErrorCode =
  | 'game_not_found'
  | 'game_over'
  | 'illegal_move'
  | 'not_your_turn'
  | 'stale_state'
  | 'invalid_fen'
  | 'invalid_players'
  | 'wrong_tool'
  | 'invalid_undo'
  | 'invalid_draw_action';

export class ChessError extends Error {
  code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function createGame(input: {
  white: Player;
  black: Player;
  startFen?: string;
  coachingMode?: string;
  opponentLevel?: Level;
}): Game {
  const startFen = input.startFen?.trim() || DEFAULT_POSITION;
  const check = validateFen(startFen);
  if (!check.ok) throw new ChessError('invalid_fen', check.error ?? 'Invalid FEN');
  // Jev only replies to moves made by someone else, so a Jev-vs-Jev game would never progress.
  if (input.white === 'jev' && input.black === 'jev') {
    throw new ChessError('invalid_players', 'Jev can only play one side of a game.');
  }

  const now = new Date().toISOString();
  const game: Game = {
    id: crypto.randomUUID(),
    white: input.white,
    black: input.black,
    startFen,
    moves: [],
    status: 'active',
    coachingMode: input.coachingMode,
    opponentLevel: input.opponentLevel,
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
export function applyMove(game: Game, input: string, by: Player, meta?: MoveMeta): Game {
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

  const move: Move = { san: played.san, uci: played.lan, by, ...(meta && { meta }) };
  // A move by the side a draw was offered to declines the offer.
  const drawOffer = game.drawOffer === mover ? game.drawOffer : undefined;
  return withStatus({ ...game, moves: [...game.moves, move], drawOffer }, chess);
}

/**
 * A scratch copy of the game with `moves` played for whoever is to move, for looking ahead. The stored
 * game doesn't change, and seats aren't checked. Throws `illegal_move` like applyMove.
 */
export function previewLine(game: Game, moves: string[]): Game {
  const chess = replay(game);
  const played: Move[] = [];
  for (const input of moves) {
    const mover = chess.turn();
    const move = tryMove(chess, input.trim());
    if (!move) throw new ChessError('illegal_move', illegalMoveMessage(chess, input.trim()));
    played.push({ san: move.san, uci: move.lan, by: seat(game, mover) });
  }
  return { ...game, moves: [...game.moves, ...played] };
}

/**
 * Takes back up to `plies` half-moves (fewer if the game is shorter). Reopens a finished game.
 * Against Jev it stops on the other player's turn, since stopping on Jev's would only make Jev move
 * again: one ply short, or one further when taking back a single ply.
 */
export function undo(game: Game, plies: number): Game {
  let count = Math.min(plies, game.moves.length);
  if (count < 1) throw new ChessError('invalid_undo', 'There are no moves to take back.');
  if (seat(game, turnAfterUndo(game, count)) === 'jev') {
    count = count > 1 ? count - 1 : Math.min(2, game.moves.length);
  }

  const reverted: Game = {
    ...game,
    moves: game.moves.slice(0, game.moves.length - count),
    status: 'active',
    result: undefined,
    termination: undefined,
    drawOffer: undefined,
    keyMoments: undefined,
  };
  return withStatus(reverted, replay(reverted));
}

export function resign(game: Game, color: Color): Game {
  assertActive(game);
  assertNotJev(game, color);
  return finish(game, color === 'w' ? '0-1' : '1-0', 'resignation');
}

export function draw(game: Game, action: 'offer' | 'accept' | 'decline', color: Color): Game {
  assertActive(game);
  assertNotJev(game, color);
  const side = colorName(color);

  if (action === 'offer') {
    if (seat(game, color === 'w' ? 'b' : 'w') === 'jev') {
      throw new ChessError('invalid_draw_action', "Jev doesn't accept draws: play on or resign.");
    }
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

/** Changes how the game is coached or how strongly the opponent plays. Allowed after the game too. */
export function updateSettings(
  game: Game,
  settings: { coachingMode?: string; opponentLevel?: Level },
): Game {
  return touch({
    ...game,
    coachingMode: settings.coachingMode ?? game.coachingMode,
    opponentLevel: settings.opponentLevel ?? game.opponentLevel,
  });
}

export function legalMoves(game: Game, square?: string): string[] {
  if (game.status === 'finished') return [];
  const chess = replay(game);
  if (!square) return chess.moves();
  return chess.moves({ square: square.toLowerCase() as Square });
}

/** Games against Jev use `play_against_jev` for the human's moves, so Jev's reply is shown. */
export function hasJev(game: Pick<Game, 'white' | 'black'>): boolean {
  return game.white === 'jev' || game.black === 'jev';
}

/** How the game ends in this position, if it's checkmate or a draw. Needs the history for repetition. */
export function ending(chess: Chess): { result: Result; termination: Termination } | undefined {
  if (chess.isCheckmate()) {
    return { result: chess.turn() === 'w' ? '0-1' : '1-0', termination: 'checkmate' };
  }
  if (chess.isStalemate()) return { result: '1/2-1/2', termination: 'stalemate' };
  if (chess.isInsufficientMaterial()) {
    return { result: '1/2-1/2', termination: 'insufficient_material' };
  }
  if (chess.isThreefoldRepetition()) {
    return { result: '1/2-1/2', termination: 'threefold_repetition' };
  }
  if (chess.isDrawByFiftyMoves()) return { result: '1/2-1/2', termination: 'fifty_move' };
  return undefined;
}

export function seat(game: Game, color: Color): Player {
  return color === 'w' ? game.white : game.black;
}

// --- helpers ---

function assertActive(game: Game) {
  if (game.status === 'finished') {
    throw new ChessError('game_over', `The game is over (${game.result}, ${game.termination}).`);
  }
}

/** Jev plays its own side, so nobody resigns or answers draw offers for it. */
function assertNotJev(game: Game, color: Color) {
  if (seat(game, color) === 'jev') {
    throw new ChessError(
      'invalid_players',
      `${colorName(color)} is played by Jev, which decides for itself.`,
    );
  }
}

/** The side to move once `count` plies are taken back. */
function turnAfterUndo(game: Game, count: number): Color {
  const startTurn = game.startFen.split(' ')[1] as Color;
  const remaining = game.moves.length - count;
  return remaining % 2 === 0 ? startTurn : startTurn === 'w' ? 'b' : 'w';
}

function touch(game: Game): Game {
  return { ...game, updatedAt: new Date().toISOString() };
}

function finish(game: Game, result: Result, termination: Termination): Game {
  return touch({ ...game, status: 'finished', result, termination, drawOffer: undefined });
}

/** Ends the game if the position on the board is checkmate or a draw. */
function withStatus(game: Game, chess: Chess): Game {
  const over = ending(chess);
  return over ? finish(game, over.result, over.termination) : touch(game);
}

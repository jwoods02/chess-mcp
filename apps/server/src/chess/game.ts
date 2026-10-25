import type { Color, GameState, Player, Result, Termination } from '@chess-mcp/shared';
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

export function createGame(input: { white: Player; black: Player; startFen?: string }): Game {
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

export function legalMoves(game: Game, square?: string): string[] {
  if (game.status === 'finished') return [];
  const chess = replay(game);
  if (!square) return chess.moves();
  return chess.moves({ square: square.toLowerCase() as Square });
}

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
  };
}

/** Games against Jev use `play_against_jev` for the human's moves, so Jev's reply is shown. */
export function hasJev(game: Pick<Game, 'white' | 'black'>): boolean {
  return game.white === 'jev' || game.black === 'jev';
}

/** The numbered moves from a PGN, e.g. "1. e4 e5 2. Nf3", without headers or the result. */
export function moveText(pgn: string): string {
  return pgn
    .replace(/^\[.*\]$/gm, '')
    .trim()
    .replace(/\s*(\*|1-0|0-1|1\/2-1\/2)$/, '');
}

export function seat(game: Game, color: Color): Player {
  return color === 'w' ? game.white : game.black;
}

export function colorName(color: Color): string {
  return color === 'w' ? 'White' : 'Black';
}

export function playerName(player: Player): string {
  return { human: 'human', llm: 'assistant', jev: 'Jev' }[player];
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
        // nf3 → Nf3, but bxc3 is a pawn capture: never turn it into a bishop move.
        ...(input.startsWith('bx') ? [] : [input.charAt(0).toUpperCase() + input.slice(1)]),
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

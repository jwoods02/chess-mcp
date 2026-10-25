// Plain chess helpers for the board. The server stays the source of truth: these only preview moves
// and replay the game's history for display.
import type { GameView, Player } from '@chess-mcp/shared';
import { Chess } from 'chess.js';
import { fenStringToPositionObject, type PositionDataType } from 'react-chessboard';

/** A position to show, and the move that led to it. */
export interface Shown {
  fen: string;
  lastMove?: { from: string; to: string };
}

/** A position in the game's history, with its label for the move list: "12. Nf3" or "Start". */
export interface Step extends Shown {
  label: string;
}

export interface LocalMove {
  uci: string;
  san: string;
  fen: string;
}

/** The position after each ply, from the game's PGN. Index 0 is the start. */
export function positions(pgn: string): Step[] {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const moves = chess.history({ verbose: true });
  const start = moves[0]?.before ?? chess.fen();
  const after = moves.map((m) => ({
    fen: m.after,
    lastMove: { from: m.from, to: m.to },
    // The move number is the sixth field of the FEN before the move.
    label: `${m.before.split(' ')[5]}${m.color === 'w' ? '.' : '...'} ${m.san}`,
  }));
  return [{ fen: start, label: 'Start' }, ...after];
}

/**
 * Checks a drop against the rules, so illegal drags snap back at once and chat messages can use SAN.
 * The server still validates every move.
 */
export function tryLocalMove(fen: string, from: string, to: string, promotion?: string) {
  try {
    const played = new Chess(fen).move({ from, to, promotion });
    return { uci: played.lan, san: played.san, fen: played.after } satisfies LocalMove;
  } catch {
    return undefined;
  }
}

/** The board with one piece moved, before we know what it promotes to. */
export function movePiece(fen: string, from: string, to: string): PositionDataType {
  const position = fenStringToPositionObject(fen, 8, 8);
  const piece = position[from];
  if (!piece) return position;
  const next = { ...position, [to]: piece };
  delete next[from];
  return next;
}

/** The square of the king in check, if the side to move is in check. */
export function checkedKing(fen: string): string | undefined {
  const chess = new Chess(fen);
  if (!chess.inCheck()) return undefined;
  return chess.findPiece({ type: 'k', color: chess.turn() })[0];
}

/**
 * Whether the human can take back their last move: on their turn or after the game, once they've
 * moved. Before that, the only move to take back is the opponent's first, which it would just play
 * again. Two plies always include one of the human's, since they hold one of the colours.
 */
export function canTakeBack(view: GameView): boolean {
  const human = view.white === 'human' || view.black === 'human';
  const humanMoved = view.ply >= 2 || view.lastMove?.by === 'human';
  return human && humanMoved && (view.toMove === 'human' || view.status === 'finished');
}

export function playersText(view: GameView): string {
  const name = (player: Player) => ({ human: 'You', llm: 'Assistant', jev: 'Jev' })[player];
  const level = view.opponentLevel === 'best' ? '' : ` · ${view.opponentLevel}`;
  return `${name(view.white)} (White) vs ${name(view.black)} (Black)${level}`;
}

export function statusText(view: GameView): string {
  if (view.status === 'finished') {
    return `Game over: ${view.result} (${view.termination?.replace(/_/g, ' ')})`;
  }
  const check = view.inCheck ? 'Check. ' : '';
  if (view.toMove === 'human') return `${check}Your move.`;
  if (view.toMove === 'llm') return `${check}The assistant's move.`;
  return `${check}Jev's move.`;
}

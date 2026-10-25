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

export interface LocalMove {
  uci: string;
  san: string;
  fen: string;
}

/** The position after each ply, from the game's PGN. Index 0 is the start. */
export function positions(pgn: string): Shown[] {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const moves = chess.history({ verbose: true });
  const start = moves[0]?.before ?? chess.fen();
  const after = moves.map((m) => ({ fen: m.after, lastMove: { from: m.from, to: m.to } }));
  return [{ fen: start }, ...after];
}

/** "12. Nf3" or "12... Nc6" for the move that led to the position at `ply`. */
export function moveLabel(history: Shown[], ply: number): string {
  if (ply === 0) return 'Start';
  const chess = new Chess(history[ply - 1]!.fen);
  const number = chess.moveNumber();
  const move = chess.move(history[ply]!.lastMove!);
  return `${number}${move.color === 'w' ? '.' : '...'} ${move.san}`;
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

import type { Color, Player } from '@chess-mcp/shared';

// How sides, players and pieces are named in text for the model.

export function colorName(color: Color): string {
  return color === 'w' ? 'White' : 'Black';
}

export function playerName(player: Player): string {
  return { human: 'human', llm: 'assistant', jev: 'Jev' }[player];
}

export const PIECE_NAMES: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

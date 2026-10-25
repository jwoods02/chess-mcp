import type { MoveFacts } from '@chess-mcp/shared';
import { expect, test } from 'vitest';
import { blunderCheck } from './modes/blunder-check.ts';

const facts: MoveFacts = {
  move: 'Bc4',
  hanging: [{ piece: 'bishop', square: 'c4', loses: 3 }],
  loses: 3,
  allowsMate: [],
  missedMate: [],
  material: 0,
};

test('blunder check speaks when a move loses a piece, saying whether the reply took it', () => {
  expect(blunderCheck.speak(facts)).toBe('Bc4 loses material (3): the bishop on c4 can be won.');
  expect(blunderCheck.speak({ ...facts, reply: 'dxc4' })).toBe(
    'Bc4 loses material (3): the bishop on c4 can be won.',
  );
  expect(blunderCheck.speak({ ...facts, reply: 'dxe4' })).toContain(
    "The reply dxe4 didn't take advantage of it, so it may still be there.",
  );
});

test('blunder check stays quiet about losing a pawn', () => {
  const pawn = { piece: 'pawn', square: 'e4', loses: 1 };
  expect(blunderCheck.speak({ ...facts, hanging: [pawn], loses: 1 })).toBeUndefined();
});

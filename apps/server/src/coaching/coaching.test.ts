import type { MoveFacts } from '@chess-mcp/shared';
import { expect, test } from 'vitest';
import { blunderCheck } from './modes/blunder-check.ts';

const facts: MoveFacts = {
  move: 'Bc4',
  hanging: [{ piece: 'bishop', square: 'c4', loses: 3 }],
  loses: 3,
  allowsMate: [],
  missedMate: [],
  material: 'level',
};

test('blunder check speaks when a move loses a piece, in step with the reply', () => {
  expect(blunderCheck.speak(facts)).toBe(
    'Bc4 loses 3 points of material: the bishop on c4 can be taken.',
  );
  expect(blunderCheck.speak({ ...facts, reply: 'dxc4' })).toBe(
    'Bc4 lost 3 points of material: the reply dxc4 took the bishop.',
  );
  expect(blunderCheck.speak({ ...facts, reply: 'dxe4' })).toBe(
    "Bc4 left the bishop on c4 hanging (3 points of material), but the reply dxe4 didn't take it, so it may still be there.",
  );
});

test('a missed mate after a capture credits the capture first', () => {
  const capture = { ...facts, move: 'Qxc4', captured: 'bishop', hanging: [], loses: 0 };
  expect(blunderCheck.speak({ ...capture, missedMate: ['Qd7#'] })).toBe(
    'Qxc4 won a bishop, but there was mate in one: Qd7#.',
  );
});

test('blunder check stays quiet about losing a pawn', () => {
  const pawn = { piece: 'pawn', square: 'e4', loses: 1 };
  expect(blunderCheck.speak({ ...facts, hanging: [pawn], loses: 1 })).toBeUndefined();
});

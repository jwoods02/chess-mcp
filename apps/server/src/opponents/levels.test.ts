import { expect, test } from 'vitest';
import { pickAtLevel } from './levels.ts';

const instinct = { e4: 0.6, d4: 0.2, Nf3: 0.1, c4: 0.05, g3: 0.04, b3: 0.01 };

test("at its best Jev plays its top move; lower levels draw from more of Jev's top moves", () => {
  expect(pickAtLevel(instinct, 'best', () => 0.99)).toBe('e4');
  expect(pickAtLevel(instinct, 'club', () => 0.99)).toBe('Nf3');
  expect(pickAtLevel(instinct, 'beginner', () => 0.99)).toBe('g3');
  expect(pickAtLevel(instinct, 'beginner', () => 0)).toBe('e4');
});

test('never picks a move Jev gave no chance, or one when there are none', () => {
  expect(pickAtLevel({ e4: 1, d4: 0 }, 'beginner', () => 0.99)).toBe('e4');
  expect(pickAtLevel({}, 'beginner')).toBeUndefined();
});

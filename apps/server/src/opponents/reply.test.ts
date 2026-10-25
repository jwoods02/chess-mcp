import { expect, test } from 'vitest';
import { applyMove, createGame } from '../chess/game.ts';
import type { Opponent } from './opponent.ts';
import { playJevReply } from './reply.ts';

const afterE4 = () => applyMove(createGame({ white: 'human', black: 'jev' }), 'e4', 'human');

test.each([
  ['fails', () => Promise.reject(new Error('Jev is down'))],
  ['answers with an illegal move', async () => ({ move: 'Ke7' })], // the king can't move yet
])('if Jev %s twice, a random legal move keeps the game going', async (_, chooseMove) => {
  let calls = 0;
  const jev: Opponent = { chooseMove: () => (calls++, chooseMove()) };
  const game = await playJevReply(afterE4(), jev);
  expect(calls).toBe(2);
  expect(game.moves[1]).toMatchObject({
    by: 'jev',
    meta: { fallback: expect.stringContaining('Jev failed') },
  });
});

test("records Jev's five likeliest moves with its move, rounded, to show its instinct", async () => {
  const probabilities = { e5: 0.301, d5: 0.2, c5: 0.15, Nf6: 0.15, e6: 0.1, c6: 0.099 };
  const jev: Opponent = { chooseMove: async () => ({ move: 'e5', probabilities, latencyMs: 120 }) };
  const game = await playJevReply(afterE4(), jev);
  expect(game.moves[1]!.san).toBe('e5');
  expect(game.moves[1]!.meta).toEqual({
    probabilities: { e5: 0.3, d5: 0.2, c5: 0.15, Nf6: 0.15, e6: 0.1 },
    latencyMs: 120,
  });
});

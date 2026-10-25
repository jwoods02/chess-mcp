import { Chess } from 'chess.js';
import { expect, test } from 'vitest';
import { createJev } from './jev.ts';
import { mockJevModel } from './mock-jev.ts';

test('offers every legal move, described, and plays the most likely one', async () => {
  let criteria: Record<string, unknown> = {};
  const jev = createJev(mockJevModel('Nf3', (c) => (criteria = c)));
  const chess = new Chess();

  const { move, meta } = await jev.chooseMove({
    fen: chess.fen(),
    moves: '',
    legalMoves: chess.moves(),
  });

  expect(move).toBe('Nf3');
  expect(Object.keys(criteria).sort()).toEqual(chess.moves().sort());
  expect(criteria.Nf3).toBe('Knight g1→f3');
  expect(meta?.probabilities).toEqual(expect.objectContaining({ Nf3: 1 }));
});

test('describes captures, checks and mates', async () => {
  let criteria: Record<string, unknown> = {};
  const jev = createJev(mockJevModel(undefined, (c) => (criteria = c)));
  const fen = 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2'; // after 1. f3 e5 2. g4

  await jev.chooseMove({ fen, moves: '1. f3 e5 2. g4', legalMoves: new Chess(fen).moves() });

  expect(criteria['Qh4#']).toBe('Queen d8→h4, checkmate');
});

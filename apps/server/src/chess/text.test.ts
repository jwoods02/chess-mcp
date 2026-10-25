import { expect, test } from 'vitest';
import { applyMove, createGame, toView } from './game.ts';
import { board, gameText } from './text.ts';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

test('draws the board from White', () => {
  expect(board(START, 'w')).toBe(
    [
      '8 │ r n b q k b n r',
      '7 │ p p p p p p p p',
      '6 │ . . . . . . . .',
      '5 │ . . . . . . . .',
      '4 │ . . . . . . . .',
      '3 │ . . . . . . . .',
      '2 │ P P P P P P P P',
      '1 │ R N B Q K B N R',
      '  └────────────────',
      '    a b c d e f g h',
    ].join('\n'),
  );
});

test('flips the board for Black', () => {
  const lines = board(START, 'b').split('\n');
  expect(lines[0]).toBe('1 │ R N B K Q B N R');
  expect(lines.at(-1)).toBe('    h g f e d c b a');
});

test('tells the model what to do next', () => {
  const game = applyMove(createGame({ white: 'human', black: 'llm' }), 'e4');
  const text = gameText(toView(game));
  expect(text).toContain('Moves: 1. e4');
  expect(text).toContain('Last move: e4 (human)');
  expect(text).toContain("It's your turn (you play Black): call make_move with ply 1.");
});

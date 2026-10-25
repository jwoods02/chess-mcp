import { expect, test } from 'vitest';
import { applyMove, createGame, toState } from './game.ts';
import { board, gameText, gameView } from './text.ts';

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
  const game = applyMove(createGame({ white: 'human', black: 'llm' }), 'e4', 'human');
  const view = gameView(toState(game));
  expect(view.next).toBe(
    "Black to move. It's your turn (you play Black): call make_move with ply 1.",
  );
  const text = gameText(view);
  expect(text).toContain('Moves: 1. e4');
  expect(text).toContain('Last move: e4 (human)');
  expect(text).toContain(`Status: ${view.next}`);
});

test('numbers moves correctly when Black moves first', () => {
  const start = '4k3/8/8/8/8/8/4P3/4K3 b - - 0 12';
  const game = applyMove(
    createGame({ white: 'human', black: 'llm', startFen: start }),
    'Kd7',
    'llm',
  );
  expect(gameText(gameView(toState(game)))).toContain('Moves: 12. ... Kd7');
});

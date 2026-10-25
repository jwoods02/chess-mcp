import type { GameView } from '@chess-mcp/shared';
import { Chess } from 'chess.js';
import { expect, test } from 'vitest';
import { canTakeBack, positions } from './chess.ts';

test('replays a game from its PGN, including one that starts with Black to move', () => {
  const chess = new Chess('4k3/8/8/8/8/8/4P3/4K3 b - - 0 12');
  chess.move('Kd7');
  chess.move('e4');
  const history = positions(chess.pgn());

  expect(history).toHaveLength(3);
  expect(history[0]).toEqual({ fen: '4k3/8/8/8/8/8/4P3/4K3 b - - 0 12', label: 'Start' });
  expect(history[2]!.lastMove).toEqual({ from: 'e2', to: 'e4' });
  expect(history.map((step) => step.label)).toEqual(['Start', '12... Kd7', '13. e4']);
});

/** A game view with only the fields the take-back rule reads. */
const view = (fields: Partial<GameView>) =>
  ({
    white: 'human',
    black: 'llm',
    ply: 0,
    toMove: 'human',
    status: 'active',
    ...fields,
  }) as GameView;

test('the human can take back once they have moved, on their turn or after the game', () => {
  expect(canTakeBack(view({ ply: 2 }))).toBe(true);
  expect(canTakeBack(view({ ply: 3, toMove: null, status: 'finished' }))).toBe(true);
  expect(canTakeBack(view({ ply: 3, toMove: 'llm' }))).toBe(false);
  expect(canTakeBack(view({ ply: 0 }))).toBe(false);
});

test("the opponent's first move alone can't be taken back: it would just be played again", () => {
  const afterOpening = { white: 'llm', black: 'human', ply: 1 } as const;
  expect(
    canTakeBack(
      view({ ...afterOpening, lastMove: { san: 'e4', from: 'e2', to: 'e4', by: 'llm' } }),
    ),
  ).toBe(false);
  expect(
    canTakeBack(
      view({
        ply: 1,
        toMove: null,
        status: 'finished',
        lastMove: { san: 'e4', from: 'e2', to: 'e4', by: 'human' },
      }),
    ),
  ).toBe(true);
});

test('no take back in a game with no human in it', () => {
  expect(
    canTakeBack(view({ white: 'llm', black: 'jev', ply: 4, status: 'finished', toMove: null })),
  ).toBe(false);
});

import { expect, test } from 'vitest';
import { errorNotice, type ToolResult } from './host.ts';

const error = (code: string, message: string) =>
  ({
    isError: true,
    content: [{ type: 'text', text: `Error [${code}]: ${message}` }],
    structuredContent: { gameId: 'g1', error: { code, message } },
  }) as unknown as ToolResult;

test('words a server error for the human, without the model-facing extras', () => {
  const illegal = error(
    'illegal_move',
    '"e5" is not a legal move for White. Legal moves: a3, a4, e4.',
  );
  expect(errorNotice(illegal)).toBe('"e5" is not a legal move for White.');
  expect(errorNotice(error('stale_state', 'You passed ply 2 but the game is at ply 3.'))).toBe(
    'This board was out of date. It now shows the latest position.',
  );
});

test('falls back to a plain notice when the error has no game', () => {
  const invalid = {
    isError: true,
    content: [{ type: 'text', text: 'Input validation error: square is invalid' }],
  } as ToolResult;
  expect(errorNotice(invalid)).toBe('That could not be done.');
});

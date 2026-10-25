import { expect, test } from 'vitest';
import { errorNotice, type ToolResult } from './host.ts';

const error = (text: string) =>
  ({ isError: true, content: [{ type: 'text', text }] }) as ToolResult;

// The server writes errors for the model: `Error [code]: message`, then the current position.
test('words a server error for the human, without the model-facing extras', () => {
  const illegal = error(
    'Error [illegal_move]: "e5" is not a legal move for White. Legal moves: a3, a4, e4.\n\nCurrent position:\nGame 1',
  );
  expect(errorNotice(illegal)).toBe('"e5" is not a legal move for White.');
  expect(
    errorNotice(error('Error [stale_state]: You passed ply 2 but the game is at ply 3.')),
  ).toBe('This board was out of date. It now shows the latest position.');
  expect(errorNotice(error('Input validation error: square is invalid'))).toBe(
    'That could not be done.',
  );
});

import type { CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { ChessError, toView, type Game } from '../chess/game.ts';
import { gameText } from '../chess/text.ts';
import type { GameStore } from '../store/store.ts';

export const gameIdInput = z.string().describe('Game ID returned by new_game');
export const plyInput = z
  .number()
  .int()
  .min(0)
  .describe(
    'The `ply` from the latest result for this game. Guards against acting on an old position.',
  );

/** A successful result: the full text board plus the GameView as structured content. */
export function gameResult(game: Game): CallToolResult {
  const view = toView(game);
  return { content: [{ type: 'text', text: gameText(view) }], structuredContent: view };
}

export async function loadGame(store: GameStore, gameId: string): Promise<Game> {
  const game = await store.get(gameId);
  if (!game) throw new ChessError('game_not_found', `No game with ID ${gameId}.`);
  return game;
}

/** Loads a game, checks the caller saw the latest position, applies `change` and saves it. */
export async function changeGame(
  store: GameStore,
  gameId: string,
  ply: number,
  change: (game: Game) => Game,
): Promise<Game> {
  const game = await loadGame(store, gameId);
  if (game.moves.length !== ply) throw staleError(game.moves.length, ply);
  const changed = change(game);
  if (!(await store.update(changed, ply))) throw staleError(undefined, ply);
  return changed;
}

/** Runs a tool body, turning rule errors into an error result that shows the current board. */
export async function handle(
  store: GameStore,
  gameId: string | undefined,
  body: () => Promise<CallToolResult>,
): Promise<CallToolResult> {
  try {
    return await body();
  } catch (error) {
    if (!(error instanceof ChessError)) throw error;
    const message = `Error [${error.code}]: ${error.message}`;
    const game = gameId ? await store.get(gameId) : undefined;
    if (!game) return { isError: true, content: [{ type: 'text', text: message }] };
    const view = toView(game);
    return {
      isError: true,
      content: [{ type: 'text', text: `${message}\n\nCurrent position:\n${gameText(view)}` }],
      structuredContent: view,
    };
  }
}

function staleError(actual: number | undefined, expected: number) {
  const where =
    actual === undefined ? 'changed while this request was running' : `is at ply ${actual}`;
  return new ChessError(
    'stale_state',
    `You passed ply ${expected} but the game ${where}. Nothing was changed. Review the current position below.`,
  );
}

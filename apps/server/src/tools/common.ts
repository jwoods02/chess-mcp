import { Level } from '@chess-mcp/shared';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { ChessError, toState, type Game } from '../chess/game.ts';
import { coachingBlock, MODE_IDS, MODES } from '../coaching/coaching.ts';
import { LEVELS } from '../opponents/levels.ts';
import { gameText, gameView } from '../chess/text.ts';
import type { Opponent } from '../opponents/opponent.ts';
import type { GameStore } from '../store/store.ts';

/** What the tools need, built once per server. */
export interface ToolDeps {
  store: GameStore;
  /** Present only when a Jev API key is configured. */
  jev?: Opponent;
}

export const gameIdInput = z.string().describe('Game ID returned by new_game');
export const plyInput = z
  .number()
  .int()
  .min(0)
  .describe(
    'The `ply` from the latest result for this game. Guards against acting on an old position.',
  );

export const coachingInput = z
  .enum(MODE_IDS)
  .describe(
    'How the human is coached. ' +
      MODE_IDS.map((id) => `"${id}": ${MODES[id].description}`).join(' '),
  );
export const levelInput = Level.describe(
  'How strongly the non-human side plays (you or Jev). ' +
    Level.options
      .map((l) => `"${l}"${LEVELS[l].rating ? ` (about ${LEVELS[l].rating})` : ''}`)
      .join(', ') +
    '. Pick one to suit the human, so they win about half their games.',
);

/**
 * A successful result: the text response plus the GameView as structured content. Both carry the
 * board, the next step and the coaching, since some clients show the model only one of them. Ask for
 * `fullGuidance` when the model may not know the game's coaching yet: a start, resume or change.
 * Move tools pass `afterMove`, so the coaching includes facts about the move just played.
 */
export function gameResult(
  game: Game,
  options: { note?: string; fullGuidance?: boolean; afterMove?: boolean } = {},
): CallToolResult {
  const view = gameView(toState(game), coachingBlock(game, options), options.note);
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
  change: (game: Game) => Game | Promise<Game>,
): Promise<Game> {
  const game = await loadGame(store, gameId);
  if (game.moves.length !== ply) throw staleError(game.moves.length, ply);
  // May await Jev's reply. The save only succeeds if the stored game is still the one we loaded,
  // so a resignation or move that lands meanwhile isn't overwritten.
  const changed = await change(game);
  if (!(await store.update(changed, game))) throw staleError(undefined, ply);
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
    const view = gameView(toState(game), coachingBlock(game));
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

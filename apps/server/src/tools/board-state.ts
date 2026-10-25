import { GameView } from '@chess-mcp/shared';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { BOARD_URI } from '../board-ui.ts';
import { gameIdInput, gameResult, handle, loadGame, type ToolDeps } from './common.ts';

/** For the board UI only (hidden from the model): fetches the latest position to stay up to date. */
export function registerBoardState(server: McpServer, { store }: ToolDeps) {
  registerAppTool(
    server,
    'board_state',
    {
      title: 'Board state',
      description: 'Latest position of a chess game, for the board UI.',
      inputSchema: z.object({ gameId: gameIdInput }),
      outputSchema: GameView,
      _meta: { ui: { resourceUri: BOARD_URI, visibility: ['app'] } },
    },
    ({ gameId }) => handle(store, gameId, async () => gameResult(await loadGame(store, gameId))),
  );
}

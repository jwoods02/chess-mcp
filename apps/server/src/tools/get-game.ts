import { GameView } from '@chess-mcp/shared';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { SHOWS_BOARD } from '../board-ui.ts';
import type { GameStore } from '../store/store.ts';
import { gameIdInput, gameResult, handle, loadGame } from './common.ts';

export function registerGetGame(server: McpServer, store: GameStore) {
  registerAppTool(
    server,
    'get_game',
    {
      title: 'Show chess game',
      description: 'Show the current board, moves and status of a chess game.',
      inputSchema: z.object({ gameId: gameIdInput }),
      outputSchema: GameView,
      _meta: SHOWS_BOARD,
    },
    ({ gameId }) => handle(store, gameId, async () => gameResult(await loadGame(store, gameId))),
  );
}

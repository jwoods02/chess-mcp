import { GameView, Player } from '@chess-mcp/shared';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { SHOWS_BOARD } from '../board-ui.ts';
import { createGame } from '../chess/game.ts';
import type { GameStore } from '../store/store.ts';
import { gameResult, handle } from './common.ts';

export function registerNewGame(server: McpServer, store: GameStore) {
  registerAppTool(
    server,
    'new_game',
    {
      title: 'New chess game',
      description:
        'Start a new chess game. Each side is played by the "human" or by you, the "llm". ' +
        'The server enforces the rules and stores the game, so read the position from the latest ' +
        'tool result; a board you track yourself drifts.',
      inputSchema: z.object({
        white: Player.describe('Who plays White'),
        black: Player.describe('Who plays Black'),
        startFen: z
          .string()
          .optional()
          .describe('Optional starting position (FEN). Defaults to the standard start.'),
      }),
      outputSchema: GameView,
      _meta: SHOWS_BOARD,
    },
    ({ white, black, startFen }) =>
      handle(store, undefined, async () => {
        const game = createGame({ white, black, startFen });
        await store.create(game);
        return gameResult(game);
      }),
  );
}

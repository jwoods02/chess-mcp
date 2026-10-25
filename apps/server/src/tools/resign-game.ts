import { Color, GameView } from '@chess-mcp/shared';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { SHOWS_BOARD } from '../board-ui.ts';
import { resign } from '../chess/game.ts';
import type { GameStore } from '../store/store.ts';
import { changeGame, gameIdInput, gameResult, handle, plyInput } from './common.ts';

export function registerResignGame(server: McpServer, store: GameStore) {
  registerAppTool(
    server,
    'resign_game',
    {
      title: 'Resign chess game',
      description: 'Resign a chess game. Only resign for the human if they asked to.',
      inputSchema: z.object({
        gameId: gameIdInput,
        ply: plyInput,
        color: Color.describe('The side resigning: "w" or "b"'),
      }),
      outputSchema: GameView,
      _meta: SHOWS_BOARD,
    },
    ({ gameId, ply, color }) =>
      handle(store, gameId, async () =>
        gameResult(await changeGame(store, gameId, ply, (game) => resign(game, color))),
      ),
  );
}

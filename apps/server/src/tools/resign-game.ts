import { Color, GameView } from '@chess-mcp/shared';
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { resign } from '../chess/game.ts';
import { changeGame, gameIdInput, gameResult, handle, plyInput, type ToolDeps } from './common.ts';

export function registerResignGame(server: McpServer, { store }: ToolDeps) {
  server.registerTool(
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
    },
    ({ gameId, ply, color }) =>
      handle(store, gameId, async () =>
        gameResult(await changeGame(store, gameId, ply, (game) => resign(game, color))),
      ),
  );
}

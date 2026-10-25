import { Color, GameView } from '@chess-mcp/shared';
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { resign } from '../chess/game.ts';
import { changeGame, gameIdInput, handle, plyInput, type ToolDeps } from './common.ts';

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
      handle(server, store, gameId, async (gameResult) => {
        const { game, ended } = await changeGame(store, gameId, ply, (g) => resign(g, color));
        return gameResult(game, { ended });
      }),
  );
}

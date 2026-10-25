import { GameView } from '@chess-mcp/shared';
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { updateSettings } from '../chess/game.ts';
import { modeRef } from '../coaching/coaching.ts';
import {
  changeGame,
  coachingInput,
  gameIdInput,
  gameResult,
  handle,
  levelInput,
  plyInput,
  type ToolDeps,
} from './common.ts';

// Doesn't draw a board: the position doesn't change.
export function registerUpdateGameSettings(server: McpServer, { store }: ToolDeps) {
  server.registerTool(
    'update_game_settings',
    {
      title: 'Change chess coaching or opponent level',
      description:
        'Change how the human is coached, or how strongly the opponent plays, in a chess game. Use ' +
        'it when the human asks for more or less help, or an easier or harder opponent. The result ' +
        'has the new coaching guidance in full.',
      inputSchema: z.object({
        gameId: gameIdInput,
        ply: plyInput,
        coaching: coachingInput.optional(),
        opponentLevel: levelInput.optional(),
      }),
      outputSchema: GameView,
    },
    ({ gameId, ply, coaching, opponentLevel }) =>
      handle(store, gameId, async () => {
        const game = await changeGame(store, gameId, ply, (g) =>
          updateSettings(g, { coachingMode: coaching && modeRef(coaching), opponentLevel }),
        );
        return gameResult(game, { fullGuidance: true });
      }),
  );
}

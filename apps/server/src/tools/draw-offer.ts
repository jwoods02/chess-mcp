import { Color, GameView } from '@chess-mcp/shared';
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { draw } from '../chess/game.ts';
import type { GameStore } from '../store/store.ts';
import { changeGame, gameIdInput, gameResult, handle, plyInput } from './common.ts';

export function registerDrawOffer(server: McpServer, store: GameStore) {
  server.registerTool(
    'draw_offer',
    {
      title: 'Offer, accept or decline a draw',
      description:
        "Offer a draw in a chess game, or accept or decline the opponent's pending offer. " +
        'Usually you make your move first, then offer. Moving instead of answering declines an offer. ' +
        'Only act for the human if they asked to.',
      inputSchema: z.object({
        gameId: gameIdInput,
        ply: plyInput,
        action: z.enum(['offer', 'accept', 'decline']),
        color: Color.describe('The side taking this action: "w" or "b"'),
      }),
      outputSchema: GameView,
    },
    ({ gameId, ply, action, color }) =>
      handle(store, gameId, async () =>
        gameResult(await changeGame(store, gameId, ply, (game) => draw(game, action, color))),
      ),
  );
}

import { Color, GameView } from '@chess-mcp/shared';
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { draw, type Game } from '../chess/game.ts';
import { colorName } from '../chess/names.ts';
import { changeGame, gameIdInput, handle, plyInput, type ToolDeps } from './common.ts';

export function registerDrawOffer(server: McpServer, { store }: ToolDeps) {
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
      handle(server, store, gameId, async (gameResult) => {
        const { game, ended } = await changeGame(store, gameId, ply, (g) => draw(g, action, color));
        return gameResult(game, { ended, note: drawNote(action, color, game) });
      }),
  );
}

/** What happened, where the board alone doesn't show it. */
function drawNote(action: 'offer' | 'accept' | 'decline', color: Color, game: Game) {
  if (action === 'decline') return `${colorName(color)} declined the draw offer.`;
  // Offering while the other side's offer is pending agrees the draw.
  if (action === 'offer' && game.status === 'finished') {
    return 'Both sides offered a draw, so the draw is agreed.';
  }
  return undefined;
}

import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { legalMoves } from '../chess/game.ts';
import type { GameStore } from '../store/store.ts';
import { gameIdInput, handle, loadGame } from './common.ts';

export function registerLegalMoves(server: McpServer, store: GameStore) {
  server.registerTool(
    'legal_moves',
    {
      title: 'List legal chess moves',
      description:
        'List the legal moves (SAN) for the side to move, optionally only for the piece on one square.',
      inputSchema: z.object({
        gameId: gameIdInput,
        square: z
          .string()
          .optional()
          .describe('Only moves for the piece on this square, e.g. "g1"'),
      }),
      outputSchema: z.object({
        gameId: z.string(),
        square: z.string().optional(),
        moves: z.array(z.string()),
      }),
    },
    ({ gameId, square }) =>
      handle(store, gameId, async () => {
        const moves = legalMoves(await loadGame(store, gameId), square);
        const where = square ? ` from ${square}` : '';
        return {
          content: [{ type: 'text', text: `Legal moves${where}: ${moves.join(', ') || '(none)'}` }],
          structuredContent: { gameId, square, moves },
        };
      }),
  );
}

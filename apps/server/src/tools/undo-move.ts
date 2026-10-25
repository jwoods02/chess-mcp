import { GameView } from '@chess-mcp/shared';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { SHOWS_BOARD } from '../board-ui.ts';
import { hasJev, undo } from '../chess/game.ts';
import { playJevReply } from '../opponents/reply.ts';
import { changeGame, gameIdInput, handle, plyInput, type ToolDeps } from './common.ts';

export function registerUndoMove(server: McpServer, { store, jev }: ToolDeps) {
  registerAppTool(
    server,
    'undo_move',
    {
      title: 'Take back chess moves',
      description:
        'Take back moves in a chess game. The default of 2 takes back the last move and the reply, ' +
        "returning to the same side to move. Against Jev it always stops on the other player's turn. " +
        'Reopens a finished game.',
      inputSchema: z.object({
        gameId: gameIdInput,
        ply: plyInput,
        plies: z.number().int().min(1).default(2).describe('How many half-moves to take back'),
      }),
      outputSchema: GameView,
      _meta: SHOWS_BOARD,
    },
    ({ gameId, ply, plies }) =>
      handle(server, store, gameId, async (gameResult) => {
        let taken = 0;
        const { game, ended } = await changeGame(store, gameId, ply, (g) => {
          const undone = undo(g, plies);
          taken = g.moves.length - undone.moves.length;
          return playJevReply(undone, jev);
        });
        // Say when the count changed, so nobody thinks the position is off by a move.
        const why = hasJev(game) ? "stopping on the human's turn against Jev" : 'all there were';
        const note =
          taken !== plies ? `Took back ${taken} half-moves, not ${plies}: ${why}.` : undefined;
        return gameResult(game, { ended, note });
      }),
  );
}

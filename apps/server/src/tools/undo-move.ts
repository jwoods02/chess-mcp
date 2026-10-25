import { GameView } from '@chess-mcp/shared';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { SHOWS_BOARD } from '../board-ui.ts';
import { undo } from '../chess/game.ts';
import { playJevReply } from '../opponents/reply.ts';
import { changeGame, gameIdInput, gameResult, handle, plyInput, type ToolDeps } from './common.ts';

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
      handle(server, store, gameId, async () => {
        const { game, ended } = await changeGame(store, gameId, ply, (g) =>
          playJevReply(undo(g, plies), jev),
        );
        return gameResult(game, { ended });
      }),
  );
}

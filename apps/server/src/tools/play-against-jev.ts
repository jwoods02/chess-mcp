import { GameView } from '@chess-mcp/shared';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { SHOWS_BOARD } from '../board-ui.ts';
import { applyMove, ChessError, hasJev } from '../chess/game.ts';
import { playJevReply } from '../opponents/reply.ts';
import { changeGame, gameIdInput, gameResult, handle, plyInput, type ToolDeps } from './common.ts';

// The human's move in a game against Jev. Jev replies inside the same call, so unlike
// submit_human_move this shows the board: the human needs to see Jev's move. The board also calls it
// when the human drags a piece. Only registered when Jev is configured.
export function registerPlayAgainstJev(server: McpServer, { store, jev }: ToolDeps) {
  registerAppTool(
    server,
    'play_against_jev',
    {
      title: 'Play a move against Jev',
      description:
        "Submit the human's move in a chess game against Jev. Jev replies straight away and the result " +
        "shows the board with both moves. It also shows Jev's instinct (the moves it rated most likely), " +
        'which is not an evaluation: Jev is often wrong. ' +
        'Accepts SAN ("Nf3", "O-O", "e8=Q"), UCI ("g1f3", "e7e8q") or loose forms ("nf3", "0-0"). ' +
        'Illegal moves are rejected with the list of legal moves: tell the human and ask again.',
      inputSchema: z.object({
        gameId: gameIdInput,
        ply: plyInput,
        move: z.string().describe("The human's move in SAN or UCI"),
      }),
      outputSchema: GameView,
      _meta: SHOWS_BOARD,
    },
    ({ gameId, ply, move }) =>
      handle(server, store, gameId, async () =>
        gameResult(
          await changeGame(store, gameId, ply, (game) => {
            if (!hasJev(game)) {
              throw new ChessError(
                'wrong_tool',
                'This game is not against Jev: use submit_human_move.',
              );
            }
            return playJevReply(applyMove(game, move, 'human'), jev);
          }),
          { afterMove: true },
        ),
      ),
  );
}

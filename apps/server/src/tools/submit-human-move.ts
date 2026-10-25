import { GameView } from '@chess-mcp/shared';
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { CALLABLE_FROM_BOARD } from '../board-ui.ts';
import { applyMove, ChessError, hasJev, toView } from '../chess/game.ts';
import { changeGame, gameIdInput, gameResult, handle, plyInput, type ToolDeps } from './common.ts';

// Doesn't draw a board: the human already knows the move they made, and the assistant's reply
// (make_move) shows the board with both moves. Games against Jev use play_against_jev instead,
// because Jev's reply comes back in the same call and the human needs to see it. The board itself
// calls this when the human drags a piece, so it's marked as callable from the board.
export function registerSubmitHumanMove(server: McpServer, { store, movesShowBoard }: ToolDeps) {
  server.registerTool(
    'submit_human_move',
    {
      title: "Submit the human's chess move",
      description:
        'Submit the move the human told you, when the side to move is played by the "human" and ' +
        'the game is not against Jev (use play_against_jev for those). Does not show the board. ' +
        'For your own moves use make_move. ' +
        'Accepts SAN ("Nf3", "O-O", "e8=Q"), UCI ("g1f3", "e7e8q") or loose forms ("nf3", "0-0"). ' +
        'Illegal moves are rejected with the list of legal moves: tell the human and ask again.',
      inputSchema: z.object({
        gameId: gameIdInput,
        ply: plyInput,
        move: z.string().describe("The human's move in SAN or UCI"),
      }),
      outputSchema: GameView,
      _meta: CALLABLE_FROM_BOARD,
    },
    ({ gameId, ply, move }) =>
      handle(store, gameId, async () => {
        const game = await changeGame(store, gameId, ply, (g) => {
          if (hasJev(g)) {
            throw new ChessError(
              'wrong_tool',
              "This game is against Jev: submit the move with play_against_jev, which shows the human Jev's reply.",
            );
          }
          return applyMove(g, move, 'human');
        });
        // Only the model sees this result, so if a human has to look at the new position, it should
        // show it. Not needed in live mode, where the board updates itself.
        const view = toView(game);
        const humanMustSee =
          movesShowBoard && (view.status === 'finished' || view.toMove === 'human');
        return gameResult(
          game,
          humanMustSee
            ? 'The human has not seen this position: call get_game to show them the board.'
            : undefined,
        );
      }),
  );
}

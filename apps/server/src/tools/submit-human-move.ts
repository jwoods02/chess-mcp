import { GameView } from '@chess-mcp/shared';
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { applyMove, toView } from '../chess/game.ts';
import type { GameStore } from '../store/store.ts';
import { changeGame, gameIdInput, gameResult, handle, plyInput } from './common.ts';

// Deliberately not linked to the board UI: the human already knows the move they made, so
// showing the board again would just repeat it. The board appears with the reply instead.
export function registerSubmitHumanMove(server: McpServer, store: GameStore) {
  server.registerTool(
    'submit_human_move',
    {
      title: "Submit the human's chess move",
      description:
        'Submit the move the human told you, when the side to move is played by the "human". ' +
        'Does not show the board. For your own moves use make_move. ' +
        'Accepts SAN ("Nf3", "O-O", "e8=Q"), UCI ("g1f3", "e7e8q") or loose forms ("nf3", "0-0"). ' +
        'Illegal moves are rejected with the list of legal moves: tell the human and ask again.',
      inputSchema: z.object({
        gameId: gameIdInput,
        ply: plyInput,
        move: z.string().describe("The human's move in SAN or UCI"),
      }),
      outputSchema: GameView,
    },
    ({ gameId, ply, move }) =>
      handle(store, gameId, async () => {
        const game = await changeGame(store, gameId, ply, (g) => applyMove(g, move, 'human'));
        // Only you see this result, so if a human has to look at the new position, show it.
        const view = toView(game);
        const humanMustSee = view.status === 'finished' || view.toMove === 'human';
        return gameResult(
          game,
          humanMustSee
            ? 'The human has not seen this position: call get_game to show them the board.'
            : undefined,
        );
      }),
  );
}

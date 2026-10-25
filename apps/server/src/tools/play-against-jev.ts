import { GameView } from '@chess-mcp/shared';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { CALLABLE_FROM_BOARD, SHOWS_BOARD } from '../board-ui.ts';
import { applyMove, ChessError, hasJev } from '../chess/game.ts';
import { playJevReply } from '../opponents/reply.ts';
import { changeGame, gameIdInput, gameResult, handle, plyInput, type ToolDeps } from './common.ts';

const input = z.object({
  gameId: gameIdInput,
  ply: plyInput,
  move: z.string().describe("The human's move in SAN or UCI"),
});

// The human's move in a game against Jev. Jev replies inside the same call, so unlike
// submit_human_move this shows the board: the human needs to see Jev's move. Only registered when
// Jev is configured.
export function registerPlayAgainstJev(
  server: McpServer,
  { store, jev, movesShowBoard }: ToolDeps,
) {
  const config = {
    title: 'Play a move against Jev',
    description:
      "Submit the human's move in a chess game against Jev. Jev replies straight away and the result " +
      "shows the board with both moves, along with Jev's top choices, which help when coaching. " +
      'Accepts SAN ("Nf3", "O-O", "e8=Q"), UCI ("g1f3", "e7e8q") or loose forms ("nf3", "0-0"). ' +
      'Illegal moves are rejected with the list of legal moves: tell the human and ask again.',
    inputSchema: input,
    outputSchema: GameView,
  };
  const handler = ({ gameId, ply, move }: z.infer<typeof input>) =>
    handle(store, gameId, async () =>
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
      ),
    );

  // In live mode the board updates itself, so this stays text-only like the other move tools. Either
  // way the board calls it when the human drags a piece.
  if (movesShowBoard)
    registerAppTool(server, 'play_against_jev', { ...config, _meta: SHOWS_BOARD }, handler);
  else server.registerTool('play_against_jev', { ...config, _meta: CALLABLE_FROM_BOARD }, handler);
}

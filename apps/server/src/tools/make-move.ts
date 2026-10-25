import { GameView } from '@chess-mcp/shared';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { SHOWS_BOARD } from '../board-ui.ts';
import { applyMove } from '../chess/game.ts';
import { playJevReply } from '../opponents/reply.ts';
import { changeGame, gameIdInput, handle, plyInput, type ToolDeps } from './common.ts';

export function registerMakeMove(server: McpServer, { store, jev }: ToolDeps) {
  registerAppTool(
    server,
    'make_move',
    {
      title: 'Make your chess move',
      description:
        'Play your own move in a chess game, when the side to move is played by you (the "llm"). ' +
        'For a move the human told you, use submit_human_move instead. ' +
        'Accepts SAN ("Nf3", "O-O", "e8=Q") or UCI ("g1f3", "e7e8q"). ' +
        'Illegal moves are rejected with the list of legal moves.',
      inputSchema: z.object({
        gameId: gameIdInput,
        ply: plyInput,
        move: z.string().describe('The move in SAN or UCI'),
      }),
      outputSchema: GameView,
      _meta: SHOWS_BOARD,
    },
    ({ gameId, ply, move }) =>
      handle(server, store, gameId, async (gameResult) => {
        const { game, ended } = await changeGame(store, gameId, ply, (g) =>
          playJevReply(applyMove(g, move, 'llm'), jev),
        );
        return gameResult(game, { afterMove: true, ended });
      }),
  );
}

import { GameView } from '@chess-mcp/shared';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { SHOWS_BOARD } from '../board-ui.ts';
import { applyMove } from '../chess/game.ts';
import { playJevReply } from '../opponents/reply.ts';
import { changeGame, gameIdInput, gameResult, handle, plyInput, type ToolDeps } from './common.ts';

const input = z.object({
  gameId: gameIdInput,
  ply: plyInput,
  move: z.string().describe('The move in SAN or UCI'),
});

export function registerMakeMove(server: McpServer, { store, jev, movesShowBoard }: ToolDeps) {
  const config = {
    title: 'Make your chess move',
    description:
      'Play your own move in a chess game, when the side to move is played by you (the "llm"). ' +
      'For a move the human told you, use submit_human_move instead. ' +
      'Accepts SAN ("Nf3", "O-O", "e8=Q") or UCI ("g1f3", "e7e8q"). ' +
      'Illegal moves are rejected with the list of legal moves.',
    inputSchema: input,
    outputSchema: GameView,
  };
  const handler = ({ gameId, ply, move }: z.infer<typeof input>) =>
    handle(store, gameId, async () =>
      gameResult(
        await changeGame(store, gameId, ply, (game) =>
          playJevReply(applyMove(game, move, 'llm'), jev),
        ),
      ),
    );

  if (movesShowBoard)
    registerAppTool(server, 'make_move', { ...config, _meta: SHOWS_BOARD }, handler);
  else server.registerTool('make_move', config, handler);
}

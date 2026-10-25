import { GameView } from '@chess-mcp/shared';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { SHOWS_BOARD } from '../board-ui.ts';
import { applyMove } from '../chess/game.ts';
import type { GameStore } from '../store/store.ts';
import { changeGame, gameIdInput, gameResult, handle, plyInput } from './common.ts';

export function registerMakeMove(server: McpServer, store: GameStore) {
  registerAppTool(
    server,
    'make_move',
    {
      title: 'Make your chess move',
      description:
        'Play your own move in a chess game, when the side to move is played by you (the "llm"). ' +
        'Shows the board to the human. For a move the human told you, use submit_human_move instead. ' +
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
      handle(store, gameId, async () =>
        gameResult(await changeGame(store, gameId, ply, (game) => applyMove(game, move, 'llm'))),
      ),
  );
}

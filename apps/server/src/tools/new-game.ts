import { GameView, Player } from '@chess-mcp/shared';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { SHOWS_BOARD } from '../board-ui.ts';
import { createGame } from '../chess/game.ts';
import { modeRef } from '../coaching/coaching.ts';
import { playJevReply } from '../opponents/reply.ts';
import { coachingInput, gameResult, handle, levelInput, type ToolDeps } from './common.ts';

export function registerNewGame(server: McpServer, { store, jev }: ToolDeps) {
  // Jev is only offered when this server has a TypeSafe API key.
  const seat = jev ? Player : z.enum(['human', 'llm']);
  const players = jev
    ? 'Each side is played by the "human", by you (the "llm"), or by "jev", a fast non-LLM chess ' +
      'model the server runs. When the human plays Jev, you can watch and coach. '
    : 'Each side is played by the "human" or by you, the "llm". ';
  registerAppTool(
    server,
    'new_game',
    {
      title: 'New chess game',
      description:
        'Start a new chess game. ' +
        players +
        'The server enforces the rules and stores the game, so read the position from the latest ' +
        'tool result; a board you track yourself drifts. ' +
        'Ask the human how much coaching they want and how strong an opponent, unless they said: ' +
        'show_game_setup shows these choices on the board.',
      inputSchema: z.object({
        white: seat.describe('Who plays White'),
        black: seat.describe('Who plays Black'),
        startFen: z
          .string()
          .optional()
          .describe('Optional starting position (FEN). Defaults to the standard start.'),
        coaching: coachingInput.default('play'),
        opponentLevel: levelInput.default('best'),
      }),
      outputSchema: GameView,
      _meta: SHOWS_BOARD,
    },
    ({ white, black, startFen, coaching, opponentLevel }) =>
      handle(server, store, undefined, async () => {
        const created = createGame({
          white,
          black,
          startFen,
          coachingMode: modeRef(coaching),
          opponentLevel,
        });
        // If Jev plays White, it makes the first move straight away.
        const game = await playJevReply(created, jev);
        await store.create(game);
        return gameResult(game, { fullGuidance: true });
      }),
  );
}

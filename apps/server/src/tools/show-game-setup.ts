import { GameSetup, Level } from '@chess-mcp/shared';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { SHOWS_BOARD } from '../board-ui.ts';
import { MODE_IDS, MODES } from '../coaching/coaching.ts';
import { LEVELS } from '../opponents/levels.ts';
import type { ToolDeps } from './common.ts';

// Shows the new-game card in the board. The board starts the game itself with new_game, or posts the
// human's choice in the chat when the host won't run tools for it.
export function registerShowGameSetup(server: McpServer, { jev }: ToolDeps) {
  registerAppTool(
    server,
    'show_game_setup',
    {
      title: 'Show chess game options',
      description:
        'Show the options for a new chess game on the board, so the human can pick their opponent, ' +
        "colour, coaching and opponent level. Use it when they want to play but haven't said how.",
      inputSchema: z.object({}),
      outputSchema: GameSetup,
      _meta: SHOWS_BOARD,
    },
    async () => {
      const setup: GameSetup['setup'] = {
        opponents: jev ? ['llm', 'jev'] : ['llm'],
        coaching: MODE_IDS.map((id) => ({
          id,
          label: MODES[id].label,
          description: MODES[id].description,
        })),
        levels: Level.options.map((id) => ({
          id,
          label: LEVELS[id].label,
          ...(LEVELS[id].rating && { rating: LEVELS[id].rating }),
        })),
      };
      const text = [
        'The game options are on the board. When the human picks, the board starts the game itself, ',
        "or posts their choice in the chat for you to start with new_game. If the board isn't shown, ",
        'ask them in chat. Opponents: ',
        setup.opponents.map((p) => (p === 'llm' ? 'you' : 'Jev')).join(', '),
        '. Coaching: ',
        setup.coaching.map((c) => `${c.label} (${c.description})`).join(' '),
        ' Levels: ',
        setup.levels.map((l) => l.label).join(', '),
        '.',
      ].join('');
      return { content: [{ type: 'text', text }], structuredContent: { setup } };
    },
  );
}

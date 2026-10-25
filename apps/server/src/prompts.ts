import { Level } from '@chess-mcp/shared';
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { MODE_IDS, MODES } from './coaching/coaching.ts';
import { LEVELS } from './opponents/levels.ts';
import type { ToolDeps } from './tools/common.ts';

/** Prompts show up as the client's slash commands, e.g. /mcp__chess__play_chess in Claude Code. */
export function registerPrompts(server: McpServer, { jev }: ToolDeps) {
  const opponents = jev ? (['assistant', 'jev'] as const) : (['assistant'] as const);
  server.registerPrompt(
    'play_chess',
    {
      title: 'Play chess',
      description: 'Start a chess game. Leave out any option to choose it on the board instead.',
      argsSchema: z.object({
        opponent: z.enum(opponents).optional().describe('Who to play'),
        color: z.enum(['white', 'black']).optional().describe('The colour you play'),
        coaching: z.enum(MODE_IDS).optional().describe('How much coaching'),
        level: Level.optional().describe('How strongly the opponent plays'),
      }),
    },
    ({ opponent, color, coaching, level }) => {
      const chosen = [
        opponent && `against ${opponent === 'jev' ? 'Jev' : 'you'}`,
        color && `as ${color === 'white' ? 'White' : 'Black'}`,
        level && `with the opponent at ${LEVELS[level].label} strength`,
        coaching && `with "${MODES[coaching].label}" coaching`,
      ].filter(Boolean);
      const complete = opponent && color && level && coaching;
      const text = complete
        ? `Let's play chess ${chosen.join(', ')}. Start the game with new_game.`
        : `Let's play chess${chosen.length ? ` ${chosen.join(', ')}` : ''}. Show me the other options ` +
          'with show_game_setup so I can pick them on the board, or ask me in chat if the board ' +
          "isn't shown.";
      return { messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] };
    },
  );
}

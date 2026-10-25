import { MoveFacts, PositionFacts } from '@chess-mcp/shared';
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { moveFacts, positionFacts } from '../chess/facts.ts';
import { previewLine } from '../chess/game.ts';
import { factsText, positionText } from '../chess/text.ts';
import { gameIdInput, handle, loadGame, type ToolDeps } from './common.ts';

// Read-only, so no `ply` and no board: the stored game never changes.
export function registerAnalyzePosition(server: McpServer, { store }: ToolDeps) {
  server.registerTool(
    'analyze_position',
    {
      title: 'Analyze a chess position',
      description:
        'Check facts about a chess game without changing it. With no moves, it lists what the side ' +
        'to move can do now: mates in one, the best winning capture, and its pieces under attack. ' +
        'With moves, it plays them on a scratch copy for whoever is to move, and returns the same ' +
        'checked facts for each move and for the position after. Use it before making a claim about ' +
        'the position, to test an idea the human asks about, and to build hints.',
      inputSchema: z.object({
        gameId: gameIdInput,
        moves: z
          .array(z.string())
          .max(6)
          .default([])
          .describe('A line to try from the current position, e.g. ["Nf3", "Nc6"]'),
      }),
      outputSchema: z.object({
        gameId: z.string(),
        now: PositionFacts,
        line: z.array(MoveFacts).describe('Facts for each move of the line, in order'),
        after: PositionFacts.optional().describe('The position after the line'),
      }),
    },
    ({ gameId, moves }) =>
      handle(server, store, gameId, async () => {
        const game = await loadGame(store, gameId);
        const now = positionFacts(game);
        const preview = previewLine(game, moves);
        const line = moves.map((_, i) => moveFacts(preview, game.moves.length + i));
        const after = moves.length > 0 ? positionFacts(preview) : undefined;
        const text = [
          `Now: ${positionText(now)}.`,
          ...line.map((facts) => `Then ${factsText(facts)}.`),
          ...(after ? [`After the line: ${positionText(after)}.`] : []),
          'The game is unchanged.',
        ].join('\n');
        return {
          content: [{ type: 'text', text }],
          structuredContent: { gameId, now, line, after },
        };
      }),
  );
}

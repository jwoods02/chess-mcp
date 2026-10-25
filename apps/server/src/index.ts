import { serve } from '@hono/node-server';
import { typeSafeAi } from '@ai-sdk/typesafe-ai';
import { createApp } from './app.ts';
import type { BoardMode } from './board-ui.ts';
import { createJev } from './opponents/jev.ts';
import { SqliteStore } from './store/sqlite.ts';

const port = Number(process.env.PORT ?? 3000);
const store = new SqliteStore(process.env.DATABASE_PATH ?? 'data/chess.db');
const boardMode: BoardMode = process.env.BOARD_MODE === 'live' ? 'live' : 'per-round';
// Jev is only offered when a TypeSafe key is set (see .env.example).
const jevModel = process.env.JEV_MODEL ?? 'jev-latest';
const jev = process.env.TYPESAFE_AI_API_KEY
  ? createJev(typeSafeAi.decisionModel(jevModel))
  : undefined;

serve({ fetch: createApp({ store, jev, boardMode, logRequests: true }).fetch, port }, (info) => {
  const jevStatus = jev ? `Jev on (${jevModel})` : 'Jev off: no TYPESAFE_AI_API_KEY';
  console.log(
    `MCP server listening on http://localhost:${info.port}/mcp (board: ${boardMode}, ${jevStatus})`,
  );
});

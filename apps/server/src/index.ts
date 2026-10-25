import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import type { BoardMode } from './board-ui.ts';
import { SqliteStore } from './store/sqlite.ts';

const port = Number(process.env.PORT ?? 3000);
const store = new SqliteStore(process.env.DATABASE_PATH ?? 'data/chess.db');
const boardMode: BoardMode = process.env.BOARD_MODE === 'live' ? 'live' : 'per-round';

serve({ fetch: createApp(store, boardMode, { logRequests: true }).fetch, port }, (info) => {
  console.log(`MCP server listening on http://localhost:${info.port}/mcp (board: ${boardMode})`);
});

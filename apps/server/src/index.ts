import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { SqliteStore } from './store/sqlite.ts';

const port = Number(process.env.PORT ?? 3000);
const store = new SqliteStore(process.env.DATABASE_PATH ?? 'data/chess.db');

serve({ fetch: createApp(store).fetch, port }, (info) => {
  console.log(`MCP server listening on http://localhost:${info.port}/mcp`);
});

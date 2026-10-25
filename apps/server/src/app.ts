import { createMcpHonoApp } from '@modelcontextprotocol/hono';
import { createMcpHandler } from '@modelcontextprotocol/server';
import type { Context } from 'hono';
import { buildMcpServer } from './mcp.ts';
import type { GameStore } from './store/store.ts';

export function createApp(store: GameStore) {
  // Stateless: a fresh McpServer per request. Games live in the store, keyed by ID.
  const mcp = createMcpHandler(() => buildMcpServer(store));

  // createMcpHonoApp adds JSON body parsing and localhost Host/Origin validation.
  const app = createMcpHonoApp();
  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.all('/mcp', (c: Context) => mcp.fetch(c.req.raw, { parsedBody: c.get('parsedBody') }));
  return app;
}

import { createMcpHonoApp } from '@modelcontextprotocol/hono';
import { createMcpHandler } from '@modelcontextprotocol/server';
import type { Context } from 'hono';
import { buildMcpServer } from './mcp.ts';

export function createApp() {
  // Stateless: a fresh McpServer per request. Game state will live in the database.
  const mcp = createMcpHandler(buildMcpServer);

  // createMcpHonoApp adds JSON body parsing and localhost Host/Origin validation.
  const app = createMcpHonoApp();
  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.all('/mcp', (c: Context) => mcp.fetch(c.req.raw, { parsedBody: c.get('parsedBody') }));
  return app;
}

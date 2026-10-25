import { createMcpHonoApp } from '@modelcontextprotocol/hono';
import { createMcpHandler } from '@modelcontextprotocol/server';
import type { Context } from 'hono';
import { buildMcpServer, type ServerOptions } from './mcp.ts';

export function createApp({
  logRequests = false,
  host,
  ...options
}: ServerOptions & {
  logRequests?: boolean;
  /** The public hostname when hosted. Requests for any other host are refused. */
  host?: string;
}) {
  // Stateless: a fresh McpServer per request. Games live in the store, keyed by ID.
  const mcp = createMcpHandler(() => buildMcpServer(options));

  // createMcpHonoApp adds JSON body parsing and Host validation (localhost only by default).
  const app = createMcpHonoApp(host ? { host, allowedHosts: [host] } : {});
  app.get('/health', (c) => c.json({ status: 'ok' }));
  if (logRequests) app.use('/mcp', logMcpRequest);
  app.all('/mcp', (c: Context) => mcp.fetch(c.req.raw, { parsedBody: c.get('parsedBody') }));
  return app;
}

/** One line per MCP request, e.g. `tools/call submit_human_move → 200`, to see what clients do. */
async function logMcpRequest(c: Context, next: () => Promise<void>) {
  const body = c.get('parsedBody') as { method?: string; params?: { name?: string } } | undefined;
  await next();
  if (!body?.method || body.method.startsWith('notifications/')) return;
  const name = body.params?.name ? ` ${body.params.name}` : '';
  console.log(`${body.method}${name} → ${c.res.status}`);
}

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { McpServer } from '@modelcontextprotocol/server';

export const BOARD_URI = 'ui://chess/board.html';

// Single-file build of packages/board-app (run `pnpm build` first). Read lazily so the server
// still starts if the UI hasn't been built yet.
const boardHtmlPath = fileURLToPath(import.meta.resolve('@chess-mcp/board-app/index.html'));

export function buildMcpServer() {
  const server = new McpServer({ name: 'chess-mcp', version: '0.0.0' });

  registerAppResource(
    server,
    'Chess board',
    BOARD_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => ({
      contents: [
        { uri: BOARD_URI, mimeType: RESOURCE_MIME_TYPE, text: readFileSync(boardHtmlPath, 'utf8') },
      ],
    }),
  );

  return server;
}

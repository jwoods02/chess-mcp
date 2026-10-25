import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/server';

export const BOARD_URI = 'ui://chess/board.html';

/** Put on a tool's `_meta` to render its result with the board UI. */
export const SHOWS_BOARD = { ui: { resourceUri: BOARD_URI } };

/**
 * Put on a tool's `_meta` to say explicitly that the board may call it, without drawing a board.
 * The spec's default visibility already allows this, but some hosts are stricter than the spec.
 */
export const CALLABLE_FROM_BOARD = { ui: { visibility: ['model', 'app'] } };

// Single-file build of packages/board-app. Read on each request so `pnpm dev` picks up rebuilds.
const boardHtmlPath = fileURLToPath(import.meta.resolve('@chess-mcp/board-app/index.html'));

export function registerBoardUi(server: McpServer) {
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
}

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/server';

export const BOARD_URI = 'ui://chess/board.html';

/**
 * `per-round`: a new board appears with each of the assistant's moves.
 * `live` (experiment): one board per game that updates itself, so moves never draw a new board.
 */
export type BoardMode = 'per-round' | 'live';

/** Put on a tool's `_meta` to render its result with the board UI. */
export const SHOWS_BOARD = { ui: { resourceUri: BOARD_URI } };

/**
 * Put on a tool's `_meta` so the board can call it without drawing a board. Hosts refuse calls from
 * the board to tools that aren't marked like this.
 */
export const CALLABLE_FROM_BOARD = { ui: { visibility: ['model', 'app'] } };

// Single-file build of packages/board-app. Read on each request so `pnpm dev` picks up rebuilds.
const boardHtmlPath = fileURLToPath(import.meta.resolve('@chess-mcp/board-app/index.html'));

export function registerBoardUi(server: McpServer, boardMode: BoardMode) {
  registerAppResource(
    server,
    'Chess board',
    BOARD_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => ({
      contents: [{ uri: BOARD_URI, mimeType: RESOURCE_MIME_TYPE, text: boardHtml(boardMode) }],
    }),
  );
}

/** The board UI, told which mode it's in (it only polls for updates in live mode). */
function boardHtml(boardMode: BoardMode) {
  const meta = `<meta name="chess-board-mode" content="${boardMode}" />`;
  return readFileSync(boardHtmlPath, 'utf8').replace('</head>', `${meta}</head>`);
}

import {
  getUiCapability,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/server';

export const BOARD_URI = 'ui://chess/board.html';

/** Put on a tool's `_meta` to render its result with the board UI. */
export const SHOWS_BOARD = { ui: { resourceUri: BOARD_URI } };

/**
 * Put on a tool's `_meta` to say explicitly that the board may call it, without drawing a board.
 * The spec's default visibility already allows this, but some hosts are stricter than the spec.
 */
export const CALLABLE_FROM_BOARD = { ui: { visibility: ['model', 'app'] } };

/**
 * Whether this request's client renders MCP Apps, so the human sees the board UI. Clients declare it
 * per request on the 2026-07-28 protocol; older clients that don't say count as no.
 */
export function clientShowsBoard(server: McpServer): boolean {
  const ui = getUiCapability(server.server.getClientCapabilities());
  return ui?.mimeTypes?.includes(RESOURCE_MIME_TYPE) ?? false;
}

/** `boardHtml` returns the single-file build of packages/board-app; each runtime loads it its own way. */
export function registerBoardUi(server: McpServer, boardHtml: () => string) {
  registerAppResource(
    server,
    'Chess board',
    BOARD_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => ({
      contents: [{ uri: BOARD_URI, mimeType: RESOURCE_MIME_TYPE, text: boardHtml() }],
    }),
  );
}

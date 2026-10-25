import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The board UI for the Node server and tests. Read on each request so `pnpm dev` picks up rebuilds.
 * The Worker imports the same file as text instead (worker.ts).
 */
export function readBoardHtml() {
  return readFileSync(
    fileURLToPath(import.meta.resolve('@chess-mcp/board-app/index.html')),
    'utf8',
  );
}

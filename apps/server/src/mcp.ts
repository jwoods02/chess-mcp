import { McpServer } from '@modelcontextprotocol/server';
import { registerBoardUi } from './board-ui.ts';
import type { GameStore } from './store/store.ts';
import { registerDrawOffer } from './tools/draw-offer.ts';
import { registerGetGame } from './tools/get-game.ts';
import { registerLegalMoves } from './tools/legal-moves.ts';
import { registerMakeMove } from './tools/make-move.ts';
import { registerNewGame } from './tools/new-game.ts';
import { registerResignGame } from './tools/resign-game.ts';
import { registerUndoMove } from './tools/undo-move.ts';

export function buildMcpServer(store: GameStore) {
  const server = new McpServer({ name: 'chess-mcp', version: '0.0.0' });

  registerBoardUi(server);
  registerNewGame(server, store);
  registerGetGame(server, store);
  registerMakeMove(server, store);
  registerLegalMoves(server, store);
  registerUndoMove(server, store);
  registerResignGame(server, store);
  registerDrawOffer(server, store);

  return server;
}

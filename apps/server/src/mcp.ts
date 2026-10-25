import { McpServer } from '@modelcontextprotocol/server';
import { registerBoardUi } from './board-ui.ts';
import type { GameStore } from './store/store.ts';
import { registerDrawOffer } from './tools/draw-offer.ts';
import { registerGetGame } from './tools/get-game.ts';
import { registerLegalMoves } from './tools/legal-moves.ts';
import { registerMakeMove } from './tools/make-move.ts';
import { registerNewGame } from './tools/new-game.ts';
import { registerResignGame } from './tools/resign-game.ts';
import { registerSubmitHumanMove } from './tools/submit-human-move.ts';
import { registerUndoMove } from './tools/undo-move.ts';

// Stateless server, so it can't see per call whether the client renders apps. The model can.
const INSTRUCTIONS = [
  'Chess: play, teach and review games with the user. The server validates every move and stores the game, so read the position from the latest tool result; a board you track yourself drifts.',
  'When the user makes a move and you play the other side, relay their move and play your reply in the same turn. Then answer the way a friend across the board would: your move, and a short comment if there is one worth making.',
  'If the board is shown inline in the chat, the user already sees the board, FEN, moves and ply, so leave them out of your reply. If it is not shown, include the board from the tool result.',
].join('\n');

export function buildMcpServer(store: GameStore) {
  const server = new McpServer(
    { name: 'chess-mcp', version: '0.0.0' },
    { instructions: INSTRUCTIONS },
  );

  registerBoardUi(server);
  registerNewGame(server, store);
  registerGetGame(server, store);
  registerMakeMove(server, store);
  registerSubmitHumanMove(server, store);
  registerLegalMoves(server, store);
  registerUndoMove(server, store);
  registerResignGame(server, store);
  registerDrawOffer(server, store);

  return server;
}

import { EXTENSION_ID, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { McpServer } from '@modelcontextprotocol/server';
import { registerBoardUi, type BoardMode } from './board-ui.ts';
import type { Opponent } from './opponents/opponent.ts';
import type { GameStore } from './store/store.ts';
import type { ToolDeps } from './tools/common.ts';
import { registerBoardState } from './tools/board-state.ts';
import { registerDrawOffer } from './tools/draw-offer.ts';
import { registerGetGame } from './tools/get-game.ts';
import { registerLegalMoves } from './tools/legal-moves.ts';
import { registerMakeMove } from './tools/make-move.ts';
import { registerNewGame } from './tools/new-game.ts';
import { registerPlayAgainstJev } from './tools/play-against-jev.ts';
import { registerResignGame } from './tools/resign-game.ts';
import { registerSubmitHumanMove } from './tools/submit-human-move.ts';
import { registerUndoMove } from './tools/undo-move.ts';

// Stateless server, so it can't see per call whether the client renders apps. The model can.
const INSTRUCTIONS = [
  'Chess: play, teach and review games with the user. The server validates every move and stores the game, so read the position from the latest tool result; a board you track yourself drifts.',
  'When the user makes a move and you play the other side, relay their move and play your reply in the same turn. Then answer the way a friend across the board would: your move, and a short comment if there is one worth making.',
  'The user can also move by dragging pieces on the inline board. When the board could submit the move itself, your context says it is already submitted, so reply with make_move. Otherwise the board posts the move as a chat message; submit it like a typed move.',
  'If the board is shown inline in the chat, the user already sees the board, FEN, moves and ply, so leave them out of your reply. If it is not shown, include the board from the tool result.',
];

const JEV_INSTRUCTIONS =
  "Jev is a fast chess model the server runs, not an LLM. When the human plays Jev, submit their moves with play_against_jev: Jev's reply arrives in the same result, which also shows the board. Your role there is coach: comment on the position and the human's choices when it helps, without playing moves for either side.";

export interface ServerOptions {
  store: GameStore;
  /** Present only when a TypeSafe API key is configured. */
  jev?: Opponent;
  boardMode?: BoardMode;
}

export function buildMcpServer({ store, jev, boardMode = 'per-round' }: ServerOptions) {
  const instructions = [...INSTRUCTIONS, ...(jev ? [JEV_INSTRUCTIONS] : [])].join('\n');
  const server = new McpServer(
    { name: 'chess-mcp', version: '0.0.0' },
    {
      instructions,
      // Advertise MCP Apps support. Hosts using newer protocol versions read this from
      // `server/discover`, and some won't let the board call tools without it.
      capabilities: { extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } } },
    },
  );

  // In live mode the board updates itself, so moves don't draw a new one.
  const deps: ToolDeps = { store, jev, movesShowBoard: boardMode === 'per-round' };

  registerBoardUi(server, boardMode);
  registerBoardState(server, deps);
  registerNewGame(server, deps);
  registerGetGame(server, deps);
  registerMakeMove(server, deps);
  registerSubmitHumanMove(server, deps);
  if (jev) registerPlayAgainstJev(server, deps);
  registerLegalMoves(server, deps);
  registerUndoMove(server, deps);
  registerResignGame(server, deps);
  registerDrawOffer(server, deps);

  return server;
}

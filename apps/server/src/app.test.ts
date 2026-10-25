import type { GameView } from '@chess-mcp/shared';
import { Experimental_DecisionMockModelV4 as MockDecisionModel } from 'ai/test';
import { describe, expect, test } from 'vitest';
import { createApp } from './app.ts';
import { BOARD_URI } from './board-ui.ts';
import { createJev } from './opponents/jev.ts';
import type { Opponent } from './opponents/opponent.ts';
import { mockJevModel } from './opponents/mock-jev.ts';
import { SqliteStore } from './store/sqlite.ts';

const app = createApp({ store: new SqliteStore(':memory:') });

async function rpc(
  method: string,
  params: object = {},
  server: ReturnType<typeof createApp> = app,
) {
  const res = await server.request('/mcp', {
    method: 'POST',
    headers: {
      host: 'localhost:3000',
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  // Responses are sent as a single server-sent event: `event: message\ndata: {...}`.
  const data = (await res.text()).split('\n').find((line) => line.startsWith('data: '));
  return JSON.parse(data!.slice('data: '.length));
}

async function callTool(name: string, args: object, server: ReturnType<typeof createApp> = app) {
  const { result } = await rpc('tools/call', { name, arguments: args }, server);
  return result as { isError?: boolean; content: { text: string }[]; structuredContent: GameView };
}

test('GET /health', async () => {
  const res = await app.request('/health', { headers: { host: 'localhost:3000' } });
  expect(await res.json()).toEqual({ status: 'ok' });
});

test('serves the board UI as an MCP App resource', async () => {
  const read = await rpc('resources/read', { uri: BOARD_URI });
  expect(read.result.contents[0].text).toContain('<div id="root">');
});

test('tells the model how to talk about the game', async () => {
  const { result } = await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '0' },
  });
  expect(result.capabilities.extensions['io.modelcontextprotocol/ui']).toEqual({
    mimeTypes: ['text/html;profile=mcp-app'],
  });
  expect(result.instructions).toContain('same turn');
  expect(result.instructions).toContain('leave them out of your reply');
});

type ToolInfo = { name: string; _meta?: { ui?: { resourceUri?: string; visibility?: string[] } } };

/** The tools, their names, and which of them draw the board. */
async function listTools(server: ReturnType<typeof createApp> = app) {
  const { result } = await rpc('tools/list', {}, server);
  const tools = result.tools as ToolInfo[];
  return {
    tools,
    names: tools.map((t) => t.name).sort(),
    showBoard: tools
      .filter((t) => t._meta?.ui?.resourceUri === BOARD_URI)
      .map((t) => t.name)
      .sort(),
  };
}

test('lists the game tools, showing the board only when a human needs to see a new position', async () => {
  const tools = await listTools();
  expect(tools.names).toEqual([
    'draw_offer',
    'get_game',
    'legal_moves',
    'make_move',
    'new_game',
    'resign_game',
    'submit_human_move',
    'undo_move',
  ]);
  expect(tools.showBoard).toEqual(['get_game', 'make_move', 'new_game', 'undo_move']);
});

test('marks submit_human_move as callable from the board, without drawing one', async () => {
  // The spec allows this by default, but we mark it explicitly for stricter hosts.
  const { tools } = await listTools();
  const submit = tools.find((t) => t.name === 'submit_human_move');
  expect(submit?._meta?.ui?.visibility).toContain('app');
  expect(submit?._meta?.ui?.resourceUri).toBeUndefined();
});

test('plays a game to checkmate through the tools', async () => {
  const start = await callTool('new_game', { white: 'human', black: 'llm' });
  const { gameId } = start.structuredContent;
  expect(start.content[0]!.text).toContain('Waiting for the human');
  // Some clients (Claude Code) show the model only the structured result, so it carries the board
  // and the next step too.
  expect(start.structuredContent.board).toContain('1 │ R N B Q K B N R');
  expect(start.structuredContent.next).toContain('call submit_human_move with ply 0');

  // The human's moves are relayed with submit_human_move; the assistant plays with make_move.
  const moves = ['f3', 'e5', 'g4', 'Qh4#'];
  let result = start;
  for (const [ply, move] of moves.entries()) {
    result = await callTool(ply % 2 === 0 ? 'submit_human_move' : 'make_move', {
      gameId,
      ply,
      move,
    });
    expect(result.isError).toBeFalsy();
  }

  expect(result.structuredContent).toMatchObject({
    status: 'finished',
    result: '0-1',
    termination: 'checkmate',
  });
  expect(result.content[0]!.text).toContain('Game over: 0-1 by checkmate.');
});

test('rejects illegal moves and stale plies, showing the current board', async () => {
  const { structuredContent } = await callTool('new_game', { white: 'human', black: 'llm' });
  const { gameId } = structuredContent;

  const illegal = await callTool('submit_human_move', { gameId, ply: 0, move: 'e5' });
  expect(illegal.isError).toBe(true);
  expect(illegal.content[0]!.text).toContain('Error [illegal_move]');

  await callTool('submit_human_move', { gameId, ply: 0, move: 'e4' });
  const stale = await callTool('submit_human_move', { gameId, ply: 0, move: 'd4' });
  expect(stale.isError).toBe(true);
  expect(stale.content[0]!.text).toContain('Error [stale_state]');
  expect(stale.structuredContent.moves).toEqual(['e4']);
});

test('points the model at the right move tool', async () => {
  const { structuredContent } = await callTool('new_game', { white: 'human', black: 'llm' });
  const wrongTool = await callTool('make_move', {
    gameId: structuredContent.gameId,
    ply: 0,
    move: 'e4',
  });
  expect(wrongTool.isError).toBe(true);
  expect(wrongTool.content[0]!.text).toContain('Error [not_your_turn]');
  expect(wrongTool.content[0]!.text).toContain('call submit_human_move with ply 0');
});

test("asks the model to show the board when a human move leaves a position the human hasn't seen", async () => {
  const { structuredContent } = await callTool('new_game', { white: 'human', black: 'human' });
  const { gameId } = structuredContent;
  const result = await callTool('submit_human_move', { gameId, ply: 0, move: 'e4' });
  expect(result.content[0]!.text).toContain('call get_game to show them the board');
  expect(result.structuredContent.note).toContain('call get_game to show them the board');
});

test('reports an unknown game', async () => {
  const result = await callTool('get_game', { gameId: 'nope' });
  expect(result).toMatchObject({
    isError: true,
    content: [{ text: 'Error [game_not_found]: No game with ID nope.' }],
  });
});

describe('playing Jev', () => {
  const withJev = (pick?: string) =>
    createApp({ store: new SqliteStore(':memory:'), jev: createJev(mockJevModel(pick)) });

  test('Jev is only offered when the server has a TypeSafe key', async () => {
    const seats = async (server: ReturnType<typeof createApp>) => {
      const { result } = await rpc('tools/list', {}, server);
      const newGame = result.tools.find((t: { name: string }) => t.name === 'new_game');
      return newGame.inputSchema.properties.white.enum;
    };
    expect(await seats(app)).toEqual(['human', 'llm']);
    expect(await seats(withJev())).toEqual(['human', 'llm', 'jev']);
  });

  test("Jev replies inside the human's move", async () => {
    const server = withJev('e5');
    const start = await callTool('new_game', { white: 'human', black: 'jev' }, server);
    const { gameId } = start.structuredContent;

    const result = await callTool('play_against_jev', { gameId, ply: 0, move: 'e4' }, server);

    expect(result.structuredContent).toMatchObject({
      moves: ['e4', 'e5'],
      ply: 2,
      toMove: 'human',
    });
    expect(result.structuredContent.lastMove).toMatchObject({ san: 'e5', by: 'jev' });
    expect(result.content[0]!.text).toContain('Last move: e5 (Jev; its instinct favoured e5 100%');
  });

  test("the human's move against Jev has its own tool, which shows the board", async () => {
    const server = withJev('e5');
    expect((await listTools(server)).showBoard).toContain('play_against_jev');
    expect((await listTools()).names).not.toContain('play_against_jev');

    const vsJev = await callTool('new_game', { white: 'human', black: 'jev' }, server);
    expect(vsJev.content[0]!.text).toContain('call play_against_jev with ply 0');
    const wrong = await callTool(
      'submit_human_move',
      { gameId: vsJev.structuredContent.gameId, ply: 0, move: 'e4' },
      server,
    );
    expect(wrong.content[0]!.text).toContain('Error [wrong_tool]');

    const vsAssistant = await callTool('new_game', { white: 'human', black: 'llm' }, server);
    const alsoWrong = await callTool(
      'play_against_jev',
      { gameId: vsAssistant.structuredContent.gameId, ply: 0, move: 'e4' },
      server,
    );
    expect(alsoWrong.content[0]!.text).toContain('Error [wrong_tool]');
  });

  test('Jev moves first when it plays White', async () => {
    const start = await callTool('new_game', { white: 'jev', black: 'human' }, withJev('d4'));
    expect(start.structuredContent).toMatchObject({
      moves: ['d4'],
      toMove: 'human',
      orientation: 'b',
    });
  });

  test('if Jev fails, a random legal move keeps the game going', async () => {
    const failing = new MockDecisionModel({
      doDecide: async () => {
        throw new Error('Jev is down');
      },
    });
    const server = createApp({ store: new SqliteStore(':memory:'), jev: createJev(failing) });
    const start = await callTool('new_game', { white: 'human', black: 'jev' }, server);

    const result = await callTool(
      'play_against_jev',
      { gameId: start.structuredContent.gameId, ply: 0, move: 'e4' },
      server,
    );

    expect(result.structuredContent).toMatchObject({ ply: 2, toMove: 'human' });
    expect(result.content[0]!.text).toContain(
      'Jev was unavailable, so a random legal move was played',
    );
  });

  test('the assistant can play Jev, and Jev replies inside make_move', async () => {
    const server = withJev('e5');
    const start = await callTool('new_game', { white: 'llm', black: 'jev' }, server);
    const result = await callTool(
      'make_move',
      { gameId: start.structuredContent.gameId, ply: 0, move: 'e4' },
      server,
    );
    expect(result.structuredContent).toMatchObject({ moves: ['e4', 'e5'], toMove: 'llm' });
  });

  test('an illegal answer from Jev falls back to a random legal move', async () => {
    const illegal: Opponent = { chooseMove: async () => ({ move: 'Ke7' }) }; // the king can't move yet
    const server = createApp({ store: new SqliteStore(':memory:'), jev: illegal });
    const start = await callTool('new_game', { white: 'human', black: 'jev' }, server);
    const result = await callTool(
      'play_against_jev',
      { gameId: start.structuredContent.gameId, ply: 0, move: 'e4' },
      server,
    );
    expect(result.structuredContent).toMatchObject({ ply: 2, toMove: 'human' });
    expect(result.content[0]!.text).toContain('Jev was unavailable');
  });

  test('a resignation while Jev is thinking is not overwritten', async () => {
    let answer: (move: { move: string }) => void = () => {};
    const slow: Opponent = { chooseMove: () => new Promise((resolve) => (answer = resolve)) };
    const server = createApp({ store: new SqliteStore(':memory:'), jev: slow });
    const start = await callTool('new_game', { white: 'human', black: 'jev' }, server);
    const { gameId } = start.structuredContent;

    const move = callTool('play_against_jev', { gameId, ply: 0, move: 'e4' }, server);
    await new Promise((resolve) => setTimeout(resolve, 10)); // let it reach Jev
    const resigned = await callTool('resign_game', { gameId, ply: 0, color: 'w' }, server);
    answer({ move: 'e5' });

    expect(resigned.structuredContent).toMatchObject({
      status: 'finished',
      termination: 'resignation',
    });
    expect((await move).content[0]!.text).toContain('Error [stale_state]');
    expect((await callTool('get_game', { gameId }, server)).structuredContent.termination).toBe(
      'resignation',
    );
  });

  test('nobody resigns or answers draws for Jev, and Jev declines draw offers', async () => {
    const server = withJev('e5');
    const start = await callTool('new_game', { white: 'human', black: 'jev' }, server);
    const { gameId } = start.structuredContent;

    const resignForJev = await callTool('resign_game', { gameId, ply: 0, color: 'b' }, server);
    expect(resignForJev.content[0]!.text).toContain('Error [invalid_players]');
    const offerToJev = await callTool(
      'draw_offer',
      { gameId, ply: 0, action: 'offer', color: 'w' },
      server,
    );
    expect(offerToJev.content[0]!.text).toContain("Jev doesn't accept draws");
  });

  test('Jev can only play one side', async () => {
    const result = await callTool('new_game', { white: 'jev', black: 'jev' }, withJev());
    expect(result.content[0]!.text).toContain('Error [invalid_players]');
  });
});

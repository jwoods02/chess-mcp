import type { GameView } from '@chess-mcp/shared';
import { expect, test } from 'vitest';
import { createApp } from './app.ts';
import { BOARD_URI } from './board-ui.ts';
import { MemoryStore } from './store/memory.ts';

const app = createApp(new MemoryStore());

async function rpc(method: string, params: object = {}) {
  const res = await app.request('/mcp', {
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

async function callTool(name: string, args: object) {
  const { result } = await rpc('tools/call', { name, arguments: args });
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
  expect(result.instructions).toContain('same turn');
  expect(result.instructions).toContain('leave them out of your reply');
});

test('lists the game tools, showing the board only when a human needs to see a new position', async () => {
  const { result } = await rpc('tools/list');
  const tools = Object.fromEntries(result.tools.map((t: { name: string }) => [t.name, t]));
  expect(Object.keys(tools).sort()).toEqual([
    'draw_offer',
    'get_game',
    'legal_moves',
    'make_move',
    'new_game',
    'resign_game',
    'submit_human_move',
    'undo_move',
  ]);
  const showsBoard = Object.keys(tools).filter(
    (name) => tools[name]._meta?.ui?.resourceUri === BOARD_URI,
  );
  expect(showsBoard.sort()).toEqual(['get_game', 'make_move', 'new_game', 'undo_move']);
});

test('plays a game to checkmate through the tools', async () => {
  const start = await callTool('new_game', { white: 'human', black: 'llm' });
  const { gameId } = start.structuredContent;
  expect(start.content[0]!.text).toContain('Waiting for the human');

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
});

test('reports an unknown game', async () => {
  const result = await callTool('get_game', { gameId: 'nope' });
  expect(result).toMatchObject({
    isError: true,
    content: [{ text: 'Error [game_not_found]: No game with ID nope.' }],
  });
});

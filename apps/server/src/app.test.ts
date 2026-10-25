import type { GameSetup, GameView, MoveFacts, PositionFacts } from '@chess-mcp/shared';
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
  expect(result.instructions).toContain('keep the board, FEN, moves and ply out of your reply');
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
    'analyze_position',
    'draw_offer',
    'get_game',
    'legal_moves',
    'make_move',
    'new_game',
    'resign_game',
    'show_game_setup',
    'submit_human_move',
    'undo_move',
    'update_game_settings',
  ]);
  expect(tools.showBoard).toEqual([
    'get_game',
    'make_move',
    'new_game',
    'show_game_setup',
    'undo_move',
  ]);
});

test('marks submit_human_move as callable from the board, without drawing one', async () => {
  // The spec allows this by default, but we mark it explicitly for stricter hosts.
  const { tools } = await listTools();
  const submit = tools.find((t) => t.name === 'submit_human_move');
  expect(submit?._meta?.ui?.visibility).toContain('app');
  expect(submit?._meta?.ui?.resourceUri).toBeUndefined();
});

test('leaves out the ASCII board when the client shows the board UI', async () => {
  // On the 2026-07-28 protocol, each request says what the client supports.
  const res = await app.request('/mcp', {
    method: 'POST',
    headers: {
      host: 'localhost:3000',
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2026-07-28',
      'mcp-method': 'tools/call',
      'mcp-name': 'new_game',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'new_game',
        arguments: { white: 'human', black: 'llm' },
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientInfo': { name: 'test', version: '0' },
          'io.modelcontextprotocol/clientCapabilities': {
            extensions: {
              'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] },
            },
          },
        },
      },
    }),
  });
  const { result } = await res.json();
  expect(result.structuredContent.board).toBeUndefined();
  expect(result.structuredContent.next).toContain('call submit_human_move with ply 0');
  expect(result.content[0].text).not.toContain('│');
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

test('legal_moves reads a square loosely, and rejects one that is not on the board', async () => {
  const { structuredContent } = await callTool('new_game', { white: 'human', black: 'llm' });
  const { gameId } = structuredContent;
  const knight = await callTool('legal_moves', { gameId, square: ' G1 ' });
  expect(knight.content[0]!.text).toBe('Legal moves from g1: Nf3, Nh3');
  const offBoard = await callTool('legal_moves', { gameId, square: 'z9' });
  expect(offBoard.isError).toBe(true);
  expect(offBoard.content[0]!.text).toContain('A square is a file a-h and a rank 1-8');
});

test('draw and undo results say what happened when the board alone does not', async () => {
  const { structuredContent } = await callTool('new_game', { white: 'human', black: 'human' });
  const { gameId } = structuredContent;
  await callTool('draw_offer', { gameId, ply: 0, action: 'offer', color: 'w' });
  const declined = await callTool('draw_offer', { gameId, ply: 0, action: 'decline', color: 'b' });
  expect(declined.structuredContent.note).toBe('Black declined the draw offer.');

  await callTool('submit_human_move', { gameId, ply: 0, move: 'e4' });
  await callTool('submit_human_move', { gameId, ply: 1, move: 'e5' });
  const undone = await callTool('undo_move', { gameId, ply: 2, plies: 5 });
  expect(undone.structuredContent.note).toBe('Took back 2 half-moves, not 5: all there were.');

  await callTool('draw_offer', { gameId, ply: 0, action: 'offer', color: 'w' });
  const crossed = await callTool('draw_offer', { gameId, ply: 0, action: 'offer', color: 'b' });
  expect(crossed.structuredContent).toMatchObject({
    termination: 'draw_agreed',
    note: 'Both sides offered a draw, so the draw is agreed.',
  });
});

test('reports an unknown game', async () => {
  const result = await callTool('get_game', { gameId: 'nope' });
  expect(result).toMatchObject({
    isError: true,
    content: [{ text: 'Error [game_not_found]: No game with ID nope.' }],
  });
});

test('shows the new-game options, and a play_chess prompt to start from', async () => {
  const shown = (await callTool('show_game_setup', {})) as unknown as {
    structuredContent: GameSetup;
  };
  expect(shown.structuredContent.setup).toMatchObject({
    opponents: ['llm'],
    coaching: [{ id: 'play', label: 'Just play' }, { id: 'blunder_check' }, { id: 'hints' }],
    levels: [{ id: 'beginner', rating: 400 }, { id: 'casual' }, { id: 'club' }, { id: 'best' }],
  });

  const { result: prompts } = await rpc('prompts/list');
  expect(prompts.prompts.map((p: { name: string }) => p.name)).toEqual(['play_chess']);
  const { result: partial } = await rpc('prompts/get', {
    name: 'play_chess',
    arguments: { color: 'black' },
  });
  expect(partial.messages[0].content.text).toContain('as Black');
  expect(partial.messages[0].content.text).toContain('show_game_setup');
  const { result: full } = await rpc('prompts/get', {
    name: 'play_chess',
    arguments: { opponent: 'assistant', color: 'white', coaching: 'hints', level: 'casual' },
  });
  expect(full.messages[0].content.text).toBe(
    'Let\'s play chess against you, as White, with the opponent at casual player strength, with "Hints" coaching. Start the game with new_game.',
  );
});

describe('coaching', () => {
  test('analyze_position checks a line without changing the game', async () => {
    const start = await callTool('new_game', { white: 'human', black: 'llm' });
    const { gameId } = start.structuredContent;
    const { structuredContent: analysis } = (await callTool('analyze_position', {
      gameId,
      moves: ['f3', 'e5', 'g4'],
    })) as unknown as { structuredContent: { line: MoveFacts[]; after: PositionFacts } };
    expect(analysis.line.map((m) => m.move)).toEqual(['f3', 'e5', 'g4']);
    expect(analysis.line[2]!.allowsMate).toEqual(['Qh4#']);
    expect(analysis.after.mateInOne).toEqual(['Qh4#']);
    expect((await callTool('get_game', { gameId })).structuredContent.ply).toBe(0);

    const illegal = await callTool('analyze_position', { gameId, moves: ['e5'] });
    expect(illegal.content[0]!.text).toContain('Error [illegal_move]');
  });

  test("analyze_position gives each move of a line its own facts, and says when it's mate", async () => {
    const start = await callTool('new_game', { white: 'human', black: 'llm' });
    const { gameId } = start.structuredContent;
    const tradeResult = await callTool('analyze_position', { gameId, moves: ['e4', 'd5', 'exd5'] });
    const trade = tradeResult.structuredContent as unknown as { line: MoveFacts[] };
    expect(tradeResult.content[0]!.text).toContain('best capture: Qxd5 wins 1 point.');
    // Material after each move itself, not after the move that follows it in the line.
    expect(trade.line.map((m) => [m.move, m.material, m.reply])).toEqual([
      ['e4', 'level', undefined],
      ['d5', 'level', undefined],
      ['exd5', 'White is up 1 point', undefined],
    ]);

    const mate = await callTool('analyze_position', { gameId, moves: ['f3', 'e5', 'g4', 'Qh4#'] });
    const { after } = mate.structuredContent as unknown as { after: PositionFacts };
    expect(after).toMatchObject({ over: 'checkmate', mateInOne: [] });
    expect(mate.content[0]!.text).toContain('After the line: White is checkmated');
  });

  test('every mode offers a review of the key moments when the game ends', async () => {
    const start = await callTool('new_game', { white: 'human', black: 'llm' });
    const { gameId } = start.structuredContent;
    await callTool('submit_human_move', { gameId, ply: 0, move: 'f3' });
    await callTool('make_move', { gameId, ply: 1, move: 'e5' });
    await callTool('submit_human_move', { gameId, ply: 2, move: 'g4' });

    const over = await callTool('make_move', { gameId, ply: 3, move: 'Qh4#' });
    const keyMoments = [{ move: '2. g4', reason: 'allowed mate in one: Qh4#' }];
    expect(over.structuredContent.coaching).toMatchObject({
      mode: 'play@1',
      speak: true,
      keyMoments,
    });
    expect(over.structuredContent.coaching.reason).toContain('Offer to go through');

    // The offer comes once, with the move that ended the game; the moments stay for later.
    const later = await callTool('get_game', { gameId });
    expect(later.structuredContent.coaching).toMatchObject({ speak: false, keyMoments });
  });

  test('a game with no human in it ends without a review', async () => {
    const start = await callTool('new_game', { white: 'llm', black: 'llm' });
    const { gameId } = start.structuredContent;
    let result = start;
    for (const [ply, move] of ['f3', 'e5', 'g4', 'Qh4#'].entries()) {
      result = await callTool('make_move', { gameId, ply, move });
    }
    expect(result.structuredContent.status).toBe('finished');
    expect(result.structuredContent.coaching.speak).toBe(false);
    expect(result.structuredContent.coaching.keyMoments).toBeUndefined();
  });

  test('hints nudges the human, unprompted, when they have a chance on their move', async () => {
    const start = await callTool('new_game', { white: 'human', black: 'llm', coaching: 'hints' });
    const { gameId } = start.structuredContent;
    await callTool('submit_human_move', { gameId, ply: 0, move: 'e4' });
    const quiet = await callTool('make_move', { gameId, ply: 1, move: 'e5' });
    expect(quiet.structuredContent.coaching.speak).toBe(false);

    await callTool('submit_human_move', { gameId, ply: 2, move: 'Nf3' });
    const chance = await callTool('make_move', { gameId, ply: 3, move: 'Qg5' });
    expect(chance.structuredContent.coaching).toMatchObject({
      speak: true,
      reason: 'The human can win material: Nxg5 wins 9 points.',
    });
  });

  test('blunder check stays quiet until a move matters, then says why with checked facts', async () => {
    const start = await callTool('new_game', {
      white: 'human',
      black: 'llm',
      coaching: 'blunder_check',
    });
    const { gameId } = start.structuredContent;
    // A new game carries the full guidance; later results only the one-line summary.
    expect(start.structuredContent.coaching).toMatchObject({
      mode: 'blunder_check@2',
      speak: false,
    });
    expect(start.structuredContent.coaching.guidance).toContain('blunder check');

    const quiet = await callTool('submit_human_move', { gameId, ply: 0, move: 'f3' });
    expect(quiet.structuredContent.coaching).toMatchObject({ speak: false, facts: { move: 'f3' } });
    expect(quiet.structuredContent.coaching.guidance).toBeUndefined();

    await callTool('make_move', { gameId, ply: 1, move: 'e5' });
    const blunder = await callTool('submit_human_move', { gameId, ply: 2, move: 'g4' });
    expect(blunder.structuredContent.coaching).toMatchObject({
      speak: true,
      reason: 'g4 allows mate in one: Qh4#.',
      facts: { allowsMate: ['Qh4#'] },
    });
    expect(blunder.structuredContent.coaching.guidance).toContain('undo_move');
    expect(blunder.content[0]!.text).toContain('Coach, speak now: g4 allows mate in one: Qh4#.');

    // Taking the move back doesn't repeat the warning: facts only come with a move just played.
    const undone = await callTool('undo_move', { gameId, ply: 3, plies: 1 });
    expect(undone.structuredContent.coaching).toMatchObject({ speak: false });
    expect(undone.structuredContent.coaching.facts).toBeUndefined();
  });

  test('play mode never speaks; settings change mid-game, including how the assistant plays', async () => {
    const start = await callTool('new_game', { white: 'human', black: 'llm' });
    const { gameId } = start.structuredContent;
    expect(start.structuredContent).toMatchObject({
      coachingMode: 'play@1',
      opponentLevel: 'best',
    });

    await callTool('submit_human_move', { gameId, ply: 0, move: 'f3' });
    await callTool('make_move', { gameId, ply: 1, move: 'e5' });
    const blunder = await callTool('submit_human_move', { gameId, ply: 2, move: 'g4' });
    expect(blunder.structuredContent.coaching.speak).toBe(false);
    expect(blunder.structuredContent.next).not.toContain('Play as');

    const changed = await callTool('update_game_settings', {
      gameId,
      ply: 3,
      coaching: 'blunder_check',
      opponentLevel: 'beginner',
    });
    expect(changed.structuredContent).toMatchObject({
      coachingMode: 'blunder_check@2',
      opponentLevel: 'beginner',
      ply: 3,
    });
    expect(changed.structuredContent.coaching.guidance).toContain('blunder check');
    expect(changed.structuredContent.next).toContain('Play as a beginner (about 400)');
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
    // Below 'best' Jev draws from its likeliest moves; this mock Jev only ever likes e5.
    const start = await callTool(
      'new_game',
      { white: 'human', black: 'jev', opponentLevel: 'beginner' },
      server,
    );
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

  test("undo against Jev says when it stops on the human's turn", async () => {
    const server = withJev('e5');
    const start = await callTool('new_game', { white: 'human', black: 'jev' }, server);
    const { gameId } = start.structuredContent;
    await callTool('play_against_jev', { gameId, ply: 0, move: 'e4' }, server);
    const undone = await callTool('undo_move', { gameId, ply: 2, plies: 1 }, server);
    expect(undone.structuredContent).toMatchObject({
      ply: 0,
      note: "Took back 2 half-moves, not 1: stopping on the human's turn against Jev.",
    });
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

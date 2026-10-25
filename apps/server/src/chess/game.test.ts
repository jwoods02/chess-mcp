import { describe, expect, test } from 'vitest';
import {
  applyMove,
  ChessError,
  createGame,
  draw,
  legalMoves,
  resign,
  toView,
  undo,
  type Game,
} from './game.ts';

const newGame = (startFen?: string) => createGame({ white: 'human', black: 'llm', startFen });
const play = (game: Game, ...moves: string[]) => moves.reduce(applyMove, game);

function errorCode(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    if (error instanceof ChessError) return error.code;
    throw error;
  }
  throw new Error('expected a ChessError');
}

describe('createGame', () => {
  test('starts from the standard position', () => {
    const view = toView(newGame());
    expect(view.fen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(view).toMatchObject({
      ply: 0,
      turn: 'w',
      toMove: 'human',
      status: 'active',
      orientation: 'w',
    });
  });

  test('rejects an invalid FEN', () => {
    expect(errorCode(() => newGame('not a fen'))).toBe('invalid_fen');
  });

  test('orients the board to the human', () => {
    expect(toView(createGame({ white: 'llm', black: 'human' })).orientation).toBe('b');
  });
});

describe('applyMove', () => {
  test('accepts SAN, UCI and loose forms', () => {
    const game = play(newGame(), 'e4', 'e7e5', 'nf3', 'Nc6', 'Bc4', 'Bc5', '0-0');
    expect(toView(game).moves).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O']);
  });

  test('records who played each move', () => {
    const view = toView(play(newGame(), 'e4', 'e5'));
    expect(view.lastMove).toEqual({ san: 'e5', from: 'e7', to: 'e5', by: 'llm' });
    expect(view.toMove).toBe('human');
  });

  test('rejects illegal moves and lists the legal ones', () => {
    expect(() => applyMove(newGame(), 'e5')).toThrow(/Legal moves: .*e4/);
  });

  test('requires the promotion piece', () => {
    const game = newGame('8/4P3/8/8/8/8/8/k6K w - - 0 1');
    expect(() => applyMove(game, 'e7e8')).toThrow(/say which piece/);
    expect(() => applyMove(game, 'e8')).toThrow(/say which piece/);
    expect(toView(applyMove(game, 'e7e8q')).moves).toEqual(['e8=Q']);
  });

  test('ends the game on checkmate', () => {
    const view = toView(play(newGame(), 'f3', 'e5', 'g4', 'Qh4#'));
    expect(view).toMatchObject({
      status: 'finished',
      result: '0-1',
      termination: 'checkmate',
      toMove: null,
    });
  });

  test('ends the game on stalemate', () => {
    const game = applyMove(newGame('k7/8/2Q5/8/8/8/8/7K w - - 0 1'), 'Qb6');
    expect(toView(game)).toMatchObject({ result: '1/2-1/2', termination: 'stalemate' });
  });

  test('ends the game on threefold repetition', () => {
    const shuffle = ['Nf3', 'Nf6', 'Ng1', 'Ng8'];
    const game = play(newGame(), ...shuffle, ...shuffle);
    expect(toView(game).termination).toBe('threefold_repetition');
  });

  test('ends the game on the fifty-move rule', () => {
    const game = applyMove(newGame('k7/8/8/8/8/8/R7/7K w - - 99 80'), 'Rb2');
    expect(toView(game).termination).toBe('fifty_move');
  });

  test('ends the game on insufficient material', () => {
    const game = applyMove(newGame('k7/8/8/8/8/8/1r6/K7 w - - 0 1'), 'Kxb2');
    expect(toView(game).termination).toBe('insufficient_material');
  });

  test('cannot move after the game is over', () => {
    const game = play(newGame(), 'f3', 'e5', 'g4', 'Qh4#');
    expect(errorCode(() => applyMove(game, 'e4'))).toBe('game_over');
  });
});

describe('undo', () => {
  test('takes back two plies by default and reopens a finished game', () => {
    const game = undo(play(newGame(), 'f3', 'e5', 'g4', 'Qh4#'), 2);
    expect(toView(game)).toMatchObject({ moves: ['f3', 'e5'], status: 'active', toMove: 'human' });
  });

  test('takes back fewer plies if the game is shorter', () => {
    expect(toView(undo(play(newGame(), 'e4'), 2)).ply).toBe(0);
  });

  test('fails when there is nothing to take back', () => {
    expect(errorCode(() => undo(newGame(), 2))).toBe('invalid_undo');
  });
});

describe('resign and draws', () => {
  test('resigning ends the game for the other side', () => {
    expect(toView(resign(newGame(), 'b'))).toMatchObject({
      result: '1-0',
      termination: 'resignation',
    });
  });

  test('a draw offer can be accepted by the other side', () => {
    const offered = draw(newGame(), 'offer', 'b');
    expect(toView(offered).drawOffer).toBe('b');
    expect(errorCode(() => draw(offered, 'accept', 'b'))).toBe('invalid_draw_action');
    expect(toView(draw(offered, 'accept', 'w'))).toMatchObject({
      result: '1/2-1/2',
      termination: 'draw_agreed',
    });
  });

  test('a draw offer can be declined', () => {
    expect(toView(draw(draw(newGame(), 'offer', 'w'), 'decline', 'b')).drawOffer).toBeUndefined();
  });

  test('cannot respond when no offer is pending', () => {
    expect(errorCode(() => draw(newGame(), 'accept', 'w'))).toBe('invalid_draw_action');
  });

  test('moving declines an offer, but the offering side can still move', () => {
    const whiteOffers = draw(newGame(), 'offer', 'w');
    expect(toView(applyMove(whiteOffers, 'e4')).drawOffer).toBe('w');
    expect(toView(play(whiteOffers, 'e4', 'e5')).drawOffer).toBeUndefined();
  });
});

test('legalMoves can filter by square and is empty once the game is over', () => {
  expect(legalMoves(newGame(), 'g1')).toEqual(['Nf3', 'Nh3']);
  expect(legalMoves(resign(newGame(), 'w'))).toEqual([]);
});

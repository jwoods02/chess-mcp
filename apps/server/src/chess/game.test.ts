import { describe, expect, test } from 'vitest';
import {
  applyMove,
  ChessError,
  createGame,
  draw,
  legalMoves,
  resign,
  undo,
  type Game,
} from './game.ts';
import { toState } from '../view/state.ts';

const newGame = (startFen?: string) => createGame({ white: 'human', black: 'llm', startFen });
/** Plays a move for whoever's turn it is. */
const move = (game: Game, input: string) => applyMove(game, input, toState(game).toMove ?? 'human');
const play = (game: Game, ...moves: string[]) => moves.reduce(move, game);

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
    const view = toState(newGame());
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
    expect(toState(createGame({ white: 'llm', black: 'human' })).orientation).toBe('b');
  });
});

describe('applyMove', () => {
  test('accepts SAN, UCI and loose forms', () => {
    const game = play(newGame(), 'e4', 'e7e5', 'nf3', 'Nc6', 'Bc4', 'Bc5', '0-0');
    expect(toState(game).moves).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O']);
  });

  test('reads "bxc3" as a pawn capture, never as a bishop move', () => {
    // No pawn can take on c3 here, but the bishop on b4 can.
    const game = newGame('rnbqk1nr/pppp1ppp/8/4p3/1b2P3/2N5/PPPP1PPP/R1BQKBNR w KQkq - 2 3');
    expect(errorCode(() => play(game, 'a3', 'bxc3'))).toBe('illegal_move');
    expect(toState(play(game, 'a3', 'Bxc3')).lastMove?.san).toBe('Bxc3');
  });

  test('records who played each move', () => {
    const view = toState(play(newGame(), 'e4', 'e5'));
    expect(view.lastMove).toEqual({ san: 'e5', from: 'e7', to: 'e5', by: 'llm' });
    expect(view.toMove).toBe('human');
  });

  test('only the player whose turn it is can move', () => {
    expect(errorCode(() => applyMove(newGame(), 'e4', 'llm'))).toBe('not_your_turn');
    expect(() => applyMove(newGame(), 'e4', 'llm')).toThrow('White is played by the human');
  });

  test('rejects illegal moves and lists the legal ones', () => {
    expect(() => move(newGame(), 'e5')).toThrow(/Legal moves: .*e4/);
  });

  test('requires the promotion piece', () => {
    const game = newGame('8/4P3/8/8/8/8/8/k6K w - - 0 1');
    expect(() => move(game, 'e7e8')).toThrow(/say which piece/);
    expect(() => move(game, 'e8')).toThrow(/say which piece/);
    expect(toState(move(game, 'e7e8q')).moves).toEqual(['e8=Q']);
    // Loose forms with a lowercase piece work too.
    expect(toState(move(game, 'e8q')).moves).toEqual(['e8=Q']);
    expect(toState(move(game, 'e8=n')).moves).toEqual(['e8=N']);
    const capture = newGame('3r4/4P3/8/8/8/8/8/k6K w - - 0 1');
    expect(toState(move(capture, 'exd8q')).moves).toEqual(['exd8=Q']);
  });

  test('says so when no move was given', () => {
    expect(() => move(newGame(), '  ')).toThrow(/^No move was given\. Legal moves for White: /);
  });

  test('ends the game on checkmate', () => {
    const view = toState(play(newGame(), 'f3', 'e5', 'g4', 'Qh4#'));
    expect(view).toMatchObject({
      status: 'finished',
      result: '0-1',
      termination: 'checkmate',
      toMove: null,
    });
  });

  test('ends the game on stalemate', () => {
    const game = move(newGame('k7/8/2Q5/8/8/8/8/7K w - - 0 1'), 'Qb6');
    expect(toState(game)).toMatchObject({ result: '1/2-1/2', termination: 'stalemate' });
  });

  test('ends the game on threefold repetition', () => {
    const shuffle = ['Nf3', 'Nf6', 'Ng1', 'Ng8'];
    const game = play(newGame(), ...shuffle, ...shuffle);
    expect(toState(game).termination).toBe('threefold_repetition');
  });

  test('ends the game on the fifty-move rule', () => {
    const game = move(newGame('k7/8/8/8/8/8/R7/7K w - - 99 80'), 'Rb2');
    expect(toState(game).termination).toBe('fifty_move');
  });

  test('ends the game on insufficient material', () => {
    const game = move(newGame('k7/8/8/8/8/8/1r6/K7 w - - 0 1'), 'Kxb2');
    expect(toState(game).termination).toBe('insufficient_material');
  });

  test('cannot move after the game is over', () => {
    const game = play(newGame(), 'f3', 'e5', 'g4', 'Qh4#');
    expect(errorCode(() => move(game, 'e4'))).toBe('game_over');
  });
});

describe('undo', () => {
  test('takes back two plies by default and reopens a finished game', () => {
    const over = play(newGame(), 'f3', 'e5', 'g4', 'Qh4#');
    const game = undo({ ...over, keyMoments: [{ move: '2. g4', reason: 'allowed mate' }] }, 2);
    expect(toState(game)).toMatchObject({ moves: ['f3', 'e5'], status: 'active', toMove: 'human' });
    // The review belongs to the ending that was taken back.
    expect(game.keyMoments).toBeUndefined();
  });

  test('takes back fewer plies if the game is shorter', () => {
    expect(toState(undo(play(newGame(), 'e4'), 2)).ply).toBe(0);
  });

  test('fails when there is nothing to take back', () => {
    expect(errorCode(() => undo(newGame(), 2))).toBe('invalid_undo');
  });

  test("against Jev it stops on the human's turn, so Jev doesn't just move again", () => {
    const vsJev = createGame({ white: 'human', black: 'jev' });
    // After Jev's reply, taking back one ply goes one further.
    expect(toState(undo(play(vsJev, 'e4', 'e5'), 1)).ply).toBe(0);
    // After the human's move (say it ended the game), the default of two stops one short.
    expect(toState(undo(play(vsJev, 'e4', 'e5', 'Nf3'), 2)).ply).toBe(2);
  });
});

describe('resign and draws', () => {
  test('resigning ends the game for the other side', () => {
    expect(toState(resign(newGame(), 'b'))).toMatchObject({
      result: '1-0',
      termination: 'resignation',
    });
  });

  test('a draw offer can be accepted by the other side', () => {
    const offered = draw(newGame(), 'offer', 'b');
    expect(toState(offered).drawOffer).toBe('b');
    expect(errorCode(() => draw(offered, 'accept', 'b'))).toBe('invalid_draw_action');
    expect(toState(draw(offered, 'accept', 'w'))).toMatchObject({
      result: '1/2-1/2',
      termination: 'draw_agreed',
    });
  });

  test('a draw offer can be declined', () => {
    expect(toState(draw(draw(newGame(), 'offer', 'w'), 'decline', 'b')).drawOffer).toBeUndefined();
  });

  test('cannot respond when no offer is pending', () => {
    expect(errorCode(() => draw(newGame(), 'accept', 'w'))).toBe('invalid_draw_action');
  });

  test('moving declines an offer, but the offering side can still move', () => {
    const whiteOffers = draw(newGame(), 'offer', 'w');
    expect(toState(move(whiteOffers, 'e4')).drawOffer).toBe('w');
    expect(toState(play(whiteOffers, 'e4', 'e5')).drawOffer).toBeUndefined();
  });
});

test('legalMoves can filter by square and is empty once the game is over', () => {
  expect(legalMoves(newGame(), 'g1')).toEqual(['Nf3', 'Nh3']);
  expect(legalMoves(resign(newGame(), 'w'))).toEqual([]);
});

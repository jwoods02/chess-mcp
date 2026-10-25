import { expect, test } from 'vitest';
import { humanMoveFacts } from './facts.ts';
import { applyMove, createGame, toState, type Game } from './game.ts';

/** Plays moves for whoever's turn it is. */
const playFrom = (game: Game, moves: string[]) =>
  moves.reduce((g, move) => applyMove(g, move, toState(g).toMove!), game);
/** A game where the human is White. */
const play = (...moves: string[]) => playFrom(createGame({ white: 'human', black: 'llm' }), moves);

// From a playtest: Jev gave up its queen, and White's queen and rook line up on h7.
const MATE_ON_H7 = [
  'e4', 'e5', 'Nf3', 'Nf6', 'Nxe5', 'Nxe4', 'd3', 'Nxf2', 'Kxf2', 'Qh4+', 'Kg1', 'Qxh2+',
  'Rxh2', 'Bc5+', 'Kh1', 'Bf2', 'Qh5', 'O-O',
]; // prettier-ignore

test('a capture that loses the piece: knight for a pawn', () => {
  const facts = humanMoveFacts(play(...MATE_ON_H7, 'Nxf7'));
  expect(facts).toMatchObject({ move: 'Nxf7', captured: 'pawn', loses: 2 });
  expect(facts?.hanging[0]).toEqual({ piece: 'knight', square: 'f7', loses: 3 });
});

test('a missed mate in one', () => {
  expect(humanMoveFacts(play(...MATE_ON_H7, 'Nc3'))?.missedMate).toEqual(['Qxh7#']);
});

test('a move that allows mate in one', () => {
  // The human is White: 1. f3 e5 2. g4 allows Qh4#.
  expect(humanMoveFacts(play('f3', 'e5', 'g4'))?.allowsMate).toEqual(['Qh4#']);
});

test('a missed capture that wins material', () => {
  const facts = humanMoveFacts(play('e4', 'e5', 'Nf3', 'Qg5', 'd3'));
  expect(facts?.missedWin).toEqual({ move: 'Nxg5', wins: 9 });
});

test("a pinned attacker doesn't make a piece hang", () => {
  // From a playtest, with the human as Black: after Nxe4 the knight is attacked only by the knight
  // on c3, which Bb4 pins to White's king.
  const game = playFrom(createGame({ white: 'llm', black: 'human' }), [
    'e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd4', 'exd4', 'cxd4', 'Bb4+', 'Nc3',
    'Nxe4',
  ]); // prettier-ignore
  expect(humanMoveFacts(game)).toMatchObject({ move: 'Nxe4', captured: 'pawn', hanging: [] });
});

test("facts follow the human's move through the opponent's reply, then stop", () => {
  expect(humanMoveFacts(play('e4', 'e5'))?.move).toBe('e4');
  expect(humanMoveFacts(createGame({ white: 'llm', black: 'human' }))).toBeUndefined();
});

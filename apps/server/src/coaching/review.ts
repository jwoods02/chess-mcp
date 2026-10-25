import type { KeyMoment, MoveFacts } from '@chess-mcp/shared';
import { moveFacts } from '../chess/facts.ts';
import { replay, type Game } from '../chess/game.ts';

// Two or three lessons stick; twenty don't.
const MAX_MOMENTS = 3;

/** What every mode says when the game ends: offer a short review, whatever the coaching was. */
export function reviewReason(keyMoments: KeyMoment[]): string {
  return keyMoments.length > 0
    ? 'The game is over. Offer to go through coaching.keyMoments together. For each one, ask what ' +
        'they were thinking before explaining from the reason given: their own reasoning is what ' +
        'makes the lesson stick. Finish with something that went well.'
    : 'The game is over with no big mistakes to review: say so, and offer to look at anything ' +
        "they're curious about.";
}

/** The human's moves that mattered most: missed or allowed mates first, then the biggest losses. */
export function findKeyMoments(game: Game): KeyMoment[] {
  const moments: { index: number; weight: number; reason: string }[] = [];
  game.moves.forEach((move, index) => {
    if (move.by !== 'human') return;
    const found = describe(moveFacts(game, index));
    if (found) moments.push({ index, ...found });
  });
  return moments
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_MOMENTS)
    .sort((a, b) => a.index - b.index)
    .map((m) => ({ move: numbered(game, m.index), reason: m.reason }));
}

function describe(facts: MoveFacts): { weight: number; reason: string } | undefined {
  if (facts.missedMate.length > 0) {
    return { weight: 100, reason: `missed mate in one: ${facts.missedMate.join(' or ')}` };
  }
  if (facts.allowsMate.length > 0) {
    return { weight: 90, reason: `allowed mate in one: ${facts.allowsMate.join(' or ')}` };
  }
  if (facts.loses >= 2) {
    const pieces = facts.hanging.map((h) => `the ${h.piece} on ${h.square}`).join(' and ');
    return { weight: facts.loses, reason: `left ${pieces} hanging, losing ${facts.loses} points` };
  }
  if (facts.missedWin && facts.missedWin.wins >= 3) {
    const { move, wins } = facts.missedWin;
    return { weight: wins, reason: `missed ${move}, which wins ${wins} points` };
  }
  return undefined;
}

/** "10. Nc3" or "10... Nc6". */
function numbered(game: Game, index: number): string {
  const chess = replay({ ...game, moves: game.moves.slice(0, index) });
  return `${chess.moveNumber()}${chess.turn() === 'w' ? '.' : '...'} ${game.moves[index]!.san}`;
}

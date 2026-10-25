import type { CoachingMode } from '../mode.ts';

// Losing a pawn isn't worth interrupting the game for; losing a piece is.
const MIN_LOSS = 2;

export const blunderCheck: CoachingMode = {
  id: 'blunder_check',
  version: 1,
  description:
    'Quiet unless a move loses material or misses or allows a mate in one; then the coach explains ' +
    'and offers a takeback.',
  summary: "blunder check: stay quiet about the human's moves unless coaching.speak is true.",
  guidance:
    'Coaching mode "blunder check": let the human play. The server checks each of their moves. When ' +
    'one loses material, allows a mate in one or misses one, coaching.speak is true and ' +
    'coaching.reason says what happened. Then tell them in one or two sentences, explain only from ' +
    'coaching.facts (they are checked; your own reading of the board may not be), and offer to take ' +
    "the move back with undo_move. Otherwise don't comment on their moves unless they ask: the point " +
    'is that they find their own way and only hear from you when it matters.',
  speak(facts) {
    if (!facts) return undefined;
    const reasons = [];
    if (facts.missedMate.length > 0) {
      reasons.push(`They missed mate in one: ${facts.missedMate.join(' or ')}.`);
    }
    if (facts.allowsMate.length > 0) {
      reasons.push(`${facts.move} allows mate in one: ${facts.allowsMate.join(' or ')}.`);
    }
    if (facts.loses >= MIN_LOSS) {
      const pieces = facts.hanging.map((h) => `the ${h.piece} on ${h.square}`).join(', ');
      reasons.push(`${facts.move} loses material (${facts.loses}): ${pieces} can be won.`);
    }
    if (reasons.length === 0) return undefined;
    // The facts are from before the reply, so say whether the reply made use of the mistake.
    const { reply } = facts;
    const punished =
      reply && (reply.endsWith('#') || facts.hanging.some((h) => reply.includes(`x${h.square}`)));
    if (reply && !punished && facts.missedMate.length === 0) {
      reasons.push(`The reply ${reply} didn't take advantage of it, so it may still be there.`);
    }
    return reasons.join(' ');
  },
};

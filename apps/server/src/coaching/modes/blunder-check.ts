import type { CoachingMode } from '../mode.ts';

// Losing a pawn isn't worth interrupting the game for; losing a piece is.
const MIN_LOSS = 2;

export const blunderCheck: CoachingMode = {
  id: 'blunder_check',
  version: 2,
  label: 'Blunder check',
  description:
    'Quiet unless a move loses material or misses or allows a mate in one; then the coach explains ' +
    'and offers a takeback.',
  summary: "blunder check: stay quiet about the human's moves unless coaching.speak is true.",
  guidance:
    'Coaching mode "blunder check": let the human play. The server checks each of their moves. When ' +
    'one loses material, allows a mate in one or misses one, coaching.speak is true and ' +
    'coaching.reason says what happened. Then tell them in one or two sentences, explain only from ' +
    'coaching.reason and coaching.facts (they are checked; your own reading of the board may not ' +
    'be), and offer to take the move back with undo_move. The rest of the time, let them play and ' +
    'comment on their moves only when they ask: they learn more from finding their own way and ' +
    'hearing from you when it matters.',
  speak(facts) {
    if (!facts) return undefined;
    const { move, reply } = facts;
    const reasons: string[] = [];

    if (facts.missedMate.length > 0) {
      const mate = facts.missedMate.join(' or ');
      // Credit a capture first, so a good move doesn't read as a telling-off.
      reasons.push(
        facts.captured
          ? `${move} won a ${facts.captured}, but there was mate in one: ${mate}.`
          : `There was mate in one instead of ${move}: ${mate}.`,
      );
    }

    // The facts are judged before the reply, so say what the reply did with the chance.
    if (facts.allowsMate.length > 0) {
      const mate = facts.allowsMate.join(' or ');
      if (!reply) {
        reasons.push(`${move} allows mate in one: ${mate}.`);
      } else if (reply.endsWith('#')) {
        reasons.push(`${move} allowed mate in one, and ${reply} was mate.`);
      } else {
        reasons.push(`${move} allowed mate in one (${mate}), but the reply ${reply} missed it.`);
      }
    }

    if (facts.loses >= MIN_LOSS) {
      const pieces = facts.hanging.map((h) => `the ${h.piece} on ${h.square}`).join(' and ');
      const lost = `${facts.loses} points of material`;
      const taken = reply && facts.hanging.find((h) => reply.includes(`x${h.square}`));
      if (!reply) {
        reasons.push(`${move} loses ${lost}: ${pieces} can be taken.`);
      } else if (taken) {
        reasons.push(`${move} lost ${lost}: the reply ${reply} took the ${taken.piece}.`);
      } else {
        reasons.push(
          `${move} left ${pieces} hanging (${lost}), but the reply ${reply} didn't take it, so it may still be there.`,
        );
      }
    }

    return reasons.length > 0 ? reasons.join(' ') : undefined;
  },
};

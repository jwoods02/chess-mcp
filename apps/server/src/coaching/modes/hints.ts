import type { CoachingMode } from '../mode.ts';

// Smaller chances or threats are left for the human to find.
const MIN_POINTS = 2;

export const hints: CoachingMode = {
  id: 'hints',
  version: 1,
  label: 'Hints',
  description:
    'When the human has a chance or a threat to deal with, the coach nudges them with a hint ' +
    'before they move, starting vague and getting more specific if they ask.',
  summary:
    'hints: when coaching.speak is true, give the first hint only (the area or theme, not the ' +
    'move). Otherwise let them play.',
  guidance:
    'Coaching mode "hints": before the human moves, the server checks their position. When they ' +
    'have a mate in one, can win material, or have a piece under attack, coaching.speak is true and ' +
    'coaching.reason says what it is. Give the first hint only: the area or theme to look at ' +
    '("there\'s something on the h-file", "one of your pieces needs attention"). If they ask for ' +
    'more, name the piece; then the move and why it works. Finding it themselves is the lesson, so ' +
    'each step gives away as little as it can. For any other help they ask for, check ideas with ' +
    'analyze_position first.',
  speak(_facts, position) {
    if (!position) return undefined;
    if (position.mateInOne.length > 0) {
      return `The human has mate in one: ${position.mateInOne.join(' or ')}.`;
    }
    const threat = position.underAttack.find((h) => h.loses >= MIN_POINTS);
    if (threat) {
      return `The human's ${threat.piece} on ${threat.square} is under attack (${threat.loses} points).`;
    }
    const win = position.bestCapture;
    if (win && win.wins >= MIN_POINTS) {
      return `The human can win material: ${win.move} wins ${win.wins} points.`;
    }
    return undefined;
  },
};

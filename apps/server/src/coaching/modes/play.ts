import type { CoachingMode } from '../mode.ts';

export const play: CoachingMode = {
  id: 'play',
  version: 1,
  description: 'Just play. The coach stays quiet unless the human asks.',
  summary: 'play: just play. Talk about the position or point out mistakes only if the human asks.',
  guidance:
    'Coaching mode "play": the human wants a game, not a lesson. Keep replies short and friendly. ' +
    "Leave out mistakes, suggested moves and Jev's instinct unless they ask, because unasked advice " +
    'spoils the game. If they do ask, answer from coaching.facts.',
  speak: () => undefined,
};

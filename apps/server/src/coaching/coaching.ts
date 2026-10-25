import type { CoachingBlock } from '@chess-mcp/shared';
import { humanMoveFacts, positionFacts } from '../chess/facts.ts';
import { toState, type Game } from '../chess/game.ts';
import type { CoachingMode } from './mode.ts';
import { blunderCheck } from './modes/blunder-check.ts';
import { hints } from './modes/hints.ts';
import { play } from './modes/play.ts';
import { findKeyMoments, reviewReason } from './review.ts';

export const MODES = {
  play,
  blunder_check: blunderCheck,
  hints,
} satisfies Record<string, CoachingMode>;
export type ModeId = keyof typeof MODES;
export const MODE_IDS = Object.keys(MODES) as [ModeId, ...ModeId[]];

/** How a game records its mode: 'blunder_check@1'. */
export function modeRef(id: ModeId): string {
  return `${id}@${MODES[id].version}`;
}

/** The game's mode. Games from before coaching existed play as 'play'. */
export function modeOf(game: Pick<Game, 'coachingMode'>): CoachingMode {
  const id = game.coachingMode?.split('@')[0] ?? 'play';
  return MODES[id as ModeId] ?? play;
}

/**
 * How to coach right now. The summary is always there; the full guidance only at key moments: when
 * the caller asks (a game starts, resumes or changes settings), when the game is over, or when the
 * mode has something to say. Facts, and so speaking, only come with a move that was just played: an
 * undo or a resumed game would otherwise repeat old news. At the end of a game, every mode offers a
 * short review of the key moments.
 */
export function coachingBlock(
  game: Game,
  { fullGuidance = false, afterMove = false }: { fullGuidance?: boolean; afterMove?: boolean } = {},
): CoachingBlock {
  const mode = modeOf(game);
  const facts = afterMove ? humanMoveFacts(game) : undefined;
  const humanToMove = afterMove && toState(game).toMove === 'human';
  const position = humanToMove ? positionFacts(game) : undefined;
  const keyMoments = game.status === 'finished' ? findKeyMoments(game) : undefined;
  const reasons = [mode.speak(facts, position), keyMoments && reviewReason(keyMoments)];
  const reason = reasons.filter(Boolean).join(' ') || undefined;
  const full = fullGuidance || reason !== undefined || game.status === 'finished';
  return {
    mode: `${mode.id}@${mode.version}`,
    summary: mode.summary,
    ...(full && { guidance: mode.guidance }),
    speak: reason !== undefined,
    ...(reason && { reason }),
    ...(facts && { facts }),
    ...(keyMoments && { keyMoments }),
  };
}

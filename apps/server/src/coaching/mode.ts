import type { MoveFacts, PositionFacts } from '@chess-mcp/shared';

/**
 * A coaching mode is mostly prompt text. The summary rides along with every result so the model stays
 * on track; the guidance is sent only at key moments; `speak` decides from the facts when the coach
 * should say something. A mode is only worth having if it changes what the coach does unprompted:
 * help when asked, and a review offer at the end, come with every mode.
 */
export interface CoachingMode {
  id: string;
  /** Bump when the wording changes, so games record which version they were coached with. */
  version: number;
  /** How the human sees it, e.g. on the setup card: "Blunder check". */
  label: string;
  /** For tool descriptions and the setup card. */
  description: string;
  summary: string;
  guidance: string;
  /**
   * What the coach should speak about now, or undefined to stay quiet. `facts` describe the human's
   * move just played; `position` is what the human can do now, when it's their move.
   */
  speak(facts?: MoveFacts, position?: PositionFacts): string | undefined;
}

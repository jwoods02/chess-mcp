import type { MoveFacts } from '@chess-mcp/shared';

/**
 * A coaching mode is mostly prompt text. The summary rides along with every result so the model stays
 * on track; the guidance is sent only at key moments; `speak` decides from the facts when the coach
 * should say something.
 */
export interface CoachingMode {
  id: string;
  /** Bump when the wording changes, so games record which version they were coached with. */
  version: number;
  /** For tool descriptions and, later, the setup screen. */
  description: string;
  summary: string;
  guidance: string;
  /** What the coach should speak about now, or undefined to stay quiet. */
  speak(facts: MoveFacts | undefined): string | undefined;
}

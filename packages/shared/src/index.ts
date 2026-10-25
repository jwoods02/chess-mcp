// Schemas and types shared by the server and the board UI.
import { z } from 'zod';

export const Color = z.enum(['w', 'b']);
export type Color = z.infer<typeof Color>;

/** Who controls a side of the board. */
export const Player = z.enum(['human', 'llm']);
export type Player = z.infer<typeof Player>;

export const Result = z.enum(['1-0', '0-1', '1/2-1/2']);
export type Result = z.infer<typeof Result>;

export const Termination = z.enum([
  'checkmate',
  'stalemate',
  'threefold_repetition',
  'fifty_move',
  'insufficient_material',
  'resignation',
  'draw_agreed',
]);
export type Termination = z.infer<typeof Termination>;

/** What every game tool returns as structuredContent. Read by the model and the board UI. */
export const GameView = z.object({
  gameId: z.string(),
  fen: z.string(),
  pgn: z.string(),
  moves: z.array(z.string()).describe('Moves so far in SAN'),
  ply: z
    .number()
    .int()
    .describe('Half-moves played. Pass this back as `ply` when changing the game.'),
  turn: Color,
  toMove: Player.nullable().describe('Who should act next, or null when the game is over'),
  white: Player,
  black: Player,
  status: z.enum(['active', 'finished']),
  result: Result.optional(),
  termination: Termination.optional(),
  inCheck: z.boolean(),
  drawOffer: Color.optional().describe('Side with a pending draw offer'),
  lastMove: z.object({ san: z.string(), from: z.string(), to: z.string(), by: Player }).optional(),
  orientation: Color.describe("Board orientation: the human's colour"),
});
export type GameView = z.infer<typeof GameView>;

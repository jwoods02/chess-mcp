// Schemas and types shared by the server and the board UI.
import { z } from 'zod';

export const Color = z.enum(['w', 'b']);
export type Color = z.infer<typeof Color>;

/** Who controls a side of the board. `jev` is TypeSafe AI's decision model, run by the server. */
export const Player = z.enum(['human', 'llm', 'jev']);
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

/** The game itself, as the server computes it. */
export const GameState = z.object({
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
  lastMove: z
    .object({
      san: z.string(),
      from: z.string(),
      to: z.string(),
      by: Player,
      jev: z
        .object({
          topMoves: z
            .record(z.string(), z.number())
            .describe(
              "Jev's instinct: the moves it rated most likely, with probabilities. Not an evaluation of the position; Jev is often wrong.",
            ),
          fallback: z
            .string()
            .optional()
            .describe('Set when Jev failed and a random move was played'),
        })
        .optional(),
    })
    .optional(),
  orientation: Color.describe("Board orientation: the human's colour"),
});
export type GameState = z.infer<typeof GameState>;

/**
 * What every game tool returns as structuredContent: the game plus the text the model needs. Some
 * clients (Claude Code) show the model only structuredContent, so it has to be complete on its own.
 */
export const GameView = GameState.extend({
  board: z.string().describe("ASCII board from the human's side. Uppercase is White."),
  next: z.string().describe('What should happen next, and which tool to call'),
  note: z.string().optional().describe('Anything else to act on, e.g. showing the human the board'),
});
export type GameView = z.infer<typeof GameView>;

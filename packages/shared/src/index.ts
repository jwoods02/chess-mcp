// Schemas and types shared by the server and the board UI.
import { z } from 'zod';

export const Color = z.enum(['w', 'b']);
export type Color = z.infer<typeof Color>;

/** Who controls a side of the board. `jev` is TypeSafe AI's decision model, run by the server. */
export const Player = z.enum(['human', 'llm', 'jev']);
export type Player = z.infer<typeof Player>;

export const Result = z.enum(['1-0', '0-1', '1/2-1/2']);
export type Result = z.infer<typeof Result>;

/** How strongly the non-human side plays. Ratings are rough guides, not calibrated. */
export const Level = z.enum(['beginner', 'casual', 'club', 'best']);
export type Level = z.infer<typeof Level>;

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
  coachingMode: z
    .string()
    .describe("The game's coaching mode and its version, e.g. 'blunder_check@1'"),
  opponentLevel: Level,
});
export type GameState = z.infer<typeof GameState>;

/** Checked facts about one move, worked out by the server so the model doesn't read tactics itself. */
export const MoveFacts = z.object({
  move: z.string().describe('The move, in SAN'),
  captured: z.string().optional().describe('The piece it captured'),
  hanging: z
    .array(z.object({ piece: z.string(), square: z.string(), loses: z.number() }))
    .describe(
      "The mover's pieces the opponent can now win, and how many points each loses (pawn 1, knight or bishop 3, rook 5, queen 9). Even trades aren't listed.",
    ),
  loses: z
    .number()
    .describe('Points the move stands to lose: the worst hanging loss minus what it captured'),
  allowsMate: z.array(z.string()).describe("The opponent's mates in one after this move"),
  missedMate: z.array(z.string()).describe('Mates in one the mover had and did not play'),
  missedWin: z
    .object({ move: z.string(), wins: z.number() })
    .optional()
    .describe('A capture the mover passed up that wins more material'),
  material: z.string().describe('The material balance now, e.g. "White is up 3 points" or "level"'),
  reply: z
    .string()
    .optional()
    .describe("The opponent's reply, if already played. The facts are from before it."),
});
export type MoveFacts = z.infer<typeof MoveFacts>;

/** How to coach right now: a one-line summary always, full guidance only at key moments. */
export const CoachingBlock = z.object({
  mode: z.string(),
  summary: z.string().describe('The coaching mode in one line. Follow it.'),
  guidance: z.string().optional().describe('Full instructions, sent at key moments'),
  speak: z.boolean().describe('The coach has something to say now'),
  reason: z.string().optional().describe('What to speak about, when speak is true'),
  facts: MoveFacts.optional().describe("Facts about the human's move this round"),
});
export type CoachingBlock = z.infer<typeof CoachingBlock>;

/**
 * What every game tool returns as structuredContent: the game plus the text the model needs. Some
 * clients (Claude Code) show the model only structuredContent, so it has to be complete on its own.
 */
export const GameView = GameState.extend({
  board: z.string().describe("ASCII board from the human's side. Uppercase is White."),
  next: z.string().describe('What should happen next, and which tool to call'),
  note: z.string().optional().describe('Anything else to act on, e.g. showing the human the board'),
  coaching: CoachingBlock,
});
export type GameView = z.infer<typeof GameView>;

// Schemas and types shared by the server and the board UI.
import { z } from 'zod';

export const Color = z.enum(['w', 'b']);
export type Color = z.infer<typeof Color>;

/** Who controls a side of the board. */
export const Player = z.enum(['human', 'llm']);
export type Player = z.infer<typeof Player>;

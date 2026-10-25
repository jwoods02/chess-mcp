import type { Chess } from 'chess.js';
import { colorName } from './names.ts';

// Reading moves as people and models type them, and writing the move list back out.

export function parseUci(input: string) {
  const m = /^([a-h][1-8])-?([a-h][1-8])([qrbn])?$/i.exec(input);
  if (!m) return undefined;
  return { from: m[1]!.toLowerCase(), to: m[2]!.toLowerCase(), promotion: m[3]?.toLowerCase() };
}

/** Tries the input as UCI, then as SAN with a few forgiving rewrites. Returns undefined if illegal. */
export function tryMove(chess: Chess, input: string) {
  const uci = parseUci(input);
  const promotion = /^((?:[a-h]x)?[a-h][18])=?([qrbn])([+#]?)$/i.exec(input);
  const candidates = uci
    ? [uci]
    : [
        input,
        input.replace(/0/g, 'O').replace(/o/g, 'O'), // 0-0, o-o → O-O
        // nf3 → Nf3, but bxc3 is a pawn capture: never turn it into a bishop move.
        ...(input.startsWith('bx') ? [] : [input.charAt(0).toUpperCase() + input.slice(1)]),
        // e8q, e8=q → e8=Q
        ...(promotion
          ? [`${promotion[1]!.toLowerCase()}=${promotion[2]!.toUpperCase()}${promotion[3]}`]
          : []),
      ];
  for (const candidate of candidates) {
    try {
      return chess.move(candidate);
    } catch {
      // try the next form
    }
  }
  return undefined;
}

export function illegalMoveMessage(chess: Chess, input: string): string {
  const legal = chess.moves();
  if (!input)
    return `No move was given. Legal moves for ${colorName(chess.turn())}: ${legal.join(', ')}.`;
  const uci = parseUci(input);
  const needsPromotion = chess
    .moves({ verbose: true })
    .some(
      (m) =>
        m.promotion && (uci ? m.from === uci.from && m.to === uci.to : m.san.startsWith(input)),
    );
  if (needsPromotion) {
    return `"${input}" promotes a pawn: say which piece, e.g. "${uci ? `${uci.from}${uci.to}q` : `${input}=Q`}".`;
  }
  return `"${input}" is not a legal move for ${colorName(chess.turn())}. Legal moves: ${legal.join(', ')}.`;
}

/** The numbered moves from a PGN, e.g. "1. e4 e5 2. Nf3", without headers or the result. */
export function moveText(pgn: string): string {
  return pgn
    .replace(/^\[.*\]$/gm, '')
    .trim()
    .replace(/\s*(\*|1-0|0-1|1\/2-1\/2)$/, '');
}

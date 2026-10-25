import type { Color, GameView } from '@chess-mcp/shared';
import { colorName, hasJev, moveText, playerName } from './game.ts';

/** The full text response for a game: board, FEN, moves, status and what should happen next. */
export function gameText(view: GameView): string {
  const lines = [
    `Game ${view.gameId} · White: ${playerName(view.white)} · Black: ${playerName(view.black)}`,
    '',
    board(view.fen, view.orientation),
    '',
    `FEN: ${view.fen}`,
    `Moves: ${moveText(view.pgn) || '(none yet)'}`,
  ];
  if (view.lastMove)
    lines.push(`Last move: ${view.lastMove.san} (${lastMoveDetail(view.lastMove)})`);
  if (view.drawOffer) lines.push(`Draw offer: ${colorName(view.drawOffer)} has offered a draw.`);
  lines.push(`Ply: ${view.ply}`, `Status: ${status(view)}`);
  return lines.join('\n');
}

/** ASCII board from a FEN, drawn from `orientation`'s side. Uppercase = White, lowercase = Black. */
export function board(fen: string, orientation: Color): string {
  const rows = fen
    .split(' ')[0]!
    .split('/')
    .map((rank) => rank.replace(/\d/g, (n) => '.'.repeat(Number(n))).split(''));
  let ranks = rows.map((squares, i) => ({ label: 8 - i, squares }));
  let files = 'abcdefgh'.split('');
  if (orientation === 'b') {
    ranks = ranks.reverse().map((r) => ({ ...r, squares: [...r.squares].reverse() }));
    files = files.reverse();
  }
  return [
    ...ranks.map((r) => `${r.label} │ ${r.squares.join(' ')}`),
    '  └────────────────',
    `    ${files.join(' ')}`,
  ].join('\n');
}

function status(view: GameView): string {
  if (view.status === 'finished') {
    return `Game over: ${view.result} by ${view.termination?.replace(/_/g, ' ')}.`;
  }
  const side = colorName(view.turn);
  const check = view.inCheck ? ` ${side} is in check.` : '';
  if (view.toMove === 'jev') {
    return `${side} to move. Waiting for Jev, which isn't available on this server (no TypeSafe API key).`;
  }
  if (view.toMove === 'llm') {
    return `${side} to move.${check} It's your turn (you play ${side}): call make_move with ply ${view.ply}.`;
  }
  const tool = hasJev(view) ? 'play_against_jev' : 'submit_human_move';
  return `${side} to move.${check} Waiting for the human: ask for their move, then call ${tool} with ply ${view.ply}.`;
}

/** Who played the last move, plus Jev's top choices when it was Jev's move. */
function lastMoveDetail(move: NonNullable<GameView['lastMove']>): string {
  if (!move.jev) return playerName(move.by);
  if (move.jev.fallback) return `Jev was unavailable, so a random legal move was played`;
  const top = Object.entries(move.jev.topMoves)
    .map(([san, p]) => `${san} ${Math.round(p * 100)}%`)
    .join(', ');
  return top ? `Jev; its top choices were ${top}` : 'Jev';
}

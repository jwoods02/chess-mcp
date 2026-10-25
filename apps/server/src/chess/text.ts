import type { CoachingBlock, Color, GameState, GameView, MoveFacts } from '@chess-mcp/shared';
import { personaText } from '../opponents/levels.ts';
import { colorName, hasJev, moveText, playerName } from './game.ts';

/** Adds what the model needs to a game's state: the board, what happens next, any note, coaching. */
export function gameView(state: GameState, coaching: CoachingBlock, note?: string): GameView {
  const view = { ...state, board: board(state.fen, state.orientation), next: next(state) };
  return { ...view, note, coaching };
}

/** The full text response for a game: board, FEN, moves, status and what should happen next. */
export function gameText(view: GameView): string {
  const lines = [
    `Game ${view.gameId} · White: ${playerName(view.white)} · Black: ${playerName(view.black)}`,
    '',
    view.board,
    '',
    `FEN: ${view.fen}`,
    `Moves: ${moveText(view.pgn) || '(none yet)'}`,
  ];
  if (view.lastMove)
    lines.push(`Last move: ${view.lastMove.san} (${lastMoveDetail(view.lastMove)})`);
  if (view.drawOffer) lines.push(`Draw offer: ${colorName(view.drawOffer)} has offered a draw.`);
  lines.push(`Ply: ${view.ply}`, `Status: ${view.next}`);
  if (view.note) lines.push(view.note);
  lines.push(...coachingLines(view.coaching));
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

function next(view: GameState): string {
  if (view.status === 'finished') {
    return `Game over: ${view.result} by ${view.termination?.replace(/_/g, ' ')}.`;
  }
  const side = colorName(view.turn);
  const check = view.inCheck ? ` ${side} is in check.` : '';
  if (view.toMove === 'jev') {
    return `${side} to move. Waiting for Jev, which isn't available on this server (no TypeSafe API key).`;
  }
  if (view.toMove === 'llm') {
    const persona = personaText(view.opponentLevel);
    return `${side} to move.${check} It's your turn (you play ${side}): call make_move with ply ${view.ply}.${persona && ` ${persona}`}`;
  }
  const tool = hasJev(view) ? 'play_against_jev' : 'submit_human_move';
  return `${side} to move.${check} Waiting for the human: ask for their move, then call ${tool} with ply ${view.ply}.`;
}

/** The coaching block as text: the summary always, the rest when there is any. */
function coachingLines(coaching: CoachingBlock): string[] {
  const lines = [`Coaching: ${coaching.summary}`];
  if (coaching.reason) lines.push(`Coach, speak now: ${coaching.reason}`);
  if (coaching.guidance) lines.push(`Coach notes (for the assistant): ${coaching.guidance}`);
  if (coaching.facts) lines.push(`Facts about the human's move: ${factsText(coaching.facts)}`);
  return lines;
}

function factsText(facts: MoveFacts): string {
  const parts = [facts.move];
  if (facts.captured) parts.push(`captured a ${facts.captured}`);
  for (const h of facts.hanging) {
    parts.push(`${h.piece} on ${h.square} could be won (${h.loses} points)`);
  }
  if (facts.allowsMate.length) parts.push(`allows mate: ${facts.allowsMate.join(', ')}`);
  if (facts.missedMate.length) parts.push(`missed mate: ${facts.missedMate.join(', ')}`);
  if (facts.missedWin) parts.push(`missed ${facts.missedWin.move} winning ${facts.missedWin.wins}`);
  parts.push(`material now: ${facts.material}`);
  if (facts.reply) parts.push(`then the reply ${facts.reply}`);
  return parts.join('; ');
}

/** Who played the last move, plus Jev's instinct when it was Jev's move. */
function lastMoveDetail(move: NonNullable<GameState['lastMove']>): string {
  if (!move.jev) return playerName(move.by);
  if (move.jev.fallback) return `Jev was unavailable, so a random legal move was played`;
  const top = Object.entries(move.jev.topMoves)
    .map(([san, p]) => `${san} ${Math.round(p * 100)}%`)
    .join(', ');
  return top ? `Jev; its instinct favoured ${top}, which is not an evaluation` : 'Jev';
}

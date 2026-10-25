import type { GameView } from '@chess-mcp/shared';
import { useState } from 'react';
import { fenStringToPositionObject, type PositionDataType } from 'react-chessboard';
import type { LocalMove } from '../lib/chess.ts';
import {
  callTool,
  errorNotice,
  postMessage,
  resultText,
  tellModel,
  type McpApp,
  type ToolResult,
} from '../lib/host.ts';

export interface Notice {
  text: string;
  danger?: boolean;
}

/**
 * What the human can do from the board: move, take back, start a new game. Each goes straight to the
 * server when the host allows it, and through the chat when it doesn't.
 */
export function useGameActions(
  app: McpApp,
  view: GameView,
  onView: (view: GameView) => void,
  onNewGame: () => Promise<string | undefined>,
) {
  const [notice, setNotice] = useState<Notice>();
  const [busy, setBusy] = useState(false);
  // A dropped piece shows on its new square while the server checks it, for that position only.
  const [sending, setSending] = useState<{ ply: number; position: PositionDataType }>();
  const pending = sending?.ply === view.ply ? sending.position : undefined;

  /** Shows a result from the server; returns the new view, or undefined after an error. */
  function show(result: ToolResult): GameView | undefined {
    const next = result.structuredContent as GameView | undefined;
    if (next) onView(next);
    if (!result.isError && next) return next;
    setNotice({ text: errorNotice(result), danger: true });
    return undefined;
  }

  async function move(move: LocalMove) {
    setNotice(undefined);
    setSending({ ply: view.ply, position: fenStringToPositionObject(move.fen, 8, 8) });
    // Games against Jev have their own tool, which also plays Jev's reply.
    const tool =
      view.white === 'jev' || view.black === 'jev' ? 'play_against_jev' : 'submit_human_move';
    const result = await callTool(app, tool, {
      gameId: view.gameId,
      ply: view.ply,
      move: move.uci,
    });
    const message = `I played ${move.san}.`;
    if (result) {
      setSending(undefined);
      const next = show(result);
      if (!next) return;
      await tellModel(
        app,
        `The human moved on the board, and the move is already submitted:\n\n${resultText(result)}`,
      );
      // The assistant gets a turn when it's to move, or when the coach has something to say.
      if (next.toMove !== 'llm' && !next.coaching.speak) return;
      if (!(await postMessage(app, message))) setNotice({ text: `Tell the assistant: ${message}` });
      return;
    }
    if (await postMessage(app, message))
      return setNotice({ text: 'Your move is in the chat for the assistant.' });
    setSending(undefined);
    setNotice({ text: `Tell the assistant: ${message}` });
  }

  /** Takes back the human's last move, and the reply to it if there was one. */
  async function takeBack() {
    setBusy(true);
    const plies = view.lastMove?.by === 'human' ? 1 : 2;
    const result = await callTool(app, 'undo_move', { gameId: view.gameId, ply: view.ply, plies });
    setBusy(false);
    if (result) {
      if (!show(result)) return;
      await tellModel(
        app,
        `The human took back their move on the board, and it's already done:\n\n${resultText(result)}`,
      );
      return setNotice({ text: 'Move taken back.' });
    }
    const sent = await postMessage(app, 'Please take back my last move.');
    setNotice({
      text: sent
        ? 'Asked the assistant to take it back.'
        : 'Ask the assistant to take your move back.',
    });
  }

  async function newGame() {
    setBusy(true);
    const text = await onNewGame();
    setBusy(false);
    setNotice(text ? { text } : undefined);
  }

  return { notice, busy, pending, move, takeBack, newGame };
}

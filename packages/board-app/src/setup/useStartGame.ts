import type { GameView } from '@chess-mcp/shared';
import { useState } from 'react';
import {
  callTool,
  errorNotice,
  postMessage,
  resultText,
  tellModel,
  type McpApp,
} from '../lib/host.ts';

export interface Choice {
  args: { white: string; black: string; coaching: string; opponentLevel: string };
  /** The choice in words, for the chat: "I play White against Jev at beginner level, …". */
  text: string;
}

/** Starts the chosen game on the server, or asks the assistant to when the host won't run tools. */
export function useStartGame(app: McpApp, onStarted: (view: GameView) => void) {
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState<{ text: string; danger?: boolean }>();

  async function start(choice: Choice) {
    setStarting(true);
    const result = await callTool(app, 'new_game', choice.args);
    if (result && !result.isError && result.structuredContent) {
      const view = result.structuredContent as GameView;
      onStarted(view);
      // The model didn't see the call: tell it, and give it a turn if it moves first.
      await tellModel(app, `The human started a new game from the board:\n\n${resultText(result)}`);
      if (view.toMove === 'llm')
        await postMessage(app, `I started a new game: ${choice.text}. Your move.`);
      return;
    }
    setStarting(false);
    if (result) return setNotice({ text: errorNotice(result), danger: true });
    const message = `Let's start a new chess game: ${choice.text}.`;
    const sent = await postMessage(app, message);
    setNotice({
      text: sent
        ? 'Your choice is in the chat for the assistant.'
        : `Tell the assistant: ${message}`,
    });
  }

  return { starting, notice, start };
}

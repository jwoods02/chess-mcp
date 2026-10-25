import type { GameSetup, GameView } from '@chess-mcp/shared';
import { useApp, useHostStyles } from '@modelcontextprotocol/ext-apps/react';
import { useState } from 'react';
import styles from './App.module.css';
import { Game } from './game/Game.tsx';
import { callTool, postMessage, type McpApp } from './lib/host.ts';
import { Setup } from './setup/Setup.tsx';

/** The board shows either a game or the new-game card, depending on the tool that drew it. */
type Screen =
  | { kind: 'game'; view: GameView }
  | { kind: 'setup'; options: GameSetup['setup']; back?: GameView };

function App() {
  const [screen, setScreen] = useState<Screen>();

  const { app, error } = useApp({
    appInfo: { name: 'chess-board', version: '0.0.0' },
    capabilities: {},
    onAppCreated: (app) => {
      // Game tools return a GameView (errors included); show_game_setup returns the options.
      app.ontoolresult = (result) => {
        const screen = toScreen(result.structuredContent);
        if (screen) setScreen(screen);
      };
    },
  });
  useHostStyles(app, app?.getHostContext());

  if (error) return <p>Could not connect to the host: {error.message}</p>;
  if (!app || !screen) return <div className={styles.skeleton} aria-label="Loading the board" />;

  if (screen.kind === 'setup') {
    const { back } = screen;
    return (
      <Setup
        app={app}
        options={screen.options}
        onStarted={(view) => setScreen({ kind: 'game', view })}
        onCancel={back && (() => setScreen({ kind: 'game', view: back }))}
      />
    );
  }
  return (
    <Game
      key={screen.view.gameId}
      app={app}
      view={screen.view}
      onView={(view) => setScreen({ kind: 'game', view })}
      onNewGame={() => openSetup(app, screen.view, setScreen)}
    />
  );
}

/**
 * Opens the new-game card in this board, or asks the assistant for one when the host won't run tools
 * for the board. Returns a notice for the human, if there is one.
 */
async function openSetup(app: McpApp, back: GameView, setScreen: (screen: Screen) => void) {
  const result = await callTool(app, 'show_game_setup', {});
  const screen = result && !result.isError && toScreen(result.structuredContent);
  if (screen && screen.kind === 'setup') {
    setScreen({ ...screen, back });
    return undefined;
  }
  const sent = await postMessage(app, "I'd like to start a new game.");
  return sent
    ? 'Your request is in the chat for the assistant.'
    : 'Ask the assistant for a new game.';
}

function toScreen(content: unknown): Screen | undefined {
  if (!content || typeof content !== 'object') return undefined;
  if ('setup' in content) return { kind: 'setup', options: (content as GameSetup).setup };
  if ('gameId' in content && 'fen' in content) return { kind: 'game', view: content as GameView };
  return undefined;
}

export default App;

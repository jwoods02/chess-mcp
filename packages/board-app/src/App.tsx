import type { GameView } from '@chess-mcp/shared';
import { useApp, useHostStyles } from '@modelcontextprotocol/ext-apps/react';
import { useState, type CSSProperties } from 'react';
import { Chessboard } from 'react-chessboard';

const LAST_MOVE: CSSProperties = { backgroundColor: 'rgba(255, 213, 0, 0.45)' };
const IN_CHECK: CSSProperties = {
  background: 'radial-gradient(circle, rgba(255, 0, 0, 0.8) 0%, rgba(255, 0, 0, 0) 75%)',
};

function App() {
  const [view, setView] = useState<GameView>();

  const { app, error } = useApp({
    appInfo: { name: 'chess-board', version: '0.0.0' },
    capabilities: {},
    onAppCreated: (app) => {
      // Every game tool returns a GameView as structuredContent, including on errors.
      app.ontoolresult = (result) => {
        if (result.structuredContent) setView(result.structuredContent as GameView);
      };
    },
  });
  useHostStyles(app, app?.getHostContext());

  if (error) return <p>Could not connect to the host: {error.message}</p>;
  if (!view) return <p>Loading game…</p>;

  return (
    <main style={{ maxWidth: 480, margin: '0 auto', fontFamily: 'var(--font-sans, sans-serif)' }}>
      <Chessboard
        options={{
          position: view.fen,
          boardOrientation: view.orientation === 'w' ? 'white' : 'black',
          squareStyles: squareStyles(view),
          allowDragging: false,
        }}
      />
      {view.status === 'finished' && (
        <p>
          <strong>{gameOverText(view)}</strong>
        </p>
      )}
    </main>
  );
}

function squareStyles(view: GameView): Record<string, CSSProperties> {
  const styles: Record<string, CSSProperties> = {};
  if (view.lastMove) {
    styles[view.lastMove.from] = LAST_MOVE;
    styles[view.lastMove.to] = LAST_MOVE;
  }
  if (view.inCheck) styles[kingSquare(view.fen, view.turn)] = IN_CHECK;
  return styles;
}

/** Finds the square of the side-to-move's king by walking the FEN board. */
function kingSquare(fen: string, color: 'w' | 'b'): string {
  const king = color === 'w' ? 'K' : 'k';
  const ranks = fen.split(' ')[0]!.split('/');
  for (const [i, rank] of ranks.entries()) {
    const file = rank.replace(/\d/g, (n) => '.'.repeat(Number(n))).indexOf(king);
    if (file >= 0) return `${'abcdefgh'[file]}${8 - i}`;
  }
  return '';
}

function gameOverText(view: GameView): string {
  return `Game over: ${view.result} (${view.termination?.replace(/_/g, ' ')})`;
}

export default App;

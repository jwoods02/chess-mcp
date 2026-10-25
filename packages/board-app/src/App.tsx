import { useApp, useHostStyles } from '@modelcontextprotocol/ext-apps/react';
import { useState } from 'react';
import { Chessboard } from 'react-chessboard';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function App() {
  const [fen, setFen] = useState(START_FEN);

  const { app, error } = useApp({
    appInfo: { name: 'chess-board', version: '0.0.0' },
    capabilities: {},
    onAppCreated: (app) => {
      // Game tools will return a GameView as structuredContent. For now we only read its FEN.
      app.ontoolresult = (result) => {
        const view = result.structuredContent as { fen?: string } | undefined;
        if (view?.fen) setFen(view.fen);
      };
    },
  });
  useHostStyles(app, app?.getHostContext());

  if (error) return <p>Could not connect to the host: {error.message}</p>;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <Chessboard options={{ position: fen, allowDragging: false }} />
    </div>
  );
}

export default App;

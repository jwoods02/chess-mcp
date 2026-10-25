import type { GameView } from '@chess-mcp/shared';
import { useApp, useHostStyles, type App as McpApp } from '@modelcontextprotocol/ext-apps/react';
import { Chess } from 'chess.js';
import { useState, type CSSProperties } from 'react';
import {
  Chessboard,
  defaultPieces,
  fenStringToPositionObject,
  type PieceDropHandlerArgs,
  type PositionDataType,
} from 'react-chessboard';

type ToolResult = Awaited<ReturnType<McpApp['callServerTool']>>;

// How long to wait for the host to run a tool call before posting the move as a message instead.
// Longer than the server's worst case against Jev (two 2.5s attempts, then a random move).
const SEND_TIMEOUT_MS = 8000;

// Host theme variables, falling back to the system colours for hosts that don't set them.
const MAIN: CSSProperties = {
  position: 'relative',
  maxWidth: 480,
  margin: '0 auto',
  color: 'var(--color-text-primary, CanvasText)',
  fontFamily: 'var(--font-sans, system-ui, sans-serif)',
};
const LAST_MOVE: CSSProperties = { backgroundColor: 'rgba(255, 213, 0, 0.45)' };
const IN_CHECK: CSSProperties = {
  background: 'radial-gradient(circle, rgba(255, 0, 0, 0.8) 0%, rgba(255, 0, 0, 0) 75%)',
};

function App() {
  const [view, setView] = useState<GameView>();
  // Shows a dropped piece on its new square while the server checks the move.
  const [dropped, setDropped] = useState<{ ply: number; position: PositionDataType }>();
  const [promotion, setPromotion] = useState<{ from: string; to: string }>();
  const [notice, setNotice] = useState<string>();

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
  if (!view || !app) return <p>Loading game…</p>;

  // A dropped piece is shown on its new square until the server answers. It only applies to the
  // position it was dropped on, so any newer position replaces it.
  const pending = dropped?.ply === view.ply ? dropped.position : undefined;
  const setPending = (position: PositionDataType | undefined) =>
    setDropped(position && { ply: view.ply, position });
  const humansTurn = view.status === 'active' && view.toMove === 'human' && !pending;

  /**
   * Sends a dropped move. If the host lets the board call tools, it goes straight to the server.
   * Otherwise (or if that fails) the board posts it as a chat message and the assistant submits it,
   * just like a typed move. Both are tried even if the host doesn't advertise them, since hosts
   * under-report what they support.
   */
  async function submit(move: LocalMove) {
    if (!app || !view) return;
    const result = await app
      .callServerTool(
        {
          // Games against Jev have their own tool, which also plays Jev's reply.
          name:
            view.white === 'jev' || view.black === 'jev' ? 'play_against_jev' : 'submit_human_move',
          arguments: { gameId: view.gameId, ply: view.ply, move: move.uci },
        },
        { timeout: SEND_TIMEOUT_MS },
      )
      .catch((error: unknown) => {
        console.error('Sending the move failed, posting it instead', error);
        return undefined;
      });
    if (result) return showSubmitted(app, result);

    const sent = await postMessage(app, `I played ${move.san}.`);
    if (sent) {
      setNotice('Your move is in the chat for the assistant.');
    } else {
      setPending(undefined);
      setNotice(`Tell the assistant you played ${move.san}.`);
    }
  }

  async function showSubmitted(app: McpApp, result: ToolResult) {
    setPending(undefined);
    const next = result.structuredContent as GameView | undefined;
    if (next) setView(next);
    if (result.isError || !next) {
      // The board is back on the server's position; say why.
      setNotice(errorNotice(result));
      return;
    }
    setNotice(await tellAssistant(app, next, result));
  }

  function onPieceDrop({ piece, sourceSquare, targetSquare }: PieceDropHandlerArgs) {
    if (!targetSquare || targetSquare === sourceSquare) return false;
    setNotice(undefined);
    const lastRank = targetSquare[1] === (piece.pieceType === 'wP' ? '8' : '1');
    if (piece.pieceType[1] === 'P' && lastRank) {
      if (!tryLocalMove(view!.fen, sourceSquare, targetSquare, 'q')) return false;
      setPending(movePiece(view!.fen, sourceSquare, targetSquare));
      setPromotion({ from: sourceSquare, to: targetSquare });
      return true;
    }
    const move = tryLocalMove(view!.fen, sourceSquare, targetSquare);
    if (!move) return false; // illegal: snaps back
    setPending(fenStringToPositionObject(move.fen, 8, 8));
    void submit(move);
    return true;
  }

  return (
    <main style={MAIN}>
      <Chessboard
        options={{
          position: pending ?? view.fen,
          boardOrientation: view.orientation === 'w' ? 'white' : 'black',
          squareStyles: squareStyles(view),
          allowDragging: humansTurn,
          canDragPiece: ({ piece }) => humansTurn && piece.pieceType[0] === view.turn,
          onPieceDrop,
        }}
      />
      {promotion && (
        <PromotionPicker
          color={view.turn}
          onPick={(piece) => {
            setPromotion(undefined);
            const move = tryLocalMove(view.fen, promotion.from, promotion.to, piece);
            if (move) void submit(move);
          }}
          onCancel={() => {
            setPromotion(undefined);
            setPending(undefined);
          }}
        />
      )}
      {notice && <p>{notice}</p>}
      {view.status === 'finished' && (
        <p>
          <strong>{gameOverText(view)}</strong>
        </p>
      )}
    </main>
  );
}

/**
 * The model didn't see the move (the board sent it), so put the result in its context. If it's the
 * assistant's turn, also post a chat message so it replies. Returns a notice if the host refused.
 */
async function tellAssistant(app: McpApp, view: GameView, result: ToolResult) {
  const move = view.lastMove?.san ?? 'my move';
  const fallback = `Tell the assistant you played ${move}.`;

  {
    const context = `The human moved on the board, and the move is already submitted:\n\n${resultText(result)}`;
    await app
      .updateModelContext(
        { content: [{ type: 'text', text: context }] },
        { timeout: SEND_TIMEOUT_MS },
      )
      .catch(() => {});
  }
  if (view.toMove !== 'llm') return undefined;
  return (await postMessage(app, `I played ${move}.`)) ? undefined : fallback;
}

/**
 * Posts a message in the chat as the user. Returns false if the host can't or won't. Tried even if
 * the host doesn't advertise `message`, since hosts under-report what they support.
 */
async function postMessage(app: McpApp, text: string): Promise<boolean> {
  const sent = await app
    .sendMessage({ role: 'user', content: [{ type: 'text', text }] }, { timeout: SEND_TIMEOUT_MS })
    .catch(() => ({ isError: true }));
  return !sent.isError;
}

interface LocalMove {
  uci: string;
  san: string;
  fen: string;
}

/**
 * Checks a drop against the rules locally, so illegal drags snap back at once and messages can use
 * SAN. The server still validates every move.
 */
function tryLocalMove(
  fen: string,
  from: string,
  to: string,
  promotion?: string,
): LocalMove | undefined {
  try {
    const played = new Chess(fen).move({ from, to, promotion });
    return { uci: played.lan, san: played.san, fen: played.after };
  } catch {
    return undefined;
  }
}

function PromotionPicker(props: {
  color: 'w' | 'b';
  onPick: (piece: string) => void;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        background: 'rgba(0, 0, 0, 0.5)',
      }}
      onClick={props.onCancel}
    >
      {['q', 'r', 'b', 'n'].map((piece) => (
        <button
          key={piece}
          type="button"
          aria-label={`Promote to ${piece}`}
          style={{ width: 64, height: 64, padding: 4, cursor: 'pointer' }}
          onClick={(e) => {
            e.stopPropagation();
            props.onPick(piece);
          }}
        >
          {defaultPieces[`${props.color}${piece.toUpperCase()}`]?.()}
        </button>
      ))}
    </div>
  );
}

function movePiece(fen: string, from: string, to: string): PositionDataType {
  const position = fenStringToPositionObject(fen, 8, 8);
  const piece = position[from];
  if (!piece) return position;
  const next = { ...position, [to]: piece };
  delete next[from];
  return next;
}

/**
 * Why the server rejected a move, worded for the human. Error text is written for the model, so
 * drop its instructions and the list of legal moves.
 */
function errorNotice(result: ToolResult): string {
  const [, code, message] = /^Error \[(\w+)\]: (.*)$/m.exec(resultText(result)) ?? [];
  // Usually an older board further up the chat.
  if (code === 'stale_state')
    return 'This board was out of date. It now shows the latest position.';
  return message?.replace(/ Legal moves: .*$/, '') ?? 'That move could not be played.';
}

function resultText(result: ToolResult): string {
  const first = result.content?.[0];
  return first?.type === 'text' ? first.text : '';
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

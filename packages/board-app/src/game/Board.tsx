import type { GameView } from '@chess-mcp/shared';
import { useState, type CSSProperties } from 'react';
import { Chessboard, type PieceDropHandlerArgs, type PositionDataType } from 'react-chessboard';
import { checkedKing, movePiece, tryLocalMove, type LocalMove, type Shown } from '../lib/chess.ts';
import styles from './Board.module.css';
import { PromotionPicker } from './PromotionPicker.tsx';

const LAST_MOVE: CSSProperties = { backgroundColor: 'rgb(255 213 0 / 45%)' };
const IN_CHECK: CSSProperties = {
  background: 'radial-gradient(circle, rgb(255 0 0 / 80%) 0%, rgb(255 0 0 / 0%) 75%)',
};

/**
 * The chessboard. On their turn the human drags their own pieces; illegal drops snap back, and a pawn
 * reaching the last rank asks what to promote to.
 */
export function Board(props: {
  view: GameView;
  shown: Shown;
  /** The board while a dropped move is on its way to the server. */
  pending?: PositionDataType;
  canMove: boolean;
  onMove: (move: LocalMove) => void;
}) {
  const { view, shown } = props;
  const [promotion, setPromotion] = useState<{
    from: string;
    to: string;
    position: PositionDataType;
  }>();
  const canMove = props.canMove && !promotion;

  function onPieceDrop({ piece, sourceSquare, targetSquare }: PieceDropHandlerArgs) {
    if (!targetSquare || targetSquare === sourceSquare) return false;
    const toLastRank =
      piece.pieceType[1] === 'P' && targetSquare[1] === (piece.pieceType[0] === 'w' ? '8' : '1');
    if (toLastRank) {
      if (!tryLocalMove(view.fen, sourceSquare, targetSquare, 'q')) return false;
      setPromotion({
        from: sourceSquare,
        to: targetSquare,
        position: movePiece(view.fen, sourceSquare, targetSquare),
      });
      return true;
    }
    const move = tryLocalMove(view.fen, sourceSquare, targetSquare);
    if (move) props.onMove(move);
    return Boolean(move);
  }

  function promote(piece: string) {
    if (!promotion) return;
    setPromotion(undefined);
    const move = tryLocalMove(view.fen, promotion.from, promotion.to, piece);
    if (move) props.onMove(move);
  }

  return (
    <div className={styles.board}>
      <Chessboard
        options={{
          position: promotion?.position ?? props.pending ?? shown.fen,
          boardOrientation: view.orientation === 'w' ? 'white' : 'black',
          squareStyles: highlights(shown),
          allowDragging: canMove,
          canDragPiece: ({ piece }) => canMove && piece.pieceType[0] === view.turn,
          onPieceDrop,
        }}
      />
      {promotion && (
        <PromotionPicker
          color={view.turn}
          onPick={promote}
          onCancel={() => setPromotion(undefined)}
        />
      )}
    </div>
  );
}

/** The last move and a king in check. */
function highlights(shown: Shown): Record<string, CSSProperties> {
  const styles: Record<string, CSSProperties> = {};
  if (shown.lastMove) {
    styles[shown.lastMove.from] = LAST_MOVE;
    styles[shown.lastMove.to] = LAST_MOVE;
  }
  const king = checkedKing(shown.fen);
  if (king) styles[king] = IN_CHECK;
  return styles;
}

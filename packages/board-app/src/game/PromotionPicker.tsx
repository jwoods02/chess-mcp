import { defaultPieces } from 'react-chessboard';
import styles from './PromotionPicker.module.css';

const NAMES = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' };

/** Covers the board with the four pieces a pawn can become. A click outside cancels. */
export function PromotionPicker(props: {
  color: 'w' | 'b';
  onPick: (piece: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className={styles.overlay} onClick={props.onCancel}>
      {Object.entries(NAMES).map(([piece, name]) => (
        <button
          key={piece}
          type="button"
          className={styles.piece}
          aria-label={`Promote to a ${name}`}
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

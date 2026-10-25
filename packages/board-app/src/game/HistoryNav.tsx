import { IconButton } from '../ui/Button.tsx';
import styles from './Game.module.css';

/** Steps through the game's moves: first, back, forward, latest. */
export function HistoryNav(props: {
  at: number;
  latest: number;
  label: string;
  onGo: (ply: number) => void;
}) {
  const { at, latest, onGo } = props;
  return (
    <div className={styles.group} role="group" aria-label="Move history">
      <IconButton icon="first" label="First position" disabled={at === 0} onClick={() => onGo(0)} />
      <IconButton
        icon="prev"
        label="Previous move"
        disabled={at === 0}
        onClick={() => onGo(at - 1)}
      />
      <span className={styles.muted} aria-live="polite">
        {props.label}
      </span>
      <IconButton
        icon="next"
        label="Next move"
        disabled={at === latest}
        onClick={() => onGo(at + 1)}
      />
      <IconButton
        icon="last"
        label="Latest position"
        disabled={at === latest}
        onClick={() => onGo(latest)}
      />
    </div>
  );
}

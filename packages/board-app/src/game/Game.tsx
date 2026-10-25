import type { GameView } from '@chess-mcp/shared';
import type { KeyboardEvent } from 'react';
import { playersText, statusText } from '../lib/chess.ts';
import type { McpApp } from '../lib/host.ts';
import { Button } from '../ui/Button.tsx';
import { Board } from './Board.tsx';
import styles from './Game.module.css';
import { HistoryNav } from './HistoryNav.tsx';
import { useGameActions } from './useGameActions.ts';
import { useHistory } from './useHistory.ts';

/** A game: who's playing, the board, the move history and the human's two actions. */
export function Game(props: {
  app: McpApp;
  view: GameView;
  onView: (view: GameView) => void;
  onNewGame: () => Promise<string | undefined>;
}) {
  const { view } = props;
  const history = useHistory(view);
  const actions = useGameActions(props.app, view, props.onView, props.onNewGame);
  const idle = history.live && !actions.busy && !actions.pending;
  const canMove = idle && view.status === 'active' && view.toMove === 'human';
  const canTakeBack =
    idle && view.moves.length > 0 && (view.toMove === 'human' || view.status === 'finished');

  // Arrow keys step through the moves, as on most chess sites.
  function onKeyDown(event: KeyboardEvent) {
    const ply = { ArrowLeft: history.at - 1, ArrowRight: history.at + 1, Home: 0, End: view.ply }[
      event.key
    ];
    if (ply === undefined) return;
    event.preventDefault();
    history.goTo(ply);
  }

  const status = !history.live
    ? 'Looking back. The arrows return to the game.'
    : actions.pending
      ? 'Sending your move…'
      : statusText(view);

  return (
    <main className={styles.game} onKeyDown={onKeyDown}>
      <div className={styles.row}>
        <span className={styles.muted}>{playersText(view)}</span>
        {!view.coaching.mode.startsWith('play@') && (
          <span className={styles.badge}>{view.coaching.label}</span>
        )}
      </div>

      <Board
        view={view}
        shown={history.shown}
        pending={actions.pending}
        canMove={canMove}
        onMove={(m) => void actions.move(m)}
      />

      <div className={styles.row}>
        <HistoryNav at={history.at} latest={view.ply} label={history.label} onGo={history.goTo} />
        <div className={styles.group}>
          <Button disabled={!canTakeBack} onClick={() => void actions.takeBack()}>
            Take back
          </Button>
          <Button disabled={actions.busy} onClick={() => void actions.newGame()}>
            New game
          </Button>
        </div>
      </div>

      <p
        className={[styles.status, actions.notice?.danger && styles.danger]
          .filter(Boolean)
          .join(' ')}
        aria-live="polite"
      >
        {actions.notice?.text ?? status}
      </p>
    </main>
  );
}

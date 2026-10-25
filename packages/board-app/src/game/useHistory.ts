import type { GameView } from '@chess-mcp/shared';
import { useMemo, useState } from 'react';
import { positions, type Shown } from '../lib/chess.ts';

/** Stepping back through the game. Goes back to the latest position whenever the game moves on. */
export function useHistory(view: GameView) {
  const history = useMemo(() => positions(view.pgn), [view.pgn]);
  const [browse, setBrowse] = useState<{ ply: number; at: number }>();
  const at = browse?.ply === view.ply ? browse.at : view.ply;
  const live = at === view.ply;
  const shown: Shown = live ? { fen: view.fen, lastMove: view.lastMove } : history[at]!;
  const goTo = (ply: number) =>
    setBrowse({ ply: view.ply, at: Math.max(0, Math.min(view.ply, ply)) });
  return { at, live, shown, label: history[at]!.label, goTo };
}

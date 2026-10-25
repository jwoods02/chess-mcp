import type { GameSetup, GameView, Level, Player } from '@chess-mcp/shared';
import { useState } from 'react';
import type { McpApp } from '../lib/host.ts';
import { Button } from '../ui/Button.tsx';
import { Field } from '../ui/Field.tsx';
import { Segmented } from '../ui/Segmented.tsx';
import styles from './Setup.module.css';
import { useStartGame } from './useStartGame.ts';

/** The new-game card: opponent, colour, strength and coaching, then Start. */
export function Setup(props: {
  app: McpApp;
  options: GameSetup['setup'];
  onStarted: (view: GameView) => void;
  onCancel?: () => void;
}) {
  const { options } = props;
  const [opponent, setOpponent] = useState<Player>(options.opponents[0]!);
  const [color, setColor] = useState<'white' | 'black'>('white');
  const [level, setLevel] = useState<Level>('casual');
  const [coaching, setCoaching] = useState(options.coaching[0]!.id);
  const { starting, notice, start } = useStartGame(props.app, props.onStarted);

  const mode = options.coaching.find((c) => c.id === coaching)!;
  const strength = options.levels.find((l) => l.id === level)!;
  const choice = {
    args: {
      white: color === 'white' ? 'human' : opponent,
      black: color === 'black' ? 'human' : opponent,
      coaching,
      opponentLevel: level,
    },
    text:
      `I play ${color === 'white' ? 'White' : 'Black'} against ${opponent === 'jev' ? 'Jev' : 'you'} ` +
      `at ${strength.label} level, with "${mode.label}" coaching`,
  };

  return (
    <main className={styles.setup}>
      <Field label="Opponent">
        <Segmented
          value={opponent}
          options={options.opponents.map((p) => ({
            value: p,
            label: p === 'jev' ? 'Jev' : 'Assistant',
          }))}
          onChange={setOpponent}
        />
      </Field>
      <Field label="You play">
        <Segmented
          value={color}
          options={[
            { value: 'white', label: 'White' },
            { value: 'black', label: 'Black' },
          ]}
          onChange={setColor}
        />
      </Field>
      <Field label="Opponent strength">
        <Segmented
          value={level}
          options={options.levels.map((l) => ({
            value: l.id,
            label: l.rating ? `~${l.rating}` : 'Full',
          }))}
          onChange={setLevel}
        />
      </Field>
      <Field label="Coaching" hint={mode.description}>
        <Segmented
          value={coaching}
          options={options.coaching.map((c) => ({ value: c.id, label: c.label }))}
          onChange={setCoaching}
        />
      </Field>

      <div className={styles.footer}>
        <span
          className={[styles.notice, notice?.danger && styles.danger].filter(Boolean).join(' ')}
          aria-live="polite"
        >
          {notice?.text}
        </span>
        <div className={styles.actions}>
          {props.onCancel && <Button onClick={props.onCancel}>Back</Button>}
          <Button primary disabled={starting} onClick={() => void start(choice)}>
            {starting ? 'Starting…' : 'Start game'}
          </Button>
        </div>
      </div>
    </main>
  );
}

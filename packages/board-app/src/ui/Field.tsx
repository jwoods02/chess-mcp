import type { ReactNode } from 'react';
import styles from './Field.module.css';

/** A labelled group of controls, with an optional hint underneath. */
export function Field(props: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className={styles.field} role="group" aria-label={props.label}>
      <span className={styles.label}>{props.label}</span>
      {props.children}
      {props.hint && <span className={styles.hint}>{props.hint}</span>}
    </div>
  );
}

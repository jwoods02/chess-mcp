import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';
import { Icon, type IconName } from './Icon.tsx';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean };

export function Button({ primary, className, ...props }: Props) {
  const classes = [styles.button, primary && styles.primary, className].filter(Boolean).join(' ');
  return <button type="button" className={classes} {...props} />;
}

/** A button that's only an icon, labelled for screen readers and tooltips. */
export function IconButton({ icon, label, ...props }: Props & { icon: IconName; label: string }) {
  return (
    <Button className={styles.icon} aria-label={label} title={label} {...props}>
      <Icon name={icon} />
    </Button>
  );
}

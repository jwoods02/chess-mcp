// Outlined icons in the text colour, as the host's design guidelines ask.
const PATHS = {
  first: 'M11 7l-5 5l5 5 M17 7l-5 5l5 5',
  prev: 'M15 6l-6 6l6 6',
  next: 'M9 6l6 6l-6 6',
  last: 'M7 7l5 5l-5 5 M13 7l5 5l-5 5',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      width="1.25em"
      height="1.25em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

import type { Level } from '@chess-mcp/shared';

interface LevelSettings {
  label: string;
  /** A rough guide only: none of this is calibrated yet. */
  rating?: number;
  /** How the LLM should play, sent with every one of its moves. A bare rating gives it nothing to act on. */
  persona: string;
  /** Jev draws from its `topN` most likely moves, weighted by probability ^ (1 / temperature). */
  jev: { topN: number; temperature: number };
}

export const LEVELS: Record<Level, LevelSettings> = {
  beginner: {
    label: 'beginner',
    rating: 400,
    persona:
      'develop slowly, sometimes leave a piece undefended or miss a threat, and grab free material ' +
      "when you see it. Don't hang your queen on purpose or play random moves.",
    jev: { topN: 5, temperature: 2 },
  },
  casual: {
    label: 'casual player',
    rating: 800,
    persona: 'develop sensibly and usually spot one-move threats, but miss tactics two moves deep.',
    jev: { topN: 4, temperature: 1.3 },
  },
  club: {
    label: 'club player',
    rating: 1200,
    persona:
      'play solidly and watch for one-move tactics, but misjudge plans and miss deeper combinations.',
    jev: { topN: 3, temperature: 1 },
  },
  best: { label: 'strongest', persona: 'play your best.', jev: { topN: 1, temperature: 1 } },
};

/** What the LLM is told on its move, e.g. "Play as a beginner (about 400): …". Empty at `best`. */
export function personaText(level: Level): string {
  if (level === 'best') return '';
  const { label, rating, persona } = LEVELS[level];
  return `Play as a ${label} (about ${rating}): ${persona}`;
}

/** Draws one of Jev's most likely moves for this level, or undefined if there are none. */
export function pickAtLevel(
  probabilities: Record<string, number>,
  level: Level,
  random = Math.random,
): string | undefined {
  const { topN, temperature } = LEVELS[level].jev;
  const top = Object.entries(probabilities)
    .filter(([, p]) => p > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, topN)
    .map(([san, p]) => ({ san, weight: p ** (1 / temperature) }));
  let draw = random() * top.reduce((sum, m) => sum + m.weight, 0);
  for (const m of top) {
    draw -= m.weight;
    if (draw <= 0) return m.san;
  }
  return top.at(-1)?.san;
}

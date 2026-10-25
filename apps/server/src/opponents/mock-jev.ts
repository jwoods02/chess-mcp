// Test helper: a Jev stand-in built on the AI SDK's mock decision model, so tests need no network.
import { Experimental_DecisionMockModelV4 as MockDecisionModel } from 'ai/test';

/** A decision model that answers with `pick` (or the first option) at the given probability. */
export function mockJevModel(pick?: string, onCall?: (criteria: Record<string, unknown>) => void) {
  return new MockDecisionModel({
    doDecide: async ({ questions }) => {
      const { criteria } = questions.move as { criteria: Record<string, unknown> };
      onCall?.(criteria);
      const options = Object.keys(criteria);
      const choice = pick && options.includes(pick) ? pick : options[0]!;
      const probabilities = Object.fromEntries(options.map((o) => [o, o === choice ? 1 : 0]));
      return { answers: { move: { type: 'choice', choice, probabilities } }, warnings: [] };
    },
  });
}

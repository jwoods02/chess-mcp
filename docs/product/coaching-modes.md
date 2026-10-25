# Coaching modes

Coaching is the product's differentiator, and we expect to iterate on it a lot. So a "coaching mode"
is a named, versioned unit rather than prose sprinkled through tool descriptions. That way we can add
modes, change them and compare them without touching the game engine.

## What a mode controls

| Aspect                  | Example                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Guidance to the LLM** | Instructions returned with each relevant tool result: "Ask one guiding question. Do not reveal the best move."                                                     |
| **Facts it surfaces**   | Which structured facts the server computes and attaches: material balance, hanging pieces, checks available, Jev's move distribution, and later engine evaluation. |
| **Trigger points**      | When coaching happens: before the human moves, after each human move, only on mistakes, only when asked, or at game end.                                           |
| **Disclosure policy**   | What the LLM is allowed to reveal: never the answer, hints only, or everything.                                                                                    |
| **Permissions**         | Whether takebacks are allowed, and whether hints cost anything.                                                                                                    |

The **server** decides _when_ coaching applies and _which facts_ are relevant. The **LLM** turns those
facts into dialogue that follows the mode's guidance. The server never writes coaching prose itself.

## Initial modes (candidates)

| id                 | Summary                                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `none`             | Plain play. No coaching block in responses.                                                                                                  |
| `commentary`       | After each move (by either side), a short comment on the ideas. Friendly and low-pressure.                                                   |
| `socratic`         | Before the human moves in critical positions, the LLM asks a guiding question. It never reveals the move.                                    |
| `hint_ladder`      | The human can ask for help. Hints escalate from a theme ("look at the e-file") to a piece ("your rook") to the move. Hints used are counted. |
| `blunder_check`    | Silent unless the human's move drops material or misses a mate-in-1, then the LLM offers a takeback and an explanation.                      |
| `post_game_review` | No interruptions during play. At the end, the LLM walks through 3–5 key moments.                                                             |
| `puzzle_coach`     | For puzzles. Reacts to the human's attempt, asks for their reasoning, then nudges or confirms.                                               |

Modes can be selected at game creation and **switched mid-game** (`set_coaching_mode`).

## Experimentation

- Every game and puzzle attempt records `coachingMode` with its `id@version`, so we can compare outcomes
  later (puzzle success rate, blunders per game, whether the human kept playing).
- Modes are registered in code against a typed interface (see
  [architecture § Coaching modes](../architecture.md#coaching-modes)). Adding a mode means adding one file.
- (Later) MCP **prompts** are exposed for each mode ("Start a Socratic coaching game"), so users can pick a
  mode from their client's prompt menu.

## Opponent settings (later experiments)

Coaching modes decide how much advice the human gets. A separate setting decides how the opponent
plays, so the two can be combined freely ("blunder check against a weak Jev"). We expect to try
several ideas here, so treat each one like a mode: a named, versioned setting recorded on the game
(for example `jev-top5@1`), chosen at game creation, and easy to add or drop.

| Idea                     | Opponent | How                                                                                                      |
| ------------------------ | -------- | -------------------------------------------------------------------------------------------------------- |
| Pick among the top moves | Jev      | Choose at random between Jev's 1st and Nth most likely move, instead of always the top one.              |
| Temperature              | Jev      | Sample from Jev's whole distribution, sharpened or flattened. Low = strongest, high = looser and wilder. |
| "Play like a 1200"       | Jev      | Pass a target rating in Jev's state or question, and see whether its choices change.                     |
| "Play like a 1200"       | LLM      | Tell the assistant the rating to play at and the kind of mistakes that player makes.                     |
| Engine skill level       | Engine   | When an analysis engine (Stockfish) arrives, use its built-in skill levels as a calibrated baseline.     |

What to watch when trying them: whether the human keeps playing, how often they win, and whether the
opponent's mistakes feel human (a missed tactic) rather than random (a hung queen for no reason).

## Open questions

- Should a mode be able to _block_ a move (for example "are you sure?" confirmation in `blunder_check`)
  or only comment after it? The current lean: comment and offer a takeback, never block.
- Which facts can we compute cheaply without an engine? chess.js gives us legality, attacks and checks.
  Hanging-piece detection is a simple static exchange check we write ourselves. Anything deeper waits
  for the analysis provider.

# Coaching modes

Coaching is the product's differentiator, and we expect to iterate on it a lot. So a "coaching mode"
is a named, versioned unit rather than prose sprinkled through tool descriptions. That way we can add
modes, change them and compare them without touching the game engine.

## The idea in one paragraph

Most of a mode is prompting: "ask one question before you comment", "stay quiet unless something
matters", "review three moments at the end". The LLM is good at that. What it can't be trusted with is
reading the board: it misses a defender or a pin and is just as confident when it's wrong, and a coach
who says "you hung your knight" when you didn't teaches you to distrust it. So the server supplies
**facts** it has checked, gives the LLM a **calculator** to check its own claims, and decides **when**
the coach speaks. The LLM writes every word of coaching; the server never writes coaching prose.

## Who knows what

| Who                   | Good at                                                                                | Not to be trusted for                              |
| --------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------- |
| chess.js (the server) | Rules, legality, exact one-move facts                                                  | Judging a position                                 |
| Jev                   | Human-like intuition: how natural a move is, what a typical player would play          | Truth: it's weak and often wrong                   |
| The LLM               | Explaining, asking questions, adapting to this person, setting up positions and drills | Calculating, or calling a move a blunder unchecked |
| Engine (later)        | Evaluation and deep tactics                                                            | Explaining anything                                |
| The board             | Direct play; later arrows, highlights and a setup screen                               | It only hears about calls it made itself           |

## When the coach gets a turn

The LLM can only coach when it's in the loop, and that depends on how the human moves:

| How the human moves                               | LLM in the loop before the move                        | After the move                      |
| ------------------------------------------------- | ------------------------------------------------------ | ----------------------------------- |
| Typed in chat                                     | Yes                                                    | Yes                                 |
| Dragged, against the LLM, on Claude Code          | Yes (the drag becomes a draft message the human sends) | Yes                                 |
| Dragged, against the LLM, where the board submits | No (already played)                                    | Yes, via the board's message        |
| Dragged, against Jev                              | No                                                     | **No**: Jev replies inside the call |

Two rules follow, so coaching behaves the same on every path:

1. **Coach after the move, never block it.** Instead of "are you sure?", say "that drops your knight,
   want to take it back?" and offer `undo_move`. A typed move may still get an early warning, but no mode
   depends on it.
2. **The server decides when the coach speaks.** Each result says whether the mode has something to
   say. In games against Jev the board posts a chat message only then, which gives the coach a turn
   without commenting on every move.

## What a mode is

| Part              | What it does                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Summary**       | One line that rides along with every result, so the LLM stays on track between coaching moments.                 |
| **Guidance**      | The full instructions, sent only at key moments (see [Keeping the model on track](#keeping-the-model-on-track)). |
| **When to speak** | A small function over the facts: every move, only when a fact matters, only when asked, or only at the end.      |
| **Version**       | Recorded on the game as `id@version`, so changing the wording is a new version we can compare.                   |

Adding a mode means adding one file with some text and a small function. See
[architecture § Coaching modes](../architecture.md#coaching-modes-m5).

## Keeping the model on track

The server keeps no session, so it can't know what the LLM still remembers: long games, context
compaction and a game resumed in a new chat all lose instructions given once at the start. Repeating
every instruction in every result wastes tokens (roughly 6k a game) and gets tuned out. So guidance is
layered, cheapest first:

1. **A standing rule in the server instructions**, which clients load once and keep at system-prompt
   level: follow the coaching line and the next step in the latest result, and back concrete claims
   with the facts.
2. **One line in every result**, next to the action: the mode's summary in `coaching.summary`, and in
   `next`, the opponent level when it's the LLM's move ("…playing as a beginner, about 400: …"). About
   20–40 tokens.
3. **Full guidance only at key moments**: game start, a settings change, resuming a game (`get_game`),
   game over, and whenever the mode says speak. Then the detailed instruction arrives exactly when the
   LLM has to act on it.

A 40-move game costs about 1.5k tokens of reminders plus a few hundred per coaching moment. All of it
sits in the structured result, which every client shows the model.

## Facts and the calculator

Facts are computed with chess.js after each move, for both sides:

- What the move did: captured, gave check, castled, promoted.
- Material balance.
- Pieces now undefended, or attacked by a cheaper piece.
- What the opponent can now capture or check.
- What the human missed: a mate in one, or a free capture.
- Against Jev: how likely Jev rated the human's move, and its own top choice. This is "what a typical
  player would do", not the truth.

The calculator is a tool, `analyze_position` (built). With no moves it lists what the side to move can
do: mates in one, the best winning capture, and its pieces under attack. With a line of moves, it plays
them on a scratch board, without changing the game, and returns the same facts for each move. Before the LLM says "Nf3 hangs the bishop" or answers
"why not Bc4?", it checks. Server instructions tell it to back any concrete claim this way rather than
read the board itself.

These checks catch the one-move mistakes that decide most games below about 1400. A fork two moves
later needs a real engine. We add Stockfish when playtesting shows the coach missing those, not before.

## What helps people learn

General teaching principles, applied to chess. Modes should follow them:

- **Teach a routine, not answers.** Checks, captures and threats before every move fixes most amateur
  blunders. Ask "what is your opponent threatening?" rather than naming the threat.
- **Let them explain first.** In a review, ask "what were you thinking here?" before saying anything.
  People remember their own explanations better than the coach's.
- **Hints that get more specific.** A theme, then the piece, then the move. Fewer hints as they improve.
- **A few key moments.** Two or three per game. Twenty corrections teach nothing.
- **Practise your own mistakes again.** Today's blunder becomes a puzzle next week.
- **Winning matters.** Beginners who always lose stop playing. An opponent you beat about half the
  time teaches more than an accurate one (see [Opponent level](#opponent-level)).

What doesn't help: evaluation numbers, "the best move was X" without why, interrupting every move, and
generic praise.

## Candidate modes

Roughly ordered by how much the coach says.

| id              | Advice     | What the coach does                                                                                       | Needs         |
| --------------- | ---------- | --------------------------------------------------------------------------------------------------------- | ------------- |
| `play`          | None       | Plays and chats. Says nothing about the position, or Jev's instinct, unless asked.                        | Prompt only   |
| `blunder_check` | Sometimes  | Silent unless a fact matters (a dropped piece, a missed mate), then explains and offers a takeback.       | Facts (built) |
| `hints`         | Often      | When the human has a chance or a threat on their move, gives the first hint unprompted; more on request.  | Built         |
| `socratic`      | Often      | In sharp positions, asks a checks/captures/threats question before the human moves. Never names the move. | Facts         |
| `commentary`    | Every move | A short, friendly comment on the ideas after each move.                                                   | Prompt only   |
| `plan_first`    | Every move | The human says their plan before each move; the coach responds to the reasoning, not just the move.       | Prompt only   |
| `puzzle_coach`  | Puzzles    | Reacts to the human's attempt, asks for their reasoning, then nudges or confirms.                         | Puzzles (M4)  |

Modes are chosen at game creation and can be switched mid-game (`update_game_settings`). Built so far:
`play`, `blunder_check` and `hints`.

**A mode has to change what the coach does unprompted.** The human can ask for help, a hint or a
review at any point, in any mode, and the coach answers from checked facts. So "hints when asked" or
"review when asked" aren't modes. `hints` gives the first hint before the human moves whenever they
have a chance or a threat; and every mode, `play` included, offers a short review of the key moments
when a game with a human in it ends, rather than a separate review mode.

## Experiences that are hard to get elsewhere

Chess sites have personality bots, canned coach explanations and game review. What they don't have is
an open conversation grounded in checked facts, which can build things on request:

1. **Ask anything, any time.** "Why not Bc4?" mid-game gets an answer checked with `analyze_position`.
2. **Plan first.** The coach judges the human's reasoning (`plan_first`), which an engine can't do.
3. **Drills on request.** "I keep losing to early queen attacks": the LLM sets up positions, the server
   checks them, and the human plays them out against Jev. Builds on puzzles (M4).
4. **A sparring partner with a lesson plan.** Jev proposes its most natural moves, the LLM picks the one
   that sets up today's theme (say, a fork for the human to find) and chess.js checks it. Needs an LLM
   turn per opponent move, so it suits typed or chat-driven games.
5. **Jev's intuition as a mirror.** "Jev gave your move 3%: surprising. Genius or mistake?" or "most
   players would play Nf3 here; why didn't you?"
6. **Guess the move.** The server holds a master game, the human guesses each move, and the LLM explains
   the master's idea next to theirs.
7. **Try again from any moment.** "Go back to where I blundered and let me play it again", as a branch
   of the real game.
8. **An opponent you describe.** "Play like a 1000 who loves to attack", using the opponent level below.

## Opponent level

Coaching modes decide how much advice the human gets. The opponent level decides how the opponent
plays, so the two combine freely ("blunder check against a beginner-level Jev"). Like a mode, it's set
at game creation, can be changed mid-game (`update_game_settings`) and is recorded on the game.

| Level      | Rough rating | The LLM opponent is told                                                                      | Jev                         |
| ---------- | ------------ | --------------------------------------------------------------------------------------------- | --------------------------- |
| `beginner` | ~400         | Develops slowly, sometimes leaves a piece undefended or misses a threat, grabs free material. | Picks among its top 5 moves |
| `casual`   | ~800         | Sensible development, usually sees one-move threats, misses two-move tactics.                 | Picks among its top 4       |
| `club`     | ~1200        | Solid and alert to one-move tactics, misjudges plans, misses deeper combinations.             | Picks among its top 3       |
| `best`     | —            | Play your best.                                                                               | Always its top move         |

- **The LLM opponent is steered by prompt only.** The server can't choose its moves, so the level's
  description goes in `next` every time it's the LLM's turn. A bare number ("play like a 400") gives the
  model nothing to act on; describing how that player behaves does. Models asked to play weakly tend to
  either play normally or blunder absurdly, so expect to tune the descriptions.
- **Jev is steered by the server.** Jev's moves are weighted by how likely it rated them, sharpened or
  flattened by a temperature, and one is drawn from the top N. The server makes the choice, so it can't
  drift, but the ratings are guesses until we measure the levels against something calibrated, such as
  Stockfish's skill levels.
- **The facts can grade the persona.** After the LLM's move the same facts say whether it hung a piece
  or missed a capture, so over a game we can see whether "beginner" played like one.

### Later experiments

| Idea                   | Opponent | How                                                                                    |
| ---------------------- | -------- | -------------------------------------------------------------------------------------- |
| Temperature only       | Jev      | Sample from Jev's whole distribution rather than the top N.                            |
| Rating in Jev's prompt | Jev      | Pass the target rating in Jev's state or question, and see whether its choices change. |
| Styles                 | Both     | "Loves to attack", "trades everything": a style line next to the level.                |
| Engine skill level     | Engine   | When Stockfish arrives, use its skill levels as a calibrated baseline.                 |

What to watch: whether the human keeps playing, how often they win, and whether the opponent's mistakes
feel human (a missed tactic) rather than random (a hung queen for no reason).

## How we try modes out

- **Prompt first.** Before building a mode, play a few games coaching by prompt alone with the existing
  tools. Note each time the LLM misreads the board or speaks at the wrong moment: that tells us which
  facts to compute and which modes are worth building.
- Every game records `coachingMode` as `id@version`, so we can compare outcomes later (blunders per
  game, whether the human kept playing, puzzle success).
- (Later) MCP **prompts** for each mode ("Start a Socratic coaching game"), so users can pick a mode from
  their client's prompt menu, and a setup screen in the board.

## Open questions

- How often will the LLM actually use `analyze_position` before making a claim, and does it slow replies
  down noticeably?
- Does the speak flag feel right in Jev games, or does the board's chat message ("I played e4.") get in
  the way?
- Which mistakes do one-move facts miss in real games? That decides when Stockfish arrives.

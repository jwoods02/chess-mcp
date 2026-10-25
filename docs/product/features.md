# Features & roadmap

Milestones are ordered. Each one must work in **both** text-only clients and MCP App clients before we
move on, except where a feature is explicitly UI-only.

---

## M1 — Play a game (built)

The foundation: a human and an agent can play a complete, legal game of chess over many turns.

**User stories**

- As a human, I can ask the agent to start a game, choose my colour and optionally a starting position.
- As a human, I tell the agent my move in plain language ("knight to f3", "Nf3", "g1f3") and the
  server validates it. Illegal moves are rejected with the reason and the list of legal moves.
- The agent plays its own moves (the LLM as opponent). Those moves are validated exactly like mine.
- After every move I see the board, the move list, whose turn it is and the game status (check,
  checkmate, stalemate, the draw rules).
- I can come back to a game later in the same conversation and the agent can load it by ID.
- I can resign, offer or accept a draw (either side can offer), or take a move back.

**Done when**

- A full game can be played to checkmate, stalemate, a draw by repetition or the 50-move rule, or resignation.
- Game state survives a server restart (SQLite).
- Every tool response includes a text board and a FEN, plus structured content.
- It runs locally with `pnpm dev` and connects from an MCP client over HTTP.

## M2 — Board UI (MCP App) (built)

- A chess.com-style board (light/dark squares, piece icons, coordinates) rendered inline when a
  game tool is called.
- Highlights for the last move and for check. The board is oriented to the human's colour.
- A result line when the game ends. Moves and whose turn it is stay in the chat, not the board.
- Follows the host theme (light/dark).
- **Moving on the board (built):** drag your pieces on your turn, with a promotion picker. The move
  goes straight to the server and the assistant is told, so it replies (see
  [architecture § MCP App](../architecture.md#mcp-app-board-ui)).
- **Live board experiment (removed):** one board per game that updated in place by polling the server.
  It added a hidden tool, polling and a second code path through every move tool, so we dropped it
  in favour of one board per round (see [moving pieces on the board](../mcp-apps-hosts.md)).
- **Board chrome (built):** move history (back, forward, arrow keys), Take back, and New game, which
  opens the new-game card (opponent, colour, strength, coaching). A `play_chess` prompt starts a game
  from the client's slash commands.
- **Later:** click-to-move and legal-move dots, and hint arrows on the board.

## M3 — Opponents: Jev (play built; coaching next)

Add a non-LLM AI opponent so that the LLM can _coach_ instead of _play_.

- **Built:** configure a seat as `jev` (only offered when a TypeSafe key is set). When it's Jev's turn
  the server asks Jev for a move, validates it and plays it inside the same call, so dragging a piece
  against Jev gets an instant reply on every host.
- Jev returns a probability for each legal move. We keep that distribution: it is a strong coaching
  signal ("Jev's intuition gave your move 2%; it favoured Nxe5 at 41%").
- Strength and style control, for example sampling from Jev's top moves rather than always taking the
  best one. These are experiments, listed under
  [opponent level](./coaching-modes.md#opponent-level).
- Modes: **human vs Jev with the LLM as coach** and LLM vs Jev (built). Jev vs Jev needs a stepping tool
  (later). Coaching while you play Jev is designed in [coaching modes](./coaching-modes.md#when-the-coach-gets-a-turn).

> **About Jev:** TypeSafe AI's _System One_ model. It is not an LLM: it takes a state plus typed
> questions (`choice`, yes/no, `score`) and returns calibrated probabilities in a single pass. It is
> fast and cheap. Third-party benchmarks show it is weak at chess (it loses to Stockfish level 0),
> which makes it a reasonable sparring partner for beginners and an interesting "intuitive" foil for an
> LLM coach.

## M4 — Puzzles

- The LLM **builds a position**: it describes pieces on squares, or gives a FEN, and the server checks
  the position is legal (two kings, no pawns on the back rank, the side not to move isn't in check, and
  so on) and returns a canonical FEN with diagnostics.
- The LLM creates a **puzzle** from a position: the side to move, a prompt ("White to play and win
  material"), and an _optional_ solution line plus hints.
- The human proposes a move (as text or on the board). The server checks it is legal and, if a
  solution exists, whether it is correct. The LLM then coaches based on what the human tried.
- **Open puzzles** have no fixed solution. The LLM evaluates the human's reasoning itself, and the
  server only enforces legality.
- Puzzles are stored, so they can be replayed or shared and attempts are tracked.

## M5 — Coaching modes (next, ahead of M4)

A pluggable set of teaching styles that wrap any game or puzzle. We build it before puzzles, because
puzzles reuse it (`puzzle_coach`) and a new-game screen needs modes to offer. See
[coaching-modes.md](./coaching-modes.md).

- The server supplies checked facts after each move and an `analyze_position` calculator; modes are mostly
  prompt text; the server decides when the coach speaks.
- Step 1 (built): checked facts, `play` and `blunder_check`, the opponent level (beginner to best, for
  Jev and the LLM), and `update_game_settings`.
- Step 2 (built): `analyze_position`, a proactive `hints` mode, and a review offer at the end of every
  game. Next candidates: `socratic`, `commentary`, `plan_first`, each only if it changes what the coach
  does unprompted.
- New-game setup card and a `play_chess` prompt (built).

## Later / ideas

- **Analysis provider:** Stockfish (WASM or native) for evaluation, blunder detection and "best move"
  facts that coaching modes can draw on.
- Import games from Lichess or Chess.com (PGN) for post-game review sessions.
- Opening trainer: drill a repertoire, with the LLM explaining the ideas.
- Progress tracking per human: recurring mistakes and themes they struggle with.
- Homepage / web app package (`apps/web`) for landing, docs and possibly a game viewer.
- Swap storage to Redis or Postgres if D1 stops being enough.

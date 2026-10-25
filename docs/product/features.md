# Features & roadmap

Milestones are ordered. Each one must work in **both** text-only clients and MCP App clients before we
move on, except where a feature is explicitly UI-only.

---

## M1 — Play a game (current focus)

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

## M2 — Board UI (MCP App)

- A chess.com-style board (light/dark squares, piece icons, coordinates) rendered inline when a
  game tool is called.
- Highlights for the last move and for check. The board is oriented to the human's colour.
- A result line when the game ends. Moves and whose turn it is stay in the chat, not the board.
- Follows the host theme (light/dark).
- **Stretch:** the human moves by drag/drop or click-click on the board. The move goes straight to the
  server and the agent is told about it (see [architecture § MCP App](../architecture.md#mcp-app-board-ui)).
- **Stretch experiment:** one live board per game instead of one per round. The board updates in place
  for your moves and the assistant's replies, and may float while the chat scrolls. Try it behind a
  setting and compare how each feels (see [architecture § When the board is shown](../architecture.md#when-the-board-is-shown)).
  This includes a promotion picker and showing legal-move dots.

## M3 — Opponents: Jev

Add a non-LLM AI opponent so that the LLM can _coach_ instead of _play_.

- Configure a seat as `jev`. When it's Jev's turn the server asks Jev for a move, validates it and
  applies it, either automatically after the human moves or on request.
- Jev returns a probability for each legal move. We keep that distribution: it is a strong coaching
  signal ("Jev's intuition gave your move 2%; it favoured Nxe5 at 41%").
- Strength control by sampling from Jev's distribution with a temperature, rather than always taking
  the top move.
- Modes: **human vs Jev with the LLM as coach**, LLM vs Jev (as a spectator sport or demo), and Jev vs Jev.

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

## M5 — Coaching modes

A pluggable set of teaching styles that wrap any game or puzzle. See [coaching-modes.md](./coaching-modes.md).

## Later / ideas

- **Analysis provider:** Stockfish (WASM or native) for evaluation, blunder detection and "best move"
  facts that coaching modes can draw on.
- Import games from Lichess or Chess.com (PGN) for post-game review sessions.
- Opening trainer: drill a repertoire, with the LLM explaining the ideas.
- Progress tracking per human: recurring mistakes and themes they struggle with.
- Homepage / web app package (`apps/web`) for landing, docs and possibly a game viewer.
- Swap storage to Redis or Postgres, and deploy.

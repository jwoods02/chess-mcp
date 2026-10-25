# Architecture

Status: **draft**. M1 (play a game) is specified in detail. Later milestones are sketched just enough
to keep M1 from painting us into a corner. Product context lives in [product/](./product/vision.md).

**Guiding rule: KISS.** Minimal code that a human can read top to bottom. No abstraction until there
is a second implementation that needs it. The exceptions are the storage interface (we know Redis or
another store is coming) and the opponent interface (Jev, then possibly others).

---

## Stack

| Concern         | Choice                                                                        |
| --------------- | ----------------------------------------------------------------------------- |
| Language        | TypeScript **7** (native `tsc`), ESM, `strict`                                |
| Runtime         | Node.js 24 LTS. Dev runs `.ts` directly via Node's built-in type stripping.   |
| HTTP            | **Hono** plus `@hono/node-server`                                             |
| MCP             | Official SDK v2: `@modelcontextprotocol/server`, `@modelcontextprotocol/hono` |
| MCP Apps        | `@modelcontextprotocol/ext-apps` (server helpers and the UI `App` class)      |
| Chess rules     | `chess.js`                                                                    |
| Schemas         | `zod` 4                                                                       |
| Storage         | `better-sqlite3`, plain SQL, no ORM                                           |
| UI              | React 19, `react-chessboard`, Vite with `vite-plugin-singlefile`              |
| Tests           | Vitest                                                                        |
| Lint / format   | Oxlint, Oxfmt                                                                 |
| Package manager | pnpm workspaces with a `catalog:` for shared versions                         |

- **Why Hono:** the official SDK ships `@modelcontextprotocol/hono` (`createMcpHonoApp`, which handles
  Host/Origin checks and body parsing) and a web-standard `createMcpHandler(...).fetch`. That is the
  best first-party support of any framework.
- **TS 7** has no stable compiler API until 7.1, so we avoid tools that depend on it. Plain `tsc` is fine.
- **Oxfmt** is pre-1.0, so we pin its version.

## Repo layout

```
chess-mcp/
├─ apps/
│  └─ server/                 # the MCP server (Hono)
│     └─ src/
│        ├─ index.ts          # reads env, opens the store, starts Hono
│        ├─ app.ts            # Hono app: GET /health, ALL /mcp
│        ├─ mcp.ts            # buildMcpServer(deps): registers tools + the board UI resource
│        ├─ tools/            # one file per tool
│        ├─ chess/
│        │  ├─ game.ts        # create game, apply move, end game, build GameView (wraps chess.js)
│        │  └─ text.ts        # ASCII board + text tool response
│        ├─ store/
│        │  ├─ store.ts       # GameStore interface
│        │  ├─ sqlite.ts      # better-sqlite3 implementation
│        │  └─ memory.ts      # in-memory implementation (tests)
│        ├─ opponents/        # M3: Jev
│        └─ coaching/         # M5: coaching modes
├─ packages/
│  ├─ board-app/              # MCP App UI → builds to dist/index.html
│  └─ shared/                 # zod schemas + types shared by server and UI (GameView etc.)
└─ docs/
```

`apps/web` (a homepage) can be added later without touching anything else.

## Running locally

```bash
pnpm install
pnpm dev          # builds the board UI in watch mode + runs the server on http://localhost:3000/mcp
pnpm dev:live     # the same, with the live board experiment (BOARD_MODE=live)
```

- SQLite file at `apps/server/data/chess.db` (created on first run; override with `DATABASE_PATH`).
- Connect from Claude Code with `claude mcp add --transport http chess http://localhost:3000/mcp`,
  or use the ext-apps `basic-host` example or MCP Inspector to see the board UI.
- No deployment for now. Because it's plain Node and HTTP, deploying later means a container plus a
  volume for the SQLite file.

## Request flow

```
MCP client ──POST /mcp──► Hono ──► createMcpHandler(() => buildMcpServer(deps)).fetch
                                          │   (stateless: fresh McpServer per request)
                                          ▼
                                   tools/make-move.ts
                                     1. store.get(gameId); check `ply` matches
                                     2. chess/game.ts applyMove(...)
                                     3. (M3) if an engine seat is next → opponent.chooseMove → applyMove
                                     4. store.update(game, ply)   ← conditional write, once
                                     5. return text + structuredContent
```

The MCP transport is **stateless**. All continuity lives in the database, keyed by game ID, so the
model and the board UI can each pick up any game with any request.

## Domain model

```ts
type Color = 'w' | 'b';
type Player = 'human' | 'llm' | 'jev'; // who controls a seat; 'jev' arrives in M3

interface Game {
  id: string; // crypto.randomUUID()
  white: Player;
  black: Player;
  startFen: string;
  moves: Move[]; // canonical history
  status: 'active' | 'finished';
  result?: '1-0' | '0-1' | '1/2-1/2';
  termination?:
    | 'checkmate'
    | 'stalemate'
    | 'threefold_repetition'
    | 'fifty_move'
    | 'insufficient_material'
    | 'resignation'
    | 'draw_agreed';
  drawOffer?: Color; // a pending draw offer made by this side
  coachingMode?: string; // M5, e.g. 'socratic@1'
  createdAt: string;
  updatedAt: string;
}

interface Move {
  san: string; // 'Nf3'
  uci: string; // 'g1f3'
  by: Player; // who moved; the tool passes it and it must match the seat to move
  meta?: { probabilities?: Record<string, number>; fallback?: string; latencyMs?: number }; // Jev's moves
  meta?: Record<string, unknown>; // e.g. Jev's move probabilities (M3)
}
```

**The game is defined by `startFen + moves`.** To work with a game, `chess/game.ts` creates a
`Chess` from `startFen` and replays the moves. That is the only way chess.js can detect threefold
repetition, and it's trivially cheap. The current FEN is derived, not stored.

`chess/game.ts` holds a handful of plain functions, with no classes or service layers:

- `createGame({ white, black, startFen? }) → Game`
- `applyMove(game, input, by) → Game`: plays a move for the side to move, which must be controlled by
  `by` (otherwise `not_your_turn`). It accepts SAN (`Nf3`), UCI
  (`g1f3`, `e7e8q`) and loose forms (`nf3`, `0-0`). Promotions must name the piece. It throws a
  `ChessError` with a `code` on anything illegal, and sets status/result/termination when the game
  ends. Threefold repetition and the 50-move rule end the game automatically, as chess.js does.
- `undo(game, plies)`, `resign(game, color)`, `draw(game, action, color)`
- `toView(game) → GameView`

### Draw offers

- `offer`: `color` offers a draw, which sets `drawOffer`. Allowed any time the game is active.
- `accept` / `decline`: only the _other_ side can respond, and only while an offer is pending.
  Accepting ends the game `1/2-1/2` (`draw_agreed`). Declining clears the offer. Offering while the
  opponent's offer is pending counts as accepting it.
- As in over-the-board chess, a move by the side the offer was made to declines it. The usual flow is
  to make your move, then offer.
- The server trusts the caller about who is acting. When the human is offering or accepting, the
  model is expected to have asked them.

### Staleness and concurrency: the `ply` guard

The model and the board UI can both act on a game, and either might be looking at an old position.
One mechanism covers both cases:

- `ply` is the number of half-moves played (`moves.length`, 0 at the start). Every response includes it.
- Every tool that changes a game (`make_move`, `submit_human_move`, `play_against_jev`, `undo_move`,
  `resign_game`, `draw_offer`) **requires**
  the `ply` the caller last saw. If it doesn't match the game, nothing changes and the call returns
  `stale_state` with the current board. The model is never surprised by a move it didn't see.
- The database write is conditional on the game being exactly as it was loaded (`UPDATE … WHERE id = ?
  AND data = ?`, comparing the stored JSON). If two requests race, for example a resignation landing
  while a Jev call is in flight, the second write affects no rows and returns `stale_state`. Checking
  `ply` alone isn't enough here: a resignation, a draw offer or an undo followed by new moves can leave
  the ply unchanged.

"Ply" is the standard chess-programming term for a half-move (engines and the Lichess API use it). We
avoid "move number" because in chess notation "move 1" covers both `e4` and `e5`.

## Storage

```ts
// store/store.ts
interface GameStore {
  get(id: string): Promise<Game | undefined>;
  create(game: Game): Promise<void>;
  update(game: Game, previous: Game): Promise<boolean>; // false = changed since `previous` was loaded
}
```

The interface is async even though `better-sqlite3` is synchronous, so a Redis/Postgres implementation
can drop in later. Puzzles (M4) get their own small store with the same shape.

```sql
CREATE TABLE IF NOT EXISTS games (
  id         TEXT PRIMARY KEY,
  ply        INTEGER NOT NULL,   -- moves.length, used for the conditional write
  data       TEXT NOT NULL,      -- JSON of the full Game
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

There is one table and one JSON column, and no migrations framework. The schema is created on startup.
A game is small and always read and written whole, so normalising moves into rows would only add
code. We'll add columns or tables when a real query needs them.

## MCP surface

### Conventions

- Tool names are `<verb>_<noun>` (`make_move`), with no `chess_` prefix. Clients already namespace
  tools by server. Each name must still make sense on its own (`draw_offer`, not `draw`), and every
  description says it's about chess.
- Every tool has an `inputSchema` and an `outputSchema` (zod, from `packages/shared`).
- Every result returns **both**:
  - `content`: a complete text response with the board, FEN, moves, last move, status and what
    happens next. A text-only client loses nothing.
  - `structuredContent`: a `GameView`, which the board UI renders.
- Rule violations return `isError: true` with a `code`, a message and the current text board, so the
  model can recover in one step.
- Server `instructions` (sent on `initialize`) tell the model to relay the human's move and play its
  reply in the same turn, to stay conversational, and, when the board is shown inline, not to repeat
  the board, FEN, moves or ply. The server is stateless, so it can't tell per call whether the client
  renders apps; the instruction is conditional and the model decides.
- Tool descriptions tell the model: _"Read the position from the latest tool result; a board you track
  yourself drifts."_

### GameView

`GameView` is what the **server returns** in every tool result. The model reads it (as text and as
structured data) and so does the board UI. The model only ever sends tool inputs.

```ts
interface GameView {
  gameId: string;
  fen: string;
  pgn: string;
  moves: string[]; // SAN
  ply: number;
  turn: Color;
  toMove: Player | null; // who should act next (null when finished)
  white: Player;
  black: Player;
  status: 'active' | 'finished';
  result?: string;
  termination?: string;
  inCheck: boolean;
  drawOffer?: Color; // pending draw offer from this side
  lastMove?: {
    san: string;
    from: string;
    to: string;
    by: Player;
    jev?: { topMoves: Record<string, number>; fallback?: string }; // when Jev moved
  };
  orientation: Color; // board orientation for the UI: the human's colour
  coaching?: CoachingBlock; // M5
}
```

### Text response

```
Game 3f2c… · White: human · Black: assistant

8 │ r n b q k b n r
7 │ p p p p . p p p
6 │ . . . . . . . .
5 │ . . . . p . . .
4 │ . . . . P . . .
3 │ . . . . . N . .
2 │ P P P P . P P P
1 │ R N B Q K B . R
  └────────────────
    a b c d e f g h

FEN: rnbqkb1r/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2
Moves: 1. e4 e5 2. Nf3
Last move: Nf3 (human)
Ply: 3
Status: Black to move. It's your turn (you play Black): call make_move with ply 3.
```

ASCII letters (more reliable for models than Unicode glyphs), flipped when the human plays Black. A
`Draw offer:` line appears only while an offer is pending, and Jev's moves add its top choices
("Last move: Bc5 (Jev; its top choices were Bc5 27%, Nxe4 21%…)").

### Tools

| Tool                | Input                                                              | Shows the board | Notes                                                                        |
| ------------------- | ------------------------------------------------------------------ | --------------- | ---------------------------------------------------------------------------- |
| `new_game`          | `{ white: Player, black: Player, startFen? }`                      | ✅              | Returns a new UUID.                                                          |
| `get_game`          | `{ gameId }`                                                       | ✅              | Also how the model shows the board after a human move when needed.           |
| `make_move`         | `{ gameId, ply, move }`                                            | ✅              | The **assistant's** move. Rejected (`not_your_turn`) if a human is to move.  |
| `submit_human_move` | `{ gameId, ply, move }`                                            | –               | Relays a move the **human** made, in games not against Jev.                  |
| `play_against_jev`  | `{ gameId, ply, move }`                                            | ✅              | The human's move against Jev; Jev replies in the same call. Only with a key. |
| `legal_moves`       | `{ gameId, square? }`                                              | –               | SAN list, optionally for one piece.                                          |
| `undo_move`         | `{ gameId, ply, plies?: number }`                                  | ✅              | Default 2 (back to the human's turn).                                        |
| `resign_game`       | `{ gameId, ply, color }`                                           | –               | `color` = the side resigning.                                                |
| `draw_offer`        | `{ gameId, ply, action: 'offer' \| 'accept' \| 'decline', color }` | –               | `color` = the side acting. See [Draw offers](#draw-offers).                  |

`ply` is the guard described in [Staleness and concurrency](#staleness-and-concurrency-the-ply-guard).
"Shows the board" means the tool is linked to the board UI (`_meta.ui.resourceUri`). See
[When the board is shown](#when-the-board-is-shown).

### When the board is shown

The host draws a new board for **every** call to a board-linked tool, and whether a tool is linked
is fixed in the tool list, not chosen per call. So the rule is set per tool:

> **Show the board only when a human needs to look at a new position.**

- The human already knows the move they just made, so `submit_human_move` is text-only. The board
  appears with the assistant's reply (`make_move`), showing both moves: one board per round.
- Resigning and draw offers don't change the position, so they don't redraw it.
- Against Jev, the human's move always comes back with a new position (Jev's reply), so those games
  use a separate tool, `play_against_jev`, that does draw the board. We know the players when the game
  starts, but board-drawing is fixed per tool in the host's tool list, so the choice has to be a
  different tool rather than a per-game setting. Relying on the model to call `get_game` afterwards
  was tried first and failed in practice.
- When a human move still leaves a position a human hasn't seen (the game ended on their move, or the
  next side is also human), the `submit_human_move` result tells the model to call `get_game`.
- The server enforces which move tool applies (`not_your_turn` for the wrong side, `wrong_tool` for
  the wrong kind of game), and the error names the right tool, so the model corrects itself.

How this holds up for later modes, compared with the [live board](#mcp-app-board-ui) stretch goal:

| Scenario                             | Per-round board (now)                                          | Live board (stretch)                                    |
| ------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------- |
| Human vs assistant                   | One board per round                                            | One board per game                                      |
| Human delivers mate / human vs human | Model calls `get_game` when prompted                           | Board updates in place                                  |
| Human vs Jev (M3)                    | `play_against_jev` shows the board with Jev's reply            | Drag, Jev replies in the same call, no model round trip |
| Coaching: question before your move  | Board and question arrive together                             | Works; the board may have scrolled out of view          |
| Coaching: hints with arrows          | Needs a "show board with arrows" tool (fresh board)            | Arrows stored on the game; the live board picks them up |
| Coaching: post-game review           | Needs a "show board at ply N" tool                             | Same need; the board steps through in place             |
| Puzzles (M4)                         | `submit_puzzle_move` text-only; `get_puzzle` on a new position | Wrong drag snaps back instantly; model coaches in chat  |
| Text-only clients                    | Unaffected: every result has the full text board               | Unaffected                                              |

### Error codes

`game_not_found`, `game_over`, `illegal_move` (includes the legal moves), `not_your_turn` (wrong
move tool for the side to move), `wrong_tool` (e.g. `submit_human_move` in a game against Jev),
`stale_state` (includes the current view), `invalid_fen`, `invalid_players` (Jev on both sides),
`invalid_undo` (nothing to take back), `invalid_draw_action` (e.g. accepting when no offer is pending).

### Later tools (sketch)

| Milestone | Tool                 | Purpose                                                                                                                                                                                                                                                     |
| --------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M3        | `engine_opinion`     | `{ gameId }`: Jev's move probabilities for the current position, without playing. Useful for coaching.                                                                                                                                                      |
| M4        | `build_position`     | `{ pieces: { square, piece, color }[], sideToMove }` or `{ fen }` returns a valid FEN or a list of problems (missing king, pawn on the back rank, side not to move in check…). LLMs are unreliable at writing FENs, so this is how they "describe a board". |
| M4        | `create_puzzle`      | `{ fen, prompt, solution?: string[], hints?: string[] }`. Validates that the solution is legal. Shows the board.                                                                                                                                            |
| M4        | `submit_puzzle_move` | `{ puzzleId, move }` returns `{ legal, verdict: 'correct' \| 'incorrect' \| 'open' }` plus coaching. `open` = no fixed solution, so the LLM judges.                                                                                                         |
| M5        | `set_coaching_mode`  | `{ gameId, mode }`                                                                                                                                                                                                                                          |

## MCP App (board UI)

### Server side

```ts
const BOARD_URI = 'ui://chess/board.html';

registerAppResource(server, BOARD_URI, BOARD_URI, { mimeType: RESOURCE_MIME_TYPE }, async () => ({
  contents: [{ uri: BOARD_URI, mimeType: RESOURCE_MIME_TYPE, text: boardHtml }],
}));

registerAppTool(
  server,
  'make_move',
  {
    description,
    inputSchema,
    outputSchema,
    _meta: { ui: { resourceUri: BOARD_URI } },
  },
  handler,
);
```

`packages/board-app` builds to a single self-contained `dist/index.html` (Vite with
`vite-plugin-singlefile`), and the server reads it at startup. One bundle serves every game tool.
`react-chessboard` ships its pieces as inline SVG, so the iframe needs no network access and no CSP
config.

### UI side

```
App connects → ontoolresult(result) → render(result.structuredContent as GameView)
```

- **M2 (display):** a board from `fen` in `orientation`, highlights for the last move and check, and a
  result line once the game is over. No move list or turn text: the chat already says those. It follows the host light/dark theme.
- **Moving on the board (built):**
  1. Only the human's pieces can be dragged, and only on their turn. A dropped piece shows on its new
     square straight away while the server checks it.
  2. A pawn dropped on the last rank opens a promotion picker (queen, rook, bishop, knight).
  3. The app calls `submit_human_move` (or `play_against_jev` in a Jev game) itself and re-renders from the returned view. If the move is
     illegal or stale, the board goes back to the server's position and says why.
  4. The model didn't see that call, so the app tells it: `updateModelContext` with the full result
     text, then, if the assistant is next, `sendMessage("I played e4.")` so it replies with
     `make_move`. If the host refuses the message, the board asks the human to tell the assistant.
  5. Server instructions tell the model a board move is already submitted, so it replies rather than
     submitting it again.
- **Board modes** (`BOARD_MODE`, default `per-round`; `pnpm dev:live` runs `live`):

  |                          | `per-round` (default)                         | `live` (experiment)                               |
  | ------------------------ | --------------------------------------------- | ------------------------------------------------- |
  | Boards in the chat       | One per round (drawn by the assistant's move) | One per game (drawn by `new_game` / `get_game`)   |
  | `make_move`, `undo_move` | Draw a board                                  | Text only                                         |
  | Assistant's reply        | Arrives on a new board                        | The existing board polls `board_state` every 1.5s |
  | Moves typed in chat      | Next board shows them                         | Picked up by polling                              |
  - `board_state` is an app-only tool (`visibility: ['app']`), so the model never sees it.
  - The server tells the board its mode with a `<meta name="chess-board-mode">` tag added when it
    serves the HTML. The board only polls in live mode, and only while the game is active.
  - Why polling: MCP Apps only sends a board the results of tool calls that board caused, and the
    server is stateless, so an existing board can't be told about the assistant's move. If live mode
    wins, switch to long-polling (`board_state` waits for the ply to change) before hosting.
  - Not built yet: `pip` display mode, so a live board floats while the chat scrolls.

- **Host differences:** hosts vary in whether they forward a board's tool calls and whether they send
  or only draft its chat messages. The board tries each path and falls back. See
  [Moving pieces on the board](./mcp-apps-hosts.md) for what Claude and ChatGPT do and why.
- **Text-only clients** never see the board, so none of this changes anything for them: every tool
  still returns the full text board and next step.

## Opponents (M3)

```ts
// opponents/opponent.ts
interface Opponent {
  chooseMove(position: { fen: string; history: string[]; legalMoves: string[] }): Promise<{
    move: string;
    meta?: Record<string, unknown>;
  }>;
}
```

- **When it plays:** any call that hands the turn to a Jev seat plays Jev's reply in the same call
  (`playJevReply` in `opponents/reply.ts`): `play_against_jev`, `make_move` (LLM vs Jev), `undo_move`,
  and `new_game` when Jev plays White. The human's move and Jev's reply are saved in one conditional write.
- **chess.js decides, Jev only chooses.** chess.js produces the legal moves Jev chooses from, checks
  Jev's answer against them, and plays it through the same `applyMove` as every other move.
- **Timeouts and failure:** each Jev call has a 2.5s timeout and no SDK retries. If Jev errors, times
  out or returns something illegal, the server retries once, then plays a random legal move and records
  why in the move's `meta`, so the game never gets stuck. The result text says when this happened.
- **Draws and resigning:** nobody can resign or answer a draw offer for Jev's side (`invalid_players`),
  and offering Jev a draw is declined ("Jev doesn't accept draws: play on or resign").
- **Known gaps:** if the server restarts without a key, existing Jev games wait for a Jev that isn't
  there (the status says so). Undo landing on Jev's turn makes Jev move again, often the same move.
- **One Jev seat per game.** Jev only replies to someone else's move, so Jev vs Jev would never progress
  (`invalid_players`). Watching Jev play itself needs a stepping tool, which is a later addition.

### Jev

Jev is TypeSafe AI's _System One_ model, not an LLM. It takes a `state` plus typed questions and
returns calibrated probabilities in one pass. We call it through the **AI SDK**
(`experimental_decide` from `ai`) with the official **`@ai-sdk/typesafe-ai`** provider, which talks to
TypeSafe's System One API directly. Using the AI SDK keeps the door open to other decision models
(for example Cloudflare's Clef) as providers add them: swapping is a different `decisionModel`.

- **Enabled only with a key.** `TYPESAFE_AI_API_KEY` in `apps/server/.env` (see `.env.example`).
  Without it, `new_game` doesn't offer `jev` and the server instructions don't mention it.
  `JEV_MODEL` picks the version (default `jev-latest`; also `jev-preview`, `jev-1.14.0`, `jev-1.13.0`).
- **How a move is chosen** (`opponents/jev.ts`): the state is the FEN, side to move, moves so far and
  an ASCII board. There is one `choice` question, "Pick the strongest move for White", whose options are
  **every legal move**, keyed by SAN and described ("Knight g1→f3, captures pawn, check"). Chess never
  has more than 218 legal moves, inside Jev's 255-option limit, and Jev can only answer with one of them.
  We take the highest-probability legal move ourselves rather than trusting `choice` alone, in case
  rounded probabilities tie.
- **What we keep:** Jev's top five moves with probabilities, stored on the move and returned as
  `GameView.lastMove.jev.topMoves` ("its top choices were Bc5 27%, Nxe4 21%…"). That's the raw material
  for coaching.
- **Live results (2026-10-25):** 135–300ms per move. It plays human-like openings (1.e4 at 81% from the
  start), takes a hanging queen (63%) and finds a mate in one (69%). Third-party benchmarks still show
  it losing to Stockfish's weakest level, so expect a beginner-to-club sparring partner.
- **Not built yet:** strength control by sampling from the distribution with a temperature.
- **Tests** use the AI SDK's `Experimental_DecisionMockModelV4` (`opponents/mock-jev.ts`), so they make no
  network calls.

## Coaching modes (M5)

The server decides _when_ to coach and _which facts_ are relevant. The LLM writes the words.

```ts
// coaching/mode.ts
interface CoachingMode {
  id: string; // 'socratic'
  version: number; // recorded on the game as 'socratic@1'
  description: string;
  allowsUndo: boolean;
  /** Returns guidance for the LLM at this point in the game, or nothing. */
  coach(
    event: 'game_started' | 'human_to_move' | 'move_played' | 'game_over',
    game: GameView,
    facts: PositionFacts,
  ): CoachingBlock | undefined;
}

interface CoachingBlock {
  mode: string; // 'socratic@1'
  guidance: string; // instructions for the LLM, not shown in the UI
  facts?: Record<string, unknown>;
}
```

- One file per mode in `coaching/modes/`, plus a plain object map as the registry.
- The block is appended to the text response under `Coach notes (for the assistant):` and included in
  `GameView.coaching`.
- `PositionFacts` start with what chess.js provides cheaply (material, checks, captures, attacked
  pieces). An engine can add evaluation later without changing the modes.

## Testing

- `chess/game.ts`: move parsing, every way a game can end, special moves (castling, en passant,
  promotion) and undo.
- `store`: one small test file run against both `memory` and `sqlite`.
- Server: an in-process test that drives `app.request('/mcp', …)` through a full scripted game.
- Jev (M3): the AI SDK's mock decision model (`opponents/mock-jev.ts`) and small stub opponents for
  failures, illegal answers and a slow reply racing a resignation. No network in tests.

## Tooling

- Root scripts: `pnpm dev | dev:live | build | typecheck | test | lint | format | inspect`.
- Each package has its own `tsconfig.json` (`strict`, `verbatimModuleSyntax`, `erasableSyntaxOnly`,
  `allowImportingTsExtensions`, `noEmit`). Source imports use `.ts` and run directly in Node; `tsc` only
  typechecks.
- Env (`PORT`, `DATABASE_PATH`, `BOARD_MODE`, `TYPESAFE_AI_API_KEY`, `JEV_MODEL`) is read once in
  `index.ts`, loaded from `apps/server/.env` by Node's `--env-file-if-exists`.

## Decisions

| #   | Decision                                                                                  | Why                                                                                                     |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | Hono plus the official `@modelcontextprotocol/hono`                                       | First-party SDK support, small, web-standard.                                                           |
| 2   | Stateless MCP transport, games in a DB keyed by UUID                                      | The model and UI share state through the server. Simple.                                                |
| 3   | Game = `startFen + moves`. FEN is derived.                                                | Needed for repetition detection, and it's a single source of truth.                                     |
| 4   | `better-sqlite3`, one table, JSON column, no ORM or migrations framework                  | Least code that works. The `GameStore` interface allows swapping later.                                 |
| 5   | Three packages: `server`, `board-app`, `shared`                                           | UI is separate, as required. Everything else stays in the server until it needs to move.                |
| 6   | Every tool returns full text **and** `structuredContent`                                  | Text-only clients are first-class.                                                                      |
| 7   | Mutating tools require the `ply` the caller saw; saves are conditional on the loaded game | `ply` catches stale views; comparing the stored game catches racing writes, including same-ply changes. |
| 8   | React with `react-chessboard`                                                             | MIT, inline SVG pieces, drag/drop for the stretch goal.                                                 |
| 9   | Engine replies are played inside the move call that hands them the turn                   | One call per human move. Simpler for the model and the UI.                                              |
| 10  | No auth. Game UUIDs are the only identifier.                                              | Out of scope for v1.                                                                                    |
| 11  | Local only, no deploy                                                                     | Focus on the product first.                                                                             |
| 12  | Separate `make_move` (assistant) and `submit_human_move` (human) tools                    | Board-linking is per tool; the human's own move shouldn't redraw the board.                             |
| 13  | Separate `play_against_jev` tool for the human's moves against Jev                        | Jev's reply arrives in the same call, so the board must show; per-tool linking forces a separate tool.  |

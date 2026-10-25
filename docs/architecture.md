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
  by: Player; // derived from the seat that moved; callers don't pass it
  meta?: Record<string, unknown>; // e.g. Jev's move probabilities (M3)
}
```

**The game is defined by `startFen + moves`.** To work with a game, `chess/game.ts` creates a
`Chess` from `startFen` and replays the moves. That is the only way chess.js can detect threefold
repetition, and it's trivially cheap. The current FEN is derived, not stored.

`chess/game.ts` holds a handful of plain functions, with no classes or service layers:

- `createGame({ white, black, startFen? }) → Game`
- `applyMove(game, input) → Game`: plays a move for the side to move. It accepts SAN (`Nf3`), UCI
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
- Every tool that changes a game (`make_move`, `submit_human_move`, `undo_move`, `resign_game`, `draw_offer`) **requires**
  the `ply` the caller last saw. If it doesn't match the game, nothing changes and the call returns
  `stale_state` with the current board. The model is never surprised by a move it didn't see.
- The database write is conditional on the same number (`UPDATE … WHERE id = ? AND ply = ?`). If two
  requests race, for example while a Jev call is in flight, the second write affects no rows and also
  returns `stale_state`.

"Ply" is the standard chess-programming term for a half-move (engines and the Lichess API use it). We
avoid "move number" because in chess notation "move 1" covers both `e4` and `e5`.

## Storage

```ts
// store/store.ts
interface GameStore {
  get(id: string): Promise<Game | undefined>;
  create(game: Game): Promise<void>;
  update(game: Game, expectedPly: number): Promise<boolean>; // false = someone else changed it first
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
  lastMove?: { san: string; from: string; to: string; by: Player };
  orientation: Color; // board orientation for the UI: the human's colour
  coaching?: CoachingBlock; // M5
}
```

### Text response

```
Game 3f2c…  ·  You (White) vs Claude (Black)

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
Draw offer: none (this line only appears when an offer is pending)
Status: Black to move. It's your (Claude's) turn: call make_move.
```

ASCII letters (more reliable for models than Unicode glyphs), flipped when the human plays Black.

### M1 tools

| Tool                | Input                                                              | Shows the board | Notes                                                                       |
| ------------------- | ------------------------------------------------------------------ | --------------- | --------------------------------------------------------------------------- |
| `new_game`          | `{ white: Player, black: Player, startFen? }`                      | ✅              | Returns a new UUID.                                                         |
| `get_game`          | `{ gameId }`                                                       | ✅              | Also how the model shows the board after a human move when needed.          |
| `make_move`         | `{ gameId, ply, move }`                                            | ✅              | The **assistant's** move. Rejected (`not_your_turn`) if a human is to move. |
| `submit_human_move` | `{ gameId, ply, move }`                                            | –               | Relays a move the **human** made. Rejected if the assistant is to move.     |
| `legal_moves`       | `{ gameId, square? }`                                              | –               | SAN list, optionally for one piece.                                         |
| `undo_move`         | `{ gameId, ply, plies?: number }`                                  | ✅              | Default 2 (back to the human's turn).                                       |
| `resign_game`       | `{ gameId, ply, color }`                                           | –               | `color` = the side resigning.                                               |
| `draw_offer`        | `{ gameId, ply, action: 'offer' \| 'accept' \| 'decline', color }` | –               | `color` = the side acting. See [Draw offers](#draw-offers).                 |

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
- When a human move leaves a position a human hasn't seen (the game ended on their move, the next
  side is also human, or later an engine replied inside the call), the `submit_human_move` result tells
  the model to call `get_game`. That rule covers human-vs-human, human-vs-Jev and puzzles too.
- The server enforces which move tool applies (`not_your_turn`), and the error names the right tool,
  so the model corrects itself.

How this holds up for later modes, compared with the [live board](#mcp-app-board-ui) stretch goal:

| Scenario                             | Per-round board (now)                                          | Live board (stretch)                                    |
| ------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------- |
| Human vs assistant                   | One board per round                                            | One board per game                                      |
| Human delivers mate / human vs human | Model calls `get_game` when prompted                           | Board updates in place                                  |
| Human vs Jev (M3)                    | Jev replies inside `submit_human_move`; model calls `get_game` | Drag, Jev replies in the same call, no model round trip |
| Coaching: question before your move  | Board and question arrive together                             | Works; the board may have scrolled out of view          |
| Coaching: hints with arrows          | Needs a "show board with arrows" tool (fresh board)            | Arrows stored on the game; the live board picks them up |
| Coaching: post-game review           | Needs a "show board at ply N" tool                             | Same need; the board steps through in place             |
| Puzzles (M4)                         | `submit_puzzle_move` text-only; `get_puzzle` on a new position | Wrong drag snaps back instantly; model coaches in chat  |
| Text-only clients                    | Unaffected: every result has the full text board               | Unaffected                                              |

### Error codes

`game_not_found`, `game_over`, `illegal_move`, `not_your_turn` (wrong move tool for the side to move) (includes the legal moves), `stale_state` (includes
the current view), `invalid_fen`, `invalid_undo` (nothing to take back), `invalid_draw_action` (e.g.
accepting when no offer is pending).

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
- **Stretch (human moves on the board):**
  1. Drop a piece → `app.callServerTool({ name: 'submit_human_move', arguments: { gameId, ply, move } })`.
  2. Re-render from the returned view. If Jev replied, that move is already in it.
  3. Tell the model:
     - If the LLM is next to move → `app.sendMessage("I played Nf3")`. The model then calls
       `make_move` for its reply, and the host renders that result.
     - Otherwise (Jev replied, or there's no LLM seat) → `app.updateModelContext(...)` with the new
       position, so the model stays informed without being forced to reply.
  4. On `stale_state`, re-render from the view returned with the error.
- A promotion picker is needed for the stretch goal (`react-chessboard` handles the drag, we pick the
  piece).
- **Stretch experiment: one live board per game.** Instead of a board per round, the board drawn by
  `new_game` (or `get_game`) stays live for the whole game:
  - Neither move tool is board-linked. The human moves by dragging; the app submits the move itself,
    then `sendMessage`s the model when it's the assistant's turn.
  - The board learns about the assistant's reply by polling an app-only `get_game` (tool
    `visibility: ['app']`, hidden from the model).
  - Optionally it asks the host for `pip` display mode so it floats while the chat scrolls.
  - Board-linking is fixed per tool, so both modes can't run at once. Put it behind a server setting
    (`BOARD_MODE=per-round|live`) and compare how each feels before choosing.
  - Risks: host support for `sendMessage` and `pip` varies, and an inline board scrolls out of view.

## Opponents (M3)

```ts
// opponents/opponent.ts
interface Opponent {
  chooseMove(input: {
    fen: string;
    history: string[];
    legalMoves: string[];
  }): Promise<{ move: string; meta?: Record<string, unknown> }>;
}
```

- The server validates every returned move. On failure or timeout it retries once, then falls back to
  a random legal move (recorded in `meta`).
- When a move (usually `submit_human_move`) leaves the turn with an engine seat, the server plays the engine's reply in
  the same call and returns both moves.

### Jev

Jev is TypeSafe AI's _System One_ model, not an LLM. You send it `state` plus typed questions, and it
answers with calibrated probabilities in one pass.

```http
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer $JEV_API_KEY

{
  "model": "jev-latest",
  "state": { "fen": "…", "sideToMove": "white", "moves": "1. e4 e5 2. Nf3", "board": "<ascii>" },
  "questions": {
    "move": {
      "type": "choice",
      "instructions": "Pick the strongest move for White in this chess position.",
      "criteria": { "Nc3": "Knight b1->c3", "Nxe5": "Knight f3->e5, captures pawn", "…": "…" }
    }
  }
}
→ { "answers": { "move": { "choice": "Nc3", "probabilities": { "Nc3": 0.41, … }, "confidence": 0.41 } } }
```

- The options are the **legal moves**, so Jev can't pick an illegal one.
- Take the highest-probability legal move ourselves instead of trusting `choice`, because ties happen
  with 30+ options.
- **Strength:** sample from the probabilities with a temperature instead of always taking the top move.
- Keep the probabilities in `Move.meta`. They feed coaching ("Jev rated your move at 3%").
- Env: `JEV_API_KEY`, `JEV_BASE_URL` (gateways like Vercel AI Gateway or OpenRouter use different URLs
  and model IDs), `JEV_MODEL` (default `jev-latest`).
- Third-party benchmarks show it plays weakly (it loses to Stockfish at its lowest level). That's fine
  for beginner practice.

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
- Jev (M3): a mocked `fetch`. A live test runs only when `JEV_API_KEY` is set.

## Tooling

- Root scripts: `pnpm dev | build | typecheck | test | lint | format`.
- `tsconfig.base.json`: `strict`, `module: nodenext`, `verbatimModuleSyntax`, `erasableSyntaxOnly`,
  `rewriteRelativeImportExtensions` (source imports use `.ts` and run directly in Node).
- Env (`PORT`, `DATABASE_PATH`, `JEV_*`) is read once in `index.ts`.

## Decisions

| #   | Decision                                                                    | Why                                                                                      |
| --- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | Hono plus the official `@modelcontextprotocol/hono`                         | First-party SDK support, small, web-standard.                                            |
| 2   | Stateless MCP transport, games in a DB keyed by UUID                        | The model and UI share state through the server. Simple.                                 |
| 3   | Game = `startFen + moves`. FEN is derived.                                  | Needed for repetition detection, and it's a single source of truth.                      |
| 4   | `better-sqlite3`, one table, JSON column, no ORM or migrations framework    | Least code that works. The `GameStore` interface allows swapping later.                  |
| 5   | Three packages: `server`, `board-app`, `shared`                             | UI is separate, as required. Everything else stays in the server until it needs to move. |
| 6   | Every tool returns full text **and** `structuredContent`                    | Text-only clients are first-class.                                                       |
| 7   | Mutating tools require the `ply` the caller saw; DB write conditional on it | One mechanism stops stale views and racing writes. No separate version field.            |
| 8   | React with `react-chessboard`                                               | MIT, inline SVG pieces, drag/drop for the stretch goal.                                  |
| 9   | Engine replies are played inside the move call that hands them the turn     | One call per human move. Simpler for the model and the UI.                               |
| 10  | No auth. Game UUIDs are the only identifier.                                | Out of scope for v1.                                                                     |
| 11  | Local only, no deploy                                                       | Focus on the product first.                                                              |
| 12  | Separate `make_move` (assistant) and `submit_human_move` (human) tools      | Board-linking is per tool; the human's own move shouldn't redraw the board.              |

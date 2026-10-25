# chess-mcp

An MCP server that lets AI assistants play, teach and improve your chess. The server keeps the real
board: every move is checked with chess.js and every game is saved, so the assistant can't lose track
of the position or play an illegal move. Clients that support [MCP Apps](https://modelcontextprotocol.io)
show an inline board you can drag pieces on; every other client gets the full game as text.

**It's live at `https://chess.jameswoods.co.uk/mcp`.** No sign-up and no API key: add it to your MCP
client and ask to play.

## What you can do

- **Play the assistant**, at a strength you pick: beginner (about 400), casual, club or full strength.
- **Play Jev while the assistant coaches.** Jev is a fast chess model the server runs (TypeSafe AI's
  System One), not an LLM. It replies to your move in the same call.
- **Choose how you're coached:** just play, hints, or a blunder check after each move. The coach's
  claims about the position come from facts the server has checked, not from reading the board by eye.
- **Take moves back, offer a draw, resign,** analyse a position, or come back to a game later by its ID.

## Use the hosted server

**Claude Code:**

```bash
claude mcp add --transport http chess https://chess.jameswoods.co.uk/mcp
```

Then start a new session and ask "let's play chess", or run the `/mcp__chess__play_chess` prompt.

**claude.ai and Claude Desktop:** add a custom connector with the URL
`https://chess.jameswoods.co.uk/mcp`.

**Any other MCP client:** it's a Streamable HTTP server at the same URL, with no auth.

There are no accounts: a game is found only by its server-generated ID. The server allows 60 requests
a minute from each IP address, which is plenty for play.

## Run it locally

You need Node.js 24 or later and pnpm (the repo pins pnpm 12.15.0 in `package.json`, which pnpm
downloads for you).

```bash
git clone https://github.com/jwoods02/chess-mcp.git
cd chess-mcp
pnpm install
cp apps/server/.env.example apps/server/.env
pnpm dev
```

`pnpm dev` builds the board UI in watch mode and runs the server at `http://localhost:3000/mcp`.
Games are saved in `apps/server/data/chess.db`, created on first run.

**Jev is optional.** To play against it, put a TypeSafe AI API key in `apps/server/.env` as
`TYPESAFE_AI_API_KEY`. Without one, the server works the same and just doesn't offer Jev.

Connect a client to your local server:

```bash
claude mcp add --transport http chess-local http://localhost:3000/mcp
```

Or open MCP Inspector, already pointed at the local server, to try the tools and see the board UI:

```bash
pnpm inspect
```

### Commands

| Command              | What it does                                                         |
| -------------------- | -------------------------------------------------------------------- |
| `pnpm dev`           | Board UI in watch mode + the server on http://localhost:3000/mcp     |
| `pnpm inspect`       | MCP Inspector pointed at the local server                            |
| `pnpm test`          | Vitest, all packages                                                 |
| `pnpm typecheck`     | `tsc` in every package                                               |
| `pnpm lint`          | Oxlint (type-aware)                                                  |
| `pnpm format`        | Oxfmt (`pnpm format:check` in CI)                                    |
| `pnpm build`         | Builds the board UI                                                  |
| `pnpm worker:dev`    | The Cloudflare Worker locally on http://localhost:8787/mcp, local D1 |
| `pnpm worker:deploy` | Builds and deploys the Worker (needs Cloudflare access)              |

Before sending a change, run `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`.

## How it's built

```
apps/server/        Hono + MCP server: tools, chess logic, storage. Node locally, a Worker when hosted
packages/board-app/ The MCP App board (React + react-chessboard), built to one HTML file
packages/shared/    zod schemas and types shared by the server and the board
docs/               product and architecture docs
```

Locally the server runs on Node with SQLite. The hosted one is a Cloudflare Worker with D1 and the
same SQL ([Hosting](docs/architecture.md#hosting)). Start with [docs/](docs/README.md) for the
product vision, coaching modes and architecture, and [AGENTS.md](AGENTS.md) for the conventions
(it's written for coding agents, and works for humans too).

# AGENTS.md

Guidance for AI coding agents (and humans) working in this repo.

## What this is

A hosted MCP server that lets AI agents play, teach and improve a human's chess. It shows an inline
board (MCP Apps) and keeps a full text fallback. Read these before making non-trivial changes:

- [docs/product/](docs/product/vision.md): vision, features and roadmap, coaching modes
- [docs/architecture.md](docs/architecture.md): stack, layout, domain model, storage, MCP tools, decisions

If a change contradicts the docs, update the docs in the same change (or ask first).

## Principles

- **KISS.** Write minimal, readable code that a human can follow top to bottom. Prefer plain functions
  and plain SQL. Add no abstraction until a second implementation needs it. The only planned interfaces
  are `GameStore` (storage) and `Opponent` (Jev and others).
- **The server is the source of truth for the board.** Every move is validated with chess.js. Never
  trust a move, FEN or game state that comes from the model or the UI without checking it.
- **Text first.** Every tool returns a complete text response **and** `structuredContent`. The board
  UI is an enhancement and never a requirement.
- **Mutating tools require `ply`**, the caller's last-seen half-move count. If it doesn't match, return
  `stale_state`. Never apply a move against a stale view.
- **No auth and no deploy** for now. Games are identified only by server-generated UUIDs.

## Layout

```
apps/server/        Hono + MCP server (tools, chess logic, storage); runs .ts directly in Node
packages/board-app/ MCP App UI (React + react-chessboard) → dist/index.html (single file)
packages/shared/    zod schemas and types shared by server and UI
docs/               product and architecture docs
```

## Commands

```bash
pnpm install
pnpm dev            # board UI in watch mode + server on http://localhost:3000/mcp
pnpm dev:live       # same, with the live board experiment (BOARD_MODE=live)
pnpm inspect        # MCP Inspector pointed at the local server
pnpm test           # vitest (all packages)
pnpm typecheck      # tsc (TypeScript 7) in every package
pnpm lint           # oxlint (type-aware)
pnpm format         # oxfmt (format:check in CI)
pnpm build          # builds the board UI
```

Config lives in `apps/server/.env` (copy `.env.example`). Setting `TYPESAFE_AI_API_KEY` enables Jev as an
opponent; without it the server runs fine and simply doesn't offer Jev.

Before finishing a change, run `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`.

## Conventions

- TypeScript 7, ESM, `strict`, `erasableSyntaxOnly`. Use no enums, namespaces or parameter
  properties, so Node can strip the types. Relative imports use the `.ts` extension.
- Use `pnpm` only. Add dependency versions to the `catalog:` in `pnpm-workspace.yaml` and reference
  them as `"catalog:"`.
- Tool names are `<verb>_<noun>` with no `chess_` prefix (clients namespace by server). Names must be
  unambiguous on their own (`draw_offer`, not `draw`). Every tool defines zod `inputSchema` and
  `outputSchema`.
- Tests sit next to the code as `*.test.ts`. Cover chess rules in unit tests and drive tools end to end
  through `app.request('/mcp', …)`.
- Prompt text (server instructions, tool descriptions, result text) is written for current Claude
  models: plain wording with the reason behind a rule, and what to do rather than what not to do. No
  `NEVER`/`CRITICAL`/`MUST` shouting; it makes recent models overreact. See Anthropic's prompting best
  practices.
- Commits: conventional style (`feat:`, `fix:`, `docs:`, `chore:`), small and focused.

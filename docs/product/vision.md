# Vision

## One-liner

A hosted MCP server that lets AI agents **play, teach and improve a human's chess**, with a real
board rendered inline in the chat (MCP Apps) and a full text fallback for clients without UI support.

## Why this isn't just "play chess with an LLM"

LLMs are bad at chess: they lose track of the board, play illegal moves and hallucinate positions.
They are good at _explaining_, _questioning_ and _adapting to a person_. This project splits the work
along those lines:

| Concern                       | Owner                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| Rules, legality, game state   | The server (chess.js). The LLM can never put the board in an illegal state.                      |
| Persistence across turns      | The server (game IDs and a database).                                                            |
| Playing strength / intuition  | Pluggable opponents: the LLM itself, **Jev** (a System One model), and later a classical engine. |
| Teaching, coaching, dialogue  | The LLM, steered by **coaching modes** the server defines.                                       |
| Seeing and touching the board | The MCP App UI (with a text board as the fallback).                                              |

The interesting product space is the combination: an LLM coach watching a human play against a
_different kind_ of AI (Jev), or an LLM building a puzzle and then coaching the human through it.

## Who it's for

- **Improving amateurs (roughly 600–1600):** people who want practice games with commentary rather
  than a silent engine.
- **Beginners:** they need rules enforced, gentle hints and explanations of _why_ a move is bad.
- **Curious AI users:** people who want to watch two different AIs interact (an LLM coaching against Jev).

## Principles

1. **The server is the source of truth.** Every move goes through the server and is validated. Tool
   responses always restate the authoritative position, so the LLM never has to remember the board.
2. **Text-first, UI-enhanced.** Every tool returns a complete text response. The MCP App board is a
   progressive enhancement and is never required to play.
3. **Stateless calls, stateful games.** Each MCP request is independent. Game state lives in storage
   and is keyed by an ID, so any request, from the model or the UI, can pick up any game.
4. **Keep it simple.** Write minimal code that humans can read easily. Storage, opponents and
   coaching modes each get one small interface so they can be swapped. Nothing else gets abstracted
   until it needs to be.
5. **Coaching is a first-class, versioned concept.** Modes are data plus behaviour, not ad-hoc prompts,
   so we can experiment with them and compare them over time.

## Non-goals (for now)

- Competing with Lichess or Chess.com as a platform: no ratings ladder, matchmaking or human-vs-human
  online play.
- Engine-perfect analysis as the headline feature. A classical engine may arrive later as an
  _analysis provider_, but coaching quality matters more than centipawn accuracy.
- User accounts and auth. Games are identified only by server-generated UUIDs.
- Deployment. It runs locally for now.

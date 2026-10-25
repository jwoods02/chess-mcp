# Moving pieces on the board: what MCP Apps hosts actually allow

_Supplementary to [architecture.md](./architecture.md). Written 2026-10-25, after building the
"move on the board" stretch goal and testing it in MCP Inspector and in Claude Code. Host behaviour
changes quickly, so treat the host-specific parts as a snapshot and re-test before relying on them._

## What we set out to build

The goal sounded simple. A human plays the assistant at chess. Instead of typing "e4", they drag the
pawn on the inline board. The board sends the move to our server, the assistant sees it and replies,
and the human never touches the keyboard.

MCP Apps gives a board (the "view") three tools that look made for this. It can call a tool on our
server itself (`tools/call`), so the move can be validated and saved without involving the model. It
can post a message into the chat (`ui/message`), which is the documented way for a view to put the
model back in the loop. And it can quietly add information to the model's context
(`ui/update-model-context`), so the model knows what happened even though it didn't make the call.

So the board does exactly that. When the human drops a piece, it checks the move locally with
chess.js, so an illegal drag snaps back at once. Then it calls `submit_human_move` on our server. If
that works, it adds the result to the model's context and posts "I played e4." so the assistant
replies with `make_move`. Each step falls back gracefully: if the direct call fails, the board posts the
move as a chat message instead, and the assistant submits it like a typed move. If even that fails, the
board asks the human to tell the assistant themselves. Clients without MCP Apps never see a board at
all, and keep getting the full text board from every tool result.

In MCP Inspector all of this worked on the first try. In Claude Code it didn't, and finding out why
taught us most of what is in this document.

## Why the board only appears once per round

One earlier finding shapes everything that follows. A host draws a new board every time the model
calls a tool linked to the board UI. Whether a tool is linked is fixed in the tool list, not chosen
per call. If every move tool drew a board, one round of play would leave two boards in the chat: one
when the assistant passed on the human's move, and one for its reply.

So the rule is to show the board only when a human needs to see a new position. `submit_human_move`
never draws a board, because the human already knows the move they just made. `make_move`, the
assistant's own move, draws the board showing both moves. Resigning and draw offers don't redraw an
unchanged position. When a human move does leave a position nobody has seen (a checkmate on the
human's move, or a human-vs-human game), the tool result tells the model to call `get_game`.

We also tried a live mode, where one board per game stayed up to date. It had to poll for updates. A
board only ever hears about tool calls it made itself, plus the result of the call that drew it. When
the model later calls `make_move`, the existing board is not told, and our stateless server has no way
to push to it. So a live board asked the server every 1.5 seconds through a tool hidden from the model.
It worked, but it doubled the paths through every move tool, so we removed it and kept one board per
round.

## What happened in Claude Code

The first test in Claude Code looked like a success. The board drew, and the pawn moved to c4. But
the assistant never reacted. When the human typed "I moved", it checked the game, found it still at
the starting position, and said so, quite correctly.

The server's database agreed: the game was at ply 0. The board had drawn the move locally, but its call
to the server never arrived. Worse, the board's code didn't catch the failure, so it kept showing the
pawn on c4 as if nothing was wrong. That was our bug, and it's fixed: a failed send now puts the piece
back and says why.

Finding the underlying cause took several rounds, and each one is worth recording.

**The first theory was tool visibility.** We had deliberately left `submit_human_move` without any
`_meta.ui`, so it wouldn't draw a board. The spec says a host "MUST reject `tools/call` requests from
apps for tools that don't include `"app"` in visibility", so perhaps Claude saw no visibility and
refused. We marked the tool `visibility: ["model", "app"]` with no `resourceUri`, which makes it
callable from the board without drawing one. But the spec also says visibility "defaults to
`["model", "app"]` if omitted". A host following the spec should have accepted the original tool, so
this was probably not the cause. We kept the marking anyway, because it states the intent plainly.

**The second theory was the SDK.** Maybe the ext-apps `App` class refuses to send a tool call when the
host doesn't advertise the `serverTools` capability. Reading its source ruled that out: `callServerTool`
always sends `tools/call` to the host. Any refusal happens in the host.

**Along the way we found that hosts under-report what they support.** An earlier version of the board
turned dragging off when the host didn't advertise `serverTools`. In Claude Code that broke dragging
entirely, which showed that Claude doesn't advertise it. In Inspector, the board stopped posting chat
messages when it checked for the `message` capability, even though Inspector had accepted those
messages moments earlier without advertising it. So the board now tries each path regardless, with a
five-second timeout, and only falls back when something actually fails.

**The third theory came from the community.** A research pass turned up a Claude bug report,
[anthropics/claude-ai-mcp#165](https://github.com/anthropics/claude-ai-mcp/issues/165). Its reporters
found that servers must advertise MCP Apps support themselves, in
`capabilities.extensions["io.modelcontextprotocol/ui"]`, and that `registerAppTool` doesn't add it. This
matches the [MCP extensions overview](https://modelcontextprotocol.io/extensions/overview): newer clients
read a server's capabilities from `server/discover`, and our logs showed Claude using exactly that
newer protocol (`server/discover`, `subscriptions/listen`). Our server wasn't advertising the extension
at all. We added it, with a test so it can't regress. The SDK only answers `server/discover` for clients
on the 2026-07-28 protocol revision, which is why a plain test request got "Method not found" while
Claude's requests succeeded.

**The final test settled it.** With the extension advertised and Claude restarted, the human dragged a
piece and sent nothing. The server log showed the two `new_game` calls and no `submit_human_move`. The
board had tried, waited five seconds, and fallen back to posting "I played c4." Claude Code put that text
into the human's input box as a draft, waiting for them to press Enter.

## Whose problem is it?

It's Claude's behaviour, not a bug on our side. Our server advertises the extension, the tool is marked
as callable from the board, and the same board submits moves directly in Inspector.

Both of Claude's choices are also allowed by the spec. Forwarding tool calls from a view is an optional
host capability: `serverTools` is something a host "can" offer, and Claude Code currently doesn't. For a
view's chat message, the spec says the host "SHOULD add the message to the conversation context" and
"MAY request user consent". Placing "I played c4" in the input box as a draft is Claude asking for that
consent. It's likely deliberate: an embedded app shouldn't be able to make the model act without the
user's say-so.

So in Claude Code, playing the assistant by dragging means drag, then press Enter. The assistant then
submits the move and replies. That's one keypress per move, and it's the best this host currently
allows. The board's notice says "Your move is in the chat for the assistant", which is true whether a
host sends the message or only drafts it, because the board can't tell the difference.

For the surfaces around Claude Code, Anthropic's docs say MCP Apps render in claude.ai and Claude
Desktop chat, with a native WebView on iOS and Android
([quickstart](https://claude.com/docs/connectors/building/mcp-apps/quickstart),
[design guidelines](https://claude.com/docs/connectors/building/mcp-apps/design-guidelines)). The
Claude Code CLI doesn't render apps at all: "Claude Code calls the tool as text and doesn't render the
UI" ([quickstart](https://claude.com/docs/connectors/building/mcp-apps/quickstart)). The
[troubleshooting page](https://claude.com/docs/connectors/building/mcp-apps/troubleshooting) recommends
app-initiated tool calls for fetching data on demand and says they are proxied through Claude's backend.
So claude.ai and Desktop chat may well behave differently from what we saw. Anthropic doesn't publish
Claude's host capabilities, and we haven't tested those surfaces yet. The docs describe inline and
fullscreen display modes, but not picture-in-picture.

## What a host like ChatGPT can do

ChatGPT implements the same MCP Apps standard, and OpenAI recommends using the standard bridge first,
with `window.openai` only for ChatGPT-specific features
([Add UI to your MCP server](https://developers.openai.com/plugins/build/chatgpt-ui)).

On calling tools, OpenAI is explicit. The UI can "call data tools directly for local interactions", and
`callTool` (ChatGPT's older name for `tools/call`) is described as "Invoke another MCP tool from the
widget (mirrors model-initiated calls)" ([reference](https://developers.openai.com/plugins/reference)).
Visibility defaults to `["model", "app"]`, and the older `openai/widgetAccessible` flag is a
compatibility field, with OpenAI advising "prefer `_meta.ui.visibility` + `tools/call`". So in ChatGPT a
drag should reach our server directly, without involving the model.

On follow-up messages, the picture is less certain. ChatGPT supports `ui/message`, with
`sendFollowUpMessage` as a compatibility alias that asks ChatGPT "to post a message authored by the
component" ([reference](https://developers.openai.com/plugins/reference)). Third-party guides describe
the result as putting the model back in the loop, where ChatGPT sees the message and decides what to do
next ([Alpic](https://alpic.ai/blog/inside-openai-s-apps-sdk-how-to-build-interactive-chatgpt-apps-with-mcp),
[Agnost](https://agnost.ai/blog/openai-apps-sdk-technical-guide/)). That implies the message is sent and
the model replies without a keypress. OpenAI's own pages don't say whether the user has to confirm it,
so this needs testing. A community report notes a cosmetic console warning for widget-sent `ui/message`
calls but says they work correctly
([OpenAI community](https://community.openai.com/t/unknown-tool-console-warning-spam-for-widget-originated-ui-message-calls/1379944)).
OpenAI also points to `ui/update-model-context` as "the portable MCP Apps mechanism for updating
model-visible context" ([Add UI to your MCP server](https://developers.openai.com/plugins/build/chatgpt-ui)).

The best case in ChatGPT is therefore: the human drags, the move is saved on our server immediately,
the board posts "I played c4.", and the assistant replies with no typing and no keypress.

## Can the assistant reply without any message at all?

Not on any host, by design. In MCP Apps, the only way a view can start a model turn is a chat message,
and that message appears in the conversation. Updating the model's context never starts a turn. The
spec says the host should provide that context "in future turns" and may defer it "until the next user
message (including `ui/message`)". It describes `ui/message` as the method "which also trigger[s]
follow-ups".

So on the friendliest host, a short "I played c4." will still appear in the chat before the assistant's
reply. There is one more route in the spec, sampling (`sampling/createMessage`), which lets a view ask
the host's model for a completion without a chat turn. The ext-apps SDK exposes it, but host support is
rare, and neither Claude's nor OpenAI's docs mention it.

The only way to get a reply with no model turn is to have the opponent run on our server. That's what
Jev (milestone M3) does: its move is computed inside the human's move call (`play_against_jev`), so the board shows
the reply immediately on every host, Claude Code included. An LLM coach watching that game still needs
a turn to comment, so its commentary arrives with the human's next message or a board-posted one.

## Where this leaves the product

| Game                      | Claude Code today                  | ChatGPT (expected)                                     | Text-only clients |
| ------------------------- | ---------------------------------- | ------------------------------------------------------ | ----------------- |
| Human vs assistant, typed | Works; one board per round         | Works                                                  | Works; text board |
| Human vs assistant, drag  | Drag, then press Enter             | Drag submits directly; the reply is probably automatic | No board          |
| Human vs Jev (M3), drag   | Drag; Jev replies in the same call | Same                                                   | No board          |

This makes a strong case for building Jev next: it's the one opponent that feels immediate on every
host. It also makes the per-round board, together with typed moves, the dependable default, with
dragging as an enhancement whose smoothness depends on the host.

## Debugging notes

The server logs one line per MCP request, for example `tools/call submit_human_move → 200`. That's the
quickest way to tell whether a board's call reached us. The board logs its own failures to the browser
console as `Sending the move failed…`. In Claude Desktop, Anthropic's troubleshooting page describes
enabling Developer Mode (Help → Troubleshooting → Enable Developer Mode), then opening the inspector
with Cmd+Option+I to look inside the board's frame
([troubleshooting](https://claude.com/docs/connectors/building/mcp-apps/troubleshooting)). Claude caches
a server's tool list per conversation, so after changing tools, start a new chat or reconnect the
server. The bug report above suggests removing and re-adding the connector on claude.ai. Anthropic takes
MCP Apps feedback through `/feedback` or mcp-apps@anthropic.com
([getting started](https://claude.com/docs/connectors/building/mcp-apps/getting-started)).

## Sources

MCP Apps specification and SDK:

- [MCP Apps specification (SEP-1865, 2026-01-26)](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)
- [ext-apps repository and README](https://github.com/modelcontextprotocol/ext-apps)
- [MCP Apps overview](https://modelcontextprotocol.io/extensions/apps/overview)
- [MCP extensions overview](https://modelcontextprotocol.io/extensions/overview)
- [MCP extensions client matrix](https://modelcontextprotocol.io/extensions/client-matrix)

Claude:

- [MCP Apps quickstart](https://claude.com/docs/connectors/building/mcp-apps/quickstart)
- [Getting started](https://claude.com/docs/connectors/building/mcp-apps/getting-started)
- [Troubleshooting](https://claude.com/docs/connectors/building/mcp-apps/troubleshooting)
- [Design guidelines](https://claude.com/docs/connectors/building/mcp-apps/design-guidelines)
- [Claude Code MCP docs](https://code.claude.com/docs/en/mcp)
- [anthropics/claude-ai-mcp#165](https://github.com/anthropics/claude-ai-mcp/issues/165) (community bug report)

ChatGPT:

- [OpenAI: Add UI to your MCP server](https://developers.openai.com/plugins/build/chatgpt-ui)
- [OpenAI: Apps reference](https://developers.openai.com/plugins/reference)
- [OpenAI community: `ui/message` warning from widgets](https://community.openai.com/t/unknown-tool-console-warning-spam-for-widget-originated-ui-message-calls/1379944)
- [Alpic: Inside OpenAI's Apps SDK](https://alpic.ai/blog/inside-openai-s-apps-sdk-how-to-build-interactive-chatgpt-apps-with-mcp)
- [Agnost: OpenAI Apps SDK technical guide](https://agnost.ai/blog/openai-apps-sdk-technical-guide/)
- [ChatGPT Apps MCP starter](https://glama.ai/mcp/servers/vikiival/ai-sdk-mcp-app-starter)
- [Mofei: Building a ChatGPT app from scratch](https://www.mofei.life/en/blog/article/chatgpt-app)
- [HackerNoon: Build a custom ChatGPT app](https://hackernoon.com/build-a-custom-chatgpt-app-and-tap-into-800-million-users)
- [System Design newsletter: Apps in ChatGPT](https://newsletter.systemdesign.one/p/apps-in-chatgpt)

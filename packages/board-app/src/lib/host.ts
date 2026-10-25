// Talking to the host and the server from the board. Hosts differ in what they allow (see
// docs/mcp-apps-hosts.md), so every call is tried and every failure has a fallback.
import type { GameView } from '@chess-mcp/shared';
import type { App as McpApp } from '@modelcontextprotocol/ext-apps/react';

export type { McpApp };
export type ToolResult = Awaited<ReturnType<McpApp['callServerTool']>>;

// How long to wait for the host to run a tool call before falling back to the chat. Longer than the
// server's worst case against Jev (two 2.5s attempts, then a random move).
const TIMEOUT_MS = 8000;

/**
 * Calls one of our tools from the board. Returns undefined when the host won't run it (Claude Code,
 * for one), so the caller can ask the assistant in the chat instead. Tried even if the host doesn't
 * advertise tool calls, since hosts under-report what they support.
 */
export async function callTool(
  app: McpApp,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult | undefined> {
  return app
    .callServerTool({ name, arguments: args }, { timeout: TIMEOUT_MS })
    .catch((error: unknown) => {
      console.error(`Calling ${name} from the board failed`, error);
      return undefined;
    });
}

/**
 * Posts a message in the chat as the user, which gives the assistant a turn. Some hosts send it,
 * others put it in the input box for the user to send. Returns false if the host refuses.
 */
export async function postMessage(app: McpApp, text: string): Promise<boolean> {
  const sent = await app
    .sendMessage({ role: 'user', content: [{ type: 'text', text }] }, { timeout: TIMEOUT_MS })
    .catch(() => ({ isError: true }));
  return !sent.isError;
}

/** Tells the model what the board did, for its next turn. It doesn't start a turn. */
export async function tellModel(app: McpApp, text: string): Promise<void> {
  await app
    .updateModelContext({ content: [{ type: 'text', text }] }, { timeout: TIMEOUT_MS })
    .catch(() => {});
}

export function resultText(result: ToolResult): string {
  const first = result.content?.[0];
  return first?.type === 'text' ? first.text : '';
}

/**
 * Why the server rejected something, worded for the human. Error messages are written for the model,
 * so drop the list of legal moves.
 */
export function errorNotice(result: ToolResult): string {
  const error = (result.structuredContent as Partial<GameView> | undefined)?.error;
  // Usually an older board further up the chat.
  if (error?.code === 'stale_state') {
    return 'This board was out of date. It now shows the latest position.';
  }
  return error?.message.replace(/ Legal moves: .*$/, '') ?? 'That could not be done.';
}

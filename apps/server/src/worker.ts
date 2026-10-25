import { createTypeSafeAi } from '@ai-sdk/typesafe-ai';
// Wrangler bundles .html imports as text (see html.d.ts). Run `pnpm build` first so it exists.
// A relative path, because Wrangler ignores the package's `exports` for text modules: the package
// specifier bundled board-app's Vite source page instead of the build.
import boardHtml from '../../../packages/board-app/dist/index.html';
import { createApp } from './app.ts';
import { createJev } from './opponents/jev.ts';
import { D1Store, type D1Database } from './store/d1.ts';

/** Cloudflare Worker entry for the hosted server (wrangler.jsonc). index.ts is the Node one. */
interface Env {
  DB: D1Database;
  RATE_LIMIT: { limit(options: { key: string }): Promise<{ success: boolean }> };
  /** The public hostname, from wrangler.jsonc `vars`. */
  HOST: string;
  /** Secret: `wrangler secret put TYPESAFE_AI_API_KEY`. Without it the server runs without Jev. */
  TYPESAFE_AI_API_KEY?: string;
  JEV_MODEL?: string;
}

// The limit itself lives in wrangler.jsonc; this text only has to agree with it.
const RATE_LIMITED = {
  jsonrpc: '2.0',
  id: null,
  error: {
    code: -32000,
    message:
      'Rate limit reached: this server takes 60 requests a minute from each IP address. Wait a minute, then try again.',
  },
};

// Env is fixed for the life of an isolate, so build the app once and reuse it across requests.
let app: ReturnType<typeof createApp> | undefined;

function getApp(env: Env) {
  if (app) return app;
  const apiKey = env.TYPESAFE_AI_API_KEY;
  const jev = apiKey
    ? createJev(createTypeSafeAi({ apiKey }).decisionModel(env.JEV_MODEL ?? 'jev-latest'))
    : undefined;
  app = createApp({
    store: new D1Store(env.DB),
    jev,
    boardHtml: () => boardHtml,
    host: env.HOST,
    logRequests: true,
  });
  return app;
}

export default {
  async fetch(request: Request, env: Env) {
    // No auth, so a per-IP limit is what keeps one client from using up the Jev credit.
    if (request.method === 'POST') {
      const key = request.headers.get('cf-connecting-ip') ?? 'unknown';
      const { success } = await env.RATE_LIMIT.limit({ key });
      if (!success)
        return Response.json(RATE_LIMITED, { status: 429, headers: { 'retry-after': '60' } });
    }
    return getApp(env).fetch(request);
  },
};

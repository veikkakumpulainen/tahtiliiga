// Test harness for the notify-* edge functions. Runs a function's request
// handler against an in-memory fake of the database and Expo's push service,
// with no network or real Supabase project:
//
// - supabase-js talks to PostgREST over fetch, so a fetch stub answers
//   /rest/v1/<table> (eq./in. filters, .single()) and /rest/v1/rpc/<name>
//   from the tables and RPCs a test sets with resetFakes().
// - Calls to Expo's push API are recorded in `pushes` instead of being sent.
// - Deno.serve is stubbed so importing a function hands back its handler.
//
// Run: npm run test:functions (deno test --allow-env --allow-read supabase/tests/functions)

import assert from "node:assert/strict";

export const SECRET = "test-internal-secret";
const SUPABASE_URL = "http://supabase.test";

// The functions read these at import time.
Deno.env.set("SUPABASE_URL", SUPABASE_URL);
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
Deno.env.set("FUNCTION_INTERNAL_SECRET", SECRET);

type Row = Record<string, unknown>;
export type Fakes = {
  tables?: Record<string, Row[]>;
  rpc?: Record<string, (args: Record<string, unknown>) => unknown>;
  // Expo ticket status per token; default "ok".
  ticketStatus?: (token: string) => "ok" | "error";
};
export type PushMessage = { to: string; title: string; body: string; data: Record<string, unknown>; sound: string };

let fakes: Required<Fakes> = { tables: {}, rpc: {}, ticketStatus: () => "ok" };
export const pushes: PushMessage[] = [];
// Requests to Expo, one per chunk of up to 100 messages.
export let pushRequests = 0;

export function resetFakes(next: Fakes = {}) {
  fakes = { tables: next.tables ?? {}, rpc: next.rpc ?? {}, ticketStatus: next.ticketStatus ?? (() => "ok") };
  pushes.length = 0;
  pushRequests = 0;
}

// The value of a PostgREST filter like "eq.abc" or "in.(a,b)".
function matches(row: Row, column: string, filter: string) {
  const value = row[column];
  if (filter.startsWith("eq.")) return String(value) === filter.slice(3);
  if (filter.startsWith("in.(") && filter.endsWith(")")) {
    const options = filter.slice(4, -1).split(",").filter(Boolean).map((item) => item.replace(/^"(.*)"$/, "$1"));
    return options.includes(String(value));
  }
  throw new Error(`Fake PostgREST: unsupported filter ${column}=${filter}`);
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init);
  const url = new URL(request.url);

  if (url.href === "https://exp.host/--/api/v2/push/send") {
    const messages = await request.json() as PushMessage[];
    pushRequests += 1;
    pushes.push(...messages);
    return json({ data: messages.map((message) => ({ status: fakes.ticketStatus(message.to) })) });
  }

  if (url.origin !== SUPABASE_URL) throw new Error(`Unexpected network request: ${url.href}`);

  const rpcMatch = url.pathname.match(/^\/rest\/v1\/rpc\/(.+)$/);
  if (rpcMatch) {
    const handler = fakes.rpc[rpcMatch[1]];
    if (!handler) return json({ message: `Fake: no rpc ${rpcMatch[1]}` }, 404);
    const args = request.method === "GET" ? Object.fromEntries(url.searchParams) : await request.json().catch(() => ({}));
    return json(handler(args));
  }

  const tableMatch = url.pathname.match(/^\/rest\/v1\/(.+)$/);
  if (!tableMatch || request.method !== "GET") throw new Error(`Fake PostgREST: unsupported ${request.method} ${url.pathname}`);
  let rows = fakes.tables[tableMatch[1]] ?? [];
  for (const [column, filter] of url.searchParams) {
    if (["select", "order", "limit", "offset"].includes(column)) continue;
    rows = rows.filter((row) => matches(row, column, filter));
  }

  // .single(): exactly one row as an object, else PostgREST's 406.
  if (request.headers.get("accept")?.includes("application/vnd.pgrst.object+json")) {
    return rows.length === 1 ? json(rows[0]) : json({ code: "PGRST116", message: `${rows.length} rows` }, 406);
  }
  return json(rows);
}

type Handler = (request: Request) => Response | Promise<Response>;
let capturedHandler: Handler | null = null;
const loadedHandlers = new Map<string, Handler>();

const state = globalThis as unknown as { __notifyHarnessInstalled?: boolean };
if (!state.__notifyHarnessInstalled) {
  state.__notifyHarnessInstalled = true;
  // supabase-js keeps the fetch it finds when the client is created, so the
  // stub goes in before any function (and its shared client) is imported.
  globalThis.fetch = fakeFetch as typeof fetch;
  Object.defineProperty(Deno, "serve", {
    configurable: true,
    writable: true,
    value: (handler: Handler) => { capturedHandler = handler; return { finished: Promise.resolve(), shutdown: async () => {} }; },
  });
}

// Imports a function module (relative to supabase/functions) and returns the
// handler it passed to Deno.serve.
export async function loadFunction(name: string): Promise<Handler> {
  capturedHandler = null;
  await import(new URL(`../../functions/${name}/index.ts`, import.meta.url).href);
  // Already-imported modules don't call Deno.serve again, so keep each handler.
  const handler = (capturedHandler as Handler | null) ?? loadedHandlers.get(name);
  assert.ok(handler, `${name} did not call Deno.serve`);
  loadedHandlers.set(name, handler);
  return handler;
}

export function webhookRequest(body: unknown, options: { secret?: string | null; method?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const secret = options.secret === undefined ? SECRET : options.secret;
  if (secret !== null) headers["x-internal-secret"] = secret;
  const method = options.method ?? "POST";
  return new Request("http://localhost/", { method, headers, body: method === "GET" ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
}

export async function call(handler: Handler, body: unknown, options?: { secret?: string | null; method?: string }) {
  const response = await handler(webhookRequest(body, options));
  const text = await response.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* plain text body */ }
  return { status: response.status, body: parsed as { sent?: number } | string };
}

// Pushes grouped by recipient token, for order-independent assertions.
export function pushesByToken() {
  return Object.fromEntries(pushes.map((message) => [message.to, message]));
}

// Shared fixture helpers.
export const profile = (id: string, first_name: string, last_name: string, role = "player") => ({ id, first_name, last_name, role });
export const token = (user_id: string, expo_push_token = `ExponentPushToken[${user_id}]`) => ({ user_id, expo_push_token });

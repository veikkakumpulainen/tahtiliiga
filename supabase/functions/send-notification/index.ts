// Sends a push notification to an admin-chosen audience (whole league,
// captains only, one team, one group, or a single player).
// Deploy: supabase functions deploy send-notification
// Caller must be authenticated as an admin (checked via is_admin() RPC using
// the caller's own JWT, forwarded automatically by supabase.functions.invoke).
// (SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided
// automatically by Supabase.)

import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveRecipientIds, sendExpoPush, type NotificationTarget } from "../_shared/notifications.ts";
import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

type Payload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  target: NotificationTarget & { excludeUserId?: string };
};

async function isAdminRequest(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !anonKey || !supabaseUrl) return false;
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data, error } = await userClient.rpc("is_admin");
  return !error && data === true;
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  if (!(await isAdminRequest(req))) return new Response("Forbidden", { status: 403, headers: corsHeaders });

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
  }
  if (!payload?.title?.trim() || !payload?.body?.trim() || !payload?.target?.type) {
    return new Response("Missing title, body or target", { status: 400, headers: corsHeaders });
  }

  const recipients = await resolveRecipientIds(payload.target, payload.target.excludeUserId);
  const sent = await sendExpoPush(recipients, { title: payload.title.trim(), body: payload.body.trim(), data: payload.data });

  return new Response(JSON.stringify({ sent, recipients: recipients.length }), { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } });
});

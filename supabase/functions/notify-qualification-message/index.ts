// Notifies both teams in a qualification match (minus the sender) when a
// new qualification_messages row is inserted. Wired up as a Postgres
// trigger (see migration) that calls this via pg_net, mirroring
// notify-group-message/notify-community-message.
// Deploy: supabase functions deploy notify-qualification-message --no-verify-jwt
// Secrets needed: FUNCTION_INTERNAL_SECRET (shared with the other notify-* functions)
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically by Supabase.)

import { sendExpoPush, supabaseAdmin } from "../_shared/notifications.ts";

const internalSecret = Deno.env.get("FUNCTION_INTERNAL_SECRET");

type WebhookPayload = {
  type: string;
  table: string;
  record: { id: string; match_id: string; user_id: string; message: string };
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!internalSecret || req.headers.get("x-internal-secret") !== internalSecret) {
    return new Response("Forbidden", { status: 403 });
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (payload.type !== "INSERT" || payload.table !== "qualification_messages") {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200, headers: { "content-type": "application/json" } });
  }

  const { match_id: matchId, user_id: senderId, message, id: messageId } = payload.record;
  const [{ data: match }, { data: sender }] = await Promise.all([
    supabaseAdmin.from("matches").select("home_team_id, away_team_id").eq("id", matchId).single(),
    supabaseAdmin.from("profiles").select("first_name, last_name").eq("id", senderId).single(),
  ]);

  if (!match) return new Response(JSON.stringify({ sent: 0 }), { status: 200, headers: { "content-type": "application/json" } });

  const { data: memberRows } = await supabaseAdmin.from("team_members").select("user_id").in("team_id", [match.home_team_id, match.away_team_id]);
  const recipients = Array.from(new Set((memberRows ?? []).map((row) => row.user_id))).filter((id) => id !== senderId);

  const senderName = sender ? `${sender.first_name} ${sender.last_name}` : "Karsintaottelu";
  const excerpt = message.length > 120 ? `${message.slice(0, 117)}...` : message;

  const sent = await sendExpoPush(recipients, { title: `${senderName} · Karsintaottelu`, body: excerpt, data: { path: "/chat", messageId } });

  return new Response(JSON.stringify({ sent }), { status: 200, headers: { "content-type": "application/json" } });
});

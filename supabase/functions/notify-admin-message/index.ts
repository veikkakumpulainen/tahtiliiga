// Notifies everyone in an admin conversation (minus the sender) when a new
// admin_messages row is inserted. Wired up as a Postgres trigger (see
// 132_admin_conversations.sql) that calls this via pg_net, mirroring
// notify-direct-message.
// Deploy: supabase functions deploy notify-admin-message --no-verify-jwt
// Secrets needed: FUNCTION_INTERNAL_SECRET (shared with the other notify-* functions)
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically by Supabase.)

import { filterMutedRecipients, sendExpoPush, supabaseAdmin } from "../_shared/notifications.ts";

const internalSecret = Deno.env.get("FUNCTION_INTERNAL_SECRET");

type WebhookPayload = {
  type: string;
  table: string;
  record: { id: string; conversation_id: string; user_id: string; message: string };
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
  if (payload.type !== "INSERT" || payload.table !== "admin_messages") {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200, headers: { "content-type": "application/json" } });
  }

  const { conversation_id: conversationId, user_id: senderId, message, id: messageId } = payload.record;
  const [{ data: memberRows }, { data: sender }] = await Promise.all([
    supabaseAdmin.from("admin_conversation_members").select("user_id").eq("conversation_id", conversationId),
    supabaseAdmin.from("profiles").select("first_name, last_name, role").eq("id", senderId).single(),
  ]);

  const members = Array.from(new Set((memberRows ?? []).map((row) => row.user_id as string))).filter((id) => id !== senderId);
  const recipients = await filterMutedRecipients(members, "direct_messages", { type: "admin", id: conversationId });

  const senderName = sender ? `${sender.first_name} ${sender.last_name}` : "Uusi viesti";
  const excerpt = message.length > 120 ? `${message.slice(0, 117)}...` : message;

  const sent = await sendExpoPush(recipients, { title: `${senderName} · ${sender?.role === "admin" ? "Ylläpito" : "Yksityisviesti"}`, body: excerpt, data: { path: `/chat?adminChatId=${conversationId}`, messageId } });

  return new Response(JSON.stringify({ sent }), { status: 200, headers: { "content-type": "application/json" } });
});

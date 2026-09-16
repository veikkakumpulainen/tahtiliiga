// Notifies every other member of a group's teams when a new group_messages
// row is inserted. Wired up as a Supabase Database Webhook (Dashboard ->
// Database -> Webhooks -> INSERT on group_messages -> HTTP request to this
// function's URL, with header "x-internal-secret: <FUNCTION_INTERNAL_SECRET>").
// Deploy: supabase functions deploy notify-group-message
// Secrets needed: FUNCTION_INTERNAL_SECRET (supabase secrets set FUNCTION_INTERNAL_SECRET=...)
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically by Supabase.)

import { resolveRecipientIds, sendExpoPush, supabaseAdmin } from "../_shared/notifications.ts";

const internalSecret = Deno.env.get("FUNCTION_INTERNAL_SECRET");

type WebhookPayload = {
  type: string;
  table: string;
  record: { id: string; group_id: string; user_id: string; message: string };
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
  if (payload.type !== "INSERT" || payload.table !== "group_messages") {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200, headers: { "content-type": "application/json" } });
  }

  const { group_id: groupId, user_id: senderId, message, id: messageId } = payload.record;
  const [{ data: group }, { data: sender }] = await Promise.all([
    supabaseAdmin.from("groups").select("name").eq("id", groupId).single(),
    supabaseAdmin.from("profiles").select("first_name, last_name").eq("id", senderId).single(),
  ]);

  const senderName = sender ? `${sender.first_name} ${sender.last_name}` : "Uusi viesti";
  const title = group ? `${senderName} · ${group.name}` : senderName;
  const excerpt = message.length > 120 ? `${message.slice(0, 117)}...` : message;

  const recipients = await resolveRecipientIds({ type: "group", groupId }, senderId);
  const sent = await sendExpoPush(recipients, { title, body: excerpt, data: { path: `/chat?groupId=${groupId}`, messageId } });

  return new Response(JSON.stringify({ sent }), { status: 200, headers: { "content-type": "application/json" } });
});

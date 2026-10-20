// Notifies every member of a league when a new community_messages
// ("yhteisö") announcement is inserted, so the whole league gets a push
// notification. Wired up as the community_messages_notify_webhook trigger
// (see supabase/migrations/091_community_message_notification_trigger.sql),
// which reads this function's URL and the shared secret from Supabase Vault.
// Deploy: supabase functions deploy notify-community-message
// Secrets needed: FUNCTION_INTERNAL_SECRET (shared with notify-group-message)
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically by Supabase.)

import { filterMutedRecipients, resolveRecipientIds, sendExpoPush, supabaseAdmin } from "../_shared/notifications.ts";

const internalSecret = Deno.env.get("FUNCTION_INTERNAL_SECRET");

type WebhookPayload = {
  type: string;
  table: string;
  record: { id: string; league_id: string; user_id: string; message: string };
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
  if (payload.type !== "INSERT" || payload.table !== "community_messages") {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200, headers: { "content-type": "application/json" } });
  }

  const { league_id: leagueId, user_id: senderId, message, id: messageId } = payload.record;
  const [{ data: league }, { data: sender }] = await Promise.all([
    supabaseAdmin.from("leagues").select("name").eq("id", leagueId).single(),
    supabaseAdmin.from("profiles").select("first_name, last_name").eq("id", senderId).single(),
  ]);

  const senderName = sender ? `${sender.first_name} ${sender.last_name}` : "Tähtiliiga";
  const title = league ? `${senderName} · ${league.name}` : senderName;
  const excerpt = message.length > 120 ? `${message.slice(0, 117)}...` : message;

  const recipients = await filterMutedRecipients(await resolveRecipientIds({ type: "league", leagueId }, senderId), "community_messages", { type: "community", id: leagueId });
  const sent = await sendExpoPush(recipients, { title, body: excerpt, data: { path: "/chat", messageId } });

  return new Response(JSON.stringify({ sent }), { status: 200, headers: { "content-type": "application/json" } });
});

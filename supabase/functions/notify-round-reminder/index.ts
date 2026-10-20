// Reminds the captains of teams that still have matches without an agreed
// time, 7 days into a regular round. Called by send_round_reminders() (see
// supabase/migrations/128_unscheduled_match_reminders.sql), which pg_cron
// runs hourly and which reads this function's URL (Vault secret
// notify_round_reminder_url) and the shared secret from Supabase Vault.
// Deploy: supabase functions deploy notify-round-reminder --no-verify-jwt
// Secrets needed: FUNCTION_INTERNAL_SECRET (shared with the other notify-* functions)
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically by Supabase.)

import { filterMutedRecipients, sendExpoPush, supabaseAdmin } from "../_shared/notifications.ts";

const internalSecret = Deno.env.get("FUNCTION_INTERNAL_SECRET");

type WebhookPayload = {
  table: string;
  record: { id: string; name: string; league_id: string };
};

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

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
  if (payload.table !== "league_rounds" || !payload.record?.id) return json({ sent: 0 });

  const { id: roundId, name: roundName, league_id: leagueId } = payload.record;
  const [{ data: league }, { data: matches }] = await Promise.all([
    supabaseAdmin.from("leagues").select("name").eq("id", leagueId).single(),
    supabaseAdmin.from("matches").select("home_team_id, away_team_id").eq("league_round_id", roundId).eq("status", "scheduled").is("scheduled_at", null),
  ]);

  const teamIds = Array.from(new Set((matches ?? []).flatMap((match) => [match.home_team_id as string, match.away_team_id as string])));
  if (teamIds.length === 0) return json({ sent: 0 });
  const { data: captainRows } = await supabaseAdmin.from("team_members").select("user_id").in("team_id", teamIds).eq("is_captain", true).eq("status", "active");
  const captains = Array.from(new Set((captainRows ?? []).map((row) => row.user_id as string)));
  const recipients = await filterMutedRecipients(captains, "match_reminders");

  const sent = await sendExpoPush(recipients, {
    title: league?.name ?? "Tähtiliiga",
    body: `${roundName} otteluita vielä sopimatta, sovithan ottelusi ennen kierroksen päättymistä ⭐️`,
    data: { path: "/home" },
  });
  return json({ sent });
});

// Notifies every player of a league when one of its rounds starts. Wired up
// as the league_rounds_notify_started trigger (see
// supabase/migrations/127_round_start_notifications.sql), which reads this
// function's URL (Vault secret notify_round_started_url) and the shared
// secret from Supabase Vault.
// Deploy: supabase functions deploy notify-round-started --no-verify-jwt
// Secrets needed: FUNCTION_INTERNAL_SECRET (shared with the other notify-* functions)
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically by Supabase.)

import { filterMutedRecipients, sendExpoPush, supabaseAdmin } from "../_shared/notifications.ts";

const internalSecret = Deno.env.get("FUNCTION_INTERNAL_SECRET");

type WebhookPayload = {
  table: string;
  record: { id: string; league_id: string; round_type: "regular" | "qualification"; status: string };
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
  if (payload.table !== "league_rounds" || payload.record?.status !== "active") return json({ sent: 0 });

  const { id: roundId, league_id: leagueId, round_type: roundType } = payload.record;
  const [{ data: league }, { data: rounds }, { data: teams }] = await Promise.all([
    supabaseAdmin.from("leagues").select("name").eq("id", leagueId).single(),
    supabaseAdmin.from("league_rounds").select("id").eq("league_id", leagueId).eq("round_type", roundType).order("start_date").order("created_at"),
    supabaseAdmin.from("teams").select("id").eq("league_id", leagueId),
  ]);

  // Rounds are numbered within their type: "Kierros 2", "Karsintakierros 1".
  const roundNumber = (rounds ?? []).findIndex((round) => round.id === roundId) + 1;
  const body = roundType === "qualification"
    ? `Karsintakierros ${roundNumber} on alkanut, sovi ja pelaa mahdollinen ottelusi ⭐️`
    : `Kierros ${roundNumber} on alkanut, sovi pelien ajankohdat ja pelaa ottelut ⭐️`;

  const teamIds = (teams ?? []).map((team) => team.id);
  if (teamIds.length === 0) return json({ sent: 0 });
  const { data: memberRows } = await supabaseAdmin.from("team_members").select("user_id").in("team_id", teamIds).eq("status", "active");
  const members = Array.from(new Set((memberRows ?? []).map((row) => row.user_id as string)));
  const recipients = await filterMutedRecipients(members, "round_starts");

  const sent = await sendExpoPush(recipients, { title: league?.name ?? "Tähtiliiga", body, data: { path: "/home" } });
  return json({ sent });
});

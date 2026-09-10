// Shared helpers for resolving push notification recipients and sending
// them through Expo's push service. Used by send-notification and
// notify-group-message.

import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

export type NotificationTarget =
  | { type: "league"; leagueId: string }
  | { type: "captains"; leagueId: string }
  | { type: "team"; teamId: string }
  | { type: "group"; groupId: string }
  | { type: "player"; userId: string };

export async function resolveRecipientIds(target: NotificationTarget, excludeUserId?: string): Promise<string[]> {
  let userIds: string[] = [];

  if (target.type === "player") {
    userIds = [target.userId];
  } else if (target.type === "team") {
    const { data } = await supabaseAdmin.from("team_members").select("user_id").eq("team_id", target.teamId);
    userIds = (data ?? []).map((row) => row.user_id);
  } else if (target.type === "group") {
    const { data: groupTeams } = await supabaseAdmin.from("group_teams").select("team_id").eq("group_id", target.groupId);
    const teamIds = (groupTeams ?? []).map((row) => row.team_id);
    if (teamIds.length === 0) return [];
    const { data } = await supabaseAdmin.from("team_members").select("user_id").in("team_id", teamIds);
    userIds = (data ?? []).map((row) => row.user_id);
  } else {
    const { data: teams } = await supabaseAdmin.from("teams").select("id").eq("league_id", target.leagueId);
    const teamIds = (teams ?? []).map((row) => row.id);
    if (teamIds.length === 0) return [];
    let query = supabaseAdmin.from("team_members").select("user_id").in("team_id", teamIds);
    if (target.type === "captains") query = query.eq("is_captain", true);
    const { data } = await query;
    userIds = (data ?? []).map((row) => row.user_id);
  }

  const unique = Array.from(new Set(userIds));
  return excludeUserId ? unique.filter((id) => id !== excludeUserId) : unique;
}

export async function sendExpoPush(userIds: string[], notification: { title: string; body: string; data?: Record<string, unknown> }): Promise<number> {
  if (userIds.length === 0) return 0;
  const { data: tokenRows } = await supabaseAdmin.from("push_tokens").select("expo_push_token").in("user_id", userIds);
  const tokens = Array.from(new Set((tokenRows ?? []).map((row) => row.expo_push_token as string)));
  if (tokens.length === 0) return 0;

  const messages = tokens.map((to) => ({ to, title: notification.title, body: notification.body, data: notification.data ?? {}, sound: "default" }));
  let sent = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(chunk),
    });
    if (response.ok) sent += chunk.length;
  }
  return sent;
}

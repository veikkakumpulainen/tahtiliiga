// Shared helpers for resolving push notification recipients and sending
// them through Expo's push service. Used by send-notification and the
// notify-* message functions.

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

// Columns of notification_preferences, one per kind of notification.
export type NotificationCategory = "group_messages" | "qualification_messages" | "community_messages" | "admin_notifications";
export type MutableThread = { type: "group" | "qualification" | "community"; id: string };

// Drops users who muted everything, this kind of notification, or (when
// given) this one chat thread. Users without a preferences row get all.
export async function filterMutedRecipients(userIds: string[], category: NotificationCategory, thread?: MutableThread): Promise<string[]> {
  if (userIds.length === 0) return userIds;
  const [{ data: preferenceRows, error: preferenceError }, { data: mutedRows, error: mutedError }] = await Promise.all([
    supabaseAdmin.from("notification_preferences").select(`user_id, muted_all, ${category}`).in("user_id", userIds),
    thread
      ? supabaseAdmin.from("muted_conversations").select("user_id").eq("thread_type", thread.type).eq("thread_id", thread.id).in("user_id", userIds)
      : Promise.resolve({ data: [] as { user_id: string }[], error: null }),
  ]);
  if (preferenceError) console.warn("[push] notification_preferences query failed:", preferenceError);
  if (mutedError) console.warn("[push] muted_conversations query failed:", mutedError);
  const muted = new Set<string>([
    ...((preferenceRows ?? []) as unknown as Record<string, unknown>[]).filter((row) => row.muted_all === true || row[category] === false).map((row) => row.user_id as string),
    ...((mutedRows ?? []) as { user_id: string }[]).map((row) => row.user_id),
  ]);
  return userIds.filter((id) => !muted.has(id));
}

export async function sendExpoPush(userIds: string[], notification: { title: string; body: string; data?: Record<string, unknown> }): Promise<number> {
  if (userIds.length === 0) { console.log("[push] no recipient user ids"); return 0; }
  const { data: tokenRows, error: tokenError } = await supabaseAdmin.from("push_tokens").select("expo_push_token").in("user_id", userIds);
  if (tokenError) console.warn("[push] push_tokens query failed:", tokenError);
  const tokens = Array.from(new Set((tokenRows ?? []).map((row) => row.expo_push_token as string)));
  console.log(`[push] ${userIds.length} recipient(s), ${tokens.length} token(s)`);
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
    const result = await response.json().catch(() => null);
    console.log("[push] expo response:", JSON.stringify(result));
    const tickets = Array.isArray(result?.data) ? result.data : [];
    sent += tickets.filter((ticket: { status?: string }) => ticket?.status === "ok").length;
  }
  console.log(`[push] total sent: ${sent}`);
  return sent;
}

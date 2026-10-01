import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "expo-router";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";

type MessageRow = { user_id: string; created_at: string };

function groupBy<T>(rows: T[], key: keyof T) {
  const result: Record<string, T[]> = {};
  for (const row of rows) {
    const id = String(row[key]);
    (result[id] ??= []).push(row);
  }
  return result;
}

async function findUnread(rows: Record<string, MessageRow[]>, keyPrefix: string, userId: string) {
  const unread = new Set<string>();
  for (const [id, channelRows] of Object.entries(rows)) {
    const latestOther = channelRows.filter((row) => row.user_id !== userId).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (!latestOther) continue;
    const lastRead = await AsyncStorage.getItem(`${keyPrefix}-${userId}-${id}`);
    if (!lastRead || latestOther.created_at > lastRead) unread.add(id);
  }
  return unread;
}

export type ChatNotifyEvent = { group_id?: string; league_id?: string; match_id?: string; message_id: string; receivedAt: number };
export type ChatDeleteEvent = { messageIds: string[]; receivedAt: number };

type ChatNotifyContextValue = {
  lastNotify: ChatNotifyEvent | null;
  lastDeleted: ChatDeleteEvent | null;
  unreadGroupIds: Set<string>;
  unreadLeagueIds: Set<string>;
  unreadQualificationMatchIds: Set<string>;
  markGroupRead: (groupId: string) => void;
  markLeagueRead: (leagueId: string) => void;
  markQualificationMatchRead: (matchId: string) => void;
};

const emptySet = new Set<string>();
const ChatNotifyContext = createContext<ChatNotifyContextValue>({
  lastNotify: null,
  lastDeleted: null,
  unreadGroupIds: emptySet,
  unreadLeagueIds: emptySet,
  unreadQualificationMatchIds: emptySet,
  markGroupRead: () => {},
  markLeagueRead: () => {},
  markQualificationMatchRead: () => {},
});

// group_messages/community_messages SELECT is only granted through the
// security-definer is_team_member() helper (needed elsewhere to avoid RLS
// recursion on team_members) - Realtime's own postgres_changes authorization
// check doesn't reliably evaluate that, so a direct postgres_changes
// subscription on those tables never reliably fired for messages from other
// people. Instead, a DB trigger (see migration 101_unread_chat_broadcast.sql)
// broadcasts a ping to this user's own private channel
// ('user-notify:<user_id>'), whose Realtime Authorization check is a trivial
// "is this topic mine" with no helper functions involved.
//
// This provider owns both the notify subscription AND the resulting
// per-thread unread state (unlike a single hasUnread boolean) so the tab
// badge and the chat screen's own per-button dots (which thread has the
// unread message) share one source of truth and stay in sync - e.g. opening
// a thread clears its dot everywhere immediately, not just on next tab
// switch. It's also shared app-wide because client.channel() dedupes by
// topic: a second independent subscribe to the same private topic can hit an
// already-subscribed channel object and throw when .on() is called on it.
export function ChatNotifyProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const pathname = usePathname();
  const userId = session?.user.id;
  const [lastNotify, setLastNotify] = useState<ChatNotifyEvent | null>(null);
  const [lastDeleted, setLastDeleted] = useState<ChatDeleteEvent | null>(null);
  const [unreadGroupIds, setUnreadGroupIds] = useState<Set<string>>(new Set());
  const [unreadLeagueIds, setUnreadLeagueIds] = useState<Set<string>>(new Set());
  const [unreadQualificationMatchIds, setUnreadQualificationMatchIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!supabase || !userId) { setUnreadGroupIds(new Set()); setUnreadLeagueIds(new Set()); setUnreadQualificationMatchIds(new Set()); return; }
    const client = supabase;
    const { data: membershipData } = await client.from("team_members").select("team_id, teams(id, league_id)").eq("user_id", userId).eq("status", "active");
    const memberships = (membershipData ?? []) as unknown as { teams?: { id: string; league_id: string } | { id: string; league_id: string }[] | null }[];
    const teamRows = memberships.flatMap((membership) => Array.isArray(membership.teams) ? membership.teams : membership.teams ? [membership.teams] : []);
    const teamIds = teamRows.map((team) => team.id);
    const leagueIds = [...new Set(teamRows.map((team) => team.league_id))];
    if (!teamIds.length) { setUnreadGroupIds(new Set()); setUnreadLeagueIds(new Set()); setUnreadQualificationMatchIds(new Set()); return; }

    const [{ data: leagueRows }, { data: groupRows }, { data: qualificationMatchRows }] = await Promise.all([
      leagueIds.length ? client.from("leagues").select("id, status").in("id", leagueIds) : Promise.resolve({ data: [] }),
      client.from("group_teams").select("group_id, groups(id, league_id)").in("team_id", teamIds),
      client.from("matches").select("id, league_rounds!inner(round_type, status)").or(`home_team_id.in.(${teamIds.join(",")}),away_team_id.in.(${teamIds.join(",")})`).eq("league_rounds.round_type", "qualification").eq("league_rounds.status", "active"),
    ]);
    const ongoingLeagueIds = new Set((leagueRows ?? []).filter((league) => league.status === "ongoing").map((league) => league.id));
    const groupRelations = (groupRows ?? []) as unknown as { group_id: string; groups: { id: string; league_id: string } | { id: string; league_id: string }[] | null }[];
    const groupIds = [...new Set(groupRelations.map((row) => {
      const group = Array.isArray(row.groups) ? row.groups[0] : row.groups;
      return group && ongoingLeagueIds.has(group.league_id) ? row.group_id : null;
    }).filter((id): id is string => Boolean(id)))];
    const qualificationMatchIds = [...new Set((qualificationMatchRows ?? []).map((row) => row.id as string))];

    const [{ data: groupMessages }, { data: communityMessages }, { data: qualificationMessages }] = await Promise.all([
      groupIds.length ? client.from("group_messages").select("group_id, user_id, created_at").in("group_id", groupIds) : Promise.resolve({ data: [] }),
      leagueIds.length ? client.from("community_messages").select("league_id, user_id, created_at").in("league_id", leagueIds) : Promise.resolve({ data: [] }),
      qualificationMatchIds.length ? client.from("qualification_messages").select("match_id, user_id, created_at").in("match_id", qualificationMatchIds) : Promise.resolve({ data: [] }),
    ]);

    setUnreadGroupIds(await findUnread(groupBy((groupMessages ?? []) as (MessageRow & { group_id: string })[], "group_id"), "group-chat-read", userId));
    setUnreadLeagueIds(await findUnread(groupBy((communityMessages ?? []) as (MessageRow & { league_id: string })[], "league_id"), "community-chat-read", userId));
    setUnreadQualificationMatchIds(await findUnread(groupBy((qualificationMessages ?? []) as (MessageRow & { match_id: string })[], "match_id"), "qualification-chat-read", userId));
  }, [userId]);

  useEffect(() => { void refresh(); }, [refresh, pathname]);

  useEffect(() => {
    if (!supabase || !userId || !session?.access_token) return;
    const client = supabase;
    // Private channels are authorized using the access token set on the
    // realtime client - explicitly (re)set it right before subscribing
    // rather than relying only on the client's own auth-state wiring, since
    // that runs asynchronously and can otherwise lose the race with this
    // effect's subscribe() call right after login.
    let cancelled = false;
    let channel: ReturnType<typeof client.channel> | null = null;
    void client.realtime.setAuth(session.access_token).then(() => {
      if (cancelled) return;
      channel = client.channel(`user-notify:${userId}`, { config: { private: true } });
      channel.on("broadcast", { event: "unread_chat" }, ({ payload }) => {
        const data = payload as { group_id?: string; league_id?: string; match_id?: string; message_id: string };
        setLastNotify({ ...data, receivedAt: Date.now() });
        if (data.group_id) setUnreadGroupIds((current) => current.has(data.group_id!) ? current : new Set(current).add(data.group_id!));
        if (data.league_id) setUnreadLeagueIds((current) => current.has(data.league_id!) ? current : new Set(current).add(data.league_id!));
        if (data.match_id) setUnreadQualificationMatchIds((current) => current.has(data.match_id!) ? current : new Set(current).add(data.match_id!));
      });
      // Deletions (121_chat_message_delete_broadcast.sql): the open chat drops
      // the ids in place, and the unread dots are recomputed in case the
      // deleted message was the only unread one in its thread.
      channel.on("broadcast", { event: "chat_deleted" }, ({ payload }) => {
        const data = payload as { message_ids?: string[] };
        setLastDeleted({ messageIds: data.message_ids ?? [], receivedAt: Date.now() });
        void refresh();
      });
      channel.subscribe();
    });
    return () => { cancelled = true; if (channel) void client.removeChannel(channel); };
  }, [userId, session?.access_token, refresh]);

  const markGroupRead = useCallback((groupId: string) => {
    if (userId) void AsyncStorage.setItem(`group-chat-read-${userId}-${groupId}`, new Date().toISOString());
    setUnreadGroupIds((current) => { if (!current.has(groupId)) return current; const next = new Set(current); next.delete(groupId); return next; });
  }, [userId]);

  const markLeagueRead = useCallback((leagueId: string) => {
    if (userId) void AsyncStorage.setItem(`community-chat-read-${userId}-${leagueId}`, new Date().toISOString());
    setUnreadLeagueIds((current) => { if (!current.has(leagueId)) return current; const next = new Set(current); next.delete(leagueId); return next; });
  }, [userId]);

  const markQualificationMatchRead = useCallback((matchId: string) => {
    if (userId) void AsyncStorage.setItem(`qualification-chat-read-${userId}-${matchId}`, new Date().toISOString());
    setUnreadQualificationMatchIds((current) => { if (!current.has(matchId)) return current; const next = new Set(current); next.delete(matchId); return next; });
  }, [userId]);

  return <ChatNotifyContext.Provider value={{ lastNotify, lastDeleted, unreadGroupIds, unreadLeagueIds, unreadQualificationMatchIds, markGroupRead, markLeagueRead, markQualificationMatchRead }}>{children}</ChatNotifyContext.Provider>;
}

export function useChatNotify() {
  return useContext(ChatNotifyContext);
}

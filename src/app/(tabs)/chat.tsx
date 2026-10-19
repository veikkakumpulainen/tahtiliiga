import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, BackHandler, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "@expo/vector-icons/Ionicons";
import ScreenHeader from "../../components/ScreenHeader";
import TeamRosterList, { groupRosterByTeam, type TeamRosterRow } from "../../components/TeamRosterList";
import { useChatNotify } from "../../context/ChatNotifyContext";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabase";
import { colors, shadow } from "../../theme";

const categoryLabels: Record<string, string> = { avoin: "Avoin", mixty: "Mixty" };
type Message = { id: string; name: string; sub: string; body: string; time: string; own: boolean };
type GroupMessageRow = { id: string; message: string; created_at: string; user_id: string; sender_first_name: string; sender_last_name: string; team_name: string };
type CommunityMessageRow = { id: string; message: string; created_at: string; user_id: string; sender_first_name: string; sender_last_name: string };
type ThreadType = "group" | "qualification" | "community";
const messageTables: Record<ThreadType, string> = { group: "group_messages", qualification: "qualification_messages", community: "community_messages" };
const threadIcons: Record<ThreadType, keyof typeof Ionicons.glyphMap> = { community: "megaphone-outline", group: "people-outline", qualification: "flash-outline" };
const typeOrder: Record<ThreadType, number> = { community: 0, group: 1, qualification: 2 };

// One row in the chat list. `id` is the group, league or match id the
// thread's messages hang off, depending on `type`.
type Conversation = {
  key: string;
  type: ThreadType;
  id: string;
  leagueId: string;
  title: string;
  subtitle: string;
  canCompose: boolean;
  // Admin-only extras: threads in leagues the admin isn't playing in.
  adminOnly: boolean;
  opponentTeamId?: string;
  note?: string;
};
type LastMessage = { message: string; created_at: string; user_id: string };

type MembershipTeam = { id: string; name: string; league_id: string; category: string; leagues: { name: string; status: string } | { name: string; status: string }[] | null };
const one = <T,>(value: T | T[] | null | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;

function toMessage(id: string, name: string, sub: string, body: string, createdAt: string, own: boolean): Message {
  return { id, name, sub, body, time: new Date(createdAt).toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit" }), own };
}

// Today's messages show the time, older ones the date.
function formatListTime(createdAt: string) {
  const date = new Date(createdAt);
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit" })
    : `${date.getDate()}.${date.getMonth() + 1}.`;
}

export default function ChatTabScreen() {
  const { session } = useAuth();
  const { lastNotify, lastDeleted, unreadGroupIds, unreadLeagueIds, unreadQualificationMatchIds, markGroupRead, markLeagueRead, markQualificationMatchRead } = useChatNotify();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [lastMessages, setLastMessages] = useState<Record<string, LastMessage>>({});
  const [loadingList, setLoadingList] = useState(true);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [showMembers, setShowMembers] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [groupMembers, setGroupMembers] = useState<TeamRosterRow[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [scrollTargetId, setScrollTargetId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const { groupId: targetGroupId } = useLocalSearchParams<{ groupId?: string }>();
  const appliedGroupParam = useRef<string | null>(null);

  // Builds the list from the user's active team memberships: every league
  // they're registered in gets its Tiedotteet thread; a running league adds
  // the team's lohko chat, which a qualification round replaces with a chat
  // against the qualification opponent (only for teams that have such a match).
  const loadConversations = useCallback(async () => {
    if (!supabase || !session?.user.id) return;
    const client = supabase;
    const userId = session.user.id;
    const [{ data: membershipData }, { data: adminData }] = await Promise.all([
      client.from("team_members").select("teams(id, name, league_id, category, leagues(name, status))").eq("user_id", userId).eq("status", "active"),
      client.rpc("is_admin"),
    ]);
    const admin = adminData === true;
    const teams = ((membershipData ?? []) as unknown as { teams: MembershipTeam | MembershipTeam[] | null }[])
      .flatMap((row) => Array.isArray(row.teams) ? row.teams : row.teams ? [row.teams] : [])
      .map((team) => ({ ...team, league: one(team.leagues) }));
    const teamIds = teams.map((team) => team.id);
    const ongoingLeagueIds = [...new Set(teams.filter((team) => team.league?.status === "ongoing").map((team) => team.league_id))];
    const empty = Promise.resolve({ data: [] as unknown[] });

    const [{ data: groupRows }, { data: qualificationRoundRows }, { data: qualificationMatchRows }, { data: adminLeagueRows }, { data: adminGroupRows }] = await Promise.all([
      teamIds.length ? client.from("group_teams").select("team_id, groups(id, name)").in("team_id", teamIds) : empty,
      ongoingLeagueIds.length ? client.from("league_rounds").select("league_id").in("league_id", ongoingLeagueIds).eq("round_type", "qualification").eq("status", "active") : empty,
      teamIds.length ? client.from("matches").select("id, home_team_id, away_team_id, league_rounds!inner(round_type, status)")
        .or(`home_team_id.in.(${teamIds.join(",")}),away_team_id.in.(${teamIds.join(",")})`)
        .eq("league_rounds.round_type", "qualification").eq("league_rounds.status", "active") : empty,
      admin ? client.from("leagues").select("id, name").neq("status", "finished") : empty,
      admin ? client.from("groups").select("id, name, category, league_id, leagues!inner(name, status)").eq("leagues.status", "ongoing").order("name") : empty,
    ]);

    const groupByTeamId = new Map(((groupRows ?? []) as { team_id: string; groups: { id: string; name: string } | { id: string; name: string }[] | null }[])
      .map((row) => [row.team_id, one(row.groups)] as const));
    const qualificationLeagueIds = new Set(((qualificationRoundRows ?? []) as { league_id: string }[]).map((row) => row.league_id));
    const qualificationMatches = (qualificationMatchRows ?? []) as { id: string; home_team_id: string; away_team_id: string }[];
    const opponentIds = [...new Set(qualificationMatches.flatMap((row) => [row.home_team_id, row.away_team_id]).filter((id) => !teamIds.includes(id)))];
    const { data: opponentRows } = opponentIds.length ? await client.from("teams").select("id, name").in("id", opponentIds) : { data: [] };
    const opponentNames = new Map(((opponentRows ?? []) as { id: string; name: string }[]).map((team) => [team.id, team.name]));

    const next: Conversation[] = [];
    const ownLeagueIds = new Set<string>();
    for (const team of teams) {
      if (ownLeagueIds.has(team.league_id)) continue;
      ownLeagueIds.add(team.league_id);
      next.push({ key: `community:${team.league_id}`, type: "community", id: team.league_id, leagueId: team.league_id, title: "Tiedotteet", subtitle: team.league?.name ?? "", canCompose: admin, adminOnly: false });
    }
    const ownGroupIds = new Set<string>();
    for (const team of teams) {
      const leagueName = team.league?.name ?? "";
      const category = categoryLabels[team.category] ?? team.category;
      const match = qualificationMatches.find((row) => row.home_team_id === team.id || row.away_team_id === team.id);
      if (match) {
        const opponentTeamId = match.home_team_id === team.id ? match.away_team_id : match.home_team_id;
        next.push({ key: `qualification:${match.id}`, type: "qualification", id: match.id, leagueId: team.league_id, title: `Karsinta vs ${opponentNames.get(opponentTeamId) ?? "vastustaja"}`, subtitle: `${leagueName} · ${category}`, canCompose: true, adminOnly: false, opponentTeamId });
        continue;
      }
      const group = groupByTeamId.get(team.id);
      // The lohko chat is closed while a qualification round runs.
      if (!group || team.league?.status !== "ongoing" || qualificationLeagueIds.has(team.league_id)) continue;
      ownGroupIds.add(group.id);
      next.push({ key: `group:${group.id}`, type: "group", id: group.id, leagueId: team.league_id, title: `${group.name} · ${category}`, subtitle: leagueName, canCompose: true, adminOnly: false });
    }
    for (const league of (adminLeagueRows ?? []) as { id: string; name: string }[]) {
      if (ownLeagueIds.has(league.id)) continue;
      next.push({ key: `community:${league.id}`, type: "community", id: league.id, leagueId: league.id, title: "Tiedotteet", subtitle: league.name, canCompose: true, adminOnly: true });
    }
    // Admins can read any running lohko, but the group_messages insert
    // policy requires actual team membership in the group.
    for (const group of (adminGroupRows ?? []) as { id: string; name: string; category: string; league_id: string; leagues: { name: string } | { name: string }[] | null }[]) {
      if (ownGroupIds.has(group.id)) continue;
      next.push({ key: `group:${group.id}`, type: "group", id: group.id, leagueId: group.league_id, title: `${group.name} · ${categoryLabels[group.category] ?? group.category}`, subtitle: one(group.leagues)?.name ?? "", canCompose: false, adminOnly: true, note: "Ylläpito näkee lohkon viestit, mutta ei ole sen jäsen." });
    }

    const idsOf = (type: ThreadType) => next.filter((conversation) => conversation.type === type).map((conversation) => conversation.id);
    const [groupIds, leagueIds, matchIds] = [idsOf("group"), idsOf("community"), idsOf("qualification")];
    const [{ data: groupMessages }, { data: communityMessages }, { data: qualificationMessages }] = await Promise.all([
      groupIds.length ? client.from("group_messages").select("group_id, user_id, message, created_at").in("group_id", groupIds).order("created_at", { ascending: false }).limit(1000) : empty,
      leagueIds.length ? client.from("community_messages").select("league_id, user_id, message, created_at").in("league_id", leagueIds).order("created_at", { ascending: false }).limit(1000) : empty,
      matchIds.length ? client.from("qualification_messages").select("match_id, user_id, message, created_at").in("match_id", matchIds).order("created_at", { ascending: false }).limit(1000) : empty,
    ]);
    const latest: Record<string, LastMessage> = {};
    const collect = (rows: unknown[] | null, type: ThreadType, idKey: string) => {
      // Rows arrive newest first, so the first one seen per thread is its latest.
      for (const row of (rows ?? []) as (LastMessage & Record<string, string>)[]) latest[`${type}:${row[idKey]}`] ??= row;
    };
    collect(groupMessages, "group", "group_id");
    collect(communityMessages, "community", "league_id");
    collect(qualificationMessages, "qualification", "match_id");

    // Newest activity first, like a messaging app; threads without messages
    // keep their natural order after them.
    const byActivity = (left: Conversation, right: Conversation) =>
      (latest[right.key]?.created_at ?? "").localeCompare(latest[left.key]?.created_at ?? "") || typeOrder[left.type] - typeOrder[right.type];
    setConversations([...next.filter((conversation) => !conversation.adminOnly).sort(byActivity), ...next.filter((conversation) => conversation.adminOnly).sort(byActivity)]);
    setLastMessages(latest);
    setLoadingList(false);
  }, [session?.user.id]);

  useFocusEffect(useCallback(() => { void loadConversations(); }, [loadConversations]));

  // A thread can drop off the list while open (e.g. a new round starts);
  // the list is then shown again, so effects key off what's actually open.
  const openConversation = conversations.find((conversation) => conversation.key === openKey) ?? null;
  const openThreadKey = openConversation?.key ?? null;

  // A push notification for a lohko message links here with ?groupId=...
  useEffect(() => {
    if (!targetGroupId || appliedGroupParam.current === targetGroupId) return;
    if (!conversations.some((conversation) => conversation.key === `group:${targetGroupId}`)) return;
    appliedGroupParam.current = targetGroupId;
    setOpenKey(`group:${targetGroupId}`);
  }, [targetGroupId, conversations]);

  // Android's back button returns from a thread to the list.
  const closeThread = useCallback(() => { setOpenKey(null); setShowMembers(false); setGroupMembers([]); setDraft(""); setError(""); }, []);

  useEffect(() => {
    if (!openThreadKey) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { closeThread(); return true; });
    return () => subscription.remove();
  }, [openThreadKey, closeThread]);

  const openMembers = async () => {
    if (!supabase || !openConversation) return;
    setShowMembers(true);
    setLoadingMembers(true);
    if (openConversation.type === "qualification") {
      const { data } = await supabase.rpc("get_league_team_rosters", { target_league_id: openConversation.leagueId });
      setGroupMembers(((data ?? []) as (TeamRosterRow & { team_id: string })[]).filter((row) => row.team_id === openConversation.opponentTeamId));
    } else {
      const { data } = await supabase.rpc("get_group_members", { target_group_id: openConversation.id });
      setGroupMembers((data ?? []) as TeamRosterRow[]);
    }
    setLoadingMembers(false);
  };

  const loadLohkoMessages = useCallback(async (groupId: string) => {
    if (!supabase || !session?.user.id) return;
    const userId = session.user.id;
    const { data } = await supabase.rpc("get_group_messages", { target_group_id: groupId });
    const rows = ((data ?? []) as unknown as GroupMessageRow[]).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const lastRead = await AsyncStorage.getItem(`group-chat-read-${userId}-${groupId}`);
    const firstUnread = rows.find((item) => item.user_id !== userId && (!lastRead || item.created_at > lastRead));
    setScrollTargetId((firstUnread ?? rows[rows.length - 1])?.id ?? null);
    setMessages(rows.map((item) => toMessage(item.id, item.user_id === userId ? "Sinä" : `${item.sender_first_name} ${item.sender_last_name}`, item.team_name, item.message, item.created_at, item.user_id === userId)));
    markGroupRead(groupId);
  }, [session?.user.id, markGroupRead]);

  const loadQualificationMessages = useCallback(async (matchId: string) => {
    if (!supabase || !session?.user.id) return;
    const userId = session.user.id;
    const { data } = await supabase.rpc("get_qualification_messages", { target_match_id: matchId });
    const rows = ((data ?? []) as unknown as GroupMessageRow[]).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const lastRead = await AsyncStorage.getItem(`qualification-chat-read-${userId}-${matchId}`);
    const firstUnread = rows.find((item) => item.user_id !== userId && (!lastRead || item.created_at > lastRead));
    setScrollTargetId((firstUnread ?? rows[rows.length - 1])?.id ?? null);
    setMessages(rows.map((item) => toMessage(item.id, item.user_id === userId ? "Sinä" : `${item.sender_first_name} ${item.sender_last_name}`, item.team_name, item.message, item.created_at, item.user_id === userId)));
    markQualificationMatchRead(matchId);
  }, [session?.user.id, markQualificationMatchRead]);

  const loadCommunityMessages = useCallback(async (leagueId: string) => {
    if (!supabase || !session?.user.id) return;
    const userId = session.user.id;
    const { data } = await supabase.rpc("get_community_messages", { target_league_id: leagueId });
    const rows = (data ?? []) as unknown as CommunityMessageRow[];
    const lastRead = await AsyncStorage.getItem(`community-chat-read-${userId}-${leagueId}`);
    const firstUnread = rows.find((item) => item.user_id !== userId && (!lastRead || item.created_at > lastRead));
    setScrollTargetId((firstUnread ?? rows[rows.length - 1])?.id ?? null);
    setMessages(rows.map((item) => toMessage(item.id, `${item.sender_first_name} ${item.sender_last_name}`, "Ylläpito", item.message, item.created_at, item.user_id === userId)));
    markLeagueRead(leagueId);
  }, [session?.user.id, markLeagueRead]);

  const loadThread = useCallback(async (conversation: Conversation) => {
    if (conversation.type === "group") await loadLohkoMessages(conversation.id);
    else if (conversation.type === "qualification") await loadQualificationMessages(conversation.id);
    else await loadCommunityMessages(conversation.id);
  }, [loadLohkoMessages, loadQualificationMessages, loadCommunityMessages]);

  // Tab screens stay mounted in the background, so loading a thread (which
  // marks it read) must only happen while this tab is actually open -
  // otherwise a message arriving while the user is on another tab would be
  // marked read at once and the unread dot would never show.
  const [isFocused, setIsFocused] = useState(false);
  useFocusEffect(useCallback(() => { setIsFocused(true); return () => setIsFocused(false); }, []));
  const loadedThreadKey = useRef<string | null>(null);

  useEffect(() => {
    if (!isFocused || !openConversation) return;
    // Refocusing the same thread just refetches; only a thread switch clears the list.
    if (loadedThreadKey.current !== openConversation.key) { setMessages([]); loadedThreadKey.current = openConversation.key; }
    void loadThread(openConversation);
    // Keyed on the thread, not the object: the list reload recreates it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, openThreadKey, loadThread]);

  // Back on the list: refresh previews so the thread just read is current.
  useEffect(() => {
    if (openThreadKey) return;
    loadedThreadKey.current = null;
    void loadConversations();
  }, [openThreadKey, loadConversations]);

  // A DB trigger broadcasts a ping (see ChatNotifyContext) whenever someone
  // else posts in a thread this user belongs to. The open thread refetches;
  // on the list only the previews need refreshing.
  useEffect(() => {
    if (!lastNotify || !isFocused) return;
    if (!openConversation) { void loadConversations(); return; }
    const notifiedId = openConversation.type === "group" ? lastNotify.group_id : openConversation.type === "qualification" ? lastNotify.match_id : lastNotify.league_id;
    if (notifiedId === openConversation.id) void loadThread(openConversation);
    // Only a new ping should trigger this; reruns on list reloads would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastNotify, isFocused]);

  // Someone deleted messages: drop them from the open list in place, so the
  // scroll position stays where the reader left it.
  useEffect(() => {
    if (!lastDeleted?.messageIds.length) return;
    const deletedIds = new Set(lastDeleted.messageIds);
    setMessages((current) => current.some((message) => deletedIds.has(message.id)) ? current.filter((message) => !deletedIds.has(message.id)) : current);
  }, [lastDeleted]);

  // Long-press (touch) or right-click (web) on an own message opens a small
  // sheet for deleting it.
  const [actionMessage, setActionMessage] = useState<Message | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState("");

  const openMessageActions = (message: Message) => {
    if (!message.own) return;
    setActionMessage(message); setConfirmDelete(false); setActionError("");
  };

  const deleteMessage = async () => {
    if (!supabase || !actionMessage || !openConversation) return;
    setDeleting(true);
    const { error: deleteError, count } = await supabase.from(messageTables[openConversation.type]).delete({ count: "exact" }).eq("id", actionMessage.id);
    setDeleting(false);
    if (deleteError || count === 0) { setActionError("Viestin poisto epäonnistui. Yritä uudelleen."); return; }
    setActionMessage(null);
    await loadThread(openConversation);
  };

  const maxLength = openConversation?.type === "community" ? 2000 : 1000;

  const sendMessage = async () => {
    const value = draft.trim();
    if (!value) { setError("Kirjoita viesti ennen lähettämistä."); return; }
    if (value.length > maxLength) { setError(`Viestin enimmäispituus on ${maxLength} merkkiä.`); return; }
    if (!supabase || !session?.user.id || !openConversation) return;
    const userId = session.user.id;
    const { error: insertError } = openConversation.type === "group"
      ? await supabase.from("group_messages").insert({ group_id: openConversation.id, user_id: userId, message: value })
      : openConversation.type === "qualification"
        ? await supabase.from("qualification_messages").insert({ match_id: openConversation.id, user_id: userId, message: value })
        : await supabase.from("community_messages").insert({ league_id: openConversation.id, user_id: userId, message: value });
    if (insertError) { setError("Viestin lähetys epäonnistui. Yritä uudelleen."); return; }
    // The DB trigger that pings other members skips the sender, so refetch
    // directly here instead of waiting on a notify event that won't arrive.
    await loadThread(openConversation);
    // The unread-scroll logic above never targets the sender's own message,
    // so explicitly reveal it now that it's been appended.
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    setDraft(""); setError("");
  };

  const isUnread = (conversation: Conversation) => conversation.type === "group" ? unreadGroupIds.has(conversation.id)
    : conversation.type === "qualification" ? unreadQualificationMatchIds.has(conversation.id)
      : unreadLeagueIds.has(conversation.id);

  const renderRow = (conversation: Conversation) => {
    const last = lastMessages[conversation.key];
    const unread = isUnread(conversation);
    const preview = last ? `${last.user_id === session?.user.id ? "Sinä: " : ""}${last.message.replace(/\s+/g, " ")}` : conversation.subtitle;
    return <Pressable key={conversation.key} onPress={() => setOpenKey(conversation.key)} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={[styles.avatar, conversation.type === "community" && styles.avatarCommunity]}>
        <Ionicons name={threadIcons[conversation.type]} size={21} color={conversation.type === "community" ? colors.green : colors.lime} />
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={[styles.rowTitle, unread && styles.rowTitleUnread]} numberOfLines={1}>{conversation.title}</Text>
          {last ? <Text style={[styles.rowTime, unread && styles.rowTimeUnread]}>{formatListTime(last.created_at)}</Text> : null}
        </View>
        {last ? <Text style={styles.rowLeague} numberOfLines={1}>{conversation.subtitle}</Text> : null}
        <View style={styles.rowBottom}>
          <Text style={[styles.rowPreview, unread && styles.rowPreviewUnread]} numberOfLines={1}>{last ? preview : "Ei vielä viestejä"}</Text>
          {unread ? <View style={styles.unreadDot} /> : null}
        </View>
      </View>
    </Pressable>;
  };

  const ownConversations = conversations.filter((conversation) => !conversation.adminOnly);
  const adminConversations = conversations.filter((conversation) => conversation.adminOnly);
  const infoTexts: Record<ThreadType, [string, string]> = {
    community: ["Tiedotteet", "Tiedotteisiin liigan järjestäjä lähettää koko liigaa koskevia infoja."],
    group: ["Lohkochat", "Tämä on lohkochat, jossa on kaikki teidän lohkon joukkueiden pelaajat. Lohkochatissa voit sopia pelit lohkosi joukkueita vastaan. Uusi lohkochat avautuu aina, kun uusi kierros alkaa."],
    qualification: ["Karsintachat", "Tässä chatissa on teidän ja karsintavastustajan joukkue. Voit sopia pelin ajankohdan täällä."],
  };

  if (!openConversation) return <View style={styles.page}>
    <ScreenHeader />
    {loadingList ? <ActivityIndicator color={colors.green} style={styles.listLoading} /> : <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
      {conversations.length === 0 ? <View style={styles.emptyState}><Text style={styles.emptyText}>Kun ilmoittaudut liigaan, sen tiedotteet näkyvät täällä. Lohkochat avautuu, kun kierros alkaa.</Text></View> : null}
      {ownConversations.map(renderRow)}
      {adminConversations.length > 0 ? <>
        <Text style={styles.sectionTitle}>YLLÄPITO</Text>
        {adminConversations.map(renderRow)}
      </> : null}
    </ScrollView>}
  </View>;

  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScreenHeader />
    <View style={styles.threadHeader}>
      <Pressable onPress={closeThread} hitSlop={10} accessibilityRole="button" accessibilityLabel="Takaisin keskusteluihin" style={styles.back}>
        <Ionicons name="chevron-back" size={24} color={colors.green} />
      </Pressable>
      <View style={styles.threadTitleWrap}>
        <Text style={styles.threadTitle} numberOfLines={1}>{openConversation.title}</Text>
        <Text style={styles.threadSubtitle} numberOfLines={1}>{openConversation.subtitle}</Text>
      </View>
      {openConversation.type !== "community" ? <Pressable onPress={() => void openMembers()} style={styles.membersButton}>
        <Text style={styles.membersButtonText}>{openConversation.type === "qualification" ? "Vastustaja" : "Jäsenet"}</Text>
      </Pressable> : null}
      <Pressable onPress={() => setShowInfo(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Tietoa chatista" style={styles.infoIcon}><Text style={styles.infoIconText}>i</Text></Pressable>
    </View>

    <ScrollView ref={scrollRef} contentContainerStyle={styles.messages} showsVerticalScrollIndicator={false}>
      {openConversation.note ? <Text style={styles.readOnlyNote}>{openConversation.note}</Text> : null}
      {messages.map((message) => <Pressable key={message.id} disabled={!message.own} onLongPress={() => openMessageActions(message)} delayLongPress={400} style={[styles.message, message.own && styles.ownMessage]} onLayout={(event) => {
        if (scrollTargetId !== message.id) return;
        scrollRef.current?.scrollTo({ y: Math.max(0, event.nativeEvent.layout.y - 12), animated: false });
        setScrollTargetId(null);
      }} {...(Platform.OS === "web" && message.own ? { onContextMenu: (event: { preventDefault: () => void }) => { event.preventDefault(); openMessageActions(message); } } : {})}>
        <Text style={styles.sender}>{message.name} <Text style={styles.team}>· {message.sub}</Text></Text>
        <Text style={styles.body}>{message.body}<Text style={styles.time}>  {message.time}</Text></Text>
      </Pressable>)}
    </ScrollView>

    {openConversation.canCompose ? <View style={styles.composer}>
      <View style={styles.inputWrap}>
        <TextInput value={draft} onChangeText={setDraft} onKeyPress={(event) => {
          // Web with a physical keyboard: Enter sends, Shift+Enter adds a new
          // line. Phone browsers keep Enter as a newline like the native app.
          if (Platform.OS !== "web" || !window.matchMedia?.("(hover: hover) and (pointer: fine)").matches) return;
          const nativeEvent = event.nativeEvent as { key: string; shiftKey?: boolean; isComposing?: boolean };
          if (nativeEvent.key !== "Enter" || nativeEvent.shiftKey || nativeEvent.isComposing) return;
          event.preventDefault();
          void sendMessage();
        }} placeholder="Kirjoita viesti..." placeholderTextColor="#8A978F" multiline maxLength={maxLength} style={styles.input} />
      </View>
      <Pressable onPress={sendMessage} accessibilityRole="button" accessibilityLabel="Lähetä viesti" style={({ pressed }) => [styles.send, !draft.trim() && styles.sendEmpty, pressed && styles.sendPressed]}>
        <Ionicons name="send" size={19} color={colors.lime} style={styles.sendIcon} />
      </Pressable>
    </View> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <Modal visible={showMembers} transparent animationType="fade" onRequestClose={() => setShowMembers(false)}>
      <Pressable style={styles.membersBackdrop} onPress={() => setShowMembers(false)}>
        <Pressable style={styles.membersModal} onPress={(event) => event.stopPropagation()}>
          <View style={styles.membersHeader}>
            <Text style={styles.membersTitle}>{openConversation.type === "qualification" ? "Vastustajan pelaajat" : "Lohkon joukkueet"}</Text>
            <Pressable onPress={() => setShowMembers(false)} accessibilityRole="button" accessibilityLabel="Sulje"><Text style={styles.membersClose}>×</Text></Pressable>
          </View>
          {loadingMembers ? <ActivityIndicator color={colors.green} style={styles.membersLoading} /> : <ScrollView showsVerticalScrollIndicator={false}>
            <TeamRosterList teams={groupRosterByTeam(groupMembers)} compact />
          </ScrollView>}
        </Pressable>
      </Pressable>
    </Modal>
    <Modal visible={showInfo} transparent animationType="fade" onRequestClose={() => setShowInfo(false)}>
      <Pressable style={styles.membersBackdrop} onPress={() => setShowInfo(false)}>
        <Pressable style={styles.membersModal} onPress={(event) => event.stopPropagation()}>
          <View style={styles.membersHeader}>
            <Text style={styles.membersTitle}>{infoTexts[openConversation.type][0]}</Text>
            <Pressable onPress={() => setShowInfo(false)} accessibilityRole="button" accessibilityLabel="Sulje"><Text style={styles.membersClose}>×</Text></Pressable>
          </View>
          <Text style={styles.infoText}>{infoTexts[openConversation.type][1]}</Text>
        </Pressable>
      </Pressable>
    </Modal>
    <Modal visible={!!actionMessage} transparent animationType="fade" onRequestClose={() => setActionMessage(null)}>
      <Pressable style={styles.membersBackdrop} onPress={() => setActionMessage(null)}>
        <Pressable style={styles.membersModal} onPress={(event) => event.stopPropagation()}>
          <Pressable disabled={deleting} onPress={() => confirmDelete ? void deleteMessage() : setConfirmDelete(true)} style={[styles.deleteButton, confirmDelete && styles.deleteButtonConfirm]}>
            {deleting ? <ActivityIndicator color={colors.surface} /> : <Text style={[styles.deleteButtonText, confirmDelete && styles.deleteButtonTextConfirm]}>{confirmDelete ? "Vahvista poisto" : "Poista viesti"}</Text>}
          </Pressable>
          {actionError ? <Text style={styles.actionError}>{actionError}</Text> : null}
        </Pressable>
      </Pressable>
    </Modal>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  listLoading: { marginTop: 40 },
  list: { paddingVertical: 8, paddingBottom: 24 },
  sectionTitle: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1, paddingHorizontal: 18, paddingTop: 22, paddingBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.canvas },
  rowPressed: { backgroundColor: colors.mint },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  avatarCommunity: { backgroundColor: colors.mint, borderWidth: 1, borderColor: colors.green },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowTitle: { flex: 1, color: colors.ink, fontSize: 15, fontWeight: "700" },
  rowTitleUnread: { fontWeight: "900" },
  rowTime: { color: colors.muted, fontSize: 11 },
  rowTimeUnread: { color: colors.greenBright, fontWeight: "800" },
  rowLeague: { color: colors.greenBright, fontSize: 11, fontWeight: "700", marginTop: 1 },
  rowBottom: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3 },
  rowPreview: { flex: 1, color: colors.muted, fontSize: 13 },
  rowPreviewUnread: { color: colors.ink, fontWeight: "700" },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.coral },
  threadHeader: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line },
  back: { padding: 2 },
  threadTitleWrap: { flex: 1, minWidth: 0 },
  threadTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  threadSubtitle: { color: colors.greenBright, fontSize: 11, fontWeight: "700", marginTop: 1 },
  membersButton: { borderWidth: 1, borderColor: colors.greenBright, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  membersButtonText: { color: colors.greenBright, fontWeight: "800", fontSize: 12 },
  infoIcon: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.greenBright, alignItems: "center", justifyContent: "center" },
  infoIconText: { color: colors.greenBright, fontSize: 12, fontWeight: "900", lineHeight: 14, fontStyle: "italic" },
  infoText: { color: colors.ink, fontSize: 14, lineHeight: 21, marginTop: 6 },
  emptyState: { margin: 18, backgroundColor: colors.mint, borderRadius: 14, padding: 18 },
  emptyText: { color: colors.green, fontSize: 13, lineHeight: 19, fontWeight: "700" },
  membersBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 24 },
  membersModal: { backgroundColor: colors.surface, borderRadius: 18, padding: 16, width: "100%", maxWidth: 460, maxHeight: "75%" },
  membersHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  membersTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  membersClose: { color: colors.muted, fontSize: 26, lineHeight: 26, fontWeight: "600" },
  membersLoading: { marginTop: 20 },
  readOnlyNote: { color: colors.muted, fontSize: 11, fontWeight: "700", textAlign: "center", marginBottom: 4 },
  messages: { padding: 18, gap: 14, paddingBottom: 24 },
  message: { backgroundColor: colors.surface, borderRadius: 17, borderTopLeftRadius: 4, padding: 14, maxWidth: "84%", alignSelf: "flex-start", ...shadow },
  ownMessage: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.green, borderTopLeftRadius: 17, borderTopRightRadius: 4, alignSelf: "flex-end" },
  sender: { color: colors.ink, fontSize: 11, fontWeight: "900", marginBottom: 7 },
  team: { color: colors.greenBright, fontWeight: "700" },
  body: { color: colors.ink, fontSize: 15, lineHeight: 21 },
  time: { color: colors.muted, fontSize: 10 },
  composer: { flexDirection: "row", padding: 12, paddingBottom: Platform.OS === "ios" ? 22 : 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line, alignItems: "flex-end", gap: 9 },
  inputWrap: { flex: 1, minHeight: 46, borderRadius: 15, backgroundColor: colors.canvas, paddingLeft: 14, paddingRight: 8 },
  // The browser's focus outline drew a white frame around the field on web.
  input: { color: colors.ink, fontSize: 14, maxHeight: 90, paddingTop: 13, paddingBottom: 13, ...(Platform.OS === "web" ? { outlineStyle: "none" } as object : {}) },
  send: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.green, justifyContent: "center", alignItems: "center" },
  sendEmpty: { opacity: 0.45 },
  sendPressed: { backgroundColor: colors.greenBright },
  // The send glyph's visual weight sits left of its box; nudge it to look centered.
  sendIcon: { marginLeft: 3 },
  error: { color: colors.coral, backgroundColor: colors.surface, paddingHorizontal: 15, paddingBottom: 9, fontSize: 12 },
  deleteButton: { borderRadius: 13, borderWidth: 1, borderColor: colors.coral, paddingVertical: 13, alignItems: "center" },
  deleteButtonConfirm: { backgroundColor: colors.coral },
  deleteButtonText: { color: colors.coral, fontWeight: "800" },
  deleteButtonTextConfirm: { color: colors.surface },
  actionError: { color: colors.coral, fontSize: 12, marginTop: 8 },
});

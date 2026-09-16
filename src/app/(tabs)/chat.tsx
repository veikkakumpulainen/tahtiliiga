import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ScreenHeader from "../../components/ScreenHeader";
import TeamRosterList, { groupRosterByTeam, type TeamRosterRow } from "../../components/TeamRosterList";
import { useChatNotify } from "../../context/ChatNotifyContext";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabase";
import { colors, shadow } from "../../theme";

type Team = { id: string; leagueId: string; leagueName: string; leagueStatus: string; category: string; groupId?: string };
const categoryLabels: Record<string, string> = { avoin: "Avoin", mixty: "Mixty" };
const categoryOrder = (category: string) => category === "avoin" ? 0 : category === "mixty" ? 1 : 2;
type LeagueOption = { id: string; name: string; status: string };
type AdminGroup = { id: string; leagueId: string; leagueName: string; name: string; category: string };
type Message = { id: string; name: string; sub: string; body: string; time: string; own: boolean };
type GroupMessageRow = { id: string; message: string; created_at: string; user_id: string; sender_first_name: string; sender_last_name: string; team_name: string };
type CommunityMessageRow = { id: string; message: string; created_at: string; user_id: string; sender_first_name: string; sender_last_name: string };

function toMessage(id: string, name: string, sub: string, body: string, createdAt: string, own: boolean): Message {
  return { id, name, sub, body, time: new Date(createdAt).toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit" }), own };
}

export default function ChatTabScreen() {
  const { session } = useAuth();
  const { lastNotify, unreadGroupIds, unreadLeagueIds, unreadQualificationMatchIds, markGroupRead, markLeagueRead, markQualificationMatchRead } = useChatNotify();
  const [view, setView] = useState<"lohko" | "yhteiso">("lohko");
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [allLeagues, setAllLeagues] = useState<LeagueOption[]>([]);
  const [selectedCommunityLeagueId, setSelectedCommunityLeagueId] = useState<string | null>(null);
  const [adminGroups, setAdminGroups] = useState<AdminGroup[]>([]);
  const [selectedAdminGroupId, setSelectedAdminGroupId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [showMembers, setShowMembers] = useState(false);
  const [groupMembers, setGroupMembers] = useState<TeamRosterRow[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [scrollTargetId, setScrollTargetId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const { groupId: targetGroupId } = useLocalSearchParams<{ groupId?: string }>();
  const appliedGroupParam = useRef<string | null>(null);
  const [qualificationRoundActive, setQualificationRoundActive] = useState(false);
  const [qualificationMatch, setQualificationMatch] = useState<{ matchId: string; opponentTeamId: string; opponentName: string } | null>(null);
  const [qualificationMatchByTeamId, setQualificationMatchByTeamId] = useState<Record<string, { matchId: string; opponentTeamId: string; opponentName: string }>>({});

  const loadTeams = useCallback(async () => {
    if (!supabase || !session?.user.id) return;
    const client = supabase;
    const { data: membershipData } = await client.from("team_members").select("team_id, teams(id, name, league_id, category)").eq("user_id", session.user.id).eq("status", "active");
    const memberships = (membershipData ?? []) as unknown as { teams?: { id: string; name: string; league_id: string; category: string } | { id: string; name: string; league_id: string; category: string }[] | null }[];
    const teamRows = memberships.flatMap((membership) => Array.isArray(membership.teams) ? membership.teams : membership.teams ? [membership.teams] : []);
    const leagueIds = [...new Set(teamRows.map((team) => team.league_id))];
    const teamIds = teamRows.map((team) => team.id);
    const [{ data: leagueRows }, { data: groupRows }] = await Promise.all([
      leagueIds.length ? client.from("leagues").select("id, name, status").in("id", leagueIds) : Promise.resolve({ data: [] }),
      teamIds.length ? client.from("group_teams").select("team_id, group_id") : Promise.resolve({ data: [] }),
    ]);
    const leagueMap = new Map((leagueRows ?? []).map((league) => [league.id, league]));
    const groupMap = new Map((groupRows ?? []).map((group) => [group.team_id, group]));
    const nextTeams = teamRows.map((team) => {
      const league = leagueMap.get(team.league_id);
      const group = groupMap.get(team.id);
      return { id: team.id, leagueId: team.league_id, leagueName: league?.name ?? "", leagueStatus: league?.status ?? "", category: team.category, groupId: group?.group_id };
    }).sort((left, right) => Number(right.leagueStatus === "ongoing") - Number(left.leagueStatus === "ongoing") || categoryOrder(left.category) - categoryOrder(right.category));
    setTeams(nextTeams);
    setSelectedTeamId((current) => current && nextTeams.some((team) => team.id === current) ? current : nextTeams[0]?.id ?? null);
  }, [session?.user.id]);

  useFocusEffect(useCallback(() => { void loadTeams(); }, [loadTeams]));

  useEffect(() => {
    if (!supabase || !session?.user.id) { setIsAdmin(false); return; }
    void supabase.rpc("is_admin").then(({ data }) => setIsAdmin(data === true));
  }, [session?.user.id]);

  useEffect(() => {
    if (!supabase || !isAdmin) { setAllLeagues([]); return; }
    void supabase.from("leagues").select("id, name, status").order("start_date", { ascending: false }).then(({ data }) => setAllLeagues((data ?? []) as LeagueOption[]));
  }, [isAdmin]);

  // Admins are usually not members of any team, so they'd otherwise never see a
  // "lohko" to pick. Let an admin without own teams browse every ongoing league's groups.
  useEffect(() => {
    if (!supabase || !isAdmin) { setAdminGroups([]); return; }
    const client = supabase;
    void client.from("groups").select("id, league_id, name, category, leagues(name, status)").order("name").then(({ data }) => {
      const rows = (data ?? []) as unknown as { id: string; league_id: string; name: string; category: string; leagues: { name: string; status: string } | { name: string; status: string }[] | null }[];
      const ongoingGroups = rows.map((row) => {
        const league = Array.isArray(row.leagues) ? row.leagues[0] : row.leagues;
        return { id: row.id, leagueId: row.league_id, leagueName: league?.name ?? "", name: row.name, category: row.category, leagueStatus: league?.status ?? "" };
      }).filter((row) => row.leagueStatus === "ongoing");
      setAdminGroups(ongoingGroups.map(({ id, leagueId, leagueName, name, category }) => ({ id, leagueId, leagueName, name, category })));
    });
  }, [isAdmin]);

  // A push notification for a lohko message links here with ?groupId=... so
  // the right team/lohko is selected instead of whichever loaded first.
  useEffect(() => {
    if (!targetGroupId || appliedGroupParam.current === targetGroupId) return;
    const team = teams.find((candidate) => candidate.groupId === targetGroupId);
    if (team) {
      setView("lohko");
      setSelectedTeamId(team.id);
      appliedGroupParam.current = targetGroupId;
      return;
    }
    const adminGroup = adminGroups.find((candidate) => candidate.id === targetGroupId);
    if (adminGroup) {
      setView("lohko");
      setSelectedAdminGroupId(adminGroup.id);
      appliedGroupParam.current = targetGroupId;
    }
  }, [targetGroupId, teams, adminGroups]);

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? teams[0];
  const useAdminLohko = isAdmin && teams.length === 0;
  const selectedAdminGroup = adminGroups.find((group) => group.id === selectedAdminGroupId);
  const activeGroupId = useAdminLohko ? selectedAdminGroup?.id : selectedTeam?.groupId;
  const lohkoAvailable = useAdminLohko ? !!selectedAdminGroup : selectedTeam?.leagueStatus === "ongoing" && !!selectedTeam.groupId;

  // While a qualification round is active, the old lohko chat (which may
  // already contain a blend of teams from the promotion/relegation swap -
  // see 106_regular_round_promotion_relegation.sql) is closed for everyone;
  // only the two teams actually playing each other get a chat, scoped to
  // their specific match rather than the old group.
  //
  // Both lookups below used to be plain useEffects keyed on ids that don't
  // necessarily change across a round transition (same team, same league,
  // same "ongoing" status) - so re-opening this tab after an admin started
  // or completed a qualification round could keep showing the previous
  // round's state until something unrelated forced a re-render. Refetching
  // on every focus (like loadTeams already does) keeps this current.
  const loadQualificationState = useCallback(async () => {
    if (!supabase) { setQualificationRoundActive(false); setQualificationMatchByTeamId({}); return; }
    const client = supabase;
    if (useAdminLohko || !selectedTeam || selectedTeam.leagueStatus !== "ongoing") {
      setQualificationRoundActive(false);
    } else {
      const { data } = await client.from("league_rounds").select("id").eq("league_id", selectedTeam.leagueId).eq("round_type", "qualification").eq("status", "active").maybeSingle();
      setQualificationRoundActive(Boolean(data));
    }

    const teamIds = teams.map((team) => team.id);
    if (teamIds.length === 0) { setQualificationMatchByTeamId({}); return; }
    const { data } = await client.from("matches").select("id, home_team_id, away_team_id, league_rounds!inner(round_type, status)")
      .or(`home_team_id.in.(${teamIds.join(",")}),away_team_id.in.(${teamIds.join(",")})`)
      .eq("league_rounds.round_type", "qualification").eq("league_rounds.status", "active");
    const rows = (data ?? []) as { id: string; home_team_id: string; away_team_id: string }[];
    if (!rows.length) { setQualificationMatchByTeamId({}); return; }
    const opponentIds = [...new Set(rows.flatMap((row) => [row.home_team_id, row.away_team_id]))];
    const { data: opponentTeams } = await client.from("teams").select("id, name").in("id", opponentIds);
    const nameMap = new Map((opponentTeams ?? []).map((team) => [team.id, team.name]));
    const map: Record<string, { matchId: string; opponentTeamId: string; opponentName: string }> = {};
    for (const row of rows) {
      if (teamIds.includes(row.home_team_id)) map[row.home_team_id] = { matchId: row.id, opponentTeamId: row.away_team_id, opponentName: nameMap.get(row.away_team_id) ?? "" };
      if (teamIds.includes(row.away_team_id)) map[row.away_team_id] = { matchId: row.id, opponentTeamId: row.home_team_id, opponentName: nameMap.get(row.home_team_id) ?? "" };
    }
    setQualificationMatchByTeamId(map);
  }, [useAdminLohko, selectedTeam?.leagueId, selectedTeam?.leagueStatus, teams.map((team) => team.id).join(",")]);

  useFocusEffect(useCallback(() => { void loadQualificationState(); }, [loadQualificationState]));

  useEffect(() => {
    setQualificationMatch(selectedTeam ? qualificationMatchByTeamId[selectedTeam.id] ?? null : null);
  }, [selectedTeam?.id, qualificationMatchByTeamId]);

  const useQualificationChat = !useAdminLohko && qualificationRoundActive && !!qualificationMatch;
  const qualificationClosed = !useAdminLohko && lohkoAvailable && qualificationRoundActive && !qualificationMatch;

  // With teams in both categories, the top tab and the Avoin/Mixty row below
  // it adapt to how many of those teams actually have a qualification match
  // this round: none -> normal "Lohko"; both -> "Karsinta" with the category
  // row still needed to pick between them; exactly one -> "Karsinta (X)"
  // that opens straight into that one match's chat, no picker required.
  const categoriesWithMatch = !useAdminLohko ? [...new Set(teams.filter((team) => qualificationMatchByTeamId[team.id]).map((team) => team.category))] : [];
  const bothHaveQualification = categoriesWithMatch.length >= 2;
  const singleQualificationCategory = categoriesWithMatch.length === 1 ? categoriesWithMatch[0] : null;
  const anyQualification = categoriesWithMatch.length > 0;
  const lohkoTabLabel = !anyQualification ? "Lohko" : bothHaveQualification ? "Karsinta" : `Karsinta (${categoryLabels[singleQualificationCategory!] ?? singleQualificationCategory})`;
  const showCategorySelector = !useAdminLohko && teams.length > 1 && (!anyQualification || bothHaveQualification);

  useEffect(() => {
    if (!singleQualificationCategory) return;
    const team = teams.find((candidate) => candidate.category === singleQualificationCategory);
    if (team && selectedTeamId !== team.id) setSelectedTeamId(team.id);
  }, [singleQualificationCategory, teams]);

  useEffect(() => { setShowMembers(false); setGroupMembers([]); }, [activeGroupId]);

  const openMembers = async () => {
    setShowMembers(true);
    if (!supabase || !activeGroupId) return;
    setLoadingMembers(true);
    const { data } = await supabase.rpc("get_group_members", { target_group_id: activeGroupId });
    setLoadingMembers(false);
    setGroupMembers((data ?? []) as TeamRosterRow[]);
  };

  const openQualificationOpponent = async () => {
    setShowMembers(true);
    if (!supabase || !qualificationMatch || !selectedTeam) return;
    setLoadingMembers(true);
    const { data } = await supabase.rpc("get_league_team_rosters", { target_league_id: selectedTeam.leagueId });
    setLoadingMembers(false);
    const rows = ((data ?? []) as (TeamRosterRow & { team_id: string })[]).filter((row) => row.team_id === qualificationMatch.opponentTeamId);
    setGroupMembers(rows);
  };

  // Admins can broadcast to any league, even one they don't personally play in;
  // everyone else only sees the community feed for a league they belong to.
  const communityLeagueOptions: LeagueOption[] = isAdmin
    ? allLeagues
    : Array.from(new Map(teams.map((team) => [team.leagueId, { id: team.leagueId, name: team.leagueName, status: team.leagueStatus }])).values());
  const communityLeagueId = selectedCommunityLeagueId && communityLeagueOptions.some((option) => option.id === selectedCommunityLeagueId)
    ? selectedCommunityLeagueId
    : communityLeagueOptions[0]?.id ?? null;

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

  useEffect(() => {
    setMessages([]);
    setError("");
    if (view === "lohko") {
      if (useQualificationChat && qualificationMatch) void loadQualificationMessages(qualificationMatch.matchId);
      else if (!qualificationRoundActive && lohkoAvailable && activeGroupId) void loadLohkoMessages(activeGroupId);
    } else if (communityLeagueId) {
      void loadCommunityMessages(communityLeagueId);
    }
  }, [view, lohkoAvailable, activeGroupId, communityLeagueId, qualificationRoundActive, useQualificationChat, qualificationMatch, loadLohkoMessages, loadCommunityMessages, loadQualificationMessages]);

  // A DB trigger broadcasts a ping (see ChatNotifyContext) whenever someone
  // else posts in a group/league this user belongs to - see that file for why
  // this doesn't just use postgres_changes directly. Only the currently
  // open thread needs to actually refetch; other pings just feed the unread
  // badge (useUnreadChat) via the same shared subscription.
  useEffect(() => {
    if (!lastNotify) return;
    if (view === "lohko" && useQualificationChat && qualificationMatch && lastNotify.match_id === qualificationMatch.matchId) void loadQualificationMessages(qualificationMatch.matchId);
    else if (view === "lohko" && activeGroupId && lastNotify.group_id === activeGroupId) void loadLohkoMessages(activeGroupId);
    else if (view === "yhteiso" && communityLeagueId && lastNotify.league_id === communityLeagueId) void loadCommunityMessages(communityLeagueId);
  }, [lastNotify, view, activeGroupId, communityLeagueId, useQualificationChat, qualificationMatch, loadLohkoMessages, loadCommunityMessages, loadQualificationMessages]);

  // Admins browsing a lohko they aren't a team member of can only read — the
  // group_messages insert policy requires actual team membership in the group.
  const canCompose = view === "lohko" ? (useQualificationChat || (lohkoAvailable && !useAdminLohko && !qualificationRoundActive)) : isAdmin;

  const sendMessage = async () => {
    const value = draft.trim();
    const maxLength = view === "lohko" ? 1000 : 2000;
    if (!value) { setError("Kirjoita viesti ennen lähettämistä."); return; }
    if (value.length > maxLength) { setError(`Viestin enimmäispituus on ${maxLength} merkkiä.`); return; }
    if (!supabase || !session?.user.id) return;
    const insertResult = view === "lohko"
      ? (useQualificationChat && qualificationMatch
          ? await supabase.from("qualification_messages").insert({ match_id: qualificationMatch.matchId, user_id: session.user.id, message: value })
          : activeGroupId ? await supabase.from("group_messages").insert({ group_id: activeGroupId, user_id: session.user.id, message: value }) : null)
      : (communityLeagueId ? await supabase.from("community_messages").insert({ league_id: communityLeagueId, user_id: session.user.id, message: value }) : null);
    if (!insertResult) { setError("Valitse ensin liiga, johon viesti lähetetään."); return; }
    if (insertResult.error) { setError("Viestin lähetys epäonnistui. Yritä uudelleen."); return; }
    // The DB trigger that pings other members skips the sender, so refetch
    // directly here instead of waiting on a notify event that won't arrive.
    if (view === "lohko" && useQualificationChat && qualificationMatch) await loadQualificationMessages(qualificationMatch.matchId);
    else if (view === "lohko" && activeGroupId) await loadLohkoMessages(activeGroupId);
    else if (view === "yhteiso" && communityLeagueId) await loadCommunityMessages(communityLeagueId);
    // The unread-scroll logic above never targets the sender's own message,
    // so explicitly reveal it now that it's been appended.
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    setDraft(""); setError("");
  };

  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScreenHeader />
    <View style={styles.segmentRow}>
      <Pressable onPress={() => setView("lohko")} style={[styles.segment, view === "lohko" && styles.segmentActive]}><Text style={[styles.segmentText, view === "lohko" && styles.segmentTextActive]}>{lohkoTabLabel}</Text>{unreadGroupIds.size > 0 || unreadQualificationMatchIds.size > 0 ? <View style={styles.segmentDot} /> : null}</Pressable>
      <Pressable onPress={() => setView("yhteiso")} style={[styles.segment, view === "yhteiso" && styles.segmentActive]}><Text style={[styles.segmentText, view === "yhteiso" && styles.segmentTextActive]}>Tiedotteet</Text>{unreadLeagueIds.size > 0 ? <View style={styles.segmentDot} /> : null}</Pressable>
    </View>
    {view === "lohko" && showCategorySelector ? <View style={styles.lohkoTopRow}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorScrollInline} contentContainerStyle={styles.selector}>
        {teams.map((team) => <Pressable key={team.id} onPress={() => setSelectedTeamId(team.id)} style={[styles.selectorButton, selectedTeam?.id === team.id && styles.selectorSelected]}>
          <Text numberOfLines={1} style={[styles.selectorText, selectedTeam?.id === team.id && styles.selectorTextSelected]}>{categoryLabels[team.category] ?? team.category}</Text>
          {(team.groupId && unreadGroupIds.has(team.groupId)) || (qualificationMatchByTeamId[team.id] && unreadQualificationMatchIds.has(qualificationMatchByTeamId[team.id].matchId)) ? <View style={styles.selectorDot} /> : null}
        </Pressable>)}
      </ScrollView>
      {useQualificationChat && qualificationMatch ? <Pressable onPress={() => void openQualificationOpponent()} style={styles.membersInlineButton}>
        <Text style={styles.membersRowText} numberOfLines={1}>vs {qualificationMatch.opponentName}</Text>
      </Pressable> : lohkoAvailable && !qualificationRoundActive ? <Pressable onPress={() => void openMembers()} style={styles.membersInlineButton}>
        <Text style={styles.membersRowText}>Lohkon jäsenet</Text>
      </Pressable> : null}
    </View> : null}
    {view === "lohko" && useAdminLohko && selectedAdminGroup ? <Pressable onPress={() => setSelectedAdminGroupId(null)} style={styles.backRow}>
      <Text style={styles.backText}>‹ Kaikki lohkot</Text>
    </Pressable> : null}
    {view === "lohko" && !showCategorySelector && useQualificationChat && qualificationMatch ? <Pressable onPress={() => void openQualificationOpponent()} style={styles.membersRow}>
      <Text style={styles.membersRowText} numberOfLines={1}>vs {qualificationMatch.opponentName}</Text>
    </Pressable> : view === "lohko" && !showCategorySelector && lohkoAvailable && !qualificationRoundActive ? <Pressable onPress={() => void openMembers()} style={styles.membersRow}>
      <Text style={styles.membersRowText}>Lohkon jäsenet</Text>
    </Pressable> : null}
    {view === "yhteiso" && communityLeagueOptions.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorScroll} contentContainerStyle={styles.selector}>
      {communityLeagueOptions.map((league) => <Pressable key={league.id} onPress={() => setSelectedCommunityLeagueId(league.id)} style={[styles.selectorButton, communityLeagueId === league.id && styles.selectorSelected]}>
        <Text numberOfLines={1} style={[styles.selectorText, communityLeagueId === league.id && styles.selectorTextSelected]}>{league.name}</Text>
        {unreadLeagueIds.has(league.id) ? <View style={styles.selectorDot} /> : null}
      </Pressable>)}
    </ScrollView> : null}

    {view === "lohko" && useAdminLohko && !selectedAdminGroup ? (
      adminGroups.length === 0
        ? <View style={styles.emptyState}><Text style={styles.emptyText}>Ei käynnissä olevia lohkoja.</Text></View>
        : <ScrollView contentContainerStyle={styles.groupList} showsVerticalScrollIndicator={false}>
          {adminGroups.map((group) => <Pressable key={group.id} onPress={() => setSelectedAdminGroupId(group.id)} style={styles.groupListItem}>
            <Text numberOfLines={1} style={styles.groupListText}>{group.name} · {categoryLabels[group.category] ?? group.category}</Text>
            <Text style={styles.groupListArrow}>›</Text>
          </Pressable>)}
        </ScrollView>
    ) : view === "lohko" && !lohkoAvailable && !useQualificationChat ? <View style={styles.emptyState}><Text style={styles.emptyText}>Lohkochat aukeaa liigan alkaessa ja lohkojen muodostamisen jälkeen.</Text></View>
      : view === "lohko" && qualificationClosed ? <View style={styles.emptyState}><Text style={styles.emptyText}>Karsintakierros käynnissä. Lohkochat aukeaa seuraavalla kierroksella.</Text></View>
      : view === "yhteiso" && !communityLeagueId ? <View style={styles.emptyState}><Text style={styles.emptyText}>{isAdmin ? "Liigoja ei löytynyt." : "Liity liigaan nähdäksesi tiedotteet."}</Text></View>
      : <ScrollView ref={scrollRef} contentContainerStyle={styles.messages} showsVerticalScrollIndicator={false}>
        {view === "yhteiso" && !isAdmin ? <Text style={styles.readOnlyNote}>Vain ylläpito voi lähettää tiedotteita.</Text> : null}
        {view === "lohko" && useAdminLohko ? <Text style={styles.readOnlyNote}>Ylläpito näkee lohkon viestit, mutta ei ole sen jäsen.</Text> : null}
        {messages.map((message) => <View key={message.id} style={[styles.message, message.own && styles.ownMessage]} onLayout={(event) => {
          if (scrollTargetId !== message.id) return;
          scrollRef.current?.scrollTo({ y: Math.max(0, event.nativeEvent.layout.y - 12), animated: false });
          setScrollTargetId(null);
        }}>
          <Text style={styles.sender}>{message.name} <Text style={styles.team}>· {message.sub}</Text></Text>
          <Text style={styles.body}>{message.body}<Text style={styles.time}>  {message.time}</Text></Text>
        </View>)}
      </ScrollView>}

    {canCompose ? <View style={styles.composer}>
      <View style={styles.inputWrap}>
        <TextInput value={draft} onChangeText={setDraft} placeholder="Kirjoita viesti..." placeholderTextColor="#8A978F" multiline maxLength={view === "lohko" ? 1000 : 2000} style={styles.input} />
        <Text style={styles.counter}>{draft.length}/{view === "lohko" ? 1000 : 2000}</Text>
      </View>
      <Pressable onPress={sendMessage} style={styles.send}><Text style={styles.sendIcon}>↑</Text></Pressable>
    </View> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <Modal visible={showMembers} transparent animationType="fade" onRequestClose={() => setShowMembers(false)}>
      <Pressable style={styles.membersBackdrop} onPress={() => setShowMembers(false)}>
        <Pressable style={styles.membersModal} onPress={(event) => event.stopPropagation()}>
          <View style={styles.membersHeader}>
            <Text style={styles.membersTitle}>{useQualificationChat ? "Vastustajan pelaajat" : "Lohkon joukkueet"}</Text>
            <Pressable onPress={() => setShowMembers(false)} accessibilityRole="button" accessibilityLabel="Sulje"><Text style={styles.membersClose}>×</Text></Pressable>
          </View>
          {loadingMembers ? <ActivityIndicator color={colors.green} style={styles.membersLoading} /> : <ScrollView showsVerticalScrollIndicator={false}>
            <TeamRosterList teams={groupRosterByTeam(groupMembers)} />
          </ScrollView>}
        </Pressable>
      </Pressable>
    </Modal>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  segmentRow: { flexDirection: "row", gap: 8, paddingHorizontal: 22, paddingTop: 27 },
  segment: { flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  segmentActive: { backgroundColor: colors.green, borderColor: colors.green },
  segmentText: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  segmentTextActive: { color: colors.lime },
  segmentDot: { position: "absolute", top: 6, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.coral, borderWidth: 1.5, borderColor: colors.surface },
  selectorScroll: { flexGrow: 0, flexShrink: 0, height: 62 },
  lohkoTopRow: { flexDirection: "row", alignItems: "center", paddingRight: 18 },
  selectorScrollInline: { flex: 1, height: 62 },
  membersInlineButton: { paddingHorizontal: 4 },
  selector: { paddingHorizontal: 18, gap: 8, paddingTop: 12, alignItems: "center" },
  selectorButton: { minHeight: 38, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, justifyContent: "center" },
  selectorSelected: { backgroundColor: colors.green, borderColor: colors.green },
  selectorText: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  selectorTextSelected: { color: colors.lime },
  selectorDot: { position: "absolute", top: 4, right: 4, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.coral, borderWidth: 1.5, borderColor: colors.surface },
  emptyState: { margin: 18, backgroundColor: colors.mint, borderRadius: 14, padding: 18 },
  emptyText: { color: colors.green, fontSize: 13, lineHeight: 19, fontWeight: "700" },
  backRow: { paddingHorizontal: 18, paddingTop: 14 },
  backText: { color: colors.greenBright, fontWeight: "800" },
  membersRow: { alignSelf: "flex-end", paddingHorizontal: 18, paddingTop: 10, paddingBottom: 8 },
  membersRowText: { color: colors.greenBright, fontWeight: "800", fontSize: 12 },
  membersBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 24 },
  membersModal: { backgroundColor: colors.surface, borderRadius: 18, padding: 20, width: "100%", maxWidth: 460, maxHeight: "75%" },
  membersHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  membersTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  membersClose: { color: colors.muted, fontSize: 26, lineHeight: 26, fontWeight: "600" },
  membersLoading: { marginTop: 20 },
  groupList: { padding: 18, gap: 10 },
  groupListItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 16 },
  groupListText: { color: colors.ink, fontSize: 14, fontWeight: "800", flex: 1 },
  groupListArrow: { color: colors.green, fontSize: 20, fontWeight: "800" },
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
  input: { color: colors.ink, fontSize: 14, maxHeight: 90, paddingTop: 13, paddingBottom: 4 },
  counter: { color: colors.muted, fontSize: 9, textAlign: "right", paddingBottom: 5 },
  send: { width: 46, height: 46, borderRadius: 15, backgroundColor: colors.coral, justifyContent: "center", alignItems: "center" },
  sendIcon: { color: colors.surface, fontSize: 25, fontWeight: "800", marginTop: -3 },
  error: { color: colors.coral, backgroundColor: colors.surface, paddingHorizontal: 15, paddingBottom: 9, fontSize: 12 },
});

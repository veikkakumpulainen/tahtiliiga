import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import ScreenHeader from "../../components/ScreenHeader";
import TeamRosterList, { groupRosterByTeam, type TeamRosterRow } from "../../components/TeamRosterList";
import { useChatNotify } from "../../context/ChatNotifyContext";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabase";
import { colors, shadow } from "../../theme";

type Team = { id: string; leagueId: string; leagueName: string; leagueStatus: string; category: string; groupId?: string };
const categoryLabels: Record<string, string> = { avoin: "Avoin", mixty: "Mixty" };
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
  const { lastNotify, unreadGroupIds, unreadLeagueIds, markGroupRead, markLeagueRead } = useChatNotify();
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
    }).sort((left, right) => Number(right.leagueStatus === "ongoing") - Number(left.leagueStatus === "ongoing"));
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

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? teams[0];
  const useAdminLohko = isAdmin && teams.length === 0;
  const selectedAdminGroup = adminGroups.find((group) => group.id === selectedAdminGroupId);
  const activeGroupId = useAdminLohko ? selectedAdminGroup?.id : selectedTeam?.groupId;
  const lohkoAvailable = useAdminLohko ? !!selectedAdminGroup : selectedTeam?.leagueStatus === "ongoing" && !!selectedTeam.groupId;

  useEffect(() => { setShowMembers(false); setGroupMembers([]); }, [activeGroupId]);

  const openMembers = async () => {
    setShowMembers(true);
    if (!supabase || !activeGroupId) return;
    setLoadingMembers(true);
    const { data } = await supabase.rpc("get_group_members", { target_group_id: activeGroupId });
    setLoadingMembers(false);
    setGroupMembers((data ?? []) as TeamRosterRow[]);
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
    const { data } = await supabase.rpc("get_group_messages", { target_group_id: groupId });
    const rows = (data ?? []) as unknown as GroupMessageRow[];
    setMessages(rows.sort((a, b) => a.created_at.localeCompare(b.created_at)).map((item) => toMessage(item.id, item.user_id === session?.user.id ? "Sinä" : `${item.sender_first_name} ${item.sender_last_name}`, item.team_name, item.message, item.created_at, item.user_id === session?.user.id)));
    markGroupRead(groupId);
  }, [session?.user.id, markGroupRead]);

  const loadCommunityMessages = useCallback(async (leagueId: string) => {
    if (!supabase || !session?.user.id) return;
    const { data } = await supabase.rpc("get_community_messages", { target_league_id: leagueId });
    const rows = (data ?? []) as unknown as CommunityMessageRow[];
    setMessages(rows.map((item) => toMessage(item.id, `${item.sender_first_name} ${item.sender_last_name}`, "Ylläpito", item.message, item.created_at, item.user_id === session?.user.id)));
    markLeagueRead(leagueId);
  }, [session?.user.id, markLeagueRead]);

  useEffect(() => {
    setMessages([]);
    setError("");
    if (view === "lohko") {
      if (lohkoAvailable && activeGroupId) void loadLohkoMessages(activeGroupId);
    } else if (communityLeagueId) {
      void loadCommunityMessages(communityLeagueId);
    }
  }, [view, lohkoAvailable, activeGroupId, communityLeagueId, loadLohkoMessages, loadCommunityMessages]);

  // A DB trigger broadcasts a ping (see ChatNotifyContext) whenever someone
  // else posts in a group/league this user belongs to - see that file for why
  // this doesn't just use postgres_changes directly. Only the currently
  // open thread needs to actually refetch; other pings just feed the unread
  // badge (useUnreadChat) via the same shared subscription.
  useEffect(() => {
    if (!lastNotify) return;
    if (view === "lohko" && activeGroupId && lastNotify.group_id === activeGroupId) void loadLohkoMessages(activeGroupId);
    else if (view === "yhteiso" && communityLeagueId && lastNotify.league_id === communityLeagueId) void loadCommunityMessages(communityLeagueId);
  }, [lastNotify, view, activeGroupId, communityLeagueId, loadLohkoMessages, loadCommunityMessages]);

  // Admins browsing a lohko they aren't a team member of can only read — the
  // group_messages insert policy requires actual team membership in the group.
  const canCompose = view === "lohko" ? lohkoAvailable && !useAdminLohko : isAdmin;

  const sendMessage = async () => {
    const value = draft.trim();
    const maxLength = view === "lohko" ? 1000 : 2000;
    if (!value) { setError("Kirjoita viesti ennen lähettämistä."); return; }
    if (value.length > maxLength) { setError(`Viestin enimmäispituus on ${maxLength} merkkiä.`); return; }
    if (!supabase || !session?.user.id) return;
    const insertResult = view === "lohko"
      ? (activeGroupId ? await supabase.from("group_messages").insert({ group_id: activeGroupId, user_id: session.user.id, message: value }) : null)
      : (communityLeagueId ? await supabase.from("community_messages").insert({ league_id: communityLeagueId, user_id: session.user.id, message: value }) : null);
    if (!insertResult) { setError("Valitse ensin liiga, johon viesti lähetetään."); return; }
    if (insertResult.error) { setError("Viestin lähetys epäonnistui. Yritä uudelleen."); return; }
    // The DB trigger that pings other members skips the sender, so refetch
    // directly here instead of waiting on a notify event that won't arrive.
    if (view === "lohko" && activeGroupId) void loadLohkoMessages(activeGroupId);
    else if (view === "yhteiso" && communityLeagueId) void loadCommunityMessages(communityLeagueId);
    setDraft(""); setError("");
  };

  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScreenHeader />
    <View style={styles.segmentRow}>
      <Pressable onPress={() => setView("lohko")} style={[styles.segment, view === "lohko" && styles.segmentActive]}><Text style={[styles.segmentText, view === "lohko" && styles.segmentTextActive]}>Lohko</Text>{unreadGroupIds.size > 0 ? <View style={styles.segmentDot} /> : null}</Pressable>
      <Pressable onPress={() => setView("yhteiso")} style={[styles.segment, view === "yhteiso" && styles.segmentActive]}><Text style={[styles.segmentText, view === "yhteiso" && styles.segmentTextActive]}>Tiedotteet</Text>{unreadLeagueIds.size > 0 ? <View style={styles.segmentDot} /> : null}</Pressable>
    </View>
    {view === "lohko" && !useAdminLohko && teams.length > 1 ? <View style={styles.lohkoTopRow}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorScrollInline} contentContainerStyle={styles.selector}>
        {teams.map((team) => <Pressable key={team.id} onPress={() => setSelectedTeamId(team.id)} style={[styles.selectorButton, selectedTeam?.id === team.id && styles.selectorSelected]}>
          <Text numberOfLines={1} style={[styles.selectorText, selectedTeam?.id === team.id && styles.selectorTextSelected]}>{categoryLabels[team.category] ?? team.category}</Text>
          {team.groupId && unreadGroupIds.has(team.groupId) ? <View style={styles.selectorDot} /> : null}
        </Pressable>)}
      </ScrollView>
      {lohkoAvailable ? <Pressable onPress={() => void openMembers()} style={styles.membersInlineButton}>
        <Text style={styles.membersRowText}>Lohkon jäsenet</Text>
      </Pressable> : null}
    </View> : null}
    {view === "lohko" && useAdminLohko && selectedAdminGroup ? <Pressable onPress={() => setSelectedAdminGroupId(null)} style={styles.backRow}>
      <Text style={styles.backText}>‹ Kaikki lohkot</Text>
    </Pressable> : null}
    {view === "lohko" && lohkoAvailable && !(!useAdminLohko && teams.length > 1) ? <Pressable onPress={() => void openMembers()} style={styles.membersRow}>
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
    ) : view === "lohko" && !lohkoAvailable ? <View style={styles.emptyState}><Text style={styles.emptyText}>Lohkochat aukeaa liigan alkaessa ja lohkojen muodostamisen jälkeen.</Text></View>
      : view === "yhteiso" && !communityLeagueId ? <View style={styles.emptyState}><Text style={styles.emptyText}>{isAdmin ? "Liigoja ei löytynyt." : "Liity liigaan nähdäksesi tiedotteet."}</Text></View>
      : <ScrollView contentContainerStyle={styles.messages} showsVerticalScrollIndicator={false}>
        {view === "yhteiso" && !isAdmin ? <Text style={styles.readOnlyNote}>Vain ylläpito voi lähettää tiedotteita.</Text> : null}
        {view === "lohko" && useAdminLohko ? <Text style={styles.readOnlyNote}>Ylläpito näkee lohkon viestit, mutta ei ole sen jäsen.</Text> : null}
        {messages.map((message) => <View key={message.id} style={[styles.message, message.own && styles.ownMessage]}>
          <Text style={styles.sender}>{message.name} <Text style={styles.team}>· {message.sub}</Text></Text>
          <Text style={styles.body}>{message.body}</Text>
          <Text style={styles.time}>{message.time}</Text>
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
            <Text style={styles.membersTitle}>Lohkon joukkueet</Text>
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
  segmentText: { color: colors.ink, fontSize: 13, fontWeight: "800" },
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
  membersRow: { alignSelf: "flex-end", paddingHorizontal: 18, paddingTop: 10 },
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
  time: { color: colors.muted, fontSize: 10, textAlign: "right", marginTop: 8 },
  composer: { flexDirection: "row", padding: 12, paddingBottom: Platform.OS === "ios" ? 22 : 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line, alignItems: "flex-end", gap: 9 },
  inputWrap: { flex: 1, minHeight: 46, borderRadius: 15, backgroundColor: colors.canvas, paddingLeft: 14, paddingRight: 8 },
  input: { color: colors.ink, fontSize: 14, maxHeight: 90, paddingTop: 13, paddingBottom: 4 },
  counter: { color: colors.muted, fontSize: 9, textAlign: "right", paddingBottom: 5 },
  send: { width: 46, height: 46, borderRadius: 15, backgroundColor: colors.coral, justifyContent: "center", alignItems: "center" },
  sendIcon: { color: colors.surface, fontSize: 25, fontWeight: "800", marginTop: -3 },
  error: { color: colors.coral, backgroundColor: colors.surface, paddingHorizontal: 15, paddingBottom: 9, fontSize: 12 },
});

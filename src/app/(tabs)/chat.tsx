import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import ScreenHeader from "../../components/ScreenHeader";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabase";
import { colors, shadow } from "../../theme";

type Team = { id: string; leagueId: string; leagueName: string; leagueStatus: string; category: string; groupId?: string };
const categoryLabels: Record<string, string> = { avoin: "Avoin", mixty: "Mixty" };
type LeagueOption = { id: string; name: string; status: string };
type Message = { id: string; name: string; sub: string; body: string; time: string; own: boolean };
type GroupMessageRow = { id: string; message: string; created_at: string; user_id: string; sender_first_name: string; team_name: string };
type CommunityMessageRow = { id: string; message: string; created_at: string; user_id: string; sender_first_name: string; sender_last_name: string };

function toMessage(id: string, name: string, sub: string, body: string, createdAt: string, own: boolean): Message {
  return { id, name, sub, body, time: new Date(createdAt).toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit" }), own };
}

export default function ChatTabScreen() {
  const { session } = useAuth();
  const [view, setView] = useState<"lohko" | "yhteiso">("lohko");
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [allLeagues, setAllLeagues] = useState<LeagueOption[]>([]);
  const [selectedCommunityLeagueId, setSelectedCommunityLeagueId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

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

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? teams[0];
  const lohkoAvailable = selectedTeam?.leagueStatus === "ongoing" && !!selectedTeam.groupId;

  // Admins can broadcast to any league, even one they don't personally play in;
  // everyone else only sees the community feed for a league they belong to.
  const communityLeagueOptions: LeagueOption[] = isAdmin
    ? allLeagues
    : Array.from(new Map(teams.map((team) => [team.leagueId, { id: team.leagueId, name: team.leagueName, status: team.leagueStatus }])).values());
  const communityLeagueId = selectedCommunityLeagueId && communityLeagueOptions.some((option) => option.id === selectedCommunityLeagueId)
    ? selectedCommunityLeagueId
    : communityLeagueOptions[0]?.id ?? null;

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    setMessages([]);
    setError("");

    if (view === "lohko") {
      if (!lohkoAvailable || !selectedTeam?.groupId) return;
      const groupId = selectedTeam.groupId;
      void client.rpc("get_group_messages", { target_group_id: groupId }).then(({ data }) => {
        const rows = (data ?? []) as unknown as GroupMessageRow[];
        setMessages(rows.sort((a, b) => a.created_at.localeCompare(b.created_at)).map((item) => toMessage(item.id, item.user_id === session?.user.id ? "Sinä" : item.sender_first_name, item.team_name, item.message, item.created_at, item.user_id === session?.user.id)));
      });
      const channel = client.channel(`group-${groupId}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "group_messages", filter: `group_id=eq.${groupId}` }, (payload) => {
        const item = payload.new as { id: string };
        void client.rpc("get_group_messages", { target_group_id: groupId }).then(({ data }) => {
          const rows = (data ?? []) as unknown as GroupMessageRow[];
          const fresh = rows.find((row) => row.id === item.id);
          if (fresh) setMessages((current) => current.some((row) => row.id === fresh.id) ? current : [...current, toMessage(fresh.id, fresh.user_id === session?.user.id ? "Sinä" : fresh.sender_first_name, fresh.team_name, fresh.message, fresh.created_at, fresh.user_id === session?.user.id)]);
        });
      }).subscribe();
      return () => { void client.removeChannel(channel); };
    }

    if (!communityLeagueId) return;
    const leagueId = communityLeagueId;
    void client.rpc("get_community_messages", { target_league_id: leagueId }).then(({ data }) => {
      const rows = (data ?? []) as unknown as CommunityMessageRow[];
      setMessages(rows.map((item) => toMessage(item.id, `${item.sender_first_name} ${item.sender_last_name}`, "Ylläpito", item.message, item.created_at, item.user_id === session?.user.id)));
    });
    const channel = client.channel(`community-${leagueId}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "community_messages", filter: `league_id=eq.${leagueId}` }, (payload) => {
      const item = payload.new as { id: string };
      void client.rpc("get_community_messages", { target_league_id: leagueId }).then(({ data }) => {
        const rows = (data ?? []) as unknown as CommunityMessageRow[];
        const fresh = rows.find((row) => row.id === item.id);
        if (fresh) setMessages((current) => current.some((row) => row.id === fresh.id) ? current : [...current, toMessage(fresh.id, `${fresh.sender_first_name} ${fresh.sender_last_name}`, "Ylläpito", fresh.message, fresh.created_at, fresh.user_id === session?.user.id)]);
      });
    }).subscribe();
    return () => { void client.removeChannel(channel); };
  }, [view, lohkoAvailable, selectedTeam?.groupId, communityLeagueId, session?.user.id]);

  const canCompose = view === "lohko" ? lohkoAvailable : isAdmin;

  const sendMessage = async () => {
    const value = draft.trim();
    const maxLength = view === "lohko" ? 1000 : 2000;
    if (!value) { setError("Kirjoita viesti ennen lähettämistä."); return; }
    if (value.length > maxLength) { setError(`Viestin enimmäispituus on ${maxLength} merkkiä.`); return; }
    if (!supabase || !session?.user.id) return;
    const insertResult = view === "lohko"
      ? (selectedTeam?.groupId ? await supabase.from("group_messages").insert({ group_id: selectedTeam.groupId, user_id: session.user.id, message: value }) : null)
      : (communityLeagueId ? await supabase.from("community_messages").insert({ league_id: communityLeagueId, user_id: session.user.id, message: value }) : null);
    if (!insertResult) { setError("Valitse ensin liiga, johon viesti lähetetään."); return; }
    if (insertResult.error) { setError("Viestin lähetys epäonnistui. Yritä uudelleen."); return; }
    setDraft(""); setError("");
  };

  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScreenHeader />
    <View style={styles.segmentRow}>
      <Pressable onPress={() => setView("lohko")} style={[styles.segment, view === "lohko" && styles.segmentActive]}><Text style={[styles.segmentText, view === "lohko" && styles.segmentTextActive]}>Lohko</Text></Pressable>
      <Pressable onPress={() => setView("yhteiso")} style={[styles.segment, view === "yhteiso" && styles.segmentActive]}><Text style={[styles.segmentText, view === "yhteiso" && styles.segmentTextActive]}>Yhteisö</Text></Pressable>
    </View>
    {view === "lohko" && teams.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorScroll} contentContainerStyle={styles.selector}>
      {teams.map((team) => <Pressable key={team.id} onPress={() => setSelectedTeamId(team.id)} style={[styles.selectorButton, selectedTeam?.id === team.id && styles.selectorSelected]}>
        <Text numberOfLines={1} style={[styles.selectorText, selectedTeam?.id === team.id && styles.selectorTextSelected]}>{categoryLabels[team.category] ?? team.category}</Text>
      </Pressable>)}
    </ScrollView> : null}
    {view === "yhteiso" && communityLeagueOptions.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorScroll} contentContainerStyle={styles.selector}>
      {communityLeagueOptions.map((league) => <Pressable key={league.id} onPress={() => setSelectedCommunityLeagueId(league.id)} style={[styles.selectorButton, communityLeagueId === league.id && styles.selectorSelected]}>
        <Text numberOfLines={1} style={[styles.selectorText, communityLeagueId === league.id && styles.selectorTextSelected]}>{league.name}</Text>
      </Pressable>)}
    </ScrollView> : null}

    {view === "lohko" && !lohkoAvailable ? <View style={styles.emptyState}><Text style={styles.emptyText}>Lohkochat aukeaa liigan alkaessa ja lohkojen muodostamisen jälkeen.</Text></View>
      : view === "yhteiso" && !communityLeagueId ? <View style={styles.emptyState}><Text style={styles.emptyText}>{isAdmin ? "Liigoja ei löytynyt." : "Liity liigaan nähdäksesi yhteisön viestit."}</Text></View>
      : <ScrollView contentContainerStyle={styles.messages} showsVerticalScrollIndicator={false}>
        {view === "yhteiso" && !isAdmin ? <Text style={styles.readOnlyNote}>Vain ylläpito voi lähettää viestejä yhteisöön.</Text> : null}
        {messages.map((message) => <View key={message.id} style={[styles.message, message.own && styles.ownMessage]}>
          <Text style={[styles.sender, message.own && styles.ownSender]}>{message.name} <Text style={styles.team}>· {message.sub}</Text></Text>
          <Text style={[styles.body, message.own && styles.ownBody]}>{message.body}</Text>
          <Text style={[styles.time, message.own && styles.ownTime]}>{message.time}</Text>
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
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  segmentRow: { flexDirection: "row", gap: 8, paddingHorizontal: 18, paddingTop: 16 },
  segment: { flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  segmentActive: { backgroundColor: colors.green, borderColor: colors.green },
  segmentText: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  segmentTextActive: { color: colors.lime },
  selectorScroll: { flexGrow: 0, flexShrink: 0, height: 62 },
  selector: { paddingHorizontal: 18, gap: 8, paddingTop: 12, alignItems: "center" },
  selectorButton: { minHeight: 38, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, justifyContent: "center" },
  selectorSelected: { backgroundColor: colors.green, borderColor: colors.green },
  selectorText: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  selectorTextSelected: { color: colors.lime },
  emptyState: { margin: 18, backgroundColor: colors.mint, borderRadius: 14, padding: 18 },
  emptyText: { color: colors.green, fontSize: 13, lineHeight: 19, fontWeight: "700" },
  readOnlyNote: { color: colors.muted, fontSize: 11, fontWeight: "700", textAlign: "center", marginBottom: 4 },
  messages: { padding: 18, gap: 14, paddingBottom: 24 },
  message: { backgroundColor: colors.surface, borderRadius: 17, borderTopLeftRadius: 4, padding: 14, maxWidth: "84%", alignSelf: "flex-start", ...shadow },
  ownMessage: { backgroundColor: colors.green, borderTopLeftRadius: 17, borderTopRightRadius: 4, alignSelf: "flex-end" },
  sender: { color: colors.ink, fontSize: 11, fontWeight: "900", marginBottom: 7 },
  ownSender: { color: colors.lime },
  team: { color: colors.greenBright, fontWeight: "700" },
  body: { color: colors.ink, fontSize: 15, lineHeight: 21 },
  ownBody: { color: colors.lime },
  time: { color: colors.muted, fontSize: 10, textAlign: "right", marginTop: 8 },
  ownTime: { color: colors.lime },
  composer: { flexDirection: "row", padding: 12, paddingBottom: Platform.OS === "ios" ? 22 : 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line, alignItems: "flex-end", gap: 9 },
  inputWrap: { flex: 1, minHeight: 46, borderRadius: 15, backgroundColor: colors.canvas, paddingLeft: 14, paddingRight: 8 },
  input: { color: colors.ink, fontSize: 14, maxHeight: 90, paddingTop: 13, paddingBottom: 4 },
  counter: { color: colors.muted, fontSize: 9, textAlign: "right", paddingBottom: 5 },
  send: { width: 46, height: 46, borderRadius: 15, backgroundColor: colors.coral, justifyContent: "center", alignItems: "center" },
  sendIcon: { color: colors.surface, fontSize: 25, fontWeight: "800", marginTop: -3 },
  error: { color: colors.coral, backgroundColor: colors.surface, paddingHorizontal: 15, paddingBottom: 9, fontSize: 12 },
});

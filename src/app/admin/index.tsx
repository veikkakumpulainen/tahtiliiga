import { Redirect, router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import ScreenHeader from "../../components/ScreenHeader";
import { useAuth } from "../../hooks/useAuth";
import { useAppScreenRestriction } from "../../hooks/useAppScreenRestriction";
import { supabase } from "../../lib/supabase";
import { colors, shadow } from "../../theme";

type League = { id: string; name: string; status: string; start_date: string; registration_deadline: string | null; cities?: { name: string } | { name: string }[] | null };
const cityNameOf = (league: League) => (Array.isArray(league.cities) ? league.cities[0] : league.cities)?.name ?? "";
type Team = { id: string; name: string; skill_level: string; captain_id: string };
type Group = { id: string; name: string; status: string };
type GroupTeam = { id: string; group_id: string; team_id: string };
type Match = { id: string; home: string; away: string; status: string; home_score: number | null; away_score: number | null };

export default function AdminScreen() {
  useAppScreenRestriction();
  const { session, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupTeams, setGroupTeams] = useState<GroupTeam[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [deadline, setDeadline] = useState("");
  const [groupName, setGroupName] = useState("");
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const loadLeagues = async () => { if (!supabase) return; const { data } = await supabase.from("leagues").select("id, name, status, start_date, registration_deadline, cities(name)").order("start_date", { ascending: false }); setLeagues((data ?? []) as League[]); };
  const loadLeagueData = async (league: League) => {
    if (!supabase) return;
    const client = supabase;
    const [{ data: teamData }, { data: groupData, error: groupError }] = await Promise.all([
      client.from("teams").select("id, name, skill_level, captain_id").eq("league_id", league.id),
      client.from("groups").select("id, name, status").eq("league_id", league.id),
    ]);
    const groupIds = (groupData ?? []).map((group) => group.id);
    const [{ data: matchData, error: matchError }, { data: assignmentData }] = await Promise.all([
      client.from("matches").select("id, home_team_id, away_team_id, status, home_score, away_score").eq("league_id", league.id),
      groupIds.length > 0 ? client.from("group_teams").select("id, group_id, team_id").in("group_id", groupIds) : Promise.resolve({ data: [], error: null }),
    ]);
    setTeams(teamData ?? []); setGroups(groupData ?? []); setGroupTeams(assignmentData ?? []);
    const teamNames = new Map((teamData ?? []).map((team) => [team.id, team.name]));
    setMatches(((matchData ?? []) as { id: string; home_team_id: string; away_team_id: string; status: string; home_score: number | null; away_score: number | null }[]).map((match) => ({ id: match.id, status: match.status, home_score: match.home_score, away_score: match.away_score, home: teamNames.get(match.home_team_id) ?? "Kotijoukkue", away: teamNames.get(match.away_team_id) ?? "Vierasjoukkue" })));
    if (groupError) setMessage(`Lohkojen lataus epäonnistui: ${groupError.message}`);
    if (matchError) setMessage(`Otteluiden lataus epäonnistui: ${matchError.message}`);
  };
  useEffect(() => { if (!supabase || !session?.user.id) return; void supabase.rpc("is_admin").then(({ data }) => setIsAdmin(data === true)); void loadLeagues(); }, [session?.user.id]);
  useEffect(() => { if (selectedLeague) void loadLeagueData(selectedLeague); }, [selectedLeague?.id]);
  if (authLoading) return <View style={styles.loading}><ActivityIndicator color={colors.lime} /></View>;
  if (!session) return <Redirect href="/(auth)/login" />;
  if (isAdmin === null) return <View style={styles.loading}><ActivityIndicator color={colors.lime} /></View>;
  if (!isAdmin) return <Redirect href="/" />;

  const resetForm = () => { setName(""); setStartDate(""); setDeadline(""); setEditing(false); setMessage(""); };
  const saveLeague = async () => { if (!supabase || !session?.user.id || !name.trim() || !startDate.trim()) { setMessage("Anna liigan nimi ja aloituspäivä."); return; } setBusy(true); const values = { name: name.trim(), start_date: startDate.trim(), registration_deadline: deadline.trim() || null }; const result = editing && selectedLeague ? await supabase.from("leagues").update(values).eq("id", selectedLeague.id) : await supabase.from("leagues").insert({ ...values, created_by: session.user.id, status: "registration_open" }); setBusy(false); if (result.error) { setMessage(`Liigan tallennus epäonnistui: ${result.error.message}`); return; } resetForm(); await loadLeagues(); setMessage("Liiga tallennettu."); };
  const lockRegistration = async () => { if (!supabase || !selectedLeague) return; const { data, error } = await supabase.rpc("lock_league_registration", { target_league_id: selectedLeague.id }); if (error) { setMessage(`Ilmoittautumisen lukitus epäonnistui: ${error.message}`); return; } const updated = { ...selectedLeague, status: "registration_closed" }; setSelectedLeague(updated); setLeagues((current) => current.map((league) => league.id === updated.id ? updated : league)); await loadLeagueData(updated); setMessage(data ? `Ilmoittautuminen lukittu. ${data} joukkuetta poistettiin, koska niillä ei ollut kahta hyväksynyttä pelaajaa.` : "Ilmoittautuminen lukittu."); };
  const createGroup = async () => { if (!supabase || !selectedLeague || !groupName.trim()) return; const { error } = await supabase.from("groups").insert({ league_id: selectedLeague.id, name: groupName.trim(), status: "draft" }); if (error) { setMessage(`Lohkon luonti epäonnistui: ${error.message}`); return; } setGroupName(""); await loadLeagueData(selectedLeague); };
  const assignTeam = async (groupId: string, teamId: string) => { if (!supabase) return; const { error } = await supabase.from("group_teams").insert({ group_id: groupId, team_id: teamId }); if (error) { setMessage(`Joukkueen lisääminen epäonnistui: ${error.message}`); return; } if (selectedLeague) await loadLeagueData(selectedLeague); };
  const removeTeam = async (assignmentId: string) => { if (!supabase) return; const { error } = await supabase.from("group_teams").delete().eq("id", assignmentId); if (error) { setMessage(`Joukkueen poistaminen epäonnistui: ${error.message}`); return; } if (selectedLeague) await loadLeagueData(selectedLeague); };
  const deleteGroup = async (group: Group) => { if (!supabase) return; const { error } = await supabase.from("groups").delete().eq("id", group.id); if (error) { setMessage(`Lohkon poistaminen epäonnistui: ${error.message}`); return; } if (selectedLeague) await loadLeagueData(selectedLeague); setMessage(`${group.name} poistettu.`); };
  const publishGroups = async () => {
    if (!supabase || !selectedLeague || groups.length === 0 || teams.length === 0) return;
    const assignments = groupTeams.length > 0 ? groupTeams : teams.map((team, index) => ({ id: "", group_id: groups[index % groups.length].id, team_id: team.id }));
    const { error: assignmentError } = await supabase.from("group_teams").upsert(assignments.map(({ group_id, team_id }) => ({ group_id, team_id })), { onConflict: "group_id,team_id" });
    if (assignmentError) { setMessage(`Joukkueiden jako epäonnistui: ${assignmentError.message}`); return; }
    const refreshed = await supabase.from("group_teams").select("group_id, team_id").in("group_id", groups.map((group) => group.id));
    for (const group of groups) {
      const ids = (refreshed.data ?? []).filter((assignment) => assignment.group_id === group.id).map((assignment) => assignment.team_id);
      const pairs = ids.flatMap((home_team_id, index) => ids.slice(index + 1).map((away_team_id) => ({ league_id: selectedLeague.id, group_id: group.id, home_team_id, away_team_id, status: "scheduled" })));
      if (pairs.length > 0) await supabase.from("matches").insert(pairs);
    }
    await supabase.from("groups").update({ status: "published", published_at: new Date().toISOString() }).eq("league_id", selectedLeague.id);
    await loadLeagueData(selectedLeague); setMessage("Lohkot julkaistu ja otteluparit muodostettu.");
  };
  const selectLeague = (league: League) => { setSelectedLeague(league); setName(league.name); setStartDate(league.start_date); setDeadline(league.registration_deadline ?? ""); setEditing(true); };

  return <View style={styles.page}><ScreenHeader /><ScrollView style={styles.scroll} contentContainerStyle={styles.content}><View style={styles.body}><Pressable onPress={() => router.replace("/(tabs)/info")} style={styles.back}><Text style={styles.backText}>‹ Takaisin Infoon</Text></Pressable><Pressable style={styles.create} onPress={() => router.push("/admin/create-league")}><Text style={styles.createText}>+ Uusi liiga</Text></Pressable><Text style={styles.sectionTitle}>Olemassa olevat liigat</Text>{leagues.length === 0 ? <Text style={styles.empty}>Liigoja ei ole vielä luotu.</Text> : leagues.map((league) => <Pressable key={league.id} onPress={() => router.push(`/admin/league/${league.id}` as never)} style={styles.league}><View style={styles.leagueTop}><Text style={styles.leagueName}>{league.name}</Text><Text style={styles.leagueStatus}>{league.status}</Text></View><Text style={styles.leagueMeta}>{cityNameOf(league) ? `${cityNameOf(league)} · ` : ""}Alkaa {league.start_date} · Deadline {league.registration_deadline ?? "ei asetettu"}</Text><Text style={styles.openText}>Avaa liigan hallinta →</Text></Pressable>)}</View></ScrollView></View>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.canvas }, scroll: { flex: 1 }, content: { paddingBottom: 40 }, loading: { flex: 1, backgroundColor: colors.green, justifyContent: "center", alignItems: "center" }, body: { padding: 22, paddingTop: 18 }, back: { paddingVertical: 8 }, backText: { color: colors.greenBright, fontWeight: "800" }, create: { backgroundColor: colors.green, borderRadius: 13, padding: 16, alignItems: "center", marginTop: 12 }, createText: { color: colors.surface, fontWeight: "800", fontSize: 14 }, sectionTitle: { color: colors.ink, fontSize: 21, fontWeight: "800", marginTop: 24, marginBottom: 12 }, subTitle: { color: colors.ink, fontSize: 16, fontWeight: "800", marginTop: 22, marginBottom: 10 }, input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12, color: colors.ink, padding: 13, marginBottom: 9 }, actions: { flexDirection: "row", gap: 9, marginTop: 7 }, primary: { backgroundColor: colors.green, borderRadius: 12, padding: 15, alignItems: "center", flex: 1 }, primaryText: { color: colors.surface, fontWeight: "800", fontSize: 13 }, secondary: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 15, alignItems: "center" }, secondaryText: { color: colors.green, fontWeight: "800", fontSize: 13 }, message: { color: colors.greenBright, fontSize: 12, marginTop: 10 }, empty: { color: colors.muted, fontSize: 14 }, league: { backgroundColor: colors.surface, borderRadius: 15, padding: 16, marginBottom: 10, ...shadow }, selected: { borderWidth: 2, borderColor: colors.greenBright }, leagueTop: { flexDirection: "row", justifyContent: "space-between", gap: 10 }, leagueName: { color: colors.ink, fontSize: 16, fontWeight: "800", flex: 1 }, leagueStatus: { color: colors.greenBright, fontSize: 10, fontWeight: "900" }, leagueMeta: { color: colors.muted, fontSize: 12, marginTop: 7 }, openText: { color: colors.greenBright, fontSize: 12, fontWeight: "800", marginTop: 10 }, manage: { backgroundColor: colors.mint, borderRadius: 17, padding: 17, marginTop: 14 }, manageRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }, manageLabel: { color: colors.ink, fontSize: 13, fontWeight: "700" }, manageValue: { color: colors.greenBright, fontSize: 12, fontWeight: "900" }, secondaryButton: { borderWidth: 1, borderColor: colors.green, borderRadius: 11, padding: 12, alignItems: "center" }, inline: { flexDirection: "row", gap: 8, alignItems: "flex-start" }, inlineInput: { flex: 1 }, smallButton: { backgroundColor: colors.green, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 17 }, group: { backgroundColor: "rgba(255,255,255,0.8)", borderRadius: 13, padding: 13, marginBottom: 10 }, groupHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, groupName: { color: colors.ink, fontSize: 15, fontWeight: "800" }, groupStatus: { color: colors.muted, fontSize: 10, marginTop: 4 }, addTeam: { borderWidth: 1, borderColor: colors.line, borderRadius: 9, padding: 9, marginTop: 7 }, addTeamText: { color: colors.greenBright, fontSize: 12, fontWeight: "800" }, item: { backgroundColor: colors.surface, borderRadius: 11, padding: 12, marginTop: 7, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, itemName: { color: colors.ink, fontSize: 13, fontWeight: "800", flex: 1 }, itemMeta: { color: colors.muted, fontSize: 12 }, deleteText: { color: colors.coral, fontSize: 11, fontWeight: "800" } });

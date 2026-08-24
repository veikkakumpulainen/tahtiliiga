import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import ScreenHeader from "../../../components/ScreenHeader";
import { supabase } from "../../../lib/supabase";
import { formatFinnishDate, parseFinnishDate } from "../../../lib/dates";
import { colors } from "../../../theme";

type League = { id: string; name: string; status: string; start_date: string; end_date: string | null; registration_deadline: string | null };
type Group = { id: string; name: string; status: string };
type Team = { id: string; name: string; skill_level: string; skill_description: string | null };
type Assignment = { id: string; group_id: string; team_id: string };
type LeagueRound = { id: string; name: string; start_date: string; end_date: string };

const teamInfoStyles = StyleSheet.create({
  actions: { flexDirection: "row", alignItems: "center", gap: 12 },
  infoButton: { width: 24, height: 24, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.mint },
  infoText: { color: colors.green, fontSize: 14, fontWeight: "900" },
  backdrop: { flex: 1, backgroundColor: "rgba(16, 38, 29, 0.48)", justifyContent: "center", padding: 24 },
  modal: { backgroundColor: colors.surface, borderRadius: 12, padding: 20 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  modalTitle: { color: colors.ink, flex: 1, fontSize: 20, fontWeight: "800" },
  close: { color: colors.green, fontSize: 24, fontWeight: "800", lineHeight: 24 },
  detailLabel: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginTop: 18 },
  detailValue: { color: colors.ink, fontSize: 15, lineHeight: 22, marginTop: 5 },
});

const roundStyles = StyleSheet.create({
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 24, marginBottom: 12 },
  title: { color: colors.ink, fontSize: 21, fontWeight: "800" },
  add: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.green },
  addText: { color: colors.surface, fontSize: 23, lineHeight: 26 },
  round: { backgroundColor: colors.mint, borderRadius: 10, padding: 12, marginBottom: 8 },
  roundTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  roundName: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  dates: { color: colors.muted, fontSize: 12, marginTop: 5 },
  remove: { color: colors.coral, fontSize: 12, fontWeight: "800" },
  editor: { backgroundColor: colors.mint, borderRadius: 12, padding: 12, marginBottom: 10 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 10, color: colors.ink, padding: 12, marginTop: 8 },
  actions: { flexDirection: "row", gap: 8, marginTop: 10 },
  save: { flex: 1, alignItems: "center", backgroundColor: colors.green, borderRadius: 10, padding: 12 },
  saveText: { color: colors.surface, fontWeight: "800" },
  cancel: { alignItems: "center", paddingHorizontal: 12, justifyContent: "center" },
  cancelText: { color: colors.muted, fontWeight: "800" },
});

export default function LeagueManagementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [league, setLeague] = useState<League | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [deadline, setDeadline] = useState("");
  const [rounds, setRounds] = useState<LeagueRound[]>([]);
  const [newRound, setNewRound] = useState({ name: "", startDate: "", endDate: "" });
  const [addingRound, setAddingRound] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);

  const load = async () => {
    if (!supabase || !id) return;
    const client = supabase;
    const [{ data: leagueData }, { data: groupData }, { data: teamData }, { data: roundData }] = await Promise.all([
      client.from("leagues").select("id,name,status,start_date,end_date,registration_deadline").eq("id", id).single(),
      client.from("groups").select("id,name,status").eq("league_id", id),
      client.from("teams").select("id,name,skill_level,skill_description").eq("league_id", id).order("skill_level").order("name"),
      client.from("league_rounds").select("id,name,start_date,end_date").eq("league_id", id).order("start_date"),
    ]);
    const groupIds = (groupData ?? []).map((group) => group.id);
    const { data: assignmentData } = groupIds.length ? await client.from("group_teams").select("id,group_id,team_id").in("group_id", groupIds) : { data: [] };
    setLeague(leagueData); setStartDate(formatFinnishDate(leagueData?.start_date)); setEndDate(leagueData?.end_date ? formatFinnishDate(leagueData.end_date) : ""); setDeadline(leagueData?.registration_deadline ? formatFinnishDate(leagueData.registration_deadline) : ""); setRounds(roundData ?? []); setGroups(groupData ?? []); setTeams(teamData ?? []); setAssignments(assignmentData ?? []); setLoading(false);
  };
  useEffect(() => { void load(); }, [id]);
  const saveChanges = async () => { if (!supabase || !league) return; const start = parseFinnishDate(startDate); const end = parseFinnishDate(endDate); const registrationDeadline = deadline.trim() ? parseFinnishDate(deadline) : null; if (!start || !end) { setMessage("Anna sarjan alku- ja loppupäivä muodossa DD-MM-YYYY."); return; } if (end < start) { setMessage("Sarjan loppupäivä ei voi olla ennen aloituspäivää."); return; } if (deadline.trim() && !registrationDeadline) { setMessage("Anna deadline muodossa DD-MM-YYYY."); return; } if (registrationDeadline && registrationDeadline > start) { setMessage("Deadline ei voi olla sarjan alkamispäivän jälkeen."); return; } const { error } = await supabase.from("leagues").update({ name: league.name.trim(), start_date: start, end_date: end, registration_deadline: registrationDeadline }).eq("id", league.id); if (error) setMessage(`Tallennus epäonnistui: ${error.message}`); else { setLeague({ ...league, start_date: start, end_date: end, registration_deadline: registrationDeadline }); setMessage("Sarjan muutokset tallennettu."); } };
  const createRound = async () => { if (!supabase || !league) return; const start = parseFinnishDate(newRound.startDate); const end = parseFinnishDate(newRound.endDate); const leagueStart = parseFinnishDate(startDate); const leagueEnd = parseFinnishDate(endDate); if (!newRound.name.trim() || !start || !end) { setMessage("Anna kierrokselle nimi sekä alku- ja loppupäivä."); return; } if (!leagueStart || !leagueEnd || start < leagueStart || end > leagueEnd || end < start) { setMessage("Kierroksen päivämäärien tulee olla sarjan päivämäärien sisällä."); return; } const { error } = await supabase.from("league_rounds").insert({ league_id: league.id, name: newRound.name.trim(), start_date: start, end_date: end }); if (error) { setMessage(`Kierroksen lisäys epäonnistui: ${error.message}`); return; } setNewRound({ name: "", startDate: "", endDate: "" }); setAddingRound(false); await load(); };
  const removeRound = async (roundId: string) => { if (!supabase) return; const { error } = await supabase.from("league_rounds").delete().eq("id", roundId); if (error) setMessage(`Kierroksen poisto epäonnistui: ${error.message}`); else await load(); };
  const updateStatus = async (status: string) => {
    if (!supabase || !league) return;
    if (status === "ongoing") {
      if (groups.length === 0) { setMessage("Luo vähintään yksi lohko ennen sarjan käynnistämistä."); return; }
      const client = supabase;
      for (const group of groups) {
        const groupTeamIds = assignments.filter((assignment) => assignment.group_id === group.id).map((assignment) => assignment.team_id);
        if (groupTeamIds.length < 2) { setMessage(`${group.name} tarvitsee vähintään kaksi joukkuetta.`); return; }
        const { data: existingMatches } = await client.from("matches").select("home_team_id, away_team_id").eq("group_id", group.id);
        const existingKeys = new Set((existingMatches ?? []).flatMap((match) => [`${match.home_team_id}:${match.away_team_id}`, `${match.away_team_id}:${match.home_team_id}`]));
        const pairs = groupTeamIds.flatMap((homeTeamId, index) => groupTeamIds.slice(index + 1).map((awayTeamId) => ({ league_id: league.id, group_id: group.id, home_team_id: homeTeamId, away_team_id: awayTeamId, status: "scheduled" })));
        const missingPairs = pairs.filter((pair) => !existingKeys.has(`${pair.home_team_id}:${pair.away_team_id}`));
        if (missingPairs.length > 0) { const { error } = await client.from("matches").insert(missingPairs); if (error) { setMessage(`Otteluparien luonti epäonnistui: ${error.message}`); return; } }
      }
      const { error: groupError } = await client.from("groups").update({ status: "published", published_at: new Date().toISOString() }).eq("league_id", league.id);
      if (groupError) { setMessage(`Lohkojen julkaisu epäonnistui: ${groupError.message}`); return; }
    }
    const { error } = await supabase.from("leagues").update({ status }).eq("id", league.id);
    if (error) setMessage(`Sarjan tilan muuttaminen epäonnistui: ${error.message}`); else { setLeague({ ...league, status }); await load(); setMessage(status === "ongoing" ? "Sarja käynnistetty ja otteluparit muodostettu." : "Sarjan tila päivitetty."); }
  };
  const createGroup = async () => { if (!supabase || !league || !groupName.trim()) return; const { error } = await supabase.from("groups").insert({ league_id: league.id, name: groupName.trim(), status: "draft" }); if (error) setMessage(error.message); else { setGroupName(""); await load(); } };
  const removeGroup = async (groupId: string) => { if (!supabase) return; const { error } = await supabase.from("groups").delete().eq("id", groupId); if (error) setMessage(error.message); else await load(); };
  const assignTeam = async (groupId: string, teamId: string) => { if (!supabase) return; const { error } = await supabase.from("group_teams").insert({ group_id: groupId, team_id: teamId }); if (error) setMessage(error.message); else await load(); };
  const removeAssignment = async (assignmentId: string) => { if (!supabase) return; const { error } = await supabase.from("group_teams").delete().eq("id", assignmentId); if (error) setMessage(error.message); else await load(); };
  const deleteLeague = async () => { if (!supabase || !league) return; const { error } = await supabase.rpc("delete_league_with_data", { target_league_id: league.id }); if (error) setMessage(`Poisto epäonnistui: ${error.message}`); else router.replace("/admin" as never); };
  if (loading) return <View style={styles.loading}>
<ActivityIndicator color={colors.lime} />
</View>;
  if (!league) return <View style={styles.loading}>
<Text style={styles.error}>Sarjaa ei löytynyt.</Text>
</View>;
  return <>
<ScrollView style={styles.page} contentContainerStyle={styles.content}>
<ScreenHeader eyebrow="TÄHTILIIGA" title="Sarjan hallinta" subtitle={league.name} />
<View style={styles.body}>
<Pressable onPress={() => router.replace("/admin" as never)} style={styles.back}>
<Text style={styles.backText}>‹ Takaisin sarjoihin</Text>
</Pressable>
<Text style={styles.sectionTitle}>Sarjan tiedot</Text>
<TextInput value={league.name} onChangeText={(value) => setLeague({ ...league, name: value })} placeholder="Sarjan nimi" placeholderTextColor={colors.muted} style={styles.input} />
<TextInput value={startDate} onChangeText={setStartDate} placeholder="DD-MM-YYYY" placeholderTextColor={colors.muted} style={styles.input} />
<TextInput value={endDate} onChangeText={setEndDate} placeholder="Sarjan loppupäivä DD-MM-YYYY" placeholderTextColor={colors.muted} style={styles.input} />
<TextInput value={deadline} onChangeText={setDeadline} placeholder="Deadline DD-MM-YYYY (valinnainen)" placeholderTextColor={colors.muted} style={styles.input} />
<Pressable onPress={() => void saveChanges()} style={styles.save}>
<Text style={styles.saveText}>Tallenna muutokset</Text>
</Pressable>
<Text style={styles.status}>Tila: {league.status}</Text>{league.status === "registration_open" ? <Pressable onPress={() => void updateStatus("registration_closed")} style={styles.secondary}>
<Text style={styles.secondaryText}>Lukitse ilmoittautuminen</Text>
</Pressable> : null}{message ? <Text style={styles.message}>{message}</Text> : null}<View style={roundStyles.heading}>
<Text style={roundStyles.title}>Kierrokset</Text>
<Pressable onPress={() => { setNewRound({ name: `Kierros ${rounds.length + 1}`, startDate: "", endDate: "" }); setAddingRound(true); }} style={roundStyles.add} accessibilityRole="button" accessibilityLabel="Lisää kierros">
<Text style={roundStyles.addText}>+</Text>
</Pressable>
</View>{rounds.map((round) => <View key={round.id} style={roundStyles.round}>
<View style={roundStyles.roundTop}>
<Text style={roundStyles.roundName}>{round.name}</Text>
<Pressable onPress={() => void removeRound(round.id)}><Text style={roundStyles.remove}>Poista</Text></Pressable>
</View>
<Text style={roundStyles.dates}>{formatFinnishDate(round.start_date)} - {formatFinnishDate(round.end_date)}</Text>
</View>)}{addingRound ? <View style={roundStyles.editor}>
<TextInput value={newRound.name} onChangeText={(value) => setNewRound((current) => ({ ...current, name: value }))} placeholder="Kierroksen nimi" placeholderTextColor={colors.muted} style={roundStyles.input} />
<TextInput value={newRound.startDate} onChangeText={(value) => setNewRound((current) => ({ ...current, startDate: value }))} placeholder="Alkaa DD-MM-YYYY" placeholderTextColor={colors.muted} style={roundStyles.input} />
<TextInput value={newRound.endDate} onChangeText={(value) => setNewRound((current) => ({ ...current, endDate: value }))} placeholder="Päättyy DD-MM-YYYY" placeholderTextColor={colors.muted} style={roundStyles.input} />
<View style={roundStyles.actions}>
<Pressable onPress={() => void createRound()} style={roundStyles.save}><Text style={roundStyles.saveText}>Tallenna kierros</Text></Pressable>
<Pressable onPress={() => setAddingRound(false)} style={roundStyles.cancel}><Text style={roundStyles.cancelText}>Peruuta</Text></Pressable>
</View>
</View> : null}<Text style={styles.sectionTitle}>Lohkot</Text>
<View style={styles.inline}>
<TextInput value={groupName} onChangeText={setGroupName} placeholder="Uuden lohkon nimi" placeholderTextColor={colors.muted} style={[styles.input, styles.inlineInput]} />
<Pressable onPress={createGroup} style={styles.small}>
<Text style={styles.smallText}>Luo</Text>
</Pressable>
</View>{groups.map((group) => { const groupAssignments = assignments.filter((assignment) => assignment.group_id === group.id); const assignedIds = new Set(assignments.map((assignment) => assignment.team_id)); const available = teams.filter((team) => !assignedIds.has(team.id)); return <View key={group.id} style={styles.group}>
<View style={styles.groupTop}>
<Text style={styles.groupName}>{group.name}</Text>
<Pressable onPress={() => removeGroup(group.id)}>
<Text style={styles.delete}>Poista lohko</Text>
</Pressable>
</View>
<Text style={styles.status}>{group.status}</Text>{groupAssignments.map((assignment) => { const team = teams.find((item) => item.id === assignment.team_id); return <View key={assignment.id} style={styles.item}>
<Text style={styles.itemText}>{team ? `${team.name} · Taso ${team.skill_level}` : "Joukkue"}</Text>
<View style={teamInfoStyles.actions}>
{team?.skill_description ? <Pressable onPress={() => setSelectedTeam(team)} style={teamInfoStyles.infoButton} accessibilityRole="button" accessibilityLabel={`Näytä joukkueen ${team.name} lisätiedot`}>
<Text style={teamInfoStyles.infoText}>i</Text>
</Pressable> : null}
<Pressable onPress={() => removeAssignment(assignment.id)}>
<Text style={styles.delete}>Poista</Text>
</Pressable>
</View>
</View>; })}{available.map((team) => <Pressable key={team.id} onPress={() => assignTeam(group.id, team.id)} style={styles.add}>
<Text style={styles.addText}>+ Lisää {team.name} · Taso {team.skill_level}</Text>
</Pressable>)}</View>; })}<Pressable onPress={() => void updateStatus("ongoing")} style={styles.start}>
<Text style={styles.startText}>Käynnistä sarja</Text>
</Pressable>
<Pressable onPress={() => void deleteLeague()} style={styles.deleteLeague}>
<Text style={styles.deleteLeagueText}>Poista sarja</Text>
</Pressable>
</View>
</ScrollView>
<Modal visible={Boolean(selectedTeam)} transparent animationType="fade" onRequestClose={() => setSelectedTeam(null)}>
<Pressable style={teamInfoStyles.backdrop} onPress={() => setSelectedTeam(null)}>
<Pressable style={teamInfoStyles.modal} onPress={(event) => event.stopPropagation()}>
<View style={teamInfoStyles.modalHeader}>
<Text style={teamInfoStyles.modalTitle}>{selectedTeam?.name}</Text>
<Pressable onPress={() => setSelectedTeam(null)} accessibilityRole="button" accessibilityLabel="Sulje joukkueen tiedot">
<Text style={teamInfoStyles.close}>×</Text>
</Pressable>
</View>
<Text style={teamInfoStyles.detailLabel}>TAITOTASO</Text>
<Text style={teamInfoStyles.detailValue}>{selectedTeam?.skill_level}</Text>{selectedTeam?.skill_description ? <><Text style={teamInfoStyles.detailLabel}>TAITOTASOKUVAUS</Text>
<Text style={teamInfoStyles.detailValue}>{selectedTeam.skill_description}</Text></> : null}
</Pressable>
</Pressable>
</Modal>
</>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.canvas }, content: { paddingBottom: 40 }, loading: { flex: 1, backgroundColor: colors.green, justifyContent: "center", alignItems: "center" }, body: { padding: 22 }, back: { paddingVertical: 8 }, backText: { color: colors.greenBright, fontWeight: "800" }, sectionTitle: { color: colors.ink, fontSize: 21, fontWeight: "800", marginTop: 24, marginBottom: 12 }, input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12, color: colors.ink, padding: 13, marginBottom: 9 }, inline: { flexDirection: "row", gap: 8 }, inlineInput: { flex: 1 }, small: { backgroundColor: colors.green, borderRadius: 12, paddingHorizontal: 16, justifyContent: "center", marginBottom: 9 }, smallText: { color: colors.surface, fontWeight: "800" }, save: { backgroundColor: colors.green, borderRadius: 12, padding: 15, alignItems: "center", marginTop: 7 }, saveText: { color: colors.surface, fontWeight: "800" }, secondary: { borderWidth: 1, borderColor: colors.green, borderRadius: 12, alignItems: "center", padding: 13 }, secondaryText: { color: colors.green, fontWeight: "800" }, status: { color: colors.muted, fontSize: 12, marginVertical: 8 }, message: { color: colors.greenBright, fontSize: 12, marginTop: 8 }, error: { color: colors.coral }, group: { backgroundColor: colors.mint, padding: 14, borderRadius: 15, marginBottom: 10 }, groupTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, groupName: { color: colors.ink, fontSize: 16, fontWeight: "800" }, delete: { color: colors.coral, fontSize: 12, fontWeight: "800" }, item: { backgroundColor: colors.surface, padding: 11, borderRadius: 10, marginTop: 7, flexDirection: "row", justifyContent: "space-between" }, itemText: { color: colors.ink, fontWeight: "700" }, add: { borderWidth: 1, borderColor: colors.line, padding: 9, borderRadius: 9, marginTop: 7 }, addText: { color: colors.greenBright, fontWeight: "800", fontSize: 12 }, start: { backgroundColor: colors.greenBright, borderRadius: 12, padding: 16, alignItems: "center", marginTop: 18 }, startText: { color: colors.surface, fontWeight: "900" }, deleteLeague: { marginTop: 14, borderWidth: 1, borderColor: colors.coral, borderRadius: 12, padding: 14, alignItems: "center" }, deleteLeagueText: { color: colors.coral, fontWeight: "800", fontSize: 13 } });

import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import ScreenHeader from "../../../components/ScreenHeader";
import { supabase } from "../../../lib/supabase";
import { formatFinnishDate, parseFinnishDate } from "../../../lib/dates";
import { colors } from "../../../theme";
import GroupMatches from "../../../components/GroupMatches";

type League = { id: string; name: string; status: string; start_date: string; end_date: string | null; registration_deadline: string | null; city: string | null };
type Venue = { id: string; name: string };
type Group = { id: string; name: string; status: string };
type Team = { id: string; name: string; skill_level: string; skill_description: string | null };
const teamSkillLevelOrder = ["A", "B", "C", "D", "E", "Aloittelija"] as const;
type Assignment = { id: string; group_id: string; team_id: string };
type LeagueRound = { id: string; name: string; start_date: string; end_date: string; round_type: "regular" | "qualification"; status: "draft" | "active" | "completed" };
type RosterPlayer = { id: string; name: string; isCaptain: boolean; isActive: boolean };
type PlayerSearchResult = { id: string; first_name: string; last_name: string };

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
  meta: { color: colors.green, fontSize: 9, fontWeight: "900", letterSpacing: 0.7, marginTop: 8 },
  remove: { color: colors.coral, fontSize: 12, fontWeight: "800" },
  editor: { backgroundColor: colors.mint, borderRadius: 12, padding: 12, marginBottom: 10 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 10, color: colors.ink, padding: 12, marginTop: 8 },
  actions: { flexDirection: "row", gap: 8, marginTop: 10 },
  save: { flex: 1, alignItems: "center", backgroundColor: colors.green, borderRadius: 10, padding: 12 },
  saveText: { color: colors.surface, fontWeight: "800" },
  cancel: { alignItems: "center", paddingHorizontal: 12, justifyContent: "center" },
  cancelText: { color: colors.muted, fontWeight: "800" },
  start: { backgroundColor: colors.green, borderRadius: 9, alignItems: "center", padding: 10, marginTop: 10 },
  startText: { color: colors.surface, fontSize: 12, fontWeight: "800" },
  complete: { borderColor: colors.green, borderRadius: 9, borderWidth: 1, alignItems: "center", padding: 10, marginTop: 10 },
  completeText: { color: colors.green, fontSize: 12, fontWeight: "800" },
  typeLabel: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.8, marginTop: 15 },
  typeOptions: { flexDirection: "row", gap: 8, marginTop: 8 },
  typeOption: { borderColor: colors.line, borderRadius: 9, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  typeOptionSelected: { backgroundColor: colors.green, borderColor: colors.green },
  typeOptionText: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  typeOptionTextSelected: { color: colors.surface },
});

const venueStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.mint, borderRadius: 10, padding: 12, marginHorizontal: 22, marginTop: 8 },
  name: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  remove: { color: colors.coral, fontSize: 12, fontWeight: "800" },
  addRow: { flexDirection: "row", gap: 8, alignItems: "center", marginHorizontal: 22, marginTop: 10 },
  addInput: { flex: 1 },
  addButton: { backgroundColor: colors.green, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 13 },
  addButtonText: { color: colors.surface, fontWeight: "800", fontSize: 12 },
});

const rosterStyles = StyleSheet.create({
  teamSearchResult: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 10, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", marginTop: 7, padding: 12 },
  teamSearchResultSelected: { borderColor: colors.green, borderWidth: 2 },
  teamSearchName: { color: colors.ink, fontWeight: "800" },
  teamSearchMeta: { color: colors.muted, fontSize: 12 },
  rosterPanel: { backgroundColor: colors.mint, borderRadius: 12, marginTop: 12, padding: 14 },
  rosterTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rosterTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  rosterClose: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  rosterHint: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 6 },
  rosterPlayer: { alignItems: "center", backgroundColor: colors.surface, borderRadius: 10, flexDirection: "row", justifyContent: "space-between", marginTop: 8, padding: 10 },
  captainChoice: { flex: 1 },
  captainChoiceText: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  captainChoiceTextSelected: { color: colors.green },
  rosterSave: { alignItems: "center", borderColor: colors.green, borderRadius: 10, borderWidth: 1, marginTop: 10, padding: 11 },
  rosterSaveText: { color: colors.green, fontWeight: "800" },
  rosterLabel: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1, marginTop: 16 },
  rosterDelete: { alignItems: "center", borderColor: colors.coral, borderRadius: 10, borderWidth: 1, marginTop: 16, padding: 11 },
  rosterDeleteText: { color: colors.coral, fontWeight: "800" },
  deleteConfirm: { backgroundColor: colors.surface, borderColor: colors.coral, borderRadius: 10, borderWidth: 1, marginTop: 16, padding: 12 },
  deleteConfirmText: { color: colors.ink, fontSize: 12, lineHeight: 18, marginBottom: 10 },
  confirmDelete: { alignItems: "center", backgroundColor: colors.coral, borderRadius: 9, flex: 1, padding: 10 },
  confirmDeleteText: { color: colors.surface, fontSize: 12, fontWeight: "800" },
  cancelDelete: { alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  cancelDeleteText: { color: colors.muted, fontSize: 12, fontWeight: "800" },
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
  const [city, setCity] = useState("");
  const [venues, setVenues] = useState<Venue[]>([]);
  const [newVenueName, setNewVenueName] = useState("");
  const [rounds, setRounds] = useState<LeagueRound[]>([]);
  const [newRound, setNewRound] = useState({ name: "", startDate: "", endDate: "", roundType: "regular" as LeagueRound["round_type"] });
  const [addingRound, setAddingRound] = useState(false);
  const [editingRound, setEditingRound] = useState<LeagueRound | null>(null);
  const [roundForm, setRoundForm] = useState({ name: "", startDate: "", endDate: "" });
  const [groupName, setGroupName] = useState("");
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [teamSearch, setTeamSearch] = useState("");
  const [managedTeam, setManagedTeam] = useState<Team | null>(null);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [rosterCaptainId, setRosterCaptainId] = useState<string | null>(null);
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerSearchResults, setPlayerSearchResults] = useState<PlayerSearchResult[]>([]);
  const [searchingPlayers, setSearchingPlayers] = useState(false);
  const [confirmTeamDelete, setConfirmTeamDelete] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);

  const load = async () => {
    if (!supabase || !id) return;
    const client = supabase;
    const [{ data: leagueData }, { data: groupData }, { data: teamData }, { data: roundData }, { data: venueData }] = await Promise.all([
      client.from("leagues").select("id,name,status,start_date,end_date,registration_deadline,city").eq("id", id).single(),
      client.from("groups").select("id,name,status").eq("league_id", id),
      client.from("teams").select("id,name,skill_level,skill_description").eq("league_id", id).order("name"),
      client.from("league_rounds").select("id,name,start_date,end_date,round_type,status").eq("league_id", id).order("start_date"),
      client.from("league_venues").select("id,name").eq("league_id", id).order("name"),
    ]);
    const groupIds = (groupData ?? []).map((group) => group.id);
    const { data: assignmentData } = groupIds.length ? await client.from("group_teams").select("id,group_id,team_id").in("group_id", groupIds) : { data: [] };
    setLeague(leagueData); setStartDate(formatFinnishDate(leagueData?.start_date)); setEndDate(leagueData?.end_date ? formatFinnishDate(leagueData.end_date) : ""); setDeadline(leagueData?.registration_deadline ? formatFinnishDate(leagueData.registration_deadline) : ""); setCity(leagueData?.city ?? ""); setVenues(venueData ?? []); setRounds(roundData ?? []); setGroups((groupData ?? []).slice().sort((a, b) => a.name.localeCompare(b.name, "fi", { numeric: true }))); setTeams((teamData ?? []).slice().sort((a, b) => teamSkillLevelOrder.indexOf(a.skill_level as typeof teamSkillLevelOrder[number]) - teamSkillLevelOrder.indexOf(b.skill_level as typeof teamSkillLevelOrder[number]) || a.name.localeCompare(b.name))); setAssignments(assignmentData ?? []); setLoading(false);
  };
  useFocusEffect(useCallback(() => { void load(); }, [id]));
  const saveChanges = async () => { if (!supabase || !league) return; const start = parseFinnishDate(startDate); const end = parseFinnishDate(endDate); const registrationDeadline = deadline.trim() ? parseFinnishDate(deadline) : null; if (!start || !end) { setMessage("Anna sarjan alku- ja loppupäivä muodossa DD-MM-YYYY."); return; } if (end < start) { setMessage("Sarjan loppupäivä ei voi olla ennen aloituspäivää."); return; } if (deadline.trim() && !registrationDeadline) { setMessage("Anna deadline muodossa DD-MM-YYYY."); return; } if (registrationDeadline && registrationDeadline > start) { setMessage("Deadline ei voi olla sarjan alkamispäivän jälkeen."); return; } const outOfRangeRound = rounds.find((round) => round.start_date < start || round.end_date > end); if (outOfRangeRound) { setMessage(`Sarjan päivämäärien tulee sisältää kaikki kierrokset. Kierros "${outOfRangeRound.name}" on ${formatFinnishDate(outOfRangeRound.start_date)} - ${formatFinnishDate(outOfRangeRound.end_date)}. Muokkaa tai poista kierros ensin.`); return; } const { error } = await supabase.from("leagues").update({ name: league.name.trim(), city: city.trim() || null, start_date: start, end_date: end, registration_deadline: registrationDeadline }).eq("id", league.id); if (error) setMessage(error.message.includes("round dates") ? "Sarjan päivämäärien tulee sisältää kaikki kierrokset. Muokkaa tai poista kierrokset, jotka jäävät uusien päivämäärien ulkopuolelle." : `Tallennus epäonnistui: ${error.message}`); else { setLeague({ ...league, city: city.trim() || null, start_date: start, end_date: end, registration_deadline: registrationDeadline }); setMessage("Sarjan muutokset tallennettu."); } };
  const addVenue = async () => { if (!supabase || !league || !newVenueName.trim()) return; const { error } = await supabase.from("league_venues").insert({ league_id: league.id, name: newVenueName.trim() }); if (error) { setMessage(`Pelipaikan lisäys epäonnistui: ${error.message}`); return; } setNewVenueName(""); await load(); };
  const removeVenue = async (venueId: string) => { if (!supabase) return; const { error } = await supabase.from("league_venues").delete().eq("id", venueId); if (error) { setMessage(`Pelipaikan poisto epäonnistui: ${error.message}`); return; } await load(); };
  const createRound = async () => { if (!supabase || !league) return; const start = parseFinnishDate(newRound.startDate); const end = parseFinnishDate(newRound.endDate); const leagueStart = parseFinnishDate(startDate); const leagueEnd = parseFinnishDate(endDate); if (!newRound.name.trim() || !start || !end) { setMessage("Anna kierrokselle nimi sekä alku- ja loppupäivä."); return; } if (!leagueStart || !leagueEnd || start < leagueStart || end > leagueEnd || end < start) { setMessage("Kierroksen päivämäärien tulee olla sarjan päivämäärien sisällä."); return; } const { error } = await supabase.from("league_rounds").insert({ league_id: league.id, name: newRound.name.trim(), start_date: start, end_date: end, round_type: newRound.roundType }); if (error) { setMessage(`Kierroksen lisäys epäonnistui: ${error.message}`); return; } setNewRound({ name: "", startDate: "", endDate: "", roundType: "regular" }); setAddingRound(false); await load(); };
  const startEditingRound = (round: LeagueRound) => { setAddingRound(false); setEditingRound(round); setRoundForm({ name: round.name, startDate: formatFinnishDate(round.start_date), endDate: formatFinnishDate(round.end_date) }); };
  const updateRound = async () => { if (!supabase || !league || !editingRound) return; const start = parseFinnishDate(roundForm.startDate); const end = parseFinnishDate(roundForm.endDate); const leagueStart = parseFinnishDate(startDate); const leagueEnd = parseFinnishDate(endDate); if (!roundForm.name.trim() || !start || !end) { setMessage("Anna kierrokselle nimi sekä alku- ja loppupäivä."); return; } if (!leagueStart || !leagueEnd || start < leagueStart || end > leagueEnd || end < start) { setMessage("Kierroksen päivämäärien tulee olla sarjan päivämäärien sisällä."); return; } const { error } = await supabase.from("league_rounds").update({ name: roundForm.name.trim(), start_date: start, end_date: end }).eq("id", editingRound.id); if (error) { setMessage(`Kierroksen muokkaus epäonnistui: ${error.message}`); return; } setEditingRound(null); setMessage("Kierroksen muutokset tallennettu."); await load(); };
  const removeRound = async (roundId: string) => { if (!supabase) return; const { error } = await supabase.from("league_rounds").delete().eq("id", roundId); if (error) setMessage(`Kierroksen poisto epäonnistui: ${error.message}`); else await load(); };
  const updateStatus = async (status: string) => {
    if (!supabase || !league) return;
    if (status === "ongoing" && (groups.length === 0 || groups.some((group) => assignments.filter((assignment) => assignment.group_id === group.id).length < 2))) { setMessage("Luo vähintään yksi lohko ja lisää jokaiseen lohkoon vähintään kaksi joukkuetta ennen sarjan käynnistämistä."); return; }
    if (status === "registration_closed") {
      const { data, error } = await supabase.rpc("lock_league_registration", { target_league_id: league.id });
      if (error) { setMessage(`Sarjan tilan muuttaminen epäonnistui: ${error.message}`); return; }
      setLeague({ ...league, status });
      await load();
      setMessage(data ? `Ilmoittautuminen lukittu. ${data} joukkuetta poistettiin, koska niillä ei ollut kahta hyväksynyttä pelaajaa.` : "Ilmoittautuminen lukittu.");
      return;
    }
    const { error } = await supabase.from("leagues").update({ status }).eq("id", league.id);
    if (error) setMessage(`Sarjan tilan muuttaminen epäonnistui: ${error.message}`); else { setLeague({ ...league, status }); await load(); setMessage(status === "ongoing" ? "Sarja käynnistetty. Aloita ensimmäinen tavallinen kierros alta." : "Sarjan tila päivitetty."); }
  };
  const startRound = async (round: LeagueRound) => { if (!supabase) return; const functionName = round.round_type === "qualification" ? "start_qualification_round" : "start_regular_round"; const { error } = await supabase.rpc(functionName, { target_round_id: round.id }); if (error) setMessage(`Kierroksen aloitus epäonnistui: ${error.message}`); else { setMessage(`${round.name} aloitettu.`); await load(); } };
  const completeRound = async (round: LeagueRound) => { if (!supabase) return; const { error } = await supabase.rpc("complete_league_round", { target_round_id: round.id }); if (error) setMessage(`Kierroksen päättäminen epäonnistui: ${error.message}`); else { setMessage(round.round_type === "qualification" ? "Karsintakierros päätetty ja lohkot päivitetty." : "Tavallinen kierros päätetty. Voit aloittaa karsintakierroksen."); await load(); } };
  const createGroup = async () => { if (!supabase || !league || !groupName.trim()) return; const { error } = await supabase.from("groups").insert({ league_id: league.id, name: groupName.trim(), status: "draft" }); if (error) setMessage(error.message); else { setGroupName(""); await load(); } };
  const removeGroup = async (groupId: string) => { if (!supabase) return; const { error } = await supabase.from("groups").delete().eq("id", groupId); if (error) setMessage(error.message); else await load(); };
  const assignTeam = async (groupId: string, teamId: string) => { if (!supabase) return; const { error } = await supabase.from("group_teams").insert({ group_id: groupId, team_id: teamId }); if (error) setMessage(error.message); else await load(); };
  const removeAssignment = async (assignmentId: string) => { if (!supabase) return; const { error } = await supabase.from("group_teams").delete().eq("id", assignmentId); if (error) setMessage(error.message); else await load(); };
  const closeManagedTeam = () => { setManagedTeam(null); setRoster([]); setRosterCaptainId(null); setTeamSearch(""); setPlayerSearch(""); setPlayerSearchResults([]); setConfirmTeamDelete(false); };
  const loadRoster = async (team: Team) => { if (!supabase) return; const { data, error } = await supabase.from("team_members").select("user_id,is_captain,status,profiles(first_name,last_name)").eq("team_id", team.id); if (error) { setMessage(`Joukkueen pelaajien lataus epäonnistui: ${error.message}`); return; } const players = ((data ?? []) as { user_id: string; is_captain: boolean; status: string; profiles: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null }[]).map((member) => { const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles; return { id: member.user_id, name: profile ? `${profile.first_name} ${profile.last_name}` : "Pelaaja", isCaptain: member.is_captain, isActive: member.status === "active" }; }); setManagedTeam(team); setRoster(players); setRosterCaptainId(players.find((player) => player.isCaptain)?.id ?? null); setPlayerSearch(""); setPlayerSearchResults([]); };
  const searchRosterPlayers = async () => { if (!supabase || !league || playerSearch.trim().length < 2) { setMessage("Kirjoita pelaajan nimestä vähintään kaksi merkkiä."); return; } setSearchingPlayers(true); const { data, error } = await supabase.rpc("search_profiles_by_name", { search_query: playerSearch.trim(), target_league_id: league.id }); setSearchingPlayers(false); if (error) { setMessage(`Pelaajahaku epäonnistui: ${error.message}`); return; } setPlayerSearchResults(((data ?? []) as PlayerSearchResult[]).filter((player) => !roster.some((member) => member.id === player.id))); };
  const updateRoster = async (removedUserId: string | null, addedUserId: string | null) => { if (!supabase || !managedTeam) return; const { error } = await supabase.rpc("admin_update_team_roster", { target_team_id: managedTeam.id, removed_user_id: removedUserId, added_user_id: addedUserId, new_captain_id: rosterCaptainId }); if (error) { setMessage(`Joukkueen pelaajien muokkaus epäonnistui: ${error.message}`); return; } if (!removedUserId && !addedUserId) { setManagedTeam(null); setRoster([]); setRosterCaptainId(null); setTeamSearch(""); setPlayerSearch(""); setPlayerSearchResults([]); } else await loadRoster(managedTeam); await load(); };
  const deleteManagedTeam = async () => { if (!supabase || !managedTeam) return; const { error } = await supabase.rpc("admin_delete_team", { target_team_id: managedTeam.id }); if (error) { setMessage(`Joukkueen poisto epäonnistui: ${error.message}`); return; } setManagedTeam(null); setRoster([]); setRosterCaptainId(null); setTeamSearch(""); setPlayerSearch(""); setPlayerSearchResults([]); setConfirmTeamDelete(false); await load(); };
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
<Pressable onPress={() => router.push(`/admin/league/${league.id}/register-team` as never)} style={styles.secondary}>
<Text style={styles.secondaryText}>Lisää joukkue sarjaan</Text>
</Pressable>
<Text style={styles.sectionTitle}>Sarjan tiedot</Text>
<TextInput value={league.name} onChangeText={(value) => setLeague({ ...league, name: value })} placeholder="Sarjan nimi" placeholderTextColor={colors.muted} style={styles.input} />
<TextInput value={city} onChangeText={setCity} placeholder="Kaupunki" placeholderTextColor={colors.muted} style={styles.input} />
<TextInput value={startDate} onChangeText={setStartDate} placeholder="DD-MM-YYYY" placeholderTextColor={colors.muted} style={styles.input} />
<TextInput value={endDate} onChangeText={setEndDate} placeholder="Sarjan loppupäivä DD-MM-YYYY" placeholderTextColor={colors.muted} style={styles.input} />
<TextInput value={deadline} onChangeText={setDeadline} placeholder="Deadline DD-MM-YYYY (valinnainen)" placeholderTextColor={colors.muted} style={styles.input} />
<Pressable onPress={() => void saveChanges()} style={styles.save}>
<Text style={styles.saveText}>Tallenna muutokset</Text>
</Pressable>
<Text style={styles.sectionTitle}>Pelipaikat</Text>
{venues.map((venue) => <View key={venue.id} style={venueStyles.row}>
  <Text style={venueStyles.name}>{venue.name}</Text>
  <Pressable onPress={() => void removeVenue(venue.id)}><Text style={venueStyles.remove}>Poista</Text></Pressable>
</View>)}
<View style={venueStyles.addRow}>
  <TextInput value={newVenueName} onChangeText={setNewVenueName} placeholder="Uusi pelipaikka" placeholderTextColor={colors.muted} style={[styles.input, venueStyles.addInput]} />
  <Pressable onPress={() => void addVenue()} style={venueStyles.addButton}><Text style={venueStyles.addButtonText}>Lisää</Text></Pressable>
</View>
<Text style={styles.status}>Tila: {league.status}</Text>{league.status === "registration_open" ? <Pressable onPress={() => void updateStatus("registration_closed")} style={styles.secondary}>
<Text style={styles.secondaryText}>Lukitse ilmoittautuminen</Text>
</Pressable> : null}{message ? <Text style={styles.message}>{message}</Text> : null}<View style={roundStyles.heading}>
<Text style={roundStyles.title}>Kierrokset</Text>
<Pressable onPress={() => { setNewRound({ name: `Kierros ${rounds.length + 1}`, startDate: "", endDate: "", roundType: "regular" }); setAddingRound(true); }} style={roundStyles.add} accessibilityRole="button" accessibilityLabel="Lisää kierros">
<Text style={roundStyles.addText}>+</Text>
</Pressable>
</View>{rounds.map((round) => <View key={round.id} style={roundStyles.round}>
<View style={roundStyles.roundTop}>
<Text style={roundStyles.roundName}>{round.name}</Text>
<View style={roundStyles.actions}>
<Pressable onPress={() => startEditingRound(round)}><Text style={roundStyles.cancelText}>Muokkaa</Text></Pressable>
<Pressable onPress={() => void removeRound(round.id)}><Text style={roundStyles.remove}>Poista</Text></Pressable>
</View>
</View>
<Text style={roundStyles.dates}>{formatFinnishDate(round.start_date)} - {formatFinnishDate(round.end_date)}</Text>
<Text style={roundStyles.meta}>{round.round_type === "qualification" ? "KARSINTAKIERROS" : "TAVALLINEN KIERROS"} · {round.status === "draft" ? "LUONNOS" : round.status === "active" ? "KÄYNNISSÄ" : "PÄÄTTYNYT"}</Text>
{league.status === "ongoing" && round.status === "draft" ? <Pressable onPress={() => void startRound(round)} style={roundStyles.start}><Text style={roundStyles.startText}>{round.round_type === "qualification" ? "Aloita karsintakierros" : "Aloita tavallinen kierros"}</Text></Pressable> : null}
{league.status === "ongoing" && round.status === "active" ? <Pressable onPress={() => void completeRound(round)} style={roundStyles.complete}><Text style={roundStyles.completeText}>Päätä kierros ja käsittele tulokset</Text></Pressable> : null}
{editingRound?.id === round.id ? <View style={roundStyles.editor}>
<TextInput value={roundForm.name} onChangeText={(value) => setRoundForm((current) => ({ ...current, name: value }))} placeholder="Kierroksen nimi" placeholderTextColor={colors.muted} style={roundStyles.input} />
<TextInput value={roundForm.startDate} onChangeText={(value) => setRoundForm((current) => ({ ...current, startDate: value }))} placeholder="Alkaa DD-MM-YYYY" placeholderTextColor={colors.muted} style={roundStyles.input} />
<TextInput value={roundForm.endDate} onChangeText={(value) => setRoundForm((current) => ({ ...current, endDate: value }))} placeholder="Päättyy DD-MM-YYYY" placeholderTextColor={colors.muted} style={roundStyles.input} />
<View style={roundStyles.actions}>
<Pressable onPress={() => void updateRound()} style={roundStyles.save}><Text style={roundStyles.saveText}>Tallenna muutokset</Text></Pressable>
<Pressable onPress={() => setEditingRound(null)} style={roundStyles.cancel}><Text style={roundStyles.cancelText}>Peruuta</Text></Pressable>
</View>
</View> : null}
</View>)}{addingRound ? <View style={roundStyles.editor}>
<TextInput value={newRound.name} onChangeText={(value) => setNewRound((current) => ({ ...current, name: value }))} placeholder="Kierroksen nimi" placeholderTextColor={colors.muted} style={roundStyles.input} />
<TextInput value={newRound.startDate} onChangeText={(value) => setNewRound((current) => ({ ...current, startDate: value }))} placeholder="Alkaa DD-MM-YYYY" placeholderTextColor={colors.muted} style={roundStyles.input} />
<TextInput value={newRound.endDate} onChangeText={(value) => setNewRound((current) => ({ ...current, endDate: value }))} placeholder="Päättyy DD-MM-YYYY" placeholderTextColor={colors.muted} style={roundStyles.input} />
<Text style={roundStyles.typeLabel}>KIERROKSEN TYYPPI</Text>
<View style={roundStyles.typeOptions}>
<Pressable onPress={() => setNewRound((current) => ({ ...current, roundType: "regular" }))} style={[roundStyles.typeOption, newRound.roundType === "regular" && roundStyles.typeOptionSelected]}><Text style={[roundStyles.typeOptionText, newRound.roundType === "regular" && roundStyles.typeOptionTextSelected]}>Tavallinen</Text></Pressable>
<Pressable onPress={() => setNewRound((current) => ({ ...current, roundType: "qualification" }))} style={[roundStyles.typeOption, newRound.roundType === "qualification" && roundStyles.typeOptionSelected]}><Text style={[roundStyles.typeOptionText, newRound.roundType === "qualification" && roundStyles.typeOptionTextSelected]}>Karsinta</Text></Pressable>
</View>
<View style={roundStyles.actions}>
<Pressable onPress={() => void createRound()} style={roundStyles.save}><Text style={roundStyles.saveText}>Tallenna kierros</Text></Pressable>
<Pressable onPress={() => setAddingRound(false)} style={roundStyles.cancel}><Text style={roundStyles.cancelText}>Peruuta</Text></Pressable>
</View>
</View> : null}<Text style={styles.sectionTitle}>Joukkueet</Text>
<View style={styles.inline}>
<TextInput value={teamSearch} onChangeText={setTeamSearch} placeholder="Hae joukkueen nimellä" placeholderTextColor={colors.muted} style={[styles.input, styles.inlineInput]} />
</View>
{teamSearch.trim().length >= 2 ? teams.filter((team) => team.name.toLocaleLowerCase().includes(teamSearch.trim().toLocaleLowerCase())).map((team) => <Pressable key={team.id} onPress={() => void loadRoster(team)} style={[rosterStyles.teamSearchResult, managedTeam?.id === team.id && rosterStyles.teamSearchResultSelected]}><Text style={rosterStyles.teamSearchName}>{team.name}</Text><Text style={rosterStyles.teamSearchMeta}>Taso {team.skill_level}</Text></Pressable>) : null}
{managedTeam ? <View style={rosterStyles.rosterPanel}>
<View style={rosterStyles.rosterTop}>
<Text style={rosterStyles.rosterTitle}>{managedTeam.name}</Text>
<Pressable onPress={closeManagedTeam}><Text style={rosterStyles.rosterClose}>✕ Sulje</Text></Pressable>
</View>
<Text style={rosterStyles.rosterHint}>Valitse kapteeni painamalla pelaajaa. Pelaajamuutokset ovat poikkeustilanteita varten.</Text>
{roster.map((player) => <View key={player.id} style={rosterStyles.rosterPlayer}><Pressable onPress={() => player.isActive && setRosterCaptainId(player.id)} style={rosterStyles.captainChoice} disabled={!player.isActive}><Text style={[rosterStyles.captainChoiceText, rosterCaptainId === player.id && rosterStyles.captainChoiceTextSelected]}>{player.name}{rosterCaptainId === player.id ? " · Kapteeni" : ""}{!player.isActive ? " · Odottaa hyväksyntää" : ""}</Text></Pressable><Pressable onPress={() => void updateRoster(player.id, null)}><Text style={styles.delete}>Poista</Text></Pressable></View>)}
<Pressable onPress={() => void updateRoster(null, null)} style={rosterStyles.rosterSave}><Text style={rosterStyles.rosterSaveText}>Tallenna muutokset</Text></Pressable>
{roster.length < 3 ? <><Text style={rosterStyles.rosterLabel}>LISÄÄ KORVAAVA PELAAJA</Text><View style={styles.inline}><TextInput value={playerSearch} onChangeText={setPlayerSearch} placeholder="Hae pelaajan nimellä" placeholderTextColor={colors.muted} style={[styles.input, styles.inlineInput]} /><Pressable onPress={() => void searchRosterPlayers()} disabled={searchingPlayers} style={styles.small}>{searchingPlayers ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.smallText}>Hae</Text>}</Pressable></View>{playerSearchResults.map((player) => <Pressable key={player.id} onPress={() => void updateRoster(null, player.id)} style={styles.add}><Text style={styles.addText}>+ Lisää {player.first_name} {player.last_name}</Text></Pressable>)}</> : <Text style={rosterStyles.rosterHint}>Joukkueessa on jo kolme pelaajaa. Poista pelaaja ennen uuden lisäämistä.</Text>}
{confirmTeamDelete ? <View style={rosterStyles.deleteConfirm}><Text style={rosterStyles.deleteConfirmText}>Poistetaanko joukkue sekä sen lohkojaot, ottelut ja pelaajajäsenyydet?</Text><View style={styles.inline}><Pressable onPress={() => void deleteManagedTeam()} style={rosterStyles.confirmDelete}><Text style={rosterStyles.confirmDeleteText}>Vahvista poisto</Text></Pressable><Pressable onPress={() => setConfirmTeamDelete(false)} style={rosterStyles.cancelDelete}><Text style={rosterStyles.cancelDeleteText}>Peruuta</Text></Pressable></View></View> : <Pressable onPress={() => setConfirmTeamDelete(true)} style={rosterStyles.rosterDelete}><Text style={rosterStyles.rosterDeleteText}>Poista joukkue sarjasta</Text></Pressable>}
</View> : null}<Text style={styles.sectionTitle}>Lohkot</Text>
<View style={styles.inline}>
<TextInput value={groupName} onChangeText={setGroupName} placeholder="Uuden lohkon nimi" placeholderTextColor={colors.muted} style={[styles.input, styles.inlineInput]} />
<Pressable onPress={createGroup} style={styles.small}>
<Text style={styles.smallText}>Luo</Text>
</Pressable>
 </View>{groups.map((group) => { const groupAssignments = assignments.filter((assignment) => assignment.group_id === group.id); const assignedIds = new Set(assignments.map((assignment) => assignment.team_id)); const available = teams.filter((team) => !assignedIds.has(team.id)); const isExpanded = league.status !== "ongoing" || expandedGroupId === group.id; return <View key={group.id} style={styles.group}>
<Pressable onPress={() => league.status === "ongoing" && setExpandedGroupId((current) => current === group.id ? null : group.id)} style={styles.groupTop} disabled={league.status !== "ongoing"} accessibilityRole={league.status === "ongoing" ? "button" : undefined} accessibilityState={{ expanded: isExpanded }}>
<Text style={styles.groupName}>{group.name}{league.status === "ongoing" ? isExpanded ? " −" : " +" : ""}</Text>
<Pressable onPress={() => removeGroup(group.id)}>
<Text style={styles.delete}>Poista lohko</Text>
</Pressable>
</Pressable>
{isExpanded ? <><Text style={styles.status}>{group.status}</Text>{groupAssignments.map((assignment) => { const team = teams.find((item) => item.id === assignment.team_id); return <View key={assignment.id} style={styles.item}>
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
</Pressable>)}<GroupMatches groupId={group.id} isAdmin /></> : null}</View>; })}{(league.status === "registration_open" || league.status === "registration_closed") ? <Pressable onPress={() => void updateStatus("ongoing")} style={styles.start}>
<Text style={styles.startText}>Käynnistä sarja</Text>
</Pressable> : null}
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

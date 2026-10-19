import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Fragment, useCallback, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import AdminCityPicker from "../../../components/AdminCityPicker";
import ScreenHeader from "../../../components/ScreenHeader";
import { useAppScreenRestriction } from "../../../hooks/useAppScreenRestriction";
import { supabase } from "../../../lib/supabase";
import { formatFinnishDate, parseFinnishDate } from "../../../lib/dates";
import { PARTICIPATION_FEE } from "../../../lib/stripe";
import { colors } from "../../../theme";
import GroupMatches from "../../../components/GroupMatches";

type League = { id: string; name: string; status: string; start_date: string; end_date: string | null; registration_deadline: string | null; registration_opens_at: string | null; city_id: string };
type Venue = { id: string; name: string };
type Group = { id: string; name: string; status: string; category: string };
type Team = { id: string; name: string; skill_level: string; skill_description: string | null; category: string };
const teamSkillLevelOrder = ["A", "B", "C", "D", "E", "Aloittelija"] as const;
const categoryOrder = ["avoin", "mixty"] as const;
const categoryLabels: Record<string, string> = { avoin: "Avoin", mixty: "Mixty" };
type Assignment = { id: string; group_id: string; team_id: string };
type LeagueRound = { id: string; name: string; start_date: string; end_date: string; round_type: "regular" | "qualification"; status: "draft" | "active" | "completed" };
type RosterPlayer = { id: string; name: string; isCaptain: boolean; isActive: boolean; hasPaid: boolean };
type PlayerSearchResult = { id: string; first_name: string; last_name: string; player_code: number };
const statusLabels: Record<string, string> = { upcoming: "Tuleva (ei vielä auki)", registration_open: "Ilmoittautuminen auki", registration_closed: "Ilmoittautuminen lukittu", ongoing: "Käynnissä", finished: "Päättynyt" };

const teamInfoStyles = StyleSheet.create({
  actions: { flexDirection: "row", alignItems: "center", gap: 12 },
  infoButton: { width: 24, height: 24, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.mint },
  infoText: { color: colors.green, fontSize: 14, fontWeight: "900" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 },
  modal: { backgroundColor: colors.surface, borderRadius: 12, padding: 20 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  modalTitle: { color: colors.ink, flex: 1, fontSize: 20, fontWeight: "800" },
  close: { color: colors.green, fontSize: 24, fontWeight: "800", lineHeight: 24 },
  detailLabel: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginTop: 18 },
  detailValue: { color: colors.ink, fontSize: 15, lineHeight: 22, marginTop: 5 },
  membersLoading: { marginTop: 8, alignSelf: "flex-start" },
  memberRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 8 },
  memberName: { color: colors.ink, fontSize: 14, fontWeight: "700", flex: 1 },
  memberPaid: { color: colors.greenBright, fontSize: 12, fontWeight: "800" },
  memberUnpaid: { color: colors.coral, fontSize: 12, fontWeight: "800" },
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
  rosterPlayerActions: { alignItems: "flex-end", gap: 6 },
  paidText: { color: colors.greenBright, fontSize: 11, fontWeight: "800", marginTop: 3 },
  unpaidText: { color: colors.coral, fontSize: 11, fontWeight: "800", marginTop: 3 },
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
  useAppScreenRestriction();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [league, setLeague] = useState<League | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [deadline, setDeadline] = useState("");
  const [opensDate, setOpensDate] = useState("");
  const [opensKnown, setOpensKnown] = useState(true);
  const [cityId, setCityId] = useState<string | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [newVenueName, setNewVenueName] = useState("");
  const [rounds, setRounds] = useState<LeagueRound[]>([]);
  const [newRound, setNewRound] = useState({ name: "", startDate: "", endDate: "", roundType: "regular" as LeagueRound["round_type"] });
  const [addingRound, setAddingRound] = useState(false);
  const [editingRound, setEditingRound] = useState<LeagueRound | null>(null);
  const [roundForm, setRoundForm] = useState({ name: "", startDate: "", endDate: "" });
  const [groupName, setGroupName] = useState("");
  const [newGroupCategory, setNewGroupCategory] = useState("avoin");
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [teamSearch, setTeamSearch] = useState("");
  const [managedTeam, setManagedTeam] = useState<Team | null>(null);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [rosterCaptainId, setRosterCaptainId] = useState<string | null>(null);
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerSearchResults, setPlayerSearchResults] = useState<PlayerSearchResult[]>([]);
  const [searchingPlayers, setSearchingPlayers] = useState(false);
  const [confirmTeamDelete, setConfirmTeamDelete] = useState(false);
  const [confirmLeagueDelete, setConfirmLeagueDelete] = useState(false);
  // Deleting a group (cascades its matches and chat) or pulling a team out
  // of one can't be undone, so both need a second tap.
  const [confirmGroupDeleteId, setConfirmGroupDeleteId] = useState<string | null>(null);
  const [confirmAssignmentDeleteId, setConfirmAssignmentDeleteId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [selectedTeamMembers, setSelectedTeamMembers] = useState<{ id: string; name: string; skillLevel: string | null; hasPaid: boolean }[]>([]);
  const [loadingSelectedTeam, setLoadingSelectedTeam] = useState(false);

  const load = async () => {
    if (!supabase || !id) return;
    const client = supabase;
    const [{ data: leagueData }, { data: groupData }, { data: teamData }, { data: roundData }, { data: venueData }] = await Promise.all([
      client.from("leagues").select("id,name,status,start_date,end_date,registration_deadline,registration_opens_at,city_id").eq("id", id).single(),
      client.from("groups").select("id,name,status,category").eq("league_id", id),
      client.from("teams").select("id,name,skill_level,skill_description,category").eq("league_id", id).order("name"),
      client.from("league_rounds").select("id,name,start_date,end_date,round_type,status").eq("league_id", id).order("start_date"),
      client.from("league_venues").select("id,name").eq("league_id", id).order("name"),
    ]);
    const groupIds = (groupData ?? []).map((group) => group.id);
    const { data: assignmentData } = groupIds.length ? await client.from("group_teams").select("id,group_id,team_id").in("group_id", groupIds) : { data: [] };
    setLeague(leagueData); setStartDate(formatFinnishDate(leagueData?.start_date)); setEndDate(leagueData?.end_date ? formatFinnishDate(leagueData.end_date) : ""); setDeadline(leagueData?.registration_deadline ? formatFinnishDate(leagueData.registration_deadline) : ""); setOpensDate(leagueData?.registration_opens_at ? formatFinnishDate(leagueData.registration_opens_at) : ""); setOpensKnown(leagueData?.status !== "upcoming" || !!leagueData?.registration_opens_at); setCityId(leagueData?.city_id ?? null); setVenues(venueData ?? []); setRounds(roundData ?? []); setGroups((groupData ?? []).slice().sort((a, b) => categoryOrder.indexOf(a.category as typeof categoryOrder[number]) - categoryOrder.indexOf(b.category as typeof categoryOrder[number]) || a.name.localeCompare(b.name, "fi", { numeric: true }))); setTeams((teamData ?? []).slice().sort((a, b) => categoryOrder.indexOf(a.category as typeof categoryOrder[number]) - categoryOrder.indexOf(b.category as typeof categoryOrder[number]) || teamSkillLevelOrder.indexOf(a.skill_level as typeof teamSkillLevelOrder[number]) - teamSkillLevelOrder.indexOf(b.skill_level as typeof teamSkillLevelOrder[number]) || a.name.localeCompare(b.name))); setAssignments(assignmentData ?? []); setLoading(false);
  };
  useFocusEffect(useCallback(() => { void load(); }, [id]));
  const saveChanges = async () => { if (!supabase || !league) return; const start = parseFinnishDate(startDate); const end = parseFinnishDate(endDate); const registrationDeadline = deadline.trim() ? parseFinnishDate(deadline) : null; const registrationOpensAt = opensKnown && opensDate.trim() ? parseFinnishDate(opensDate) : null; if (!start || !end) { setMessage("Anna liigan alku- ja loppupäivä muodossa D.M.YYYY."); return; } if (end < start) { setMessage("Liigan loppupäivä ei voi olla ennen aloituspäivää."); return; } if (deadline.trim() && !registrationDeadline) { setMessage("Anna deadline muodossa D.M.YYYY."); return; } if (registrationDeadline && registrationDeadline > start) { setMessage("Deadline ei voi olla liigan alkamispäivän jälkeen."); return; } if (opensKnown && opensDate.trim() && !registrationOpensAt) { setMessage("Anna ilmoittautumisen avautumispäivä muodossa D.M.YYYY."); return; } if (registrationOpensAt && registrationOpensAt > start) { setMessage("Ilmoittautumisen avautuminen ei voi olla liigan alkamispäivän jälkeen."); return; } const outOfRangeRound = rounds.find((round) => round.start_date < start || round.end_date > end); if (outOfRangeRound) { setMessage(`Liigan päivämäärien tulee sisältää kaikki kierrokset. Kierros "${outOfRangeRound.name}" on ${formatFinnishDate(outOfRangeRound.start_date)} - ${formatFinnishDate(outOfRangeRound.end_date)}. Muokkaa tai poista kierros ensin.`); return; } const { error } = await supabase.from("leagues").update({ name: league.name.trim(), city_id: cityId ?? league.city_id, start_date: start, end_date: end, registration_deadline: registrationDeadline, registration_opens_at: registrationOpensAt }).eq("id", league.id); if (error) setMessage(error.message.includes("round dates") ? "Liigan päivämäärien tulee sisältää kaikki kierrokset. Muokkaa tai poista kierrokset, jotka jäävät uusien päivämäärien ulkopuolelle." : `Tallennus epäonnistui: ${error.message}`); else { setLeague({ ...league, city_id: cityId ?? league.city_id, start_date: start, end_date: end, registration_deadline: registrationDeadline, registration_opens_at: registrationOpensAt }); setMessage("Liigan muutokset tallennettu."); } };
  const addVenue = async () => { if (!supabase || !league || !newVenueName.trim()) return; const { error } = await supabase.from("league_venues").insert({ league_id: league.id, name: newVenueName.trim() }); if (error) { setMessage(`Pelipaikan lisäys epäonnistui: ${error.message}`); return; } setNewVenueName(""); await load(); };
  const removeVenue = async (venueId: string) => { if (!supabase) return; const { error } = await supabase.from("league_venues").delete().eq("id", venueId); if (error) { setMessage(`Pelipaikan poisto epäonnistui: ${error.message}`); return; } await load(); };
  const createRound = async () => { if (!supabase || !league) return; const start = parseFinnishDate(newRound.startDate); const end = parseFinnishDate(newRound.endDate); const leagueStart = parseFinnishDate(startDate); const leagueEnd = parseFinnishDate(endDate); if (!newRound.name.trim() || !start || !end) { setMessage("Anna kierrokselle nimi sekä alku- ja loppupäivä."); return; } if (!leagueStart || !leagueEnd || start < leagueStart || end > leagueEnd || end < start) { setMessage("Kierroksen päivämäärien tulee olla liigan päivämäärien sisällä."); return; } const { error } = await supabase.from("league_rounds").insert({ league_id: league.id, name: newRound.name.trim(), start_date: start, end_date: end, round_type: newRound.roundType }); if (error) { setMessage(`Kierroksen lisäys epäonnistui: ${error.message}`); return; } setNewRound({ name: "", startDate: "", endDate: "", roundType: "regular" }); setAddingRound(false); await load(); };
  const startEditingRound = (round: LeagueRound) => { setAddingRound(false); setEditingRound(round); setRoundForm({ name: round.name, startDate: formatFinnishDate(round.start_date), endDate: formatFinnishDate(round.end_date) }); };
  const updateRound = async () => { if (!supabase || !league || !editingRound) return; const start = parseFinnishDate(roundForm.startDate); const end = parseFinnishDate(roundForm.endDate); const leagueStart = parseFinnishDate(startDate); const leagueEnd = parseFinnishDate(endDate); if (!roundForm.name.trim() || !start || !end) { setMessage("Anna kierrokselle nimi sekä alku- ja loppupäivä."); return; } if (!leagueStart || !leagueEnd || start < leagueStart || end > leagueEnd || end < start) { setMessage("Kierroksen päivämäärien tulee olla liigan päivämäärien sisällä."); return; } const { error } = await supabase.from("league_rounds").update({ name: roundForm.name.trim(), start_date: start, end_date: end }).eq("id", editingRound.id); if (error) { setMessage(`Kierroksen muokkaus epäonnistui: ${error.message}`); return; } setEditingRound(null); setMessage("Kierroksen muutokset tallennettu."); await load(); };
  const removeRound = async (roundId: string) => { if (!supabase) return; const { error } = await supabase.from("league_rounds").delete().eq("id", roundId); if (error) setMessage(`Kierroksen poisto epäonnistui: ${error.message}`); else await load(); };
  const updateStatus = async (status: string) => {
    if (!supabase || !league) return;
    if (status === "ongoing" && (groups.length === 0 || groups.some((group) => assignments.filter((assignment) => assignment.group_id === group.id).length < 2))) { setMessage("Luo vähintään yksi lohko ja lisää jokaiseen lohkoon vähintään kaksi joukkuetta ennen liigan käynnistämistä."); return; }
    if (status === "registration_closed") {
      const { data, error } = await supabase.rpc("lock_league_registration", { target_league_id: league.id });
      if (error) { setMessage(`Liigan tilan muuttaminen epäonnistui: ${error.message}`); return; }
      setLeague({ ...league, status });
      await load();
      setMessage(data ? `Ilmoittautuminen lukittu. ${data} joukkuetta poistettiin, koska niillä ei ollut kahta hyväksynyttä pelaajaa.` : "Ilmoittautuminen lukittu.");
      return;
    }
    const { error } = await supabase.from("leagues").update({ status }).eq("id", league.id);
    if (error) setMessage(`Liigan tilan muuttaminen epäonnistui: ${error.message}`); else { setLeague({ ...league, status }); await load(); setMessage(status === "ongoing" ? "Liiga käynnistetty. Aloita ensimmäinen tavallinen kierros alta." : "Liigan tila päivitetty."); }
  };
  const startRound = async (round: LeagueRound) => { if (!supabase) return; const functionName = round.round_type === "qualification" ? "start_qualification_round" : "start_regular_round"; const { error } = await supabase.rpc(functionName, { target_round_id: round.id }); if (error) setMessage(`Kierroksen aloitus epäonnistui: ${error.message}`); else { setMessage(`${round.name} aloitettu.`); await load(); } };
  const completeRound = async (round: LeagueRound) => { if (!supabase) return; const { error } = await supabase.rpc("complete_league_round", { target_round_id: round.id }); if (error) setMessage(`Kierroksen päättäminen epäonnistui: ${error.message}`); else { setMessage(round.round_type === "qualification" ? "Karsintakierros päätetty ja lohkot päivitetty." : "Tavallinen kierros päätetty. Voit aloittaa karsintakierroksen."); await load(); } };
  const createGroup = async () => { if (!supabase || !league || !groupName.trim()) return; const { error } = await supabase.from("groups").insert({ league_id: league.id, name: groupName.trim(), status: "draft", category: newGroupCategory }); if (error) setMessage(error.message); else { setGroupName(""); await load(); } };
  const autoAssignGroups = async () => { if (!supabase || !league) return; setAutoAssigning(true); setMessage(""); const { error } = await supabase.rpc("admin_auto_assign_groups", { target_league_id: league.id }); setAutoAssigning(false); if (error) { setMessage(`Lohkojen muodostus epäonnistui: ${error.message}`); return; } await load(); setMessage("Lohkot muodostettu automaattisesti taitotason mukaan."); };
  const removeGroup = async (groupId: string) => { if (!supabase) return; const { error } = await supabase.from("groups").delete().eq("id", groupId); if (error) setMessage(error.message); else await load(); };
  const assignTeam = async (groupId: string, teamId: string) => { if (!supabase) return; const { error } = await supabase.from("group_teams").insert({ group_id: groupId, team_id: teamId }); if (error) setMessage(error.message); else await load(); };
  const removeAssignment = async (assignmentId: string) => { if (!supabase) return; const { error } = await supabase.from("group_teams").delete().eq("id", assignmentId); if (error) setMessage(error.message); else await load(); };
  const closeManagedTeam = () => { setManagedTeam(null); setRoster([]); setRosterCaptainId(null); setTeamSearch(""); setPlayerSearch(""); setPlayerSearchResults([]); setConfirmTeamDelete(false); };
  const loadRoster = async (team: Team) => { if (!supabase) return; const [{ data, error }, { data: paymentData }] = await Promise.all([supabase.from("team_members").select("user_id,is_captain,status,profiles(first_name,last_name)").eq("team_id", team.id), supabase.from("payments").select("user_id,payment_status").eq("team_id", team.id)]); if (error) { setMessage(`Joukkueen pelaajien lataus epäonnistui: ${error.message}`); return; } const paidUserIds = new Set((paymentData ?? []).filter((payment) => payment.payment_status === "paid").map((payment) => payment.user_id)); const players = ((data ?? []) as { user_id: string; is_captain: boolean; status: string; profiles: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null }[]).map((member) => { const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles; return { id: member.user_id, name: profile ? `${profile.first_name} ${profile.last_name}` : "Pelaaja", isCaptain: member.is_captain, isActive: member.status === "active", hasPaid: paidUserIds.has(member.user_id) }; }); setManagedTeam(team); setRoster(players); setRosterCaptainId(players.find((player) => player.isCaptain)?.id ?? null); setPlayerSearch(""); setPlayerSearchResults([]); };

  const openTeamInfo = async (team: Team) => {
    setSelectedTeam(team);
    setSelectedTeamMembers([]);
    if (!supabase) return;
    setLoadingSelectedTeam(true);
    const [{ data, error }, { data: paymentData }] = await Promise.all([
      supabase.from("team_members").select("user_id,profiles(first_name,last_name,skill_level)").eq("team_id", team.id).eq("status", "active"),
      supabase.from("payments").select("user_id,payment_status").eq("team_id", team.id),
    ]);
    setLoadingSelectedTeam(false);
    if (error) { setMessage(`Joukkueen pelaajien lataus epäonnistui: ${error.message}`); return; }
    const paidUserIds = new Set((paymentData ?? []).filter((payment) => payment.payment_status === "paid").map((payment) => payment.user_id));
    const members = ((data ?? []) as { user_id: string; profiles: { first_name: string; last_name: string; skill_level: string | null } | { first_name: string; last_name: string; skill_level: string | null }[] | null }[]).map((member) => {
      const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
      return { id: member.user_id, name: profile ? `${profile.first_name} ${profile.last_name}` : "Pelaaja", skillLevel: profile?.skill_level ?? null, hasPaid: paidUserIds.has(member.user_id) };
    });
    setSelectedTeamMembers(members);
  };

  const togglePlayerPaid = async (playerId: string, paid: boolean) => {
    if (!supabase || !managedTeam) return;
    const { error } = await supabase.from("payments").upsert({ team_id: managedTeam.id, user_id: playerId, amount: PARTICIPATION_FEE, payment_status: paid ? "paid" : "pending", payment_method: "split", paid_at: paid ? new Date().toISOString() : null }, { onConflict: "team_id,user_id" });
    if (error) { setMessage(`Maksutilan päivitys epäonnistui: ${error.message}`); return; }
    setRoster((current) => current.map((player) => player.id === playerId ? { ...player, hasPaid: paid } : player));
  };
  const searchRosterPlayers = async () => { if (!supabase || !league || !managedTeam || playerSearch.trim().length < 2) { setMessage("Kirjoita pelaajan nimestä vähintään kaksi merkkiä."); return; } setSearchingPlayers(true); const { data, error } = await supabase.rpc("search_profiles_by_name", { search_query: playerSearch.trim(), target_league_id: league.id, target_category: managedTeam.category }); setSearchingPlayers(false); if (error) { setMessage(`Pelaajahaku epäonnistui: ${error.message}`); return; } setPlayerSearchResults(((data ?? []) as PlayerSearchResult[]).filter((player) => !roster.some((member) => member.id === player.id))); };
  const updateRoster = async (removedUserId: string | null, addedUserId: string | null) => { if (!supabase || !managedTeam) return; const { error } = await supabase.rpc("admin_update_team_roster", { target_team_id: managedTeam.id, removed_user_id: removedUserId, added_user_id: addedUserId, new_captain_id: rosterCaptainId }); if (error) { setMessage(`Joukkueen pelaajien muokkaus epäonnistui: ${error.message}`); return; } if (!removedUserId && !addedUserId) { setManagedTeam(null); setRoster([]); setRosterCaptainId(null); setTeamSearch(""); setPlayerSearch(""); setPlayerSearchResults([]); } else await loadRoster(managedTeam); await load(); };
  const deleteManagedTeam = async () => { if (!supabase || !managedTeam) return; const { error } = await supabase.rpc("admin_delete_team", { target_team_id: managedTeam.id }); if (error) { setMessage(`Joukkueen poisto epäonnistui: ${error.message}`); return; } setManagedTeam(null); setRoster([]); setRosterCaptainId(null); setTeamSearch(""); setPlayerSearch(""); setPlayerSearchResults([]); setConfirmTeamDelete(false); await load(); };
  const deleteLeague = async () => { if (!supabase || !league) return; const { error } = await supabase.rpc("delete_league_with_data", { target_league_id: league.id }); if (error) setMessage(`Poisto epäonnistui: ${error.message}`); else router.replace("/admin" as never); };
  if (loading) return <View style={styles.loading}>
<ActivityIndicator color={colors.lime} />
</View>;
  if (!league) return <View style={styles.loading}>
<Text style={styles.error}>Liigaa ei löytynyt.</Text>
</View>;
  return <>
<View style={styles.page}>
<ScreenHeader />
<ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
<View style={styles.body}>
<Pressable onPress={() => router.replace("/admin" as never)} style={styles.back}>
<Text style={styles.backText}>‹ Takaisin liigoihin</Text>
</Pressable>
<Pressable onPress={() => router.push(`/admin/league/${league.id}/register-team` as never)} style={styles.secondary}>
<Text style={styles.secondaryText}>Lisää joukkue liigaan</Text>
</Pressable>
<Text style={styles.sectionTitle}>Liigan tiedot</Text>
<TextInput value={league.name} onChangeText={(value) => setLeague({ ...league, name: value })} placeholder="Liigan nimi" placeholderTextColor={colors.muted} style={styles.input} />
<Text style={styles.label}>KAUPUNKI</Text>
<AdminCityPicker value={cityId} onChange={setCityId} style={styles.cityPicker} />
{league.status !== "finished" && cityId !== league.city_id ? <Text style={styles.status}>Liigan pelaajat siirtyvät tallennettaessa uuteen kaupunkiin.</Text> : null}
<TextInput value={startDate} onChangeText={setStartDate} placeholder="D.M.YYYY" placeholderTextColor={colors.muted} style={styles.input} />
<TextInput value={endDate} onChangeText={setEndDate} placeholder="Liigan loppupäivä D.M.YYYY" placeholderTextColor={colors.muted} style={styles.input} />
<TextInput value={deadline} onChangeText={setDeadline} placeholder="Deadline D.M.YYYY (valinnainen)" placeholderTextColor={colors.muted} style={styles.input} />
<Text style={styles.label}>ILMOITTAUTUMISEN AVAUTUMISPÄIVÄ</Text>
<View style={styles.publishRow}>
  <Pressable onPress={() => setOpensKnown(true)} style={[roundStyles.typeOption, opensKnown && roundStyles.typeOptionSelected]}><Text style={[roundStyles.typeOptionText, opensKnown && roundStyles.typeOptionTextSelected]}>Päivämäärä tiedossa</Text></Pressable>
  <Pressable onPress={() => { setOpensKnown(false); setOpensDate(""); }} style={[roundStyles.typeOption, !opensKnown && roundStyles.typeOptionSelected]}><Text style={[roundStyles.typeOptionText, !opensKnown && roundStyles.typeOptionTextSelected]}>Ei tiedossa</Text></Pressable>
</View>
{opensKnown ? <TextInput value={opensDate} onChangeText={setOpensDate} placeholder="D.M.YYYY" placeholderTextColor={colors.muted} style={styles.input} /> : <Text style={styles.hint}>Käyttäjille näkyy &ldquo;ilmoittautuminen aukeaa pian&rdquo; tarkan päivän sijaan.</Text>}
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
<Text style={styles.status}>Tila: {statusLabels[league.status] ?? league.status}</Text>
{league.status === "upcoming" ? <>
<Text style={styles.message}>{league.registration_opens_at ? `Käyttäjät näkevät liigan ja ilmoittautumisen avautumispäivän (${formatFinnishDate(league.registration_opens_at)}), mutta eivät voi vielä ilmoittautua.` : "Käyttäjät näkevät liigan tulevana, mutta eivät voi vielä ilmoittautua. Aseta yllä ilmoittautumisen avautumispäivä, jotta se näkyy heille."}</Text>
<Pressable onPress={() => void updateStatus("registration_open")} style={styles.start}>
<Text style={styles.startText}>Avaa ilmoittautuminen nyt</Text>
</Pressable>
</> : null}
{league.status === "registration_open" ? <Pressable onPress={() => void updateStatus("registration_closed")} style={styles.secondary}>
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
<TextInput value={roundForm.startDate} onChangeText={(value) => setRoundForm((current) => ({ ...current, startDate: value }))} placeholder="Alkaa D.M.YYYY" placeholderTextColor={colors.muted} style={roundStyles.input} />
<TextInput value={roundForm.endDate} onChangeText={(value) => setRoundForm((current) => ({ ...current, endDate: value }))} placeholder="Päättyy D.M.YYYY" placeholderTextColor={colors.muted} style={roundStyles.input} />
<View style={roundStyles.actions}>
<Pressable onPress={() => void updateRound()} style={roundStyles.save}><Text style={roundStyles.saveText}>Tallenna muutokset</Text></Pressable>
<Pressable onPress={() => setEditingRound(null)} style={roundStyles.cancel}><Text style={roundStyles.cancelText}>Peruuta</Text></Pressable>
</View>
</View> : null}
</View>)}{addingRound ? <View style={roundStyles.editor}>
<TextInput value={newRound.name} onChangeText={(value) => setNewRound((current) => ({ ...current, name: value }))} placeholder="Kierroksen nimi" placeholderTextColor={colors.muted} style={roundStyles.input} />
<TextInput value={newRound.startDate} onChangeText={(value) => setNewRound((current) => ({ ...current, startDate: value }))} placeholder="Alkaa D.M.YYYY" placeholderTextColor={colors.muted} style={roundStyles.input} />
<TextInput value={newRound.endDate} onChangeText={(value) => setNewRound((current) => ({ ...current, endDate: value }))} placeholder="Päättyy D.M.YYYY" placeholderTextColor={colors.muted} style={roundStyles.input} />
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
{teamSearch.trim().length >= 2 ? teams.filter((team) => team.name.toLocaleLowerCase().includes(teamSearch.trim().toLocaleLowerCase())).map((team) => <Pressable key={team.id} onPress={() => void loadRoster(team)} style={[rosterStyles.teamSearchResult, managedTeam?.id === team.id && rosterStyles.teamSearchResultSelected]}><Text style={rosterStyles.teamSearchName}>{team.name}</Text><Text style={rosterStyles.teamSearchMeta}>{categoryLabels[team.category] ?? team.category} · Taso {team.skill_level}</Text></Pressable>) : null}
{managedTeam ? <View style={rosterStyles.rosterPanel}>
<View style={rosterStyles.rosterTop}>
<Text style={rosterStyles.rosterTitle}>{managedTeam.name}</Text>
<Pressable onPress={closeManagedTeam}><Text style={rosterStyles.rosterClose}>✕ Sulje</Text></Pressable>
</View>
<Text style={rosterStyles.rosterHint}>Valitse kapteeni painamalla pelaajaa. Pelaajamuutokset ovat poikkeustilanteita varten.</Text>
{roster.map((player) => <View key={player.id} style={rosterStyles.rosterPlayer}><Pressable onPress={() => player.isActive && setRosterCaptainId(player.id)} style={rosterStyles.captainChoice} disabled={!player.isActive}><Text style={[rosterStyles.captainChoiceText, rosterCaptainId === player.id && rosterStyles.captainChoiceTextSelected]}>{player.name}{rosterCaptainId === player.id ? " · Kapteeni" : ""}{!player.isActive ? " · Odottaa hyväksyntää" : ""}</Text><Text style={player.hasPaid ? rosterStyles.paidText : rosterStyles.unpaidText}>{player.hasPaid ? "Maksettu" : "Ei maksettu"}</Text></Pressable><View style={rosterStyles.rosterPlayerActions}><Pressable onPress={() => void togglePlayerPaid(player.id, !player.hasPaid)}><Text style={styles.delete}>{player.hasPaid ? "Merkitse maksamattomaksi" : "Merkitse maksetuksi"}</Text></Pressable><Pressable onPress={() => void updateRoster(player.id, null)}><Text style={styles.delete}>Poista</Text></Pressable></View></View>)}
<Pressable onPress={() => void updateRoster(null, null)} style={rosterStyles.rosterSave}><Text style={rosterStyles.rosterSaveText}>Tallenna muutokset</Text></Pressable>
{roster.length < 3 ? <><Text style={rosterStyles.rosterLabel}>LISÄÄ KORVAAVA PELAAJA</Text><View style={styles.inline}><TextInput value={playerSearch} onChangeText={setPlayerSearch} placeholder="Hae pelaajan nimellä" placeholderTextColor={colors.muted} style={[styles.input, styles.inlineInput]} /><Pressable onPress={() => void searchRosterPlayers()} disabled={searchingPlayers} style={styles.small}>{searchingPlayers ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.smallText}>Hae</Text>}</Pressable></View>{playerSearchResults.map((player) => <Pressable key={player.id} onPress={() => void updateRoster(null, player.id)} style={styles.add}><Text style={styles.addText}>+ Lisää {player.first_name} {player.last_name} · #{player.player_code}</Text></Pressable>)}</> : <Text style={rosterStyles.rosterHint}>Joukkueessa on jo kolme pelaajaa. Poista pelaaja ennen uuden lisäämistä.</Text>}
{confirmTeamDelete ? <View style={rosterStyles.deleteConfirm}><Text style={rosterStyles.deleteConfirmText}>Poistetaanko joukkue sekä sen lohkojaot, ottelut ja pelaajajäsenyydet?</Text><View style={styles.inline}><Pressable onPress={() => void deleteManagedTeam()} style={rosterStyles.confirmDelete}><Text style={rosterStyles.confirmDeleteText}>Vahvista poisto</Text></Pressable><Pressable onPress={() => setConfirmTeamDelete(false)} style={rosterStyles.cancelDelete}><Text style={rosterStyles.cancelDeleteText}>Peruuta</Text></Pressable></View></View> : <Pressable onPress={() => setConfirmTeamDelete(true)} style={rosterStyles.rosterDelete}><Text style={rosterStyles.rosterDeleteText}>Poista joukkue liigasta</Text></Pressable>}
</View> : null}<Text style={styles.sectionTitle}>Lohkot</Text>
{/* admin_auto_assign_groups only allows this before the league starts. */}
{league.status === "registration_open" || league.status === "registration_closed" ? <Pressable onPress={() => void autoAssignGroups()} disabled={autoAssigning || teams.length === 0} style={[styles.secondary, autoAssigning && styles.primaryDisabled]}>{autoAssigning ? <ActivityIndicator color={colors.green} /> : <Text style={styles.secondaryText}>Järjestä lohkot automaattisesti taitotason mukaan</Text>}</Pressable> : null}
<View style={styles.inline}>
<TextInput value={groupName} onChangeText={setGroupName} placeholder="Uuden lohkon nimi" placeholderTextColor={colors.muted} style={[styles.input, styles.inlineInput]} />
<Pressable onPress={createGroup} style={styles.small}>
<Text style={styles.smallText}>Luo</Text>
</Pressable>
 </View>
<View style={styles.categories}>{categoryOrder.map((value) => <Pressable key={value} onPress={() => setNewGroupCategory(value)} style={[styles.categoryOption, newGroupCategory === value && styles.categoryOptionSelected]}><Text style={[styles.categoryOptionText, newGroupCategory === value && styles.categoryOptionTextSelected]}>{categoryLabels[value]}</Text></Pressable>)}</View>
{groups.filter((group) => group.category === newGroupCategory).map((group) => { const groupAssignments = assignments.filter((assignment) => assignment.group_id === group.id); const assignedIds = new Set(assignments.map((assignment) => assignment.team_id)); const available = teams.filter((team) => !assignedIds.has(team.id) && team.category === group.category); const isExpanded = league.status !== "ongoing" || expandedGroupId === group.id; return <View key={group.id} style={styles.group}>
<Pressable onPress={() => league.status === "ongoing" && setExpandedGroupId((current) => current === group.id ? null : group.id)} style={styles.groupTop} disabled={league.status !== "ongoing"} accessibilityRole={league.status === "ongoing" ? "button" : undefined} accessibilityState={{ expanded: isExpanded }}>
<Text style={styles.groupName}>{categoryLabels[group.category] ?? group.category} · {group.name}{league.status === "ongoing" ? isExpanded ? " −" : " +" : ""}</Text>
<Pressable onPress={() => setConfirmGroupDeleteId(group.id)}>
<Text style={styles.delete}>Poista lohko</Text>
</Pressable>
</Pressable>
{confirmGroupDeleteId === group.id ? <View style={rosterStyles.deleteConfirm}><Text style={rosterStyles.deleteConfirmText}>Poistetaanko {group.name} pysyvästi? Lohkon ottelut, tulokset ja lohkochatin viestit poistuvat mukana.</Text><View style={styles.inline}><Pressable onPress={() => { setConfirmGroupDeleteId(null); void removeGroup(group.id); }} style={rosterStyles.confirmDelete}><Text style={rosterStyles.confirmDeleteText}>Vahvista poisto</Text></Pressable><Pressable onPress={() => setConfirmGroupDeleteId(null)} style={rosterStyles.cancelDelete}><Text style={rosterStyles.cancelDeleteText}>Peruuta</Text></Pressable></View></View> : null}
{isExpanded ? <><Text style={styles.status}>{group.status}</Text>{groupAssignments.map((assignment) => { const team = teams.find((item) => item.id === assignment.team_id); return <Fragment key={assignment.id}><View style={styles.item}>
<Text style={styles.itemText}>{team ? `${team.name} · Taso ${team.skill_level}` : "Joukkue"}</Text>
<View style={teamInfoStyles.actions}>
{team ? <Pressable onPress={() => void openTeamInfo(team)} style={teamInfoStyles.infoButton} accessibilityRole="button" accessibilityLabel={`Näytä joukkueen ${team.name} lisätiedot`}>
<Text style={teamInfoStyles.infoText}>i</Text>
</Pressable> : null}
<Pressable onPress={() => setConfirmAssignmentDeleteId(assignment.id)}>
<Text style={styles.delete}>Poista</Text>
</Pressable>
</View>
</View>
{confirmAssignmentDeleteId === assignment.id ? <View style={rosterStyles.deleteConfirm}><Text style={rosterStyles.deleteConfirmText}>Poistetaanko {team?.name ?? "joukkue"} lohkosta {group.name}?</Text><View style={styles.inline}><Pressable onPress={() => { setConfirmAssignmentDeleteId(null); void removeAssignment(assignment.id); }} style={rosterStyles.confirmDelete}><Text style={rosterStyles.confirmDeleteText}>Vahvista poisto</Text></Pressable><Pressable onPress={() => setConfirmAssignmentDeleteId(null)} style={rosterStyles.cancelDelete}><Text style={rosterStyles.cancelDeleteText}>Peruuta</Text></Pressable></View></View> : null}</Fragment>; })}{available.map((team) => <Pressable key={team.id} onPress={() => assignTeam(group.id, team.id)} style={styles.add}>
<Text style={styles.addText}>+ Lisää {team.name} · Taso {team.skill_level}</Text>
</Pressable>)}<GroupMatches groupId={group.id} isAdmin /></> : null}</View>; })}{(league.status === "registration_open" || league.status === "registration_closed") ? <Pressable onPress={() => void updateStatus("ongoing")} style={styles.start}>
<Text style={styles.startText}>Käynnistä liiga</Text>
</Pressable> : null}
{confirmLeagueDelete ? <View style={rosterStyles.deleteConfirm}><Text style={rosterStyles.deleteConfirmText}>Poistetaanko liiga {league.name} pysyvästi? Kaikki lohkot, ottelut ja joukkueet poistuvat mukana.</Text><View style={styles.inline}><Pressable onPress={() => void deleteLeague()} style={rosterStyles.confirmDelete}><Text style={rosterStyles.confirmDeleteText}>Vahvista poisto</Text></Pressable><Pressable onPress={() => setConfirmLeagueDelete(false)} style={rosterStyles.cancelDelete}><Text style={rosterStyles.cancelDeleteText}>Peruuta</Text></Pressable></View></View> : <Pressable onPress={() => setConfirmLeagueDelete(true)} style={styles.deleteLeague}>
<Text style={styles.deleteLeagueText}>Poista liiga</Text>
</Pressable>}
</View>
</ScrollView>
</View>
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
<Text style={teamInfoStyles.detailLabel}>PELAAJAT</Text>
{loadingSelectedTeam ? <ActivityIndicator color={colors.green} style={teamInfoStyles.membersLoading} /> : selectedTeamMembers.map((member) => <View key={member.id} style={teamInfoStyles.memberRow}>
<Text style={teamInfoStyles.memberName}>{member.name}{member.skillLevel ? ` · ${member.skillLevel}` : ""}</Text>
<Text style={member.hasPaid ? teamInfoStyles.memberPaid : teamInfoStyles.memberUnpaid}>{member.hasPaid ? "Maksettu" : "Ei maksettu"}</Text>
</View>)}
</Pressable>
</Pressable>
</Modal>
</>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.canvas }, scroll: { flex: 1 }, content: { paddingBottom: 40 }, loading: { flex: 1, backgroundColor: colors.green, justifyContent: "center", alignItems: "center" }, body: { padding: 22 }, back: { paddingVertical: 8 }, backText: { color: colors.greenBright, fontWeight: "800" }, sectionTitle: { color: colors.ink, fontSize: 21, fontWeight: "800", marginTop: 24, marginBottom: 12 }, input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12, color: colors.ink, padding: 13, marginBottom: 9 }, cityPicker: { marginBottom: 9 }, label: { color: colors.muted, fontSize: 9, letterSpacing: 1, fontWeight: "900", marginBottom: 7 }, publishRow: { flexDirection: "row", gap: 8, marginBottom: 9 }, hint: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 9 }, inline: { flexDirection: "row", gap: 8 }, inlineInput: { flex: 1 }, small: { backgroundColor: colors.green, borderRadius: 12, paddingHorizontal: 16, justifyContent: "center", marginBottom: 9 }, smallText: { color: colors.surface, fontWeight: "800" }, save: { backgroundColor: colors.green, borderRadius: 12, padding: 15, alignItems: "center", marginTop: 7 }, saveText: { color: colors.surface, fontWeight: "800" }, secondary: { borderWidth: 1, borderColor: colors.green, borderRadius: 12, alignItems: "center", padding: 13 }, secondaryText: { color: colors.green, fontWeight: "800" }, primaryDisabled: { opacity: 0.5 }, status: { color: colors.muted, fontSize: 12, marginVertical: 8 }, message: { color: colors.greenBright, fontSize: 12, marginTop: 8 }, error: { color: colors.coral }, group: { backgroundColor: colors.mint, padding: 14, borderRadius: 15, marginBottom: 10 }, groupTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, groupName: { color: colors.ink, fontSize: 16, fontWeight: "800" }, delete: { color: colors.coral, fontSize: 12, fontWeight: "800" }, item: { backgroundColor: colors.surface, padding: 11, borderRadius: 10, marginTop: 7, flexDirection: "row", justifyContent: "space-between" }, itemText: { color: colors.ink, fontWeight: "700" }, add: { borderWidth: 1, borderColor: colors.line, padding: 9, borderRadius: 9, marginTop: 7 }, addText: { color: colors.greenBright, fontWeight: "800", fontSize: 12 }, start: { backgroundColor: colors.greenBright, borderRadius: 12, padding: 16, alignItems: "center", marginTop: 18 }, startText: { color: colors.surface, fontWeight: "900" }, deleteLeague: { marginTop: 14, borderWidth: 1, borderColor: colors.coral, borderRadius: 12, padding: 14, alignItems: "center" }, deleteLeagueText: { color: colors.coral, fontWeight: "800", fontSize: 13 }, categories: { flexDirection: "row", gap: 8, marginBottom: 12 }, categoryOption: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 11, alignItems: "center", backgroundColor: colors.surface }, categoryOptionSelected: { backgroundColor: colors.green, borderColor: colors.green }, categoryOptionText: { color: colors.ink, fontWeight: "800", fontSize: 13 }, categoryOptionTextSelected: { color: colors.surface } });

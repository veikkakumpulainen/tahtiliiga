import { Redirect, router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import ScreenHeader from "../../components/ScreenHeader";
import { useAuth } from "../../hooks/useAuth";
import { useAppScreenRestriction } from "../../hooks/useAppScreenRestriction";
import { supabase } from "../../lib/supabase";
import { colors, shadow } from "../../theme";

type League = { id: string; name: string };
type Team = { id: string; name: string };
type Group = { id: string; name: string };
type PlayerResult = { id: string; first_name: string; last_name: string };
type TargetType = "league" | "captains" | "team" | "group" | "player";

const targetOptions: { type: TargetType; label: string }[] = [
  { type: "league", label: "Koko liiga" },
  { type: "captains", label: "Vain kapteenit" },
  { type: "team", label: "Yksi joukkue" },
  { type: "group", label: "Yksi lohko" },
  { type: "player", label: "Yksittäinen pelaaja" },
];

export default function AdminNotificationsScreen() {
  useAppScreenRestriction();
  const { session, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [targetType, setTargetType] = useState<TargetType>("league");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerResults, setPlayerResults] = useState<PlayerResult[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerResult | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!supabase || !session?.user.id) return;
    void supabase.rpc("is_admin").then(({ data }) => setIsAdmin(data === true));
    void supabase.from("leagues").select("id, name").order("start_date", { ascending: false }).then(({ data }) => setLeagues(data ?? []));
  }, [session?.user.id]);

  useEffect(() => {
    if (!supabase || !selectedLeague) { setTeams([]); setGroups([]); return; }
    const client = supabase;
    void client.from("teams").select("id, name").eq("league_id", selectedLeague.id).then(({ data }) => setTeams(data ?? []));
    void client.from("groups").select("id, name").eq("league_id", selectedLeague.id).then(({ data }) => setGroups(data ?? []));
    setSelectedTeamId(null); setSelectedGroupId(null);
  }, [selectedLeague?.id]);

  useEffect(() => {
    if (!supabase || playerSearch.trim().length < 2) { setPlayerResults([]); return; }
    const client = supabase;
    const timeout = setTimeout(() => { void client.rpc("search_players_for_notification", { search_query: playerSearch.trim() }).then(({ data }) => setPlayerResults((data ?? []) as PlayerResult[])); }, 250);
    return () => clearTimeout(timeout);
  }, [playerSearch]);

  if (authLoading) return <View style={styles.loading}><ActivityIndicator color={colors.lime} /></View>;
  if (!session) return <Redirect href="/(auth)/login" />;
  if (isAdmin === null) return <View style={styles.loading}><ActivityIndicator color={colors.lime} /></View>;
  if (!isAdmin) return <Redirect href="/" />;

  const canSend = title.trim().length > 0 && body.trim().length > 0
    && (targetType === "league" || targetType === "captains" ? !!selectedLeague
      : targetType === "team" ? !!selectedTeamId
      : targetType === "group" ? !!selectedGroupId
      : !!selectedPlayer);

  const send = async () => {
    if (!supabase || !canSend) return;
    setBusy(true); setMessage("");
    const target = targetType === "league" || targetType === "captains"
      ? { type: targetType, leagueId: selectedLeague!.id }
      : targetType === "team"
        ? { type: "team" as const, teamId: selectedTeamId! }
        : targetType === "group"
          ? { type: "group" as const, groupId: selectedGroupId! }
          : { type: "player" as const, userId: selectedPlayer!.id };
    const { data, error } = await supabase.functions.invoke("send-notification", { body: { title: title.trim(), body: body.trim(), target } });
    setBusy(false);
    if (error) { setMessage(`Lähetys epäonnistui: ${error.message}`); return; }
    setMessage(`Ilmoitus lähetetty ${data?.sent ?? 0} laitteelle (${data?.recipients ?? 0} vastaanottajaa).`);
    setTitle(""); setBody("");
  };

  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <ScreenHeader />
    <View style={styles.body}>
      <Pressable onPress={() => router.replace("/admin")} style={styles.back}><Text style={styles.backText}>‹ Takaisin adminiin</Text></Pressable>
      <Text style={styles.sectionTitle}>Lähetä push-ilmoitus</Text>

      <Text style={styles.label}>Liiga</Text>
      <View style={styles.chipRow}>
        {leagues.map((league) => <Pressable key={league.id} onPress={() => setSelectedLeague(league)} style={[styles.chip, selectedLeague?.id === league.id && styles.chipSelected]}><Text style={[styles.chipText, selectedLeague?.id === league.id && styles.chipTextSelected]}>{league.name}</Text></Pressable>)}
      </View>

      <Text style={styles.label}>Kohde</Text>
      <View style={styles.chipRow}>
        {targetOptions.map((option) => <Pressable key={option.type} onPress={() => setTargetType(option.type)} style={[styles.chip, targetType === option.type && styles.chipSelected]}><Text style={[styles.chipText, targetType === option.type && styles.chipTextSelected]}>{option.label}</Text></Pressable>)}
      </View>

      {targetType === "team" ? <>
        <Text style={styles.label}>Joukkue</Text>
        {!selectedLeague ? <Text style={styles.empty}>Valitse ensin liiga.</Text> : teams.length === 0 ? <Text style={styles.empty}>Liigalla ei ole joukkueita.</Text> : <View style={styles.chipRow}>{teams.map((team) => <Pressable key={team.id} onPress={() => setSelectedTeamId(team.id)} style={[styles.chip, selectedTeamId === team.id && styles.chipSelected]}><Text style={[styles.chipText, selectedTeamId === team.id && styles.chipTextSelected]}>{team.name}</Text></Pressable>)}</View>}
      </> : null}

      {targetType === "group" ? <>
        <Text style={styles.label}>Lohko</Text>
        {!selectedLeague ? <Text style={styles.empty}>Valitse ensin liiga.</Text> : groups.length === 0 ? <Text style={styles.empty}>Liigalla ei ole lohkoja.</Text> : <View style={styles.chipRow}>{groups.map((group) => <Pressable key={group.id} onPress={() => setSelectedGroupId(group.id)} style={[styles.chip, selectedGroupId === group.id && styles.chipSelected]}><Text style={[styles.chipText, selectedGroupId === group.id && styles.chipTextSelected]}>{group.name}</Text></Pressable>)}</View>}
      </> : null}

      {targetType === "player" ? <>
        <Text style={styles.label}>Pelaaja</Text>
        <TextInput value={playerSearch} onChangeText={(value) => { setPlayerSearch(value); setSelectedPlayer(null); }} placeholder="Hae nimellä..." placeholderTextColor={colors.muted} style={styles.input} />
        {selectedPlayer ? <View style={styles.item}><Text style={styles.itemName}>{selectedPlayer.first_name} {selectedPlayer.last_name}</Text><Pressable onPress={() => setSelectedPlayer(null)}><Text style={styles.deleteText}>Vaihda</Text></Pressable></View>
          : playerResults.map((player) => <Pressable key={player.id} onPress={() => { setSelectedPlayer(player); setPlayerSearch(""); setPlayerResults([]); }} style={styles.item}><Text style={styles.itemName}>{player.first_name} {player.last_name}</Text></Pressable>)}
      </> : null}

      <Text style={styles.label}>Otsikko</Text>
      <TextInput value={title} onChangeText={setTitle} placeholder="Ilmoituksen otsikko" placeholderTextColor={colors.muted} style={styles.input} maxLength={120} />

      <Text style={styles.label}>Viesti</Text>
      <TextInput value={body} onChangeText={setBody} placeholder="Ilmoituksen sisältö" placeholderTextColor={colors.muted} style={[styles.input, styles.textarea]} multiline maxLength={500} />

      <Pressable onPress={send} disabled={!canSend || busy} style={[styles.primary, (!canSend || busy) && styles.primaryDisabled]}>{busy ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryText}>Lähetä ilmoitus</Text>}</Pressable>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingBottom: 40 },
  loading: { flex: 1, backgroundColor: colors.green, justifyContent: "center", alignItems: "center" },
  body: { padding: 22, paddingTop: 18 },
  back: { paddingVertical: 8 },
  backText: { color: colors.greenBright, fontWeight: "800" },
  sectionTitle: { color: colors.ink, fontSize: 21, fontWeight: "800", marginTop: 12, marginBottom: 18 },
  label: { color: colors.ink, fontSize: 13, fontWeight: "800", marginTop: 18, marginBottom: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: colors.surface },
  chipSelected: { backgroundColor: colors.green, borderColor: colors.green },
  chipText: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  chipTextSelected: { color: colors.surface },
  empty: { color: colors.muted, fontSize: 13 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12, color: colors.ink, padding: 13 },
  textarea: { minHeight: 90, textAlignVertical: "top" },
  item: { backgroundColor: colors.surface, borderRadius: 11, padding: 12, marginTop: 7, flexDirection: "row", justifyContent: "space-between", alignItems: "center", ...shadow },
  itemName: { color: colors.ink, fontSize: 13, fontWeight: "800", flex: 1 },
  deleteText: { color: colors.coral, fontSize: 11, fontWeight: "800" },
  primary: { backgroundColor: colors.green, borderRadius: 12, padding: 16, alignItems: "center", marginTop: 24 },
  primaryDisabled: { opacity: 0.5 },
  primaryText: { color: colors.surface, fontWeight: "800", fontSize: 14 },
  message: { color: colors.greenBright, fontSize: 12, marginTop: 12 },
});

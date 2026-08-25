import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import ScreenHeader from "../../../components/ScreenHeader";
import { useAuth } from "../../../hooks/useAuth";
import { supabase } from "../../../lib/supabase";
import { colors } from "../../../theme";

const levels = ["A", "B", "C", "D", "E"] as const;
type Player = { id: string; first_name: string; last_name: string };

export default function TeamRegistrationScreen() {
  const { id: leagueId } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [teamName, setTeamName] = useState("");
  const [skillLevel, setSkillLevel] = useState<string>("");
  const [skillDescription, setSkillDescription] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([]);
  const [captainId, setCaptainId] = useState<string | null>(session?.user.id ?? null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const searchPlayers = async () => {
    if (!supabase || searchQuery.trim().length < 2) {
      setError("Kirjoita pelaajan nimestä vähintään kaksi merkkiä.");
      return;
    }
    setSearching(true);
    setError("");
    const { data, error: searchError } = await supabase.rpc("search_profiles_by_name", { search_query: searchQuery.trim(), target_league_id: leagueId });
    setSearching(false);
    if (searchError) {
      setError(`Pelaajahaku epäonnistui: ${searchError.message}`);
      return;
    }
    setSearchResults(((data ?? []) as Player[]).filter((player) => player.id !== session?.user.id && !selectedPlayers.some((selected) => selected.id === player.id)));
  };

  const selectPlayer = (player: Player) => {
    if (selectedPlayers.length >= 2) return;
    setSelectedPlayers((current) => [...current, player]);
    setSearchResults((current) => current.filter((result) => result.id !== player.id));
    setSearchQuery("");
  };

  const removePlayer = (playerId: string) => {
    setSelectedPlayers((current) => current.filter((player) => player.id !== playerId));
    if (captainId === playerId) setCaptainId(session?.user.id ?? null);
  };

  const registerTeam = async () => {
    if (!supabase || !session?.user.id || !leagueId) {
      setError("Kirjautuminen tai Supabase-yhteys puuttuu.");
      return;
    }
    if (!teamName.trim()) {
      setError("Anna joukkueelle nimi.");
      return;
    }
    if (!skillLevel) {
      setError("Valitse joukkueen taitotaso.");
      return;
    }
    if (selectedPlayers.length === 0) {
      setError("Hae ja lisää vähintään yksi pelikaveri.");
      return;
    }
    if (!captainId) {
      setError("Valitse joukkueelle kapteeni.");
      return;
    }

    setSaving(true);
    setError("");
    const memberIds = [session.user.id, ...selectedPlayers.map((player) => player.id)];
    const { data: team, error: teamError } = await supabase.from("teams").insert({
      league_id: leagueId,
      name: teamName.trim(),
      skill_level: skillLevel,
      skill_description: skillDescription.trim() || null,
      captain_id: captainId,
      created_by: session.user.id,
    }).select("id").single();
    if (teamError || !team) {
      setSaving(false);
      setError(teamError?.message ?? "Joukkueen luonti epäonnistui.");
      return;
    }

    const { error: membersError } = await supabase.from("team_members").insert(memberIds.map((userId) => ({ team_id: team.id, user_id: userId, is_captain: userId === captainId })));
    setSaving(false);
    if (membersError) {
      setError(`Joukkue luotiin, mutta pelaajien lisääminen epäonnistui: ${membersError.message}`);
      return;
    }
    router.replace("/(tabs)/home");
  };

  const captainChoices = [{ id: session?.user.id ?? "", name: "Minä" }, ...selectedPlayers.map((player) => ({ id: player.id, name: `${player.first_name} ${player.last_name}` }))];

  return <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <ScreenHeader eyebrow="TÄHTILIIGA" title="Ilmoittaudu joukkueella" subtitle="Kokoa 2-3 pelaajan joukkue" />
    <View style={styles.body}>
      <Text style={styles.label}>JOUKKUEEN NIMI</Text>
      <TextInput value={teamName} onChangeText={setTeamName} placeholder="Esim. Padel Tähdet" placeholderTextColor={colors.muted} style={styles.input} />

      <Text style={styles.label}>PELAAJIEN HAKU</Text>
      <View style={styles.searchRow}><TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder="Hae nimellä" placeholderTextColor={colors.muted} style={[styles.input, styles.searchInput]} /><Pressable onPress={() => void searchPlayers()} disabled={searching} style={styles.searchButton}>{searching ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.searchButtonText}>Hae</Text>}</Pressable></View>
      {searchResults.map((player) => <Pressable key={player.id} onPress={() => selectPlayer(player)} disabled={selectedPlayers.length >= 2} style={styles.result}><Text style={styles.resultText}>{player.first_name} {player.last_name}</Text><Text style={styles.resultAdd}>Lisää</Text></Pressable>)}

      <Text style={styles.label}>JOUKKUEEN PELAAJAT</Text>
      <Text style={styles.member}>Minä</Text>
      {selectedPlayers.map((player) => <View key={player.id} style={styles.memberRow}><Text style={styles.member}>{player.first_name} {player.last_name}</Text><Pressable onPress={() => removePlayer(player.id)}><Text style={styles.remove}>Poista</Text></Pressable></View>)}

      <Text style={styles.label}>KAPTEENI</Text>
      <View style={styles.captains}>{captainChoices.map((choice) => <Pressable key={choice.id} onPress={() => setCaptainId(choice.id)} style={[styles.captain, captainId === choice.id && styles.captainSelected]}><Text style={[styles.captainText, captainId === choice.id && styles.captainTextSelected]}>{choice.name}</Text></Pressable>)}</View>

      <Text style={styles.label}>TAITOTASO</Text>
      <View style={styles.levels}>{levels.map((level) => <Pressable key={level} onPress={() => setSkillLevel(level)} style={[styles.level, skillLevel === level && styles.levelSelected]}><Text style={[styles.levelText, skillLevel === level && styles.levelTextSelected]}>{level}</Text></Pressable>)}</View>

      <Text style={styles.label}>LISÄTIETO TAITOTASOSTA (VALINNAINEN)</Text>
      <TextInput value={skillDescription} onChangeText={setSkillDescription} multiline placeholder="Kertokaa lyhyesti joukkueen kokemuksesta..." placeholderTextColor={colors.muted} style={[styles.input, styles.textarea]} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.button} onPress={() => void registerTeam()} disabled={saving}>{saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>Lähetä ilmoittautuminen</Text>}</Pressable>
      <Pressable onPress={() => router.back()} style={styles.cancel} disabled={saving}><Text style={styles.cancelText}>Peruuta</Text></Pressable>
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas }, content: { paddingBottom: 40 }, body: { padding: 22, paddingTop: 22 }, label: { color: colors.muted, fontSize: 9, letterSpacing: 1, fontWeight: "900", marginTop: 17, marginBottom: 7 }, input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12, color: colors.ink, padding: 14 }, textarea: { minHeight: 88, textAlignVertical: "top" }, searchRow: { flexDirection: "row", gap: 8 }, searchInput: { flex: 1 }, searchButton: { alignItems: "center", backgroundColor: colors.green, borderRadius: 12, justifyContent: "center", paddingHorizontal: 16 }, searchButtonText: { color: colors.surface, fontWeight: "800" }, result: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 10, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", marginTop: 7, padding: 12 }, resultText: { color: colors.ink, fontWeight: "700" }, resultAdd: { color: colors.green, fontSize: 12, fontWeight: "800" }, member: { color: colors.ink, backgroundColor: colors.surface, borderRadius: 10, fontSize: 13, fontWeight: "700", marginTop: 7, padding: 12 }, memberRow: { alignItems: "center", flexDirection: "row", gap: 8 }, remove: { color: colors.coral, fontSize: 12, fontWeight: "800" }, captains: { gap: 8 }, captain: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12 }, captainSelected: { backgroundColor: colors.lime, borderColor: colors.greenBright }, captainText: { color: colors.ink, fontSize: 13, fontWeight: "700" }, captainTextSelected: { color: colors.green }, levels: { flexDirection: "row", gap: 9 }, level: { width: 48, height: 42, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }, levelSelected: { backgroundColor: colors.lime, borderColor: colors.greenBright }, levelText: { color: colors.ink, fontWeight: "900" }, levelTextSelected: { color: colors.green }, error: { color: colors.coral, fontSize: 12, lineHeight: 18, marginTop: 12 }, button: { backgroundColor: colors.green, borderRadius: 13, alignItems: "center", padding: 16, marginTop: 22 }, buttonText: { color: colors.surface, fontSize: 14, fontWeight: "800" }, cancel: { alignItems: "center", padding: 16 }, cancelText: { color: colors.muted, fontWeight: "800" },
});
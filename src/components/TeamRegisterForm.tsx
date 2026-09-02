import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { colors } from "../theme";

const levels = ["A", "B", "C", "D", "E", "Aloittelija"] as const;
type Player = { id: string; first_name: string; last_name: string };

export default function TeamRegisterForm({ leagueId, onRegistered }: { leagueId: string; onRegistered?: () => void }) {
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

  const searchPlayers = async (query: string) => {
    if (!supabase) return;
    setSearching(true);
    setError("");
    const { data, error: searchError } = await supabase.rpc("search_profiles_by_name", { search_query: query, target_league_id: leagueId });
    setSearching(false);
    if (searchError) {
      setError(`Pelaajahaku epäonnistui: ${searchError.message}`);
      return;
    }
    setSearchResults(((data ?? []) as Player[]).filter((player) => player.id !== session?.user.id && !selectedPlayers.some((selected) => selected.id === player.id)));
  };

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    const timeout = setTimeout(() => void searchPlayers(query), 350);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

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
    if (!skillDescription.trim()) {
      setError("Kerro lyhyesti joukkueen taitotasosta.");
      return;
    }

    setSaving(true);
    setError("");
    const memberIds = [session.user.id, ...selectedPlayers.map((player) => player.id)];
    const { error: membersError } = await supabase.rpc("create_team_with_members", {
      target_league_id: leagueId,
      team_name: teamName.trim(),
      team_skill_level: skillLevel,
      team_skill_description: skillDescription.trim(),
      target_captain_id: captainId,
      member_ids: memberIds,
    });
    setSaving(false);
    if (membersError) {
      setError(membersError.message.includes("Email not confirmed") ? "Vahvista sähköpostiosoitteesi ennen ilmoittautumista. Tarkista sähköpostisi." : `Joukkueen luonti epäonnistui: ${membersError.message}`);
      return;
    }
    if (onRegistered) onRegistered();
  };

  const captainChoices = [{ id: session?.user.id ?? "", name: "Minä" }, ...selectedPlayers.map((player) => ({ id: player.id, name: `${player.first_name} ${player.last_name}` }))];

  return <View>
    <Text style={styles.label}>JOUKKUEEN NIMI</Text>
    <TextInput value={teamName} onChangeText={setTeamName} placeholder="Esim. Padel Tähdet" placeholderTextColor={colors.muted} style={styles.input} />

    <Text style={styles.label}>PELAAJIEN HAKU</Text>
    <Text style={styles.hint}>Lisätyt pelaajat saavat kutsun, jonka he hyväksyvät kotisivullaan.</Text>
    <View style={styles.searchRow}><TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder="Hae nimellä" placeholderTextColor={colors.muted} style={[styles.input, styles.searchInput]} />{searching ? <ActivityIndicator color={colors.green} /> : null}</View>
    {searchResults.map((player) => <Pressable key={player.id} onPress={() => selectPlayer(player)} disabled={selectedPlayers.length >= 2} style={styles.result}><Text style={styles.resultText}>{player.first_name} {player.last_name}</Text><Text style={styles.resultAdd}>Lisää</Text></Pressable>)}

    <Text style={styles.label}>JOUKKUEEN PELAAJAT</Text>
    <Text style={styles.member}>Minä</Text>
    {selectedPlayers.map((player) => <View key={player.id} style={styles.memberRow}><Text style={styles.member}>{player.first_name} {player.last_name}</Text><Pressable onPress={() => removePlayer(player.id)}><Text style={styles.remove}>Poista</Text></Pressable></View>)}

    <Text style={styles.label}>KAPTEENI</Text>
    <View style={styles.captains}>{captainChoices.map((choice) => <Pressable key={choice.id} onPress={() => setCaptainId(choice.id)} style={[styles.captain, captainId === choice.id && styles.captainSelected]}><Text style={[styles.captainText, captainId === choice.id && styles.captainTextSelected]}>{choice.name}</Text></Pressable>)}</View>

    <Text style={styles.label}>JOUKKUEEN TAITOTASO</Text>
    <View style={styles.levels}>{levels.map((level) => <Pressable key={level} onPress={() => setSkillLevel(level)} style={[styles.level, level === "Aloittelija" && styles.levelWide, skillLevel === level && styles.levelSelected]}><Text style={[styles.levelText, skillLevel === level && styles.levelTextSelected]}>{level}</Text></Pressable>)}</View>

    <Text style={styles.label}>LISÄTIETOA TAITOTASOSTA</Text>
    <TextInput value={skillDescription} onChangeText={setSkillDescription} multiline placeholder="Kerro lyhyesti joukkueen taitotasosta..." placeholderTextColor={colors.muted} style={[styles.input, styles.textarea]} />
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <Pressable style={styles.button} onPress={() => void registerTeam()} disabled={saving}>{saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>Lähetä ilmoittautuminen</Text>}</Pressable>
  </View>;
}

const styles = StyleSheet.create({
  label: { color: colors.muted, fontSize: 9, letterSpacing: 1, fontWeight: "900", marginTop: 13, marginBottom: 7 },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 17, marginBottom: 8 },
  input: { backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, borderRadius: 10, color: colors.ink, fontSize: 15, padding: 14 },
  textarea: { minHeight: 88, textAlignVertical: "top" },
  searchRow: { flexDirection: "row", gap: 8, alignItems: "center" }, searchInput: { flex: 1 },
  result: { alignItems: "center", backgroundColor: colors.canvas, borderColor: colors.line, borderRadius: 10, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", marginTop: 7, padding: 12 },
  resultText: { color: colors.ink, fontWeight: "700" }, resultAdd: { color: colors.green, fontSize: 12, fontWeight: "800" },
  member: { color: colors.ink, backgroundColor: colors.canvas, borderRadius: 10, fontSize: 13, fontWeight: "700", marginTop: 7, padding: 12 },
  memberRow: { alignItems: "center", flexDirection: "row", gap: 8 }, remove: { color: colors.coral, fontSize: 12, fontWeight: "800" },
  captains: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  captain: { backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  captainSelected: { backgroundColor: colors.green, borderColor: colors.green },
  captainText: { color: colors.ink, fontSize: 13, fontWeight: "700" }, captainTextSelected: { color: colors.surface },
  levels: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  level: { minWidth: 48, height: 42, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  levelWide: { width: "auto" },
  levelSelected: { backgroundColor: colors.green, borderColor: colors.green },
  levelText: { color: colors.ink, fontWeight: "800", fontSize: 12 }, levelTextSelected: { color: colors.surface },
  error: { color: colors.coral, fontSize: 12, lineHeight: 18, marginTop: 14 },
  button: { backgroundColor: colors.green, borderRadius: 8, padding: 16, alignItems: "center", marginTop: 22 },
  buttonText: { color: colors.surface, fontSize: 15, fontWeight: "900" },
});
